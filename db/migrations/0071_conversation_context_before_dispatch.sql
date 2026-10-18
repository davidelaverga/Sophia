-- FND-B2-ORDINARY-ASK-ASSEMBLY-01: an ordinary Ask's context is recorded before its create can be dispatched. The Ask
-- writes the native.create outbox row in the same transaction as the reply (0064, conversation_ask), and the dispatcher
-- used to deny that row as soon as it saw no recorded context: with any assembler running, an ordinary Ask failed
-- not_dispatched whenever dispatch won the race (B2-assembly-intake-delta).
-- * conversation_dispatch (0067), replaced: when the ONLY ineligibility is a context not yet recorded, the reply is
--   pending and the create is not cleanup, the row is deferred ('waiting for reply context', the ordinary 5 s defer)
--   while now < the reply's created_at + conversation_context_wait(); after that it is denied as before, the reply
--   failed with the truthful reason context_unavailable. Every other ineligibility (authority, state, grant, subject,
--   privacy) and every other path, provenance included, is unchanged.
-- * conversation_ask (0064), replaced: the same, refusing at once (reply blocked, context_assembler_unbound, no attempt
--   or outbox) when the assembler role has no admitted execution login: a LOGIN member of it alone, itself bare
--   (0070's member rule) and allowed to connect here, through a membership the worker can use as the activation
--   check requires: SET, without ADMIN (#393 r4300923362), since the worker's SET LOCAL ROLE needs SET. A login the
--   trusted non-superuser owner admits (D-Q13, conversation_admit_assembler_login) keeps only its recorded creator
--   edge as a member. Whether that
--   login's worker is running is not knowable here; a bound login whose worker is absent leaves the context
--   unrecorded, and the create is denied context_unavailable by the first dispatch pass that processes it after the
--   wait.
-- * runtime_hello (0067), replaced, and the Ask's runtime choice and the create's dispatch (#393 discussion
--   4302482626, A40): a role may name the executor that serves it, validated and kept with the role. A pinned service
--   grant is bound only to a runtime advertising its exact executor tuple, the newest such one, and its create is
--   dispatched only while that runtime still advertises it (otherwise it waits; it is never retargeted). A native grant
--   takes a role naming no executor or the native one. With no such runtime the Ask is refused at once
--   (runtime_unavailable), before any attempt or outbox.
-- * conversation_context_wait() = 120 s: the deadline until which a create may wait for its context, not a latency
--   guarantee. It is sized from ONE reply's uncontended worst case under the worker's assembly limits (apps/worker,
--   ASSEMBLY_LIMITS: deadline 10 s, lease 30 s = checkedLimits' floor of three deadlines, and at least statement +
--   idle-in-transaction 10 s), the dispatcher's idle pass 2 s and the 5 s defer: on an otherwise idle worker the first
--   claim starts within 2 s of the Ask; at most three claims (conversation_assembly_claim) each end or lapse within one
--   30 s lease, the next starting within one further defer pass (5 s + 2 s); the dispatch pass after the last sees the
--   record within one more (7 s): 2 + 3 x 30 + 2 x 7 + 7 = 113 s <= 120 s. A test pins that arithmetic against both
--   constants. A pass claims up to 10 rows and assembles them one after another, so behind other assemblies a reply can
--   start later and run out of the wait; it then fails truthfully with context_unavailable, recorded when a dispatch
--   pass next processes the row, not at 120 s exactly. Nothing measured that under load.
BEGIN;

CREATE FUNCTION sophia.conversation_context_wait() RETURNS interval LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT interval '120 seconds' $$;
REVOKE ALL ON FUNCTION sophia.conversation_context_wait() FROM PUBLIC;

CREATE FUNCTION sophia.conversation_assembler_admitted() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT FROM pg_roles a JOIN pg_auth_members m ON m.roleid=a.oid JOIN pg_roles r ON r.oid=m.member
  WHERE a.rolname='sophia_conversation_assembler' AND NOT a.rolcanlogin AND r.rolcanlogin
   AND m.set_option AND NOT m.admin_option
   AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)
   AND NOT EXISTS(SELECT FROM pg_auth_members o WHERE o.member=r.oid AND o.roleid<>a.oid)
   -- No member, but (D-Q13) the trusted installation owner's own creator edge, made with the login by
   -- conversation_admit_assembler_login and recorded on it there: ADMIN, granted by the bootstrap superuser, no INHERIT,
   -- no SET, from postgres still owning this database and schema sophia.
   AND NOT EXISTS(SELECT FROM pg_auth_members o WHERE o.roleid=r.oid
    AND NOT (o.grantor=10 AND o.admin_option AND NOT o.inherit_option AND NOT o.set_option
     AND EXISTS(SELECT FROM pg_roles g WHERE g.oid=o.grantor AND g.rolsuper)
     AND EXISTS(SELECT FROM pg_roles i WHERE i.oid=o.member AND i.rolname='postgres' AND NOT i.rolsuper
      AND i.oid=(SELECT datdba FROM pg_database WHERE datname=current_database())
      AND i.oid=(SELECT nspowner FROM pg_namespace WHERE nspname='sophia'))
     AND shobj_description(r.oid,'pg_authid') IS NOT DISTINCT FROM
      'con01-q13-fresh-creator v1 edge='||o.oid||' installer='||o.member))
   AND has_database_privilege(r.oid,current_database(),'CONNECT')) $$;
