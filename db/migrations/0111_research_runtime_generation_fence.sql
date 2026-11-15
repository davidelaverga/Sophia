-- INC04-R07-C3-FENCE-001 (SOPHIA-INC-2026-11, INC-04 R07 C3, Stage A): a NONFINANCIAL runtime generation fence, the first
-- C3 component. Root reserved 0111 for this slice. 0001-0110 are not edited; three existing functions are replaced here.
-- * FENCE-LEASE. runtime_lease (0012) re-reads the capability after its project and runtime-row waits and refuses a
--   revoked one with runtime_authenticate's own error. Before, only the bridge was re-checked, so a call authenticated
--   before a retirement could wait on the project row and then write through the revoked generation (F04/I1). Every
--   runtime writer that takes the lease is covered: research_scope_of (0025), design_scope_of (0041), review_scope_of
--   (0042) and the observation and turn-end callers (0023/0064/0067). An ACTIVE runtime's late settlement is unchanged.
-- * FENCE-HELLO. runtime_hello (effective 0075) is copied byte for byte, plus the same re-check after its project wait
--   and before any write. Hello never reactivated a revoked capability and does not now; its completed-goal (RETIRE-HELLO)
--   behaviour is kept. Registration (0094) is unchanged: only a rotation or a connection's first registration advances
--   credential_revision; a non-rotating registration at the current revision reuses that revision's resource.
-- * FENCE. fence_contribution_runtime (migration owner only) closes one DRAINING contribution resource of one project:
--   projects FOR UPDATE first, then its api_contribution_runtimes row, then that resource's runtime_instances in id order.
--   After those waits it replays an existing fence first (before any mutable check), then revalidates the link, derives
--   the generation token from the link's immutable binding (project, resource, connection, credential revision), refuses
--   a stale or mismatched token, builds two SEPARATE sorted snapshots (monetary-open: reserved/uncertain; causes: retained
--   conflicts, overflows, witnesses and first restrictions, settled rows included) with a bounded canonical encoding, and
--   only then revokes that generation and persists the append-only fence and its snapshots in the same transaction. A
--   cohort that cannot be encoded within the bound is refused before any effect: never truncated (E01).
-- * retire_contribution_runtime (0094) keeps its signature and its {resourceId, unresolvedReservations} result; it now
--   goes through the same fence, and its count keeps the 0094 meaning (the contribution reservation/task/resource join,
--   reserved or uncertain), computed apart from the snapshots and frozen with the fence (E02).
-- Nothing here settles, releases, refunds, replenishes, reconciles, certifies or clears a restriction: no money moves and
-- an empty monetary-open snapshot is NOT a certificate. No account row is locked, and no new foreign key reaches an
-- account (E03): the fence references only its own, already locked, link. No GUC is read as authority.

BEGIN;

-- runtime_lease (0012), replaced: the same, plus FENCE-LEASE.
CREATE OR REPLACE FUNCTION sophia.runtime_lease(p_token_sha256 bytea, p_unit text, p_bridge text) RETURNS sophia.runtime_instances LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_authenticate(p_token_sha256,p_unit);
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=rt.project_id FOR UPDATE;
 SELECT * INTO rt FROM sophia.runtime_instances WHERE id=rt.id FOR UPDATE;
 -- 0111 FENCE-LEASE: read again after both waits; a generation fenced while this call waited writes nothing.
 IF rt.state<>'active' OR rt.token_sha256 IS DISTINCT FROM p_token_sha256 THEN
  RAISE EXCEPTION 'Runtime capability revoked' USING ERRCODE='42501'; END IF;
 IF rt.bridge_instance_id IS DISTINCT FROM p_bridge THEN RAISE EXCEPTION 'Runtime lease superseded; say hello again' USING ERRCODE='40001'; END IF;
 RETURN rt;
END $$;

