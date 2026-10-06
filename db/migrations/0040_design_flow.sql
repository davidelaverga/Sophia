-- SDD-01 (binding map §6): how an HTML design is asked for, starts, is reviewed, repaired and published.
-- * Admission is format-driven. start_research with html admits research exactly as before (the research specialist,
--   its outputs and prompt unchanged) and, in the same transaction, request_research_design records the HTML request
--   on the task with the designer and reviewer the registry names. Without a ready designer and a capture renderer it
--   is refused ('HTML design is unavailable'), and the whole admission with it: the person is offered Markdown, never
--   a fixed template.
-- * Handoff. When research publishes, the same transaction admits the design attempt on the same goal and reopens it,
--   as a later PDF does (design_handoff, from runtime_research_submit). The API freezes the content package of the
--   published version in that transaction too (design_package_input, design_freeze_package). When no designer or
--   capture renderer is ready by then, the report is published as it is and the task says why there is no HTML.
-- * The designer submits a candidate (runtime_design_submit) only when its render passes the hard gate (0039). Then
--   the service admits an independent review when a runtime advertises the reviewer; otherwise the candidate is
--   self_review_only and is published so, labelled.
-- * The review (runtime_review_submit) passes, asks for a revision, or cannot judge. A pass publishes. A revision goes
--   back to the designer's session as an input with the findings, while repairs remain (two after the first candidate,
--   three reviews in all; nothing resets them). Past that, or when the review cannot judge or fails, the candidate is
--   published as review_unresolved with its open findings as limitations: Markdown alone would hide a usable page.
-- * Publication (design_publish) is a rendition-only version, as a later PDF's is (0032): the same Markdown, the next
--   number, the HTML as its rendition with its review state, the earlier version's other renditions carried over. A
--   newer version published meanwhile wins: the design then publishes nothing. Published bytes are never replaced.
-- * Turn ends: a design or review turn that ends without its submit is nudged once, then fails, as research's does.
--   A designer whose candidate is under review is waiting, not done. A Stop ends the design and completes the goal
--   again (its report is published); a Hold waits like any work.
-- 0001–0039 are not edited; dispatch_runtime_outbox, capture_native_result, runtime_research_submit and
-- research_rendition_settled are replaced with the same signatures.
BEGIN;

-- --- admission --------------------------------------------------------------------------------------------------------

