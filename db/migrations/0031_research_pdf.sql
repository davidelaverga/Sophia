-- SMC-M03 S5b part 1 (plan §2.7 "Job flow" and "Report contract"; binding §4): a research task's PDF.
-- * The PDF is a rendering of the task's Markdown draft, never of anything the model wrote as HTML. research_render_pdf
--   reaches POST /v1/runtime/research/render, which runs in one transaction: runtime_research_render_input gives the
--   API the current draft (it must be the one the model last read) and the sources it may cite; the API prints the
--   report with the pdf-report-v1 template (@sophia/report) and checks its manifest; runtime_research_render stores
--   that HTML as a source derived from the draft and the cited sources and queues it as the render's package (0030).
--   A report that fails its manifest checks is answered with them and never queued.
-- * Renders are bounded per task (0030: three in all), and so are repairs: the first render, then at most one
--   revision (a render of a different draft, after a failed check or a change) and one format repair (the same draft
--   again, in the compact layout). One render runs at a time; a draft that already has its PDF is not rendered again.
--   Past that, the task submits its Markdown and says what the PDF lacks.
-- * Submit: while a render of the task is queued or running, a result is refused (the render's result is close), for
--   ten minutes. Past that, or in the finalize step, the render is given up and cancelled: a renderer that stopped
--   answering never costs the task its report.
--   A published version gets the PDF of a succeeded render of exactly its draft as its rendition; without one it is
--   published as Markdown only and the task records why the PDF was not produced: a partial, never a "fallback".
-- * research_inspect_output reaches POST /v1/runtime/research/render-result: a render's state, its report manifest,
--   and once it has settled the kernel's checks and its sophia.render-result.v1 record.
-- 0001–0030 are not edited; runtime_research_submit is replaced with the same signature.
BEGIN;

ALTER TABLE sophia.render_jobs
 ADD COLUMN draft_sha256 text CHECK(draft_sha256 IS NULL OR draft_sha256 ~ '^[0-9a-f]{64}$'),
 ADD COLUMN repair text NOT NULL DEFAULT 'none' CHECK(repair IN ('none','semantic','format')),
 ADD COLUMN layout text NOT NULL DEFAULT 'standard' CHECK(layout IN ('standard','compact')),
 ADD COLUMN call_key text CHECK(call_key IS NULL OR call_key ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,239}$'),
 ADD COLUMN report_manifest jsonb CHECK(report_manifest IS NULL
  OR (jsonb_typeof(report_manifest)='object' AND octet_length(report_manifest::text)<=262144));
CREATE UNIQUE INDEX render_jobs_call ON sophia.render_jobs(project_id,parent_job_id,call_key) WHERE call_key IS NOT NULL;

-- Whether the task's PDF was produced, and if not, why (a short sentence the work card shows).
ALTER TABLE sophia.research_tasks
 ADD COLUMN pdf_state text CHECK(pdf_state IS NULL OR pdf_state IN ('produced','not_produced')),
 ADD COLUMN pdf_reason text CHECK(pdf_reason IS NULL OR length(pdf_reason) BETWEEN 1 AND 300),
 ADD CONSTRAINT research_tasks_pdf_reason CHECK((pdf_state='not_produced')=(pdf_reason IS NOT NULL));

-- The outputs the task was admitted with (its manifest).
CREATE FUNCTION sophia.research_outputs(s sophia.research_scope) RETURNS jsonb LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(t.body::jsonb->'outputs','[]') FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=s.manifest_source_id $$;
REVOKE ALL ON FUNCTION sophia.research_outputs(sophia.research_scope) FROM PUBLIC;

-- An object without its null members; nested values keep theirs (a check's null detail is part of the check).
CREATE FUNCTION sophia.without_null_members(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_object_agg(k,v),'{}'::jsonb) FROM jsonb_each(p) e(k,v) WHERE v<>'null'::jsonb $$;
REVOKE ALL ON FUNCTION sophia.without_null_members(jsonb) FROM PUBLIC;

-- A render as the research tools see it: its state, what it rendered and, once settled, what the kernel found.
CREATE FUNCTION sophia.research_render_view(p_project uuid, p_job uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE j sophia.jobs; r sophia.render_jobs; o sophia.source_objects; runner text; receipt jsonb;
BEGIN
 SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND id=p_job AND kind='render';
 SELECT * INTO r FROM sophia.render_jobs WHERE project_id=p_project AND job_id=p_job;
 SELECT * INTO o FROM sophia.source_objects WHERE project_id=p_project AND id=j.result_source_id;
 SELECT label INTO runner FROM sophia.render_runners WHERE id=r.runner_id;
 receipt:=r.receipt;
 RETURN sophia.without_null_members(jsonb_build_object(
  'renderJobId',j.id,'state',CASE j.state WHEN 'pending' THEN 'queued' WHEN 'running' THEN 'rendering' ELSE j.state END,
  'reason',j.reason,'repair',r.repair,'layout',r.layout,'draftSha256',r.draft_sha256,'manifestSha256',r.manifest_sha256,
  'report',r.report_manifest,
  'pdf',CASE WHEN o.id IS NULL THEN NULL ELSE sophia.without_null_members(jsonb_build_object('sourceId',o.id,'sha256',o.sha256,
   'bytes',o.byte_length,'pages',receipt->'output'->'pageCount')) END,
  'checks',receipt->'checks','warnings',receipt->'warnings','overflow',receipt->'measurements'->'overflow',
  'errorCode',receipt->'error'->>'code',
  'result',CASE WHEN receipt IS NULL OR j.state NOT IN ('succeeded','failed','cancelled') THEN NULL ELSE jsonb_build_object(
   'schema','sophia.render-result.v1','jobId',j.id,
   -- In a task, a render's source is its draft (a version exists only once the task publishes).
   'sourceVersionId',(SELECT d.source_id FROM sophia.research_drafts d JOIN sophia.work_attempts a ON a.project_id=d.project_id
     AND a.id=d.attempt_id JOIN sophia.jobs p ON p.project_id=a.project_id AND p.attempt_id=a.id
     WHERE d.project_id=p_project AND p.id=r.parent_job_id AND d.sha256=r.draft_sha256 ORDER BY d.seq DESC LIMIT 1),
   'sourceManifestHash',r.manifest_sha256,'status',j.state,'rendererUnitId',coalesce(runner,'unknown'),
   'outputs',CASE WHEN o.id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('sourceId',o.id,'sha256',o.sha256,'bytes',o.byte_length)) END,
   'previewSourceIds','[]'::jsonb,
   'checks',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',c->>'name','outcome',c->>'outcome',
     'evidenceRef','render-job:'||j.id||'#checks/'||(c->>'name')) ORDER BY i),'[]') FROM jsonb_array_elements(coalesce(receipt->'checks','[]')) WITH ORDINALITY x(c,i)),
   'warnings',coalesce(receipt->'warnings','[]'),'exportEditability','source_editable') END));
