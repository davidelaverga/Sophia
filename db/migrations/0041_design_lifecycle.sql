-- SDD-01 (binding map §6, §12; CX-0003): a design's lifecycle after admission. Withdrawal, Hold and Resume, and a
-- scoped edit of a published page.
-- * SDD-01-RF-0003. A withdrawal reaches a design and its review as it reaches research (0028, 0033). When a source a
--   report drew on is erased, every design or review still under way whose manifest's closure holds it is revoked in
--   the same transaction: its attempt is revoked (terminal), its session is stopped through a native.stop cleanup, its
--   renders in flight are cancelled, its candidates fail, and the task says why. A design is not rebuilt: the report it
--   designs now draws on a withdrawn source, and a new report is the way on (0033). A review's design is revoked with
--   it, and a design's reviews with it, so no review's end can decide a candidate. Every fenced operation of either
--   role is refused once its attempt is revoked or anything its manifest drew on is withdrawn, whatever revoked it or
--   not; a render's result is not read either. Settle is never fenced: usage already incurred still settles.
--   Publication rechecks the design, its attempt and the candidate's closure, so a late, replayed or racing decision
--   publishes nothing; a create whose closure is withdrawn is refused at dispatch.
-- * Hold and Resume. At Resume, a design or a review whose session never started (its create superseded by the Hold,
--   or admitted while the goal was held) is queued now under the Resume's authority, as unstarted research is (0028);
--   a goal reopened only by designs that have nothing left to do completes. A render queued or running during a Hold
--   waits for the Resume (0039); a late result after a Hold or Stop is refused by the fence and never publishes.
-- * Edit (B-16..B-18). A member asks to revise named sections of the HTML page of a report's current version
--   (request_design_edit). It is a new design task in mode edit on the report's goal and lineage allowance, bound to
--   the page's candidate: its first revision is that candidate's source, its scope the sections named (the page around
--   them and the shared stylesheet are protected unless named), its package the same frozen content, its instruction
--   the person's own contribution. A stale version, a page under design, work on the report under way, held or
--   stopped, a withdrawn source or a section the page does not have is refused, and nothing is written. The hard gate
--   adds two checks for an edit: the source differs from the base, and every protected section has the shape it had in
--   the base candidate's render at each target (its size, and each block's place in it, size, font size and issues);
--   a section that only moved down the page is reflow, allowed. Publication is the report's next version with the
--   revised page. The research task's HTML state stays the first design's.
-- * Runtime unit cutover (CX-0005, CX-0006). Research and design leave their native session open when their work is
--   accepted (0012: publication settles no binding), so a unit can never reach zero non-final bindings by itself. The
--   operator's reconcile_terminal_bindings stops, through the native boundary, each binding on a unit whose attempt
--   and goal have ended: a native.stop cleanup the old runtime answers like any Stop's, its checked receipt settling
--   the binding. Nothing else changes: attempts, jobs, goals, results, journals and usage reservations (an uncertain
--   one included) are kept as they are. It is granted to no role.
-- 0001–0040 are not edited; mission_erase_source, native_delivery_ineligible, research_queue_unstarted,
-- design_scope_of, runtime_design_context, runtime_design_render_result, runtime_review_context, design_fail,
-- design_publish, design_task_statement, review_task_statement, design_admit_review and design_candidate_failures are
-- replaced with the same signatures.
BEGIN;

-- --- withdrawal ---------------------------------------------------------------------------------------------------------

-- Whether a design or review attempt may not go on: it is revoked, or something its manifest drew on is withdrawn.
CREATE FUNCTION sophia.design_withdrawn(p_project uuid, p_attempt uuid, p_manifest uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.work_attempts wa WHERE wa.project_id=p_project AND wa.id=p_attempt AND wa.state='revoked')
  OR sophia.source_withdrawn(p_project,p_manifest) $$;
REVOKE ALL ON FUNCTION sophia.design_withdrawn(uuid,uuid,uuid) FROM PUBLIC;

-- design_scope_of (0039), replaced: the same, and fenced work whose attempt is revoked or whose manifest drew on a
-- withdrawn source is not active.
CREATE OR REPLACE FUNCTION sophia.design_scope_of(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb, p_kind text, p_fence boolean)
RETURNS sophia.design_scope LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_lease(p_token_sha256,p_unit,p_bridge); b sophia.execution_bindings; g sophia.goals;
 j sophia.jobs; dt sophia.design_tasks; owner sophia.runtime_commands; design uuid;
BEGIN
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=rt.project_id AND resource_id=rt.resource_id
  AND runtime_unit_id=rt.runtime_unit_id AND attempt_id=sophia.uuid_or_null(p_request->>'attemptId') AND native_session_id=p_request->>'nativeSessionId';
 IF NOT FOUND THEN RAISE EXCEPTION 'Design operation names an attempt or native session this runtime does not own' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=rt.project_id AND attempt_id=b.attempt_id
  AND kind=ANY(CASE WHEN p_kind IS NULL THEN ARRAY['design','design_review'] ELSE ARRAY[p_kind] END);
 IF NOT FOUND THEN RAISE EXCEPTION 'Design operation names an attempt that is not %', coalesce(replace(p_kind,'_',' '),'a design or review')
  USING ERRCODE='42501'; END IF;
 design:=CASE WHEN j.kind='design' THEN j.id ELSE (SELECT r.design_job_id FROM sophia.design_reviews r WHERE r.project_id=j.project_id AND r.job_id=j.id) END;
 SELECT * INTO dt FROM sophia.design_tasks WHERE project_id=rt.project_id AND job_id=design;
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts wa ON wa.project_id=g2.project_id AND wa.goal_id=g2.id
  WHERE wa.project_id=rt.project_id AND wa.id=b.attempt_id FOR UPDATE OF g2;
 IF p_fence THEN
  IF sophia.design_withdrawn(rt.project_id,b.attempt_id,j.input_source_id) THEN
   RAISE EXCEPTION 'Design work is not active: a source it drew on was withdrawn' USING ERRCODE='40001'; END IF;
  IF g.status NOT IN ('ready','running','checking') THEN RAISE EXCEPTION 'Design work is not active: the goal is %', g.status USING ERRCODE='40001'; END IF;
  IF j.state NOT IN ('pending','running') THEN RAISE EXCEPTION 'Design work is not active: the task has ended' USING ERRCODE='40001'; END IF;
  IF b.state IN ('settled','lost','stopping') THEN RAISE EXCEPTION 'Design work is not active: the session is %', b.state USING ERRCODE='40001'; END IF;
  SELECT * INTO owner FROM sophia.runtime_commands WHERE project_id=rt.project_id AND binding_id=b.id AND kind<>'inspect' ORDER BY seq DESC LIMIT 1;
  IF NOT FOUND OR owner.authority_epoch<>g.authority_epoch OR owner.kind NOT IN ('create','resume','steer','input') THEN
   RAISE EXCEPTION 'Design work is not active: its authority moved on (a Hold or Stop)' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN ROW(rt.project_id,rt.id,b.id,b.attempt_id,b.native_session_id,g.id,j.id,j.kind,design,dt.allowance_id,dt.actor_id,j.input_source_id)::sophia.design_scope;
END $$;

