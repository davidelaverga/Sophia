-- INC01-CC-002 (SOPHIA-INC-2026-11, INC01-S1 / C02), contract amendment A47: owner-runner operations. An owner admits a
-- bounded operation on their own native executor resource; it is kept with a command and an outbox row in one
-- transaction, claimed once by the worker, rechecked against current authority, marked as a possible send before the
-- owner gateway is called, and reconciled by its original native identities. docs/plans/owner-runner-operations.md.
--
-- * Anchored on 0001: executor_resources (codex-native / claude-native) and their execution_connections, goals,
--   work_attempts, execution_bindings, commands and outbox. No parallel resource or work graph, no credential.
-- * A route is usable only with an operator-recorded qualification (qualify_owner_runner, migration-owner only: no
--   application role can execute it). None exists in production, so every admission there is refused before a write.
-- * A create's binding starts `launching`, never `created`: the dsh cleanup path (dispatch_runtime_outbox, 0075) settles
--   a `created` binding with no runtime command as "no native session to fence", which would falsely settle a possible
--   send. Its continuation_owner is `native_goal`, so goal steer/resume never fan dsh rows out to it.
-- * Destinations are runner.create / runner.input / runner.stop: not native.*, so claim_runtime_outbox and
--   reconcile_runtime_outbox (0053) never take them. expire_dispatch_leases (0004) still marks their expired leases
--   outcome_unknown; owner_runner_maintain then decides from the operation: never possibly sent, requeued; possibly
--   sent, unknown. A goal Hold/Stop supersedes pending non-cleanup rows (admit_goal_command); maintain denies them.
-- * A possibly-sent operation never returns to admitted (r3, R2-F01): no gateway journal can prove its own history
--   complete, so an unproven possible send stays unknown, its reservation held, for an operator to settle.
-- * Commands and outbox rows are readable by every member (0002), so their semantic request holds only the kind, the
--   operation id and the payload digest. The operation, its message and its events are the owner's alone.
-- 0001-0091 are not edited. Additive: new tables and functions only.
BEGIN;