-- runtime_hello: effective 0075 byte for byte, plus FENCE-HELLO.
CREATE OR REPLACE FUNCTION sophia.runtime_hello(p_token_sha256 bytea, p_unit text, p_bridge text, p_hello jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_authenticate(p_token_sha256,p_unit); bindings jsonb; advertised jsonb:='[]';
BEGIN
 IF p_bridge IS NULL OR length(p_bridge) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'Invalid bridge instance' USING ERRCODE='22023'; END IF;
 IF (p_hello->>'protocolVersion')::integer IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Unsupported runtime protocol' USING ERRCODE='22023'; END IF;
 IF p_hello ? 'roles' THEN
  IF jsonb_typeof(p_hello->'roles')<>'array' OR jsonb_array_length(p_hello->'roles')>32 OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_hello->'roles') r
    WHERE jsonb_typeof(r)<>'object' OR NOT coalesce(r->>'id' ~ '^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$',false)
     OR NOT coalesce(r->>'route' ~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$',false)
     OR NOT coalesce(r->>'presetDigest' ~ '^[A-Za-z0-9:+/=_-]{1,120}$',false)) THEN
   RAISE EXCEPTION 'Invalid runtime roles' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',r->>'id','route',r->>'route','presetDigest',r->>'presetDigest') ORDER BY r->>'id'),'[]')
   INTO advertised FROM jsonb_array_elements(p_hello->'roles') r;
  -- CON-HELLO-EXECUTOR-BEGIN (0071, A40): a role may name the executor that serves it, exactly one of A35's two shapes,
  -- a service one on the role's own route; it is kept with the role as claimed. Absent stays absent (legacy or unknown).
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_hello->'roles') r WHERE r ? 'executor' AND NOT CASE
    WHEN r->'executor'='{"execution":"native"}'::jsonb THEN true
    WHEN jsonb_typeof(r->'executor')<>'object' THEN false
    ELSE coalesce((SELECT array_agg(k ORDER BY k COLLATE "C") FROM jsonb_object_keys(r->'executor') k)
      =ARRAY['execution','executorArtifactDigest','routeId'] AND r->'executor'->>'execution'='service'
     AND r->'executor'->>'routeId' IS NOT DISTINCT FROM r->>'route'
     AND r->'executor'->>'executorArtifactDigest' ~ '^[0-9a-f]{64}$',false) END) THEN
   RAISE EXCEPTION 'Invalid runtime roles' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',r->>'id','route',r->>'route','presetDigest',r->>'presetDigest')
    ||CASE WHEN r ? 'executor' THEN jsonb_build_object('executor',r->'executor') ELSE '{}'::jsonb END ORDER BY r->>'id'),'[]')
   INTO advertised FROM jsonb_array_elements(p_hello->'roles') r;
  -- CON-HELLO-EXECUTOR-END
 END IF;
 PERFORM 1 FROM sophia.projects WHERE id=rt.project_id FOR UPDATE;
 -- 0111 FENCE-HELLO: read again after the project wait and before any write; a fenced generation says no hello.
 PERFORM 1 FROM sophia.runtime_instances WHERE id=rt.id AND state='active' AND token_sha256=p_token_sha256 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Runtime capability revoked' USING ERRCODE='42501'; END IF;
 UPDATE sophia.runtime_instances SET lease_id=gen_random_uuid(), lease_epoch=lease_epoch+1, bridge_instance_id=p_bridge,
  protocol_version=1, bundle=left(p_hello->>'bundle',200), dsh_version=left(p_hello->>'dshVersion',100), hello_at=now(),
  ready_state='not_ready', ready_reason='hello received; waiting for the ready report', ready_at=NULL, seen_at=now(), roles=advertised
  WHERE id=rt.id RETURNING * INTO rt;
 -- CON-HELLO-LOSS-BEGIN
 DECLARE item record; e sophia.conversation_executions; marker jsonb;
 BEGIN
  FOR item IN SELECT r.id AS reply_id,a.id AS attempt_id,b.id AS binding_id,r.state AS reply_state
   FROM sophia.execution_bindings b JOIN sophia.work_attempts a ON a.project_id=b.project_id AND a.id=b.attempt_id
   JOIN sophia.conversation_replies r ON r.project_id=a.project_id AND r.id=a.conversation_reply_id
   WHERE b.project_id=rt.project_id AND b.resource_id=rt.resource_id AND b.runtime_unit_id=rt.runtime_unit_id AND b.state<>'retired'
   ORDER BY r.id FOR UPDATE OF r LOOP
   SELECT * INTO e FROM sophia.conversation_executions WHERE project_id=rt.project_id AND attempt_id=item.attempt_id;
   IF e.outcome IN ('claimed','running') AND e.lease_id IS DISTINCT FROM p_bridge AND item.reply_state IN ('pending','running','cancelled') THEN
    UPDATE sophia.conversation_executions SET outcome='lost',lost_at=clock_timestamp(),lost_by_lease=p_bridge,lost_lease_epoch=rt.lease_epoch
     WHERE project_id=rt.project_id AND attempt_id=item.attempt_id;
    IF item.reply_state IN ('pending','running') THEN
     UPDATE sophia.conversation_replies SET state='outcome_unknown',reason='runtime_lease_lost',settled_at=clock_timestamp()
      WHERE project_id=rt.project_id AND id=item.reply_id;
     UPDATE sophia.work_attempts SET state='outcome_unknown' WHERE project_id=rt.project_id AND id=item.attempt_id;
     UPDATE sophia.execution_bindings SET state='lost' WHERE project_id=rt.project_id AND id=item.binding_id;
     PERFORM sophia.conversation_mark_uncertain(rt.project_id,item.reply_id);
     marker:=jsonb_build_object('kind','hello','attemptId',item.attempt_id,'leaseId',p_bridge,'leaseEpoch',rt.lease_epoch);
     UPDATE sophia.commands SET receipt=coalesce(receipt,'{}'::jsonb)||jsonb_build_object('terminalWriter',marker)
      WHERE project_id=rt.project_id AND id=(SELECT command_id FROM sophia.runtime_commands WHERE project_id=rt.project_id
       AND binding_id=item.binding_id AND kind='create') AND NOT coalesce(receipt ? 'terminalWriter',false);
     UPDATE sophia.runtime_commands SET body=jsonb_set(body,'{payload}','{"scrubbed":true}'::jsonb)
      WHERE project_id=rt.project_id AND binding_id=item.binding_id AND kind='create';
     UPDATE sophia.native_observations SET data=jsonb_strip_nulls(jsonb_build_object('scrubbed',true,
       'provider',CASE WHEN jsonb_typeof(data->'provider')='string' THEN left(data->>'provider',200) END,
      'model',CASE WHEN jsonb_typeof(data->'model')='string' THEN left(data->>'model',200) END,
      'inputTokens',sophia.usage_count(data->'inputTokens'),'outputTokens',sophia.usage_count(data->'outputTokens'),
      'cacheReadTokens',sophia.usage_count(data->'cacheReadTokens'),'cacheWriteTokens',sophia.usage_count(data->'cacheWriteTokens'),
      'ordinal',CASE WHEN data->'ordinal' IN ('1'::jsonb,'2'::jsonb) THEN data->'ordinal' END,
      'textLength',coalesce(sophia.usage_count(data->'textLength'),sophia.usage_count(data->'length'),CASE WHEN jsonb_typeof(data->'text')='string' THEN length(data->>'text') END)))
      WHERE project_id=rt.project_id AND binding_id=item.binding_id;
    END IF;
   END IF;
   PERFORM sophia.conversation_retire(rt.project_id,item.attempt_id);
  END LOOP;
 END;
 -- CON-HELLO-LOSS-END

 SELECT coalesce(jsonb_agg(jsonb_build_object('attemptId',b.attempt_id,'nativeSessionId',b.native_session_id,'authorityEpoch',g.authority_epoch,
   'state',CASE WHEN wa.state='revoked' THEN 'stopped' WHEN g.status IN ('holding','held') THEN 'held'
    -- RETIRE-HELLO-BEGIN (0075, A41): a completed goal retired at its current epoch is stopped, never active
    WHEN g.status='completed' AND EXISTS(SELECT 1 FROM sophia.commands rx WHERE rx.project_id=g.project_id AND rx.goal_id=g.id
     AND rx.kind='retire_sessions' AND rx.authority_epoch=g.authority_epoch) THEN 'stopped'
    -- RETIRE-HELLO-END
    WHEN g.status IN ('stopping','stopped') THEN 'stopped' ELSE 'active' END)
   ORDER BY b.attempt_id),'[]') INTO bindings
  FROM sophia.execution_bindings b JOIN sophia.work_attempts wa ON wa.project_id=b.project_id AND wa.id=b.attempt_id
  JOIN sophia.goals g ON g.project_id=wa.project_id AND g.id=wa.goal_id
  WHERE b.project_id=rt.project_id AND b.resource_id=rt.resource_id AND b.runtime_unit_id=rt.runtime_unit_id
   AND b.state IN ('running','idle','stopping');
 -- CON-HELLO-BINDINGS-BEGIN
 bindings:=bindings||coalesce((SELECT jsonb_agg(jsonb_build_object('attemptId',b.attempt_id,'nativeSessionId',b.native_session_id,
  'authorityEpoch',a.authority_epoch,'state',CASE WHEN r.state IN ('pending','running') THEN 'active' ELSE 'stopped' END,
  'conversationReplyId',a.conversation_reply_id,'create',CASE
   WHEN EXISTS(SELECT 1 FROM sophia.runtime_commands rc WHERE rc.project_id=b.project_id AND rc.binding_id=b.id AND rc.kind='create') THEN (
    SELECT CASE WHEN (rc.attempt_id=a.id AND o.command_id=rc.command_id AND o.binding_id=b.id AND o.authority_epoch=rc.authority_epoch
      AND o.conversation_reply_id=a.conversation_reply_id AND o.destination='native.create' AND NOT o.cleanup
      AND c.kind='create' AND c.semantic_request->>'operation'='conversation-create'
      AND c.semantic_request->>'replyId'=r.id::text AND c.semantic_request->>'attemptId'=a.id::text
      AND c.actor_id=r.asked_by AND c.authority_epoch=rc.authority_epoch) IS NOT TRUE
     THEN jsonb_build_object('state','unresolved','reason','correlation_invalid')
     WHEN rc.runtime_id IS DISTINCT FROM rt.id THEN jsonb_build_object('state','unresolved','reason','different_runtime')
     ELSE jsonb_build_object('state','current','commandId',rc.id,'authorityEpoch',rc.authority_epoch) END
    FROM sophia.runtime_commands rc LEFT JOIN sophia.outbox o ON o.project_id=rc.project_id AND o.id=rc.outbox_id
     LEFT JOIN sophia.commands c ON c.project_id=rc.project_id AND c.id=rc.command_id
    WHERE rc.project_id=b.project_id AND rc.binding_id=b.id AND rc.kind='create')
   ELSE coalesce((SELECT CASE WHEN (o.conversation_reply_id=a.conversation_reply_id AND NOT o.cleanup
     AND c.kind='create' AND c.semantic_request->>'operation'='conversation-create'
     AND c.semantic_request->>'replyId'=r.id::text AND c.semantic_request->>'attemptId'=a.id::text
     AND c.actor_id=r.asked_by AND c.authority_epoch=o.authority_epoch
     AND o.state IN ('pending','dispatching','outcome_unknown','superseded','denied')
     AND NOT EXISTS(SELECT 1 FROM sophia.runtime_commands rc WHERE rc.project_id=b.project_id AND rc.binding_id=b.id)
     AND NOT EXISTS(SELECT 1 FROM sophia.conversation_reservations cr WHERE cr.project_id=b.project_id AND cr.reply_id=a.conversation_reply_id)
     AND NOT EXISTS(SELECT 1 FROM sophia.conversation_executions e WHERE e.project_id=b.project_id AND e.attempt_id=a.id)
     AND NOT EXISTS(SELECT 1 FROM sophia.native_observations n WHERE n.project_id=b.project_id AND n.binding_id=b.id)
     AND NOT EXISTS(SELECT 1 FROM sophia.usage_records u WHERE u.project_id=b.project_id AND u.attempt_id=a.id)) IS TRUE
     THEN 'null'::jsonb ELSE jsonb_build_object('state','unresolved','reason','correlation_invalid') END
    FROM sophia.outbox o JOIN sophia.commands c ON c.project_id=o.project_id AND c.id=o.command_id
    WHERE o.project_id=b.project_id AND o.binding_id=b.id AND o.destination='native.create'),
    jsonb_build_object('state','unresolved','reason','correlation_invalid')) END)
  -- 0067: a service attempt's original execution tuple; absent for a native or unknown one.
  ||coalesce((SELECT jsonb_build_object('provenance',jsonb_build_object('execution','service','routeId',p.route_id,
    'executorArtifactDigest',p.executor_artifact_digest)) FROM sophia.conversation_dispatch_provenance p
    WHERE p.project_id=b.project_id AND p.attempt_id=a.id AND p.execution='service'),'{}'::jsonb)
  ORDER BY b.attempt_id) FROM sophia.execution_bindings b JOIN sophia.work_attempts a ON a.project_id=b.project_id AND a.id=b.attempt_id
  JOIN sophia.conversation_replies r ON r.project_id=a.project_id AND r.id=a.conversation_reply_id
  WHERE b.project_id=rt.project_id AND b.resource_id=rt.resource_id AND b.runtime_unit_id=rt.runtime_unit_id AND b.state<>'retired'),'[]');
 -- CON-HELLO-BINDINGS-END
 PERFORM sophia.emit_service_event(rt.project_id,'runtime.hello','executor_resource',rt.resource_id,rt.lease_epoch,'runtime.hello');
 RETURN jsonb_build_object('projectId',rt.project_id,'leaseId',rt.lease_id,'authorityEpoch',rt.lease_epoch,'bindings',bindings,
  'cursor',sophia.runtime_cursor(rt.id));
