-- SMC-M03 S4 part 3 (plan §2.5 "Completion" and "Turn-end rules"; binding §4): how a research task ends.
-- * research_submit_result publishes the attempt's current draft as the next version of the task's report, in one
--   transaction: the draft must be the one the model last read (its hash), every citation must be a source the task
--   may read, and the authority must be current. The version is recorded with its checks (a validation source),
--   its notes (what changed, what was kept), deterministic change facts and its trigger, and becomes the report's
--   stable version; the previous one is superseded. The task succeeds with a bounded result summary, and the goal
--   completes. A first report creates the artifact; an amendment adds a version to the same artifact and must say
--   what changed. Never the last assistant message: only this call publishes.
-- * research_report_blocker ends the task as failed with its reason and the remaining work, recorded as a source; it
--   is never room speech, and the draft is kept.
-- * A research turn that ends without either: an error, max-tokens or blocked turn fails the task with its reason and
--   leaves any call of the session still reserved uncertain (it may have left); a completed turn gets one bounded
--   nudge (an input command asking to submit or report a blocker), and the next completed turn without a submit fails
--   the task with no_result_submitted, keeping the draft. Both judge the turn under the authority it ran with, as
--   0016 does for a brief: a turn from before a Hold or Stop changes nothing.
-- 0001–0025 are not edited; capture_native_result is replaced with the same signature and dispatches by job kind.
BEGIN;

ALTER TABLE sophia.research_tasks
 ADD COLUMN nudge_command_id uuid,
 ADD COLUMN closed_by_call text CHECK(closed_by_call IS NULL OR closed_by_call ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,239}$'),
 ADD CONSTRAINT research_tasks_nudge_fk FOREIGN KEY(project_id,nudge_command_id) REFERENCES sophia.commands(project_id,id);

-- --- submit ---------------------------------------------------------------------------------------------------

