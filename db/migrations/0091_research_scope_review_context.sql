-- FND-RESEARCH-SCOPE-REVIEW-04: research that says what it was asked, and reviews that know it. P's allocation 0091
-- (P-RESEARCH-0091-ALLOCATION-01); amendment A13 for the review context (no new contract id).
-- * admit_research_task (0025, never replaced since), replaced with its exact body but one literal: a NEW research goal's
--   outcome no longer says the report is drafted "from the web and the chosen inputs" whatever was asked (a request
--   limited to supplied inputs still got a web obligation, which a source review then held it to). It now says the
--   report is drafted from the sources its request authorizes. No permission is read from the question, no tool or
--   provider changes, and every existing goal, outcome, criterion, revision, amendment and receipt is kept as it is:
--   an amendment reuses its base's goal (the ELSE branch, unchanged), and a repeated key returns its first receipt.
-- * A NEW source-review proposal (propose_source_review, 0042) freezes manifest v2: v1's fields unchanged, plus
--   requestContext, the request each selected source was researched under (review_request_origins):
--   - the origin is exact: the selected source is a published version's Markdown, or a rendition (HTML page, PDF) of a
--     published version, and that Markdown is a research draft of one task (research_drafts -> its attempt's research
--     job). Never the goal's latest task, its root, the 120-character goal title or the newest research. A source no
--     research wrote is 'not_research', one that two tasks wrote 'ambiguous': both said, neither guessed;
--   - only the admitted question (the exact text of the task's question source, at most 2000 characters, its hash and
--     size checked) and its sourceConstraints (at most 500 characters) are copied, with their provenance (task, question
--     source and hash, the task's manifest source and hash). No manifest dump, input, URL or history. A question no longer
--     readable as a review reads a source (private, unreleased, withdrawn, or drawing on something withdrawn), or a
--     manifest no longer a released ready text, is 'unreadable'; a record that does not agree with itself, 'malformed';
--   - at most one request per task, naming every selected source it covers: at most three;
--   - its UTF-8 bytes count with the selected sources' against the review's 32 KiB. Past it the proposal is refused
--     whole: no text is cut, so a constraint at the end of a question is never dropped;
--   - a copied question is already a dependency of the source it came from: 0033's closure follows a research draft to
--     its task's manifest and from there to the question, so a question made private, unreleased or withdrawn (or one
--     drawing on something withdrawn) withdraws that report, its pages and every review of them by the rules already in
--     place, and a proposal over them is refused before anything is frozen. The copy is recorded as a dependency of the
--     review's manifest too (source_dependencies), and a v2 task context checks each copied question again.
-- * The task statement (source_review_statement) and the runtime task context (runtime_source_review_context) give a v2
--   review the same frozen block, read from its manifest only: statement as text after v1's, context as requestContext
--   (A13 SourceReviewRequestContext), which a v2 context sends only while every copied question is still readable. A v1
--   manifest gets exactly what it got before; any other manifest version is refused. The request is scope, never a source
--   to cite, a tool or a provider: findings still cite only the selected sources, read through their pages.
-- * The reviewer's own instruction (sophia-source-review-instruction-v1) is unchanged, so resumed v1 reviews keep it: what
--   the request is and is not is said in the v2 statement. 0001-0090 are not edited.
BEGIN;