REVOKE ALL ON FUNCTION sophia.conversation_assembler_admitted() FROM PUBLIC;

-- D-Q13: the trusted installation owner admits ONE execution login, created here: absent before, so PostgreSQL makes
-- the owner its creator in this transaction (one ADMIN edge from the bootstrap superuser, no INHERIT, no SET), and that
-- edge alone is recorded on the login. Then the execution edge (SET, no ADMIN, no INHERIT) and CONNECT on this database,
-- nothing else. Any other caller, a role that already exists, a non-default createrole_self_grant or any other edge or
-- dependency is refused before anything is granted. Its password and its use are a separate operator act. A superuser
-- installation admits its logins as before, without this.
CREATE FUNCTION sophia.conversation_admit_assembler_login(p_login name) RETURNS oid LANGUAGE plpgsql
SET search_path=pg_catalog AS $$
DECLARE i oid; l oid; e oid;
BEGIN
 SELECT r.oid INTO i FROM pg_roles r WHERE r.rolname='postgres' AND NOT r.rolsuper AND r.rolcreaterole
  AND r.oid=(SELECT datdba FROM pg_database WHERE datname=current_database())
  AND r.oid=(SELECT nspowner FROM pg_namespace WHERE nspname='sophia');
 IF i IS NULL OR current_user<>'postgres' OR session_user<>'postgres' THEN
  RAISE EXCEPTION 'only the trusted installation owner admits an assembler login this way' USING ERRCODE='42501';
 END IF;
 IF current_setting('createrole_self_grant')<>'' THEN
  RAISE EXCEPTION 'createrole_self_grant must be its default' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='sophia_conversation_assembler') THEN
  RAISE EXCEPTION 'no assembler role' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname=p_login) THEN
  RAISE EXCEPTION 'role % exists: a role is never adopted', p_login USING ERRCODE='42501';
 END IF;
 EXECUTE format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION', p_login);
 SELECT oid INTO STRICT l FROM pg_roles WHERE rolname=p_login;
 SELECT m.oid INTO e FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.grantor
  WHERE m.roleid=l AND m.member=i AND m.grantor=10 AND g.rolsuper AND m.admin_option AND NOT m.inherit_option
   AND NOT m.set_option AND m.xmin=pg_current_xact_id()::xid;
 IF e IS NULL OR (SELECT count(*) FROM pg_auth_members m WHERE m.roleid=l OR m.member=l)<>1
    OR EXISTS(SELECT FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=l) THEN
  RAISE EXCEPTION 'the new login is not exactly as created' USING ERRCODE='42501';
 END IF;
 EXECUTE format('GRANT sophia_conversation_assembler TO %I WITH ADMIN FALSE, INHERIT FALSE, SET TRUE', p_login);
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), p_login);
 EXECUTE format('COMMENT ON ROLE %I IS %L', p_login, 'con01-q13-fresh-creator v1 edge='||e||' installer='||i);
 RETURN l;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_admit_assembler_login(name) FROM PUBLIC;