END $$;


-- --- the fence (migration owner only) ---------------------------------------------------------------------------------

-- The generation token of one contribution resource: its immutable binding, never a display value or a current owner.
CREATE FUNCTION sophia.research_runtime_generation(p_project uuid, p_resource uuid, p_connection uuid, p_revision bigint)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to('sophia-runtime-generation-v1|'||p_project::text||'|'||p_resource::text||'|'
  ||p_connection::text||'|'||p_revision::text,'UTF8')),'hex') $$;

-- The operator reads a resource's token before naming it to the fence.
CREATE FUNCTION sophia.contribution_runtime_generation(p_project uuid, p_resource uuid) RETURNS text LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.research_runtime_generation(l.project_id,l.resource_id,l.connection_id,l.credential_revision)
 FROM sophia.api_contribution_runtimes l WHERE l.project_id=p_project AND l.resource_id=p_resource $$;

-- One fence per contribution resource (one generation), INSERT only. The account, grant and revisions are copied from
-- the authoritative rows at the fence; account_id is a value, not a foreign key (E03).
CREATE TABLE sophia.research_runtime_fences (
 id uuid PRIMARY KEY,
 project_id uuid NOT NULL, resource_id uuid NOT NULL,
 connection_id uuid NOT NULL, account_id uuid NOT NULL, credential_revision bigint NOT NULL CHECK(credential_revision>0),
 link_runtime_id uuid NOT NULL, link_created_at timestamptz NOT NULL,
 grant_id uuid, grant_revision bigint, CHECK((grant_id IS NULL)=(grant_revision IS NULL)),
 generation text NOT NULL UNIQUE CHECK(generation ~ '^[0-9a-f]{64}$'),
 runtime_ids uuid[] NOT NULL, revoked_runtime_ids uuid[] NOT NULL, CHECK(runtime_ids @> revoked_runtime_ids),
 entry text NOT NULL CHECK(entry IN ('fence','retire')),
 retire_unresolved_count integer NOT NULL CHECK(retire_unresolved_count>=0),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 fenced_at timestamptz NOT NULL,
 UNIQUE(project_id,resource_id),
 FOREIGN KEY(project_id,resource_id) REFERENCES sophia.api_contribution_runtimes(project_id,resource_id)
);

