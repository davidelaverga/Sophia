-- SMC-M03 S5b part 2b (plan §2.5 "Rendition", §2.8.2 "Try PDF again"): the PDF of a report published without one.
-- * A rendition is binding-less: a render job only, no model call, no runtime session, no external call. An editor
--   asks for it on a PDF task whose published version has no PDF. The API prints that version's Markdown with the
--   same pdf-report-v1 template (@sophia/report) in one transaction: research_rendition_input gives the text and the
--   sources it cites, request_research_rendition queues the HTML (derived from the version and those sources).
-- * It is refused for a task with nothing to render (no PDF asked, not published, or the PDF already there), a version
--   that is no longer the report's current one, research under way on the report, a goal held or stopped, a rendition
--   already in flight, three attempts on one version, or no live render runner.
-- * Phase mapping: the request reopens the completed goal (running), so the renderer's own rules apply: a Hold defers
--   the claim (the render waits for Resume), a Stop cancels it. When the render settles, the goal completes again,
--   unless other work is under way on it; a Stop that ended nothing but renditions completes it again too, with the
--   reason on the task. A rendition whose report moved on (a newer version published by an amendment) is cancelled.
--   0030's three-render cap counts the task's own renders only; renditions have their own (three per version).
-- * A succeeded rendition publishes a rendition-only version: the same text and source, the next number, the note
--   "Adds the PDF that could not be produced in vN", the PDF as its rendition, unchanged section facts, and the
--   limitations of vN less any about the PDF. A newer version published meanwhile wins: the rendition then publishes
--   nothing. A failed one records the reason on the task.
-- 0001–0031 are not edited; enqueue_render_job, render_sweep and renderer_settle are replaced with the same signatures.
BEGIN;

ALTER TABLE sophia.render_jobs
 ADD COLUMN kind text NOT NULL DEFAULT 'task' CHECK(kind IN ('task','rendition')),
 ADD COLUMN base_version_id uuid,
 ADD COLUMN requested_by uuid,
 ADD COLUMN reopened_goal boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT render_jobs_base_version_fk FOREIGN KEY(project_id,base_version_id) REFERENCES sophia.artifact_versions(project_id,id),
 ADD CONSTRAINT render_jobs_rendition CHECK((kind='rendition')=(base_version_id IS NOT NULL));

-- --- queueing, shared -------------------------------------------------------------------------------------------

-- A render of a package for a research task, after the caller's own rules: the package checks and the rows (0030).
CREATE FUNCTION sophia.queue_render_package(p_project uuid, p_parent uuid, p_goal uuid, p_language text, p_files jsonb)
RETURNS sophia.render_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE job uuid:=gen_random_uuid(); r sophia.render_jobs; entry record; assets jsonb;
BEGIN
 IF jsonb_typeof(p_files)<>'array' OR jsonb_array_length(p_files) NOT BETWEEN 1 AND 65
  OR (SELECT count(*) FROM jsonb_array_elements(p_files) f WHERE f->>'role'='entry')<>1
  OR (SELECT count(DISTINCT f->>'path') FROM jsonb_array_elements(p_files) f)<>jsonb_array_length(p_files) THEN
  RAISE EXCEPTION 'A render package is one entry and at most 64 assets, each path once' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_files) f WHERE NOT sophia.is_render_path(f->>'path')
   OR coalesce(f->>'sourceId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR NOT EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=p_project AND s.id=(f->>'sourceId')::uuid
    AND s.scope='project' AND s.eligible AND s.state='ready')) THEN
  RAISE EXCEPTION 'A render package names ready, eligible project sources by relative paths' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_files) f WHERE NOT ((f->>'role'='entry' AND f->>'path' ~* '\.html?$')
   OR (f->>'role'='asset' AND f->>'path' ~* '\.(png|jpe?g|webp|gif)$'))) THEN
  RAISE EXCEPTION 'A render package''s entry is HTML and its assets are raster images' USING ERRCODE='22023'; END IF;
 SELECT f->>'path' AS path, s.sha256 INTO entry FROM jsonb_array_elements(p_files) f
  JOIN sophia.source_objects s ON s.project_id=p_project AND s.id=(f->>'sourceId')::uuid WHERE f->>'role'='entry';
 SELECT coalesce(jsonb_agg(jsonb_build_object('path',f->>'path','sha256',s.sha256)),'[]') INTO assets FROM jsonb_array_elements(p_files) f
  JOIN sophia.source_objects s ON s.project_id=p_project AND s.id=(f->>'sourceId')::uuid WHERE f->>'role'='asset';
 INSERT INTO sophia.jobs(project_id,id,kind,state,parent_job_id) VALUES(p_project,job,'render','pending',p_parent);
 INSERT INTO sophia.render_jobs(project_id,job_id,parent_job_id,goal_id,format,language,manifest_sha256)
 VALUES(p_project,job,p_parent,p_goal,'pdf',p_language,sophia.render_manifest_sha256(entry.path,entry.sha256,assets)) RETURNING * INTO r;
 INSERT INTO sophia.render_job_files(project_id,job_id,path,role,source_id)
 SELECT p_project,job,f->>'path',f->>'role',(f->>'sourceId')::uuid FROM jsonb_array_elements(p_files) f;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION sophia.queue_render_package(uuid,uuid,uuid,text,jsonb) FROM PUBLIC;