-- Publish the attempt's current draft as the report's next stable version (see the header). s is the fenced scope.
CREATE FUNCTION sophia.research_publish(s sophia.research_scope, p_key text, p_result jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.research_tasks; j sophia.jobs; g sophia.goals; d sophia.research_drafts; a sophia.artifacts; prev sophia.artifact_versions;
 v sophia.artifact_versions; citations uuid[]; previous uuid[]; lims text[]; vnum integer; validation sophia.source_objects;
 result sophia.source_objects; v_title text:=btrim(p_result->>'title'); v_summary text:=btrim(p_result->>'summary');
 v_answer text:=btrim(p_result->>'resultSummary'); v_change text:=nullif(btrim(coalesce(p_result->>'changeNote','')),'');
 v_kept text:=nullif(btrim(coalesce(p_result->>'retainedNote','')),''); bad uuid; artifact uuid; v_bytes bigint; v_previous_bytes bigint;
BEGIN
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=s.project_id AND id=s.job_id FOR UPDATE;
 SELECT * INTO g FROM sophia.goals WHERE project_id=s.project_id AND id=s.goal_id;
 IF v_title IS NULL OR length(v_title) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'A report has a title of 1 to 200 characters' USING ERRCODE='22023'; END IF;
 IF v_summary IS NULL OR length(v_summary) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'A report has a description of 1 to 240 characters' USING ERRCODE='22023'; END IF;
 IF v_answer IS NULL OR length(v_answer) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'A result summary is 1 to 2000 characters' USING ERRCODE='22023'; END IF;
 IF length(v_change)>200 OR length(v_kept)>200 THEN RAISE EXCEPTION 'A version note is at most 200 characters' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(x ORDER BY i),'{}') INTO lims FROM jsonb_array_elements_text(coalesce(p_result->'limitations','[]')) WITH ORDINALITY AS e(x,i);
 IF cardinality(lims)>8 OR EXISTS(SELECT 1 FROM unnest(lims) l WHERE length(l) NOT BETWEEN 1 AND 300) THEN
  RAISE EXCEPTION 'At most 8 limitations of 1 to 300 characters' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_result->'citations')<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_result->'citations') c
   WHERE c !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
  RAISE EXCEPTION 'Citations are source ids' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(DISTINCT c::uuid),'{}') INTO citations FROM jsonb_array_elements_text(p_result->'citations') c;
 IF cardinality(citations) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'A report cites 1 to 200 sources' USING ERRCODE='22023'; END IF;

 SELECT * INTO d FROM sophia.research_drafts WHERE project_id=s.project_id AND attempt_id=s.attempt_id ORDER BY seq DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research draft not found' USING ERRCODE='22023'; END IF;
 IF d.sha256 IS DISTINCT FROM p_result->>'draftSha256' THEN RAISE EXCEPTION 'Stale draft: submit the draft you last read' USING ERRCODE='40001'; END IF;
 SELECT x INTO bad FROM unnest(citations) x WHERE x=d.source_id OR NOT sophia.research_readable(s,x) LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Citation not found' USING ERRCODE='22023'; END IF;

 -- The report: this lineage's artifact, or a new one for its first version.
 IF j.artifact_id IS NOT NULL THEN
  SELECT * INTO a FROM sophia.artifacts WHERE project_id=s.project_id AND id=j.artifact_id FOR UPDATE;
 ELSE
  SELECT ar.* INTO a FROM sophia.artifacts ar JOIN sophia.jobs jj ON jj.project_id=ar.project_id AND jj.artifact_id=ar.id
   JOIN sophia.research_tasks rt ON rt.project_id=jj.project_id AND rt.job_id=jj.id
   WHERE ar.project_id=s.project_id AND rt.root_job_id=t.root_job_id LIMIT 1 FOR UPDATE OF ar;
 END IF;
 IF a.id IS NULL THEN
  artifact:=gen_random_uuid();
  INSERT INTO sophia.artifacts(project_id,id,title,format,summary,summary_updated_at)
  VALUES(s.project_id,artifact,v_title,'markdown',v_summary,now()) RETURNING * INTO a;
 ELSE
  SELECT * INTO prev FROM sophia.artifact_versions WHERE project_id=s.project_id AND id=a.stable_version_id;
  IF v_change IS NULL THEN RAISE EXCEPTION 'An amended report says what changed' USING ERRCODE='22023'; END IF;
  -- A member's own description stays; the worker's is replaced with the new version's.
  IF a.summary_author_id IS NULL AND a.summary IS DISTINCT FROM v_summary THEN
   UPDATE sophia.artifacts SET summary=v_summary, summary_revision=summary_revision+1, summary_updated_at=now()
    WHERE project_id=s.project_id AND id=a.id RETURNING * INTO a;
  END IF;
 END IF;
 SELECT coalesce(max(version_number),0)+1 INTO vnum FROM sophia.artifact_versions WHERE project_id=s.project_id AND artifact_id=a.id;

 SELECT coalesce(array_agg(dep.source_id ORDER BY dep.source_id),'{}') INTO previous FROM sophia.source_dependencies dep
  WHERE prev.id IS NOT NULL AND dep.project_id=s.project_id AND dep.derived_source_id=prev.source_id;
 SELECT byte_length INTO v_bytes FROM sophia.source_objects WHERE project_id=s.project_id AND id=d.source_id;
 SELECT byte_length INTO v_previous_bytes FROM sophia.source_objects WHERE project_id=s.project_id AND id=prev.source_id;
 validation:=sophia.put_text_source(s.project_id,s.actor_id,'application/json',jsonb_pretty(jsonb_build_object(
  'schema','sophia.research-validation.v1','taskId',s.job_id,'draftSha256',d.sha256,
  'checks',jsonb_build_array(
   jsonb_build_object('check','draft_is_current','ok',true,'seq',d.seq),
   jsonb_build_object('check','citations_readable_by_task','ok',true,'count',cardinality(citations)),
   jsonb_build_object('check','authority_current','ok',true,'authorityEpoch',g.authority_epoch,'goalRevision',g.revision)))));
 IF prev.id IS NOT NULL THEN
  UPDATE sophia.artifact_versions SET state='superseded' WHERE project_id=s.project_id AND id=prev.id AND state='stable';
 END IF;
 INSERT INTO sophia.artifact_versions(project_id,artifact_id,parent_id,source_id,source_hash,goal_id,goal_revision,authority_epoch,state,
  validation_source_id,checks_passed,version_number,change_note,retained_note,change_facts,trigger,job_id,limitations)
 VALUES(s.project_id,a.id,prev.id,d.source_id,d.sha256,g.id,g.revision,g.authority_epoch,'stable',validation.id,true,vnum,
  coalesce(v_change,CASE WHEN vnum=1 THEN 'First version' END),v_kept,
  jsonb_build_object('versionNumber',vnum,'previousVersionId',prev.id,'cited',cardinality(citations),
   'added',(SELECT coalesce(jsonb_agg(x ORDER BY x),'[]') FROM unnest(citations) x WHERE NOT x=ANY(previous)),
   'dropped',(SELECT coalesce(jsonb_agg(x ORDER BY x),'[]') FROM unnest(previous) x WHERE NOT x=ANY(citations)),
   'bytes',v_bytes,'previousBytes',v_previous_bytes),
  jsonb_strip_nulls(jsonb_build_object('kind','research','taskId',s.job_id,'amendsTaskId',t.amends_job_id)),s.job_id,lims)
 RETURNING * INTO v;
 UPDATE sophia.artifacts SET stable_version_id=v.id WHERE project_id=s.project_id AND id=a.id;
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
  SELECT s.project_id,x,d.source_id FROM unnest(citations) x ON CONFLICT DO NOTHING;
 result:=sophia.put_text_source(s.project_id,s.actor_id,'text/markdown; charset=utf-8',
  v_answer||CASE WHEN cardinality(lims)>0 THEN E'\n\nLimitations:\n'||(SELECT string_agg('- '||l,E'\n') FROM unnest(lims) l) ELSE '' END);
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(s.project_id,d.source_id,result.id) ON CONFLICT DO NOTHING;
 UPDATE sophia.jobs SET state='succeeded', result_source_id=result.id, artifact_id=a.id, result_revision=result_revision+1, reason=NULL
  WHERE project_id=s.project_id AND id=j.id RETURNING * INTO j;
 UPDATE sophia.research_tasks SET closed_by_call=p_key WHERE project_id=s.project_id AND job_id=j.id;
 UPDATE sophia.work_attempts SET state='accepted' WHERE project_id=s.project_id AND id=s.attempt_id;
 UPDATE sophia.goals SET status='completed', state_revision=state_revision+1 WHERE project_id=s.project_id AND id=g.id;
 PERFORM sophia.emit_service_event(s.project_id,'native_task.result_ready','job',j.id,j.result_revision+3,'native_task.result_ready',
  jsonb_build_array(result.id,v.source_id));
 RETURN jsonb_build_object('taskId',j.id,'outcome','published','artifactId',a.id,'versionId',v.id,'versionNumber',v.version_number,
  'sourceId',v.source_id,'sha256',v.source_hash,'resultSourceId',result.id);