-- The fence's two separate snapshots, each its complete canonical encoding (never truncated) and digest.
CREATE TABLE sophia.research_runtime_fence_snapshots (
 fence_id uuid NOT NULL REFERENCES sophia.research_runtime_fences(id),
 kind text NOT NULL CHECK(kind IN ('monetary_open','cause')),
 encoding text NOT NULL CHECK(octet_length(encoding)<=262144),
 row_count integer NOT NULL CHECK(row_count BETWEEN 0 AND 256),
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(fence_id,kind)
);

CREATE FUNCTION sophia.research_runtime_fence_frozen() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 RAISE EXCEPTION 'A runtime fence is append-only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER research_runtime_fences_frozen BEFORE UPDATE OR DELETE ON sophia.research_runtime_fences
 FOR EACH ROW EXECUTE FUNCTION sophia.research_runtime_fence_frozen();
CREATE TRIGGER research_runtime_fences_kept BEFORE TRUNCATE ON sophia.research_runtime_fences
 FOR EACH STATEMENT EXECUTE FUNCTION sophia.research_runtime_fence_frozen();
CREATE TRIGGER research_runtime_fence_snapshots_frozen BEFORE UPDATE OR DELETE ON sophia.research_runtime_fence_snapshots
 FOR EACH ROW EXECUTE FUNCTION sophia.research_runtime_fence_frozen();