-- runtime_hello (0067), replaced (A40): a role may name the executor that serves it, which is validated and kept with
-- the role, in one named insertion (CON-HELLO-EXECUTOR). Everything else is 0067's body byte for byte. Its owner and
-- grants are kept (CREATE OR REPLACE).
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


-- conversation_dispatch (0067), replaced as above. Its owner and grants are kept (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION sophia.conversation_dispatch(o sophia.outbox) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.conversation_replies; a sophia.work_attempts; b sophia.execution_bindings;
 c sophia.commands; rt sophia.runtime_instances; original sophia.outbox; cancellation sophia.conversation_cancellations;
 why text; kind text; payload jsonb:='{}'; next_seq bigint; rc_id uuid:=gen_random_uuid(); body jsonb;
 g sophia.conversation_grants; held sophia.conversation_dispatch_provenance;
BEGIN
 SELECT * INTO STRICT r FROM sophia.conversation_replies WHERE project_id=o.project_id AND id=o.conversation_reply_id FOR UPDATE;
 SELECT * INTO STRICT a FROM sophia.work_attempts WHERE project_id=o.project_id AND conversation_reply_id=r.id FOR UPDATE;
 SELECT * INTO STRICT c FROM sophia.commands WHERE project_id=o.project_id AND id=o.command_id FOR UPDATE;
 SELECT * INTO STRICT b FROM sophia.execution_bindings WHERE project_id=o.project_id AND id=o.binding_id FOR UPDATE;
 why:=sophia.conversation_delivery_ineligible(o);
 -- 0071: a create whose only ineligibility is a context not yet recorded waits for the assembler, within the bound
 -- (conversation_context_wait); every other ineligibility, and a wait that has run out, is denied as before.
 IF why='recorded context unavailable' AND o.destination='native.create' AND NOT o.cleanup AND r.state='pending'
    AND clock_timestamp()<r.created_at+sophia.conversation_context_wait() THEN
  RETURN sophia.defer_native_delivery(o,NULL::sophia.commands,'waiting for reply context');
 END IF;
 IF why IS NOT NULL AND o.destination='native.create' AND r.state='pending' THEN
  -- A3: absence must be proved before even the denial. Contradiction is never repaired or declared terminal.
  IF EXISTS(SELECT 1 FROM sophia.runtime_commands WHERE project_id=o.project_id AND binding_id=b.id)
   OR EXISTS(SELECT 1 FROM sophia.conversation_executions WHERE project_id=o.project_id AND attempt_id=a.id)
   OR EXISTS(SELECT 1 FROM sophia.conversation_reservations WHERE project_id=o.project_id AND reply_id=r.id)
   OR EXISTS(SELECT 1 FROM sophia.native_observations WHERE project_id=o.project_id AND binding_id=b.id)
   OR EXISTS(SELECT 1 FROM sophia.usage_records WHERE project_id=o.project_id AND attempt_id=a.id) THEN
   RAISE EXCEPTION 'inconsistent undispatched reply evidence' USING ERRCODE='55000'; END IF;
 END IF;
 IF why IS NOT NULL THEN
  UPDATE sophia.outbox SET state='denied',lease_until=NULL,outcome_reason=left(why,2000) WHERE project_id=o.project_id AND id=o.id;
  UPDATE sophia.commands SET state='denied' WHERE project_id=o.project_id AND id=c.id AND state IN ('admitted','dispatching');
  IF o.destination='native.create' AND r.state='pending' THEN
   UPDATE sophia.conversation_replies SET state='failed',
    reason=CASE WHEN why='recorded context unavailable' THEN 'context_unavailable' ELSE 'not_dispatched' END,
    settled_at=clock_timestamp()
    WHERE project_id=o.project_id AND id=r.id AND state='pending';
   PERFORM sophia.conversation_retire(o.project_id,a.id);
   UPDATE sophia.execution_bindings SET state='retired' WHERE project_id=o.project_id AND id=b.id;
   UPDATE sophia.work_attempts SET state='stopped' WHERE project_id=o.project_id AND id=a.id;
   UPDATE sophia.outbox SET state='settled',lease_until=NULL WHERE project_id=o.project_id AND conversation_reply_id=r.id AND destination='native.retire';
   UPDATE sophia.commands SET state='checked' WHERE project_id=o.project_id AND id IN
    (SELECT command_id FROM sophia.outbox WHERE project_id=o.project_id AND conversation_reply_id=r.id AND destination='native.retire')
    AND state IN ('admitted','dispatching');
  END IF;
  RETURN jsonb_build_object('result','denied','reason',why);
 END IF;
 IF o.destination='native.retire' AND NOT EXISTS(SELECT 1 FROM sophia.runtime_commands WHERE project_id=o.project_id AND binding_id=b.id) THEN
  SELECT * INTO original FROM sophia.outbox WHERE project_id=o.project_id AND conversation_reply_id=r.id AND destination='native.create' FOR UPDATE;
  SELECT * INTO cancellation FROM sophia.conversation_cancellations WHERE project_id=o.project_id AND reply_id=r.id;
  IF (r.state='cancelled' AND cancellation.create_fate IN ('superseded','left_to_dispatch') AND original.state IN ('superseded','denied')) IS NOT TRUE
   OR EXISTS(SELECT 1 FROM sophia.conversation_executions WHERE project_id=o.project_id AND attempt_id=a.id)
   OR EXISTS(SELECT 1 FROM sophia.conversation_reservations WHERE project_id=o.project_id AND reply_id=r.id)
   OR EXISTS(SELECT 1 FROM sophia.native_observations WHERE project_id=o.project_id AND binding_id=b.id)
   OR EXISTS(SELECT 1 FROM sophia.usage_records WHERE project_id=o.project_id AND attempt_id=a.id) THEN
   RETURN sophia.defer_native_delivery(o,NULL::sophia.commands,'waiting for undispatched reply proof'); END IF;
  UPDATE sophia.execution_bindings SET state='retired' WHERE project_id=o.project_id AND id=b.id;
  UPDATE sophia.work_attempts SET state='stopped' WHERE project_id=o.project_id AND id=a.id;
  UPDATE sophia.outbox SET state='settled',lease_until=NULL WHERE project_id=o.project_id AND id=o.id;
  UPDATE sophia.commands SET state='checked' WHERE project_id=o.project_id AND id=c.id AND state IN ('admitted','dispatching');
  RETURN jsonb_build_object('result','settled');
 END IF;
 SELECT * INTO rt FROM sophia.runtime_instances WHERE project_id=o.project_id AND resource_id=b.resource_id
  AND runtime_unit_id=b.runtime_unit_id AND state='active' FOR UPDATE;
 IF rt.id IS NULL THEN RETURN sophia.defer_native_delivery(o,NULL::sophia.commands,'waiting for reply runtime'); END IF;
 IF o.destination='native.create' AND sophia.runtime_unavailable(rt) IS NOT NULL THEN
  RETURN sophia.defer_native_delivery(o,NULL::sophia.commands,'waiting for ready reply runtime'); END IF;
 kind:=substr(o.destination,8);
 IF kind='create' THEN
  -- 0067: the grant row is kept (g), held against a pin until this transaction ends (the project is already held, in
  -- the same order a pin takes): its execution tuple is what this attempt is dispatched under.
  SELECT * INTO STRICT g FROM sophia.conversation_grants WHERE project_id=o.project_id AND current FOR SHARE;
  payload:=jsonb_build_object('role','sophia-conversation-v1','route',g.route_id,
   'conversation',jsonb_build_object('credentialRef',g.credential_ref,'ownerResourceRef',g.owner_resource_ref,'unit',g.unit)
    ||CASE WHEN g.execution='service' THEN jsonb_build_object('execution',jsonb_build_object('execution','service',
     'routeId',g.route_id,'executorArtifactDigest',g.executor_artifact_digest)) ELSE '{}'::jsonb END,
   'text',sophia.conversation_reply_statement(o.project_id,r.id));
  -- A40: the bound runtime must still advertise the role for this grant's execution, as the Ask's selection required;
  -- otherwise the create waits, as for a changed role. It is never retargeted, and no provenance is written yet.
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rt.roles) x WHERE x->>'id'='sophia-conversation-v1' AND x->>'route'=g.route_id
    AND CASE WHEN g.execution='service' THEN x->'executor'=jsonb_build_object('execution','service','routeId',g.route_id,
      'executorArtifactDigest',g.executor_artifact_digest)
     ELSE (NOT x ? 'executor' OR x->'executor'='{"execution":"native"}'::jsonb) END) THEN
   RETURN sophia.defer_native_delivery(o,NULL::sophia.commands,'waiting for compatible reply role'); END IF;
 END IF;
 UPDATE sophia.runtime_instances SET command_sequence=command_sequence+1 WHERE id=rt.id RETURNING command_sequence INTO next_seq;
 body:=jsonb_build_object('schema','sophia.runtime-command.v1','commandId',rc_id,
  'binding',jsonb_build_object('projectId',o.project_id,'conversationReplyId',r.id,'attemptId',a.id,
   'resourceId',b.resource_id,'authorityEpoch',o.authority_epoch,'runtimeUnitId',b.runtime_unit_id),
  'kind',kind,'expectedNativeSessionId',NULL,'contextPacketId',NULL,'payload',payload);
 INSERT INTO sophia.runtime_commands(project_id,runtime_id,seq,id,outbox_id,command_id,binding_id,attempt_id,kind,authority_epoch,body)
 VALUES(o.project_id,rt.id,next_seq,rc_id,o.id,c.id,b.id,a.id,kind,o.authority_epoch,body);
 -- 0067: the attempt's original execution tuple, kept immutably in this same transaction, before any execution.
 IF kind='create' THEN
  INSERT INTO sophia.conversation_dispatch_provenance(project_id,attempt_id,reply_id,runtime_command_id,lineage_id,execution,
   route_id,executor_artifact_digest)
  VALUES(o.project_id,a.id,r.id,rc_id,g.lineage_id,g.execution,g.route_id,g.executor_artifact_digest)
  ON CONFLICT (project_id,attempt_id) DO NOTHING;
  SELECT * INTO STRICT held FROM sophia.conversation_dispatch_provenance WHERE project_id=o.project_id AND attempt_id=a.id;
  IF (held.execution,held.route_id,held.executor_artifact_digest) IS DISTINCT FROM (g.execution,g.route_id,g.executor_artifact_digest) THEN
   RAISE EXCEPTION 'provenance conflict' USING ERRCODE='23505'; END IF;
 END IF;
 UPDATE sophia.outbox SET state='acknowledged',lease_until=NULL,outcome_reason=NULL WHERE project_id=o.project_id AND id=o.id;
 UPDATE sophia.commands SET state='dispatching' WHERE project_id=o.project_id AND id=c.id AND state='admitted';
 IF kind='create' THEN UPDATE sophia.execution_bindings SET state='launching' WHERE project_id=o.project_id AND id=b.id AND state='created'; END IF;
 RETURN jsonb_build_object('result','dispatched','commandId',rc_id);
