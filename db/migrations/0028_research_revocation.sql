-- SMC-M03 S4 part 5 (plan §2.5, T19): revocation. When a source a research task consumed is withdrawn (a mission note
-- forgotten, its text erased), the work that read it cannot go on: the model's session holds that text.
-- * The attempt is revoked (a terminal attempt state), its task fails with reason "revoked", and its live session is
--   stopped through an ordinary native.stop cleanup. The hello reports a revoked attempt's binding as stopped, so a
--   restarted runtime never loads it, and resume, steer and input are refused for any attempt that consumed a source
--   no longer eligible.
-- * The task is rebuilt in the same transaction: a new attempt under the same goal and allowance, from the same
--   request with the withdrawn inputs removed and its lineage naming the task it replaces. Its draft is not carried
--   over (a draft may quote the withdrawn text); captures stay readable under the allowance.
-- * Goal placement: a goal that is working gets the rebuilt task queued at once; a held goal keeps it waiting until
--   Resume, and at Resume research that never started is queued (its resume rows, which would name a session that
--   does not exist, give way); a stopped or settling goal gets none.
-- * The consumed set is computed, not stored: a task's admitted inputs and the version it amends. Every other source a
--   task can read is its own capture or draft (research_readable, 0025), which no withdrawal reaches.
-- 0001–0027 are not edited; mission_erase_source, native_delivery_ineligible and runtime_hello are replaced with the
-- same signatures.
BEGIN;

ALTER TABLE sophia.work_attempts DROP CONSTRAINT work_attempts_state_check,
 ADD CONSTRAINT work_attempts_state_check CHECK(state IN ('admitted','running','checking','accepted','failed','held','stopped',
  'outcome_unknown','revoked'));

-- Revoked is terminal: a late receipt or a later Stop never turns it into another state.
CREATE FUNCTION sophia.keep_revoked_attempt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 NEW.state:='revoked';
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sophia.keep_revoked_attempt() FROM PUBLIC;
CREATE TRIGGER work_attempts_revoked_terminal BEFORE UPDATE OF state ON sophia.work_attempts
 FOR EACH ROW WHEN (OLD.state='revoked') EXECUTE FUNCTION sophia.keep_revoked_attempt();

-- The task a rebuilt research task replaces.
ALTER TABLE sophia.research_tasks ADD COLUMN rebuilt_from_job_id uuid,
 ADD CONSTRAINT research_tasks_rebuilt_from FOREIGN KEY(project_id,rebuilt_from_job_id) REFERENCES sophia.jobs(project_id,id);

-- What an attempt consumed that a withdrawal can reach: the sources its task was admitted with (the manifest's
-- dependencies) and the version it amends.
CREATE FUNCTION sophia.attempt_consumed_sources(p_project uuid, p_attempt uuid) RETURNS SETOF uuid LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT d.source_id FROM sophia.jobs j JOIN sophia.source_dependencies d ON d.project_id=j.project_id AND d.derived_source_id=j.input_source_id
  WHERE j.project_id=p_project AND j.attempt_id=p_attempt AND j.parent_job_id IS NULL
 UNION
 SELECT (t.body::jsonb->'base'->>'sourceId')::uuid FROM sophia.jobs j JOIN sophia.source_texts t ON t.project_id=j.project_id AND t.source_id=j.input_source_id
  WHERE j.project_id=p_project AND j.attempt_id=p_attempt AND j.kind='research' AND t.body::jsonb->'base'->>'sourceId' IS NOT NULL $$;
REVOKE ALL ON FUNCTION sophia.attempt_consumed_sources(uuid,uuid) FROM PUBLIC;

