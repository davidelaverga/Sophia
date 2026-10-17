-- 0075 Completed-goal session retirement (FND-C-TERMINAL-SESSION-RECOVERY-IMPLEMENTATION-01, A41; D-RECOVERY).
-- A project admin retires the native sessions still attached to a COMPLETED goal: one admitted command, kind
-- retire_sessions, its own request, idempotency and audit; each target is fenced by the runtime's existing recorded stop.
-- The goal stays completed at its revision; only its authority epoch and state revision move (the fence), so older
-- grants are stale. Nothing resumes, replays, creates or deletes; the work, review, jobs, attempts, grants and costs
-- are not touched. Ordinary Stop (admit_goal_command, can_edit) is unchanged.
-- Two latest definitions are replaced, each byte-for-byte plus one marked insertion (RETIRE-*-BEGIN/END):
--   dispatch_runtime_outbox (latest 0064), RETIRE-KIND: a retire_sessions cleanup row is sent as the runtime's stop;
--   runtime_hello (latest 0071, carrying A40), RETIRE-HELLO: a completed goal retired at its current epoch reports its
--   bindings stopped, never active, so a restart cannot bring them back.

BEGIN;

CREATE FUNCTION sophia.admit_session_retirement(p_project uuid,p_goal uuid,p_key text,p_expected_revision bigint,p_expected_epoch bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); g sophia.goals; prior sophia.commands; semantic jsonb;
 cmd uuid:=gen_random_uuid(); cursor_value bigint; receipt_value jsonb; b record; targets jsonb:='[]'::jsonb;
BEGIN
 -- The narrowest existing owner predicate: an active project admin, from the verified actor (0010).
 IF NOT sophia.is_admin(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.is_admin(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=p_goal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Goal not found' USING ERRCODE='22023'; END IF;
 semantic:=jsonb_build_object('kind','retire_sessions','goalId',p_goal,'expectedGoalRevision',p_expected_revision,'expectedAuthorityEpoch',p_expected_epoch,'bodySourceId',NULL);
 SELECT * INTO prior FROM sophia.commands WHERE project_id=p_project AND actor_id=a AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 IF p_expected_revision IS NULL OR p_expected_epoch IS NULL OR g.revision<>p_expected_revision OR g.authority_epoch<>p_expected_epoch THEN
  RAISE EXCEPTION 'Stale goal revision or epoch' USING ERRCODE='40001'; END IF;
 IF g.status<>'completed' THEN RAISE EXCEPTION 'Only a completed goal''s sessions are retired' USING ERRCODE='40001'; END IF;
 -- The fence: a new authority epoch (older grants and deliveries become stale); status and revision stay.
 UPDATE sophia.goals SET authority_epoch=authority_epoch+1, state_revision=state_revision+1
  WHERE project_id=p_project AND id=p_goal RETURNING * INTO g;
 UPDATE sophia.outbox SET state='superseded' WHERE project_id=p_project AND goal_id=p_goal AND state='pending' AND NOT cleanup;
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,body_source_id,state)
 VALUES(p_project,cmd,a,p_goal,g.revision,g.authority_epoch,'retire_sessions',p_key,semantic,NULL,'admitted');
 UPDATE sophia.projects SET event_sequence=event_sequence+1 WHERE id=p_project RETURNING event_sequence INTO cursor_value;
 INSERT INTO sophia.project_events(project_id,sequence,type,entity_type,entity_id,entity_revision,summary_code,actor_id)
 VALUES(p_project,cursor_value,'command.admitted','command',cmd,1,'command.retire_sessions',a);
 -- Every binding of the goal not yet settled, from the database: a stop for each (cleanup first in dispatch).
 FOR b IN SELECT eb.id, eb.attempt_id, eb.native_session_id FROM sophia.execution_bindings eb
   JOIN sophia.work_attempts wa ON wa.project_id=eb.project_id AND wa.id=eb.attempt_id
   WHERE wa.project_id=p_project AND wa.goal_id=p_goal AND eb.state<>'settled' ORDER BY eb.id
 LOOP
  INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch,cleanup)
   VALUES(p_project,cmd,'native.stop','binding/'||b.id,b.id,p_goal,g.authority_epoch,true);
  targets:=targets||jsonb_build_array(jsonb_build_object('bindingId',b.id,'attemptId',b.attempt_id,'nativeSessionId',b.native_session_id));
 END LOOP;
 IF jsonb_array_length(targets)=0 THEN INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,goal_id,authority_epoch,cleanup)
  VALUES(p_project,cmd,'control.settle','control/empty',p_goal,g.authority_epoch,true); END IF;
 receipt_value:=jsonb_build_object('commandId',cmd,'projectId',p_project,'cursor',cursor_value::text,'stage','admitted','goalId',p_goal,
  'goalRevision',g.revision,'authorityEpoch',g.authority_epoch,'targets',targets);
 UPDATE sophia.commands SET receipt=receipt_value WHERE project_id=p_project AND id=cmd;
 RETURN receipt_value;