END $$;
REVOKE ALL ON FUNCTION sophia.research_publish(sophia.research_scope,text,jsonb) FROM PUBLIC;

-- POST /v1/runtime/research/submit: publish the result, or report a blocker (exactly one). Idempotent by the call:
-- a replay returns what the first call did; another call on an ended task is refused.
CREATE FUNCTION sophia.runtime_research_submit(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false); t sophia.research_tasks;
 j sophia.jobs; key text; v sophia.artifact_versions; src sophia.source_objects; v_reason text:=btrim(p_request->'blocker'->>'reason');
 v_remaining text:=nullif(btrim(coalesce(p_request->'blocker'->>'remainingWork','')),'');
BEGIN
 IF coalesce(p_request->>'callId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid call id' USING ERRCODE='22023'; END IF;
 IF (p_request ? 'result')=(p_request ? 'blocker') THEN RAISE EXCEPTION 'A submit carries a result or a blocker' USING ERRCODE='22023'; END IF;
 key:=s.native_session_id||':'||(p_request->>'callId');
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 IF t.closed_by_call=key THEN
  SELECT * INTO j FROM sophia.jobs WHERE project_id=s.project_id AND id=s.job_id;
  IF j.state='succeeded' AND p_request ? 'result' THEN
   SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=s.project_id AND job_id=j.id ORDER BY version_number DESC LIMIT 1;
   RETURN jsonb_build_object('taskId',j.id,'outcome','published','artifactId',v.artifact_id,'versionId',v.id,'versionNumber',v.version_number,
    'sourceId',v.source_id,'sha256',v.source_hash,'resultSourceId',j.result_source_id);
  ELSIF j.state='failed' AND p_request ? 'blocker' THEN
   RETURN jsonb_build_object('taskId',j.id,'outcome','blocked','resultSourceId',j.result_source_id);
  END IF;
  RAISE EXCEPTION 'Idempotency key reused for another submit' USING ERRCODE='23505';
 END IF;
 IF t.closed_by_call IS NOT NULL THEN RAISE EXCEPTION 'The research task has already ended' USING ERRCODE='40001'; END IF;
 s:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true);
 IF p_request ? 'result' THEN RETURN sophia.research_publish(s,key,p_request->'result'); END IF;
 IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 1 AND 500 OR length(v_remaining)>2000 THEN
  RAISE EXCEPTION 'A blocker has a reason of 1 to 500 characters and at most 2000 of remaining work' USING ERRCODE='22023'; END IF;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=s.project_id AND id=s.job_id FOR UPDATE;
 src:=sophia.put_text_source(s.project_id,s.actor_id,'text/markdown; charset=utf-8',
  'Blocked: '||v_reason||CASE WHEN v_remaining IS NULL THEN '' ELSE E'\n\nRemaining work:\n'||v_remaining END);
 UPDATE sophia.jobs SET state='failed', reason=left('blocked: '||v_reason,2000), result_source_id=src.id, result_revision=result_revision+1
  WHERE project_id=s.project_id AND id=j.id RETURNING * INTO j;
 UPDATE sophia.research_tasks SET closed_by_call=key WHERE project_id=s.project_id AND job_id=j.id;
 UPDATE sophia.work_attempts SET state='failed' WHERE project_id=s.project_id AND id=s.attempt_id;
 PERFORM sophia.emit_service_event(s.project_id,'native_task.failed','job',j.id,j.result_revision+3,'native_task.blocked',jsonb_build_array(src.id));
 RETURN jsonb_build_object('taskId',j.id,'outcome','blocked','resultSourceId',src.id);