-- Record the HTML a just-admitted (or still running) research task was asked for, with the roles the registry named.
-- Called by the API in start_research's transaction. Refused when no runtime advertises the designer on its route or
-- no capture renderer is asking for work. p_request: {designer: {role, route}, reviewer: {role, route} | null,
-- targets?, language?}. Repeating it returns the request already recorded.
CREATE FUNCTION sophia.request_research_design(p_project uuid, p_task uuid, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.research_tasks; j sophia.jobs; targets text[]; lang text:=coalesce(nullif(p_request->>'language',''),'en');
 designer jsonb:=p_request->'designer'; reviewer jsonb:=p_request->'reviewer';
BEGIN
 IF sophia.actor_id() IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=p_project AND job_id=p_task FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research task not found' USING ERRCODE='22023'; END IF;
 IF t.design_request IS NOT NULL THEN RETURN jsonb_build_object('state','requested','targets',t.design_request->'targets'); END IF;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND id=p_task;
 IF j.state NOT IN ('pending','running','outcome_unknown') THEN
  RAISE EXCEPTION 'The research task has ended: ask for the HTML in a new request' USING ERRCODE='40001'; END IF;
 IF jsonb_typeof(designer)<>'object' OR coalesce(designer->>'role','') !~ '^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$'
  OR coalesce(designer->>'route','') !~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$'
  OR (reviewer IS NOT NULL AND reviewer<>'null'::jsonb AND (jsonb_typeof(reviewer)<>'object'
   OR coalesce(reviewer->>'role','') !~ '^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$' OR coalesce(reviewer->>'route','') !~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$')) THEN
  RAISE EXCEPTION 'Invalid design roles' USING ERRCODE='22023'; END IF;
 IF p_request ? 'targets' THEN
  SELECT array_agg(DISTINCT x ORDER BY x) INTO targets FROM jsonb_array_elements_text(p_request->'targets') x;
 ELSE targets:=ARRAY['w1280-light','w390-light']; END IF;
 IF targets IS NULL OR NOT targets <@ ARRAY['w390-light','w1280-light'] THEN RAISE EXCEPTION 'Invalid design targets' USING ERRCODE='22023'; END IF;
 IF lang !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' OR length(lang)>35 THEN RAISE EXCEPTION 'Invalid language tag' USING ERRCODE='22023'; END IF;
 IF (sophia.role_runtime(p_project,designer->>'role',designer->>'route')).id IS NULL THEN
  RAISE EXCEPTION 'HTML design is unavailable: no runtime is ready with the designer' USING ERRCODE='55000'; END IF;
 IF NOT sophia.capture_renderer_ready() THEN
  RAISE EXCEPTION 'HTML design is unavailable: no capture renderer is asking for work' USING ERRCODE='55000'; END IF;
 UPDATE sophia.research_tasks SET design_request=jsonb_strip_nulls(jsonb_build_object('designer',jsonb_build_object('role',designer->>'role','route',designer->>'route'),
  'reviewer',CASE WHEN jsonb_typeof(reviewer)='object' THEN jsonb_build_object('role',reviewer->>'role','route',reviewer->>'route') END,
  'targets',to_jsonb(targets),'language',lang,'requestedBy',sophia.actor_id(),'requestedAt',now()))
  WHERE project_id=p_project AND job_id=p_task RETURNING * INTO t;
 RETURN jsonb_build_object('state','requested','targets',t.design_request->'targets');
END $$;

-- Whether HTML can be asked for now (start_research reads it before admission): a runtime advertises the designer on
-- its route and a capture renderer is asking for work.
CREATE FUNCTION sophia.html_design_ready(p_project uuid, p_role text, p_route text) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.is_member(p_project) AND (sophia.role_runtime(p_project,p_role,p_route)).id IS NOT NULL AND sophia.capture_renderer_ready() $$;

-- --- the goal ---------------------------------------------------------------------------------------------------------

-- A design reopened its report's goal; when nothing is under way on it any more, it completes again.
CREATE FUNCTION sophia.design_goal_settle(p_project uuid, p_goal uuid) RETURNS void LANGUAGE sql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 UPDATE sophia.goals g2 SET status='completed', state_revision=state_revision+1
  WHERE g2.project_id=p_project AND g2.id=p_goal AND g2.status IN ('ready','running','checking')
   AND NOT EXISTS(SELECT 1 FROM sophia.jobs oj JOIN sophia.work_attempts wa ON wa.project_id=oj.project_id AND wa.id=oj.attempt_id
    WHERE oj.project_id=p_project AND wa.goal_id=p_goal AND oj.state IN ('pending','running'))
   AND NOT EXISTS(SELECT 1 FROM sophia.render_jobs o JOIN sophia.jobs oj ON oj.project_id=o.project_id AND oj.id=o.job_id
    WHERE o.project_id=p_project AND o.goal_id=p_goal AND oj.state IN ('pending','running')) $$;
REVOKE ALL ON FUNCTION sophia.design_goal_settle(uuid,uuid) FROM PUBLIC;

-- A design that ends without publishing: its job, its renders in flight and its research task say why; the goal
-- completes again (the report itself is published).
CREATE FUNCTION sophia.design_fail(p_project uuid, p_job uuid, p_state text, p_reason text) RETURNS void LANGUAGE plpgsql
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
 UPDATE sophia.research_tasks SET design_state='failed', design_reason=left('The HTML was not published: '||p_reason,300)
  WHERE project_id=p_project AND job_id=t.research_job_id;
 SELECT wa.goal_id INTO g FROM sophia.jobs dj JOIN sophia.work_attempts wa ON wa.project_id=dj.project_id AND wa.id=dj.attempt_id
  WHERE dj.project_id=p_project AND dj.id=p_job;
 IF j.id IS NOT NULL THEN
  PERFORM sophia.emit_service_event(p_project,'native_task.failed','job',j.id,j.result_revision+3,'native_task.design_ended');
 END IF;
 PERFORM sophia.design_goal_settle(p_project,g);
END $$;
REVOKE ALL ON FUNCTION sophia.design_fail(uuid,uuid,text,text) FROM PUBLIC;

-- --- attempts -----------------------------------------------------------------------------------------------------------

-- A new attempt on a goal for a design or a review: its manifest (a JSON source derived from p_from), attempt, binding
-- on the runtime, command, job and outbox row, as research admission writes them. Returns the job.
CREATE FUNCTION sophia.design_attempt(p_project uuid, p_goal uuid, p_actor uuid, p_kind text, p_job uuid, p_rt sophia.runtime_instances,
 p_manifest jsonb, p_from uuid[], p_artifact uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE pr sophia.projects; g sophia.goals; ctx sophia.source_objects; att uuid:=gen_random_uuid(); bnd uuid:=gen_random_uuid();
 cmd uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project;
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=p_goal FOR UPDATE;
 ctx:=sophia.put_text_source(p_project,p_actor,'application/json',jsonb_pretty(p_manifest));
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) SELECT p_project,x,ctx.id FROM unnest(p_from) x ON CONFLICT DO NOTHING;
 INSERT INTO sophia.context_manifests(project_id,body_source_id,audience_revision,eligibility_revision,state)
 VALUES(p_project,ctx.id,pr.audience_revision,pr.eligibility_revision,'eligible');
 INSERT INTO sophia.work_attempts(project_id,id,goal_id,goal_revision,authority_epoch,context_source_id,state)
 VALUES(p_project,att,p_goal,g.revision,g.authority_epoch,ctx.id,'admitted');
 INSERT INTO sophia.execution_bindings(project_id,id,attempt_id,resource_id,native_session_id,runtime_unit_id,continuation_owner,state)
 VALUES(p_project,bnd,att,p_rt.resource_id,'sophia-'||att,p_rt.runtime_unit_id,'sophia_episode','created');
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,body_source_id,state)
 VALUES(p_project,cmd,p_actor,p_goal,g.revision,g.authority_epoch,'native_task',p_kind||':'||p_job,
  jsonb_build_object('kind',p_kind,'taskId',p_job,'role',p_manifest->>'role','route',p_manifest->>'route'),ctx.id,'admitted');
 INSERT INTO sophia.jobs(project_id,id,kind,input_source_id,command_id,attempt_id,state,artifact_id)
 VALUES(p_project,p_job,p_kind,ctx.id,cmd,att,'pending',p_artifact);
 INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
 VALUES(p_project,cmd,'native.create','binding/'||bnd,bnd,p_goal,g.authority_epoch);
 UPDATE sophia.commands SET receipt=jsonb_build_object('taskId',p_job,'commandId',cmd,'goalId',p_goal,'attemptId',att,'projectId',p_project,
  'kind',p_kind,'stage','admitted','goalRevision',g.revision,'authorityEpoch',g.authority_epoch,'contextSourceId',ctx.id)
  WHERE project_id=p_project AND id=cmd;
 RETURN p_job;
END $$;
REVOKE ALL ON FUNCTION sophia.design_attempt(uuid,uuid,uuid,text,uuid,sophia.runtime_instances,jsonb,uuid[],uuid) FROM PUBLIC;

-- --- handoff ------------------------------------------------------------------------------------------------------------

-- At research publication, in its transaction (see the header): the design attempt of the version just published, or
-- why there is none. s is the research task's fenced scope.
CREATE FUNCTION sophia.design_handoff(s sophia.research_scope, p_version uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.research_tasks; v sophia.artifact_versions; rt sophia.runtime_instances; job uuid:=gen_random_uuid(); why text;
 req jsonb; manifest jsonb;
BEGIN
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 req:=t.design_request;
 IF req IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=s.project_id AND id=p_version;
 rt:=sophia.role_runtime(s.project_id,req->'designer'->>'role',req->'designer'->>'route');
 why:=CASE WHEN rt.id IS NULL THEN 'The HTML was not designed: no runtime with the designer was ready when the report was published'
  WHEN NOT sophia.capture_renderer_ready() THEN 'The HTML was not designed: no capture renderer was asking for work when the report was published' END;
 IF why IS NOT NULL THEN
  UPDATE sophia.research_tasks SET design_state='not_started', design_reason=why WHERE project_id=s.project_id AND job_id=t.job_id;
  RETURN jsonb_build_object('state','not_started','reason',why);
 END IF;
 manifest:=jsonb_build_object('schema','sophia.design-manifest.v1','projectId',s.project_id,'taskId',job,'researchTaskId',t.job_id,
  'role',req->'designer'->>'role','route',req->'designer'->>'route','mode','create','artifactId',v.artifact_id,'versionId',v.id,
  'versionNumber',v.version_number,'markdownSourceId',v.source_id,'markdownSha256',v.source_hash,'targets',req->'targets','language',req->>'language');
 UPDATE sophia.goals SET revision=revision+1, state_revision=state_revision+1, status='ready' WHERE project_id=s.project_id AND id=s.goal_id;
 PERFORM sophia.design_attempt(s.project_id,s.goal_id,t.actor_id,'design',job,rt,manifest,ARRAY[v.source_id],v.artifact_id);
 INSERT INTO sophia.design_tasks(project_id,job_id,research_job_id,root_job_id,allowance_id,actor_id,artifact_id,base_version_id,markdown_sha256,
  language,targets,role,route)
 VALUES(s.project_id,job,t.job_id,t.root_job_id,t.allowance_id,t.actor_id,v.artifact_id,v.id,v.source_hash,req->>'language',
  ARRAY(SELECT jsonb_array_elements_text(req->'targets')),req->'designer'->>'role',req->'designer'->>'route');
 UPDATE sophia.research_tasks SET design_state='designing', design_reason=NULL, design_job_id=job WHERE project_id=s.project_id AND job_id=t.job_id;
 PERFORM sophia.emit_service_event(s.project_id,'native_task.admitted','job',job,1,'native_task.design',jsonb_build_array(s.goal_id,v.source_id));
 RETURN jsonb_build_object('state','designing','taskId',job);
END $$;
REVOKE ALL ON FUNCTION sophia.design_handoff(sophia.research_scope,uuid) FROM PUBLIC;

-- What the API builds a design's content package from (@sophia/design contentPackage): the version's Markdown, its
-- limitations, the sources it cites (the ones its parser may number) with the title and address their retrieval
-- recorded. Null once the package is frozen (a replayed publication).
CREATE FUNCTION sophia.design_package_input(p_job uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.design_tasks; v sophia.artifact_versions; body text; p_project uuid;
BEGIN
 SELECT * INTO t FROM sophia.design_tasks WHERE job_id=p_job;
 p_project:=t.project_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Design task not found' USING ERRCODE='22023'; END IF;
 IF t.package_source_id IS NOT NULL OR t.state<>'designing' THEN RETURN NULL; END IF;
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=p_project AND id=t.base_version_id;
 SELECT x.body INTO body FROM sophia.source_texts x WHERE x.project_id=p_project AND x.source_id=v.source_id;
 RETURN jsonb_build_object('versionId',v.id,'markdownSha256',v.source_hash,'markdown',body,'limitations',to_jsonb(v.limitations),
  'sources',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.source_id,'title',p.title,'url',coalesce(p.reported_final_url,p.requested_url))
    ORDER BY d.source_id),'[]') FROM sophia.source_dependencies d LEFT JOIN sophia.source_provenance p ON p.project_id=d.project_id AND p.source_id=d.source_id
   WHERE d.project_id=p_project AND d.derived_source_id=v.source_id));
END $$;

-- Freeze the package the API built: a JSON source derived from the version, written once.
CREATE FUNCTION sophia.design_freeze_package(p_job uuid, p_package jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.design_tasks; v sophia.artifact_versions; src sophia.source_objects; p_project uuid;
BEGIN
 SELECT * INTO t FROM sophia.design_tasks WHERE job_id=p_job FOR UPDATE;
 p_project:=t.project_id;
 IF NOT FOUND OR t.package_source_id IS NOT NULL THEN RAISE EXCEPTION 'Design package already frozen or task not found' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_package)<>'object' OR p_package->>'schema' IS DISTINCT FROM 'sophia.design-content.v1'
  OR jsonb_typeof(p_package->'blocks')<>'array' OR jsonb_array_length(p_package->'blocks') NOT BETWEEN 1 AND 4000
  OR jsonb_typeof(p_package->'citations')<>'array' OR octet_length(p_package::text)>2097152
  OR p_package->>'markdownSha256' IS DISTINCT FROM t.markdown_sha256 THEN
  RAISE EXCEPTION 'A design package is the frozen content of its version' USING ERRCODE='22023'; END IF;
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=p_project AND id=t.base_version_id;
 src:=sophia.put_text_source(p_project,t.actor_id,'application/json',p_package::text);
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(p_project,v.source_id,src.id) ON CONFLICT DO NOTHING;
 UPDATE sophia.design_tasks SET package_source_id=src.id, package_sha256=src.sha256 WHERE project_id=p_project AND job_id=p_job;
 RETURN jsonb_build_object('sourceId',src.id,'sha256',src.sha256);