-- enqueue_render_job (0030), replaced: the same, and its three-render cap counts the task's own renders only.
CREATE OR REPLACE FUNCTION sophia.enqueue_render_job(p_project uuid, p_parent_job uuid, p_language text, p_files jsonb)
RETURNS sophia.render_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE parent sophia.jobs; goal uuid; n integer;
BEGIN
 SELECT * INTO parent FROM sophia.jobs WHERE project_id=p_project AND id=p_parent_job FOR UPDATE;
 IF NOT FOUND OR parent.kind<>'research' THEN RAISE EXCEPTION 'Research task not found' USING ERRCODE='22023'; END IF;
 IF parent.state NOT IN ('pending','running') THEN RAISE EXCEPTION 'Research work is not active: the task has ended' USING ERRCODE='40001'; END IF;
 SELECT a.goal_id INTO goal FROM sophia.work_attempts a WHERE a.project_id=p_project AND a.id=parent.attempt_id;
 SELECT count(*) INTO n FROM sophia.render_jobs WHERE project_id=p_project AND parent_job_id=p_parent_job AND kind='task';
 IF n>=3 THEN RAISE EXCEPTION 'Research render limit reached' USING ERRCODE='55000'; END IF;
 RETURN sophia.queue_render_package(p_project,p_parent_job,goal,p_language,p_files);
END $$;

-- --- the request ----------------------------------------------------------------------------------------------

-- The task, the version a rendition prints and its goal, after every rule (see the header). The caller is the member.
CREATE FUNCTION sophia.research_rendition_target(p_project uuid, p_task uuid, OUT t sophia.research_tasks,
 OUT v sophia.artifact_versions, OUT g sophia.goals) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE j sophia.jobs; a sophia.artifacts; outputs jsonb;
