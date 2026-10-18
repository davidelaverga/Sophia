-- FND-B2 (V's provenance disposition; amendment A35): what a conversation reply attempt was dispatched to run as, kept
-- immutably, so its end can be told apart once its create body is scrubbed. Its grant, runtime unit and hello change;
-- none of them can say afterwards whether an attempt ran in-process as a no-home service call or as a native child.
-- * A grant lineage's execution is native unless its operator pins it to service, once, with the route and the digest
--   of the exact service-only executor artifact closure (conversation_pin_execution): the pinned tuple, and a service
--   lineage's route, never change after. A lineage that has dispatched is not pinned anew.
-- * conversation_dispatch copies the grant's {execution, routeId, executorArtifactDigest} to a per-attempt row in the
--   same transaction as the create command, before anything runs; a service create carries the tuple, and a service
--   attempt's hello binding projects it. The row is content-free, never scrubbed, and cannot be updated, deleted or
--   truncated; no login reads or writes it.
-- * A runtime receipt may claim its executor (RuntimeReceipt.executor). On a conversation attempt it is checked against
--   the stored row: a service attempt's checked retire requires the exact service tuple (omission, a native claim, or
--   another route or digest refuses, and the cleanup stays owed); a native or unknown attempt refuses any service claim;
--   a replay under the same command and stage cannot change the claim.
-- Existing attempts keep no row (unknown) and are never reclassified. Reservations, uncertainty, history and published
-- answers are untouched. 0001–0064 are not edited.
BEGIN;

-- A grant lineage's execution: native, or service pinned with its route and executor artifact digest.
ALTER TABLE sophia.conversation_grants
 ADD COLUMN execution text NOT NULL DEFAULT 'native' CHECK(execution IN ('native','service')),
 ADD COLUMN executor_artifact_digest text CHECK(executor_artifact_digest IS NULL OR executor_artifact_digest ~ '^[0-9a-f]{64}$'),
 ADD COLUMN execution_pinned_at timestamptz,
 ADD CONSTRAINT conversation_grants_execution_pinned CHECK(
  (execution='native' AND executor_artifact_digest IS NULL AND execution_pinned_at IS NULL)
  OR (execution='service' AND executor_artifact_digest IS NOT NULL AND execution_pinned_at IS NOT NULL));

-- Pinned once: the tuple never changes after, nor a service lineage's route; only the pin function sets it.
CREATE FUNCTION sophia.conversation_grant_execution_kept() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF OLD.execution_pinned_at IS NOT NULL AND (NEW.execution,NEW.executor_artifact_digest,NEW.execution_pinned_at)
    IS DISTINCT FROM (OLD.execution,OLD.executor_artifact_digest,OLD.execution_pinned_at) THEN
  RAISE EXCEPTION 'execution_is_fixed' USING ERRCODE='55000'; END IF;
 IF OLD.execution='service' AND NEW.route_id IS DISTINCT FROM OLD.route_id THEN
  RAISE EXCEPTION 'route_is_fixed' USING ERRCODE='55000'; END IF;
 IF OLD.execution_pinned_at IS NULL AND NEW.execution_pinned_at IS NOT NULL
    AND current_setting('sophia.pinning_execution',true) IS DISTINCT FROM NEW.lineage_id::text THEN
  RAISE EXCEPTION 'execution_pinned_elsewhere' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_grant_execution_kept() FROM PUBLIC;
CREATE TRIGGER conversation_grants_execution_kept BEFORE UPDATE ON sophia.conversation_grants
 FOR EACH ROW EXECUTE FUNCTION sophia.conversation_grant_execution_kept();

ALTER TABLE sophia.conversation_grant_approvals DROP CONSTRAINT conversation_grant_approvals_used_by_check,
 ADD CONSTRAINT conversation_grant_approvals_used_by_check CHECK(used_by IN ('new_lineage','set_grant','pin_execution'));