-- native_delivery_ineligible (0012), replaced: the same, and a resume, steer or input is refused for a revoked attempt
-- or one that consumed a source no longer eligible.
CREATE OR REPLACE FUNCTION sophia.native_delivery_ineligible(o sophia.outbox, g sophia.goals, c sophia.commands, b sophia.execution_bindings, rt sophia.runtime_instances)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT CASE
  WHEN g.authority_epoch<>o.authority_epoch THEN 'the goal''s authority epoch moved on'
  WHEN g.status NOT IN ('ready','running','checking') AND o.destination<>'native.resume' THEN 'the goal is '||g.status
  WHEN o.destination='native.resume' AND g.status<>'running' THEN 'the goal is '||g.status
  WHEN NOT EXISTS(SELECT 1 FROM sophia.project_members m WHERE m.project_id=c.project_id AND m.actor_id=c.actor_id AND m.active AND m.role IN ('admin','editor'))
   THEN 'the person who admitted it can no longer start work here'
  WHEN c.body_source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=c.project_id AND s.id=c.body_source_id AND s.eligible AND s.scope='project' AND s.state='ready')
   THEN 'its instruction source is no longer eligible'
  WHEN o.destination='native.create' AND EXISTS(SELECT 1 FROM sophia.jobs j JOIN sophia.source_dependencies d ON d.project_id=j.project_id AND d.derived_source_id=j.input_source_id
    JOIN sophia.source_objects s ON s.project_id=d.project_id AND s.id=d.source_id
    WHERE j.project_id=c.project_id AND j.command_id=c.id AND NOT (s.eligible AND s.scope='project' AND s.state='ready'))
   THEN 'an input it was admitted with is no longer eligible'
  WHEN o.destination IN ('native.resume','native.steer','native.input') AND (
    EXISTS(SELECT 1 FROM sophia.work_attempts wa WHERE wa.project_id=b.project_id AND wa.id=b.attempt_id AND wa.state='revoked')
    OR EXISTS(SELECT 1 FROM sophia.attempt_consumed_sources(b.project_id,b.attempt_id) x JOIN sophia.source_objects s ON s.project_id=b.project_id AND s.id=x
     WHERE NOT (s.eligible AND s.scope='project' AND s.state='ready')))
   THEN 'a source its work read was withdrawn'
  WHEN rt.id IS NULL THEN 'no active runtime for its executor resource and runtime unit'
  WHEN b.state IN ('settled','lost') THEN 'its native binding is '||b.state
  ELSE NULL END $$;

-- runtime_hello (0025), replaced: the same, and a revoked attempt's binding is reported stopped, so it is never loaded.
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
 SELECT coalesce(jsonb_agg(jsonb_build_object('attemptId',b.attempt_id,'nativeSessionId',b.native_session_id,'authorityEpoch',g.authority_epoch,
   'state',CASE WHEN wa.state='revoked' THEN 'stopped' WHEN g.status IN ('holding','held') THEN 'held'
    WHEN g.status IN ('stopping','stopped') THEN 'stopped' ELSE 'active' END)
   ORDER BY b.attempt_id),'[]') INTO bindings
  FROM sophia.execution_bindings b JOIN sophia.work_attempts wa ON wa.project_id=b.project_id AND wa.id=b.attempt_id
  JOIN sophia.goals g ON g.project_id=wa.project_id AND g.id=wa.goal_id
  WHERE b.project_id=rt.project_id AND b.resource_id=rt.resource_id AND b.runtime_unit_id=rt.runtime_unit_id
   AND b.state IN ('running','idle','stopping');
 PERFORM sophia.emit_service_event(rt.project_id,'runtime.hello','executor_resource',rt.resource_id,rt.lease_epoch,'runtime.hello');
 RETURN jsonb_build_object('projectId',rt.project_id,'leaseId',rt.lease_id,'authorityEpoch',rt.lease_epoch,'bindings',bindings,
  'cursor',sophia.runtime_cursor(rt.id));
END $$;