END $$;

-- The API could not build the package of a design it just admitted: the design ends with that said, and nothing
-- else of the publication changes.
CREATE FUNCTION sophia.design_package_failed(p_job uuid, p_reason text) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE p_project uuid;
BEGIN
 SELECT project_id INTO p_project FROM sophia.design_tasks WHERE job_id=p_job AND package_source_id IS NULL AND state='designing';
 IF NOT FOUND THEN RAISE EXCEPTION 'Design package already frozen or task not found' USING ERRCODE='22023'; END IF;
 PERFORM sophia.design_fail(p_project,p_job,'failed',left('its content package could not be built ('||coalesce(p_reason,'unknown')||')',400));
END $$;

-- runtime_research_submit (0036), replaced: the same, and a published result carries its HTML: the design attempt
-- admitted in its transaction, or why there is none (design_handoff). A replay returns the same.
CREATE OR REPLACE FUNCTION sophia.runtime_research_submit(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false); t sophia.research_tasks;
 j sophia.jobs; key text; v sophia.artifact_versions; src sophia.source_objects; v_reason text:=btrim(p_request->'blocker'->>'reason');
 v_remaining text:=nullif(btrim(coalesce(p_request->'blocker'->>'remainingWork','')),''); out jsonb;
BEGIN
 IF coalesce(p_request->>'callId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid call id' USING ERRCODE='22023'; END IF;
 IF (p_request ? 'result')=(p_request ? 'blocker') THEN RAISE EXCEPTION 'A submit carries a result or a blocker' USING ERRCODE='22023'; END IF;
 key:=s.native_session_id||':'||(p_request->>'callId');
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 IF t.closed_by_call=key THEN
  SELECT * INTO j FROM sophia.jobs WHERE project_id=s.project_id AND id=s.job_id;
  IF j.state='succeeded' AND p_request ? 'result' THEN
   SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=s.project_id AND job_id=j.id ORDER BY version_number DESC LIMIT 1;
   RETURN sophia.without_null_members(jsonb_build_object('taskId',j.id,'outcome','published','artifactId',v.artifact_id,'versionId',v.id,
    'versionNumber',v.version_number,'sourceId',v.source_id,'sha256',v.source_hash,'resultSourceId',j.result_source_id,
    'notesFromFacts',coalesce((v.change_facts->>'notesFromFacts')::boolean,false),
    'pdf',CASE WHEN t.pdf_state IS NULL THEN NULL ELSE sophia.without_null_members(jsonb_build_object('state',t.pdf_state,'reason',t.pdf_reason,
     'sourceId',(SELECT r.source_id FROM sophia.artifact_renditions r WHERE r.project_id=s.project_id AND r.artifact_version_id=v.id AND r.format='pdf'),
     'renderJobId',(SELECT r.job_id FROM sophia.artifact_renditions r WHERE r.project_id=s.project_id AND r.artifact_version_id=v.id AND r.format='pdf'))) END,
    'html',CASE WHEN t.design_state IS NULL THEN NULL ELSE sophia.without_null_members(jsonb_build_object(
     'state',CASE WHEN t.design_state='not_started' THEN 'not_started' ELSE 'designing' END,
     'reason',CASE WHEN t.design_state='not_started' THEN t.design_reason END,'taskId',t.design_job_id)) END));
  ELSIF j.state='failed' AND p_request ? 'blocker' THEN
   RETURN jsonb_build_object('taskId',j.id,'outcome','blocked','resultSourceId',j.result_source_id);
  END IF;
  RAISE EXCEPTION 'Idempotency key reused for another submit' USING ERRCODE='23505';
 END IF;
 IF t.closed_by_call IS NOT NULL THEN RAISE EXCEPTION 'The research task has already ended' USING ERRCODE='40001'; END IF;
 s:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true);
 IF p_request ? 'result' THEN
  IF t.finalizing_at IS NULL AND EXISTS(SELECT 1 FROM sophia.render_jobs r JOIN sophia.jobs rj ON rj.project_id=r.project_id AND rj.id=r.job_id
    WHERE r.project_id=s.project_id AND r.parent_job_id=s.job_id AND rj.state IN ('pending','running') AND r.created_at>now()-interval '10 minutes') THEN
   RAISE EXCEPTION 'A PDF render of this task is still running: wait for its result, then submit' USING ERRCODE='40001'; END IF;
  UPDATE sophia.jobs rj SET state='cancelled', lease_until=NULL, reason='cancelled: the report was submitted while the PDF was still rendering'
   FROM sophia.render_jobs r WHERE r.project_id=s.project_id AND r.parent_job_id=s.job_id AND rj.project_id=r.project_id AND rj.id=r.job_id
    AND rj.state IN ('pending','running');
  out:=sophia.research_publish(s,key,sophia.research_draft_citations(s,p_request->'result',p_request->'draftCitations'));
  IF out->>'outcome'='published' THEN
   out:=sophia.without_null_members(out||jsonb_build_object('pdf',sophia.research_attach_pdf(s,(out->>'versionId')::uuid)));
   out:=sophia.without_null_members(out||jsonb_build_object('html',sophia.design_handoff(s,(out->>'versionId')::uuid)));
  END IF;
  RETURN out;
 END IF;
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

-- --- the statements the roles are sent -----------------------------------------------------------------------------------