END $$;

-- --- turn-end rules -------------------------------------------------------------------------------------------

-- The input a research session gets once when a turn completes without a submit.
CREATE FUNCTION sophia.research_nudge_text() RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT 'Your turn ended without a result. If the report is ready, call research_submit_result with your current draft; '
 || 'if it cannot be finished, call research_report_blocker with the reason and the remaining work. Do not start new research.' $$;
REVOKE ALL ON FUNCTION sophia.research_nudge_text() FROM PUBLIC;

-- How a research turn ends (see the header). Called by capture_native_result with the job locked.
CREATE FUNCTION sophia.research_turn_end(p_project uuid, b sophia.execution_bindings, g sophia.goals, j sophia.jobs, p_turn_end_seq bigint, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.research_tasks; owner sophia.runtime_commands; src sophia.source_objects; cmd uuid:=gen_random_uuid();
BEGIN
 IF j.state NOT IN ('pending','running','outcome_unknown') THEN RETURN; END IF;
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=p_project AND job_id=j.id FOR UPDATE;
 IF p_reason IS DISTINCT FROM 'completed' THEN
  IF p_reason IN ('error','max-tokens','blocked') AND g.status IN ('ready','running','checking') THEN
   UPDATE sophia.jobs SET state='failed', reason='the native turn ended: '||p_reason WHERE project_id=p_project AND id=j.id;
   -- A call still reserved when its turn failed may have left: it stays committed until reconciled.
   UPDATE sophia.research_allowances al SET reserved_usd=al.reserved_usd-x.amount, uncertain_usd=al.uncertain_usd+x.amount
    FROM (SELECT sum(r.reserved_usd) AS amount FROM sophia.research_reservations r WHERE r.project_id=p_project
     AND r.allowance_id=t.allowance_id AND r.state='reserved' AND starts_with(r.reservation_key,b.native_session_id||':')) x
    WHERE al.project_id=p_project AND al.id=t.allowance_id AND x.amount IS NOT NULL;
   UPDATE sophia.research_reservations SET state='uncertain', ended_at=now() WHERE project_id=p_project AND allowance_id=t.allowance_id
    AND state='reserved' AND starts_with(reservation_key,b.native_session_id||':');
   PERFORM sophia.emit_service_event(p_project,'native_task.failed','job',j.id,j.result_revision+3,'native_task.'||p_reason);
  END IF;
  RETURN;
 END IF;
 -- A completed turn with no submit: judged under the authority it ran with (the command last settled before it).
 SELECT rc.* INTO owner FROM sophia.runtime_commands rc
  JOIN sophia.runtime_receipts r ON r.project_id=rc.project_id AND r.runtime_command_id=rc.id
  WHERE rc.project_id=p_project AND rc.binding_id=b.id AND rc.kind<>'inspect'
   AND r.stage IN ('delivered','incorporation_observed','checked','outcome_unknown') AND coalesce(r.native_sequence,0)<p_turn_end_seq
  ORDER BY coalesce(r.native_sequence,0) DESC, rc.seq DESC LIMIT 1;
 IF NOT FOUND OR owner.authority_epoch<>g.authority_epoch OR owner.kind NOT IN ('create','resume','steer','input')
  OR g.status NOT IN ('ready','running','checking') THEN RETURN; END IF;
 IF t.nudge_command_id IS NOT NULL THEN
  IF owner.command_id=t.nudge_command_id THEN
   UPDATE sophia.jobs SET state='failed', reason='no_result_submitted: the draft is kept' WHERE project_id=p_project AND id=j.id;
   PERFORM sophia.emit_service_event(p_project,'native_task.failed','job',j.id,j.result_revision+3,'native_task.no_result_submitted');
  END IF;
  RETURN;
 END IF;
 src:=sophia.put_text_source(p_project,t.actor_id,'text/plain; charset=utf-8',sophia.research_nudge_text());
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,body_source_id,state)
 VALUES(p_project,cmd,t.actor_id,g.id,g.revision,g.authority_epoch,'input','research-nudge:'||b.attempt_id,
  jsonb_build_object('kind','input','nudge','research_submit','attemptId',b.attempt_id),src.id,'admitted');
 INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
 VALUES(p_project,cmd,'native.input','binding/'||b.id,b.id,g.id,g.authority_epoch);
 UPDATE sophia.research_tasks SET nudge_command_id=cmd WHERE project_id=p_project AND job_id=j.id;
 PERFORM sophia.emit_service_event(p_project,'native_task.nudged','job',j.id,j.result_revision+3,'native_task.no_result_yet');
