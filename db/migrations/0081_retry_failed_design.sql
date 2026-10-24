-- 0081: try a failed HTML design of a report again, from its frozen content package (FND-B-HTML-RETAINED-RECOVERY-01).
--
-- A create design that ended failed (its designer blocked, a gate it could not pass) had no way back: request_design_edit
-- revises published pages only, request_research_design answers once and only while the research runs, and design_fail
-- is terminal. retry_failed_design is that way back, for an editor, as one new design attempt:
-- * The same content. The new design task is bound to the failed task's frozen content package (its source and hash,
--   checked again against the stored bytes), version and Markdown hash; the package is never rebuilt
--   (design_package_input answers nothing once it is frozen). Its first source revision is the failed task's last one,
--   copied as request_design_edit copies its base, so the designer renders and submits the page it already wrote; every
--   gate (the exhaustive width sweep, the capture, delivery and review rules) applies unchanged.
-- * Fresh work, fresh money. A new goal holds the attempt; the failed task's goal, job, attempt, candidates, reason and
--   allowance stay exactly as they ended (only the research task's current design pointer moves, as at publication).
--   The attempt spends from a NEW allowance under the project's research grant, capped at the grant's task cap: the old
--   allowance is never reused or reset. Every model call still reserves first against it (reserve_research: the grant
--   enabled, the allowance's cap, the grant's total cap), so a closed gate refuses before any provider call.
-- * The owner's approval, once. The grant is set by the owner alone (set_research_grant is granted to no login). A retry
--   names the grant's current revision and approval reference, and is admitted only while that approval is newer than
--   the latest design of the version: one owner approval admits at most one retry, and a retry that fails needs another.
-- * Refused, with nothing admitted: a viewer or outsider; a task that is not a failed create, or whose package was never
--   frozen; a version that is no longer current or already has a designed page (an edit is the way then); a withdrawn
--   source; a design of the version under way or a later one; the per-report design limit; no designer or capture
--   renderer ready; a closed gate, another approval than the current one, or one older than the latest design.
-- * The same key returns the same retry (a new key would need a new approval); the key replayed with another version
--   or another failed design is a conflict. The project's row is locked first, as request_design_edit does, and the
--   caller's editor role is checked again under it: a removal or demotion that commits while the retry waits refuses it.
-- design_tasks_edit_binding now lets a create carry a request key (a retry's); an edit still needs its base, instruction
-- and key, an audit none. 0001–0080 are not edited.
BEGIN;

DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.pronamespace='sophia'::regnamespace AND p.proname='retry_failed_design') THEN
  RAISE EXCEPTION '0081: a routine sophia.retry_failed_design already exists; it is created here only' USING ERRCODE='42723';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='sophia.design_tasks'::regclass AND conname='design_tasks_edit_binding'
   AND pg_catalog.pg_get_constraintdef(oid) LIKE '%(mode = ''edit''::text) = (request_key IS NOT NULL)%') THEN
  RAISE EXCEPTION '0081: design_tasks_edit_binding is not the constraint 0041 recorded' USING ERRCODE='55000';
 END IF;
END $$;

ALTER TABLE sophia.design_tasks DROP CONSTRAINT design_tasks_edit_binding,
 ADD CONSTRAINT design_tasks_edit_binding CHECK((mode='edit')=(base_candidate_id IS NOT NULL) AND (mode='edit')=(instruction_source_id IS NOT NULL)
  AND (mode<>'edit' OR request_key IS NOT NULL) AND (mode<>'audit' OR request_key IS NULL));