-- --- research admission ----------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sophia.admit_research_task(p_project uuid, p_key text, p_exchange text, p_request jsonb, p_role text, p_route text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); pr sophia.projects; gr sophia.research_grants; prior sophia.commands; semantic jsonb;
 rt sophia.runtime_instances; question text:=btrim(p_request->>'question'); outputs jsonb; inputs uuid[]; urls text[];
 prefs jsonb; assumptions jsonb; amends uuid; base sophia.research_tasks; base_job sophia.jobs; g sophia.goals;
 running sophia.jobs; q sophia.source_objects; manifest jsonb; ctx sophia.source_objects; al sophia.research_allowances;
 goal uuid; att uuid:=gen_random_uuid(); bnd uuid:=gen_random_uuid(); cmd uuid:=gen_random_uuid(); job uuid:=gen_random_uuid();
 root uuid; cursor_value bigint; receipt_value jsonb; bad uuid; artifact jsonb;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF p_exchange IS NOT NULL AND p_exchange !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' THEN RAISE EXCEPTION 'Invalid exchange' USING ERRCODE='22023'; END IF;
 IF p_role IS NULL OR p_role !~ '^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$' OR p_route IS NULL OR p_route !~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$' THEN
  RAISE EXCEPTION 'Invalid research specialist' USING ERRCODE='22023'; END IF;
 IF question IS NULL OR length(question) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid research question' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_request->'outputs')<>'array' OR NOT (p_request->'outputs' ? 'markdown') OR jsonb_array_length(p_request->'outputs')>2
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'outputs') o WHERE o NOT IN ('"markdown"','"pdf"'))
  OR (SELECT count(DISTINCT o) FROM jsonb_array_elements(p_request->'outputs') o)<>jsonb_array_length(p_request->'outputs') THEN
  RAISE EXCEPTION 'Invalid research outputs' USING ERRCODE='22023'; END IF;
 SELECT jsonb_agg(o ORDER BY CASE o WHEN '"markdown"' THEN 0 ELSE 1 END) INTO outputs FROM jsonb_array_elements(p_request->'outputs') o;
 SELECT coalesce(array_agg(v::uuid ORDER BY n),'{}') INTO inputs
  FROM jsonb_array_elements_text(coalesce(p_request->'inputSourceIds','[]')) WITH ORDINALITY AS e(v,n);
 IF cardinality(inputs)>8 OR cardinality(inputs)<>(SELECT count(DISTINCT x) FROM unnest(inputs) x) THEN
  RAISE EXCEPTION 'At most 8 distinct inputs' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(v ORDER BY n),'{}') INTO urls FROM jsonb_array_elements_text(coalesce(p_request->'urls','[]')) WITH ORDINALITY AS e(v,n);
 IF cardinality(urls)>8 OR EXISTS(SELECT 1 FROM unnest(urls) u WHERE length(u)>2048 OR u !~* '^https?://[^\s/?#]+[^\s]*$') THEN
  RAISE EXCEPTION 'At most 8 web addresses, each an http or https URL' USING ERRCODE='22023'; END IF;
 prefs:=jsonb_strip_nulls(jsonb_build_object('depth',p_request->'preferences'->'depth','sourceConstraints',p_request->'preferences'->'sourceConstraints'));
 IF (prefs ? 'depth' AND prefs->>'depth' NOT IN ('brief','standard','deep'))
  OR (prefs ? 'sourceConstraints' AND (jsonb_typeof(prefs->'sourceConstraints')<>'string' OR length(prefs->>'sourceConstraints') NOT BETWEEN 1 AND 500)) THEN
  RAISE EXCEPTION 'Invalid research preferences' USING ERRCODE='22023'; END IF;
 assumptions:=coalesce(p_request->'assumptions','[]');
 IF jsonb_typeof(assumptions)<>'array' OR jsonb_array_length(assumptions)>8 OR EXISTS(SELECT 1 FROM jsonb_array_elements(assumptions) x
   WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}') NOT BETWEEN 1 AND 200) THEN
  RAISE EXCEPTION 'Invalid research assumptions' USING ERRCODE='22023'; END IF;
 amends:=nullif(p_request->>'amendsTaskId','')::uuid;
 IF amends IS NOT NULL AND coalesce((p_request->>'newRequest')::boolean,false) THEN
  RAISE EXCEPTION 'An amendment is not a new request' USING ERRCODE='22023'; END IF;

 -- Lock order: project first; authority is checked again under the lock.
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('kind','research','question',encode(sha256(convert_to(question,'UTF8')),'hex'),'outputs',outputs,
  'inputSourceIds',to_jsonb(inputs),'urls',to_jsonb(urls),'preferences',prefs,'assumptions',assumptions,'amendsTaskId',amends,
  'newRequest',coalesce((p_request->>'newRequest')::boolean,false),'role',p_role,'route',p_route,'exchangeId',p_exchange);
 SELECT * INTO prior FROM sophia.commands WHERE project_id=p_project AND actor_id=a AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 SELECT * INTO gr FROM sophia.research_grants WHERE project_id=p_project FOR SHARE;
 IF NOT FOUND OR gr.state<>'enabled' THEN RAISE EXCEPTION 'Research gate closed' USING ERRCODE='55000'; END IF;

 -- The same person in the same exchange already has research under way: that task, unless this one is declared new.
 IF amends IS NULL AND NOT coalesce((p_request->>'newRequest')::boolean,false) AND p_exchange IS NOT NULL THEN
  SELECT j.* INTO running FROM sophia.research_tasks t JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
   WHERE t.project_id=p_project AND t.actor_id=a AND t.exchange_id=p_exchange AND j.state IN ('pending','running','outcome_unknown')
   ORDER BY t.created_at DESC LIMIT 1;
  IF FOUND THEN
   RETURN jsonb_build_object('existingTaskId',running.id,'receipt',(SELECT receipt FROM sophia.commands WHERE project_id=p_project AND id=running.command_id));
  END IF;
 END IF;

 SELECT x INTO bad FROM unnest(inputs) x WHERE NOT EXISTS(SELECT 1 FROM sophia.source_objects s
  WHERE s.project_id=p_project AND s.id=x AND s.scope='project' AND s.eligible AND s.state='ready') LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Source not released and eligible for project work' USING ERRCODE='42501'; END IF;

 IF amends IS NOT NULL THEN
  SELECT * INTO base FROM sophia.research_tasks WHERE project_id=p_project AND job_id=amends;
  IF NOT FOUND THEN RAISE EXCEPTION 'Research task not found' USING ERRCODE='22023'; END IF;
  SELECT * INTO base_job FROM sophia.jobs WHERE project_id=p_project AND id=amends;
  IF base_job.state IN ('pending','running','outcome_unknown') THEN
   RAISE EXCEPTION 'The research task is still under way; steer it instead' USING ERRCODE='40001'; END IF;
  -- An amendment continues the lineage it amends: the latest task of it, so two amendments of one task cannot fork it.
  IF EXISTS(SELECT 1 FROM sophia.research_tasks t WHERE t.project_id=p_project AND t.root_job_id=base.root_job_id AND t.created_at>base.created_at) THEN
   RAISE EXCEPTION 'Stale research task: a later task continues this lineage' USING ERRCODE='40001'; END IF;
  SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts wa ON wa.project_id=g2.project_id AND wa.goal_id=g2.id
   WHERE wa.project_id=p_project AND wa.id=base_job.attempt_id FOR UPDATE OF g2;
  IF g.status IN ('holding','stopping') THEN RAISE EXCEPTION 'The research goal is settling a Hold or Stop' USING ERRCODE='40001'; END IF;
  goal:=g.id; root:=base.root_job_id;
  SELECT * INTO al FROM sophia.research_allowances WHERE project_id=p_project AND id=base.allowance_id;
  IF base_job.artifact_id IS NOT NULL THEN
   SELECT jsonb_build_object('artifactId',ar.id,'versionId',v.id,'sourceId',v.source_id) INTO artifact
    FROM sophia.artifacts ar JOIN sophia.artifact_versions v ON v.project_id=ar.project_id AND v.id=ar.stable_version_id
    WHERE ar.project_id=p_project AND ar.id=base_job.artifact_id;
  END IF;
 END IF;

 SELECT * INTO rt FROM sophia.runtime_instances r WHERE r.project_id=p_project AND r.state='active'
   AND r.roles @> jsonb_build_array(jsonb_build_object('id',p_role,'route',p_route)) AND sophia.runtime_unavailable(r) IS NULL
  ORDER BY r.seen_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'No research runtime is ready for this project' USING ERRCODE='55000'; END IF;

 q:=sophia.put_text_source(p_project,a,'text/plain; charset=utf-8',question);
 manifest:=jsonb_build_object('schema','sophia.research-manifest.v1','projectId',p_project,'taskId',job,'role',p_role,'route',p_route,
  'question',question,'questionSourceId',q.id,'outputs',outputs,'preferences',prefs,'assumptions',assumptions,
  'inputs',(SELECT coalesce(jsonb_agg(jsonb_build_object('ref','input:'||s.id,'sourceId',s.id,'sha256',s.sha256,'mime',s.mime,
     'byteLength',s.byte_length) ORDER BY x.n),'[]')
   FROM unnest(inputs) WITH ORDINALITY AS x(sid,n) JOIN sophia.source_objects s ON s.project_id=p_project AND s.id=x.sid),
  'urls',(SELECT coalesce(jsonb_agg(jsonb_build_object('ref','input:'||q.id||'#'||n,'url',u) ORDER BY n),'[]') FROM unnest(urls) WITH ORDINALITY AS x(u,n)),
  'lineage',jsonb_build_object('rootTaskId',coalesce(root,job),'amendsTaskId',amends),'base',artifact);
 ctx:=sophia.put_text_source(p_project,a,'application/json',jsonb_pretty(manifest));
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(p_project,q.id,ctx.id);
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) SELECT p_project,x,ctx.id FROM unnest(inputs) x ON CONFLICT DO NOTHING;
 INSERT INTO sophia.context_manifests(project_id,body_source_id,audience_revision,eligibility_revision,state)
 VALUES(p_project,ctx.id,pr.audience_revision,pr.eligibility_revision,'eligible');
 IF goal IS NULL THEN
  goal:=gen_random_uuid();
  INSERT INTO sophia.goals(project_id,id,title,outcome,criteria,mission_revision,status)
  VALUES(p_project,goal,left('Research: '||regexp_replace(question,'\s+',' ','g'),120),
   'A sourced research report in the requested formats, drafted by the dsh runtime from the sources its request authorizes',
   jsonb_build_array(jsonb_build_object('id','report-sourced','description',
    'Every claim cites a retrieved or admitted source; what the sources do not settle is stated','required',true,'verification','human_review')),
   pr.mission_revision,'ready') RETURNING * INTO g;
 ELSE
  UPDATE sophia.goals SET revision=revision+1, state_revision=state_revision+1, status='ready'
   WHERE project_id=p_project AND id=goal RETURNING * INTO g;
 END IF;
 INSERT INTO sophia.work_attempts(project_id,id,goal_id,goal_revision,authority_epoch,context_source_id,state)
 VALUES(p_project,att,goal,g.revision,g.authority_epoch,ctx.id,'admitted');
 INSERT INTO sophia.execution_bindings(project_id,id,attempt_id,resource_id,native_session_id,runtime_unit_id,continuation_owner,state)
 VALUES(p_project,bnd,att,rt.resource_id,'sophia-'||att,rt.runtime_unit_id,'sophia_episode','created');
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,body_source_id,state)
 VALUES(p_project,cmd,a,goal,g.revision,g.authority_epoch,'native_task',p_key,semantic,q.id,'admitted');
 INSERT INTO sophia.jobs(project_id,id,kind,input_source_id,command_id,attempt_id,state,artifact_id)
 VALUES(p_project,job,'research',ctx.id,cmd,att,'pending',base_job.artifact_id);
 IF al.id IS NULL THEN
  al:=sophia.open_research_allowance(p_project,job,round(gr.task_cap_usd*0.1,6));
 END IF;
 INSERT INTO sophia.research_tasks(project_id,job_id,root_job_id,amends_job_id,allowance_id,actor_id,exchange_id,role,route,question_source_id,urls)
 VALUES(p_project,job,coalesce(root,job),amends,al.id,a,p_exchange,p_role,p_route,q.id,urls);
 INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
 VALUES(p_project,cmd,'native.create','binding/'||bnd,bnd,goal,g.authority_epoch);
 cursor_value:=sophia.emit_service_event(p_project,'native_task.admitted','job',job,1,'native_task.research',
  jsonb_build_array(goal,cmd,ctx.id));
 receipt_value:=jsonb_build_object('taskId',job,'commandId',cmd,'goalId',goal,'attemptId',att,'projectId',p_project,'kind','research',
  'stage','admitted','cursor',cursor_value::text,'goalRevision',g.revision,'authorityEpoch',g.authority_epoch,'contextSourceId',ctx.id);
 UPDATE sophia.commands SET receipt=receipt_value WHERE project_id=p_project AND id=cmd;
 RETURN receipt_value;