CREATE TRIGGER research_runtime_fence_snapshots_kept BEFORE TRUNCATE ON sophia.research_runtime_fence_snapshots
 FOR EACH STATEMENT EXECUTE FUNCTION sophia.research_runtime_fence_frozen();

ALTER TABLE sophia.research_runtime_fences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.research_runtime_fence_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.research_runtime_fences, sophia.research_runtime_fence_snapshots FROM PUBLIC, sophia_api, sophia_worker;

-- The canonical encoding of one snapshot (research-runtime-fence-v1): a JSON array of objects strictly ascending by
-- reservationId (C order), rendered by jsonb's own output; the digest is SHA-256 over 'research-runtime-fence-v1|',
-- the kind, a newline and that text. Bound: 256 rows and 262144 bytes; beyond it the caller is refused (E01).
CREATE FUNCTION sophia.research_runtime_fence_encode(p_kind text, p_rows jsonb, OUT encoding text, OUT digest text, OUT row_count integer)
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('monetary_open','cause') OR p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' THEN
  RAISE EXCEPTION 'Invalid fence snapshot' USING ERRCODE='22023'; END IF;
 row_count:=jsonb_array_length(p_rows);
 IF row_count>256 THEN RAISE EXCEPTION 'The fence snapshot exceeds its bound; nothing was fenced' USING ERRCODE='54000'; END IF;
 IF EXISTS(SELECT 1 FROM (SELECT jsonb_typeof(e) AS t, e->>'reservationId' AS k, lag(e->>'reservationId') OVER (ORDER BY o) AS p
   FROM jsonb_array_elements(p_rows) WITH ORDINALITY x(e,o)) s
   WHERE t<>'object' OR k IS NULL OR (p IS NOT NULL AND NOT (k COLLATE "C" > p COLLATE "C"))) THEN
  RAISE EXCEPTION 'Invalid fence snapshot' USING ERRCODE='22023'; END IF;
 encoding:=p_rows::text;
 IF octet_length(encoding)>262144 THEN RAISE EXCEPTION 'The fence snapshot exceeds its bound; nothing was fenced' USING ERRCODE='54000'; END IF;
 digest:=encode(sha256(convert_to('research-runtime-fence-v1|'||p_kind||chr(10)||encoding,'UTF8')),'hex');