BEGIN
 IF sophia.actor_id() IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Research task not found' USING ERRCODE='22023'; END IF;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND id=p_task AND kind='research' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research task not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=p_project AND job_id=j.id;
 SELECT x.body::jsonb->'outputs' INTO outputs FROM sophia.source_texts x WHERE x.project_id=p_project AND x.source_id=j.input_source_id;
 IF NOT coalesce(outputs ? 'pdf',false) THEN RAISE EXCEPTION 'This research task does not produce a PDF' USING ERRCODE='22023'; END IF;
 IF j.state<>'succeeded' THEN RAISE EXCEPTION 'This research has published no report to print' USING ERRCODE='22023'; END IF;
 IF t.pdf_state IS DISTINCT FROM 'not_produced' THEN RAISE EXCEPTION 'This report already has its PDF' USING ERRCODE='22023'; END IF;
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=p_project AND job_id=j.id ORDER BY version_number DESC LIMIT 1;
 SELECT * INTO a FROM sophia.artifacts WHERE project_id=p_project AND id=v.artifact_id FOR UPDATE;
 IF a.stable_version_id IS DISTINCT FROM v.id THEN
  RAISE EXCEPTION 'Stale report version: a newer version of this report exists' USING ERRCODE='40001'; END IF;
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts wa ON wa.project_id=g2.project_id AND wa.goal_id=g2.id
  WHERE wa.project_id=p_project AND wa.id=j.attempt_id FOR UPDATE OF g2;
 IF g.status IN ('holding','held') THEN RAISE EXCEPTION 'The research is held: resume it first' USING ERRCODE='40001'; END IF;
 IF g.status IN ('stopping','stopped') THEN RAISE EXCEPTION 'The research was stopped' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.render_jobs r JOIN sophia.jobs rj ON rj.project_id=r.project_id AND rj.id=r.job_id
   WHERE r.project_id=p_project AND r.parent_job_id=j.id AND r.kind='rendition' AND rj.state IN ('pending','running')) THEN
  RAISE EXCEPTION 'A PDF of this report is already being rendered' USING ERRCODE='40001'; END IF;
 IF g.status<>'completed' THEN RAISE EXCEPTION 'Research on this report is under way' USING ERRCODE='40001'; END IF;
 IF (SELECT count(*) FROM sophia.render_jobs r WHERE r.project_id=p_project AND r.base_version_id=v.id)>=3 THEN
  RAISE EXCEPTION 'Research render limit reached' USING ERRCODE='55000'; END IF;
 IF NOT sophia.pdf_renderer_ready() THEN RAISE EXCEPTION 'No PDF renderer is running' USING ERRCODE='55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.research_rendition_target(uuid,uuid) FROM PUBLIC;

-- The member's call key; the rendition an earlier call with it queued, if any.
CREATE FUNCTION sophia.research_rendition_call(p_project uuid, p_task uuid, p_key text, OUT key text, OUT existing uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF coalesce(p_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 key:='member:'||sophia.actor_id()||':'||p_key;
 SELECT job_id INTO existing FROM sophia.render_jobs WHERE project_id=p_project AND parent_job_id=p_task AND call_key=key;
END $$;
REVOKE ALL ON FUNCTION sophia.research_rendition_call(uuid,uuid,text) FROM PUBLIC;

-- POST /api/v1/projects/{projectId}/native-tasks/{taskId}/rendition, step 1: what the API prints. The rendition an earlier
-- call with the same key queued; or the version's text, the question, the language of the task's renders and every
-- source the version cites, with the title and URL its retrieval recorded.
CREATE FUNCTION sophia.research_rendition_input(p_project uuid, p_task uuid, p_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c record; tg record; body text; lang text;
BEGIN
 SELECT * INTO c FROM sophia.research_rendition_call(p_project,p_task,p_key);
 IF c.existing IS NOT NULL AND sophia.is_member(p_project) THEN
  RETURN jsonb_build_object('existing',sophia.research_render_view(p_project,c.existing)); END IF;
 SELECT * INTO tg FROM sophia.research_rendition_target(p_project,p_task);
 SELECT x.body INTO body FROM sophia.source_texts x WHERE x.project_id=p_project AND x.source_id=(tg.v).source_id;
 SELECT r.language INTO lang FROM sophia.render_jobs r WHERE r.project_id=p_project AND r.parent_job_id=p_task ORDER BY r.created_at DESC LIMIT 1;
 RETURN jsonb_build_object('versionId',(tg.v).id,'versionNumber',(tg.v).version_number,'text',body,'language',coalesce(lang,'en'),
  'layout','standard',
  'question',(SELECT x.body FROM sophia.source_texts x WHERE x.project_id=p_project AND x.source_id=(tg.t).question_source_id),
  'sources',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.source_id,'title',p.title,
     'url',coalesce(p.reported_final_url,p.requested_url)) ORDER BY d.source_id),'[]')
   FROM sophia.source_dependencies d LEFT JOIN sophia.source_provenance p ON p.project_id=d.project_id AND p.source_id=d.source_id
   WHERE d.project_id=p_project AND d.derived_source_id=(tg.v).source_id));