END $$;
REVOKE ALL ON FUNCTION sophia.research_render_view(uuid,uuid) FROM PUBLIC;

-- What a render of this task needs now, checked the same way at both steps of the call: a PDF task, not finalizing,
-- the draft the model names being its current one, no render in flight, a draft without its PDF yet, and a repair
-- left. The first render is 'none'; the same draft again is the format repair (compact); another draft is the
-- revision, in the layout the last render had.
CREATE FUNCTION sophia.research_render_plan(s sophia.research_scope, p_request jsonb, OUT draft sophia.research_drafts,
 OUT repair text, OUT layout text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.research_tasks; last sophia.render_jobs;
BEGIN
 IF NOT sophia.research_outputs(s) ? 'pdf' THEN RAISE EXCEPTION 'This research task does not produce a PDF' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 IF t.finalizing_at IS NOT NULL THEN RAISE EXCEPTION 'Research is finalizing' USING ERRCODE='55000'; END IF;
 SELECT * INTO draft FROM sophia.research_drafts WHERE project_id=s.project_id AND attempt_id=s.attempt_id ORDER BY seq DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research draft not found' USING ERRCODE='22023'; END IF;
 IF draft.sha256 IS DISTINCT FROM p_request->>'draftSha256' THEN
  RAISE EXCEPTION 'Stale draft: render the draft you last read' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.render_jobs r JOIN sophia.jobs j ON j.project_id=r.project_id AND j.id=r.job_id
   WHERE r.project_id=s.project_id AND r.parent_job_id=s.job_id AND j.state IN ('pending','running')) THEN
  RAISE EXCEPTION 'A PDF render of this task is still running: wait for its result' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.render_jobs r JOIN sophia.jobs j ON j.project_id=r.project_id AND j.id=r.job_id
   WHERE r.project_id=s.project_id AND r.parent_job_id=s.job_id AND j.state='succeeded' AND r.draft_sha256=draft.sha256) THEN
  RAISE EXCEPTION 'This draft already has its PDF' USING ERRCODE='22023'; END IF;
 repair:='none'; layout:='standard';
 SELECT * INTO last FROM sophia.render_jobs WHERE project_id=s.project_id AND parent_job_id=s.job_id ORDER BY created_at DESC, job_id LIMIT 1;
 IF FOUND THEN
  IF EXISTS(SELECT 1 FROM sophia.render_jobs WHERE project_id=s.project_id AND parent_job_id=s.job_id AND draft_sha256=draft.sha256) THEN
   repair:='format'; layout:='compact';
  ELSE repair:='semantic'; layout:=last.layout; END IF;
  IF EXISTS(SELECT 1 FROM sophia.render_jobs r WHERE r.project_id=s.project_id AND r.parent_job_id=s.job_id AND r.repair=research_render_plan.repair) THEN
   RAISE EXCEPTION 'Research render limit reached' USING ERRCODE='55000'; END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.research_render_plan(sophia.research_scope,jsonb) FROM PUBLIC;