-- runtime_design_render_result (0039), replaced: still not fenced by a Hold, but nothing of a withdrawn design is read.
CREATE OR REPLACE FUNCTION sophia.runtime_design_render_result(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design',false);
BEGIN
 IF sophia.design_withdrawn(s.project_id,s.attempt_id,s.manifest_source_id) THEN
  RAISE EXCEPTION 'Design work is not active: a source it drew on was withdrawn' USING ERRCODE='40001'; END IF;
 RETURN sophia.design_render_view(s.project_id,sophia.design_render_of(s,p_request));
END $$;

-- Revoke one design that is under way, with every review of it under way (see the header): their attempts are revoked,
-- their sessions stopped, the reviews failed, and the design ends failed with the reason (design_fail).
CREATE FUNCTION sophia.design_revoke(p_project uuid, p_design uuid, p_reason text) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.design_tasks; j sophia.jobs; g sophia.goals; actor uuid;
BEGIN
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=p_project AND job_id=p_design FOR UPDATE;
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts wa ON wa.project_id=g2.project_id AND wa.goal_id=g2.id
  JOIN sophia.jobs dj ON dj.project_id=wa.project_id AND dj.attempt_id=wa.id WHERE dj.project_id=p_project AND dj.id=p_design FOR UPDATE OF g2;
 actor:=coalesce(sophia.actor_id(),t.actor_id);
 -- The reviews first, then the design.
 FOR j IN SELECT jj.* FROM sophia.jobs jj LEFT JOIN sophia.design_reviews r ON r.project_id=jj.project_id AND r.job_id=jj.id
   WHERE jj.project_id=p_project AND (jj.id=p_design OR r.design_job_id=p_design) AND jj.state IN ('pending','running','outcome_unknown')
   ORDER BY jj.id=p_design, jj.id FOR UPDATE OF jj LOOP
  UPDATE sophia.work_attempts SET state='revoked' WHERE project_id=p_project AND id=j.attempt_id;
  PERFORM sophia.research_stop_revoked(p_project,actor,j,g);
  IF j.kind='design_review' THEN
   UPDATE sophia.jobs SET state='failed', reason=left(p_reason,2000), lease_until=NULL, result_revision=result_revision+1
    WHERE project_id=p_project AND id=j.id;
  END IF;
 END LOOP;
 UPDATE sophia.design_candidates SET state='failed' WHERE project_id=p_project AND design_job_id=p_design
  AND state IN ('submitted','reviewing','needs_revision','reviewed','review_unresolved','self_review_only');
 IF t.state IN ('designing','reviewing') THEN PERFORM sophia.design_fail(p_project,p_design,'failed',p_reason); END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.design_revoke(uuid,uuid,text) FROM PUBLIC;

-- Revoke every design under way that drew on `p_source`, now no longer eligible: its own attempt's closure, or a
-- review of it whose closure holds the source. Returns the designs revoked.
CREATE FUNCTION sophia.design_revoke_source(p_project uuid, p_source uuid) RETURNS uuid[] LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE d uuid; revoked uuid[]:='{}';
BEGIN
 IF EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=p_project AND s.id=p_source AND s.eligible AND s.scope='project' AND s.state='ready') THEN
  RETURN revoked; END IF;
 FOR d IN SELECT DISTINCT coalesce(r.design_job_id,j.id) FROM sophia.jobs j
   JOIN sophia.work_attempts wa ON wa.project_id=j.project_id AND wa.id=j.attempt_id
   LEFT JOIN sophia.design_reviews r ON r.project_id=j.project_id AND r.job_id=j.id
   WHERE j.project_id=p_project AND j.kind IN ('design','design_review') AND j.state IN ('pending','running','outcome_unknown')
    AND wa.state<>'revoked' AND p_source IN (SELECT sophia.attempt_consumed_sources(p_project,j.attempt_id))
   ORDER BY 1 LOOP
  PERFORM sophia.design_revoke(p_project,d,'revoked: a source the report drew on was withdrawn');
  revoked:=revoked||d;
 END LOOP;
 RETURN revoked;
END $$;
REVOKE ALL ON FUNCTION sophia.design_revoke_source(uuid,uuid) FROM PUBLIC;

-- mission_erase_source (0028), replaced: the same, then the designs and reviews that drew on the erased source are
-- revoked too.
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
 PERFORM sophia.design_revoke_source(p_project,p_source);
END $$;

-- native_delivery_ineligible (0033), replaced: the same, and a design's or a review's create is refused, like
-- research's, when anything its work would read was withdrawn.
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
  WHEN o.destination='native.create' AND EXISTS(SELECT 1 FROM sophia.jobs j WHERE j.project_id=c.project_id AND j.command_id=c.id
    AND j.kind IN ('research','design','design_review') AND sophia.source_withdrawn(j.project_id,j.input_source_id))
   THEN 'a source its work would read was withdrawn'
  WHEN o.destination IN ('native.resume','native.steer','native.input') AND (
    EXISTS(SELECT 1 FROM sophia.work_attempts wa WHERE wa.project_id=b.project_id AND wa.id=b.attempt_id AND wa.state='revoked')
    OR EXISTS(SELECT 1 FROM sophia.attempt_consumed_sources(b.project_id,b.attempt_id) x
     LEFT JOIN sophia.source_objects s ON s.project_id=b.project_id AND s.id=x
     WHERE s.id IS NULL OR NOT (s.eligible AND s.scope='project' AND s.state='ready')))
   THEN 'a source its work read was withdrawn'
  WHEN rt.id IS NULL THEN 'no active runtime for its executor resource and runtime unit'
  WHEN b.state IN ('settled','lost') THEN 'its native binding is '||b.state
  ELSE NULL END $$;

-- --- how a design ends ------------------------------------------------------------------------------------------------------

-- design_fail (0040), replaced: the same; the research task's HTML state is the first design's (mode create), never
-- an edit's: a failed edit leaves the published page as it was.
CREATE OR REPLACE FUNCTION sophia.design_fail(p_project uuid, p_job uuid, p_state text, p_reason text) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.design_tasks; j sophia.jobs; g uuid;
BEGIN
 UPDATE sophia.design_tasks SET state=p_state, reason=left(p_reason,500) WHERE project_id=p_project AND job_id=p_job RETURNING * INTO t;
 UPDATE sophia.jobs SET state=CASE WHEN p_state='cancelled' THEN 'cancelled' ELSE 'failed' END, reason=left(p_reason,2000), lease_until=NULL,
  result_revision=result_revision+1 WHERE project_id=p_project AND id=p_job AND state IN ('pending','running','outcome_unknown') RETURNING * INTO j;
 UPDATE sophia.jobs rj SET state='cancelled', lease_until=NULL, reason='cancelled: the design ended without it'
  FROM sophia.render_jobs r WHERE r.project_id=p_project AND r.parent_job_id=p_job AND rj.project_id=r.project_id AND rj.id=r.job_id
   AND rj.state IN ('pending','running');
 UPDATE sophia.design_candidates SET state='failed' WHERE project_id=p_project AND design_job_id=p_job
  AND state IN ('submitted','reviewing','needs_revision');
 UPDATE sophia.work_attempts wa SET state='failed' FROM sophia.jobs dj WHERE dj.project_id=p_project AND dj.id=p_job
  AND wa.project_id=dj.project_id AND wa.id=dj.attempt_id AND wa.state NOT IN ('accepted','failed','stopped','revoked') AND p_state<>'cancelled';
 IF t.mode='create' THEN
  UPDATE sophia.research_tasks SET design_state='failed', design_reason=left('The HTML was not published: '||p_reason,300)
   WHERE project_id=p_project AND job_id=t.research_job_id;
 END IF;
 SELECT wa.goal_id INTO g FROM sophia.jobs dj JOIN sophia.work_attempts wa ON wa.project_id=dj.project_id AND wa.id=dj.attempt_id
  WHERE dj.project_id=p_project AND dj.id=p_job;
 IF j.id IS NOT NULL THEN
  PERFORM sophia.emit_service_event(p_project,'native_task.failed','job',j.id,j.result_revision+3,'native_task.design_ended');
 END IF;
 PERFORM sophia.design_goal_settle(p_project,g);