END $$;

-- --- the request a review is given ------------------------------------------------------------------------------

-- The request each selected source was researched under, for a new proposal (above). Internal: no login calls it.
CREATE FUNCTION sophia.review_request_origins(p_project uuid, p_sources uuid[]) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE requests jsonb:='[]'; unavailable jsonb:='[]'; ids uuid[]:='{}'; bytes bigint:=0; s uuid; n bigint; tasks uuid[];
 t sophia.research_tasks; j sophia.jobs; q sophia.source_objects; qt text; ctx sophia.source_objects; ct text; m jsonb;
 cons jsonb; reason text; at integer;
BEGIN
 FOR s, n IN SELECT x, i FROM unnest(p_sources) WITH ORDINALITY AS u(x,i) LOOP
  -- The research tasks that wrote the Markdown carrying s: s itself when it is a published version's source, or the
  -- version's source when s is one of its renditions (its HTML page, its PDF). A draft is one task's (an amendment
  -- seeds its draft with a copy, never its base's own source: 0037), so one published Markdown names one task.
  SELECT array_agg(DISTINCT rj.id) INTO tasks
   FROM (SELECT v.source_id FROM sophia.artifact_versions v
          WHERE v.project_id=p_project AND v.source_id=s AND v.state IN ('stable','superseded')
         UNION SELECT v.source_id FROM sophia.artifact_renditions r
          JOIN sophia.artifact_versions v ON v.project_id=r.project_id AND v.id=r.artifact_version_id
          WHERE r.project_id=p_project AND r.source_id=s AND v.state IN ('stable','superseded')) md
   JOIN sophia.research_drafts d ON d.project_id=p_project AND d.source_id=md.source_id
   JOIN sophia.jobs rj ON rj.project_id=p_project AND rj.attempt_id=d.attempt_id AND rj.kind='research' AND rj.parent_job_id IS NULL;
  reason:=CASE WHEN tasks IS NULL THEN 'not_research' WHEN cardinality(tasks)>1 THEN 'ambiguous' END;
  IF reason IS NULL THEN
   SELECT r.ord-1 INTO at FROM jsonb_array_elements(requests) WITH ORDINALITY AS r(x,ord) WHERE r.x->>'taskId'=tasks[1]::text;
   IF at IS NOT NULL THEN
    requests:=jsonb_set(requests,ARRAY[at::text,'sourceRefs'],(requests->at->'sourceRefs')||to_jsonb('S'||n));
    CONTINUE;
   END IF;
   SELECT * INTO t FROM sophia.research_tasks WHERE project_id=p_project AND job_id=tasks[1];
   SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND id=tasks[1];
   SELECT * INTO q FROM sophia.source_objects WHERE project_id=p_project AND id=t.question_source_id;
   SELECT * INTO ctx FROM sophia.source_objects WHERE project_id=p_project AND id=j.input_source_id;
   SELECT body INTO qt FROM sophia.source_texts WHERE project_id=p_project AND source_id=q.id;
   SELECT body INTO ct FROM sophia.source_texts WHERE project_id=p_project AND source_id=ctx.id;
   -- Read as a review reads a source: the question released, ready and drawing on nothing withdrawn; its task's
   -- manifest (the service's own record of the request) a released, ready project text. Never a private one.
   IF q.id IS NULL OR NOT sophia.review_source_readable(p_project,q.id) OR ct IS NULL
    OR NOT (ctx.scope='project' AND ctx.eligible AND ctx.state='ready') THEN
    reason:='unreadable';
   ELSIF encode(sha256(convert_to(qt,'UTF8')),'hex')<>q.sha256 OR octet_length(qt)<>q.byte_length
    OR char_length(qt) NOT BETWEEN 1 AND 2000 OR encode(sha256(convert_to(ct,'UTF8')),'hex')<>ctx.sha256 THEN
    reason:='malformed';
   ELSE
    BEGIN m:=ct::jsonb; EXCEPTION WHEN others THEN m:=NULL; END;
    cons:=m->'preferences'->'sourceConstraints';
    IF m IS NULL OR m->>'taskId' IS DISTINCT FROM j.id::text OR m->>'question' IS DISTINCT FROM qt
     OR (cons IS NOT NULL AND (jsonb_typeof(cons)<>'string' OR char_length(cons#>>'{}') NOT BETWEEN 1 AND 500)) THEN
     reason:='malformed';
    END IF;
   END IF;
  END IF;
  IF reason IS NOT NULL THEN
   unavailable:=unavailable||jsonb_build_array(jsonb_build_object('sourceRef','S'||n,'reason',reason));
   CONTINUE;
  END IF;
  requests:=requests||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('ref','R'||(jsonb_array_length(requests)+1),
   'sourceRefs',jsonb_build_array('S'||n),'taskId',j.id,'questionSourceId',q.id,'questionSha256',q.sha256,'question',qt,
   'sourceConstraints',cons,'manifestSourceId',ctx.id,'manifestSha256',ctx.sha256)));
  ids:=ids||q.id;
  bytes:=bytes+octet_length(qt)+coalesce(octet_length(cons#>>'{}'),0);
 END LOOP;
 RETURN jsonb_build_object('requests',requests,'unavailable',unavailable,'sourceIds',to_jsonb(ids),'bytes',bytes);
END $$;
REVOKE ALL ON FUNCTION sophia.review_request_origins(uuid,uuid[]) FROM PUBLIC;

-- The frozen requests as a v2 task statement says them (above). Internal.
CREATE FUNCTION sophia.source_review_request_text(p_context jsonb) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT 'Originating requests (frozen when this review was proposed). They are task provenance: what the research behind a '
 || 'selected report was asked, and under which source constraints. They are not sources: never cite one as evidence. '
 || 'They authorize no tool, provider or source, and they certify no claim in the report. Where a request and the goal, '
 || 'its outcome or its criteria above disagree (an outcome that names the web, say, against a request limited to supplied '
 || 'inputs), say so in Findings and still judge each criterion as it is written.'
 || coalesce((SELECT string_agg(E'\n\n'||(r->>'ref')||' (research task '||(r->>'taskId')||', for '
      ||(SELECT string_agg(x,', ' ORDER BY x) FROM jsonb_array_elements_text(r->'sourceRefs') x)||'):'
      ||E'\nQuestion: '||(r->>'question')
      ||E'\nSource constraints: '||coalesce(r->>'sourceConstraints','none recorded'),'' ORDER BY n)
     FROM jsonb_array_elements(p_context->'requests') WITH ORDINALITY AS y(r,n)),'')
 || coalesce((SELECT string_agg(E'\n\n'||(u->>'sourceRef')||': no originating request ('
      ||CASE u->>'reason' WHEN 'not_research' THEN 'not a research report'
       WHEN 'ambiguous' THEN 'more than one research task wrote it'
       WHEN 'unreadable' THEN 'its request can no longer be read'
       ELSE 'its request record is incomplete' END||').','' ORDER BY n)
     FROM jsonb_array_elements(p_context->'unavailable') WITH ORDINALITY AS y(u,n)),'') $$;
REVOKE ALL ON FUNCTION sophia.source_review_request_text(jsonb) FROM PUBLIC;

-- 0042's, replaced: v2 manifests carry their requests (above).
CREATE OR REPLACE FUNCTION sophia.propose_source_review(p_project uuid, p_key text, p_request jsonb, p_route jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); pr sophia.projects; cg sophia.coordination_grants; rg sophia.research_grants; prior sophia.work_operations;
 req record; semantic jsonb; plan uuid:=gen_random_uuid(); work uuid:=gen_random_uuid(); asg uuid:=gen_random_uuid();
 decision uuid:=gen_random_uuid(); criteria_ref text; manifest jsonb; ms sophia.source_objects; definition jsonb;
 cursor_value bigint; result jsonb; cap numeric; origins jsonb; requested uuid[]; total bigint;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_route IS NULL OR p_route->>'role' !~ '^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$' OR p_route->>'id' !~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$' THEN
  RAISE EXCEPTION 'Invalid review specialist' USING ERRCODE='22023'; END IF;
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('kind','source_review','goalId',p_request->'goalId','goalRevision',p_request->'goalRevision',
  'criterionIds',p_request->'criterionIds','sourceIds',p_request->'sourceIds','allowanceUsd',p_request->'allowanceUsd',
  'purpose',encode(sha256(convert_to(coalesce(p_request->>'purpose',''),'UTF8')),'hex'),'role',p_route->>'role','route',p_route->>'id');
 prior:=sophia.work_prior(p_project,p_key,'propose_source_review',semantic);
 IF prior.project_id IS NOT NULL THEN RETURN prior.result; END IF;
 SELECT * INTO cg FROM sophia.coordination_grants WHERE project_id=p_project;
 IF NOT FOUND OR cg.state<>'enabled' THEN RAISE EXCEPTION 'Source review is not enabled for this project' USING ERRCODE='55000'; END IF;
 SELECT * INTO rg FROM sophia.research_grants WHERE project_id=p_project;
 IF NOT FOUND OR rg.state<>'enabled' THEN RAISE EXCEPTION 'Source review is not enabled for this project: it has no spend authority' USING ERRCODE='55000'; END IF;
 SELECT * INTO req FROM sophia.source_review_request(p_project,p_request);
 -- 0091: the request each selected source was researched under, frozen with the proposal (review_request_origins). Its
 -- text counts against the review's 32 KiB with the sources' own; past it, nothing is proposed and nothing is cut.
 origins:=sophia.review_request_origins(p_project,req.sources);
 SELECT coalesce(array_agg(x::uuid),'{}') INTO requested FROM jsonb_array_elements_text(origins->'sourceIds') x;
 SELECT coalesce(sum(octet_length(t.body)),0) INTO total FROM sophia.source_texts t WHERE t.project_id=p_project AND t.source_id=ANY(req.sources);
 IF total+(origins->>'bytes')::bigint>(sophia.source_review_limits()->>'maxInputBytes')::bigint THEN
  RAISE EXCEPTION 'The selected sources and the requests they were researched under hold % bytes of text; a review reads at most 32 KiB',
   total+(origins->>'bytes')::bigint USING ERRCODE='22023'; END IF;
 cap:=least(cg.review_cap_usd,rg.task_cap_usd);
 IF req.allowance>cap THEN RAISE EXCEPTION 'The allowance is above this project''s cap of % USD for one review', cap USING ERRCODE='22023'; END IF;
 criteria_ref:='criteria:'||(req.g).id||'@'||(req.g).revision||':'||left(encode(sha256(convert_to(req.criteria::text,'UTF8')),'hex'),16);
 manifest:=jsonb_build_object('schema','sophia.source-review-manifest.v2','projectId',p_project,'planId',plan,'workId',work,
  'recipe',p_route->>'role','role',p_route->>'role','route',p_route,'promptVersion','sophia-source-review-instruction-v1',
  'goal',jsonb_build_object('id',(req.g).id,'revision',(req.g).revision,'title',(req.g).title,'outcome',(req.g).outcome,
   'criteriaRef',criteria_ref,'criteria',req.criteria),
  'missionRevision',pr.mission_revision,'purpose',req.purpose,
  'sources',(SELECT jsonb_agg(jsonb_build_object('ref','S'||x.n,'sourceId',s.id,'sha256',s.sha256,'mime',s.mime,'byteLength',s.byte_length) ORDER BY x.n)
   FROM unnest(req.sources) WITH ORDINALITY AS x(sid,n) JOIN sophia.source_objects s ON s.project_id=p_project AND s.id=x.sid),
  'limits',sophia.source_review_limits(),'allowanceUsd',req.allowance,
  'requestContext',jsonb_build_object('version','sophia.source-review-manifest.v2','requests',origins->'requests','unavailable',origins->'unavailable'));
 ms:=sophia.put_text_source(p_project,a,'application/json',jsonb_pretty(manifest));
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) SELECT p_project,x,ms.id FROM unnest(req.sources) x;
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) SELECT p_project,x,ms.id FROM unnest(requested) x
  ON CONFLICT DO NOTHING;
 definition:=jsonb_build_object('schema_version','sophia.work.plan.v2','plan_id',plan,'project_id',p_project,'goal_id',(req.g).id,
  'goal_revision',(req.g).revision,'criteria_ref',criteria_ref,'revision',1,'mission_revision',pr.mission_revision,
  'source_manifest_ref',ms.id,
  'assumptions',jsonb_build_array(jsonb_build_object('id','selected-sources-only','text',
   'The selected sources are the evidence this review may use; nothing else is read.','status','unresolved','evidence_refs','[]'::jsonb)),
  'items',jsonb_build_array(jsonb_build_object('id',work,
   'purpose',coalesce(req.purpose,'Review the selected sources against the goal''s criteria'),
   'deliverable_ref','deliverable:source-review-report-v1','criteria_ref',criteria_ref,'parent_id',NULL,'blocked_by','[]'::jsonb,
   'assignee_kind','assignment','assignee_id',asg,'source_scope_ref',ms.id,'review_policy_ref','policy:source-review-structural-v1',
   'recipe_ref',p_route->>'role','activation',jsonb_build_object('kind','immediate','producer_work_id',NULL))));
 INSERT INTO sophia.work_plans(project_id,id,goal_id,goal_revision,criteria_ref,mission_revision,recipe,route,work_id,assignment_id,
  source_ids,manifest_source_id,definition,allowance_usd,proposed_by,decision_id)
 VALUES(p_project,plan,(req.g).id,(req.g).revision,criteria_ref,pr.mission_revision,p_route->>'role',p_route->>'id',work,asg,
  req.sources,ms.id,definition,req.allowance,a,decision);
 INSERT INTO sophia.work_decisions(project_id,id,kind,plan_id,plan_revision,work_id,question,decider_id,choices,expires_at)
 VALUES(p_project,decision,'plan_admission',plan,1,work,
  left('Start this source review? It reads '||cardinality(req.sources)||CASE WHEN cardinality(req.sources)=1 THEN ' source' ELSE ' sources' END
   ||' against '||jsonb_array_length(req.criteria)||CASE WHEN jsonb_array_length(req.criteria)=1 THEN ' criterion' ELSE ' criteria' END
   ||' with an allowance of '||req.allowance||' USD.',500),
  a,jsonb_build_array(jsonb_build_object('key','accept','label','Start the review'),jsonb_build_object('key','decline','label','Not now')),
  now()+interval '24 hours');
 cursor_value:=sophia.emit_service_event(p_project,'plan.proposed','work_plan',plan,1,'plan.proposed',jsonb_build_array((req.g).id,decision,ms.id));
 result:=jsonb_build_object('projectId',p_project,'planId',plan,'planRevision',1,'decisionId',decision,'decisionRevision',1,
  'workId',work,'goalId',(req.g).id,'goalRevision',(req.g).revision,'criteriaRef',criteria_ref,'manifestSourceId',ms.id,
  'allowanceUsd',req.allowance,'limits',sophia.source_review_limits(),'route',p_route,'cursor',cursor_value::text);
 INSERT INTO sophia.work_operations(project_id,actor_id,idempotency_key,operation,semantic_request,work_id,outcome,result)
 VALUES(p_project,a,p_key,'propose_source_review',semantic,work,'recorded',result);
 RETURN result;
END $$;

-- 0042's, replaced: a v1 manifest's statement as it was; a v2 one's with its requests; any other refused.
CREATE OR REPLACE FUNCTION sophia.source_review_statement(p_manifest jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
DECLARE base text;
BEGIN
 IF p_manifest->>'schema' IS DISTINCT FROM 'sophia.source-review-manifest.v1' AND p_manifest->>'schema' IS DISTINCT FROM 'sophia.source-review-manifest.v2' THEN
  RAISE EXCEPTION 'Unsupported source-review manifest' USING ERRCODE='22023'; END IF;
 -- 0042's statement, unchanged: a v1 manifest's task reads exactly as it did.
 base:='Source review task. Review the sources below against the goal and its criteria, and only those sources.'||E'\n'
 || 'Read each source with read_review_source (by its sourceId; long sources come in pages). Publish the review with '
 || 'submit_source_review, or name precisely what is missing with report_review_blocker. A final chat message is not '
 || 'publication.'||E'\n\n'
 || 'Goal: '||(p_manifest->'goal'->>'title')||E'\n'
 || 'Outcome: '||(p_manifest->'goal'->>'outcome')||E'\n'
 || 'Criteria ('||(p_manifest->'goal'->>'criteriaRef')||'):'||E'\n'
 || (SELECT string_agg('- '||(c->>'id')||': '||(c->>'description'),E'\n' ORDER BY n)
     FROM jsonb_array_elements(p_manifest->'goal'->'criteria') WITH ORDINALITY AS x(c,n))||E'\n\n'
 || 'Sources:'||E'\n'
 || (SELECT string_agg('- '||(s->>'ref')||' sourceId '||(s->>'sourceId')||' ('||(s->>'mime')||', '||(s->>'byteLength')||' bytes, sha256 '
      ||(s->>'sha256')||')',E'\n' ORDER BY n)
     FROM jsonb_array_elements(p_manifest->'sources') WITH ORDINALITY AS x(s,n))||E'\n\n'
 || 'Limits: at most '||(p_manifest->'limits'->>'maxModelRequests')||' model requests in all and '
 || (p_manifest->'limits'->>'maxReportBytes')||' bytes of report text. No web, shell or connector access.';
 IF p_manifest->>'schema'='sophia.source-review-manifest.v1' THEN RETURN base; END IF;
 RETURN base||E'\n\n'||sophia.source_review_request_text(p_manifest->'requestContext');
END $$;

-- 0042's, replaced: as statement above, for the runtime's task context; a page read is unchanged.
CREATE OR REPLACE FUNCTION sophia.runtime_source_review_context(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.review_scope:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true); manifest jsonb;
 al sophia.research_allowances; body text; src uuid; off integer; size integer; total integer; calls integer;
 receipt text:=replace(gen_random_uuid()::text,'-',''); page text; reply jsonb;
BEGIN
 SELECT t.body::jsonb INTO manifest FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=s.manifest_source_id;
 IF manifest->>'schema' IS DISTINCT FROM 'sophia.source-review-manifest.v1' AND manifest->>'schema' IS DISTINCT FROM 'sophia.source-review-manifest.v2' THEN
  RAISE EXCEPTION 'Unsupported source-review manifest' USING ERRCODE='22023'; END IF;
 IF p_request ? 'sourceId' THEN
  IF coalesce(p_request->>'sourceId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION 'Review source not found' USING ERRCODE='22023'; END IF;
  src:=(p_request->>'sourceId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(manifest->'sources') x WHERE x->>'sourceId'=src::text) THEN
   RAISE EXCEPTION 'Review source not found' USING ERRCODE='22023'; END IF;
  IF NOT sophia.review_source_readable(s.project_id,src) THEN
   RAISE EXCEPTION 'Source not released and eligible for project work: this source was withdrawn' USING ERRCODE='42501'; END IF;
  SELECT t.body INTO body FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=src;
  off:=coalesce((p_request->>'offset')::integer,0); size:=least(coalesce((p_request->>'limit')::integer,16000),16000);
  IF off<0 OR size<1 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
  total:=char_length(body); off:=least(off,total);
  page:=substr(body,off+1,size);
  INSERT INTO sophia.work_review_receipts(project_id,attempt_id,source_id,receipt_sha256,page_offset,page_chars,total_chars,page_sha256)
   VALUES(s.project_id,s.attempt_id,src,sha256(convert_to(receipt,'UTF8')),off,char_length(page),total,sha256(convert_to(page,'UTF8')));
  RETURN jsonb_build_object('sourceId',src,'offset',off,'nextOffset',CASE WHEN off+size<total THEN to_jsonb(off+size) ELSE 'null'::jsonb END,
   'totalChars',total,'truncated',off+size<total,'text',page,'receipt',receipt);
 END IF;
 SELECT * INTO al FROM sophia.research_allowances WHERE project_id=s.project_id AND id=s.allowance_id;
 SELECT count(*) INTO calls FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id
  AND kind='model' AND state<>'released';
 reply:=jsonb_build_object('workId',s.work_id,'goal',manifest->'goal','purpose',manifest->'purpose',
  'sources',(SELECT jsonb_agg(x||jsonb_build_object('readable',sophia.review_source_readable(s.project_id,(x->>'sourceId')::uuid)) ORDER BY n)
   FROM jsonb_array_elements(manifest->'sources') WITH ORDINALITY AS y(x,n)),
  'limits',manifest->'limits',
  'allowance',jsonb_build_object('capUsd',al.cap_usd,'committedUsd',al.reserved_usd+al.spent_usd+al.uncertain_usd,
   'modelCallsLeft',greatest((manifest->'limits'->>'maxModelRequests')::integer-calls,0)));
 IF manifest->>'schema'='sophia.source-review-manifest.v1' THEN RETURN reply; END IF;
 -- A v2 task also carries the requests frozen with it, while each is still readable: never re-derived, never enriched.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(manifest->'requestContext'->'requests') r
   WHERE NOT sophia.review_source_readable(s.project_id,(r->>'questionSourceId')::uuid)) THEN
  RAISE EXCEPTION 'Source not released and eligible for project work: a request this review was given was withdrawn' USING ERRCODE='42501'; END IF;
 RETURN reply||jsonb_build_object('requestContext',manifest->'requestContext');
END $$;

COMMIT;