-- The call's key; the render an earlier call with the same id queued, if any.
CREATE FUNCTION sophia.research_render_call(s sophia.research_scope, p_request jsonb, OUT key text, OUT existing uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF coalesce(p_request->>'callId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid call id' USING ERRCODE='22023'; END IF;
 key:=s.native_session_id||':'||(p_request->>'callId');
 SELECT job_id INTO existing FROM sophia.render_jobs WHERE project_id=s.project_id AND parent_job_id=s.job_id AND call_key=key;
END $$;
REVOKE ALL ON FUNCTION sophia.research_render_call(sophia.research_scope,jsonb) FROM PUBLIC;

-- POST /v1/runtime/research/render, step 1: what the API prints. The render an earlier call with the same id queued;
-- or the layout this render needs, the current draft's text, the question, and every source the draft names that
-- the task may cite, with the title and URL its retrieval recorded.
CREATE FUNCTION sophia.runtime_research_render_input(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true);
 c record; plan record; body text;
BEGIN
 SELECT * INTO c FROM sophia.research_render_call(s,p_request);
 IF c.existing IS NOT NULL THEN RETURN jsonb_build_object('existing',sophia.research_render_view(s.project_id,c.existing)); END IF;
 SELECT * INTO plan FROM sophia.research_render_plan(s,p_request);
 SELECT x.body INTO body FROM sophia.source_texts x WHERE x.project_id=s.project_id AND x.source_id=(plan.draft).source_id;
 RETURN jsonb_build_object('draftSha256',(plan.draft).sha256,'repair',plan.repair,'layout',plan.layout,'text',body,
  'question',(SELECT x.body FROM sophia.source_texts x WHERE x.project_id=s.project_id AND x.source_id=s.question_source_id),
  'sources',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c2.id,'title',p.title,
     'url',coalesce(p.reported_final_url,p.requested_url)) ORDER BY c2.id),'[]')
   FROM (SELECT DISTINCT lower(m[1])::uuid AS id FROM regexp_matches(body,
     '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})','g') m) c2
   LEFT JOIN sophia.source_provenance p ON p.project_id=s.project_id AND p.source_id=c2.id
   WHERE c2.id<>(plan.draft).source_id AND sophia.research_readable(s,c2.id)));
END $$;