END $$;
REVOKE ALL ON FUNCTION sophia.admit_session_retirement(uuid,uuid,text,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.admit_session_retirement(uuid,uuid,text,bigint,bigint) TO sophia_api;

-- dispatch_runtime_outbox: latest 0064 byte for byte, plus RETIRE-KIND.
CREATE OR REPLACE FUNCTION sophia.dispatch_runtime_outbox(p_project uuid, p_outbox uuid, p_lease_token uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.outbox; g sophia.goals; c sophia.commands; b sophia.execution_bindings; rt sophia.runtime_instances; why text;
 kind text; payload jsonb:='{}'; next_seq bigint; command_body jsonb; rc_id uuid:=gen_random_uuid(); manifest jsonb; txt text;
 job_kind text; job_id uuid; base uuid; seed sophia.source_objects; design_job uuid;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO o FROM sophia.outbox WHERE project_id=p_project AND id=p_outbox FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outbox row not found' USING ERRCODE='22023'; END IF;
 IF o.state<>'dispatching' OR o.lease_token IS DISTINCT FROM p_lease_token THEN RAISE EXCEPTION 'Lease lost; reconcile before recording' USING ERRCODE='40001'; END IF;
 IF o.lease_until<clock_timestamp() THEN
  UPDATE sophia.outbox SET state='outcome_unknown' WHERE project_id=p_project AND id=p_outbox;
  RETURN jsonb_build_object('result','outcome_unknown','reason','the dispatch lease expired');
 END IF;
 -- CON-D1-BEGIN
 IF o.conversation_reply_id IS NOT NULL THEN RETURN sophia.conversation_dispatch(o); END IF;
 -- CON-D1-END
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=o.goal_id FOR UPDATE;
 SELECT * INTO c FROM sophia.commands WHERE project_id=p_project AND id=o.command_id FOR UPDATE;
 -- CON-D2-BEGIN
 IF g.id IS NULL THEN
  UPDATE sophia.outbox SET state='denied',lease_until=NULL,outcome_reason='delivery has no goal' WHERE project_id=p_project AND id=o.id;
  UPDATE sophia.commands SET state='denied' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
  RETURN jsonb_build_object('result','denied','reason','delivery has no goal');
 END IF;
 -- CON-D2-END
 IF o.destination='control.settle' THEN
  PERFORM sophia.settle_native_control(p_project,g.id);
  UPDATE sophia.outbox SET state='settled', lease_until=NULL WHERE project_id=p_project AND id=p_outbox;
  UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
  RETURN jsonb_build_object('result','settled');
 END IF;
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=p_project AND id=o.binding_id FOR UPDATE;
 SELECT * INTO rt FROM sophia.runtime_instances WHERE project_id=p_project AND resource_id=b.resource_id AND runtime_unit_id=b.runtime_unit_id AND state='active';
 IF o.cleanup THEN
  kind:=c.kind;  -- hold or stop (admit_goal_command writes native.stop rows for both)
  -- RETIRE-KIND-BEGIN (0075, A41): a completed goal's retire_sessions is sent as the runtime's existing stop
  IF kind='retire_sessions' THEN kind:='stop'; END IF;
  -- RETIRE-KIND-END
  IF b.state IN ('settled','lost') OR (b.state='created' AND NOT EXISTS(SELECT 1 FROM sophia.runtime_commands WHERE project_id=p_project AND binding_id=b.id)) THEN
   UPDATE sophia.execution_bindings SET state='settled' WHERE project_id=p_project AND id=b.id AND state<>'lost';
   UPDATE sophia.outbox SET state='settled', lease_until=NULL WHERE project_id=p_project AND id=p_outbox;
   UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
   PERFORM sophia.settle_native_control(p_project,g.id);
   RETURN jsonb_build_object('result','settled','reason','no native session to fence');
  END IF;
  IF rt.id IS NULL THEN RETURN sophia.deny_native_delivery(o,c,'no active runtime for its executor resource and runtime unit'); END IF;
 ELSE
  IF o.destination='native.steer' AND sophia.reviews_only(p_project,b.attempt_id) THEN RETURN sophia.pass_steer_by(o,c); END IF;
  why:=sophia.native_delivery_ineligible(o,g,c,b,rt);
  IF why IS NOT NULL THEN RETURN sophia.deny_native_delivery(o,c,why); END IF;
  why:=sophia.runtime_unavailable(rt);
  IF why IS NOT NULL THEN RETURN sophia.defer_native_delivery(o,c,why); END IF;
  kind:=substr(o.destination,8);
  IF kind='create' THEN
   SELECT j.kind, j.id, t.body::jsonb INTO job_kind, job_id, manifest FROM sophia.jobs j
    JOIN sophia.source_texts t ON t.project_id=j.project_id AND t.source_id=j.input_source_id
    WHERE j.project_id=p_project AND j.command_id=c.id;
   IF job_kind='research' THEN
    IF EXISTS(SELECT 1 FROM sophia.jobs j2 JOIN sophia.execution_bindings b2 ON b2.project_id=j2.project_id AND b2.attempt_id=j2.attempt_id
      JOIN sophia.work_attempts w2 ON w2.project_id=j2.project_id AND w2.id=j2.attempt_id
      JOIN sophia.goals g2 ON g2.project_id=w2.project_id AND g2.id=w2.goal_id
      WHERE j2.project_id=p_project AND j2.kind='research' AND j2.id<>job_id AND j2.state IN ('pending','running','outcome_unknown')
       AND b2.state IN ('launching','running','idle') AND g2.status IN ('ready','running','checking')) THEN
     RETURN sophia.defer_native_delivery(o,c,'waiting for the research worker: another research task is under way');
    END IF;
    base:=(manifest->'base'->>'sourceId')::uuid;
    IF base IS NOT NULL THEN
     SELECT t.body INTO txt FROM sophia.source_texts t WHERE t.project_id=p_project AND t.source_id=base;
     seed:=sophia.put_text_source(p_project,c.actor_id,'text/markdown; charset=utf-8',txt);
     INSERT INTO sophia.research_drafts(project_id,attempt_id,seq,call_key,source_id,sha256)
     VALUES(p_project,b.attempt_id,1,'base:'||(manifest->'base'->>'versionId'),seed.id,seed.sha256);
    END IF;
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->>'route','text',sophia.research_task_statement(p_project,manifest));
   ELSIF job_kind='design' THEN
    design_job:=job_id;
    IF NOT EXISTS(SELECT 1 FROM sophia.design_tasks dt WHERE dt.project_id=p_project AND dt.job_id=design_job AND dt.package_source_id IS NOT NULL) THEN
     RETURN sophia.deny_native_delivery(o,c,'the design has no frozen content package');
    END IF;
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->>'route','text',sophia.design_task_statement(manifest));
   ELSIF job_kind='design_review' THEN
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->>'route','text',sophia.review_task_statement(manifest));
   ELSIF job_kind='source_review' THEN
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->'route'->>'id','text',sophia.source_review_statement(manifest));
   ELSE
    payload:=jsonb_build_object('role','sophia-brief-v1','text',sophia.draft_brief_prompt(manifest));
   END IF;
  ELSIF kind IN ('steer','input') THEN
   SELECT t.body INTO txt FROM sophia.source_texts t WHERE t.project_id=p_project AND t.source_id=c.body_source_id;
   IF txt IS NULL THEN RETURN sophia.deny_native_delivery(o,c,'its instruction has no readable text'); END IF;
   payload:=jsonb_build_object('text',txt);
  END IF;
 END IF;
 UPDATE sophia.runtime_instances SET command_sequence=command_sequence+1 WHERE id=rt.id RETURNING command_sequence INTO next_seq;
 command_body:=jsonb_build_object('schema','sophia.runtime-command.v1','commandId',rc_id,
  'binding',jsonb_build_object('projectId',p_project,'goalId',g.id,'goalRevision',g.revision,'attemptId',b.attempt_id,
   'resourceId',b.resource_id,'authorityEpoch',o.authority_epoch,'runtimeUnitId',b.runtime_unit_id),
  'kind',kind,'expectedNativeSessionId',CASE WHEN kind='resume' THEN to_jsonb(b.native_session_id) ELSE 'null'::jsonb END,
  'contextPacketId',CASE WHEN kind='create' THEN to_jsonb((SELECT input_source_id::text FROM sophia.jobs WHERE project_id=p_project AND command_id=c.id)) ELSE 'null'::jsonb END,
  'payload',payload);
 INSERT INTO sophia.runtime_commands(project_id,runtime_id,seq,id,outbox_id,command_id,binding_id,attempt_id,kind,authority_epoch,body)
 VALUES(p_project,rt.id,next_seq,rc_id,o.id,c.id,b.id,b.attempt_id,kind,o.authority_epoch,command_body);
 UPDATE sophia.outbox SET state='acknowledged', lease_until=NULL, outcome_reason=NULL WHERE project_id=p_project AND id=p_outbox;
 UPDATE sophia.commands SET state='dispatching' WHERE project_id=p_project AND id=c.id AND state='admitted';
 IF kind='create' THEN
  UPDATE sophia.execution_bindings SET state='launching' WHERE project_id=p_project AND id=b.id AND state='created';
  UPDATE sophia.jobs SET reason=NULL WHERE project_id=p_project AND command_id=c.id AND state='pending'
   AND (reason LIKE 'waiting for Sophia''s runtime%' OR reason LIKE 'waiting for the research worker%');
 END IF;
 RETURN jsonb_build_object('result','enqueued','runtimeId',rt.id,'seq',next_seq,'runtimeCommandId',rc_id);
END $$;

-- runtime_hello: latest 0071 byte for byte, plus RETIRE-HELLO.
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

COMMIT;