END $$;

-- design_publish (0040), replaced: the same, and nothing is published unless the design is still under way, its
-- candidate is the one decided, its attempt is not revoked and nothing the design or the page drew on is withdrawn (a
-- withdrawn one is revoked here). An edit's version says which sections it revised; the research task's HTML state
-- is the first design's alone.
CREATE OR REPLACE FUNCTION sophia.design_publish(p_project uuid, p_candidate uuid, p_label text, p_limits text[]) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.design_candidates; t sophia.design_tasks; a sophia.artifacts; v sophia.artifact_versions; nv sophia.artifact_versions;
 g sophia.goals; j sophia.jobs; dj sophia.jobs; body text; vnum integer; result sophia.source_objects; note text; kept text; revised text;
BEGIN
 SELECT * INTO c FROM sophia.design_candidates WHERE project_id=p_project AND id=p_candidate FOR UPDATE;
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=p_project AND job_id=c.design_job_id FOR UPDATE;
 SELECT * INTO dj FROM sophia.jobs WHERE project_id=p_project AND id=t.job_id FOR UPDATE;
 IF t.state NOT IN ('designing','reviewing') OR dj.state NOT IN ('pending','running','outcome_unknown')
  OR c.state NOT IN ('reviewed','review_unresolved','self_review_only') THEN
  RETURN jsonb_build_object('outcome','ignored','candidateId',c.id,'reason','the design has ended or moved on');
 END IF;
 IF sophia.design_withdrawn(p_project,dj.attempt_id,dj.input_source_id) OR sophia.source_withdrawn(p_project,c.compiled_source_id) THEN
  PERFORM sophia.design_revoke(p_project,t.job_id,'revoked: a source the report drew on was withdrawn');
  RETURN jsonb_build_object('outcome','revoked','candidateId',c.id);
 END IF;
 SELECT * INTO a FROM sophia.artifacts WHERE project_id=p_project AND id=t.artifact_id FOR UPDATE;
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=p_project AND id=t.base_version_id;
 IF a.stable_version_id IS DISTINCT FROM v.id THEN
  UPDATE sophia.design_candidates SET state='superseded' WHERE project_id=p_project AND id=c.id;
  PERFORM sophia.design_fail(p_project,t.job_id,'superseded','a newer version of the report was published while it was designed');
  RETURN jsonb_build_object('outcome','superseded','candidateId',c.id);
 END IF;
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts wa ON wa.project_id=g2.project_id AND wa.goal_id=g2.id
  WHERE wa.project_id=p_project AND wa.id=dj.attempt_id;
 SELECT x.body INTO body FROM sophia.source_texts x WHERE x.project_id=p_project AND x.source_id=v.source_id;
 SELECT coalesce(max(version_number),0)+1 INTO vnum FROM sophia.artifact_versions WHERE project_id=p_project AND artifact_id=a.id;
 revised:=(SELECT string_agg(x,', ' ORDER BY n) FROM jsonb_array_elements_text(t.scope->'sections') WITH ORDINALITY q(x,n));
 note:=CASE WHEN t.mode='edit' THEN 'Revises the designed HTML page ('||coalesce(revised,'the page')||')' ELSE 'Adds the designed HTML page' END
  ||CASE p_label WHEN 'reviewed' THEN ', reviewed by a separate visual reviewer'
   WHEN 'self_review_only' THEN ', checked by software; no separate reviewer was available'
   ELSE ', with visual review findings still open' END;
 kept:=CASE WHEN t.mode='edit' THEN 'Everything in v'||v.version_number||' is kept but the revised sections of its HTML page'
  ELSE 'Everything in v'||v.version_number||' is kept' END;
 UPDATE sophia.artifact_versions SET state='superseded' WHERE project_id=p_project AND id=v.id;
 INSERT INTO sophia.artifact_versions(project_id,artifact_id,parent_id,source_id,source_hash,goal_id,goal_revision,authority_epoch,state,
  validation_source_id,checks_passed,version_number,change_note,retained_note,change_facts,trigger,job_id,limitations)
 VALUES(p_project,a.id,v.id,v.source_id,v.source_hash,g.id,g.revision,g.authority_epoch,'stable',v.validation_source_id,v.checks_passed,vnum,
  note,kept,
  jsonb_build_object('versionNumber',vnum,'previousVersionId',v.id,'cited',v.change_facts->'cited','added','[]'::jsonb,'dropped','[]'::jsonb,
   'bytes',v.change_facts->'bytes','previousBytes',v.change_facts->'bytes','sections',sophia.section_facts(body,body),
   'notesFromFacts',true,'renditionOnly',true),
  jsonb_strip_nulls(jsonb_build_object('kind','design','taskId',t.job_id,'candidateId',c.id,'reviewState',p_label,
   'mode',CASE WHEN t.mode='edit' THEN 'edit' END,'sections',CASE WHEN t.mode='edit' THEN t.scope->'sections' END)),t.job_id,v.limitations)
 RETURNING * INTO nv;
 UPDATE sophia.artifacts SET stable_version_id=nv.id WHERE project_id=p_project AND id=a.id;
 INSERT INTO sophia.artifact_renditions(project_id,artifact_version_id,format,source_id,page_count,job_id,limitations,review_state,candidate_id)
 SELECT p_project,nv.id,r.format,r.source_id,r.page_count,r.job_id,r.limitations,r.review_state,r.candidate_id
  FROM sophia.artifact_renditions r WHERE r.project_id=p_project AND r.artifact_version_id=v.id AND r.format<>'html';
 INSERT INTO sophia.artifact_renditions(project_id,artifact_version_id,format,source_id,page_count,job_id,limitations,review_state,candidate_id)
 VALUES(p_project,nv.id,'html',c.compiled_source_id,NULL,t.job_id,coalesce(p_limits[1:8],'{}'),p_label,c.id);
 UPDATE sophia.design_candidates SET state='published', review_state=p_label WHERE project_id=p_project AND id=c.id;
 UPDATE sophia.design_tasks SET state='published', published_version_id=nv.id, reason=NULL WHERE project_id=p_project AND job_id=t.job_id;
 result:=sophia.put_text_source(p_project,t.actor_id,'text/markdown; charset=utf-8',
  'The designed HTML page of "'||a.title||'" was published as version '||vnum||'. '||note||'.'
  ||CASE WHEN cardinality(p_limits)>0 THEN E'\n\nLimitations:\n'||(SELECT string_agg('- '||l,E'\n') FROM unnest(p_limits[1:8]) l) ELSE '' END);
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(p_project,c.compiled_source_id,result.id) ON CONFLICT DO NOTHING;
 UPDATE sophia.jobs SET state='succeeded', result_source_id=result.id, result_revision=result_revision+1, reason=NULL
  WHERE project_id=p_project AND id=t.job_id RETURNING * INTO j;
 UPDATE sophia.work_attempts SET state='accepted' WHERE project_id=p_project AND id=j.attempt_id AND state NOT IN ('revoked','stopped');
 IF t.mode='create' THEN
  UPDATE sophia.research_tasks SET design_state='published', design_reason=NULL WHERE project_id=p_project AND job_id=t.research_job_id;
 END IF;
 PERFORM sophia.design_goal_settle(p_project,g.id);
 PERFORM sophia.emit_service_event(p_project,'artifact.rendition_ready','artifact',a.id,vnum,'artifact.rendition_ready',
  jsonb_build_array(nv.source_id,c.compiled_source_id));
 PERFORM sophia.emit_service_event(p_project,'native_task.result_ready','job',j.id,j.result_revision+3,'native_task.result_ready',
  jsonb_build_array(result.id,c.compiled_source_id));
 RETURN jsonb_build_object('outcome','published','candidateId',c.id,'versionId',nv.id,'versionNumber',vnum,'reviewState',p_label);