-- POST /v1/runtime/research/render, step 2, in the same transaction: queue the HTML the API printed from that draft.
-- p_html is the API's (the model's request carries no markup); p_report is the manifest the API checked, with the
-- ids of the sources it printed (sourceIds). Everything step 1 checked is checked again, under the task's lock.
CREATE FUNCTION sophia.runtime_research_render(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb, p_html text, p_report jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true);
 c record; plan record; html sophia.source_objects; r sophia.render_jobs;
 v_lang text:=coalesce(nullif(p_request->>'language',''),'en');
BEGIN
 SELECT * INTO c FROM sophia.research_render_call(s,p_request);
 IF c.existing IS NOT NULL THEN RETURN sophia.research_render_view(s.project_id,c.existing); END IF;
 PERFORM 1 FROM sophia.jobs WHERE project_id=s.project_id AND id=s.job_id FOR UPDATE;
 SELECT * INTO plan FROM sophia.research_render_plan(s,p_request);
 IF p_html IS NULL OR octet_length(p_html) NOT BETWEEN 1 AND 4194304 OR jsonb_typeof(p_report)<>'object' THEN
  RAISE EXCEPTION 'A render package is the printed report and its manifest' USING ERRCODE='22023'; END IF;
 IF v_lang !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' OR length(v_lang)>35 THEN RAISE EXCEPTION 'Invalid language tag' USING ERRCODE='22023'; END IF;
 IF p_report->>'layout' IS DISTINCT FROM plan.layout THEN
  RAISE EXCEPTION 'The printed report is not in the % layout this render needs', plan.layout USING ERRCODE='40001'; END IF;
 html:=sophia.put_text_source(s.project_id,s.actor_id,'text/html; charset=utf-8',p_html);
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
 SELECT s.project_id,x,html.id FROM (SELECT (plan.draft).source_id AS x UNION
  SELECT (e #>> '{}')::uuid FROM jsonb_array_elements(coalesce(p_report->'sourceIds','[]')) e
   WHERE jsonb_typeof(e)='string' AND e #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND sophia.research_readable(s,(e #>> '{}')::uuid)) y ON CONFLICT DO NOTHING;
 r:=sophia.enqueue_render_job(s.project_id,s.job_id,v_lang,jsonb_build_array(jsonb_build_object('path','report.html','role','entry','sourceId',html.id)));
 UPDATE sophia.render_jobs SET draft_sha256=(plan.draft).sha256, repair=plan.repair, layout=plan.layout, call_key=c.key,
  report_manifest=p_report-'sourceIds' WHERE project_id=s.project_id AND job_id=r.job_id;
 RETURN sophia.research_render_view(s.project_id,r.job_id);
END $$;

-- POST /v1/runtime/research/render-result: a render of this task (the latest when none is named).
CREATE FUNCTION sophia.runtime_research_render_result(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false); job uuid;
BEGIN
 IF p_request ? 'renderJobId' THEN
  IF coalesce(p_request->>'renderJobId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION 'Render not found' USING ERRCODE='22023'; END IF;
  SELECT job_id INTO job FROM sophia.render_jobs WHERE project_id=s.project_id AND parent_job_id=s.job_id AND job_id=(p_request->>'renderJobId')::uuid;
 ELSE
  SELECT job_id INTO job FROM sophia.render_jobs WHERE project_id=s.project_id AND parent_job_id=s.job_id ORDER BY created_at DESC, job_id LIMIT 1;
 END IF;
 IF job IS NULL THEN RAISE EXCEPTION 'Render not found' USING ERRCODE='22023'; END IF;
 RETURN sophia.research_render_view(s.project_id,job);
END $$;

-- At publication: the PDF of a succeeded render of exactly the published draft becomes the version's rendition; else
-- the task records why the PDF was not produced. Only for a task admitted with a PDF.
CREATE FUNCTION sophia.research_attach_pdf(s sophia.research_scope, p_version uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE v sophia.artifact_versions; r sophia.render_jobs; j sophia.jobs; last sophia.jobs; why text;
BEGIN
 IF NOT sophia.research_outputs(s) ? 'pdf' THEN RETURN NULL; END IF;
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=s.project_id AND id=p_version;
 SELECT r2.* INTO r FROM sophia.render_jobs r2 JOIN sophia.jobs j2 ON j2.project_id=r2.project_id AND j2.id=r2.job_id
  WHERE r2.project_id=s.project_id AND r2.parent_job_id=s.job_id AND j2.state='succeeded' AND r2.draft_sha256=v.source_hash
  ORDER BY r2.created_at DESC LIMIT 1;
 IF FOUND THEN
  SELECT * INTO j FROM sophia.jobs WHERE project_id=s.project_id AND id=r.job_id;
  INSERT INTO sophia.artifact_renditions(project_id,artifact_version_id,format,source_id,page_count,job_id,limitations)
  VALUES(s.project_id,v.id,'pdf',j.result_source_id,nullif((r.receipt->'output'->>'pageCount')::integer,0),j.id,
   (SELECT coalesce(array_agg(u.l ORDER BY u.i),'{}') FROM (SELECT left('The PDF check '||(c->>'name')||' could not be confirmed',300) AS l, i
     FROM jsonb_array_elements(coalesce(r.receipt->'checks','[]')) WITH ORDINALITY x(c,i) WHERE c->>'outcome'='unknown' ORDER BY i LIMIT 8) u));
  UPDATE sophia.research_tasks SET pdf_state='produced', pdf_reason=NULL WHERE project_id=s.project_id AND job_id=s.job_id;
  RETURN jsonb_build_object('state','produced','sourceId',j.result_source_id,'renderJobId',j.id);
 END IF;
 SELECT j2.* INTO last FROM sophia.render_jobs r2 JOIN sophia.jobs j2 ON j2.project_id=r2.project_id AND j2.id=r2.job_id
  WHERE r2.project_id=s.project_id AND r2.parent_job_id=s.job_id ORDER BY r2.created_at DESC LIMIT 1;
 why:=CASE WHEN last.id IS NULL THEN 'The PDF was not rendered'
  WHEN last.state='succeeded' THEN 'The PDF was rendered from an earlier draft, not from this version'
  ELSE left('The PDF could not be produced ('||coalesce(last.reason,last.state)||')',300) END;
 UPDATE sophia.research_tasks SET pdf_state='not_produced', pdf_reason=why WHERE project_id=s.project_id AND job_id=s.job_id;
 RETURN jsonb_build_object('state','not_produced','reason',why);
END $$;
REVOKE ALL ON FUNCTION sophia.research_attach_pdf(sophia.research_scope,uuid) FROM PUBLIC;

-- runtime_research_submit (0027), replaced: the same, and a result waits for a render still in flight, then carries
-- the PDF (or why there is none). A replay returns the same.
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
     'renderJobId',(SELECT r.job_id FROM sophia.artifact_renditions r WHERE r.project_id=s.project_id AND r.artifact_version_id=v.id AND r.format='pdf'))) END));
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
  out:=sophia.research_publish(s,key,p_request->'result');
  IF out->>'outcome'='published' THEN
   out:=sophia.without_null_members(out||jsonb_build_object('pdf',sophia.research_attach_pdf(s,(out->>'versionId')::uuid)));
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

-- Whether a PDF can be rendered now: a registered render runner asked for work in the last ten minutes (an idle
-- supervisor asks every few seconds). start_research offers a PDF only then; otherwise the report is Markdown.
CREATE FUNCTION sophia.pdf_renderer_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.render_runners WHERE state='active' AND seen_at>now()-interval '10 minutes') $$;

REVOKE ALL ON FUNCTION sophia.runtime_research_render_input(bytea,text,text,jsonb),
 sophia.runtime_research_render(bytea,text,text,jsonb,text,jsonb), sophia.runtime_research_render_result(bytea,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION sophia.pdf_renderer_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.pdf_renderer_ready() TO sophia_api;
GRANT EXECUTE ON FUNCTION sophia.runtime_research_render_input(bytea,text,text,jsonb),
 sophia.runtime_research_render(bytea,text,text,jsonb,text,jsonb), sophia.runtime_research_render_result(bytea,text,text,jsonb) TO sophia_api;

COMMIT;