END $$;

-- Step 2, in the same transaction: queue the HTML the API printed from that version, and reopen the goal while it
-- renders. Everything step 1 checked is checked again.
CREATE FUNCTION sophia.request_research_rendition(p_project uuid, p_task uuid, p_key text, p_language text, p_html text, p_report jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c record; tg record; html sophia.source_objects; r sophia.render_jobs; v_lang text:=coalesce(nullif(p_language,''),'en');
BEGIN
 SELECT * INTO c FROM sophia.research_rendition_call(p_project,p_task,p_key);
 IF c.existing IS NOT NULL AND sophia.is_member(p_project) THEN RETURN sophia.research_render_view(p_project,c.existing); END IF;
 SELECT * INTO tg FROM sophia.research_rendition_target(p_project,p_task);
 IF p_html IS NULL OR octet_length(p_html) NOT BETWEEN 1 AND 4194304 OR jsonb_typeof(p_report)<>'object' OR p_report->>'layout'<>'standard' THEN
  RAISE EXCEPTION 'A render package is the printed report and its manifest' USING ERRCODE='22023'; END IF;
 IF v_lang !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' OR length(v_lang)>35 THEN RAISE EXCEPTION 'Invalid language tag' USING ERRCODE='22023'; END IF;
 html:=sophia.put_text_source(p_project,sophia.actor_id(),'text/html; charset=utf-8',p_html);
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
 SELECT p_project,x,html.id FROM (SELECT (tg.v).source_id AS x UNION
  SELECT d.source_id FROM sophia.source_dependencies d WHERE d.project_id=p_project AND d.derived_source_id=(tg.v).source_id) y
 ON CONFLICT DO NOTHING;
 r:=sophia.queue_render_package(p_project,p_task,(tg.g).id,v_lang,
  jsonb_build_array(jsonb_build_object('path','report.html','role','entry','sourceId',html.id)));
 UPDATE sophia.render_jobs SET kind='rendition', base_version_id=(tg.v).id, requested_by=sophia.actor_id(), reopened_goal=true,
  call_key=c.key, layout='standard', report_manifest=p_report-'sourceIds' WHERE project_id=p_project AND job_id=r.job_id;
 UPDATE sophia.goals SET status='running', state_revision=state_revision+1 WHERE project_id=p_project AND id=(tg.g).id;
 RETURN sophia.research_render_view(p_project,r.job_id);
END $$;

-- --- settling ---------------------------------------------------------------------------------------------------

-- A rendition's end (see the header): the rendition-only version, or the reason on the task; then its goal completes
-- again unless other work is under way on it.
CREATE FUNCTION sophia.research_rendition_settled(j sophia.jobs, r sophia.render_jobs) RETURNS void LANGUAGE plpgsql
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
   (SELECT coalesce(array_agg(u.l ORDER BY u.i),'{}') FROM (SELECT left('The PDF check '||(c->>'name')||' could not be confirmed',300) AS l, i
     FROM jsonb_array_elements(coalesce(r.receipt->'checks','[]')) WITH ORDINALITY x(c,i) WHERE c->>'outcome'='unknown' ORDER BY i LIMIT 8) u));
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
REVOKE ALL ON FUNCTION sophia.research_rendition_settled(sophia.jobs,sophia.render_jobs) FROM PUBLIC;