END $$;

-- --- Resume ---------------------------------------------------------------------------------------------------------------

-- research_queue_unstarted (0028), replaced: the same for research, and for a design or a review whose session never
-- started; then a goal that only designs reopened, with nothing left under way (its designs ended while it was held),
-- completes, and its Resume settles with nothing to deliver.
CREATE OR REPLACE FUNCTION sophia.research_queue_unstarted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.goals; r record; c sophia.commands;
BEGIN
 SELECT * INTO g FROM sophia.goals WHERE project_id=NEW.project_id AND id=NEW.id;
 IF g.status<>'running' OR g.authority_epoch<>NEW.authority_epoch THEN RETURN NULL; END IF;
 FOR r IN SELECT j.id AS job_id, j.command_id, b.id AS binding_id FROM sophia.jobs j
   JOIN sophia.work_attempts wa ON wa.project_id=j.project_id AND wa.id=j.attempt_id
   JOIN sophia.execution_bindings b ON b.project_id=j.project_id AND b.attempt_id=j.attempt_id
   WHERE j.project_id=g.project_id AND wa.goal_id=g.id AND j.kind IN ('research','design','design_review') AND j.parent_job_id IS NULL
    AND j.state='pending' AND wa.state='admitted' AND b.state IN ('created','settled')
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
 -- A goal that designs reopened, with nothing left under way: nothing to resume, and it completes.
 IF EXISTS(SELECT 1 FROM sophia.design_tasks t JOIN sophia.jobs dj ON dj.project_id=t.project_id AND dj.id=t.job_id
    JOIN sophia.work_attempts wa ON wa.project_id=dj.project_id AND wa.id=dj.attempt_id WHERE t.project_id=g.project_id AND wa.goal_id=g.id)
  AND NOT EXISTS(SELECT 1 FROM sophia.jobs oj JOIN sophia.work_attempts wa ON wa.project_id=oj.project_id AND wa.id=oj.attempt_id
    WHERE oj.project_id=g.project_id AND wa.goal_id=g.id AND oj.state IN ('pending','running'))
  AND NOT EXISTS(SELECT 1 FROM sophia.render_jobs o JOIN sophia.jobs oj ON oj.project_id=o.project_id AND oj.id=o.job_id
    WHERE o.project_id=g.project_id AND o.goal_id=g.id AND oj.state IN ('pending','running')) THEN
  UPDATE sophia.outbox SET state='superseded' WHERE project_id=g.project_id AND goal_id=g.id AND destination='native.resume' AND state='pending';
  PERFORM sophia.design_goal_settle(g.project_id,g.id);
 END IF;
 FOR c IN SELECT * FROM sophia.commands cc WHERE cc.project_id=g.project_id AND cc.goal_id=g.id AND cc.kind='resume'
   AND cc.authority_epoch=g.authority_epoch AND cc.state='admitted'
   AND NOT EXISTS(SELECT 1 FROM sophia.outbox o WHERE o.project_id=cc.project_id AND o.command_id=cc.id AND o.state<>'superseded') LOOP
  INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,goal_id,authority_epoch,cleanup)
  VALUES(c.project_id,c.id,'control.settle','control/empty',g.id,g.authority_epoch,true) ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN NULL;
END $$;

-- --- runtime unit cutover -------------------------------------------------------------------------------------------------

-- Operator only (see the header): stop each binding on `p_runtime_unit` whose attempt is accepted, failed, stopped or
-- revoked and whose goal is completed or stopped, and whose native session was never closed. One native.stop cleanup
-- each, under a stop command of its goal; a binding that never launched is settled where it stands; one with a stop
-- already in flight is left to it. Returns what it did.
CREATE FUNCTION sophia.reconcile_terminal_bindings(p_runtime_unit text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r record; cmd uuid; stopping jsonb:='[]'; settled jsonb:='[]'; in_flight integer:=0;
BEGIN
 FOR r IN SELECT b.project_id, b.id, b.state, g.id AS goal_id, g.revision, g.authority_epoch, c.actor_id
   FROM sophia.execution_bindings b JOIN sophia.work_attempts wa ON wa.project_id=b.project_id AND wa.id=b.attempt_id
   JOIN sophia.goals g ON g.project_id=wa.project_id AND g.id=wa.goal_id
   JOIN sophia.jobs j ON j.project_id=b.project_id AND j.attempt_id=b.attempt_id AND j.parent_job_id IS NULL
   JOIN sophia.commands c ON c.project_id=j.project_id AND c.id=j.command_id
   WHERE b.runtime_unit_id=p_runtime_unit AND b.state NOT IN ('settled','lost')
    AND wa.state IN ('accepted','failed','stopped','revoked') AND g.status IN ('completed','stopped')
   ORDER BY b.project_id, b.id FOR UPDATE OF b LOOP
  IF EXISTS(SELECT 1 FROM sophia.outbox o WHERE o.project_id=r.project_id AND o.binding_id=r.id AND o.destination='native.stop'
    AND o.state IN ('pending','dispatching','acknowledged')) THEN
   in_flight:=in_flight+1;
   CONTINUE;
  END IF;
  IF r.state='created' AND NOT EXISTS(SELECT 1 FROM sophia.runtime_commands rc WHERE rc.project_id=r.project_id AND rc.binding_id=r.id) THEN
   UPDATE sophia.execution_bindings SET state='settled' WHERE project_id=r.project_id AND id=r.id;
   settled:=settled||to_jsonb(r.id);
   CONTINUE;
  END IF;
  cmd:=gen_random_uuid();
  INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,state)
  VALUES(r.project_id,cmd,r.actor_id,r.goal_id,r.revision,r.authority_epoch,'stop','reconcile:'||r.id||':'||left(cmd::text,8),
   jsonb_build_object('kind','reconcile','bindingId',r.id),'admitted');
  UPDATE sophia.execution_bindings SET state='stopping' WHERE project_id=r.project_id AND id=r.id;
  INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch,cleanup)
  VALUES(r.project_id,cmd,'native.stop','binding/'||r.id,r.id,r.goal_id,r.authority_epoch,true);
  stopping:=stopping||to_jsonb(r.id);
 END LOOP;
 RETURN jsonb_build_object('stopping',stopping,'settled',settled,'inFlight',in_flight);
END $$;
REVOKE ALL ON FUNCTION sophia.reconcile_terminal_bindings(text) FROM PUBLIC;

-- --- edit -------------------------------------------------------------------------------------------------------------------

-- What an edit binds: the published candidate it revises, the person's instruction and the request's key.
ALTER TABLE sophia.design_tasks
 ADD COLUMN base_candidate_id uuid,
 ADD COLUMN instruction_source_id uuid,
 ADD COLUMN request_key text CHECK(request_key IS NULL OR length(request_key) BETWEEN 1 AND 160),
 ADD CONSTRAINT design_tasks_base_candidate_fk FOREIGN KEY(project_id,base_candidate_id) REFERENCES sophia.design_candidates(project_id,id),
 ADD CONSTRAINT design_tasks_instruction_fk FOREIGN KEY(project_id,instruction_source_id) REFERENCES sophia.source_objects(project_id,id),
 ADD CONSTRAINT design_tasks_edit_binding CHECK((mode='edit')=(base_candidate_id IS NOT NULL) AND (mode='edit')=(instruction_source_id IS NOT NULL)
  AND (mode='edit')=(request_key IS NOT NULL));