CREATE FUNCTION sophia.retry_failed_design(p_project uuid, p_job uuid, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE actor uuid:=sophia.actor_id(); key text:=p_request->>'requestKey'; stored text; prior sophia.design_tasks; f sophia.design_tasks;
 v sophia.artifact_versions; a sophia.artifacts; r sophia.research_tasks; rt sophia.runtime_instances; gr sophia.research_grants;
 pkg sophia.source_objects; body text; last sophia.design_sources; pr sophia.projects; goal uuid:=gen_random_uuid(); job uuid:=gen_random_uuid();
 al sophia.research_allowances; manifest jsonb; t sophia.design_tasks; version uuid:=sophia.uuid_or_null(p_request->>'versionId');
BEGIN
 IF actor IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_request)<>'object' OR (p_request-ARRAY['requestKey','versionId','grantRevision','approvalRef'])<>'{}'::jsonb
  OR jsonb_typeof(p_request->'grantRevision')<>'number' OR jsonb_typeof(p_request->'approvalRef')<>'string' OR version IS NULL THEN
  RAISE EXCEPTION 'A retry names the version, the grant''s revision and its approval' USING ERRCODE='22023'; END IF;
 IF key IS NULL OR length(key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 -- Kept apart from an edit's raw key: a retry's is stored as the hash of the key it was asked with.
 stored:='retry:'||encode(sha256(convert_to(key,'UTF8')),'hex');
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 -- Again under the project's lock, which a removal or a role change takes first (0056, 0058): one that committed while
 -- this waited is seen here, before any replay or admission.
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO f FROM sophia.design_tasks WHERE project_id=p_project AND job_id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Design task not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM sophia.design_tasks WHERE project_id=p_project AND actor_id=actor AND request_key=stored;
 IF FOUND THEN
  IF prior.mode<>'create' OR prior.base_version_id IS DISTINCT FROM version OR prior.package_source_id IS DISTINCT FROM f.package_source_id THEN
   RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('taskId',prior.job_id,'state',prior.state,'versionId',prior.base_version_id,'packageSha256',prior.package_sha256,
   'allowanceId',prior.allowance_id);
 END IF;
 IF f.mode<>'create' THEN RAISE EXCEPTION 'Only a failed design of a report can be tried again' USING ERRCODE='22023'; END IF;
 IF f.state<>'failed' THEN RAISE EXCEPTION 'This design has not failed: there is nothing to try again' USING ERRCODE='40001'; END IF;
 IF f.package_source_id IS NULL THEN RAISE EXCEPTION 'This design never froze its content: there is nothing to try again' USING ERRCODE='22023'; END IF;
 IF f.base_version_id IS DISTINCT FROM version THEN RAISE EXCEPTION 'Stale report version: this design was of another version' USING ERRCODE='40001'; END IF;
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=p_project AND id=version;
 SELECT * INTO a FROM sophia.artifacts WHERE project_id=p_project AND id=v.artifact_id FOR UPDATE;
 IF a.stable_version_id IS DISTINCT FROM v.id THEN
  RAISE EXCEPTION 'Stale report version: a newer version of this report exists' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.artifact_renditions x WHERE x.project_id=p_project AND x.artifact_version_id=v.id AND x.format='html'
   AND x.candidate_id IS NOT NULL) THEN
  RAISE EXCEPTION 'This version already has a designed page: ask for an edit' USING ERRCODE='40001'; END IF;
 IF sophia.source_withdrawn(p_project,v.source_id) OR sophia.source_withdrawn(p_project,f.package_source_id) THEN
  RAISE EXCEPTION 'Source not released and eligible for project work: this report draws on a withdrawn source' USING ERRCODE='42501'; END IF;
 SELECT * INTO pkg FROM sophia.source_objects WHERE project_id=p_project AND id=f.package_source_id;
 SELECT x.body INTO body FROM sophia.source_texts x WHERE x.project_id=p_project AND x.source_id=f.package_source_id;
 IF pkg.state IS DISTINCT FROM 'ready' OR pkg.sha256 IS DISTINCT FROM f.package_sha256 OR body IS NULL
  OR encode(sha256(convert_to(body,'UTF8')),'hex')<>f.package_sha256 THEN
  RAISE EXCEPTION 'The frozen content package of this design is not intact' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.design_tasks x WHERE x.project_id=p_project AND x.base_version_id=v.id AND x.state IN ('designing','reviewing')) THEN
  RAISE EXCEPTION 'A design of this page is already under way' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.design_tasks x WHERE x.project_id=p_project AND x.base_version_id=v.id AND x.created_at>f.created_at) THEN
  RAISE EXCEPTION 'A later design of this version exists: try that one again' USING ERRCODE='40001'; END IF;
 IF (SELECT count(*) FROM sophia.design_tasks x WHERE x.project_id=p_project AND x.artifact_id=a.id)>=16 THEN
  RAISE EXCEPTION 'Design edit limit reached' USING ERRCODE='55000'; END IF;
 SELECT * INTO r FROM sophia.research_tasks WHERE project_id=p_project AND job_id=f.research_job_id FOR UPDATE;
 rt:=sophia.role_runtime(p_project,r.design_request->'designer'->>'role',r.design_request->'designer'->>'route');
 IF rt.id IS NULL THEN RAISE EXCEPTION 'HTML design is unavailable: no runtime is ready with the designer' USING ERRCODE='55000'; END IF;
 IF NOT sophia.capture_renderer_ready() THEN
  RAISE EXCEPTION 'HTML design is unavailable: no capture renderer is asking for work' USING ERRCODE='55000'; END IF;
 -- The owner's spend approval: enabled, the one named, and newer than the latest design of this version.
 SELECT * INTO gr FROM sophia.research_grants WHERE project_id=p_project FOR SHARE;
 IF NOT FOUND OR gr.state<>'enabled' THEN RAISE EXCEPTION 'Research gate closed' USING ERRCODE='55000'; END IF;
 IF (p_request->>'grantRevision')::numeric IS DISTINCT FROM gr.revision OR p_request->>'approvalRef' IS DISTINCT FROM gr.approval_ref THEN
  RAISE EXCEPTION 'Stale spend approval: the grant named is not the current one' USING ERRCODE='40001'; END IF;
 IF gr.updated_at<=(SELECT max(x.created_at) FROM sophia.design_tasks x WHERE x.project_id=p_project AND x.base_version_id=v.id) THEN
  RAISE EXCEPTION 'Stale spend approval: it predates the last design of this report, and a retry needs a fresh one' USING ERRCODE='40001'; END IF;
 -- Admission: a new goal and attempt, a new allowance, the new design task on the frozen package, its first revision.
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project;
 INSERT INTO sophia.goals(project_id,id,title,outcome,criteria,mission_revision,status)
 VALUES(p_project,goal,left('HTML page, tried again: '||regexp_replace(a.title,'\s+',' ','g'),120),
  'The report version''s HTML page, designed again from its frozen content package and published only through the full capture gate and review',
  jsonb_build_array(jsonb_build_object('id','html-published','description',
   'The page of the frozen content package passes every capture gate and its review, or the retry ends without publishing','required',true,
   'verification','structural')),
  pr.mission_revision,'ready');
 manifest:=jsonb_build_object('schema','sophia.design-manifest.v1','projectId',p_project,'taskId',job,'researchTaskId',r.job_id,
  'role',r.design_request->'designer'->>'role','route',r.design_request->'designer'->>'route','mode','create','artifactId',v.artifact_id,
  'versionId',v.id,'versionNumber',v.version_number,'markdownSourceId',v.source_id,'markdownSha256',v.source_hash,
  'targets',r.design_request->'targets','language',r.design_request->>'language');
 PERFORM sophia.design_attempt(p_project,goal,actor,'design',job,rt,manifest,ARRAY[v.source_id,f.package_source_id],v.artifact_id);
 INSERT INTO sophia.research_allowances(project_id,root_job_id,cap_usd,headroom_usd,source_policy,max_searches,max_reads)
 VALUES(p_project,job,gr.task_cap_usd,0,gr.source_policy,0,0) RETURNING * INTO al;
 INSERT INTO sophia.design_tasks(project_id,job_id,research_job_id,root_job_id,allowance_id,actor_id,artifact_id,base_version_id,markdown_sha256,
  mode,language,targets,role,route,package_source_id,package_sha256,request_key)
 VALUES(p_project,job,f.research_job_id,job,al.id,actor,f.artifact_id,f.base_version_id,f.markdown_sha256,'create',f.language,f.targets,f.role,
  f.route,f.package_source_id,f.package_sha256,stored)
 RETURNING * INTO t;
 SELECT * INTO last FROM sophia.design_sources WHERE project_id=p_project AND design_job_id=f.job_id ORDER BY seq DESC LIMIT 1;
 IF FOUND THEN
  INSERT INTO sophia.design_sources(project_id,design_job_id,seq,base_id,call_key,kind,package_sha256,files,sections,complete,findings,finding_count,
   compiled_source_id)
  VALUES(p_project,job,1,NULL,'retained:'||last.id,'write',last.package_sha256,last.files,last.sections,last.complete,last.findings,
   last.finding_count,last.compiled_source_id);
 END IF;
 UPDATE sophia.research_tasks SET design_state='designing', design_reason=NULL, design_job_id=job WHERE project_id=p_project AND job_id=r.job_id;
 PERFORM sophia.emit_service_event(p_project,'native_task.admitted','job',job,1,'native_task.design',jsonb_build_array(goal,v.source_id));
 RETURN jsonb_build_object('taskId',t.job_id,'state',t.state,'versionId',t.base_version_id,'packageSha256',t.package_sha256,
  'allowanceId',t.allowance_id);
END $$;
REVOKE ALL ON FUNCTION sophia.retry_failed_design(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.retry_failed_design(uuid,uuid,jsonb) TO sophia_api;

COMMIT;
