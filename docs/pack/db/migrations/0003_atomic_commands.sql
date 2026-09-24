-- Foundational domain functions, not every API handler. No provider I/O inside SQL.
BEGIN;
CREATE FUNCTION sophia.create_project(p_title text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); p uuid:=gen_random_uuid();
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 INSERT INTO sophia.projects(id,title,created_by) VALUES(p,p_title,a);
 INSERT INTO sophia.project_members(project_id,actor_id,role) VALUES(p,a,'admin');
 INSERT INTO sophia.project_revisions(project_id,revision,frame,accepted_by) VALUES(p,1,'{}',a);
 RETURN jsonb_build_object('projectId',p,'cursor','0');
END $$;

CREATE FUNCTION sophia.admit_goal_command(p_project uuid,p_goal uuid,p_kind text,p_key text,p_expected_revision bigint,p_expected_epoch bigint,p_body_source uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); g sophia.goals; prior sophia.commands; semantic jsonb;
 cmd uuid:=gen_random_uuid(); cursor_value bigint; receipt_value jsonb; b record; target_count integer:=0;
BEGIN
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_kind NOT IN ('steer','request_review','hold','stop','resume') OR p_kind IS NULL THEN RAISE EXCEPTION 'Unsupported command' USING ERRCODE='22023'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 -- Lock order: project, then goal. Repeat admission is serialized with membership/control updates.
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=p_goal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Goal not found' USING ERRCODE='22023'; END IF;
 semantic:=jsonb_build_object('kind',p_kind,'goalId',p_goal,'expectedGoalRevision',p_expected_revision,'expectedAuthorityEpoch',p_expected_epoch,'bodySourceId',p_body_source);
 SELECT * INTO prior FROM sophia.commands WHERE project_id=p_project AND actor_id=a AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 IF p_expected_revision IS NULL OR p_expected_epoch IS NULL OR g.revision<>p_expected_revision OR g.authority_epoch<>p_expected_epoch THEN
  RAISE EXCEPTION 'Stale goal revision or epoch' USING ERRCODE='40001'; END IF;
 IF p_kind='steer' AND p_body_source IS NULL THEN RAISE EXCEPTION 'Steer requires a source-backed brief' USING ERRCODE='22023'; END IF;
 IF p_body_source IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=p_project AND s.id=p_body_source AND s.eligible AND s.state='ready' AND s.scope='project') THEN
  RAISE EXCEPTION 'Source not released and eligible for project work' USING ERRCODE='42501'; END IF;
 IF p_kind='resume' AND g.status<>'held' THEN RAISE EXCEPTION 'Hold is not settled' USING ERRCODE='40001'; END IF;
 IF p_kind='hold' AND g.status NOT IN ('running','checking') THEN RAISE EXCEPTION 'Goal is not active' USING ERRCODE='40001'; END IF;
 IF p_kind IN ('steer','request_review') AND g.status NOT IN ('ready','running','checking') THEN RAISE EXCEPTION 'Goal not admitted for work' USING ERRCODE='40001'; END IF;
 IF p_kind='stop' AND g.status IN ('stopping','stopped','completed') THEN RAISE EXCEPTION 'Goal already terminal or stopping' USING ERRCODE='40001'; END IF;
 IF p_kind IN ('hold','stop','resume') THEN
  UPDATE sophia.goals SET authority_epoch=authority_epoch+1, state_revision=state_revision+1,
   status=CASE p_kind WHEN 'hold' THEN 'holding' WHEN 'stop' THEN 'stopping' ELSE 'running' END
   WHERE project_id=p_project AND id=p_goal RETURNING * INTO g;
 END IF;
 IF p_kind IN ('hold','stop') THEN
  UPDATE sophia.outbox SET state='superseded' WHERE project_id=p_project AND goal_id=p_goal AND state='pending' AND NOT cleanup;
  -- Dispatching writes are not requeued or presumed absent; the controller must drain/reconcile them.
 END IF;
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,body_source_id,state)
 VALUES(p_project,cmd,a,p_goal,g.revision,g.authority_epoch,p_kind,p_key,semantic,p_body_source,'admitted');
 UPDATE sophia.projects SET event_sequence=event_sequence+1 WHERE id=p_project RETURNING event_sequence INTO cursor_value;
 INSERT INTO sophia.project_events(project_id,sequence,type,entity_type,entity_id,entity_revision,summary_code,actor_id)
 VALUES(p_project,cursor_value,'command.admitted','command',cmd,1,'command.'||p_kind,a);
 IF p_kind IN ('hold','stop') THEN
  FOR b IN SELECT eb.id FROM sophia.execution_bindings eb JOIN sophia.work_attempts wa ON wa.project_id=eb.project_id AND wa.id=eb.attempt_id
   WHERE wa.project_id=p_project AND wa.goal_id=p_goal AND eb.state<>'settled'
  LOOP
   INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch,cleanup)
    VALUES(p_project,cmd,'native.stop','binding/'||b.id,b.id,p_goal,g.authority_epoch,true);
   target_count:=target_count+1;
  END LOOP;
  IF target_count=0 THEN INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,goal_id,authority_epoch,cleanup)
   VALUES(p_project,cmd,'control.settle','control/empty',p_goal,g.authority_epoch,true); END IF;
 ELSE
  INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,goal_id,authority_epoch)
  VALUES(p_project,cmd,CASE p_kind WHEN 'steer' THEN 'lead.amend_goal' WHEN 'request_review' THEN 'lead.review' ELSE 'lead.resume_goal' END,'lead',p_goal,g.authority_epoch);
 END IF;
 receipt_value:=jsonb_build_object('commandId',cmd,'projectId',p_project,'cursor',cursor_value::text,'stage','admitted','goalId',p_goal,'goalRevision',g.revision,'authorityEpoch',g.authority_epoch);
 UPDATE sophia.commands SET receipt=receipt_value WHERE project_id=p_project AND id=cmd;
 RETURN receipt_value;