-- A design create's task statement. The designer's procedure and the native skills are its preset's prompt sections;
-- this is the task alone, with its manifest.
CREATE FUNCTION sophia.design_task_statement(p_manifest jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT 'HTML design task. Design a self-contained, readable HTML page for the published research report named below, '
 || 'at the targets it names. Start with design_read_context: it holds the request, the frozen content package (every block, '
 || 'citation, source and limitation the page must carry, unchanged), your source revisions, renders and the remaining allowance.'||E'\n'
 || 'Write the page with design_write_source, change it with design_patch_source, render it with design_render and look at the '
 || 'real captures with design_inspect_render before you judge it. Submit a candidate with design_submit_candidate only from '
 || 'a render of your latest source that passed every check; or call design_report_blocker when it cannot be done.'||E'\n\n'
 || 'Manifest ('||(p_manifest->>'schema')||'):'||E'\n'||jsonb_pretty(p_manifest) $$;

-- A review create's task statement.
CREATE FUNCTION sophia.review_task_statement(p_manifest jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT 'Visual review task. Review one HTML candidate independently. Start with review_read_context: it holds the original '
 || 'request, the frozen content package, your criteria and the candidate with its render. Look at the real captures with '
 || 'review_inspect_render: each target''s overview and every section at one target at least. You cannot change the page. '
 || 'Finish with review_submit_result: pass, needs_revision with the findings that must change, or blocked when you cannot judge.'||E'\n\n'
 || 'Manifest ('||(p_manifest->>'schema')||'):'||E'\n'||jsonb_pretty(p_manifest) $$;

-- The input a design or review session gets once when a turn completes without its submit.
CREATE FUNCTION sophia.design_nudge_text(p_kind text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE p_kind WHEN 'design' THEN 'Your turn ended without a candidate. If a render of your latest source passed every check, call '
  || 'design_submit_candidate with it; if the page cannot be finished, call design_report_blocker with the reason. Do not start over.'
 ELSE 'Your turn ended without a review. Call review_submit_result with your verdict, or with blocked and the reason if you cannot judge.' END $$;

REVOKE ALL ON FUNCTION sophia.design_task_statement(jsonb), sophia.review_task_statement(jsonb), sophia.design_nudge_text(text) FROM PUBLIC;

-- --- publication -------------------------------------------------------------------------------------------------------

-- Publish a candidate's page as the report's next version, with its review state (see the header). A newer version
-- of the report wins: then nothing is published and the design ends superseded.
CREATE FUNCTION sophia.design_publish(p_project uuid, p_candidate uuid, p_label text, p_limits text[]) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.design_candidates; t sophia.design_tasks; a sophia.artifacts; v sophia.artifact_versions; nv sophia.artifact_versions;
 g sophia.goals; j sophia.jobs; body text; vnum integer; result sophia.source_objects; note text;
BEGIN
 SELECT * INTO c FROM sophia.design_candidates WHERE project_id=p_project AND id=p_candidate FOR UPDATE;
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=p_project AND job_id=c.design_job_id FOR UPDATE;
 SELECT * INTO a FROM sophia.artifacts WHERE project_id=p_project AND id=t.artifact_id FOR UPDATE;
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=p_project AND id=t.base_version_id;
 IF a.stable_version_id IS DISTINCT FROM v.id THEN
  UPDATE sophia.design_candidates SET state='superseded' WHERE project_id=p_project AND id=c.id;
  PERFORM sophia.design_fail(p_project,t.job_id,'superseded','a newer version of the report was published while it was designed');
  RETURN jsonb_build_object('outcome','superseded','candidateId',c.id);
 END IF;
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts wa ON wa.project_id=g2.project_id AND wa.goal_id=g2.id
  JOIN sophia.jobs dj ON dj.project_id=wa.project_id AND dj.attempt_id=wa.id WHERE dj.project_id=p_project AND dj.id=t.job_id;
 SELECT x.body INTO body FROM sophia.source_texts x WHERE x.project_id=p_project AND x.source_id=v.source_id;
 SELECT coalesce(max(version_number),0)+1 INTO vnum FROM sophia.artifact_versions WHERE project_id=p_project AND artifact_id=a.id;
 note:=CASE p_label WHEN 'reviewed' THEN 'Adds the designed HTML page, reviewed by a separate visual reviewer'
  WHEN 'self_review_only' THEN 'Adds the designed HTML page, checked by software; no separate reviewer was available'
  ELSE 'Adds the designed HTML page, with visual review findings still open' END;
 UPDATE sophia.artifact_versions SET state='superseded' WHERE project_id=p_project AND id=v.id;
 INSERT INTO sophia.artifact_versions(project_id,artifact_id,parent_id,source_id,source_hash,goal_id,goal_revision,authority_epoch,state,
  validation_source_id,checks_passed,version_number,change_note,retained_note,change_facts,trigger,job_id,limitations)
 VALUES(p_project,a.id,v.id,v.source_id,v.source_hash,g.id,g.revision,g.authority_epoch,'stable',v.validation_source_id,v.checks_passed,vnum,
  note,'Everything in v'||v.version_number||' is kept',
  jsonb_build_object('versionNumber',vnum,'previousVersionId',v.id,'cited',v.change_facts->'cited','added','[]'::jsonb,'dropped','[]'::jsonb,
   'bytes',v.change_facts->'bytes','previousBytes',v.change_facts->'bytes','sections',sophia.section_facts(body,body),
   'notesFromFacts',true,'renditionOnly',true),
  jsonb_build_object('kind','design','taskId',t.job_id,'candidateId',c.id,'reviewState',p_label),t.job_id,v.limitations)
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
 UPDATE sophia.research_tasks SET design_state='published', design_reason=NULL WHERE project_id=p_project AND job_id=t.research_job_id;
 PERFORM sophia.design_goal_settle(p_project,g.id);
 PERFORM sophia.emit_service_event(p_project,'artifact.rendition_ready','artifact',a.id,vnum,'artifact.rendition_ready',
  jsonb_build_array(nv.source_id,c.compiled_source_id));
 PERFORM sophia.emit_service_event(p_project,'native_task.result_ready','job',j.id,j.result_revision+3,'native_task.result_ready',
  jsonb_build_array(result.id,c.compiled_source_id));
 RETURN jsonb_build_object('outcome','published','candidateId',c.id,'versionId',nv.id,'versionNumber',vnum,'reviewState',p_label);
END $$;
REVOKE ALL ON FUNCTION sophia.design_publish(uuid,uuid,text,text[]) FROM PUBLIC;

-- research_rendition_settled (0034), replaced: the same, and the version a later PDF publishes keeps the HTML of the
-- version it follows (the same Markdown).
CREATE OR REPLACE FUNCTION sophia.research_rendition_settled(j sophia.jobs, r sophia.render_jobs) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE v sophia.artifact_versions; a sophia.artifacts; nv sophia.artifact_versions; g sophia.goals; body text; vnum integer;
BEGIN
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=j.project_id AND id=r.base_version_id;
 SELECT * INTO a FROM sophia.artifacts WHERE project_id=j.project_id AND id=v.artifact_id FOR UPDATE;
 IF j.state='succeeded' AND a.stable_version_id=v.id THEN
  SELECT x.body INTO body FROM sophia.source_texts x WHERE x.project_id=v.project_id AND x.source_id=v.source_id;
  SELECT coalesce(max(version_number),0)+1 INTO vnum FROM sophia.artifact_versions WHERE project_id=v.project_id AND artifact_id=a.id;
  SELECT * INTO g FROM sophia.goals WHERE project_id=j.project_id AND id=r.goal_id;
  UPDATE sophia.artifact_versions SET state='superseded' WHERE project_id=v.project_id AND id=v.id;
  INSERT INTO sophia.artifact_versions(project_id,artifact_id,parent_id,source_id,source_hash,goal_id,goal_revision,authority_epoch,state,
   validation_source_id,checks_passed,version_number,change_note,retained_note,change_facts,trigger,job_id,limitations)
  VALUES(v.project_id,a.id,v.id,v.source_id,v.source_hash,g.id,g.revision,g.authority_epoch,'stable',v.validation_source_id,v.checks_passed,vnum,
   'Adds the PDF that could not be produced in v'||v.version_number,'Everything in v'||v.version_number||' is kept',
   jsonb_build_object('versionNumber',vnum,'previousVersionId',v.id,'cited',v.change_facts->'cited','added','[]'::jsonb,'dropped','[]'::jsonb,
    'bytes',v.change_facts->'bytes','previousBytes',v.change_facts->'bytes','sections',sophia.section_facts(body,body),
    'notesFromFacts',true,'renditionOnly',true),
   jsonb_build_object('kind','rendition','taskId',r.parent_job_id,'renderJobId',j.id),j.id,
   (SELECT coalesce(array_agg(l ORDER BY i),'{}') FROM unnest(v.limitations) WITH ORDINALITY x(l,i) WHERE l !~* '\mpdf\M'))
  RETURNING * INTO nv;
  UPDATE sophia.artifacts SET stable_version_id=nv.id WHERE project_id=a.project_id AND id=a.id;
  INSERT INTO sophia.artifact_renditions(project_id,artifact_version_id,format,source_id,page_count,job_id,limitations)
  VALUES(nv.project_id,nv.id,'pdf',j.result_source_id,nullif((r.receipt->'output'->>'pageCount')::integer,0),j.id,
   sophia.render_limitations(r.receipt));
  INSERT INTO sophia.artifact_renditions(project_id,artifact_version_id,format,source_id,page_count,job_id,limitations,review_state,candidate_id)
  SELECT nv.project_id,nv.id,x.format,x.source_id,x.page_count,x.job_id,x.limitations,x.review_state,x.candidate_id
   FROM sophia.artifact_renditions x WHERE x.project_id=v.project_id AND x.artifact_version_id=v.id AND x.format<>'pdf';
  UPDATE sophia.research_tasks SET pdf_state='produced', pdf_reason=NULL WHERE project_id=j.project_id AND job_id=r.parent_job_id;
  PERFORM sophia.emit_service_event(j.project_id,'artifact.rendition_ready','artifact',a.id,vnum,'artifact.rendition_ready',
   jsonb_build_array(nv.source_id,j.result_source_id));
 ELSIF j.state<>'succeeded' THEN
  UPDATE sophia.research_tasks SET pdf_reason=left('The PDF could not be produced again ('||coalesce(j.reason,j.state)||')',300)
   WHERE project_id=j.project_id AND job_id=r.parent_job_id;
 END IF;
 IF r.reopened_goal THEN
  UPDATE sophia.goals g2 SET status='completed', state_revision=state_revision+1
   WHERE g2.project_id=j.project_id AND g2.id=r.goal_id AND g2.status IN ('ready','running','checking')
    AND NOT EXISTS(SELECT 1 FROM sophia.jobs oj JOIN sophia.work_attempts wa ON wa.project_id=oj.project_id AND wa.id=oj.attempt_id
     WHERE oj.project_id=j.project_id AND wa.goal_id=r.goal_id AND oj.state IN ('pending','running'))
    AND NOT EXISTS(SELECT 1 FROM sophia.render_jobs o JOIN sophia.jobs oj ON oj.project_id=o.project_id AND oj.id=o.job_id
     WHERE o.project_id=j.project_id AND o.goal_id=r.goal_id AND o.job_id<>j.id AND oj.state IN ('pending','running'));
 END IF;
END $$;

-- --- review ---------------------------------------------------------------------------------------------------------------

-- Admit the independent review of a candidate when a runtime advertises the reviewer and reviews remain; null
-- otherwise. The review's manifest names the candidate and the criteria, never the author's account of it.
CREATE FUNCTION sophia.design_admit_review(p_project uuid, p_candidate uuid) RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.design_candidates; t sophia.design_tasks; req jsonb; rt sophia.runtime_instances; goal uuid; job uuid:=gen_random_uuid();
 criteria text:=encode(sha256(convert_to(sophia.review_criteria(),'UTF8')),'hex'); manifest jsonb;
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
 manifest:=jsonb_build_object('schema','sophia.review-manifest.v1','projectId',p_project,'reviewTaskId',job,'designTaskId',t.job_id,
  'candidateId',c.id,'round',c.round,'role',req->'reviewer'->>'role','route',req->'reviewer'->>'route','targets',to_jsonb(t.targets),
  'criteriaSha256',criteria);
 PERFORM sophia.design_attempt(p_project,goal,t.actor_id,'design_review',job,rt,manifest,ARRAY[t.package_source_id,c.compiled_source_id],t.artifact_id);
 INSERT INTO sophia.design_reviews(project_id,job_id,candidate_id,design_job_id,allowance_id,actor_id,role,route,criteria_sha256)
 VALUES(p_project,job,c.id,t.job_id,t.allowance_id,t.actor_id,req->'reviewer'->>'role',req->'reviewer'->>'route',criteria);
 UPDATE sophia.design_candidates SET state='reviewing' WHERE project_id=p_project AND id=c.id;
 UPDATE sophia.design_tasks SET state='reviewing' WHERE project_id=p_project AND job_id=t.job_id;
 PERFORM sophia.emit_service_event(p_project,'native_task.progress','job',t.job_id,
  (SELECT result_revision+3 FROM sophia.jobs WHERE project_id=p_project AND id=t.job_id),'native_task.design_review_admitted',jsonb_build_array(c.id));
 RETURN job;
END $$;
REVOKE ALL ON FUNCTION sophia.design_admit_review(uuid,uuid) FROM PUBLIC;

-- The findings a revision request sends the designer, as the input its session reads.
CREATE FUNCTION sophia.design_repair_text(rv sophia.design_reviews, c sophia.design_candidates, p_left integer) RETURNS text LANGUAGE sql
STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT 'The visual review of candidate '||c.round||' asks for a revision ('||p_left||' left after this one). Fix the earliest '
 || 'broken layer first, render again, inspect the captures, and submit a new candidate. Findings:'||E'\n'
 || coalesce((SELECT string_agg(format('- [%s]%s %s%s',f->>'severity',coalesce(' '||(f->>'target'),'')||coalesce(' section '||(f->>'section'),''),
    f->>'issue',coalesce(' Fix: '||(f->>'fix'),'')),E'\n' ORDER BY i)
   FROM jsonb_array_elements(coalesce(rv.findings,'[]')) WITH ORDINALITY x(f,i)),'- (none listed)')
 || coalesce(E'\n\nReviewer''s summary: '||rv.summary,'') $$;
REVOKE ALL ON FUNCTION sophia.design_repair_text(sophia.design_reviews,sophia.design_candidates,integer) FROM PUBLIC;

-- An input to a session: a command and its outbox row, under the goal's current authority.
CREATE FUNCTION sophia.design_input(p_project uuid, p_binding uuid, p_actor uuid, p_key text, p_semantic jsonb, p_text text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE b sophia.execution_bindings; g sophia.goals; src sophia.source_objects; cmd uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=p_project AND id=p_binding;
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts wa ON wa.project_id=g2.project_id AND wa.goal_id=g2.id
  WHERE wa.project_id=p_project AND wa.id=b.attempt_id;
 src:=sophia.put_text_source(p_project,p_actor,'text/plain; charset=utf-8',p_text);
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,body_source_id,state)
 VALUES(p_project,cmd,p_actor,g.id,g.revision,g.authority_epoch,'input',p_key,p_semantic,src.id,'admitted');
 INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
 VALUES(p_project,cmd,'native.input','binding/'||b.id,b.id,g.id,g.authority_epoch);
 RETURN cmd;
END $$;
REVOKE ALL ON FUNCTION sophia.design_input(uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC;

-- What a submitted review decides (see the header).
CREATE FUNCTION sophia.design_review_outcome(p_project uuid, p_review uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rv sophia.design_reviews; c sophia.design_candidates; t sophia.design_tasks; reviews integer; b uuid; lims text[];
BEGIN
 SELECT * INTO rv FROM sophia.design_reviews WHERE project_id=p_project AND job_id=p_review;
 SELECT * INTO c FROM sophia.design_candidates WHERE project_id=p_project AND id=rv.candidate_id FOR UPDATE;
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=p_project AND job_id=rv.design_job_id FOR UPDATE;
 IF t.state<>'reviewing' OR c.state<>'reviewing' THEN RETURN jsonb_build_object('outcome','ignored','reason','the design moved on'); END IF;
 IF rv.verdict='pass' THEN
  UPDATE sophia.design_candidates SET state='reviewed' WHERE project_id=p_project AND id=c.id;
  RETURN sophia.design_publish(p_project,c.id,'reviewed','{}');
 END IF;
 SELECT count(*) INTO reviews FROM sophia.design_reviews WHERE project_id=p_project AND design_job_id=t.job_id;
 IF rv.verdict='needs_revision' AND c.round<1+t.max_repairs AND reviews<t.max_rounds THEN
  SELECT eb.id INTO b FROM sophia.jobs dj JOIN sophia.execution_bindings eb ON eb.project_id=dj.project_id AND eb.attempt_id=dj.attempt_id
   WHERE dj.project_id=p_project AND dj.id=t.job_id;
  UPDATE sophia.design_candidates SET state='needs_revision' WHERE project_id=p_project AND id=c.id;
  UPDATE sophia.design_tasks SET state='designing', nudge_command_id=NULL WHERE project_id=p_project AND job_id=t.job_id;
  PERFORM sophia.design_input(p_project,b,t.actor_id,'design-repair:'||rv.job_id,
   jsonb_build_object('kind','input','repair','design_review','reviewTaskId',rv.job_id),sophia.design_repair_text(rv,c,1+t.max_repairs-c.round-1));
  PERFORM sophia.emit_service_event(p_project,'native_task.progress','job',t.job_id,
   (SELECT result_revision+3 FROM sophia.jobs WHERE project_id=p_project AND id=t.job_id),'native_task.design_revision_requested',jsonb_build_array(c.id));
  RETURN jsonb_build_object('outcome','revision_requested','candidateId',c.id,'round',c.round);
 END IF;
 lims:=CASE WHEN rv.verdict='blocked' THEN ARRAY[left('The visual review could not be completed: '||coalesce(rv.summary,'no reason given'),300)]
  ELSE ARRAY(SELECT left('Open review finding: '||(f->>'issue'),300) FROM jsonb_array_elements(coalesce(rv.findings,'[]')) WITH ORDINALITY x(f,i)
   WHERE f->>'severity' IN ('blocking','major') ORDER BY i LIMIT 8) END;
 UPDATE sophia.design_candidates SET state='review_unresolved' WHERE project_id=p_project AND id=c.id;
 RETURN sophia.design_publish(p_project,c.id,'review_unresolved',lims);
END $$;
REVOKE ALL ON FUNCTION sophia.design_review_outcome(uuid,uuid) FROM PUBLIC;

-- --- the designer's submit ----------------------------------------------------------------------------------------------------

-- A candidate as a submit reports it.
CREATE FUNCTION sophia.design_candidate_view(p_project uuid, c sophia.design_candidates) RETURNS jsonb LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.without_null_members(jsonb_build_object('outcome',CASE c.state WHEN 'reviewing' THEN 'reviewing' WHEN 'published' THEN 'published'
   WHEN 'superseded' THEN 'superseded' ELSE c.state END,'candidateId',c.id,'round',c.round,'reviewState',c.review_state,
  'reviewTaskId',(SELECT r.job_id FROM sophia.design_reviews r WHERE r.project_id=p_project AND r.candidate_id=c.id),
  'versionId',(SELECT x.artifact_version_id FROM sophia.artifact_renditions x WHERE x.project_id=p_project AND x.candidate_id=c.id AND x.format='html'),
  'versionNumber',(SELECT v.version_number FROM sophia.artifact_renditions x JOIN sophia.artifact_versions v ON v.project_id=x.project_id
    AND v.id=x.artifact_version_id WHERE x.project_id=p_project AND x.candidate_id=c.id AND x.format='html'))) $$;
REVOKE ALL ON FUNCTION sophia.design_candidate_view(uuid,sophia.design_candidates) FROM PUBLIC;

-- What keeps a candidate from the hard gate: an incomplete source, a render of something else, of part of the page or
-- of fewer targets, a render that did not succeed, or the gate's own reasons (0039).
CREATE FUNCTION sophia.design_candidate_failures(t sophia.design_tasks, d sophia.design_sources, r sophia.render_jobs, rj sophia.jobs)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT (ARRAY(SELECT x FROM unnest(ARRAY[
   CASE WHEN NOT d.complete THEN 'the source does not carry every block, citation and source of the research ('||d.finding_count||' findings)' END,
   CASE WHEN r.design_source_id<>d.id THEN 'the render is of another revision' END,
   CASE WHEN r.sections IS NOT NULL THEN 'the render captured only some sections: render the whole page' END,
   CASE WHEN NOT r.targets @> t.targets THEN 'the render did not capture every target of the task' END,
   CASE WHEN rj.state<>'succeeded' THEN 'the render did not succeed ('||rj.state||')' END]) x WHERE x IS NOT NULL)
  ||CASE WHEN rj.state='succeeded' THEN sophia.design_gate_failures(r.receipt,sophia.design_package(t.project_id,t.job_id),t.targets) ELSE '{}' END)[1:40] $$;
REVOKE ALL ON FUNCTION sophia.design_candidate_failures(sophia.design_tasks,sophia.design_sources,sophia.render_jobs,sophia.jobs) FROM PUBLIC;

-- What the published page says about what software could not confirm: blocks whose contrast could not be measured.
CREATE FUNCTION sophia.design_gate_limitations(p_receipt jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(array_agg(left('Text contrast could not be measured at '||(c->>'target')||' ('||coalesce(c->>'detail','')||')',300) ORDER BY i),'{}')
 FROM jsonb_array_elements(coalesce(p_receipt->'checks','[]')) WITH ORDINALITY x(c,i) WHERE c->>'name'='contrast' AND c->>'outcome'='unknown' $$;
REVOKE ALL ON FUNCTION sophia.design_gate_limitations(jsonb) FROM PUBLIC;

-- Submit a candidate past the hard gate (refused with the reasons, nothing recorded, when it does not pass).
CREATE FUNCTION sophia.design_submit_candidate(s sophia.design_scope, p_key text, p_candidate jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.design_tasks; d sophia.design_sources; r sophia.render_jobs; rj sophia.jobs; c sophia.design_candidates; failures text[];
 latest integer; review uuid; summary text:=nullif(btrim(coalesce(p_candidate->>'summary','')),'');
BEGIN
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 IF t.state='reviewing' THEN RAISE EXCEPTION 'Your candidate is under review: wait for its result' USING ERRCODE='40001'; END IF;
 IF t.state<>'designing' THEN RAISE EXCEPTION 'The design has ended (%)', t.state USING ERRCODE='40001'; END IF;
 IF length(summary)>2000 THEN RAISE EXCEPTION 'A candidate''s summary is at most 2000 characters' USING ERRCODE='22023'; END IF;
 SELECT * INTO d FROM sophia.design_sources WHERE project_id=s.project_id AND design_job_id=t.job_id AND id=sophia.uuid_or_null(p_candidate->>'revisionId');
 IF NOT FOUND THEN RAISE EXCEPTION 'Design revision not found' USING ERRCODE='22023'; END IF;
 SELECT max(seq) INTO latest FROM sophia.design_sources WHERE project_id=s.project_id AND design_job_id=t.job_id;
 IF d.seq<>latest THEN RAISE EXCEPTION 'Stale source: submit your latest revision' USING ERRCODE='40001'; END IF;
 SELECT * INTO r FROM sophia.render_jobs WHERE project_id=s.project_id AND parent_job_id=t.job_id AND kind='capture'
  AND job_id=sophia.uuid_or_null(p_candidate->>'renderJobId');
 IF NOT FOUND THEN RAISE EXCEPTION 'Render not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO rj FROM sophia.jobs WHERE project_id=s.project_id AND id=r.job_id;
 failures:=sophia.design_candidate_failures(t,d,r,rj);
 IF cardinality(failures)>0 THEN RETURN jsonb_build_object('outcome','refused','failures',to_jsonb(failures)); END IF;
 IF (SELECT count(*) FROM sophia.design_candidates WHERE project_id=s.project_id AND design_job_id=t.job_id)>=1+t.max_repairs THEN
  RAISE EXCEPTION 'Design repair limit reached' USING ERRCODE='55000'; END IF;
 UPDATE sophia.design_candidates SET state='superseded' WHERE project_id=s.project_id AND design_job_id=t.job_id AND state='needs_revision';
 INSERT INTO sophia.design_candidates(project_id,design_job_id,source_id,render_job_id,compiled_source_id,round,call_key,summary,gate)
 VALUES(s.project_id,t.job_id,d.id,r.job_id,(SELECT f.source_id FROM sophia.render_job_files f WHERE f.project_id=r.project_id AND f.job_id=r.job_id AND f.role='entry'),
  (SELECT count(*)+1 FROM sophia.design_candidates WHERE project_id=s.project_id AND design_job_id=t.job_id),p_key,summary,
  jsonb_build_object('passed',true,'checks',r.receipt->'checks','targets',to_jsonb(t.targets),'renderer',r.receipt->'renderer'))
 RETURNING * INTO c;
 UPDATE sophia.jobs SET state='running' WHERE project_id=s.project_id AND id=t.job_id AND state='pending';
 review:=sophia.design_admit_review(s.project_id,c.id);
 IF review IS NULL THEN
  UPDATE sophia.design_candidates SET state='self_review_only' WHERE project_id=s.project_id AND id=c.id;
  PERFORM sophia.design_publish(s.project_id,c.id,'self_review_only',
   ARRAY['This page was checked by software but not by a separate visual reviewer']||sophia.design_gate_limitations(r.receipt));
 END IF;
 SELECT * INTO c FROM sophia.design_candidates WHERE project_id=s.project_id AND id=c.id;
 RETURN sophia.design_candidate_view(s.project_id,c);
END $$;
REVOKE ALL ON FUNCTION sophia.design_submit_candidate(sophia.design_scope,text,jsonb) FROM PUBLIC;

-- POST /v1/runtime/design/submit: a candidate, or a blocker (exactly one). Idempotent by the call: a replay returns
-- what the first call did; another call on an ended design is refused.
CREATE FUNCTION sophia.runtime_design_submit(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design',false);
 key text:=sophia.design_call_key(s,p_request); t sophia.design_tasks; c sophia.design_candidates; j sophia.jobs; src sophia.source_objects;
 v_reason text:=btrim(p_request->'blocker'->>'reason'); v_remaining text:=nullif(btrim(coalesce(p_request->'blocker'->>'remainingWork','')),'');
BEGIN
 IF (p_request ? 'candidate')=(p_request ? 'blocker') THEN RAISE EXCEPTION 'A submit carries a candidate or a blocker' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM sophia.design_candidates WHERE project_id=s.project_id AND design_job_id=s.job_id AND call_key=key;
 IF FOUND THEN
  IF NOT p_request ? 'candidate' THEN RAISE EXCEPTION 'Idempotency key reused for another submit' USING ERRCODE='23505'; END IF;
  RETURN sophia.design_candidate_view(s.project_id,c);
 END IF;
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 IF t.closed_by_call=key THEN
  IF NOT p_request ? 'blocker' THEN RAISE EXCEPTION 'Idempotency key reused for another submit' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('outcome','blocked','taskId',t.job_id);
 END IF;
 IF t.closed_by_call IS NOT NULL THEN RAISE EXCEPTION 'The design has already ended' USING ERRCODE='40001'; END IF;
 s:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design',true);
 IF p_request ? 'candidate' THEN RETURN sophia.design_submit_candidate(s,key,p_request->'candidate'); END IF;
 IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 1 AND 500 OR length(v_remaining)>2000 THEN
  RAISE EXCEPTION 'A blocker has a reason of 1 to 500 characters and at most 2000 of remaining work' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 IF t.state NOT IN ('designing') THEN RAISE EXCEPTION 'The design is %: a blocker no longer applies', t.state USING ERRCODE='40001'; END IF;
 src:=sophia.put_text_source(s.project_id,s.actor_id,'text/markdown; charset=utf-8',
  'Blocked: '||v_reason||CASE WHEN v_remaining IS NULL THEN '' ELSE E'\n\nRemaining work:\n'||v_remaining END);
 UPDATE sophia.design_tasks SET closed_by_call=key WHERE project_id=s.project_id AND job_id=s.job_id;
 UPDATE sophia.jobs SET result_source_id=src.id WHERE project_id=s.project_id AND id=s.job_id;
 PERFORM sophia.design_fail(s.project_id,s.job_id,'failed','blocked: '||v_reason);
 RETURN jsonb_build_object('outcome','blocked','taskId',s.job_id,'resultSourceId',src.id);
END $$;

-- --- the reviewer's submit ---------------------------------------------------------------------------------------------------

-- The captures a pass needs that the review has not inspected: each target's overview, and every section the render
-- captured at one target at least.
CREATE FUNCTION sophia.review_missing(rv sophia.design_reviews, r sophia.render_jobs) RETURNS text[] LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(array_agg(m ORDER BY n, m),'{}') FROM (
  SELECT 0 AS n, 'the overview at '||t AS m FROM unnest(r.targets) t WHERE NOT (t||'.overview.1.png')=ANY(rv.inspected)
  UNION ALL
  SELECT 1, 'section '||sec FROM (SELECT DISTINCT jsonb_array_elements_text(x->'coverage'->'captured') AS sec
    FROM jsonb_array_elements(coalesce(r.receipt->'targets','[]')) x) q
   WHERE NOT EXISTS(SELECT 1 FROM unnest(rv.inspected) i WHERE i LIKE '%.section.'||q.sec||'.%')) z $$;
REVOKE ALL ON FUNCTION sophia.review_missing(sophia.design_reviews,sophia.render_jobs) FROM PUBLIC;

-- A review's result: its verdict and findings, checked. Returns the findings normalized.
CREATE FUNCTION sophia.review_findings(p_result jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE f jsonb:=coalesce(p_result->'findings','[]'); serious integer;
BEGIN
 IF coalesce(p_result->>'verdict','') NOT IN ('pass','needs_revision') THEN RAISE EXCEPTION 'A review''s verdict is pass or needs_revision' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(f)<>'array' OR jsonb_array_length(f)>40 OR EXISTS(SELECT 1 FROM jsonb_array_elements(f) x WHERE jsonb_typeof(x)<>'object'
   OR coalesce(x->>'severity','') NOT IN ('blocking','major','minor') OR coalesce(length(x->>'issue'),0) NOT BETWEEN 1 AND 500
   OR length(x->>'fix')>500 OR length(x->>'section')>64 OR coalesce(x->>'target','w390-light') NOT IN ('w390-light','w1280-light')
   OR length(x->>'capture')>160) THEN
  RAISE EXCEPTION 'A finding has a severity, an issue of 1 to 500 characters and optionally a fix, target, section and capture' USING ERRCODE='22023'; END IF;
 SELECT count(*) INTO serious FROM jsonb_array_elements(f) x WHERE x->>'severity' IN ('blocking','major');
 IF p_result->>'verdict'='pass' AND serious>0 THEN RAISE EXCEPTION 'A pass carries no blocking or major finding' USING ERRCODE='22023'; END IF;
 IF p_result->>'verdict'='needs_revision' AND serious=0 THEN
  RAISE EXCEPTION 'A revision request names at least one blocking or major finding' USING ERRCODE='22023'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('severity',x->>'severity','issue',x->>'issue','fix',x->>'fix',
   'target',x->>'target','section',x->>'section','capture',x->>'capture')) ORDER BY i),'[]') FROM jsonb_array_elements(f) WITH ORDINALITY q(x,i));
END $$;
REVOKE ALL ON FUNCTION sophia.review_findings(jsonb) FROM PUBLIC;

-- POST /v1/runtime/review/submit: the review's result, or a blocker (exactly one). Idempotent by the call. A pass that
-- has not inspected what it must is answered with what is missing, and records nothing.
CREATE FUNCTION sophia.runtime_review_submit(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design_review',false);
 key text:=sophia.design_call_key(s,p_request); rv sophia.design_reviews; r sophia.render_jobs; missing text[]; v_findings jsonb; out jsonb;
 j sophia.jobs; src sophia.source_objects; v_summary text; v_reason text:=btrim(p_request->'blocker'->>'reason');
BEGIN
 IF (p_request ? 'result')=(p_request ? 'blocker') THEN RAISE EXCEPTION 'A submit carries a result or a blocker' USING ERRCODE='22023'; END IF;
 SELECT * INTO rv FROM sophia.design_reviews WHERE project_id=s.project_id AND job_id=s.job_id;
 IF rv.closed_by_call=key THEN
  IF (rv.verdict='blocked')<>(p_request ? 'blocker') THEN RAISE EXCEPTION 'Idempotency key reused for another submit' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('outcome','recorded','verdict',rv.verdict,'candidateId',rv.candidate_id);
 END IF;
 IF rv.closed_by_call IS NOT NULL THEN RAISE EXCEPTION 'The review has already ended' USING ERRCODE='40001'; END IF;
 s:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design_review',true);
 SELECT * INTO rv FROM sophia.design_reviews WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 IF p_request ? 'result' THEN
  v_findings:=sophia.review_findings(p_request->'result');
  v_summary:=nullif(btrim(coalesce(p_request->'result'->>'summary','')),'');
  IF length(v_summary)>2000 THEN RAISE EXCEPTION 'A review''s summary is at most 2000 characters' USING ERRCODE='22023'; END IF;
  IF p_request->'result'->>'verdict'='pass' THEN
   SELECT rj.* INTO r FROM sophia.render_jobs rj WHERE rj.project_id=s.project_id AND rj.job_id=(sophia.review_candidate(s)).render_job_id;
   missing:=sophia.review_missing(rv,r);
   IF cardinality(missing)>0 THEN RETURN jsonb_build_object('outcome','coverage_incomplete','missing',to_jsonb(missing[1:40])); END IF;
  END IF;
  UPDATE sophia.design_reviews SET verdict=p_request->'result'->>'verdict', findings=v_findings, summary=v_summary,
   submitted_at=now(), closed_by_call=key WHERE project_id=s.project_id AND job_id=s.job_id RETURNING * INTO rv;
  src:=sophia.put_text_source(s.project_id,s.actor_id,'text/markdown; charset=utf-8','Review verdict: '||rv.verdict
   ||coalesce(E'\n\n'||v_summary,''));
  UPDATE sophia.jobs SET state='succeeded', result_source_id=src.id, result_revision=result_revision+1, reason=NULL
   WHERE project_id=s.project_id AND id=s.job_id RETURNING * INTO j;
  UPDATE sophia.work_attempts SET state='accepted' WHERE project_id=s.project_id AND id=s.attempt_id;
 ELSE
  IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'A blocker has a reason of 1 to 500 characters' USING ERRCODE='22023'; END IF;
  UPDATE sophia.design_reviews SET verdict='blocked', findings='[]', summary=v_reason, submitted_at=now(), closed_by_call=key
   WHERE project_id=s.project_id AND job_id=s.job_id RETURNING * INTO rv;
  UPDATE sophia.jobs SET state='failed', reason=left('blocked: '||v_reason,2000), result_revision=result_revision+1
   WHERE project_id=s.project_id AND id=s.job_id;
  UPDATE sophia.work_attempts SET state='failed' WHERE project_id=s.project_id AND id=s.attempt_id;
 END IF;
 out:=sophia.design_review_outcome(s.project_id,s.job_id);
 RETURN jsonb_build_object('outcome','recorded','verdict',rv.verdict,'candidateId',rv.candidate_id,'decision',out);
END $$;

-- --- turn ends ------------------------------------------------------------------------------------------------------------------

-- A review that ends without its result (its turn failed, or it never submitted): the candidate is published with that
-- said, review_unresolved.
CREATE FUNCTION sophia.design_review_lost(p_project uuid, p_review uuid, p_reason text) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.design_reviews SET verdict='blocked', findings='[]', summary=left(p_reason,2000), submitted_at=now()
  WHERE project_id=p_project AND job_id=p_review AND verdict IS NULL;
 UPDATE sophia.jobs SET state='failed', reason=left(p_reason,2000) WHERE project_id=p_project AND id=p_review AND state IN ('pending','running','outcome_unknown');
 PERFORM sophia.design_review_outcome(p_project,p_review);
END $$;
REVOKE ALL ON FUNCTION sophia.design_review_lost(uuid,uuid,text) FROM PUBLIC;

-- How a design or review turn ends (see the header). Called by capture_native_result with the job locked.
CREATE FUNCTION sophia.design_turn_end(p_project uuid, b sophia.execution_bindings, g sophia.goals, j sophia.jobs, p_turn_end_seq bigint, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.design_tasks; rv sophia.design_reviews; owner sophia.runtime_commands; nudge uuid; actor uuid; cmd uuid;
BEGIN
 IF j.state NOT IN ('pending','running','outcome_unknown') THEN RETURN; END IF;
 IF j.kind='design' THEN
  SELECT * INTO t FROM sophia.design_tasks WHERE project_id=p_project AND job_id=j.id FOR UPDATE;
  nudge:=t.nudge_command_id; actor:=t.actor_id;
 ELSE
  SELECT * INTO rv FROM sophia.design_reviews WHERE project_id=p_project AND job_id=j.id FOR UPDATE;
  nudge:=rv.nudge_command_id; actor:=rv.actor_id;
 END IF;
 IF p_reason IS DISTINCT FROM 'completed' THEN
  IF p_reason IN ('error','max-tokens','blocked') AND g.status IN ('ready','running','checking') THEN
   UPDATE sophia.research_allowances al SET reserved_usd=al.reserved_usd-x.amount, uncertain_usd=al.uncertain_usd+x.amount
    FROM (SELECT r.allowance_id, sum(r.reserved_usd) AS amount FROM sophia.research_reservations r JOIN sophia.research_allowances a2
      ON a2.project_id=r.project_id AND a2.id=r.allowance_id WHERE r.project_id=p_project AND r.state='reserved'
      AND starts_with(r.reservation_key,b.native_session_id||':') GROUP BY r.allowance_id) x
    WHERE al.project_id=p_project AND al.id=x.allowance_id;
   UPDATE sophia.research_reservations SET state='uncertain', ended_at=now() WHERE project_id=p_project AND state='reserved'
    AND starts_with(reservation_key,b.native_session_id||':');
   IF j.kind='design' THEN PERFORM sophia.design_fail(p_project,j.id,'failed','the designer''s turn ended: '||p_reason);
   ELSE PERFORM sophia.design_review_lost(p_project,j.id,'The visual review''s turn ended: '||p_reason); END IF;
  END IF;
  RETURN;
 END IF;
 SELECT rc.* INTO owner FROM sophia.runtime_commands rc
  JOIN sophia.runtime_receipts r ON r.project_id=rc.project_id AND r.runtime_command_id=rc.id
  WHERE rc.project_id=p_project AND rc.binding_id=b.id AND rc.kind<>'inspect'
   AND r.stage IN ('delivered','incorporation_observed','checked','outcome_unknown') AND coalesce(r.native_sequence,0)<p_turn_end_seq
  ORDER BY coalesce(r.native_sequence,0) DESC, rc.seq DESC LIMIT 1;
 IF NOT FOUND OR owner.authority_epoch<>g.authority_epoch OR owner.kind NOT IN ('create','resume','steer','input')
  OR g.status NOT IN ('ready','running','checking') THEN RETURN; END IF;
 -- A designer whose candidate is under review is waiting for it, not done.
 IF j.kind='design' AND t.state<>'designing' THEN RETURN; END IF;
 IF nudge IS NOT NULL THEN
  IF owner.command_id=nudge THEN
   IF j.kind='design' THEN PERFORM sophia.design_fail(p_project,j.id,'failed','no_candidate_submitted: the source is kept');
   ELSE PERFORM sophia.design_review_lost(p_project,j.id,'The visual reviewer ended without a verdict'); END IF;
  END IF;
  RETURN;
 END IF;
 cmd:=gen_random_uuid();
 cmd:=sophia.design_input(p_project,b.id,actor,j.kind||'-nudge:'||cmd,jsonb_build_object('kind','input','nudge',j.kind,'attemptId',b.attempt_id),
  sophia.design_nudge_text(j.kind));
 IF j.kind='design' THEN UPDATE sophia.design_tasks SET nudge_command_id=cmd WHERE project_id=p_project AND job_id=j.id;
 ELSE UPDATE sophia.design_reviews SET nudge_command_id=cmd WHERE project_id=p_project AND job_id=j.id; END IF;
 PERFORM sophia.emit_service_event(p_project,'native_task.nudged','job',j.id,j.result_revision+3,'native_task.no_result_yet');
END $$;
REVOKE ALL ON FUNCTION sophia.design_turn_end(uuid,sophia.execution_bindings,sophia.goals,sophia.jobs,bigint,text) FROM PUBLIC;

-- capture_native_result (0026), replaced: a design's or a review's turn end follows the rules above; research's and a
-- brief's are as before.
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
 SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND attempt_id=b.attempt_id AND kind IN ('design','design_review') FOR UPDATE;
 IF FOUND THEN PERFORM sophia.design_turn_end(p_project,b,g,j,p_turn_end_seq,p_reason); RETURN; END IF;
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

-- --- dispatch ---------------------------------------------------------------------------------------------------------------------

-- dispatch_runtime_outbox (0037), replaced: the same, and a design or review create takes its role and route from its
-- manifest and is sent its task statement. A design whose content package is not frozen is never started.
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
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=o.goal_id FOR UPDATE;
 SELECT * INTO c FROM sophia.commands WHERE project_id=p_project AND id=o.command_id FOR UPDATE;
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
  IF b.state IN ('settled','lost') OR (b.state='created' AND NOT EXISTS(SELECT 1 FROM sophia.runtime_commands WHERE project_id=p_project AND binding_id=b.id)) THEN
   UPDATE sophia.execution_bindings SET state='settled' WHERE project_id=p_project AND id=b.id AND state<>'lost';
   UPDATE sophia.outbox SET state='settled', lease_until=NULL WHERE project_id=p_project AND id=p_outbox;
   UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
   PERFORM sophia.settle_native_control(p_project,g.id);
   RETURN jsonb_build_object('result','settled','reason','no native session to fence');
  END IF;
  IF rt.id IS NULL THEN RETURN sophia.deny_native_delivery(o,c,'no active runtime for its executor resource and runtime unit'); END IF;
 ELSE
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

-- --- Stop -----------------------------------------------------------------------------------------------------------------------

-- At a settled Stop (status stopped, at commit): a design under way on the goal ends cancelled, its research task says
-- so, and a goal whose report is published (only the design reopened it) completes again.
CREATE FUNCTION sophia.design_stopped() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r record; reopened boolean:=false;
BEGIN
 FOR r IN SELECT t.job_id FROM sophia.design_tasks t JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
   JOIN sophia.work_attempts wa ON wa.project_id=j.project_id AND wa.id=j.attempt_id
   WHERE t.project_id=NEW.project_id AND wa.goal_id=NEW.id FOR UPDATE OF t LOOP
  reopened:=true;
  PERFORM sophia.design_fail(NEW.project_id,r.job_id,'cancelled','stopped: the work was stopped')
   FROM sophia.design_tasks t WHERE t.project_id=NEW.project_id AND t.job_id=r.job_id AND t.state IN ('designing','reviewing');
 END LOOP;
 IF reopened AND (SELECT a.state FROM sophia.jobs j JOIN sophia.work_attempts a ON a.project_id=j.project_id AND a.id=j.attempt_id
   WHERE j.project_id=NEW.project_id AND a.goal_id=NEW.id AND j.kind='research' ORDER BY j.created_at DESC, j.id DESC LIMIT 1)='accepted' THEN
  UPDATE sophia.goals SET status='completed', state_revision=state_revision+1 WHERE project_id=NEW.project_id AND id=NEW.id AND status='stopped';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sophia.design_stopped() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER goals_stop_ends_designs AFTER UPDATE OF status ON sophia.goals
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.status='stopped' AND OLD.status IS DISTINCT FROM 'stopped')
 EXECUTE FUNCTION sophia.design_stopped();

REVOKE ALL ON FUNCTION sophia.request_research_design(uuid,uuid,jsonb), sophia.design_package_input(uuid),
 sophia.design_freeze_package(uuid,jsonb), sophia.html_design_ready(uuid,text,text), sophia.design_package_failed(uuid,text), sophia.runtime_design_submit(bytea,text,text,jsonb),
 sophia.runtime_review_submit(bytea,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.request_research_design(uuid,uuid,jsonb), sophia.design_package_input(uuid),
 sophia.design_freeze_package(uuid,jsonb), sophia.html_design_ready(uuid,text,text), sophia.design_package_failed(uuid,text), sophia.runtime_design_submit(bytea,text,text,jsonb),
 sophia.runtime_review_submit(bytea,text,text,jsonb) TO sophia_api;

COMMIT;