-- renderer_settle (0030), replaced: the same, and a rendition's end publishes or records it (above).
CREATE OR REPLACE FUNCTION sophia.renderer_settle(p_token_sha256 bytea, p_job text, p_lease text, p_receipt jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rn sophia.render_runners:=sophia.render_runner_of(p_token_sha256); j sophia.jobs:=sophia.render_leased(rn.id,p_job,p_lease);
 r sophia.render_jobs; g sophia.goals; p sophia.jobs; o sophia.source_objects; status text:=p_receipt->>'status'; outcome text; why text;
BEGIN
 SELECT * INTO r FROM sophia.render_jobs WHERE project_id=j.project_id AND job_id=j.id;
 IF j.state<>'running' THEN
  IF r.receipt IS NOT NULL AND r.receipt=p_receipt THEN RETURN jsonb_build_object('state',j.state,'reason',j.reason); END IF;
  RAISE EXCEPTION 'Render lease lost' USING ERRCODE='40001';
 END IF;
 IF jsonb_typeof(p_receipt)<>'object' OR status NOT IN ('succeeded','failed','cancelled') OR octet_length(p_receipt::text)>65536 THEN
  RAISE EXCEPTION 'A render settles with its receipt' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM sophia.goals WHERE project_id=j.project_id AND id=r.goal_id;
 SELECT * INTO p FROM sophia.jobs WHERE project_id=j.project_id AND id=r.parent_job_id;
 IF g.status IN ('holding','held') AND (p.state IN ('pending','running') OR r.kind='rendition') THEN
  UPDATE sophia.jobs SET state='pending', lease_token=NULL, lease_until=NULL WHERE project_id=j.project_id AND id=j.id;
  UPDATE sophia.render_jobs SET claims=greatest(claims-1,0), runner_id=NULL, output_source_id=NULL
   WHERE project_id=j.project_id AND job_id=j.id;
  RETURN jsonb_build_object('state','pending','reason','held: queued again for after Resume');
 END IF;
 IF status='succeeded' THEN
  SELECT * INTO o FROM sophia.source_objects WHERE project_id=j.project_id AND id=r.output_source_id;
  IF NOT FOUND OR p_receipt->'output'->>'sha256' IS DISTINCT FROM o.sha256
   OR p_receipt->'source'->>'manifestSha256' IS DISTINCT FROM r.manifest_sha256 THEN
   RAISE EXCEPTION 'A succeeded render names its package and its recorded output' USING ERRCODE='22023'; END IF;
 END IF;
 IF g.status IN ('stopping','stopped') OR p.state IN ('failed','cancelled') THEN
  outcome:='cancelled'; why:='stale: the work was stopped or ended while it rendered';
 ELSE
  outcome:=status;
  why:=CASE WHEN status='succeeded' THEN NULL ELSE left(coalesce(status||': '||(p_receipt->'error'->>'code'),status),200) END;
 END IF;
 UPDATE sophia.jobs SET state=outcome, reason=why, lease_until=NULL, result_source_id=CASE WHEN outcome='succeeded' THEN r.output_source_id END
  WHERE project_id=j.project_id AND id=j.id RETURNING * INTO j;
 UPDATE sophia.render_jobs SET receipt=p_receipt, settled_at=now() WHERE project_id=j.project_id AND job_id=j.id RETURNING * INTO r;
 IF r.kind='rendition' THEN PERFORM sophia.research_rendition_settled(j,r); END IF;
 RETURN jsonb_build_object('state',j.state,'reason',j.reason);
END $$;

-- render_sweep (0030), replaced: the same, and a rendition whose report has a newer current version is cancelled (it
-- would publish nothing, and its goal may never be active again to claim it).
CREATE OR REPLACE FUNCTION sophia.render_sweep() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.jobs j SET state='cancelled', lease_until=NULL,
  reason=CASE WHEN g.status IN ('stopping','stopped') THEN 'stopped: the work was stopped' ELSE 'cancelled: the research task ended without it' END
  FROM sophia.render_jobs r, sophia.goals g, sophia.jobs p
  WHERE j.kind='render' AND j.state IN ('pending','running') AND r.project_id=j.project_id AND r.job_id=j.id
   AND g.project_id=r.project_id AND g.id=r.goal_id AND p.project_id=r.project_id AND p.id=r.parent_job_id
   AND (g.status IN ('stopping','stopped') OR p.state IN ('failed','cancelled'));
 UPDATE sophia.jobs j SET state='cancelled', lease_until=NULL, reason='cancelled: a newer version of the report was published'
  FROM sophia.render_jobs r, sophia.artifact_versions v, sophia.artifacts a
  WHERE j.kind='render' AND j.state IN ('pending','running') AND r.project_id=j.project_id AND r.job_id=j.id AND r.kind='rendition'
   AND v.project_id=r.project_id AND v.id=r.base_version_id AND a.project_id=v.project_id AND a.id=v.artifact_id
   AND a.stable_version_id IS DISTINCT FROM v.id;
 UPDATE sophia.jobs j SET lease_until=NULL,
  state=CASE WHEN r.claims<3 THEN 'pending' ELSE 'failed' END,
  reason=CASE WHEN r.claims<3 THEN j.reason ELSE 'renderer_lost: the render runner stopped answering' END
  FROM sophia.render_jobs r WHERE j.kind='render' AND j.state='running' AND j.lease_until<now()
   AND r.project_id=j.project_id AND r.job_id=j.id;
END $$;

-- At a settled Stop (status stopped, at commit): renditions it ended carry the reason on their task, and a goal whose
-- latest attempt was accepted (its report published; only renditions reopened it) completes again.
CREATE FUNCTION sophia.research_rendition_stopped() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE r record;
BEGIN
 FOR r IN SELECT rj.job_id, rj.parent_job_id FROM sophia.render_jobs rj JOIN sophia.jobs j ON j.project_id=rj.project_id AND j.id=rj.job_id
   WHERE rj.project_id=NEW.project_id AND rj.goal_id=NEW.id AND rj.kind='rendition' AND rj.settled_at IS NULL FOR UPDATE OF rj, j LOOP
  UPDATE sophia.jobs SET state='cancelled', lease_until=NULL, reason='stopped: the work was stopped'
   WHERE project_id=NEW.project_id AND id=r.job_id AND state IN ('pending','running');
  UPDATE sophia.render_jobs SET settled_at=now() WHERE project_id=NEW.project_id AND job_id=r.job_id;
  UPDATE sophia.research_tasks SET pdf_reason='The PDF could not be produced again (stopped: the work was stopped)'
   WHERE project_id=NEW.project_id AND job_id=r.parent_job_id AND pdf_state='not_produced';
 END LOOP;
 IF (SELECT a.state FROM sophia.jobs j JOIN sophia.work_attempts a ON a.project_id=j.project_id AND a.id=j.attempt_id
   WHERE j.project_id=NEW.project_id AND a.goal_id=NEW.id AND j.kind='research' ORDER BY j.created_at DESC, j.id DESC LIMIT 1)='accepted'
  AND EXISTS(SELECT 1 FROM sophia.render_jobs rj WHERE rj.project_id=NEW.project_id AND rj.goal_id=NEW.id AND rj.reopened_goal) THEN
  UPDATE sophia.goals SET status='completed', state_revision=state_revision+1 WHERE project_id=NEW.project_id AND id=NEW.id AND status='stopped';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sophia.research_rendition_stopped() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER goals_stop_ends_renditions AFTER UPDATE OF status ON sophia.goals
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.status='stopped' AND OLD.status IS DISTINCT FROM 'stopped')
 EXECUTE FUNCTION sophia.research_rendition_stopped();

REVOKE ALL ON FUNCTION sophia.research_rendition_input(uuid,uuid,text),
 sophia.request_research_rendition(uuid,uuid,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.research_rendition_input(uuid,uuid,text),
 sophia.request_research_rendition(uuid,uuid,text,text,text,jsonb) TO sophia_api;

COMMIT;