CREATE UNIQUE INDEX design_tasks_request_key ON sophia.design_tasks(project_id,actor_id,request_key) WHERE request_key IS NOT NULL;

-- An edit as its request is answered.
CREATE FUNCTION sophia.design_edit_receipt(t sophia.design_tasks) RETURNS jsonb LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('taskId',t.job_id,'state',t.state,'versionId',t.base_version_id,'baseCandidateId',t.base_candidate_id,
  'sections',t.scope->'sections','shell',coalesce((t.scope->>'shell')::boolean,false),'styles',coalesce((t.scope->>'styles')::boolean,false)) $$;
REVOKE ALL ON FUNCTION sophia.design_edit_receipt(sophia.design_tasks) FROM PUBLIC;

-- The sections an edit names, checked against the page it revises; and the scope they make.
CREATE FUNCTION sophia.design_edit_scope(d sophia.design_sources, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE sections text[]; missing text;
BEGIN
 IF jsonb_typeof(p_request->'sections')<>'array' OR jsonb_array_length(p_request->'sections') NOT BETWEEN 1 AND 16 OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(p_request->'sections') x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' !~ '^[a-z][a-z0-9-]{0,63}$') THEN
  RAISE EXCEPTION 'An edit names 1 to 16 sections of the page' USING ERRCODE='22023'; END IF;
 IF (p_request ? 'shell' AND jsonb_typeof(p_request->'shell')<>'boolean') OR (p_request ? 'styles' AND jsonb_typeof(p_request->'styles')<>'boolean') THEN
  RAISE EXCEPTION 'An edit''s shell and styles are true or false' USING ERRCODE='22023'; END IF;
 SELECT array_agg(DISTINCT x ORDER BY x) INTO sections FROM jsonb_array_elements_text(p_request->'sections') x;
 SELECT string_agg(x,', ' ORDER BY x) INTO missing FROM unnest(sections) x
  WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.sections) s WHERE s->>'id'=x);
 IF missing IS NOT NULL THEN RAISE EXCEPTION 'The page has no section %', missing USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('sections',to_jsonb(sections),'shell',coalesce((p_request->>'shell')::boolean,false),
  'styles',coalesce((p_request->>'styles')::boolean,false));
END $$;
REVOKE ALL ON FUNCTION sophia.design_edit_scope(sophia.design_sources,jsonb) FROM PUBLIC;

-- Where an edit of a version's page starts, or why it cannot (see the header): the version is the report's current
-- one and has a designed page, nothing it drew on is withdrawn, no design of it is under way, the work on the report is
-- done, and a designer and a capture renderer are ready.
CREATE FUNCTION sophia.design_edit_base(p_project uuid, p_version uuid, OUT v sophia.artifact_versions, OUT x sophia.artifact_renditions,
 OUT c sophia.design_candidates, OUT bt sophia.design_tasks, OUT g sophia.goals, OUT rt sophia.runtime_instances)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a sophia.artifacts; req jsonb;
BEGIN
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=p_project AND id=p_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'Report version not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO a FROM sophia.artifacts WHERE project_id=p_project AND id=v.artifact_id FOR UPDATE;
 IF a.stable_version_id IS DISTINCT FROM v.id THEN
  RAISE EXCEPTION 'Stale report version: a newer version of this report exists' USING ERRCODE='40001'; END IF;
 SELECT * INTO x FROM sophia.artifact_renditions WHERE project_id=p_project AND artifact_version_id=v.id AND format='html';
 IF NOT FOUND OR x.candidate_id IS NULL THEN RAISE EXCEPTION 'This version has no designed HTML page to revise' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM sophia.design_candidates WHERE project_id=p_project AND id=x.candidate_id;
 SELECT * INTO bt FROM sophia.design_tasks WHERE project_id=p_project AND job_id=c.design_job_id;
 IF bt.markdown_sha256<>v.source_hash THEN RAISE EXCEPTION 'This version''s page was designed from other content' USING ERRCODE='22023'; END IF;
 IF sophia.source_withdrawn(p_project,v.source_id) OR sophia.source_withdrawn(p_project,x.source_id) THEN
  RAISE EXCEPTION 'Source not released and eligible for project work: this report draws on a withdrawn source' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.design_tasks t WHERE t.project_id=p_project AND t.base_version_id=v.id AND t.state IN ('designing','reviewing')) THEN
  RAISE EXCEPTION 'A design of this page is already under way' USING ERRCODE='40001'; END IF;
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts wa ON wa.project_id=g2.project_id AND wa.goal_id=g2.id
  JOIN sophia.jobs dj ON dj.project_id=wa.project_id AND dj.attempt_id=wa.id WHERE dj.project_id=p_project AND dj.id=bt.job_id FOR UPDATE OF g2;
 IF g.status IN ('holding','held') THEN RAISE EXCEPTION 'The work on this report is held: resume it first' USING ERRCODE='40001'; END IF;
 IF g.status IN ('stopping','stopped') THEN RAISE EXCEPTION 'The work on this report was stopped' USING ERRCODE='40001'; END IF;
 IF g.status<>'completed' THEN RAISE EXCEPTION 'Work on this report is under way: ask for the edit once it is done' USING ERRCODE='40001'; END IF;
 IF (SELECT count(*) FROM sophia.design_tasks t WHERE t.project_id=p_project AND t.artifact_id=a.id)>=16 THEN
  RAISE EXCEPTION 'Design edit limit reached' USING ERRCODE='55000'; END IF;
 SELECT design_request INTO req FROM sophia.research_tasks WHERE project_id=p_project AND job_id=bt.research_job_id;
 rt:=sophia.role_runtime(p_project,req->'designer'->>'role',req->'designer'->>'route');
 IF rt.id IS NULL THEN RAISE EXCEPTION 'HTML design is unavailable: no runtime is ready with the designer' USING ERRCODE='55000'; END IF;
 IF NOT sophia.capture_renderer_ready() THEN
  RAISE EXCEPTION 'HTML design is unavailable: no capture renderer is asking for work' USING ERRCODE='55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.design_edit_base(uuid,uuid) FROM PUBLIC;