-- Each attempt's original execution, as dispatched.
CREATE TABLE sophia.conversation_dispatch_provenance (
 project_id uuid NOT NULL, attempt_id uuid NOT NULL, reply_id uuid NOT NULL, runtime_command_id uuid NOT NULL,
 lineage_id uuid NOT NULL,
 execution text NOT NULL CHECK(execution IN ('native','service')),
 route_id text NOT NULL CHECK(route_id ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
 executor_artifact_digest text CHECK(executor_artifact_digest IS NULL OR executor_artifact_digest ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,attempt_id), UNIQUE(project_id,runtime_command_id),
 CHECK((execution='service')=(executor_artifact_digest IS NOT NULL)),
 FOREIGN KEY(project_id,attempt_id) REFERENCES sophia.work_attempts(project_id,id),
 FOREIGN KEY(project_id,reply_id) REFERENCES sophia.conversation_replies(project_id,id),
 FOREIGN KEY(project_id,runtime_command_id) REFERENCES sophia.runtime_commands(project_id,id),
 FOREIGN KEY(project_id,lineage_id) REFERENCES sophia.conversation_grants(project_id,lineage_id)
);
CREATE FUNCTION sophia.conversation_dispatch_provenance_kept() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
BEGIN
 RAISE EXCEPTION 'conversation provenance is kept as dispatched' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_dispatch_provenance_kept() FROM PUBLIC;
CREATE TRIGGER conversation_dispatch_provenance_kept BEFORE UPDATE OR DELETE ON sophia.conversation_dispatch_provenance
 FOR EACH ROW EXECUTE FUNCTION sophia.conversation_dispatch_provenance_kept();
CREATE TRIGGER conversation_dispatch_provenance_not_truncated BEFORE TRUNCATE ON sophia.conversation_dispatch_provenance
 FOR EACH STATEMENT EXECUTE FUNCTION sophia.conversation_dispatch_provenance_kept();
ALTER TABLE sophia.conversation_dispatch_provenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.conversation_dispatch_provenance FROM PUBLIC, sophia_api, sophia_worker;

-- Operator only: pin the current lineage to service, once, with its route and executor artifact digest, before it has
-- dispatched anything. A recorded approval, used once. Changing any of it later needs a new lineage.
CREATE FUNCTION sophia.conversation_pin_execution(p_project uuid, p_spec jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.conversation_grants;
BEGIN
 -- The project first, as a dispatch holds it (project → grant): a pin and a dispatch of the lineage never interleave, so
 -- an attempt is dispatched under the tuple its row records, and a lineage that has dispatched is seen as such.
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO g FROM sophia.conversation_grants WHERE project_id=p_project AND current FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'no_grant' USING ERRCODE='55000'; END IF;
 IF p_spec->>'lineageId' IS DISTINCT FROM g.lineage_id::text THEN RAISE EXCEPTION 'lineage_changed' USING ERRCODE='55000'; END IF;
 IF p_spec->>'execution' IS DISTINCT FROM 'service' OR p_spec->>'routeId' IS DISTINCT FROM g.route_id
    OR coalesce(p_spec->>'executorArtifactDigest','') !~ '^[0-9a-f]{64}$' OR coalesce(p_spec->>'approvalRef','') = '' THEN
  RAISE EXCEPTION 'invalid_pin' USING ERRCODE='22023'; END IF;
 IF g.execution_pinned_at IS NOT NULL THEN
  IF (g.execution,g.route_id,g.executor_artifact_digest)=('service',p_spec->>'routeId',p_spec->>'executorArtifactDigest')
     AND EXISTS(SELECT 1 FROM sophia.conversation_grant_approvals WHERE project_id=p_project
      AND approval_ref=p_spec->>'approvalRef' AND used_by='pin_execution' AND lineage_id=g.lineage_id) THEN
   RETURN jsonb_build_object('lineageId',g.lineage_id,'execution',g.execution,'routeId',g.route_id,
    'executorArtifactDigest',g.executor_artifact_digest);
  END IF;
  RAISE EXCEPTION 'execution_is_fixed' USING ERRCODE='55000';
 END IF;
 IF EXISTS(SELECT 1 FROM sophia.conversation_dispatch_provenance WHERE project_id=p_project AND lineage_id=g.lineage_id) THEN
  RAISE EXCEPTION 'lineage_dispatched' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.conversation_grant_approvals WHERE project_id=p_project AND approval_ref=p_spec->>'approvalRef') THEN
  RAISE EXCEPTION 'approval_reused' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.conversation_grant_approvals(project_id,approval_ref,lineage_id,used_by,spec_sha256)
 VALUES(p_project,p_spec->>'approvalRef',g.lineage_id,'pin_execution',encode(sha256(convert_to(p_spec::text,'UTF8')),'hex'));
 PERFORM set_config('sophia.pinning_execution',g.lineage_id::text,true);
 UPDATE sophia.conversation_grants SET execution='service',executor_artifact_digest=p_spec->>'executorArtifactDigest',
  execution_pinned_at=clock_timestamp()
  WHERE project_id=p_project AND lineage_id=g.lineage_id RETURNING * INTO g;
 PERFORM set_config('sophia.pinning_execution','',true);
 RETURN jsonb_build_object('lineageId',g.lineage_id,'execution',g.execution,'routeId',g.route_id,
  'executorArtifactDigest',g.executor_artifact_digest);
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_pin_execution(uuid,jsonb) FROM PUBLIC, sophia_api, sophia_worker;

-- A receipt's executor claim on a conversation attempt, against the stored provenance. Not a conversation attempt, or no
-- claim on a native or unknown attempt: as before. Malformed or contradicting: refused, nothing recorded.
CREATE FUNCTION sophia.conversation_receipt_executor_check(rc sophia.runtime_commands, r jsonb) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE p sophia.conversation_dispatch_provenance; ex jsonb:=r->'executor';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sophia.work_attempts WHERE project_id=rc.project_id AND id=rc.attempt_id
    AND conversation_reply_id IS NOT NULL) THEN
  IF ex IS NOT NULL AND ex<>'null'::jsonb THEN RAISE EXCEPTION 'Receipt executor names no conversation attempt' USING ERRCODE='42501'; END IF;
  RETURN;
 END IF;
 IF ex='null'::jsonb THEN ex:=NULL; END IF;
 IF ex IS NOT NULL AND (jsonb_typeof(ex)<>'object' OR coalesce(ex->>'execution','') NOT IN ('native','service')
    OR (ex->>'execution'='native' AND (SELECT count(*) FROM jsonb_object_keys(ex))<>1)
    OR (ex->>'execution'='service' AND ((SELECT count(*) FROM jsonb_object_keys(ex))<>3
     OR NOT ex ?& ARRAY['routeId','executorArtifactDigest']))) THEN
  RAISE EXCEPTION 'Receipt executor is malformed' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM sophia.conversation_dispatch_provenance WHERE project_id=rc.project_id AND attempt_id=rc.attempt_id;
 IF p.execution='service' THEN
  -- Stored service: a service claim must name exactly what was dispatched; a checked retire must make that claim.
  IF ex IS NOT NULL AND (ex->>'execution'<>'service' OR ex->>'routeId' IS DISTINCT FROM p.route_id
     OR ex->>'executorArtifactDigest' IS DISTINCT FROM p.executor_artifact_digest) THEN
   RAISE EXCEPTION 'Receipt executor contradicts the attempt''s provenance' USING ERRCODE='42501'; END IF;
  IF ex IS NULL AND rc.kind='retire' AND r->>'stage'='checked' THEN
   RAISE EXCEPTION 'A service attempt''s retire names its executor' USING ERRCODE='42501'; END IF;
 ELSIF ex->>'execution'='service' THEN
  -- Stored native, or none (unknown): never retired, or answered, as a service attempt.
  RAISE EXCEPTION 'Receipt claims a service executor for a native or unknown attempt' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_receipt_executor_check(sophia.runtime_commands,jsonb) FROM PUBLIC;