-- Stop one revoked attempt's native work. A binding that never launched is settled where it stands; a live one gets a
-- native.stop cleanup under a stop command, which the dispatcher sends like any Stop's. Its queued deliveries go.
CREATE FUNCTION sophia.research_stop_revoked(p_project uuid, p_actor uuid, j sophia.jobs, g sophia.goals) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE b sophia.execution_bindings; cmd uuid:=gen_random_uuid(); stopping boolean:=false;
BEGIN
 FOR b IN SELECT * FROM sophia.execution_bindings WHERE project_id=p_project AND attempt_id=j.attempt_id AND state NOT IN ('settled','lost') FOR UPDATE LOOP
  UPDATE sophia.outbox SET state='superseded' WHERE project_id=p_project AND binding_id=b.id AND state='pending' AND NOT cleanup;
  IF b.state='created' AND NOT EXISTS(SELECT 1 FROM sophia.runtime_commands WHERE project_id=p_project AND binding_id=b.id) THEN
   UPDATE sophia.execution_bindings SET state='settled' WHERE project_id=p_project AND id=b.id;
  ELSE
   IF NOT stopping THEN
    INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,state)
    VALUES(p_project,cmd,p_actor,g.id,g.revision,g.authority_epoch,'stop','revoke:'||j.id,
     jsonb_build_object('kind','revoke','taskId',j.id),'admitted');
    stopping:=true;
   END IF;
   UPDATE sophia.execution_bindings SET state='stopping' WHERE project_id=p_project AND id=b.id;
   INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch,cleanup)
   VALUES(p_project,cmd,'native.stop','binding/'||b.id,b.id,g.id,g.authority_epoch,true);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION sophia.research_stop_revoked(uuid,uuid,sophia.jobs,sophia.goals) FROM PUBLIC;

-- Rebuild a revoked research task: the same request on the same goal and allowance, without the inputs that are no
-- longer eligible, its lineage naming the task it replaces. Queued at once on a working goal; on a held one it waits
-- for Resume (research_queue_unstarted).
CREATE FUNCTION sophia.research_rebuild(p_project uuid, j sophia.jobs, t sophia.research_tasks, g sophia.goals) RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE pr sophia.projects; old jsonb; manifest jsonb; kept jsonb; dropped integer; ctx sophia.source_objects; b sophia.execution_bindings;
 att uuid:=gen_random_uuid(); bnd uuid:=gen_random_uuid(); cmd uuid:=gen_random_uuid(); job uuid:=gen_random_uuid(); cursor_value bigint;
BEGIN
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project;
 SELECT body::jsonb INTO old FROM sophia.source_texts WHERE project_id=p_project AND source_id=j.input_source_id;
 SELECT coalesce(jsonb_agg(i ORDER BY n) FILTER (WHERE ok),'[]'), count(*) FILTER (WHERE NOT ok) INTO kept, dropped FROM (
  SELECT i, n, EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=p_project AND s.id=(i->>'sourceId')::uuid
    AND s.scope='project' AND s.eligible AND s.state='ready') AS ok
   FROM jsonb_array_elements(coalesce(old->'inputs','[]')) WITH ORDINALITY AS x(i,n)) y;
 manifest:=old||jsonb_build_object('taskId',job,'inputs',kept,
  'lineage',coalesce(old->'lineage','{}')||jsonb_build_object('rebuiltFromTaskId',j.id),
  'withdrawnInputs',coalesce((old->>'withdrawnInputs')::integer,0)+dropped);
 ctx:=sophia.put_text_source(p_project,t.actor_id,'application/json',jsonb_pretty(manifest));
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(p_project,t.question_source_id,ctx.id);
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
  SELECT p_project,(i->>'sourceId')::uuid,ctx.id FROM jsonb_array_elements(kept) i ON CONFLICT DO NOTHING;
 INSERT INTO sophia.context_manifests(project_id,body_source_id,audience_revision,eligibility_revision,state)
 VALUES(p_project,ctx.id,pr.audience_revision,pr.eligibility_revision,'eligible');
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=p_project AND attempt_id=j.attempt_id ORDER BY id LIMIT 1;
 INSERT INTO sophia.work_attempts(project_id,id,goal_id,goal_revision,authority_epoch,context_source_id,state)
 VALUES(p_project,att,g.id,g.revision,g.authority_epoch,ctx.id,'admitted');
 INSERT INTO sophia.execution_bindings(project_id,id,attempt_id,resource_id,native_session_id,runtime_unit_id,continuation_owner,state)
 VALUES(p_project,bnd,att,b.resource_id,'sophia-'||att,b.runtime_unit_id,'sophia_episode','created');
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,body_source_id,state)
 VALUES(p_project,cmd,t.actor_id,g.id,g.revision,g.authority_epoch,'native_task','rebuild:'||j.id,
  jsonb_build_object('kind','research','rebuiltFromTaskId',j.id),t.question_source_id,'admitted');
 INSERT INTO sophia.jobs(project_id,id,kind,input_source_id,command_id,attempt_id,state,artifact_id)
 VALUES(p_project,job,'research',ctx.id,cmd,att,'pending',j.artifact_id);
 INSERT INTO sophia.research_tasks(project_id,job_id,root_job_id,amends_job_id,allowance_id,actor_id,exchange_id,role,route,
  question_source_id,urls,rebuilt_from_job_id)
 VALUES(p_project,job,t.root_job_id,t.amends_job_id,t.allowance_id,t.actor_id,t.exchange_id,t.role,t.route,t.question_source_id,t.urls,j.id);
 IF g.status IN ('ready','running','checking') THEN
  INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
  VALUES(p_project,cmd,'native.create','binding/'||bnd,bnd,g.id,g.authority_epoch);
 END IF;
 cursor_value:=sophia.emit_service_event(p_project,'native_task.admitted','job',job,1,'native_task.rebuilt',jsonb_build_array(g.id,cmd,ctx.id));
 UPDATE sophia.commands SET receipt=jsonb_build_object('taskId',job,'commandId',cmd,'goalId',g.id,'attemptId',att,'projectId',p_project,
  'kind','research','stage','admitted','cursor',cursor_value::text,'goalRevision',g.revision,'authorityEpoch',g.authority_epoch,
  'contextSourceId',ctx.id) WHERE project_id=p_project AND id=cmd;
 RETURN job;