END $$;

-- conversation_ask (0064), replaced as above.
CREATE OR REPLACE FUNCTION sophia.conversation_ask(p_project uuid, p_conversation uuid, m sophia.conversation_messages)
RETURNS sophia.conversation_replies LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.conversation_replies; g sophia.conversation_grants; rt sophia.runtime_instances;
 b sophia.execution_bindings; a sophia.work_attempts; c sophia.commands; why text;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO r FROM sophia.conversation_replies WHERE project_id=p_project AND message_id=m.id;
 IF FOUND THEN RETURN r; END IF;
 IF (m.project_id=p_project AND m.conversation_id=p_conversation AND m.author='member' AND m.actor_id IS NOT NULL
  AND m.withdrawn_at IS NULL) IS NOT TRUE OR NOT EXISTS(SELECT 1 FROM sophia.conversation_messages cm
   WHERE cm.project_id=p_project AND cm.id=m.id AND cm.conversation_id=p_conversation AND cm.actor_id=m.actor_id AND cm.seq=m.seq) THEN
  RAISE EXCEPTION 'invalid asking message' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM sophia.conversation_grants WHERE project_id=p_project AND current;
 why:=CASE WHEN NOT EXISTS(SELECT 1 FROM sophia.conversation_settings WHERE project_id=p_project AND state='enabled') THEN 'replies_disabled'
  WHEN g.lineage_id IS NULL THEN 'no_grant' WHEN g.state<>'enabled' THEN 'grant_disabled'
  WHEN g.expires_at<=clock_timestamp() THEN 'grant_expired'
  WHEN NOT EXISTS(SELECT 1 FROM sophia.conversation_grant_subjects s WHERE s.project_id=p_project AND s.lineage_id=g.lineage_id AND s.actor_id=m.actor_id) THEN 'asker_not_authorized'
  WHEN NOT EXISTS(SELECT 1 FROM sophia.project_members pm WHERE pm.project_id=p_project AND pm.actor_id=m.actor_id AND pm.active AND pm.role IN ('admin','editor')) THEN 'asker_removed'
  WHEN NOT EXISTS(SELECT 1 FROM sophia.conversations WHERE project_id=p_project AND id=p_conversation AND state='open') THEN 'conversation_erased'
  WHEN g.spent_calls+g.reserved_calls+g.uncertain_calls>=g.total_call_cap THEN 'calls_exhausted'
  -- 0071: no admitted execution login can assemble its context, so it could only wait and fail: refused at once.
  WHEN NOT sophia.conversation_assembler_admitted() THEN 'context_assembler_unbound' END;
 IF why IS NULL THEN
  -- The grant binds the route and requesting subjects. Its native owner-resource reference is not a host executor id.
  SELECT ri.* INTO rt FROM sophia.runtime_instances ri JOIN sophia.executor_resources er ON er.project_id=ri.project_id AND er.id=ri.resource_id
   WHERE ri.project_id=p_project AND ri.state='active' AND er.state='active'
    -- A40: only a runtime that can execute this grant: a pinned service grant needs its exact executor tuple; a native
    -- grant a role naming no executor (legacy) or the native one. The newest such runtime, never a newer one that cannot.
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(ri.roles) x WHERE x->>'id'='sophia-conversation-v1' AND x->>'route'=g.route_id
     AND CASE WHEN g.execution='service' THEN x->'executor'=jsonb_build_object('execution','service','routeId',g.route_id,
       'executorArtifactDigest',g.executor_artifact_digest)
      ELSE (NOT x ? 'executor' OR x->'executor'='{"execution":"native"}'::jsonb) END)
    AND sophia.runtime_unavailable(ri) IS NULL ORDER BY ri.seen_at DESC,ri.id LIMIT 1;
  IF rt.id IS NULL THEN why:='runtime_unavailable';
  ELSIF (SELECT count(*) FROM sophia.execution_bindings eb JOIN sophia.work_attempts wa ON wa.project_id=eb.project_id AND wa.id=eb.attempt_id
   WHERE eb.project_id=p_project AND eb.resource_id=rt.resource_id AND eb.runtime_unit_id=rt.runtime_unit_id
    AND eb.state<>'retired' AND wa.conversation_reply_id IS NOT NULL)>=2 THEN why:='cleanup_capacity'; END IF;
 END IF;
 INSERT INTO sophia.conversation_replies(project_id,conversation_id,message_id,asked_by,cutoff_seq,state,reason,settled_at)
 VALUES(p_project,p_conversation,m.id,m.actor_id,m.seq,CASE WHEN why IS NULL THEN 'pending' ELSE 'blocked' END,why,
  CASE WHEN why IS NOT NULL THEN clock_timestamp() END) RETURNING * INTO r;
 IF why IS NOT NULL THEN RETURN r; END IF;
 INSERT INTO sophia.work_attempts(project_id,conversation_reply_id,authority_epoch,state)
 VALUES(p_project,r.id,1,'admitted') RETURNING * INTO a;
 INSERT INTO sophia.execution_bindings(project_id,attempt_id,resource_id,native_session_id,runtime_unit_id,continuation_owner,state)
 VALUES(p_project,a.id,rt.resource_id,'sophia-'||a.id,rt.runtime_unit_id,'sophia_episode','created') RETURNING * INTO b;
 INSERT INTO sophia.commands(project_id,actor_id,authority_epoch,kind,idempotency_key,semantic_request,state)
 VALUES(p_project,m.actor_id,1,'create',r.id::text,jsonb_build_object('operation','conversation-create','replyId',r.id,'attemptId',a.id),'admitted') RETURNING * INTO c;
 INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,conversation_reply_id,authority_epoch)
 VALUES(p_project,c.id,'native.create','binding/'||b.id,b.id,r.id,1);
 RETURN r;
END $$;

COMMIT;