END $$;

-- The resource's reservation cohort: its contributed reservations (the 0094 ledger join) and every tracked call it made
-- (0109 identities: design, source review and account-null included). Read without a lock: every runtime writer of the
-- project waits on the project row this fence holds.
CREATE FUNCTION sophia.research_runtime_fence_rows(p_project uuid, p_resource uuid, p_kind text) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 WITH cohort AS (
  SELECT x.reservation_id AS id FROM sophia.api_contribution_reservations x JOIN sophia.api_contribution_tasks t
   ON t.project_id=x.project_id AND t.job_id=x.job_id WHERE t.project_id=p_project AND t.resource_id=p_resource
  UNION
  SELECT i.reservation_id FROM sophia.research_call_identities i WHERE i.project_id=p_project AND i.resource_id=p_resource),
 base AS (
  SELECT r.*, x.reservation_id IS NOT NULL AS ledger, i.reservation_id IS NOT NULL AS tracked, i.operation, i.contract,
   coalesce(x.job_id,i.job_id) AS job, CASE WHEN x.reservation_id IS NOT NULL THEN 'contributor_api_account' ELSE i.payer END AS payer,
   coalesce(x.account_id,i.account_id) AS account, coalesce(x.grant_id,i.grant_id) AS grant_ref,
   coalesce(x.grant_revision,i.grant_revision) AS grant_rev, coalesce(x.connection_id,i.connection_id) AS connection,
   coalesce(x.credential_revision,i.credential_revision) AS credential_rev,
   tr.digest AS truth_digest, tr.outcome AS truth_outcome, tr.history_count, tr.first_conflict_digest, tr.first_conflict_reason,
   tr.first_overflow_digest,
   jsonb_strip_nulls(jsonb_build_object('n1',tr.w_n1,'n2',tr.w_n2,'httpStatus',tr.w_http_status,'providerTerminal',tr.w_provider_terminal,
    'inputTotal',tr.w_input_total,'cacheRead',tr.w_cache_read,'output',tr.w_output,'crossC1p',tr.w_cross_c1p)) AS witnesses,
   EXISTS(SELECT 1 FROM sophia.research_evidence_guards g WHERE g.restricted AND g.first_project_id=r.project_id
    AND g.first_reservation_id=r.id) AS restricts_account,
   EXISTS(SELECT 1 FROM sophia.research_allowance_restrictions a WHERE a.project_id=r.project_id AND a.allowance_id=r.allowance_id
    AND a.first_reservation_id=r.id) AS restricts_allowance
  FROM cohort c JOIN sophia.research_reservations r ON r.project_id=p_project AND r.id=c.id
  LEFT JOIN sophia.api_contribution_reservations x ON x.project_id=r.project_id AND x.reservation_id=r.id
  LEFT JOIN sophia.research_call_identities i ON i.project_id=r.project_id AND i.reservation_id=r.id
  LEFT JOIN sophia.research_call_truth tr ON tr.project_id=r.project_id AND tr.reservation_id=r.id)
 SELECT CASE p_kind
  WHEN 'monetary_open' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('reservationId',b.id,'state',b.state,'kind',b.kind,
    'purpose',b.purpose,'reservedUsd',b.reserved_usd,'allowanceId',b.allowance_id,'jobId',b.job,'payer',b.payer,'accountId',b.account,
    'grantId',b.grant_ref,'grantRevision',b.grant_rev,'connectionId',b.connection,'credentialRevision',b.credential_rev,
    'ledger',b.ledger,'tracked',b.tracked,'operation',b.operation,'contract',b.contract) ORDER BY b.id),'[]'::jsonb)
   FROM base b WHERE b.state IN ('reserved','uncertain'))
  WHEN 'cause' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('reservationId',b.id,'state',b.state,'reservedUsd',b.reserved_usd,
    'settledUsd',b.settled_usd,'allowanceId',b.allowance_id,'payer',b.payer,'accountId',b.account,'tracked',b.tracked,
    'operation',b.operation,'truthDigest',b.truth_digest,'outcome',b.truth_outcome,'historyCount',b.history_count,
    'firstConflictDigest',b.first_conflict_digest,'firstConflictReason',b.first_conflict_reason,
    'firstOverflowDigest',b.first_overflow_digest,'witnesses',b.witnesses,'restrictsAccount',b.restricts_account,
    'restrictsAllowance',b.restricts_allowance) ORDER BY b.id),'[]'::jsonb)
   FROM base b WHERE b.first_conflict_digest IS NOT NULL OR b.first_overflow_digest IS NOT NULL OR b.witnesses<>'{}'::jsonb
    OR b.restricts_account OR b.restricts_allowance)
 END $$;