-- POST /api/v1/projects/{projectId}/html-edits (and the guide's revise_html_page, v1.3): revise named sections of the
-- HTML page of a report's current version (see the header). p_request: {versionId, sections, shell?, styles?,
-- instructionSourceId, requestKey}; the instruction is the person's own contribution. Repeating the request key
-- returns the edit already admitted. Inside withActor(..., 'write').
CREATE FUNCTION sophia.request_design_edit(p_project uuid, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE actor uuid:=sophia.actor_id(); key text:=p_request->>'requestKey'; prior sophia.design_tasks; base record; d sophia.design_sources;
 scope jsonb; instruction text; src uuid:=sophia.uuid_or_null(p_request->>'instructionSourceId'); job uuid:=gen_random_uuid(); manifest jsonb;
 t sophia.design_tasks;
BEGIN
 IF actor IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF key IS NULL OR length(key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO prior FROM sophia.design_tasks WHERE project_id=p_project AND actor_id=actor AND request_key=key;
 IF FOUND THEN
  IF prior.base_version_id IS DISTINCT FROM sophia.uuid_or_null(p_request->>'versionId') OR jsonb_typeof(p_request->'sections')<>'array'
   OR prior.scope->'sections' IS DISTINCT FROM (SELECT to_jsonb(array_agg(DISTINCT x ORDER BY x)) FROM jsonb_array_elements_text(p_request->'sections') x) THEN
   RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN sophia.design_edit_receipt(prior);
 END IF;
 SELECT * INTO base FROM sophia.design_edit_base(p_project,sophia.uuid_or_null(p_request->>'versionId'));
 SELECT * INTO d FROM sophia.design_sources WHERE project_id=p_project AND id=(base.c).source_id;
 scope:=sophia.design_edit_scope(d,p_request);
 SELECT x.body INTO instruction FROM sophia.source_objects s JOIN sophia.source_texts x ON x.project_id=s.project_id AND x.source_id=s.id
  WHERE s.project_id=p_project AND s.id=src AND s.eligible AND s.scope='project' AND s.state='ready';
 IF instruction IS NULL THEN RAISE EXCEPTION 'Source not released and eligible for project work: the edit''s instruction' USING ERRCODE='42501'; END IF;
 IF length(btrim(instruction)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'An edit''s instruction is 1 to 2000 characters' USING ERRCODE='22023'; END IF;
 manifest:=jsonb_build_object('schema','sophia.design-manifest.v1','projectId',p_project,'taskId',job,'researchTaskId',(base.bt).research_job_id,
  'role',(base.bt).role,'route',(base.bt).route,'mode','edit','artifactId',(base.v).artifact_id,'versionId',(base.v).id,
  'versionNumber',(base.v).version_number,'markdownSourceId',(base.v).source_id,'markdownSha256',(base.v).source_hash,
  'targets',to_jsonb((base.bt).targets),'language',(base.bt).language,'baseCandidateId',(base.c).id,'baseRevisionId',d.id,
  'baseSha256',d.package_sha256,'scope',scope,'instruction',btrim(instruction));
 UPDATE sophia.goals SET revision=revision+1, state_revision=state_revision+1, status='ready' WHERE project_id=p_project AND id=(base.g).id;
 PERFORM sophia.design_attempt(p_project,(base.g).id,actor,'design',job,base.rt,manifest,ARRAY[(base.v).source_id,(base.x).source_id,src],
  (base.v).artifact_id);
 INSERT INTO sophia.design_tasks(project_id,job_id,research_job_id,root_job_id,allowance_id,actor_id,artifact_id,base_version_id,markdown_sha256,
  mode,language,targets,role,route,package_source_id,package_sha256,scope,base_candidate_id,instruction_source_id,request_key)
 VALUES(p_project,job,(base.bt).research_job_id,(base.bt).root_job_id,(base.bt).allowance_id,actor,(base.v).artifact_id,(base.v).id,
  (base.v).source_hash,'edit',(base.bt).language,(base.bt).targets,(base.bt).role,(base.bt).route,(base.bt).package_source_id,
  (base.bt).package_sha256,scope,(base.c).id,src,key)
 RETURNING * INTO t;
 -- Its first revision is the published candidate's source, as it was.
 INSERT INTO sophia.design_sources(project_id,design_job_id,seq,base_id,call_key,kind,package_sha256,files,sections,complete,findings,finding_count,
  compiled_source_id)
 VALUES(p_project,job,1,NULL,'base:'||(base.c).id,'write',d.package_sha256,d.files,d.sections,d.complete,d.findings,d.finding_count,d.compiled_source_id);
 PERFORM sophia.emit_service_event(p_project,'native_task.admitted','job',job,1,'native_task.design_edit',jsonb_build_array((base.g).id,(base.v).source_id));
 RETURN sophia.design_edit_receipt(t);
END $$;
REVOKE ALL ON FUNCTION sophia.request_design_edit(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.request_design_edit(uuid,jsonb) TO sophia_api;

-- Each protected section's shape in a capture receipt, per target: its size, and every block in it with its place
-- relative to the section, its size, its font size and its issues (rounded to whole pixels, so a section that only
-- moved keeps its shape).
CREATE FUNCTION sophia.design_section_shapes(p_receipt jsonb, p_scoped text[]) RETURNS TABLE(target text, section text, shape jsonb)
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT x->>'id', s->>'id', jsonb_build_object('width',round((s->>'width')::numeric),'height',round((s->>'height')::numeric),
  'blocks',(SELECT coalesce(jsonb_agg(jsonb_build_array(b->>'id',round((b->'box'->>'x')::numeric-(s->>'x')::numeric),
     round((b->'box'->>'y')::numeric-(s->>'y')::numeric),round((b->'box'->>'width')::numeric),round((b->'box'->>'height')::numeric),
     b->'fontPx',coalesce(b->'issues','[]')) ORDER BY b->>'id'),'[]')
   FROM jsonb_array_elements(coalesce(x->'page'->'blocks','[]')) b WHERE b->>'section'=s->>'id'))
 FROM jsonb_array_elements(coalesce(p_receipt->'targets','[]')) x, jsonb_array_elements(coalesce(x->'page'->'sections','[]')) s
 WHERE NOT (s->>'id'=ANY(p_scoped)) $$;
REVOKE ALL ON FUNCTION sophia.design_section_shapes(jsonb,text[]) FROM PUBLIC;

-- What keeps an edit's candidate from the gate beyond a create's: a source unchanged from the base, and a protected
-- section whose shape differs from the base candidate's render at a target (see the header). Empty for a create, or
-- for an edit whose scope names every section.
CREATE FUNCTION sophia.design_edit_failures(t sophia.design_tasks, d sophia.design_sources, r sophia.render_jobs) RETURNS text[] LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 WITH base AS (SELECT bd.package_sha256, br.receipt FROM sophia.design_candidates bc
   JOIN sophia.design_sources bd ON bd.project_id=bc.project_id AND bd.id=bc.source_id
   JOIN sophia.render_jobs br ON br.project_id=bc.project_id AND br.job_id=bc.render_job_id
   WHERE bc.project_id=t.project_id AND bc.id=t.base_candidate_id),
 scoped AS (SELECT ARRAY(SELECT jsonb_array_elements_text(coalesce(t.scope->'sections','[]'))) AS ids),
 b AS (SELECT q.* FROM base, scoped, sophia.design_section_shapes(base.receipt,scoped.ids) q),
 n AS (SELECT q.* FROM scoped, sophia.design_section_shapes(r.receipt,scoped.ids) q)
 SELECT CASE WHEN t.mode<>'edit' THEN '{}'::text[] ELSE
  ARRAY(SELECT 'the source is unchanged from the published page: nothing of the request was made' FROM base WHERE base.package_sha256=d.package_sha256)
  ||ARRAY(SELECT 'protected section '||b.section||' changed at '||b.target||' (only the sections in scope may change; moving down the page is allowed)'
    FROM b LEFT JOIN n ON n.target=b.target AND n.section=b.section, scoped
    WHERE NOT ('*'=ANY(scoped.ids)) AND n.shape IS DISTINCT FROM b.shape ORDER BY b.target, b.section) END $$;
REVOKE ALL ON FUNCTION sophia.design_edit_failures(sophia.design_tasks,sophia.design_sources,sophia.render_jobs) FROM PUBLIC;

-- design_candidate_failures (0040), replaced: the same, and an edit's own checks.
CREATE OR REPLACE FUNCTION sophia.design_candidate_failures(t sophia.design_tasks, d sophia.design_sources, r sophia.render_jobs, rj sophia.jobs)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT (ARRAY(SELECT x FROM unnest(ARRAY[
   CASE WHEN NOT d.complete THEN 'the source does not carry every block, citation and source of the research ('||d.finding_count||' findings)' END,
   CASE WHEN r.design_source_id<>d.id THEN 'the render is of another revision' END,
   CASE WHEN r.sections IS NOT NULL THEN 'the render captured only some sections: render the whole page' END,
   CASE WHEN NOT r.targets @> t.targets THEN 'the render did not capture every target of the task' END,
   CASE WHEN rj.state<>'succeeded' THEN 'the render did not succeed ('||rj.state||')' END]) x WHERE x IS NOT NULL)
  ||CASE WHEN rj.state='succeeded' THEN sophia.design_gate_failures(r.receipt,sophia.design_package(t.project_id,t.job_id),t.targets)
     ||sophia.design_edit_failures(t,d,r) ELSE '{}' END)[1:40] $$;

-- --- what the roles are told -------------------------------------------------------------------------------------------------

-- The scope of an edit in words: the sections, and what else it may change.
CREATE FUNCTION sophia.design_scope_words(p_scope jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT 'the sections '||coalesce((SELECT string_agg(x,', ' ORDER BY n) FROM jsonb_array_elements_text(p_scope->'sections') WITH ORDINALITY q(x,n)),'(none)')
  ||CASE WHEN (p_scope->>'shell')::boolean THEN ', the page around them' ELSE '' END
  ||CASE WHEN (p_scope->>'styles')::boolean THEN ', the shared stylesheet' ELSE '' END $$;
REVOKE ALL ON FUNCTION sophia.design_scope_words(jsonb) FROM PUBLIC;

-- design_task_statement (0040), replaced: the same for a create; an edit's says what the person asked, the scope, and
-- that it starts from the published page.
CREATE OR REPLACE FUNCTION sophia.design_task_statement(p_manifest jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p_manifest->>'mode'='edit' THEN
  'HTML edit task. A person asked to revise the published HTML page of the research report named below:'||E'\n'
  || '"'||(p_manifest->>'instruction')||'"'||E'\n'
  || 'Change only '||sophia.design_scope_words(p_manifest->'scope')||'. Every other section, '
  || CASE WHEN (p_manifest->'scope'->>'shell')::boolean THEN '' ELSE 'the page around the sections, ' END
  || CASE WHEN (p_manifest->'scope'->>'styles')::boolean THEN '' ELSE 'the shared stylesheet, ' END
  || 'and the content package''s blocks, citations and sources stay as they are; protected sections must look the same in the render '
  || '(moving down the page is fine). Start with design_read_context: your current source is the published page. Change it with '
  || 'design_patch_source, render it with design_render and look at the real captures with design_inspect_render before you judge it. '
  || 'Submit with design_submit_candidate only from a render of your latest source that passed every check; if the request cannot be '
  || 'done inside this scope, call design_report_blocker and name the scope it needs.'||E'\n\n'
  || 'Manifest ('||(p_manifest->>'schema')||'):'||E'\n'||jsonb_pretty(p_manifest)
 ELSE
  'HTML design task. Design a self-contained, readable HTML page for the published research report named below, '
  || 'at the targets it names. Start with design_read_context: it holds the request, the frozen content package (every block, '
  || 'citation, source and limitation the page must carry, unchanged), your source revisions, renders and the remaining allowance.'||E'\n'
  || 'Write the page with design_write_source, change it with design_patch_source, render it with design_render and look at the '
  || 'real captures with design_inspect_render before you judge it. Submit a candidate with design_submit_candidate only from '
  || 'a render of your latest source that passed every check; or call design_report_blocker when it cannot be done.'||E'\n\n'
  || 'Manifest ('||(p_manifest->>'schema')||'):'||E'\n'||jsonb_pretty(p_manifest) END $$;

-- review_task_statement (0040), replaced: the same for a create's review; an edit's names what was asked and the scope.
CREATE OR REPLACE FUNCTION sophia.review_task_statement(p_manifest jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT 'Visual review task. Review one HTML candidate independently. Start with review_read_context: it holds the original '
 || 'request, the frozen content package, your criteria and the candidate with its render. Look at the real captures with '
 || 'review_inspect_render: each target''s overview and every section at one target at least. You cannot change the page. '
 || 'Finish with review_submit_result: pass, needs_revision with the findings that must change, or blocked when you cannot judge.'
 || CASE WHEN p_manifest->>'mode'='edit' THEN E'\n'||'This candidate is an edit of a published page. The person asked: "'
  || (p_manifest->>'instruction')||'". Only '||sophia.design_scope_words(p_manifest->'scope')||' could change. Judge whether the request '
  || 'was done there, that the protected sections look as before (moving down the page is fine), and the whole page''s reading; do not ask '
  || 'for a broad redesign when a local change was requested.' ELSE '' END
 || E'\n\n'||'Manifest ('||(p_manifest->>'schema')||'):'||E'\n'||jsonb_pretty(p_manifest) $$;

-- design_admit_review (0040), replaced: the same, and an edit's review manifest names the person's request and the
-- scope (never the author's account).
CREATE OR REPLACE FUNCTION sophia.design_admit_review(p_project uuid, p_candidate uuid) RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.design_candidates; t sophia.design_tasks; req jsonb; rt sophia.runtime_instances; goal uuid; job uuid:=gen_random_uuid();
 criteria text:=encode(sha256(convert_to(sophia.review_criteria(),'UTF8')),'hex'); manifest jsonb; instruction text;
BEGIN
 SELECT * INTO c FROM sophia.design_candidates WHERE project_id=p_project AND id=p_candidate FOR UPDATE;
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=p_project AND job_id=c.design_job_id FOR UPDATE;
 SELECT design_request INTO req FROM sophia.research_tasks WHERE project_id=p_project AND job_id=t.research_job_id;
 IF jsonb_typeof(req->'reviewer')<>'object' THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM sophia.design_reviews WHERE project_id=p_project AND design_job_id=t.job_id)>=t.max_rounds THEN RETURN NULL; END IF;
 rt:=sophia.role_runtime(p_project,req->'reviewer'->>'role',req->'reviewer'->>'route');
 IF rt.id IS NULL THEN RETURN NULL; END IF;
 SELECT wa.goal_id INTO goal FROM sophia.jobs dj JOIN sophia.work_attempts wa ON wa.project_id=dj.project_id AND wa.id=dj.attempt_id
  WHERE dj.project_id=p_project AND dj.id=t.job_id;
 SELECT x.body INTO instruction FROM sophia.source_texts x WHERE x.project_id=p_project AND x.source_id=t.instruction_source_id;
 manifest:=jsonb_build_object('schema','sophia.review-manifest.v1','projectId',p_project,'reviewTaskId',job,'designTaskId',t.job_id,
  'candidateId',c.id,'round',c.round,'role',req->'reviewer'->>'role','route',req->'reviewer'->>'route','targets',to_jsonb(t.targets),
  'criteriaSha256',criteria)
  ||CASE WHEN t.mode='edit' THEN jsonb_build_object('mode','edit','scope',t.scope,'instruction',btrim(instruction)) ELSE '{}'::jsonb END;
 PERFORM sophia.design_attempt(p_project,goal,t.actor_id,'design_review',job,rt,manifest,
  ARRAY[t.package_source_id,c.compiled_source_id]||CASE WHEN t.instruction_source_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[t.instruction_source_id] END,
  t.artifact_id);
 INSERT INTO sophia.design_reviews(project_id,job_id,candidate_id,design_job_id,allowance_id,actor_id,role,route,criteria_sha256)
 VALUES(p_project,job,c.id,t.job_id,t.allowance_id,t.actor_id,req->'reviewer'->>'role',req->'reviewer'->>'route',criteria);
 UPDATE sophia.design_candidates SET state='reviewing' WHERE project_id=p_project AND id=c.id;
 UPDATE sophia.design_tasks SET state='reviewing' WHERE project_id=p_project AND job_id=t.job_id;
 PERFORM sophia.emit_service_event(p_project,'native_task.progress','job',t.job_id,
  (SELECT result_revision+3 FROM sophia.jobs WHERE project_id=p_project AND id=t.job_id),'native_task.design_review_admitted',jsonb_build_array(c.id));
 RETURN job;
END $$;

-- runtime_design_context (0039), replaced: the same, and an edit's request says what the person asked and which
-- candidate it revises.
CREATE OR REPLACE FUNCTION sophia.runtime_design_context(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design',true); t sophia.design_tasks;
 v sophia.artifact_versions; a sophia.artifacts; pkg sophia.source_texts; cur sophia.design_sources; al sophia.research_allowances;
 question text; instruction text;
BEGIN
 IF p_request ? 'sourceId' THEN RETURN sophia.design_text_page(s,p_request); END IF;
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=s.project_id AND id=t.base_version_id;
 SELECT * INTO a FROM sophia.artifacts WHERE project_id=s.project_id AND id=t.artifact_id;
 SELECT * INTO pkg FROM sophia.source_texts WHERE project_id=s.project_id AND source_id=t.package_source_id;
 SELECT * INTO cur FROM sophia.design_sources WHERE project_id=s.project_id AND design_job_id=s.job_id ORDER BY seq DESC LIMIT 1;
 SELECT * INTO al FROM sophia.research_allowances WHERE project_id=s.project_id AND id=t.allowance_id;
 SELECT x.body INTO question FROM sophia.research_tasks rt JOIN sophia.source_texts x ON x.project_id=rt.project_id AND x.source_id=rt.question_source_id
  WHERE rt.project_id=s.project_id AND rt.job_id=t.research_job_id;
 SELECT x.body INTO instruction FROM sophia.source_texts x WHERE x.project_id=s.project_id AND x.source_id=t.instruction_source_id;
 RETURN sophia.without_null_members(jsonb_build_object('taskId',t.job_id,'mode',t.mode,'language',t.language,'targets',to_jsonb(t.targets),
  'scope',t.scope,'state',t.state,
  'limits',jsonb_build_object('maxRepairs',t.max_repairs,'maxRounds',t.max_rounds,
   'candidates',(SELECT count(*) FROM sophia.design_candidates c WHERE c.project_id=s.project_id AND c.design_job_id=t.job_id),
   'reviews',(SELECT count(*) FROM sophia.design_reviews r WHERE r.project_id=s.project_id AND r.design_job_id=t.job_id),
   'renders',(SELECT count(*) FROM sophia.render_jobs r WHERE r.project_id=s.project_id AND r.parent_job_id=t.job_id),'maxRenders',16),
  'request',sophia.without_null_members(jsonb_build_object('question',question,'title',a.title,'artifactId',a.id,'versionId',v.id,
   'versionNumber',v.version_number,'markdownSourceId',v.source_id,'markdownSha256',t.markdown_sha256,'limitations',to_jsonb(v.limitations),
   'instruction',btrim(instruction),'baseCandidateId',t.base_candidate_id)),
  'package',jsonb_build_object('sourceId',t.package_source_id,'sha256',t.package_sha256,'totalChars',char_length(pkg.body),
   'content',CASE WHEN char_length(pkg.body)<=60000 THEN pkg.body::jsonb END),
  'revision',CASE WHEN cur.id IS NULL THEN NULL ELSE sophia.design_source_view(cur) END,
  'candidates',(SELECT coalesce(jsonb_agg(jsonb_build_object('candidateId',c.id,'round',c.round,'state',c.state,'revisionId',c.source_id,
    'renderJobId',c.render_job_id) ORDER BY c.round),'[]') FROM sophia.design_candidates c WHERE c.project_id=s.project_id AND c.design_job_id=t.job_id),
  'reviews',(SELECT coalesce(jsonb_agg(jsonb_build_object('candidateId',r.candidate_id,'verdict',r.verdict,'findings',r.findings,'summary',r.summary)
    ORDER BY r.submitted_at),'[]') FROM sophia.design_reviews r WHERE r.project_id=s.project_id AND r.design_job_id=t.job_id AND r.verdict IS NOT NULL),
  'workRecord',jsonb_build_object('entries',(SELECT count(*) FROM sophia.design_work_entries w WHERE w.project_id=s.project_id AND w.design_job_id=t.job_id),
   'latest',(SELECT coalesce(jsonb_agg(jsonb_build_object('seq',w.seq,'kind',w.kind,'body',w.body) ORDER BY w.seq),'[]') FROM (
     SELECT * FROM sophia.design_work_entries w2 WHERE w2.project_id=s.project_id AND w2.design_job_id=t.job_id ORDER BY w2.seq DESC LIMIT 8) w)),
  'allowance',jsonb_build_object('capUsd',al.cap_usd,'committedUsd',al.reserved_usd+al.spent_usd+al.uncertain_usd)));
END $$;

-- runtime_review_context (0039), replaced: the same, and an edit's request names what the person asked and the scope.
CREATE OR REPLACE FUNCTION sophia.runtime_review_context(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design_review',true);
 c sophia.design_candidates:=sophia.review_candidate(s); t sophia.design_tasks; d sophia.design_sources; rv sophia.design_reviews;
 pkg sophia.source_texts; a sophia.artifacts; question text; instruction text;
BEGIN
 IF p_request ? 'sourceId' THEN RETURN sophia.design_text_page(s,p_request); END IF;
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=s.project_id AND job_id=s.design_job_id;
 SELECT * INTO d FROM sophia.design_sources WHERE project_id=s.project_id AND id=c.source_id;
 SELECT * INTO rv FROM sophia.design_reviews WHERE project_id=s.project_id AND job_id=s.job_id;
 SELECT * INTO pkg FROM sophia.source_texts WHERE project_id=s.project_id AND source_id=t.package_source_id;
 SELECT * INTO a FROM sophia.artifacts WHERE project_id=s.project_id AND id=t.artifact_id;
 SELECT x.body INTO question FROM sophia.research_tasks rt JOIN sophia.source_texts x ON x.project_id=rt.project_id AND x.source_id=rt.question_source_id
  WHERE rt.project_id=s.project_id AND rt.job_id=t.research_job_id;
 SELECT x.body INTO instruction FROM sophia.source_texts x WHERE x.project_id=s.project_id AND x.source_id=t.instruction_source_id;
 RETURN sophia.without_null_members(jsonb_build_object('reviewTaskId',s.job_id,'candidateId',c.id,'round',c.round,
  'criteria',jsonb_build_object('text',sophia.review_criteria(),'sha256',rv.criteria_sha256),
  'request',sophia.without_null_members(jsonb_build_object('question',question,'title',a.title,'language',t.language,'targets',to_jsonb(t.targets),
   'mode',t.mode,'instruction',btrim(instruction),'scope',CASE WHEN t.mode='edit' THEN t.scope END)),
  'package',jsonb_build_object('sourceId',t.package_source_id,'sha256',t.package_sha256,'totalChars',char_length(pkg.body),
   'content',CASE WHEN char_length(pkg.body)<=60000 THEN pkg.body::jsonb END),
  'candidate',jsonb_build_object('revisionId',d.id,'sha256',d.package_sha256,'files',d.files,'sections',d.sections,
   'compiledSourceId',c.compiled_source_id),
  'render',sophia.design_render_view(s.project_id,c.render_job_id),
  'inspected',to_jsonb(rv.inspected)));
END $$;

COMMIT;