ALTER TABLE sophia.runtime_receipts ADD COLUMN executor jsonb;

-- conversation_dispatch (0064), replaced: the same, keeping the grant row it dispatches under and the attempt's provenance.
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
   UPDATE sophia.conversation_replies SET state='failed',reason='not_dispatched',settled_at=clock_timestamp()
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
  IF NOT rt.roles @> jsonb_build_array(jsonb_build_object('id','sophia-conversation-v1','route',payload->>'route')) THEN
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


-- runtime_hello (0064), replaced: the same, projecting a service attempt's provenance in its binding.
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


-- runtime_record_receipts (0016), replaced: the same, checking an executor claim and keeping it in the receipt's identity.
CREATE OR REPLACE FUNCTION sophia.runtime_record_receipts(p_token_sha256 bytea, p_unit text, p_bridge text, p_receipts jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_lease(p_token_sha256,p_unit,p_bridge); r jsonb; rc sophia.runtime_commands;
 b sophia.execution_bindings; n integer:=0; inserted boolean;
BEGIN
 FOR r IN SELECT value FROM jsonb_array_elements(p_receipts) LOOP
  SELECT * INTO rc FROM sophia.runtime_commands WHERE runtime_id=rt.id
   AND id=CASE WHEN r->>'commandId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'commandId')::uuid END;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt names a command this runtime was not sent' USING ERRCODE='42501'; END IF;
  IF coalesce(r->>'attemptId','')<>'' AND r->>'attemptId'<>rc.attempt_id::text THEN
   RAISE EXCEPTION 'Receipt names another attempt' USING ERRCODE='42501'; END IF;
  SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=rc.project_id AND id=rc.binding_id;
  -- 0067: an executor claim is checked against the server's own provenance, never taken from it.
  PERFORM sophia.conversation_receipt_executor_check(rc,r);
  IF r->>'nativeSessionId' IS NOT NULL AND r->>'nativeSessionId' IS DISTINCT FROM b.native_session_id THEN
   RAISE EXCEPTION 'Receipt names another native session' USING ERRCODE='42501'; END IF;
  -- 0067: a replay under the same command and stage cannot change the executor it claimed.
  IF EXISTS(SELECT 1 FROM sophia.runtime_receipts x WHERE x.project_id=rc.project_id AND x.runtime_command_id=rc.id
     AND x.stage=r->>'stage' AND x.executor IS DISTINCT FROM r->'executor') THEN
   RAISE EXCEPTION 'Receipt replay changes its executor' USING ERRCODE='23505'; END IF;
  INSERT INTO sophia.runtime_receipts(project_id,runtime_command_id,stage,native_session_id,native_sequence,evidence_refs,reason,observed_at,executor)
  VALUES(rc.project_id,rc.id,r->>'stage',r->>'nativeSessionId',(r->>'nativeSequence')::bigint,coalesce(r->'evidenceRefs','[]'),
   left(r->>'reason',16000),(r->>'observedAt')::timestamptz,r->'executor')
  ON CONFLICT DO NOTHING RETURNING true INTO inserted;
  IF inserted THEN
   PERFORM sophia.apply_runtime_receipt(rc,r->>'stage',r->>'reason'); n:=n+1;
   -- A command that grants authority has settled: a completed turn that arrived before this receipt is judged now.
   IF rc.kind IN ('create','resume','steer','input') AND r->>'stage' IN ('delivered','incorporation_observed') THEN
    PERFORM sophia.capture_completed_turns(rc.project_id,rc.binding_id);
   END IF;
  END IF;
  inserted:=false;
 END LOOP;
 RETURN n;
END $$;


COMMIT;