-- The one fence mechanism of both entries.
CREATE FUNCTION sophia.research_runtime_fence(p_project uuid, p_resource uuid, p_generation text, p_entry text)
RETURNS sophia.research_runtime_fences LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE link sophia.api_contribution_runtimes; f sophia.research_runtime_fences; gen text; acc uuid; gr sophia.api_contribution_grants;
 ids uuid[]; revoked uuid[]; o record; c record; retire_count integer; fid uuid:=gen_random_uuid(); fenced timestamptz;
BEGIN
 IF p_entry IS NULL OR p_entry NOT IN ('fence','retire') THEN RAISE EXCEPTION 'Invalid fence entry' USING ERRCODE='22023'; END IF;
 IF p_entry='fence' AND (p_generation IS NULL OR p_generation !~ '^[0-9a-f]{64}$') THEN
  RAISE EXCEPTION 'The fence names no valid generation' USING ERRCODE='22023'; END IF;
 -- FENCE-ORDER: the project row first (every runtime writer of the project waits on it, and this waits on them), then
 -- the contribution link, then the resource's runtime rows in id order.
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO link FROM sophia.api_contribution_runtimes WHERE project_id=p_project AND resource_id=p_resource FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only a drained contribution runtime is retired' USING ERRCODE='22023'; END IF;
 -- FENCE-REPLAY: the stored fence answers before any mutable check; another token for it is refused.
 SELECT * INTO f FROM sophia.research_runtime_fences WHERE project_id=p_project AND resource_id=p_resource;
 IF FOUND THEN
  IF p_generation IS NOT NULL AND p_generation<>f.generation THEN
   RAISE EXCEPTION 'The fence target is stale or mismatched' USING ERRCODE='22023'; END IF;
  RETURN f;
 END IF;
 IF link.state<>'draining' THEN RAISE EXCEPTION 'Only a drained contribution runtime is retired' USING ERRCODE='22023'; END IF;
 gen:=sophia.research_runtime_generation(link.project_id,link.resource_id,link.connection_id,link.credential_revision);
 IF p_generation IS NOT NULL AND p_generation<>gen THEN
  RAISE EXCEPTION 'The fence target is stale or mismatched' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(s.id ORDER BY s.id),'{}') INTO ids
  FROM (SELECT ri.id FROM sophia.runtime_instances ri WHERE ri.project_id=p_project AND ri.resource_id=p_resource ORDER BY ri.id FOR UPDATE) s;
 -- Authoritative identities, read without a lock (no account or grant row is locked: E03).
 SELECT account_id INTO acc FROM sophia.api_connections WHERE id=link.connection_id;
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE project_id=p_project AND connection_id=link.connection_id;
 -- Both snapshots are complete and encodable, or nothing happens (E01).
 SELECT * INTO o FROM sophia.research_runtime_fence_encode('monetary_open',sophia.research_runtime_fence_rows(p_project,p_resource,'monetary_open'));
 SELECT * INTO c FROM sophia.research_runtime_fence_encode('cause',sophia.research_runtime_fence_rows(p_project,p_resource,'cause'));
 -- E02: the 0094 count, exactly its join, apart from the snapshots.
 SELECT count(*) INTO retire_count FROM sophia.api_contribution_reservations x JOIN sophia.research_reservations r
  ON r.project_id=x.project_id AND r.id=x.reservation_id JOIN sophia.api_contribution_tasks t ON t.project_id=x.project_id AND t.job_id=x.job_id
  WHERE t.project_id=p_project AND t.resource_id=p_resource AND r.state IN ('reserved','uncertain');
 -- The one effect on existing rows: this generation's capabilities are revoked.
 WITH v AS (UPDATE sophia.runtime_instances SET state='revoked', revoked_at=now()
   WHERE project_id=p_project AND resource_id=p_resource AND state='active' RETURNING id)
 SELECT coalesce(array_agg(v.id ORDER BY v.id),'{}') INTO revoked FROM v;
 fenced:=clock_timestamp();
 INSERT INTO sophia.research_runtime_fences(id,project_id,resource_id,connection_id,account_id,credential_revision,link_runtime_id,
  link_created_at,grant_id,grant_revision,generation,runtime_ids,revoked_runtime_ids,entry,retire_unresolved_count,result,fenced_at)
 VALUES(fid,p_project,p_resource,link.connection_id,acc,link.credential_revision,link.runtime_id,link.created_at,gr.id,gr.revision,gen,
  ids,revoked,p_entry,retire_count,
  jsonb_build_object('fenceId',fid,'projectId',p_project,'resourceId',p_resource,'connectionId',link.connection_id,'accountId',acc,
   'credentialRevision',link.credential_revision,'generation',gen,'grantId',gr.id,'grantRevision',gr.revision,
   'runtimeIds',to_jsonb(ids),'revokedRuntimeIds',to_jsonb(revoked),'unresolvedReservations',retire_count,
   'encoding','research-runtime-fence-v1','monetaryOpen',jsonb_build_object('count',o.row_count,'digest',o.digest),
   'causes',jsonb_build_object('count',c.row_count,'digest',c.digest),'checkpointOnly',true,'entry',p_entry,'fencedAt',fenced),
  fenced)
 RETURNING * INTO f;
 INSERT INTO sophia.research_runtime_fence_snapshots(fence_id,kind,encoding,row_count,digest)
 VALUES(fid,'monetary_open',o.encoding,o.row_count,o.digest),(fid,'cause',c.encoding,c.row_count,c.digest);
 RETURN f;