CREATE TABLE sophia.owner_runner_qualifications (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), resource_id uuid NOT NULL,
 owner_id uuid NOT NULL, connection_id uuid NOT NULL,
 connection_revision bigint NOT NULL CHECK(connection_revision>0), resource_revision bigint NOT NULL CHECK(resource_revision>0),
 adapter text NOT NULL CHECK(adapter='t3'), adapter_pin text NOT NULL CHECK(adapter_pin ~ '^[0-9a-f]{40}$'),
 environment_ref text NOT NULL CHECK(environment_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
 native_project_ref text NOT NULL CHECK(native_project_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
 profile_id text NOT NULL CHECK(profile_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
 profile_revision bigint NOT NULL CHECK(profile_revision>0),
 -- This candidate qualifies read-only profiles only, with T3's injected orchestration toolkit removed or narrowed.
 read_only boolean NOT NULL DEFAULT true CHECK(read_only),
 toolkit_scope text NOT NULL CHECK(toolkit_scope IN ('none_exposed','gateway_enforced')),
 account_key text NOT NULL CHECK(account_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
 operations text[] NOT NULL CHECK(cardinality(operations)>0 AND operations <@ ARRAY['create','input','stop']::text[]),
 allowance_operations integer NOT NULL CHECK(allowance_operations BETWEEN 1 AND 1000),
 used_operations integer NOT NULL DEFAULT 0 CHECK(used_operations>=0 AND used_operations<=allowance_operations),
 evidence_ref text NOT NULL CHECK(length(evidence_ref) BETWEEN 1 AND 500),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 qualified_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, revoked_reason text CHECK(revoked_reason IS NULL OR length(revoked_reason) BETWEEN 1 AND 500),
 PRIMARY KEY(project_id,id),
 FOREIGN KEY(project_id,resource_id) REFERENCES sophia.executor_resources(project_id,id),
 FOREIGN KEY(connection_id,owner_id) REFERENCES sophia.execution_connections(id,owner_id),
 CHECK(expires_at>qualified_at)
);
CREATE UNIQUE INDEX owner_runner_one_qualification ON sophia.owner_runner_qualifications(project_id,resource_id) WHERE revoked_at IS NULL;
ALTER TABLE sophia.owner_runner_qualifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_reads ON sophia.owner_runner_qualifications FOR SELECT TO sophia_api
 USING(owner_id=sophia.actor_id() AND sophia.is_member(project_id));
GRANT SELECT ON sophia.owner_runner_qualifications TO sophia_api;

CREATE TABLE sophia.owner_runner_operations (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL, client_request_id text NOT NULL CHECK(length(client_request_id) BETWEEN 1 AND 160),
 kind text NOT NULL CHECK(kind IN ('create','input','stop')),
 qualification_id uuid NOT NULL, qualification_revision bigint NOT NULL,
 resource_id uuid NOT NULL, goal_id uuid NOT NULL, attempt_id uuid NOT NULL, binding_id uuid NOT NULL,
 command_id uuid NOT NULL, outbox_id uuid NOT NULL, target_operation_id uuid,
 semantic jsonb NOT NULL CHECK(jsonb_typeof(semantic)='object'), payload_digest text NOT NULL CHECK(payload_digest ~ '^[0-9a-f]{64}$'),
 message text CHECK(message IS NULL OR length(message) BETWEEN 1 AND 8000),
 title text CHECK(title IS NULL OR length(title) BETWEEN 1 AND 120),
 -- Frozen at admission; prepare-send compares the current records with them.
 goal_revision bigint NOT NULL, authority_epoch bigint NOT NULL, member_revision bigint NOT NULL,
 connection_id uuid NOT NULL, connection_revision bigint NOT NULL, resource_revision bigint NOT NULL,
 adapter_pin text NOT NULL, environment_ref text NOT NULL, native_project_ref text NOT NULL,
 profile_id text NOT NULL, profile_revision bigint NOT NULL, account_key text NOT NULL,
 state text NOT NULL DEFAULT 'admitted'
  CHECK(state IN ('admitted','possible_send','received','rejected','denied','unknown','settled')),
 reason text CHECK(reason IS NULL OR length(reason) BETWEEN 1 AND 500),
 -- The native identities, derived by the gateway before its call; kept exactly, never matched by text.
 native_namespace text, native_command_id text, native_message_id text, native_thread_id text, native_run_id text,
 native_delivery text CHECK(native_delivery IS NULL OR native_delivery IN ('started','queued','stop_requested','no_active_run','already_ended')),
 run_status text CHECK(run_status IS NULL OR length(run_status) BETWEEN 1 AND 40),
 -- The owner gateway journal this operation was bound to at prepare-send (r2, R1-F01): only that journal can prove it
 -- was never sent, and answers from any other journal change nothing.
 gateway_journal_id uuid,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 deferrals integer NOT NULL DEFAULT 0, reconcile_attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), possible_send_at timestamptz, received_at timestamptz,
 settled_at timestamptz, followed_at timestamptz,
 PRIMARY KEY(project_id,id), UNIQUE(project_id,owner_id,client_request_id),
 UNIQUE(project_id,command_id), UNIQUE(project_id,outbox_id),
 FOREIGN KEY(project_id,qualification_id) REFERENCES sophia.owner_runner_qualifications(project_id,id),
 FOREIGN KEY(project_id,resource_id) REFERENCES sophia.executor_resources(project_id,id),
 FOREIGN KEY(project_id,goal_id) REFERENCES sophia.goals(project_id,id),
 FOREIGN KEY(project_id,attempt_id) REFERENCES sophia.work_attempts(project_id,id),
 FOREIGN KEY(project_id,binding_id) REFERENCES sophia.execution_bindings(project_id,id),
 FOREIGN KEY(project_id,command_id) REFERENCES sophia.commands(project_id,id),
 FOREIGN KEY(project_id,outbox_id) REFERENCES sophia.outbox(project_id,id),
 FOREIGN KEY(project_id,target_operation_id) REFERENCES sophia.owner_runner_operations(project_id,id),
 CHECK((kind='create')=(target_operation_id IS NULL)),
 CHECK((kind='stop')=(message IS NULL)),
 CHECK((kind='create')=(title IS NOT NULL))
);
CREATE INDEX owner_runner_followups ON sophia.owner_runner_operations(followed_at NULLS FIRST) WHERE state IN ('unknown','received');
CREATE INDEX owner_runner_by_binding ON sophia.owner_runner_operations(project_id,binding_id);
ALTER TABLE sophia.owner_runner_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_reads ON sophia.owner_runner_operations FOR SELECT TO sophia_api
 USING(owner_id=sophia.actor_id() AND sophia.is_member(project_id));
GRANT SELECT ON sophia.owner_runner_operations TO sophia_api;

-- The account's one active assignment (binding), across projects and aliases that share an account key. Held from the
-- first possible send of a binding until none of its operations is unsettled; never released by a lease expiring.
CREATE TABLE sophia.owner_runner_reservations (
 account_key text PRIMARY KEY, project_id uuid NOT NULL, binding_id uuid NOT NULL, reserved_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,binding_id) REFERENCES sophia.execution_bindings(project_id,id)
);
ALTER TABLE sophia.owner_runner_reservations ENABLE ROW LEVEL SECURITY;

-- Operator: record a real owner-host qualification. Migration owner only (EXECUTE revoked from PUBLIC, granted to no role).
CREATE FUNCTION sophia.qualify_owner_runner(p_project uuid, p_resource uuid, p_adapter_pin text, p_environment_ref text,
 p_native_project_ref text, p_profile_id text, p_profile_revision bigint, p_toolkit_scope text, p_account_key text,
 p_operations text[], p_allowance integer, p_expires_at timestamptz, p_evidence_ref text)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.executor_resources; conn sophia.execution_connections; q uuid;
BEGIN
 SELECT * INTO r FROM sophia.executor_resources WHERE project_id=p_project AND id=p_resource FOR UPDATE;
 IF NOT FOUND OR r.harness NOT IN ('codex-native','claude-native') OR r.state<>'active' THEN
  RAISE EXCEPTION 'Only an active native resource can be qualified' USING ERRCODE='22023'; END IF;
 SELECT * INTO conn FROM sophia.execution_connections WHERE id=r.connection_id;
 IF conn.state<>'linked' OR (conn.expires_at IS NOT NULL AND conn.expires_at<=now()) THEN
  RAISE EXCEPTION 'Only a linked, unexpired connection can be qualified' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.owner_runner_qualifications(project_id,resource_id,owner_id,connection_id,connection_revision,resource_revision,
  adapter,adapter_pin,environment_ref,native_project_ref,profile_id,profile_revision,toolkit_scope,account_key,operations,
  allowance_operations,expires_at,evidence_ref)
 VALUES(p_project,r.id,r.owner_id,conn.id,conn.revision,r.revision,'t3',p_adapter_pin,p_environment_ref,p_native_project_ref,
  p_profile_id,p_profile_revision,p_toolkit_scope,p_account_key,p_operations,p_allowance,p_expires_at,p_evidence_ref)
 RETURNING id INTO q;
 RETURN q;
END $$;

CREATE FUNCTION sophia.revoke_owner_runner(p_project uuid, p_qualification uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.owner_runner_qualifications SET revoked_at=now(), revoked_reason=p_reason, revision=revision+1
  WHERE project_id=p_project AND id=p_qualification AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Qualification not found' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.qualify_owner_runner(uuid,uuid,text,text,text,text,bigint,text,text,text[],integer,timestamptz,text),
 sophia.revoke_owner_runner(uuid,uuid,text) FROM PUBLIC;

-- The owner's private event for one operation's change (its revision).
CREATE FUNCTION sophia.owner_runner_event(o sophia.owner_runner_operations, p_type text) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE cursor_value bigint;
BEGIN
 UPDATE sophia.projects SET event_sequence=event_sequence+1 WHERE id=o.project_id RETURNING event_sequence INTO cursor_value;
 INSERT INTO sophia.project_events(project_id,sequence,type,entity_type,entity_id,entity_revision,summary_code,actor_id,visibility_owner)
 VALUES(o.project_id,cursor_value,p_type,'runner_operation',o.id,o.revision,'runner_operation.'||o.state,o.owner_id,o.owner_id);
END $$;

CREATE FUNCTION sophia.owner_runner_receipt(o sophia.owner_runner_operations) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('operationId',o.id,'kind',o.kind,'state',o.state,'revision',o.revision,'admittedAt',o.created_at)
$$;

-- What the gateway is sent: every field from Sophia's frozen records (runner-port.ts RunnerEnvelope), none from a request.
CREATE FUNCTION sophia.owner_runner_envelope(o sophia.owner_runner_operations) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('v',1,'operationId',o.id,'kind',o.kind,'projectId',o.project_id,'ownerId',o.owner_id,
  'resourceId',o.resource_id,'bindingId',o.binding_id,'goalId',o.goal_id,'qualificationId',o.qualification_id,
  'qualificationRevision',o.qualification_revision,'adapterPin',o.adapter_pin,'environmentRef',o.environment_ref,
  'nativeProjectRef',o.native_project_ref,'profileId',o.profile_id,'profileRevision',o.profile_revision,
  'accountKey',o.account_key,'authorityEpoch',o.authority_epoch,'message',o.message,'title',o.title,
  'targetOperationId',o.target_operation_id,'nativeThreadId',CASE WHEN o.kind='create' THEN NULL ELSE o.native_thread_id END)
$$;

-- Whether a create's frozen route lineage (R1-F07) still equals the resource's current qualification and connection.
CREATE FUNCTION sophia.owner_runner_same_route(t sophia.owner_runner_operations, q sophia.owner_runner_qualifications,
 conn sophia.execution_connections, r sophia.executor_resources) RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT q.id=t.qualification_id AND q.revision=t.qualification_revision AND conn.id=t.connection_id
  AND conn.revision=t.connection_revision AND r.revision=t.resource_revision AND q.account_key=t.account_key
  AND q.environment_ref=t.environment_ref AND q.adapter_pin=t.adapter_pin AND q.native_project_ref=t.native_project_ref
  AND q.profile_id=t.profile_id AND q.profile_revision=t.profile_revision
$$;

-- A Stop's fence (R1-F05), in the Stop's own transaction: the binding is `stopping` at once, and every input of it that
-- was admitted but not yet claimed is denied, so none can cross the transport after the Stop. An input already claimed
-- is denied at its prepare-send by the same fence.
CREATE FUNCTION sophia.owner_runner_fence(p_project uuid, p_binding uuid) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE x sophia.owner_runner_operations;
BEGIN
 UPDATE sophia.execution_bindings SET state='stopping', observed_at=now()
  WHERE project_id=p_project AND id=p_binding AND state NOT IN ('settled','lost','stopping');
 FOR x IN SELECT o.* FROM sophia.owner_runner_operations o JOIN sophia.outbox ob ON ob.project_id=o.project_id AND ob.id=o.outbox_id
   WHERE o.project_id=p_project AND o.binding_id=p_binding AND o.kind='input' AND o.state='admitted' AND ob.state='pending'
   FOR UPDATE OF o, ob
 LOOP
  UPDATE sophia.owner_runner_operations SET state='denied', reason='a Stop was admitted before it was sent', revision=revision+1
   WHERE project_id=p_project AND id=x.id RETURNING * INTO x;
  UPDATE sophia.outbox SET state='denied', outcome_reason=x.reason WHERE project_id=p_project AND id=x.outbox_id;
  UPDATE sophia.commands SET state='denied' WHERE project_id=p_project AND id=x.command_id;
  PERFORM sophia.owner_runner_event(x,'runner_operation.denied');
 END LOOP;
END $$;

-- Admission (sophia_api, inside withActor 'write'). The same key and request return the first receipt; another request
-- under the key conflicts. Every refusal happens before any write. r2: a connection past its expiry is not
-- authenticated (R1-F06); a follow-up or Stop keeps its binding's original route or is refused (R1-F07); a Stop fences
-- its binding at once, needs no new-work allowance, consumes none, and a second Stop answers the unsettled one (R1-F05).
CREATE FUNCTION sophia.admit_owner_runner_operation(p_project uuid, p_key text, p_request jsonb, p_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); k text; prior sophia.owner_runner_operations; r sophia.executor_resources;
 conn sophia.execution_connections; q sophia.owner_runner_qualifications; g sophia.goals; t sophia.owner_runner_operations;
 b sophia.execution_bindings; mrev bigint; o sophia.owner_runner_operations; pending sophia.owner_runner_operations;
 op uuid:=gen_random_uuid(); cmd uuid:=gen_random_uuid(); ob uuid:=gen_random_uuid(); att uuid; bnd uuid;
 msg text; ttl text; thread text; uuid_re text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid payload digest' USING ERRCODE='22023'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' THEN RAISE EXCEPTION 'Invalid runner operation' USING ERRCODE='22023'; END IF;
 k:=p_request->>'kind';
 IF k IN ('hold','resume','resolve_permission','answer_question') THEN
  RAISE EXCEPTION 'Owner runner operation unsupported: %', k USING ERRCODE='0A000'; END IF;
 IF k IS NULL OR k NOT IN ('create','input','stop') THEN RAISE EXCEPTION 'Invalid runner operation kind' USING ERRCODE='22023'; END IF;
 IF coalesce(p_request->>'resourceId','') !~ uuid_re THEN RAISE EXCEPTION 'Resource not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM sophia.owner_runner_operations WHERE project_id=p_project AND owner_id=a AND client_request_id=p_key;
 IF FOUND THEN
  IF prior.semantic<>p_request OR prior.payload_digest<>p_digest THEN
   RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN sophia.owner_runner_receipt(prior);
 END IF;
 -- Owner-bound: only the resource's own owner may use it. Another's resource answers like a missing one.
 SELECT * INTO r FROM sophia.executor_resources WHERE project_id=p_project AND id=(p_request->>'resourceId')::uuid FOR SHARE;
 IF NOT FOUND OR r.owner_id<>a THEN RAISE EXCEPTION 'Resource not found' USING ERRCODE='22023'; END IF;
 IF r.harness NOT IN ('codex-native','claude-native') OR r.state<>'active' THEN
  RAISE EXCEPTION 'Owner runner route is not qualified: the resource is not an active native resource' USING ERRCODE='55000'; END IF;
 SELECT * INTO conn FROM sophia.execution_connections WHERE id=r.connection_id FOR SHARE;
 IF conn.state<>'linked' THEN RAISE EXCEPTION 'Owner runner route is not qualified: its connection is not linked' USING ERRCODE='55000'; END IF;
 IF conn.expires_at IS NOT NULL AND conn.expires_at<=now() THEN
  RAISE EXCEPTION 'Owner runner route is not qualified: its connection''s authentication expired' USING ERRCODE='55000'; END IF;
 SELECT * INTO q FROM sophia.owner_runner_qualifications WHERE project_id=p_project AND resource_id=r.id AND revoked_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner runner route is not qualified: no qualification for this resource' USING ERRCODE='55000'; END IF;
 IF q.expires_at<=now() THEN RAISE EXCEPTION 'Owner runner route is not qualified: its qualification expired' USING ERRCODE='55000'; END IF;
 IF q.connection_revision<>conn.revision OR q.resource_revision<>r.revision THEN
  RAISE EXCEPTION 'Owner runner route is not qualified: the resource or connection changed since it was qualified' USING ERRCODE='55000'; END IF;
 IF NOT (k=ANY(q.operations)) THEN RAISE EXCEPTION 'Owner runner route is not qualified: % is not a qualified operation', k USING ERRCODE='55000'; END IF;
 -- New work only: a Stop is never refused, used or refunded by the work allowance.
 IF k<>'stop' AND q.used_operations>=q.allowance_operations THEN
  RAISE EXCEPTION 'Owner runner route is not qualified: its operation allowance is used' USING ERRCODE='55000'; END IF;
 SELECT revision INTO mrev FROM sophia.project_members WHERE project_id=p_project AND actor_id=a;
 IF k='create' THEN
  IF coalesce(p_request->>'goalId','') !~ uuid_re THEN RAISE EXCEPTION 'Goal not found' USING ERRCODE='22023'; END IF;
  SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=(p_request->>'goalId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Goal not found' USING ERRCODE='22023'; END IF;
  ttl:=p_request->>'title';
  IF ttl IS NULL OR btrim(ttl)='' OR length(ttl)>120 THEN RAISE EXCEPTION 'A create needs a title of at most 120 characters' USING ERRCODE='22023'; END IF;
 ELSE
  IF coalesce(p_request->>'targetOperationId','') !~ uuid_re THEN RAISE EXCEPTION 'Operation not found' USING ERRCODE='22023'; END IF;
  SELECT * INTO t FROM sophia.owner_runner_operations WHERE project_id=p_project AND id=(p_request->>'targetOperationId')::uuid AND owner_id=a FOR UPDATE;
  IF NOT FOUND OR t.resource_id<>r.id THEN RAISE EXCEPTION 'Operation not found' USING ERRCODE='22023'; END IF;
  IF t.kind<>'create' THEN RAISE EXCEPTION 'An input or stop targets a create operation' USING ERRCODE='22023'; END IF;
  IF t.state NOT IN ('received','settled') OR t.native_thread_id IS NULL THEN
   RAISE EXCEPTION 'Its native thread is not known yet' USING ERRCODE='40001'; END IF;
  IF NOT sophia.owner_runner_same_route(t,q,conn,r) THEN
   RAISE EXCEPTION 'Owner runner route is not qualified: the binding''s original account, connection, profile or qualification changed; a follow-up cannot move it' USING ERRCODE='55000'; END IF;
  SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=p_project AND id=t.binding_id FOR UPDATE;
  IF b.state IN ('settled','lost') THEN RAISE EXCEPTION 'Its native session is settled' USING ERRCODE='40001'; END IF;
  IF k='input' AND b.state='stopping' THEN RAISE EXCEPTION 'Its native session is stopping' USING ERRCODE='40001'; END IF;
  IF k='stop' THEN
   -- One Stop at a time per binding: another request answers the unsettled one; nothing new is written.
   SELECT * INTO pending FROM sophia.owner_runner_operations WHERE project_id=p_project AND binding_id=t.binding_id AND kind='stop'
    AND state IN ('admitted','possible_send','received','unknown') ORDER BY created_at LIMIT 1;
   IF FOUND THEN RETURN sophia.owner_runner_receipt(pending); END IF;
  END IF;
  SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=t.goal_id FOR UPDATE;
  att:=t.attempt_id; bnd:=t.binding_id; thread:=t.native_thread_id;
 END IF;
 IF k IN ('create','input') THEN
  IF NOT (p_request ? 'expectedGoalRevision') OR NOT (p_request ? 'expectedAuthorityEpoch')
     OR jsonb_typeof(p_request->'expectedGoalRevision')<>'number' OR jsonb_typeof(p_request->'expectedAuthorityEpoch')<>'number'
     OR g.revision<>(p_request->>'expectedGoalRevision')::numeric OR g.authority_epoch<>(p_request->>'expectedAuthorityEpoch')::numeric THEN
   RAISE EXCEPTION 'Stale goal revision or epoch' USING ERRCODE='40001'; END IF;
  IF g.status NOT IN ('ready','running','checking') THEN RAISE EXCEPTION 'Goal not admitted for work' USING ERRCODE='40001'; END IF;
  msg:=p_request->>'message';
  IF msg IS NULL OR btrim(msg)='' OR length(msg)>8000 THEN RAISE EXCEPTION 'A create or input needs a message of at most 8000 characters' USING ERRCODE='22023'; END IF;
 ELSIF p_request ? 'message' THEN RAISE EXCEPTION 'A stop carries no message' USING ERRCODE='22023';
 END IF;
 IF k='create' THEN
  att:=gen_random_uuid(); bnd:=gen_random_uuid();
  INSERT INTO sophia.work_attempts(project_id,id,goal_id,goal_revision,authority_epoch,state)
   VALUES(p_project,att,g.id,g.revision,g.authority_epoch,'admitted');
  INSERT INTO sophia.execution_bindings(project_id,id,attempt_id,resource_id,runtime_unit_id,continuation_owner,state)
   VALUES(p_project,bnd,att,r.id,'owner-runner:t3','native_goal','launching');
 END IF;
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,state)
  VALUES(p_project,cmd,a,g.id,g.revision,g.authority_epoch,'runner.'||k,'runner:'||op,
   jsonb_build_object('kind','runner.'||k,'operationId',op,'payloadDigest',p_digest),'admitted');
 INSERT INTO sophia.outbox(project_id,id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch,cleanup)
  VALUES(p_project,ob,cmd,'runner.'||k,'operation/'||op,bnd,g.id,g.authority_epoch,k='stop');
 -- A follow-up and a Stop freeze their create's lineage (equal to the current route, checked above).
 INSERT INTO sophia.owner_runner_operations(project_id,id,owner_id,client_request_id,kind,qualification_id,qualification_revision,
  resource_id,goal_id,attempt_id,binding_id,command_id,outbox_id,target_operation_id,semantic,payload_digest,message,title,
  goal_revision,authority_epoch,member_revision,connection_id,connection_revision,resource_revision,adapter_pin,environment_ref,
  native_project_ref,profile_id,profile_revision,account_key,native_thread_id)
 VALUES(p_project,op,a,p_key,k,q.id,q.revision,r.id,g.id,att,bnd,cmd,ob,t.id,p_request,p_digest,msg,ttl,
  g.revision,g.authority_epoch,mrev,conn.id,conn.revision,r.revision,q.adapter_pin,q.environment_ref,
  q.native_project_ref,q.profile_id,q.profile_revision,q.account_key,thread)
 RETURNING * INTO o;
 IF k='stop' THEN
  PERFORM sophia.owner_runner_fence(p_project,bnd);
 ELSE
  -- The allowance counts admitted new work, cumulatively: never refunded by a timeout, a Stop or a retry.
  UPDATE sophia.owner_runner_qualifications SET used_operations=used_operations+1 WHERE project_id=p_project AND id=q.id;
 END IF;
 PERFORM sophia.owner_runner_event(o,'runner_operation.admitted');
 RETURN sophia.owner_runner_receipt(o);
END $$;

-- Why an admitted operation may no longer be sent, or null when it may. Checked by prepare-send, under the locks.
-- r2 (R1-F06): every frozen revision is compared: goal revision and epoch, member revision and role, resource,
-- connection (and its expiry) and qualification. (R1-F05): a `stopping`, settled or lost binding takes no new work.
-- (R1-F07): the frozen route is the binding's create's (admission checked), so a requalification revokes the old one
-- and its operations are denied here, never moved to the new account or allowance. Source manifest, repository base,
-- settings and source withdrawal are not represented in this slice: goal epoch is not source withdrawal.
CREATE FUNCTION sophia.owner_runner_ineligible(o sophia.owner_runner_operations) RETURNS text LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.goals; r sophia.executor_resources; conn sophia.execution_connections; q sophia.owner_runner_qualifications;
 b sophia.execution_bindings; m sophia.project_members;
BEGIN
 SELECT * INTO g FROM sophia.goals WHERE project_id=o.project_id AND id=o.goal_id;
 IF o.kind<>'stop' THEN
  IF g.authority_epoch<>o.authority_epoch THEN RETURN 'the goal''s authority epoch moved on'; END IF;
  IF g.revision<>o.goal_revision THEN RETURN 'the goal changed since it was admitted'; END IF;
  IF g.status NOT IN ('ready','running','checking') THEN RETURN 'the goal is '||g.status; END IF;
 END IF;
 SELECT * INTO m FROM sophia.project_members WHERE project_id=o.project_id AND actor_id=o.owner_id;
 IF NOT FOUND OR NOT m.active OR m.role NOT IN ('admin','editor') THEN RETURN 'the owner can no longer start work here'; END IF;
 IF m.revision<>o.member_revision THEN RETURN 'the owner''s membership changed since it was admitted'; END IF;
 SELECT * INTO r FROM sophia.executor_resources WHERE project_id=o.project_id AND id=o.resource_id;
 IF r.state<>'active' OR r.owner_id<>o.owner_id OR r.revision<>o.resource_revision THEN RETURN 'the resource changed or was revoked'; END IF;
 SELECT * INTO conn FROM sophia.execution_connections WHERE id=o.connection_id;
 IF conn.state<>'linked' OR conn.revision<>o.connection_revision OR r.connection_id IS DISTINCT FROM o.connection_id THEN
  RETURN 'the connection changed or was revoked'; END IF;
 IF conn.expires_at IS NOT NULL AND conn.expires_at<=now() THEN RETURN 'the connection''s authentication expired'; END IF;
 SELECT * INTO q FROM sophia.owner_runner_qualifications WHERE project_id=o.project_id AND id=o.qualification_id;
 IF q.revoked_at IS NOT NULL OR q.expires_at<=now() OR q.revision<>o.qualification_revision OR NOT (o.kind=ANY(q.operations))
    OR q.account_key<>o.account_key OR q.profile_id<>o.profile_id OR q.profile_revision<>o.profile_revision
    OR q.environment_ref<>o.environment_ref OR q.adapter_pin<>o.adapter_pin THEN
  RETURN 'the route''s qualification was revoked, expired or changed'; END IF;
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=o.project_id AND id=o.binding_id;
 IF b.state IN ('settled','lost') THEN RETURN 'its native session is settled'; END IF;
 IF o.kind<>'stop' AND b.state='stopping' THEN RETURN 'its native session is stopping'; END IF;
 RETURN NULL;
END $$;

-- Release the account's reservation once no operation of the binding is unsettled.
CREATE FUNCTION sophia.owner_runner_release(o sophia.owner_runner_operations) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sophia.owner_runner_operations x WHERE x.project_id=o.project_id AND x.binding_id=o.binding_id
   AND x.state IN ('possible_send','unknown','received')) THEN
  DELETE FROM sophia.owner_runner_reservations WHERE account_key=o.account_key AND project_id=o.project_id AND binding_id=o.binding_id;
 END IF;
END $$;

-- A create that never ran, or a stop that settled, ends its binding; nothing else does.
CREATE FUNCTION sophia.owner_runner_end_binding(o sophia.owner_runner_operations, p_attempt_state text) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.execution_bindings SET state='settled', observed_at=now() WHERE project_id=o.project_id AND id=o.binding_id AND state<>'lost';
 UPDATE sophia.work_attempts SET state=p_attempt_state WHERE project_id=o.project_id AND id=o.attempt_id AND state NOT IN ('accepted','failed','stopped');
END $$;

-- One owner runner's claim: only its owner's operations bound to its native environment. A gateway can answer only
-- for what it journaled, so an operation is never sent, reconciled or observed through another owner's runner.
-- p_new_work (r3, R2-F08), required: false claims only runner.stop rows. Turning new work off never strands a Stop that
-- was already admitted under every one of its checks; it claims no create or input.
CREATE FUNCTION sophia.claim_owner_runner_outbox(p_worker text, p_owner uuid, p_environment text, p_new_work boolean,
 p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 60)
RETURNS SETOF sophia.outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF p_worker IS NULL OR length(p_worker) NOT BETWEEN 1 AND 160 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 300 OR p_owner IS NULL OR p_environment IS NULL
    OR p_new_work IS NULL THEN
  RAISE EXCEPTION 'Invalid claim bounds' USING ERRCODE='22023'; END IF;
 RETURN QUERY WITH eligible AS (
  SELECT o.project_id,o.id FROM sophia.outbox o
  JOIN sophia.owner_runner_operations op ON op.project_id=o.project_id AND op.outbox_id=o.id
  WHERE o.state='pending' AND o.available_at<=now()
   AND (o.destination='runner.stop' OR (p_new_work AND o.destination IN ('runner.create','runner.input')))
   AND op.owner_id=p_owner AND op.environment_ref=p_environment
  ORDER BY o.cleanup DESC,o.available_at,o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT p_limit
 ) UPDATE sophia.outbox o SET state='dispatching',lease_owner=p_worker,lease_token=gen_random_uuid(),
   lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=o.attempts+1
 FROM eligible e WHERE o.project_id=e.project_id AND o.id=e.id RETURNING o.*;
END $$;

-- Recheck current authority under the locks and either deny, defer, or mark the possible send and return the envelope.
-- Committed before the gateway is called: a crash after this commit leaves the operation possibly sent.
CREATE FUNCTION sophia.owner_runner_prepare_send(p_project uuid, p_outbox uuid, p_lease uuid, p_journal uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE ob sophia.outbox; o sophia.owner_runner_operations; why text; res sophia.owner_runner_reservations;
BEGIN
 IF p_journal IS NULL THEN RAISE EXCEPTION 'A send must name the gateway journal it goes through' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO ob FROM sophia.outbox WHERE project_id=p_project AND id=p_outbox FOR UPDATE;
 IF NOT FOUND OR ob.destination NOT IN ('runner.create','runner.input','runner.stop') THEN
  RAISE EXCEPTION 'Outbox row not found' USING ERRCODE='22023'; END IF;
 IF ob.state<>'dispatching' OR ob.lease_token IS DISTINCT FROM p_lease THEN
  RAISE EXCEPTION 'Lease lost; reconcile before recording' USING ERRCODE='40001'; END IF;
 IF ob.lease_until<clock_timestamp() THEN
  UPDATE sophia.outbox SET state='outcome_unknown' WHERE project_id=p_project AND id=p_outbox;
  RETURN jsonb_build_object('result','expired','reason','the dispatch lease expired before the send was prepared');
 END IF;
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=p_project AND outbox_id=p_outbox FOR UPDATE;
 IF o.state<>'admitted' THEN RAISE EXCEPTION 'Operation is not waiting to be sent' USING ERRCODE='40001'; END IF;
 why:=sophia.owner_runner_ineligible(o);
 IF why IS NOT NULL THEN
  UPDATE sophia.owner_runner_operations SET state='denied', reason=left(why,500), revision=revision+1
   WHERE project_id=p_project AND id=o.id RETURNING * INTO o;
  UPDATE sophia.outbox SET state='denied', lease_until=NULL, outcome_reason=left(why,500) WHERE project_id=p_project AND id=p_outbox;
  UPDATE sophia.commands SET state='denied' WHERE project_id=p_project AND id=o.command_id;
  IF o.kind='create' THEN PERFORM sophia.owner_runner_end_binding(o,'failed'); END IF;
  PERFORM sophia.owner_runner_release(o);
  PERFORM sophia.owner_runner_event(o,'runner_operation.denied');
  RETURN jsonb_build_object('result','denied','reason',why);
 END IF;
 -- A stop starts no inference: it never waits behind the account's reservation. A create or input takes it, or waits.
 IF o.kind<>'stop' THEN
  INSERT INTO sophia.owner_runner_reservations(account_key,project_id,binding_id) VALUES(o.account_key,p_project,o.binding_id)
   ON CONFLICT (account_key) DO NOTHING;
  SELECT * INTO res FROM sophia.owner_runner_reservations WHERE account_key=o.account_key FOR UPDATE;
 END IF;
 IF o.kind<>'stop' AND (res.project_id<>p_project OR res.binding_id<>o.binding_id) THEN
  UPDATE sophia.owner_runner_operations SET deferrals=deferrals+1, reason='waiting: the account is busy with another assignment'
   WHERE project_id=p_project AND id=o.id;
  UPDATE sophia.outbox SET state='pending', lease_token=NULL, lease_until=NULL, available_at=now()+interval '5 seconds'
   WHERE project_id=p_project AND id=p_outbox;
  RETURN jsonb_build_object('result','deferred','reason','the account is busy with another assignment');
 END IF;
 -- Bound to the journal it goes through (R1-F01): only that journal can later prove it was never sent.
 UPDATE sophia.owner_runner_operations SET state='possible_send', possible_send_at=now(), reason=NULL, gateway_journal_id=p_journal,
  revision=revision+1 WHERE project_id=p_project AND id=o.id RETURNING * INTO o;
 UPDATE sophia.commands SET state='dispatching' WHERE project_id=p_project AND id=o.command_id AND state='admitted';
 PERFORM sophia.owner_runner_event(o,'runner_operation.sending');
 RETURN jsonb_build_object('result','send','envelope',sophia.owner_runner_envelope(o));
END $$;

-- Record what the gateway answered for a send (under its lease), a reconciliation or an observation (no lease).
CREATE FUNCTION sophia.owner_runner_record(p_project uuid, p_operation uuid, p_lease uuid, p_journal uuid, p_answer jsonb)
RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.owner_runner_operations; ob sophia.outbox; k text:=p_answer->>'kind'; ident jsonb:=p_answer->'identity';
 ans_delivery text; ans_terminal boolean; ans_status text; ans_reason text:=left(nullif(p_answer->>'reason',''),500);
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=p_project AND id=p_operation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Operation not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO ob FROM sophia.outbox WHERE project_id=p_project AND id=o.outbox_id FOR UPDATE;
 IF p_lease IS NOT NULL AND (ob.lease_token IS DISTINCT FROM p_lease OR ob.state NOT IN ('dispatching','outcome_unknown')) THEN
  RAISE EXCEPTION 'Lease lost; reconcile before recording' USING ERRCODE='40001'; END IF;
 -- Only the journal it was bound to speaks for it (R1-F01): an answer from any other journal changes nothing.
 IF p_journal IS NULL OR o.gateway_journal_id IS DISTINCT FROM p_journal THEN
  RETURN jsonb_build_object('operationId',o.id,'state',o.state,'changed',false);
 END IF;
 -- There is no proof of no send (r3, R2-F01): a possibly-sent operation never returns to admitted. An answer of any
 -- other kind, `not_sent` included, is refused below as invalid and changes nothing.
 IF k IN ('received','rejected','refused','unknown','settled','conflict') AND o.state NOT IN ('possible_send','unknown') THEN
  RETURN jsonb_build_object('operationId',o.id,'state',o.state,'changed',false);
 END IF;
 -- Identities are the originals: once recorded, another one is a conflict, never an overwrite.
 IF ident IS NOT NULL AND jsonb_typeof(ident)='object' THEN
  IF (o.native_namespace IS NOT NULL AND o.native_namespace<>ident->>'namespace')
     OR (o.native_command_id IS NOT NULL AND o.native_command_id<>ident->>'commandId')
     OR (o.kind<>'create' AND o.native_thread_id<>ident->>'threadId') THEN
   UPDATE sophia.owner_runner_operations SET state='unknown', reason='the gateway answered with other native identities',
    reconcile_attempts=reconcile_attempts+1, followed_at=now(), revision=revision+1 WHERE project_id=p_project AND id=o.id RETURNING * INTO o;
   PERFORM sophia.owner_runner_event(o,'runner_operation.updated');
   RETURN jsonb_build_object('operationId',o.id,'state',o.state,'changed',true);
  END IF;
  UPDATE sophia.owner_runner_operations SET native_namespace=ident->>'namespace', native_command_id=ident->>'commandId',
   native_message_id=ident->>'messageId', native_thread_id=ident->>'threadId' WHERE project_id=p_project AND id=o.id RETURNING * INTO o;
 END IF;
 CASE k
 WHEN 'received' THEN
  ans_delivery:=p_answer->>'delivery';
  IF ans_delivery IS NULL OR ans_delivery NOT IN ('started','queued','stop_requested','no_active_run','already_ended') OR o.native_thread_id IS NULL THEN
   RAISE EXCEPTION 'Invalid runner receipt' USING ERRCODE='22023'; END IF;
  -- A receipt, never settlement (R1-F04): even a Stop answered no_active_run or already_ended stays received until a
  -- proven observation; nothing here ends the binding or releases its reservation.
  UPDATE sophia.owner_runner_operations SET native_delivery=ans_delivery, native_run_id=nullif(p_answer->>'runId',''),
   state='received', reason=NULL, received_at=now(), followed_at=now(), revision=revision+1
   WHERE project_id=p_project AND id=o.id RETURNING * INTO o;
  UPDATE sophia.outbox SET state='acknowledged', lease_token=NULL, lease_until=NULL WHERE project_id=p_project AND id=ob.id;
  UPDATE sophia.commands SET state='acknowledged' WHERE project_id=p_project AND id=o.command_id;
  IF o.kind='create' THEN
   UPDATE sophia.execution_bindings SET state='running', native_session_id=o.native_thread_id, observed_at=now()
    WHERE project_id=p_project AND id=o.binding_id AND state IN ('launching','idle','running');
   UPDATE sophia.work_attempts SET state='running' WHERE project_id=p_project AND id=o.attempt_id AND state='admitted';
  END IF;
 WHEN 'rejected', 'refused' THEN
  UPDATE sophia.owner_runner_operations SET state=CASE k WHEN 'rejected' THEN 'rejected' ELSE 'denied' END,
   reason=left(CASE k WHEN 'rejected' THEN 'T3 refused it ('||coalesce(p_answer->>'code','unknown')||'): ' ELSE 'the owner gateway refused it: ' END
    ||coalesce(ans_reason,'no reason'),500), followed_at=now(), revision=revision+1
   WHERE project_id=p_project AND id=o.id RETURNING * INTO o;
  UPDATE sophia.outbox SET state='denied', lease_token=NULL, lease_until=NULL, outcome_reason=o.reason WHERE project_id=p_project AND id=ob.id;
  UPDATE sophia.commands SET state='denied' WHERE project_id=p_project AND id=o.command_id;
  IF o.kind='create' THEN PERFORM sophia.owner_runner_end_binding(o,'failed'); END IF;
 WHEN 'unknown', 'conflict' THEN
  IF o.state='unknown' THEN
   -- Still unknown: counted and followed, no new revision or event for the same uncertainty.
   UPDATE sophia.owner_runner_operations SET reconcile_attempts=reconcile_attempts+1, followed_at=now()
    WHERE project_id=p_project AND id=o.id;
   RETURN jsonb_build_object('operationId',o.id,'state',o.state,'changed',false);
  END IF;
  UPDATE sophia.owner_runner_operations SET state='unknown', reason=coalesce(ans_reason,'no certain answer'), followed_at=now(),
   revision=revision+1 WHERE project_id=p_project AND id=o.id RETURNING * INTO o;
  UPDATE sophia.outbox SET state='outcome_unknown', lease_token=NULL, lease_until=NULL WHERE project_id=p_project AND id=ob.id;
  UPDATE sophia.commands SET state='outcome_unknown' WHERE project_id=p_project AND id=o.command_id;
 WHEN 'settled' THEN
  IF o.kind<>'stop' THEN RAISE EXCEPTION 'Only a stop settles by observation' USING ERRCODE='22023'; END IF;
  UPDATE sophia.owner_runner_operations SET state='settled', reason=coalesce(ans_reason,'no active run observed'), settled_at=now(),
   followed_at=now(), revision=revision+1 WHERE project_id=p_project AND id=o.id RETURNING * INTO o;
  UPDATE sophia.outbox SET state='settled', lease_token=NULL, lease_until=NULL WHERE project_id=p_project AND id=ob.id;
  UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=o.command_id;
  PERFORM sophia.owner_runner_end_binding(o,'stopped');
 WHEN 'run', 'no_active_run', 'unobserved' THEN
  IF o.state<>'received' THEN RETURN jsonb_build_object('operationId',o.id,'state',o.state,'changed',false); END IF;
  ans_status:=CASE k WHEN 'run' THEN p_answer->>'status' WHEN 'no_active_run' THEN 'no_active_run' END;
  ans_terminal:=k='no_active_run' OR (k='run' AND (p_answer->>'terminal')::boolean);
  IF NOT ans_terminal THEN
   IF ans_status IS NULL OR ans_status IS NOT DISTINCT FROM o.run_status THEN
    UPDATE sophia.owner_runner_operations SET followed_at=now() WHERE project_id=p_project AND id=o.id;
    RETURN jsonb_build_object('operationId',o.id,'state',o.state,'changed',false);
   END IF;
   UPDATE sophia.owner_runner_operations SET followed_at=now(), run_status=left(ans_status,40), revision=revision+1
    WHERE project_id=p_project AND id=o.id RETURNING * INTO o;
   PERFORM sophia.owner_runner_event(o,'runner_operation.updated');
   RETURN jsonb_build_object('operationId',o.id,'state',o.state,'changed',true);
  END IF;
  UPDATE sophia.owner_runner_operations SET state='settled', run_status=left(ans_status,40), settled_at=now(), followed_at=now(), revision=revision+1
   WHERE project_id=p_project AND id=o.id RETURNING * INTO o;
  UPDATE sophia.outbox SET state='settled' WHERE project_id=p_project AND id=ob.id AND state='acknowledged';
  UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=o.command_id AND state='acknowledged';
  IF o.kind='stop' THEN PERFORM sophia.owner_runner_end_binding(o,'stopped'); END IF;
 ELSE
  RAISE EXCEPTION 'Invalid runner answer' USING ERRCODE='22023';
 END CASE;
 PERFORM sophia.owner_runner_release(o);
 PERFORM sophia.owner_runner_event(o,'runner_operation.updated');
 RETURN jsonb_build_object('operationId',o.id,'state',o.state,'changed',true);
END $$;

-- Expired leases and superseded rows. Never possibly sent (still admitted): requeued. Possibly sent: unknown. Superseded
-- by a goal Hold/Stop before it was sent: denied.
CREATE FUNCTION sophia.owner_runner_maintain(p_limit integer DEFAULT 50) RETURNS integer LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE x record; o sophia.owner_runner_operations; n integer:=0;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid bound' USING ERRCODE='22023'; END IF;
 FOR x IN SELECT ob.project_id, ob.id AS outbox_id, ob.state AS outbox_state, op.id AS op_id, op.state AS op_state FROM sophia.outbox ob
   JOIN sophia.owner_runner_operations op ON op.project_id=ob.project_id AND op.outbox_id=ob.id
   WHERE ob.destination IN ('runner.create','runner.input','runner.stop')
    AND ((ob.state='dispatching' AND ob.lease_until<clock_timestamp())
     OR (ob.state='outcome_unknown' AND op.state IN ('admitted','possible_send'))
     OR (ob.state IN ('superseded','denied') AND op.state='admitted'))
   ORDER BY ob.created_at LIMIT p_limit FOR UPDATE OF ob, op SKIP LOCKED
 LOOP
  IF x.outbox_state IN ('superseded','denied') THEN
   UPDATE sophia.owner_runner_operations SET state='denied', reason='the goal was held or stopped before it was sent', revision=revision+1
    WHERE project_id=x.project_id AND id=x.op_id RETURNING * INTO o;
   UPDATE sophia.commands SET state='denied' WHERE project_id=o.project_id AND id=o.command_id AND state IN ('admitted','dispatching');
   IF o.kind='create' THEN PERFORM sophia.owner_runner_end_binding(o,'failed'); END IF;
   PERFORM sophia.owner_runner_event(o,'runner_operation.denied');
  ELSIF x.op_state='admitted' THEN
   UPDATE sophia.outbox SET state='pending', lease_token=NULL, lease_until=NULL, available_at=now()+interval '1 second'
    WHERE project_id=x.project_id AND id=x.outbox_id;
  ELSIF x.op_state='possible_send' THEN
   UPDATE sophia.owner_runner_operations SET state='unknown', reason='the dispatch lease expired after a possible send', revision=revision+1
    WHERE project_id=x.project_id AND id=x.op_id RETURNING * INTO o;
   UPDATE sophia.outbox SET state='outcome_unknown', lease_token=NULL, lease_until=NULL WHERE project_id=x.project_id AND id=x.outbox_id;
   UPDATE sophia.commands SET state='outcome_unknown' WHERE project_id=o.project_id AND id=o.command_id;
   PERFORM sophia.owner_runner_event(o,'runner_operation.updated');
  ELSE
   UPDATE sophia.outbox SET state='outcome_unknown', lease_token=NULL, lease_until=NULL WHERE project_id=x.project_id AND id=x.outbox_id;
  END IF;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;

-- One owner runner's operations to reconcile (unknown) or observe (received), each with its envelope; the least
-- recently followed first.
CREATE FUNCTION sophia.owner_runner_followups(p_owner uuid, p_environment text, p_journal uuid, p_limit integer DEFAULT 20,
 p_min_age_seconds integer DEFAULT 10)
RETURNS TABLE(project_id uuid, operation_id uuid, kind text, state text, envelope jsonb) LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
#variable_conflict use_column
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_min_age_seconds IS NULL OR p_min_age_seconds NOT BETWEEN 0 AND 3600
    OR p_owner IS NULL OR p_environment IS NULL OR p_journal IS NULL THEN
  RAISE EXCEPTION 'Invalid bound' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT o.project_id, o.id, o.kind, o.state, sophia.owner_runner_envelope(o) FROM sophia.owner_runner_operations o
  -- Only operations bound to this runner's journal: one bound to a replaced journal stays unknown, visibly.
  WHERE o.state IN ('unknown','received') AND o.owner_id=p_owner AND o.environment_ref=p_environment
   AND o.gateway_journal_id=p_journal
   AND (o.followed_at IS NULL OR o.followed_at<=now()-make_interval(secs=>p_min_age_seconds))
  ORDER BY o.followed_at NULLS FIRST, o.created_at LIMIT p_limit;
END $$;

REVOKE ALL ON FUNCTION sophia.owner_runner_event(sophia.owner_runner_operations,text),
 sophia.owner_runner_receipt(sophia.owner_runner_operations), sophia.owner_runner_envelope(sophia.owner_runner_operations),
 sophia.owner_runner_ineligible(sophia.owner_runner_operations), sophia.owner_runner_release(sophia.owner_runner_operations),
 sophia.owner_runner_end_binding(sophia.owner_runner_operations,text),
 sophia.owner_runner_same_route(sophia.owner_runner_operations,sophia.owner_runner_qualifications,sophia.execution_connections,sophia.executor_resources),
 sophia.owner_runner_fence(uuid,uuid),
 sophia.admit_owner_runner_operation(uuid,text,jsonb,text), sophia.claim_owner_runner_outbox(text,uuid,text,boolean,integer,integer),
 sophia.owner_runner_prepare_send(uuid,uuid,uuid,uuid), sophia.owner_runner_record(uuid,uuid,uuid,uuid,jsonb),
 sophia.owner_runner_maintain(integer), sophia.owner_runner_followups(uuid,text,uuid,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.admit_owner_runner_operation(uuid,text,jsonb,text) TO sophia_api;
GRANT EXECUTE ON FUNCTION sophia.claim_owner_runner_outbox(text,uuid,text,boolean,integer,integer), sophia.owner_runner_prepare_send(uuid,uuid,uuid,uuid),
 sophia.owner_runner_record(uuid,uuid,uuid,uuid,jsonb), sophia.owner_runner_maintain(integer), sophia.owner_runner_followups(uuid,text,uuid,integer,integer)
 TO sophia_worker;

COMMIT;