END $$;
REVOKE ALL ON FUNCTION sophia.research_rebuild(uuid,sophia.jobs,sophia.research_tasks,sophia.goals) FROM PUBLIC;

-- Revoke every research task still under way that consumed `p_source`, now no longer eligible, and rebuild it unless
-- its goal is stopping or over. Returns the tasks revoked.
CREATE FUNCTION sophia.research_revoke_source(p_project uuid, p_source uuid) RETURNS uuid[] LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE j sophia.jobs; t sophia.research_tasks; g sophia.goals; revoked uuid[]:='{}';
BEGIN
 IF EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=p_project AND s.id=p_source AND s.eligible AND s.scope='project' AND s.state='ready') THEN
  RETURN revoked; END IF;
 FOR j IN SELECT jj.* FROM sophia.jobs jj JOIN sophia.work_attempts wa ON wa.project_id=jj.project_id AND wa.id=jj.attempt_id
   WHERE jj.project_id=p_project AND jj.kind='research' AND jj.parent_job_id IS NULL AND jj.state IN ('pending','running','outcome_unknown')
    AND wa.state<>'revoked' AND p_source IN (SELECT sophia.attempt_consumed_sources(p_project,jj.attempt_id))
   ORDER BY jj.id FOR UPDATE OF jj LOOP
  SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts wa ON wa.project_id=g2.project_id AND wa.goal_id=g2.id
   WHERE wa.project_id=p_project AND wa.id=j.attempt_id FOR UPDATE OF g2;
  SELECT * INTO t FROM sophia.research_tasks WHERE project_id=p_project AND job_id=j.id FOR UPDATE;
  UPDATE sophia.work_attempts SET state='revoked' WHERE project_id=p_project AND id=j.attempt_id;
  UPDATE sophia.jobs SET state='failed', reason='revoked: a source it read was withdrawn; the task continues without it',
   result_revision=result_revision+1 WHERE project_id=p_project AND id=j.id RETURNING * INTO j;
  PERFORM sophia.research_stop_revoked(p_project,coalesce(sophia.actor_id(),t.actor_id),j,g);
  PERFORM sophia.emit_service_event(p_project,'native_task.failed','job',j.id,j.result_revision+3,'native_task.revoked');
  IF g.status IN ('ready','running','checking','holding','held') THEN PERFORM sophia.research_rebuild(p_project,j,t,g); END IF;
  revoked:=revoked||j.id;
 END LOOP;
 RETURN revoked;
END $$;
REVOKE ALL ON FUNCTION sophia.research_revoke_source(uuid,uuid) FROM PUBLIC;