END $$;

-- The fence entry: the operator names the generation token it read.
CREATE FUNCTION sophia.fence_contribution_runtime(p_project uuid, p_resource uuid, p_generation text) RETURNS jsonb LANGUAGE sql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT (sophia.research_runtime_fence(p_project,p_resource,p_generation,'fence')).result $$;

-- retire_contribution_runtime (0094), replaced: the same signature and result fields, through the same fence. Its
-- unresolvedReservations is the 0094 join's count, frozen with the fence; a repeat returns it again.
CREATE OR REPLACE FUNCTION sophia.retire_contribution_runtime(p_project uuid, p_resource uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE f sophia.research_runtime_fences:=sophia.research_runtime_fence(p_project,p_resource,NULL,'retire');
BEGIN
 RETURN jsonb_build_object('resourceId',p_resource,'unresolvedReservations',f.retire_unresolved_count);
END $$;

REVOKE ALL ON FUNCTION sophia.research_runtime_generation(uuid,uuid,uuid,bigint), sophia.contribution_runtime_generation(uuid,uuid),
 sophia.research_runtime_fence_frozen(), sophia.research_runtime_fence_encode(text,jsonb),
 sophia.research_runtime_fence_rows(uuid,uuid,text), sophia.research_runtime_fence(uuid,uuid,text,text),
 sophia.fence_contribution_runtime(uuid,uuid,text) FROM PUBLIC, sophia_api, sophia_worker;
REVOKE ALL ON FUNCTION sophia.runtime_lease(bytea,text,text), sophia.runtime_hello(bytea,text,text,jsonb),
 sophia.retire_contribution_runtime(uuid,uuid) FROM PUBLIC;

COMMIT;