END $$;

CREATE FUNCTION sophia.publish_candidate(p_project uuid,p_version uuid,p_expected_stable uuid,p_expected_revision bigint,p_expected_epoch bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE v sophia.artifact_versions; a sophia.artifacts; g sophia.goals;
BEGIN
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=p_project AND id=p_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=v.goal_id FOR UPDATE;
 SELECT * INTO a FROM sophia.artifacts WHERE project_id=p_project AND id=v.artifact_id FOR UPDATE;
 IF p_expected_revision IS NULL OR p_expected_epoch IS NULL OR g.revision<>p_expected_revision OR g.authority_epoch<>p_expected_epoch OR v.goal_revision<>g.revision OR v.authority_epoch<>g.authority_epoch OR g.status NOT IN ('running','checking') THEN
  RAISE EXCEPTION 'Stale or stopped candidate' USING ERRCODE='40001'; END IF;
 IF a.stable_version_id IS DISTINCT FROM p_expected_stable THEN RAISE EXCEPTION 'Stable head changed' USING ERRCODE='40001'; END IF;
 IF v.state<>'validated' OR NOT v.checks_passed OR v.validation_source_id IS NULL THEN RAISE EXCEPTION 'Missing trusted validation' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=p_project AND s.id=v.source_id AND s.sha256=v.source_hash AND s.eligible AND s.scope='project' AND s.state='ready')
 OR NOT EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=p_project AND s.id=v.validation_source_id AND s.eligible AND s.scope='project' AND s.state='ready') THEN
  RAISE EXCEPTION 'Candidate or validation source is no longer eligible' USING ERRCODE='42501'; END IF;
 UPDATE sophia.artifact_versions SET state='stable' WHERE project_id=p_project AND id=p_version;
 UPDATE sophia.artifacts SET stable_version_id=p_version WHERE project_id=p_project AND id=v.artifact_id;
 -- Prior stable version is retained as history; the pointer decides what is current.
 RETURN p_version;
END $$;
REVOKE ALL ON FUNCTION sophia.create_project(text),sophia.admit_goal_command(uuid,uuid,text,text,bigint,bigint,uuid),sophia.publish_candidate(uuid,uuid,uuid,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.create_project(text),sophia.admit_goal_command(uuid,uuid,text,text,bigint,bigint,uuid),sophia.publish_candidate(uuid,uuid,uuid,bigint,bigint) TO sophia_api;
COMMIT;