-- mission_erase_source (0018), replaced: the same, then the research that consumed the erased source is revoked.
CREATE OR REPLACE FUNCTION sophia.mission_erase_source(p_project uuid, p_source uuid) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 DELETE FROM sophia.source_texts WHERE project_id=p_project AND source_id=p_source;
 UPDATE sophia.source_objects SET eligible=false, state='deleted', eligibility_revision=eligibility_revision+1, byte_length=0,
  sha256=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex')
  WHERE project_id=p_project AND id=p_source;
 UPDATE sophia.mission_requests SET semantic_request=(semantic_request-'text'-'proposal')||'{"redacted":true}',
  receipt=receipt||'{"sha256":null}'
  WHERE project_id=p_project AND receipt->>'sourceId'=p_source::text;
 PERFORM sophia.research_revoke_source(p_project,p_source);
END $$;

-- At Resume: research of this goal that never started (its binding never launched) is queued now, under the Resume's
-- authority. Its resume rows, which would name a session that does not exist, give way, and so do a revoked session's;
-- a Resume left with nothing else to deliver is settled. Runs at commit, after admit_goal_command has written its rows.
CREATE FUNCTION sophia.research_queue_unstarted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.goals; r record; c sophia.commands;
BEGIN
 SELECT * INTO g FROM sophia.goals WHERE project_id=NEW.project_id AND id=NEW.id;
 IF g.status<>'running' OR g.authority_epoch<>NEW.authority_epoch THEN RETURN NULL; END IF;
 FOR r IN SELECT j.id AS job_id, j.command_id, b.id AS binding_id FROM sophia.jobs j
   JOIN sophia.work_attempts wa ON wa.project_id=j.project_id AND wa.id=j.attempt_id
   JOIN sophia.execution_bindings b ON b.project_id=j.project_id AND b.attempt_id=j.attempt_id
   WHERE j.project_id=g.project_id AND wa.goal_id=g.id AND j.kind='research' AND j.parent_job_id IS NULL AND j.state='pending'
    AND wa.state='admitted' AND b.state IN ('created','settled')
    AND NOT EXISTS(SELECT 1 FROM sophia.runtime_commands rc WHERE rc.project_id=b.project_id AND rc.binding_id=b.id)
    AND NOT EXISTS(SELECT 1 FROM sophia.outbox o WHERE o.project_id=b.project_id AND o.binding_id=b.id
     AND o.destination='native.create' AND o.state IN ('pending','dispatching') AND o.authority_epoch=g.authority_epoch)
 LOOP
  UPDATE sophia.execution_bindings SET state='created' WHERE project_id=g.project_id AND id=r.binding_id;
  UPDATE sophia.outbox SET state='superseded' WHERE project_id=g.project_id AND binding_id=r.binding_id
   AND destination='native.resume' AND state='pending';
  UPDATE sophia.outbox SET state='superseded' WHERE project_id=g.project_id AND binding_id=r.binding_id
   AND destination='native.create' AND state='pending';
  INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
  VALUES(g.project_id,r.command_id,'native.create','binding/'||r.binding_id||'/'||g.authority_epoch,r.binding_id,g.id,g.authority_epoch);
 END LOOP;
 -- A revoked session is never resumed; its rows would only be refused.
 UPDATE sophia.outbox o SET state='superseded' FROM sophia.execution_bindings b
  JOIN sophia.work_attempts wa ON wa.project_id=b.project_id AND wa.id=b.attempt_id
  WHERE o.project_id=g.project_id AND o.goal_id=g.id AND o.destination='native.resume' AND o.state='pending'
   AND b.project_id=o.project_id AND b.id=o.binding_id AND wa.state='revoked';
 FOR c IN SELECT * FROM sophia.commands cc WHERE cc.project_id=g.project_id AND cc.goal_id=g.id AND cc.kind='resume'
   AND cc.authority_epoch=g.authority_epoch AND cc.state='admitted'
   AND NOT EXISTS(SELECT 1 FROM sophia.outbox o WHERE o.project_id=cc.project_id AND o.command_id=cc.id AND o.state<>'superseded') LOOP
  INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,goal_id,authority_epoch,cleanup)
  VALUES(c.project_id,c.id,'control.settle','control/empty',g.id,g.authority_epoch,true) ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sophia.research_queue_unstarted() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER goals_resume_queues_unstarted_research AFTER UPDATE OF status ON sophia.goals
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.status='held' AND NEW.status='running')
 EXECUTE FUNCTION sophia.research_queue_unstarted();

COMMIT;