END $$;
REVOKE ALL ON FUNCTION sophia.research_turn_end(uuid,sophia.execution_bindings,sophia.goals,sophia.jobs,bigint,text) FROM PUBLIC;

-- capture_native_result (0016), replaced: a research task's turn end follows the research rules; a brief's is as before.
CREATE OR REPLACE FUNCTION sophia.capture_native_result(p_project uuid, p_binding uuid, p_turn_end_seq bigint, p_reason text) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE b sophia.execution_bindings; g sophia.goals; j sophia.jobs; msg sophia.native_observations; c sophia.commands; src sophia.source_objects;
 owner sophia.runtime_commands;
BEGIN
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=p_project AND id=p_binding;
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts a ON a.project_id=g2.project_id AND a.goal_id=g2.id
  WHERE a.project_id=p_project AND a.id=b.attempt_id FOR UPDATE OF g2;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND attempt_id=b.attempt_id AND kind='research' FOR UPDATE;
 IF FOUND THEN PERFORM sophia.research_turn_end(p_project,b,g,j,p_turn_end_seq,p_reason); RETURN; END IF;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND attempt_id=b.attempt_id AND kind='draft_brief' FOR UPDATE;
 IF j.id IS NULL OR j.state NOT IN ('pending','running','outcome_unknown') THEN RETURN; END IF;
 IF p_reason IS DISTINCT FROM 'completed' THEN
  IF p_reason IN ('error','max-tokens','blocked') AND j.state IN ('pending','running') AND g.status IN ('running','checking') THEN
   UPDATE sophia.jobs SET state='failed', reason='the native turn ended: '||p_reason WHERE project_id=p_project AND id=j.id;
   PERFORM sophia.emit_service_event(p_project,'native_task.failed','job',j.id,j.result_revision+3,'native_task.'||p_reason);
  END IF;
  RETURN;
 END IF;
 SELECT * INTO msg FROM sophia.native_observations WHERE project_id=p_project AND binding_id=p_binding AND type='assistant/message'
  AND native_seq<p_turn_end_seq AND coalesce((data->>'interrupted')::boolean,false)=false AND coalesce(data->>'text','')<>''
  ORDER BY native_seq DESC LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 -- The authority the turn ran under: the command (inspect aside, which reads only) last settled in the session before
 -- its message. Only a turn under the goal's current epoch, begun by a command that grants it, may publish; one from
 -- before a Hold or Stop, replayed or delayed past a Resume, stays withheld. No settled command yet (its receipt still
 -- on its way): nothing is decided, and the receipt tries again when it is recorded.
 SELECT rc.* INTO owner FROM sophia.runtime_commands rc
  JOIN sophia.runtime_receipts r ON r.project_id=rc.project_id AND r.runtime_command_id=rc.id
  WHERE rc.project_id=p_project AND rc.binding_id=p_binding AND rc.kind<>'inspect'
   AND r.stage IN ('delivered','incorporation_observed','checked','outcome_unknown')
   AND coalesce(r.native_sequence,0)<msg.native_seq
  ORDER BY coalesce(r.native_sequence,0) DESC, rc.seq DESC LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 IF owner.authority_epoch<>g.authority_epoch OR owner.kind NOT IN ('create','resume','steer','input') THEN
  UPDATE sophia.jobs SET reason='a result from an earlier authority (before a Hold or Stop) arrived; it was withheld, not published'
   WHERE project_id=p_project AND id=j.id;
  RETURN;
 END IF;
 IF g.status NOT IN ('running','checking') THEN
  UPDATE sophia.jobs SET reason='a result arrived while the work was '||g.status||'; it was withheld, not published' WHERE project_id=p_project AND id=j.id;
  RETURN;
 END IF;
 SELECT * INTO c FROM sophia.commands WHERE project_id=p_project AND id=j.command_id;
 src:=sophia.put_text_source(p_project,c.actor_id,'text/markdown; charset=utf-8',msg.data->>'text');
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(p_project,j.input_source_id,src.id);
 UPDATE sophia.jobs SET state='succeeded', result_source_id=src.id, result_revision=result_revision+1, reason=NULL
  WHERE project_id=p_project AND id=j.id RETURNING * INTO j;
 UPDATE sophia.work_attempts SET state='checking' WHERE project_id=p_project AND id=b.attempt_id AND state IN ('running','admitted');
 IF g.status='running' THEN UPDATE sophia.goals SET status='checking', state_revision=state_revision+1 WHERE project_id=g.project_id AND id=g.id; END IF;
 PERFORM sophia.emit_service_event(p_project,'native_task.result_ready','job',j.id,j.result_revision+3,'native_task.result_ready',
  jsonb_build_array(src.id,j.input_source_id));
END $$;

REVOKE ALL ON FUNCTION sophia.runtime_research_submit(bytea,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.runtime_research_submit(bytea,text,text,jsonb) TO sophia_api;

COMMIT;
