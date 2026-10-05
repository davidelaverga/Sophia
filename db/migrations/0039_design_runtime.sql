-- SDD-01 (binding map §4, §7): the runtime design and review operations, and the renderer's capture jobs.
-- * Every operation authenticates like research's (0025): the runtime's lease, then a binding this runtime owns for
--   the attempt and native session, whose job is a design (the designer's operations) or a design review (the
--   reviewer's). Every one but settle and the replays is fenced: the goal is active and the session's last command is
--   a create, resume, steer or input under the goal's current authority epoch, so Hold and Stop apply at once.
-- * The designer writes a source revision in two steps inside one API transaction: step 1 gives the API the base
--   revision and the frozen content package; the API checks the files with @sophia/design (parser profile, coverage,
--   scope, diff) and step 2 stores what it accepted. Nothing the profile refuses is stored. The package hash is
--   recomputed here from the files themselves.
-- * A render is two steps the same way: the API compiles the revision (@sophia/design compile, one self-contained
--   page with its CSP) and step 2 queues it as a capture job at the task's targets. One render runs at a time, at
--   most sixteen per task.
-- * The hard gate (design_gate_failures) reads the capture receipt: the render succeeded in the sandbox with every
--   request contained and the source unchanged; at every target of the task there is no horizontal overflow, every
--   block is visible (not hidden, cut, clipped, covered or off the page), no block is below its contrast floor, every
--   section was captured, and every block of the frozen package was measured. An unknown contrast is not a failure
--   here; it is said on the published HTML.
-- * The reviewer reads the original request, the frozen package, its criteria and the exact candidate with its
--   render, never the author's summary or work record. The captures it inspected are recorded as the service handed
--   them over; a pass needs every target's overview and every section at one target at least.
-- * Model calls of either role reserve against the research lineage's allowance (0024) and settle from reported
--   usage. A reservation key is the native session and the call id, as research's.
-- 0001–0038 are not edited; renderer_claim(bytea), render_job_view and renderer_settle are replaced with the same
-- signatures.
BEGIN;

-- A uuid from text, or null when the text is not one.
CREATE FUNCTION sophia.uuid_or_null(p text) RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p::uuid END $$;
REVOKE ALL ON FUNCTION sophia.uuid_or_null(text) FROM PUBLIC;

-- --- readiness ------------------------------------------------------------------------------------------------------

-- Whether a capture can run now: a render runner that renders png asked for work in the last ten minutes.
CREATE FUNCTION sophia.capture_renderer_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.render_runners WHERE state='active' AND seen_at>now()-interval '10 minutes' AND 'png'=ANY(formats)) $$;

-- The ready runtime of a project that advertises a role on its route, the most recently seen; null when none.
CREATE FUNCTION sophia.role_runtime(p_project uuid, p_role text, p_route text) RETURNS sophia.runtime_instances LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT r.* FROM sophia.runtime_instances r WHERE r.project_id=p_project AND r.state='active'
  AND r.roles @> jsonb_build_array(jsonb_build_object('id',p_role,'route',p_route)) AND sophia.runtime_unavailable(r) IS NULL
 ORDER BY r.seen_at DESC LIMIT 1 $$;

REVOKE ALL ON FUNCTION sophia.capture_renderer_ready(), sophia.role_runtime(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.capture_renderer_ready() TO sophia_api;

-- --- scope ----------------------------------------------------------------------------------------------------------

CREATE TYPE sophia.design_scope AS (
 project_id uuid, runtime_id uuid, binding_id uuid, attempt_id uuid, native_session_id text, goal_id uuid, job_id uuid,
 kind text, design_job_id uuid, allowance_id uuid, actor_id uuid, manifest_source_id uuid
);

-- Authenticate a design or review operation: the runtime's lease, then a binding it owns whose job is of the kind
-- named (either, when null). With p_fence, the work must be active under the goal's current authority.
CREATE FUNCTION sophia.design_scope_of(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb, p_kind text, p_fence boolean)
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
  IF g.status NOT IN ('ready','running','checking') THEN RAISE EXCEPTION 'Design work is not active: the goal is %', g.status USING ERRCODE='40001'; END IF;
  IF j.state NOT IN ('pending','running') THEN RAISE EXCEPTION 'Design work is not active: the task has ended' USING ERRCODE='40001'; END IF;
  IF b.state IN ('settled','lost','stopping') THEN RAISE EXCEPTION 'Design work is not active: the session is %', b.state USING ERRCODE='40001'; END IF;
  SELECT * INTO owner FROM sophia.runtime_commands WHERE project_id=rt.project_id AND binding_id=b.id AND kind<>'inspect' ORDER BY seq DESC LIMIT 1;
  IF NOT FOUND OR owner.authority_epoch<>g.authority_epoch OR owner.kind NOT IN ('create','resume','steer','input') THEN
   RAISE EXCEPTION 'Design work is not active: its authority moved on (a Hold or Stop)' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN ROW(rt.project_id,rt.id,b.id,b.attempt_id,b.native_session_id,g.id,j.id,j.kind,design,dt.allowance_id,dt.actor_id,j.input_source_id)::sophia.design_scope;
END $$;
REVOKE ALL ON FUNCTION sophia.design_scope_of(bytea,text,text,jsonb,text,boolean) FROM PUBLIC;

-- The call's key: the native session and the call id.
CREATE FUNCTION sophia.design_call_key(s sophia.design_scope, p_request jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF coalesce(p_request->>'callId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid call id' USING ERRCODE='22023'; END IF;
 RETURN s.native_session_id||':'||(p_request->>'callId');
END $$;
REVOKE ALL ON FUNCTION sophia.design_call_key(sophia.design_scope,jsonb) FROM PUBLIC;

-- The frozen content package of a design task, as JSON.
CREATE FUNCTION sophia.design_package(p_project uuid, p_design_job uuid) RETURNS jsonb LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT x.body::jsonb FROM sophia.design_tasks t JOIN sophia.source_texts x ON x.project_id=t.project_id AND x.source_id=t.package_source_id
 WHERE t.project_id=p_project AND t.job_id=p_design_job $$;
REVOKE ALL ON FUNCTION sophia.design_package(uuid,uuid) FROM PUBLIC;

-- The candidate a review is bound to.
CREATE FUNCTION sophia.review_candidate(s sophia.design_scope) RETURNS sophia.design_candidates LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT c.* FROM sophia.design_reviews r JOIN sophia.design_candidates c ON c.project_id=r.project_id AND c.id=r.candidate_id
 WHERE r.project_id=s.project_id AND r.job_id=s.job_id $$;
REVOKE ALL ON FUNCTION sophia.review_candidate(sophia.design_scope) FROM PUBLIC;

-- Whether a stored text may be read in this scope. The designer: its manifest, the package, the version it designs,
-- the question, and its own revisions' files, diffs and compiled pages. The reviewer: its manifest, the package, the
-- question, and its candidate's files and compiled page.
CREATE FUNCTION sophia.design_readable(s sophia.design_scope, p_source uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT p_source=s.manifest_source_id
  OR EXISTS(SELECT 1 FROM sophia.design_tasks t LEFT JOIN sophia.artifact_versions v ON v.project_id=t.project_id AND v.id=t.base_version_id
   LEFT JOIN sophia.research_tasks rt ON rt.project_id=t.project_id AND rt.job_id=t.research_job_id
   WHERE t.project_id=s.project_id AND t.job_id=s.design_job_id
    AND (p_source=t.package_source_id OR p_source=rt.question_source_id OR (s.kind='design' AND p_source=v.source_id)))
  OR EXISTS(SELECT 1 FROM sophia.design_sources d WHERE d.project_id=s.project_id AND d.design_job_id=s.design_job_id
   AND (s.kind='design' OR d.id=(sophia.review_candidate(s)).source_id)
   AND (p_source=d.compiled_source_id OR (s.kind='design' AND p_source=d.diff_source_id)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(d.files) f WHERE f->>'sourceId'=p_source::text))) $$;
REVOKE ALL ON FUNCTION sophia.design_readable(sophia.design_scope,uuid) FROM PUBLIC;

-- A page of a readable text: 6000 characters at most.
CREATE FUNCTION sophia.design_text_page(s sophia.design_scope, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE src uuid:=sophia.uuid_or_null(p_request->>'sourceId'); body text; off integer; size integer; total integer;
BEGIN
 IF src IS NULL OR NOT sophia.design_readable(s,src) THEN RAISE EXCEPTION 'Design source not found' USING ERRCODE='22023'; END IF;
 SELECT t.body INTO body FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=src;
 IF body IS NULL THEN RAISE EXCEPTION 'Design source has no stored text' USING ERRCODE='22023'; END IF;
 off:=coalesce((p_request->>'offset')::integer,0); size:=least(coalesce((p_request->>'limit')::integer,6000),6000);
 IF off<0 OR size<1 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
 total:=char_length(body); off:=least(off,total);
 RETURN jsonb_build_object('sourceId',src,'offset',off,'nextOffset',CASE WHEN off+size<total THEN to_jsonb(off+size) ELSE 'null'::jsonb END,
  'totalChars',total,'truncated',off+size<total,'text',substr(body,off+1,size));
END $$;
REVOKE ALL ON FUNCTION sophia.design_text_page(sophia.design_scope,jsonb) FROM PUBLIC;

-- --- views ------------------------------------------------------------------------------------------------------------

-- A source revision as the tools see it.
CREATE FUNCTION sophia.design_source_view(d sophia.design_sources) RETURNS jsonb LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('revisionId',d.id,'seq',d.seq,'baseRevisionId',d.base_id,'kind',d.kind,'sha256',d.package_sha256,
  'files',d.files,'sections',d.sections,'complete',d.complete,'findings',d.findings,'findingCount',d.finding_count,
  'diffSourceId',d.diff_source_id,'compiledSourceId',d.compiled_source_id) $$;
REVOKE ALL ON FUNCTION sophia.design_source_view(sophia.design_sources) FROM PUBLIC;

-- What the hard gate refuses in a capture receipt for these targets and this package (see the header); empty when it
-- passes. At most forty reasons.
CREATE FUNCTION sophia.design_gate_failures(p_receipt jsonb, p_package jsonb, p_targets text[]) RETURNS text[] LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT coalesce((array_agg(f ORDER BY n, f))[1:40],'{}') FROM (
  SELECT 0 AS n, 'the render did not succeed' AS f WHERE p_receipt->>'status' IS DISTINCT FROM 'succeeded'
  UNION ALL
  SELECT 1, 'check '||g||' did not pass' FROM unnest(ARRAY['source_verified','sandbox_active','requests_contained','source_unchanged']) g
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_receipt->'checks','[]')) c
    WHERE c->>'name'=g AND c->>'target' IS NULL AND c->>'outcome'='passed')
  UNION ALL
  SELECT 2, 'check '||c||' at '||t||CASE WHEN c='contrast' THEN ' failed' ELSE ' did not pass' END
   FROM unnest(p_targets) t, unnest(ARRAY['layout_overflow','blocks_visible','contrast','captures_complete']) c
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_receipt->'checks','[]')) k
    WHERE k->>'name'=c AND k->>'target'=t AND (k->>'outcome'='passed' OR (c='contrast' AND k->>'outcome'='unknown')))
  UNION ALL
  SELECT 3, 'block '||(b->>'id')||' was not measured at '||t FROM unnest(p_targets) t, jsonb_array_elements(coalesce(p_package->'blocks','[]')) b
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_receipt->'targets','[]')) x, jsonb_array_elements(coalesce(x->'page'->'blocks','[]')) m
    WHERE x->>'id'=t AND m->>'id'=b->>'id')
 ) q $$;
REVOKE ALL ON FUNCTION sophia.design_gate_failures(jsonb,jsonb,text[]) FROM PUBLIC;

-- A capture job as the design tools see it: its state, its captures, each target's measures (every block with an
-- issue, forty at most) and coverage, the checks, and the hard gate's reading of it for the task.
CREATE FUNCTION sophia.design_render_view(p_project uuid, p_job uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE j sophia.jobs; r sophia.render_jobs; d sophia.design_sources; t sophia.design_tasks; receipt jsonb; settled boolean; gate text[];
BEGIN
 SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND id=p_job AND kind='render';
 SELECT * INTO r FROM sophia.render_jobs WHERE project_id=p_project AND job_id=p_job AND kind='capture';
 SELECT * INTO d FROM sophia.design_sources WHERE project_id=p_project AND id=r.design_source_id;
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=p_project AND job_id=r.parent_job_id;
 receipt:=r.receipt; settled:=j.state IN ('succeeded','failed','cancelled') AND receipt IS NOT NULL;
 IF settled THEN gate:=sophia.design_gate_failures(receipt,sophia.design_package(p_project,t.job_id),t.targets); END IF;
 RETURN sophia.without_null_members(jsonb_build_object(
  'renderJobId',j.id,'state',CASE j.state WHEN 'pending' THEN 'queued' WHEN 'running' THEN 'rendering' ELSE j.state END,
  'reason',j.reason,'revisionId',d.id,'sha256',d.package_sha256,'targets',to_jsonb(r.targets),'sections',to_jsonb(r.sections),
  'captures',CASE WHEN settled THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('name',c->>'name','target',c->>'target','kind',c->>'kind',
    'section',c->'section','tile',c->'tile','tiles',c->'tiles','width',c->'width','height',c->'height','sha256',c->>'sha256') ORDER BY i),'[]')
   FROM jsonb_array_elements(coalesce(receipt->'captures','[]')) WITH ORDINALITY x(c,i)) END,
  'measures',CASE WHEN settled THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('target',x->>'id','width',x->'page'->'width',
    'height',x->'page'->'height','overflowPx',x->'page'->'overflowPx','overflowing',x->'page'->'overflowing',
    'sections',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s->>'id','y',s->'y','height',s->'height')),'[]') FROM jsonb_array_elements(coalesce(x->'page'->'sections','[]')) s),
    'blocks',jsonb_array_length(coalesce(x->'page'->'blocks','[]')),
    'issues',(SELECT coalesce(jsonb_agg(b ORDER BY k),'[]') FROM (SELECT b, k FROM jsonb_array_elements(coalesce(x->'page'->'blocks','[]')) WITH ORDINALITY y(b,k)
      WHERE jsonb_array_length(coalesce(b->'issues','[]'))>0 ORDER BY k LIMIT 40) z),
    'coverage',x->'coverage') ORDER BY i),'[]')
   FROM jsonb_array_elements(coalesce(receipt->'targets','[]')) WITH ORDINALITY q(x,i)) END,
  'checks',receipt->'checks','warnings',receipt->'warnings','fonts',receipt->'fonts','browser',receipt->'renderer'->'browser',
  'errorCode',receipt->'error'->>'code',
  'gate',CASE WHEN settled THEN jsonb_build_object('passed',cardinality(gate)=0,'failures',to_jsonb(gate)) END));
END $$;
REVOKE ALL ON FUNCTION sophia.design_render_view(uuid,uuid) FROM PUBLIC;

-- --- the designer ------------------------------------------------------------------------------------------------------

-- POST /v1/runtime/design/context: without a source, the task, its frozen package (inline when it is small), the
-- current revision, the candidates and the reviews of them, the work record and the allowance; with one, a page of a
-- text the designer may read.
CREATE FUNCTION sophia.runtime_design_context(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design',true); t sophia.design_tasks;
 v sophia.artifact_versions; a sophia.artifacts; pkg sophia.source_texts; cur sophia.design_sources; al sophia.research_allowances;
 question text;
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
 RETURN sophia.without_null_members(jsonb_build_object('taskId',t.job_id,'mode',t.mode,'language',t.language,'targets',to_jsonb(t.targets),
  'scope',t.scope,'state',t.state,
  'limits',jsonb_build_object('maxRepairs',t.max_repairs,'maxRounds',t.max_rounds,
   'candidates',(SELECT count(*) FROM sophia.design_candidates c WHERE c.project_id=s.project_id AND c.design_job_id=t.job_id),
   'reviews',(SELECT count(*) FROM sophia.design_reviews r WHERE r.project_id=s.project_id AND r.design_job_id=t.job_id),
   'renders',(SELECT count(*) FROM sophia.render_jobs r WHERE r.project_id=s.project_id AND r.parent_job_id=t.job_id),'maxRenders',16),
  'request',jsonb_build_object('question',question,'title',a.title,'artifactId',a.id,'versionId',v.id,'versionNumber',v.version_number,
   'markdownSourceId',v.source_id,'markdownSha256',t.markdown_sha256,'limitations',to_jsonb(v.limitations)),
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

-- POST /v1/runtime/design/record: append entries to the work record at the count the designer read. A replay of the
-- same call returns the count it left.
CREATE FUNCTION sophia.runtime_design_record(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design',true);
 key text:=sophia.design_call_key(s,p_request); cur integer; n integer;
BEGIN
 PERFORM 1 FROM sophia.design_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 SELECT max(seq) INTO n FROM sophia.design_work_entries WHERE project_id=s.project_id AND design_job_id=s.job_id AND call_key=key;
 IF n IS NOT NULL THEN RETURN jsonb_build_object('entries',n,'replayed',true); END IF;
 IF jsonb_typeof(p_request->'entries')<>'array' OR jsonb_array_length(p_request->'entries') NOT BETWEEN 1 AND 10 OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(p_request->'entries') e WHERE jsonb_typeof(e)<>'object'
    OR coalesce(e->>'kind','') NOT IN ('contract','stage','reference','risk','surface','note')
    OR jsonb_typeof(e->'body') NOT IN ('object','string') OR octet_length((e->'body')::text)>16384) THEN
  RAISE EXCEPTION 'A work record entry has a kind and a body of at most 16 KiB; one call appends 1 to 10' USING ERRCODE='22023'; END IF;
 SELECT coalesce(max(seq),0) INTO cur FROM sophia.design_work_entries WHERE project_id=s.project_id AND design_job_id=s.job_id;
 IF cur+jsonb_array_length(p_request->'entries')>400 THEN RAISE EXCEPTION 'The work record is full' USING ERRCODE='55000'; END IF;
 IF (p_request->>'expectedEntries')::integer IS DISTINCT FROM cur THEN
  RAISE EXCEPTION 'Stale work record: it has % entries', cur USING ERRCODE='40001'; END IF;
 INSERT INTO sophia.design_work_entries(project_id,design_job_id,seq,call_key,kind,body)
 SELECT s.project_id,s.job_id,cur+i::integer,key,e->>'kind',e->'body' FROM jsonb_array_elements(p_request->'entries') WITH ORDINALITY x(e,i);
 RETURN jsonb_build_object('entries',cur+jsonb_array_length(p_request->'entries'),'replayed',false);
END $$;

-- The latest revision of a design task, and whether the one the request expects is it.
CREATE FUNCTION sophia.design_current(s sophia.design_scope, p_expected text) RETURNS sophia.design_sources LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE cur sophia.design_sources;
BEGIN
 SELECT * INTO cur FROM sophia.design_sources WHERE project_id=s.project_id AND design_job_id=s.job_id ORDER BY seq DESC LIMIT 1;
 IF cur.package_sha256 IS DISTINCT FROM p_expected THEN
  RAISE EXCEPTION 'Stale source: the design''s current source is %', coalesce(cur.package_sha256,'none yet') USING ERRCODE='40001'; END IF;
 RETURN cur;
END $$;
REVOKE ALL ON FUNCTION sophia.design_current(sophia.design_scope,text) FROM PUBLIC;

-- POST /v1/runtime/design/source and /patch, step 1: what the API checks the new source against. A replay of the call
-- returns its revision; otherwise the base (the current revision, which the request must name by its hash; none for a
-- first write), the frozen package, the edit scope and the language.
CREATE FUNCTION sophia.runtime_design_source_input(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design',true);
 key text:=sophia.design_call_key(s,p_request); d sophia.design_sources; cur sophia.design_sources; t sophia.design_tasks;
BEGIN
 SELECT * INTO d FROM sophia.design_sources WHERE project_id=s.project_id AND design_job_id=s.job_id AND call_key=key;
 IF FOUND THEN RETURN jsonb_build_object('existing',sophia.design_source_view(d)); END IF;
 IF coalesce(p_request->>'kind','') NOT IN ('write','patch') THEN RAISE EXCEPTION 'A source change is a write or a patch' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 IF t.state<>'designing' THEN RAISE EXCEPTION 'The design is %: its source cannot change now', t.state USING ERRCODE='40001'; END IF;
 cur:=sophia.design_current(s,p_request->>'expectedSha256');
 IF p_request->>'kind'='patch' AND cur.id IS NULL THEN RAISE EXCEPTION 'There is no source to patch yet: write one first' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('kind',p_request->>'kind','language',t.language,'scope',t.scope,
  'package',sophia.design_package(s.project_id,s.job_id),
  'base',CASE WHEN cur.id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('revisionId',cur.id,'sha256',cur.package_sha256,
   'files',(SELECT jsonb_agg(jsonb_build_object('path',f->>'path','text',x.body) ORDER BY i) FROM jsonb_array_elements(cur.files) WITH ORDINALITY q(f,i)
    JOIN sophia.source_texts x ON x.project_id=s.project_id AND x.source_id=(f->>'sourceId')::uuid)) END);
END $$;

-- The identity of a source package, as @sophia/design packageSha256 computes it: each file's path, SHA-256 and size
-- in path order (code points), hashed after a fixed header.
CREATE FUNCTION sophia.design_package_sha256(p_files jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to('sophia.design-source.v1'||E'\n'||coalesce(string_agg((f->>'path')||' '
   ||encode(sha256(convert_to(f->>'text','UTF8')),'hex')||' '||octet_length(convert_to(f->>'text','UTF8'))||E'\n','' ORDER BY (f->>'path') COLLATE "C"),''),
  'UTF8')),'hex') FROM jsonb_array_elements(p_files) f $$;
REVOKE ALL ON FUNCTION sophia.design_package_sha256(jsonb) FROM PUBLIC;

-- POST /v1/runtime/design/source and /patch, step 2, in the same transaction: store what the API accepted. Everything
-- step 1 checked is checked again under the task's lock; the package hash is recomputed from the files.
-- p_result: {files: [{path, text}], sha256, sections, complete, findings, findingCount, diff}.
CREATE FUNCTION sophia.runtime_design_source(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb, p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design',true);
 key text:=sophia.design_call_key(s,p_request); d sophia.design_sources; cur sophia.design_sources; t sophia.design_tasks;
 files jsonb:='[]'; f record; src sophia.source_objects; diff sophia.source_objects; n integer;
BEGIN
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 SELECT * INTO d FROM sophia.design_sources WHERE project_id=s.project_id AND design_job_id=s.job_id AND call_key=key;
 IF FOUND THEN RETURN sophia.design_source_view(d); END IF;
 IF t.state<>'designing' THEN RAISE EXCEPTION 'The design is %: its source cannot change now', t.state USING ERRCODE='40001'; END IF;
 cur:=sophia.design_current(s,p_request->>'expectedSha256');
 IF jsonb_typeof(p_result->'files')<>'array' OR jsonb_array_length(p_result->'files') NOT BETWEEN 1 AND 2
  OR (SELECT count(DISTINCT x->>'path') FROM jsonb_array_elements(p_result->'files') x)<>jsonb_array_length(p_result->'files')
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_result->'files') x WHERE x->>'path'='index.html')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_result->'files') x WHERE coalesce(x->>'path','') NOT IN ('index.html','styles.css')
   OR jsonb_typeof(x->'text')<>'string' OR octet_length(x->>'text')>(CASE x->>'path' WHEN 'index.html' THEN 524288 ELSE 131072 END)) THEN
  RAISE EXCEPTION 'A design source is index.html (at most 512 KiB) and an optional styles.css (at most 128 KiB)' USING ERRCODE='22023'; END IF;
 IF sophia.design_package_sha256(p_result->'files') IS DISTINCT FROM p_result->>'sha256' THEN
  RAISE EXCEPTION 'The source package hash does not match its files' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_result->'sections')<>'array' OR jsonb_array_length(p_result->'sections')>256
  OR jsonb_typeof(p_result->'findings')<>'array' OR jsonb_array_length(p_result->'findings')>200
  OR jsonb_typeof(p_result->'complete')<>'boolean' OR (p_result->>'findingCount')::integer<jsonb_array_length(p_result->'findings') THEN
  RAISE EXCEPTION 'A checked source names its sections and findings' USING ERRCODE='22023'; END IF;
 SELECT count(*) INTO n FROM sophia.design_sources WHERE project_id=s.project_id AND design_job_id=s.job_id;
 IF n>=40 THEN RAISE EXCEPTION 'Design revision limit reached' USING ERRCODE='55000'; END IF;
 FOR f IN SELECT x->>'path' AS path, x->>'text' AS body FROM jsonb_array_elements(p_result->'files') x ORDER BY x->>'path' DESC LOOP
  src:=sophia.put_text_source(s.project_id,s.actor_id,CASE f.path WHEN 'index.html' THEN 'text/html; charset=utf-8' ELSE 'text/css; charset=utf-8' END,f.body);
  INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(s.project_id,t.package_source_id,src.id) ON CONFLICT DO NOTHING;
  files:=files||jsonb_build_array(jsonb_build_object('path',f.path,'sourceId',src.id,'sha256',src.sha256,'bytes',src.byte_length));
 END LOOP;
 IF coalesce(p_result->>'diff','')<>'' THEN
  diff:=sophia.put_text_source(s.project_id,s.actor_id,'text/x-diff; charset=utf-8',left(p_result->>'diff',65600));
  INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
  SELECT s.project_id,(x->>'sourceId')::uuid,diff.id FROM jsonb_array_elements(files) x ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO sophia.design_sources(project_id,design_job_id,seq,base_id,call_key,kind,package_sha256,files,sections,complete,findings,finding_count,diff_source_id)
 VALUES(s.project_id,s.job_id,coalesce(cur.seq,0)+1,cur.id,key,p_request->>'kind',p_result->>'sha256',files,p_result->'sections',
  (p_result->>'complete')::boolean,p_result->'findings',(p_result->>'findingCount')::integer,diff.id) RETURNING * INTO d;
 RETURN sophia.design_source_view(d);
END $$;

-- What a render of this task needs now: no render in flight, at most sixteen in all, a revision of this task, targets
-- among the task's and section ids.
CREATE FUNCTION sophia.design_render_plan(s sophia.design_scope, p_request jsonb, OUT d sophia.design_sources, OUT targets text[],
 OUT sections text[]) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.design_tasks;
BEGIN
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 IF t.state<>'designing' THEN RAISE EXCEPTION 'The design is %: nothing to render now', t.state USING ERRCODE='40001'; END IF;
 SELECT * INTO d FROM sophia.design_sources WHERE project_id=s.project_id AND design_job_id=s.job_id AND id=sophia.uuid_or_null(p_request->>'revisionId');
 IF NOT FOUND THEN RAISE EXCEPTION 'Design revision not found' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.render_jobs r JOIN sophia.jobs j ON j.project_id=r.project_id AND j.id=r.job_id
   WHERE r.project_id=s.project_id AND r.parent_job_id=s.job_id AND j.state IN ('pending','running')) THEN
  RAISE EXCEPTION 'A render of this design is still running: wait for its result' USING ERRCODE='40001'; END IF;
 IF (SELECT count(*) FROM sophia.render_jobs WHERE project_id=s.project_id AND parent_job_id=s.job_id)>=16 THEN
  RAISE EXCEPTION 'Design render limit reached' USING ERRCODE='55000'; END IF;
 IF p_request ? 'targets' THEN
  IF jsonb_typeof(p_request->'targets')<>'array' THEN RAISE EXCEPTION 'Invalid targets' USING ERRCODE='22023'; END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO targets FROM jsonb_array_elements_text(p_request->'targets') x;
  IF targets IS NULL OR NOT targets <@ t.targets THEN RAISE EXCEPTION 'A render names targets of this task' USING ERRCODE='22023'; END IF;
 ELSE targets:=t.targets; END IF;
 IF p_request ? 'sections' AND p_request->'sections'<>'null'::jsonb THEN
  IF jsonb_typeof(p_request->'sections')<>'array' OR jsonb_array_length(p_request->'sections') NOT BETWEEN 1 AND 64
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'sections') x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' !~ '^[a-z][a-z0-9-]{0,63}$') THEN
   RAISE EXCEPTION 'A render names 1 to 64 section ids, or none for all' USING ERRCODE='22023'; END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO sections FROM jsonb_array_elements_text(p_request->'sections') x;
 END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.design_render_plan(sophia.design_scope,jsonb) FROM PUBLIC;

-- POST /v1/runtime/design/render, step 1: the render an earlier call with this id queued, or the revision's files and
-- language for the API to compile.
CREATE FUNCTION sophia.runtime_design_render_input(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design',true);
 key text:=sophia.design_call_key(s,p_request); existing uuid; plan record;
BEGIN
 SELECT job_id INTO existing FROM sophia.render_jobs WHERE project_id=s.project_id AND parent_job_id=s.job_id AND call_key=key;
 IF existing IS NOT NULL THEN RETURN jsonb_build_object('existing',sophia.design_render_view(s.project_id,existing)); END IF;
 SELECT * INTO plan FROM sophia.design_render_plan(s,p_request);
 RETURN jsonb_build_object('revisionId',(plan.d).id,'sha256',(plan.d).package_sha256,
  'language',(SELECT language FROM sophia.design_tasks WHERE project_id=s.project_id AND job_id=s.job_id),
  'files',(SELECT jsonb_agg(jsonb_build_object('path',f->>'path','text',x.body) ORDER BY i) FROM jsonb_array_elements((plan.d).files) WITH ORDINALITY q(f,i)
   JOIN sophia.source_texts x ON x.project_id=s.project_id AND x.source_id=(f->>'sourceId')::uuid));
END $$;

-- POST /v1/runtime/design/render, step 2, in the same transaction: queue the page the API compiled from that revision
-- as a capture job. The compiled page is kept on the revision the first time; the compiler is deterministic.
CREATE FUNCTION sophia.runtime_design_render(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb, p_html text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design',true);
 key text:=sophia.design_call_key(s,p_request); existing uuid; plan record; t sophia.design_tasks; html sophia.source_objects;
 job uuid:=gen_random_uuid(); r sophia.render_jobs;
BEGIN
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 SELECT job_id INTO existing FROM sophia.render_jobs WHERE project_id=s.project_id AND parent_job_id=s.job_id AND call_key=key;
 IF existing IS NOT NULL THEN RETURN sophia.design_render_view(s.project_id,existing); END IF;
 SELECT * INTO plan FROM sophia.design_render_plan(s,p_request);
 IF p_html IS NULL OR octet_length(p_html) NOT BETWEEN 1 AND 4194304 THEN RAISE EXCEPTION 'A capture package is the compiled page' USING ERRCODE='22023'; END IF;
 SELECT so.* INTO html FROM sophia.source_objects so WHERE so.project_id=s.project_id AND so.id=(plan.d).compiled_source_id;
 IF html.id IS NULL OR html.sha256<>encode(sha256(convert_to(p_html,'UTF8')),'hex') THEN
  html:=sophia.put_text_source(s.project_id,s.actor_id,'text/html; charset=utf-8',p_html);
  INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
  SELECT s.project_id,(f->>'sourceId')::uuid,html.id FROM jsonb_array_elements((plan.d).files) f ON CONFLICT DO NOTHING;
  UPDATE sophia.design_sources SET compiled_source_id=html.id WHERE project_id=s.project_id AND id=(plan.d).id AND compiled_source_id IS NULL;
 END IF;
 INSERT INTO sophia.jobs(project_id,id,kind,state,parent_job_id) VALUES(s.project_id,job,'render','pending',s.job_id);
 INSERT INTO sophia.render_jobs(project_id,job_id,parent_job_id,goal_id,format,kind,language,manifest_sha256,targets,sections,design_source_id,call_key)
 VALUES(s.project_id,job,s.job_id,s.goal_id,'png','capture',t.language,sophia.render_manifest_sha256('index.html',html.sha256,'[]'),
  plan.targets,plan.sections,(plan.d).id,key) RETURNING * INTO r;
 INSERT INTO sophia.render_job_files(project_id,job_id,path,role,source_id) VALUES(s.project_id,job,'index.html','entry',html.id);
 RETURN sophia.design_render_view(s.project_id,job);
END $$;

-- The render a design or review operation names: one of the design's own (the designer, the latest when none is
-- named), or its candidate's (the reviewer).
CREATE FUNCTION sophia.design_render_of(s sophia.design_scope, p_request jsonb) RETURNS uuid LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE job uuid; named uuid:=sophia.uuid_or_null(p_request->>'renderJobId');
BEGIN
 IF s.kind='design_review' THEN
  job:=(sophia.review_candidate(s)).render_job_id;
  IF named IS NOT NULL AND named<>job THEN job:=NULL; END IF;
 ELSIF p_request ? 'renderJobId' THEN
  SELECT job_id INTO job FROM sophia.render_jobs WHERE project_id=s.project_id AND parent_job_id=s.job_id AND job_id=named AND kind='capture';
 ELSE
  SELECT job_id INTO job FROM sophia.render_jobs WHERE project_id=s.project_id AND parent_job_id=s.job_id AND kind='capture'
   ORDER BY created_at DESC, job_id LIMIT 1;
 END IF;
 IF job IS NULL THEN RAISE EXCEPTION 'Render not found' USING ERRCODE='22023'; END IF;
 RETURN job;
END $$;
REVOKE ALL ON FUNCTION sophia.design_render_of(sophia.design_scope,jsonb) FROM PUBLIC;

-- POST /v1/runtime/design/render-result: a render of this design (the latest when none is named). Not fenced: a
-- render's result can be read while the work is held.
CREATE FUNCTION sophia.runtime_design_render_result(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design',false);
BEGIN
 RETURN sophia.design_render_view(s.project_id,sophia.design_render_of(s,p_request));
END $$;

-- The stored captures one inspection hands over: at most four of a settled, succeeded render, each with where its
-- bytes are (the API reads them from the byte store and checks them against the hash) and its place on the page.
CREATE FUNCTION sophia.design_capture_refs(s sophia.design_scope, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE job uuid:=sophia.design_render_of(s,p_request); j sophia.jobs; r sophia.render_jobs; names text[]; out jsonb;
BEGIN
 SELECT * INTO j FROM sophia.jobs WHERE project_id=s.project_id AND id=job;
 SELECT * INTO r FROM sophia.render_jobs WHERE project_id=s.project_id AND job_id=job;
 IF j.state<>'succeeded' THEN RAISE EXCEPTION 'This render has no captures to inspect (%)', j.state USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_request->'names')<>'array' OR jsonb_array_length(p_request->'names') NOT BETWEEN 1 AND 4 THEN
  RAISE EXCEPTION 'An inspection names 1 to 4 captures' USING ERRCODE='22023'; END IF;
 SELECT array_agg(DISTINCT x) INTO names FROM jsonb_array_elements_text(p_request->'names') x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',o.name,'sourceId',so.id,'storageKey',so.storage_key,'sha256',so.sha256,'bytes',so.byte_length,
   'mime',so.mime,'target',c->>'target','kind',c->>'kind','section',c->'section','tile',c->'tile','tiles',c->'tiles','clip',c->'clip',
   'scale',c->'scale','width',c->'width','height',c->'height') ORDER BY o.name),'[]') INTO out
  FROM sophia.render_job_outputs o JOIN sophia.source_objects so ON so.project_id=o.project_id AND so.id=o.source_id
  JOIN LATERAL (SELECT c FROM jsonb_array_elements(coalesce(r.receipt->'captures','[]')) c WHERE c->>'name'=o.name LIMIT 1) q ON true
  WHERE o.project_id=s.project_id AND o.job_id=job AND o.name=ANY(names);
 IF jsonb_array_length(out)<>cardinality(names) THEN RAISE EXCEPTION 'Capture not found' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('renderJobId',job,'captures',out);
END $$;
REVOKE ALL ON FUNCTION sophia.design_capture_refs(sophia.design_scope,jsonb) FROM PUBLIC;

-- POST /v1/runtime/design/capture: the designer looks at captures of its own renders.
CREATE FUNCTION sophia.runtime_design_capture(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design',true);
BEGIN
 RETURN sophia.design_capture_refs(s,p_request);
END $$;

-- --- metering ---------------------------------------------------------------------------------------------------------

-- POST /v1/runtime/design/reserve: before one model call of the designer or the reviewer, against the lineage's
-- allowance. Only model calls: neither role searches, reads the web or prints.
CREATE FUNCTION sophia.runtime_design_reserve(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,NULL,true);
 key text:=sophia.design_call_key(s,p_request); r sophia.research_reservations;
BEGIN
 IF p_request->>'kind' IS DISTINCT FROM 'model' OR coalesce(p_request->>'purpose','call')<>'call' THEN
  RAISE EXCEPTION 'A design or review reserves model calls only' USING ERRCODE='22023'; END IF;
 r:=sophia.reserve_research(s.project_id,s.allowance_id,key,'model',p_request->>'provider',(p_request->>'amountUsd')::numeric,'call');
 RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'kind',r.kind,'purpose',r.purpose,'amountUsd',r.reserved_usd,'target',NULL);
END $$;

-- POST /v1/runtime/design/settle: end one of this session's reservations from the call's reported usage. Never fenced.
CREATE FUNCTION sophia.runtime_design_settle(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,NULL,false); r sophia.research_reservations;
BEGIN
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND id=sophia.uuid_or_null(p_request->>'reservationId')
  AND allowance_id=s.allowance_id AND starts_with(reservation_key,s.native_session_id||':');
 IF NOT FOUND THEN RAISE EXCEPTION 'Research reservation not found' USING ERRCODE='22023'; END IF;
 IF p_request ? 'usage' AND jsonb_typeof(p_request->'usage')<>'object' THEN RAISE EXCEPTION 'Invalid usage' USING ERRCODE='22023'; END IF;
 r:=sophia.end_research_reservation(s.project_id,r.id,p_request->>'outcome',(p_request->>'costUsd')::numeric,p_request->'usage',
  p_request->>'providerRequestId');
 RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'settledUsd',r.settled_usd);
END $$;

-- --- the reviewer -----------------------------------------------------------------------------------------------------

-- The criteria every review is given (the critique skill's verdict rules, compact). Its hash binds each review.
CREATE FUNCTION sophia.review_criteria() RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT 'Judge the candidate from its captures and measures, against the original request and the frozen content.'||E'\n'
 || '1. Content: every block of the frozen package is present, legible and unchanged in meaning; caveats stay near the claims they qualify; each cited source is listed once.'||E'\n'
 || '2. Reading: the main argument leads; the hierarchy, rhythm and density help a reader at 390 px and at 1280 px; no clipped, covered, overlapping or illegible text; contrast holds.'||E'\n'
 || '3. Craft: the layout serves this report rather than a fixed template; no repetitive card walls, fake interactions or decoration that competes with the content.'||E'\n'
 || '4. Evidence: name the capture (or measure) each finding rests on. Do not judge what you did not inspect: inspect each target''s overview and every section at one target at least before a pass.'||E'\n'
 || 'Verdict: pass when nothing blocking or major remains; needs_revision with the findings that must change (severity blocking or major, each with its fix); blocked when you cannot judge.' $$;
REVOKE ALL ON FUNCTION sophia.review_criteria() FROM PUBLIC;

-- POST /v1/runtime/review/context: without a source, the request, the frozen package, the criteria and the exact
-- candidate with its render; never the author's summary or work record. With one, a page of a readable text.
CREATE FUNCTION sophia.runtime_review_context(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design_review',true);
 c sophia.design_candidates:=sophia.review_candidate(s); t sophia.design_tasks; d sophia.design_sources; rv sophia.design_reviews;
 pkg sophia.source_texts; a sophia.artifacts; question text;
BEGIN
 IF p_request ? 'sourceId' THEN RETURN sophia.design_text_page(s,p_request); END IF;
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=s.project_id AND job_id=s.design_job_id;
 SELECT * INTO d FROM sophia.design_sources WHERE project_id=s.project_id AND id=c.source_id;
 SELECT * INTO rv FROM sophia.design_reviews WHERE project_id=s.project_id AND job_id=s.job_id;
 SELECT * INTO pkg FROM sophia.source_texts WHERE project_id=s.project_id AND source_id=t.package_source_id;
 SELECT * INTO a FROM sophia.artifacts WHERE project_id=s.project_id AND id=t.artifact_id;
 SELECT x.body INTO question FROM sophia.research_tasks rt JOIN sophia.source_texts x ON x.project_id=rt.project_id AND x.source_id=rt.question_source_id
  WHERE rt.project_id=s.project_id AND rt.job_id=t.research_job_id;
 RETURN sophia.without_null_members(jsonb_build_object('reviewTaskId',s.job_id,'candidateId',c.id,'round',c.round,
  'criteria',jsonb_build_object('text',sophia.review_criteria(),'sha256',rv.criteria_sha256),
  'request',jsonb_build_object('question',question,'title',a.title,'language',t.language,'targets',to_jsonb(t.targets)),
  'package',jsonb_build_object('sourceId',t.package_source_id,'sha256',t.package_sha256,'totalChars',char_length(pkg.body),
   'content',CASE WHEN char_length(pkg.body)<=60000 THEN pkg.body::jsonb END),
  'candidate',jsonb_build_object('revisionId',d.id,'sha256',d.package_sha256,'files',d.files,'sections',d.sections,
   'compiledSourceId',c.compiled_source_id),
  'render',sophia.design_render_view(s.project_id,c.render_job_id),
  'inspected',to_jsonb(rv.inspected)));
END $$;

-- POST /v1/runtime/review/capture: the reviewer looks at its candidate's captures; each one handed over is recorded.
CREATE FUNCTION sophia.runtime_review_capture(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design_review',true); out jsonb;
BEGIN
 out:=sophia.design_capture_refs(s,p_request);
 UPDATE sophia.design_reviews SET inspected=(SELECT array_agg(DISTINCT x ORDER BY x) FROM (SELECT unnest(inspected) AS x UNION
   SELECT c->>'name' FROM jsonb_array_elements(out->'captures') c) y)
  WHERE project_id=s.project_id AND job_id=s.job_id;
 RETURN out;
END $$;

-- --- the renderer ---------------------------------------------------------------------------------------------------

-- The job as the runner sees it (0030), and for a capture its targets and sections.
CREATE OR REPLACE FUNCTION sophia.render_job_view(j sophia.jobs) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('jobId',j.id,'leaseToken',j.lease_token,'leaseUntil',j.lease_until,'format',r.format,'language',r.language,
  'sourceManifestHash',r.manifest_sha256,'timeoutMs',CASE r.format WHEN 'png' THEN 180000 ELSE 120000 END,
  'files',(SELECT jsonb_agg(jsonb_build_object('path',f.path,'role',f.role,'sha256',s.sha256,'byteLength',s.byte_length) ORDER BY f.role DESC, f.path COLLATE "C")
   FROM sophia.render_job_files f JOIN sophia.source_objects s ON s.project_id=f.project_id AND s.id=f.source_id
   WHERE f.project_id=r.project_id AND f.job_id=r.job_id))
  ||CASE WHEN r.format='png' THEN jsonb_build_object('targets',to_jsonb(r.targets),'sections',to_jsonb(r.sections)) ELSE '{}'::jsonb END
 FROM sophia.render_jobs r WHERE r.project_id=j.project_id AND r.job_id=j.id $$;

-- POST /v1/renderer/claim with the formats the runner renders: the oldest pending render of one of them whose goal is
-- working, under a new lease; null when none. The runner's formats are recorded (capture readiness reads them).
CREATE FUNCTION sophia.renderer_claim(p_token_sha256 bytea, p_formats text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rn sophia.render_runners:=sophia.render_runner_of(p_token_sha256); j sophia.jobs; v_formats text[];
BEGIN
 SELECT array_agg(DISTINCT f ORDER BY f) INTO v_formats FROM unnest(coalesce(p_formats,'{pdf}')) f;
 IF v_formats IS NULL OR NOT v_formats <@ ARRAY['pdf','png'] THEN RAISE EXCEPTION 'A runner renders pdf, png or both' USING ERRCODE='22023'; END IF;
 IF rn.formats IS DISTINCT FROM v_formats THEN UPDATE sophia.render_runners SET formats=v_formats WHERE id=rn.id; END IF;
 PERFORM sophia.render_sweep();
 SELECT j2.* INTO j FROM sophia.jobs j2 JOIN sophia.render_jobs r ON r.project_id=j2.project_id AND r.job_id=j2.id
  JOIN sophia.goals g ON g.project_id=r.project_id AND g.id=r.goal_id
  WHERE j2.kind='render' AND j2.state='pending' AND j2.available_at<=now() AND g.status IN ('ready','running','checking')
   AND r.format=ANY(v_formats)
  ORDER BY j2.available_at, j2.id FOR UPDATE OF j2 SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE sophia.jobs SET state='running', lease_token=gen_random_uuid(), lease_until=now()+interval '5 minutes'
  WHERE project_id=j.project_id AND id=j.id RETURNING * INTO j;
 UPDATE sophia.render_jobs SET runner_id=rn.id, claims=claims+1 WHERE project_id=j.project_id AND job_id=j.id;
 RETURN sophia.render_job_view(j);
END $$;

-- renderer_claim (0030), replaced: a runner that names no formats renders PDF only, and is never handed a capture.
CREATE OR REPLACE FUNCTION sophia.renderer_claim(p_token_sha256 bytea) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.renderer_claim(p_token_sha256,'{pdf}'::text[]) $$;

-- PUT /v1/renderer/jobs/{id}/captures/{name}, step 1: where one PNG goes (a new source id in the job's project).
CREATE FUNCTION sophia.renderer_capture_slot(p_token_sha256 bytea, p_job text, p_lease text, p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rn sophia.render_runners:=sophia.render_runner_of(p_token_sha256); j sophia.jobs:=sophia.render_leased(rn.id,p_job,p_lease);
 r sophia.render_jobs;
BEGIN
 IF j.state<>'running' THEN RAISE EXCEPTION 'Render lease lost' USING ERRCODE='40001'; END IF;
 SELECT * INTO r FROM sophia.render_jobs WHERE project_id=j.project_id AND job_id=j.id;
 IF r.format<>'png' THEN RAISE EXCEPTION 'Only a capture job has captures' USING ERRCODE='22023'; END IF;
 IF coalesce(p_name,'') !~ '^[a-z0-9][a-z0-9.-]{0,150}\.png$' THEN RAISE EXCEPTION 'Invalid capture name' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM sophia.render_job_outputs WHERE project_id=j.project_id AND job_id=j.id AND name<>p_name)>=72 THEN
  RAISE EXCEPTION 'A capture job keeps at most 72 captures' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('projectId',j.project_id,'sourceId',gen_random_uuid());
END $$;

-- PUT .../captures/{name}, step 2, after the bytes are stored at objects/<project>/<source>: record them as that
-- capture, a project source derived from the page. A capture uploaded again under the same name (a claim after a
-- lost lease) replaces the earlier one.
CREATE FUNCTION sophia.renderer_record_capture(p_token_sha256 bytea, p_job text, p_lease text, p_name text, p_source uuid,
 p_sha256 text, p_bytes bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rn sophia.render_runners:=sophia.render_runner_of(p_token_sha256); j sophia.jobs:=sophia.render_leased(rn.id,p_job,p_lease);
 r sophia.render_jobs; owner uuid;
BEGIN
 IF j.state<>'running' THEN RAISE EXCEPTION 'Render lease lost' USING ERRCODE='40001'; END IF;
 SELECT * INTO r FROM sophia.render_jobs WHERE project_id=j.project_id AND job_id=j.id;
 IF r.format<>'png' THEN RAISE EXCEPTION 'Only a capture job has captures' USING ERRCODE='22023'; END IF;
 IF coalesce(p_name,'') !~ '^[a-z0-9][a-z0-9.-]{0,150}\.png$' THEN RAISE EXCEPTION 'Invalid capture name' USING ERRCODE='22023'; END IF;
 IF coalesce(p_sha256,'') !~ '^[0-9a-f]{64}$' OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 8388608 THEN
  RAISE EXCEPTION 'A capture is 1 byte to 8 MiB, with its SHA-256' USING ERRCODE='22023'; END IF;
 SELECT t.actor_id INTO owner FROM sophia.design_tasks t WHERE t.project_id=j.project_id AND t.job_id=r.parent_job_id;
 INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
 VALUES(j.project_id,p_source,owner,'project',p_sha256,'image/png','objects/'||j.project_id||'/'||p_source,p_bytes,true,'ready');
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
 SELECT f.project_id,f.source_id,p_source FROM sophia.render_job_files f WHERE f.project_id=j.project_id AND f.job_id=j.id;
 INSERT INTO sophia.render_job_outputs(project_id,job_id,name,source_id) VALUES(j.project_id,j.id,p_name,p_source)
 ON CONFLICT (project_id,job_id,name) DO UPDATE SET source_id=EXCLUDED.source_id, created_at=now();
 RETURN jsonb_build_object('name',p_name,'sourceId',p_source,'sha256',p_sha256,'byteLength',p_bytes);
END $$;

-- Whether a succeeded capture receipt names exactly the captures recorded for its job, each with its hash.
CREATE FUNCTION sophia.capture_outputs_match(r sophia.render_jobs, p_receipt jsonb) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_typeof(p_receipt->'captures')='array'
  AND (SELECT count(*) FROM sophia.render_job_outputs o WHERE o.project_id=r.project_id AND o.job_id=r.job_id)=jsonb_array_length(p_receipt->'captures')
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_receipt->'captures') c WHERE NOT EXISTS(
   SELECT 1 FROM sophia.render_job_outputs o JOIN sophia.source_objects so ON so.project_id=o.project_id AND so.id=o.source_id
   WHERE o.project_id=r.project_id AND o.job_id=r.job_id AND o.name=c->>'name' AND so.sha256=c->>'sha256')) $$;
REVOKE ALL ON FUNCTION sophia.capture_outputs_match(sophia.render_jobs,jsonb) FROM PUBLIC;

-- renderer_settle (0034), replaced: the same for a PDF; a capture settles with its receipt (at most 1 MiB), whose
-- captures must be exactly the ones recorded. A capture's checks are the design's hard gate to apply, at submit, not
-- the settle's: a capture with failed checks is still the designer's evidence.
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
 IF jsonb_typeof(p_receipt)<>'object' OR status NOT IN ('succeeded','failed','cancelled')
  OR octet_length(p_receipt::text)>(CASE r.format WHEN 'png' THEN 1048576 ELSE 65536 END) THEN
  RAISE EXCEPTION 'A render settles with its receipt' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM sophia.goals WHERE project_id=j.project_id AND id=r.goal_id;
 SELECT * INTO p FROM sophia.jobs WHERE project_id=j.project_id AND id=r.parent_job_id;
 IF g.status IN ('holding','held') AND (p.state IN ('pending','running') OR r.kind='rendition') THEN
  UPDATE sophia.jobs SET state='pending', lease_token=NULL, lease_until=NULL WHERE project_id=j.project_id AND id=j.id;
  UPDATE sophia.render_jobs SET claims=greatest(claims-1,0), runner_id=NULL, output_source_id=NULL
   WHERE project_id=j.project_id AND job_id=j.id;
  RETURN jsonb_build_object('state','pending','reason','held: queued again for after Resume');
 END IF;
 IF status='succeeded' AND r.format='pdf' THEN
  SELECT * INTO o FROM sophia.source_objects WHERE project_id=j.project_id AND id=r.output_source_id;
  IF NOT FOUND OR p_receipt->'output'->>'sha256' IS DISTINCT FROM o.sha256
   OR p_receipt->'source'->>'manifestSha256' IS DISTINCT FROM r.manifest_sha256 THEN
   RAISE EXCEPTION 'A succeeded render names its package and its recorded output' USING ERRCODE='22023'; END IF;
 ELSIF status='succeeded' THEN
  IF p_receipt->'source'->>'manifestSha256' IS DISTINCT FROM r.manifest_sha256 OR NOT sophia.capture_outputs_match(r,p_receipt) THEN
   RAISE EXCEPTION 'A succeeded capture names its package and exactly its recorded captures' USING ERRCODE='22023'; END IF;
 END IF;
 IF g.status IN ('stopping','stopped') OR p.state IN ('failed','cancelled') THEN
  outcome:='cancelled'; why:='stale: the work was stopped or ended while it rendered';
 ELSIF status='succeeded' AND r.format='pdf' AND cardinality(sophia.render_gate_failures(p_receipt))>0 THEN
  outcome:='failed'; why:=left('failed: '||array_to_string(sophia.render_gate_failures(p_receipt),', '),200);
 ELSE
  outcome:=status;
  why:=CASE WHEN status='succeeded' THEN NULL ELSE left(coalesce(status||': '||(p_receipt->'error'->>'code'),status),200) END;
 END IF;
 UPDATE sophia.jobs SET state=outcome, reason=why, lease_until=NULL,
  result_source_id=CASE WHEN outcome='succeeded' AND r.format='pdf' THEN r.output_source_id END
  WHERE project_id=j.project_id AND id=j.id RETURNING * INTO j;
 UPDATE sophia.render_jobs SET receipt=p_receipt, settled_at=now() WHERE project_id=j.project_id AND job_id=j.id RETURNING * INTO r;
 IF r.kind='rendition' THEN PERFORM sophia.research_rendition_settled(j,r); END IF;
 IF r.kind='capture' THEN
  PERFORM sophia.emit_service_event(j.project_id,'native_task.progress','job',r.parent_job_id,
   (SELECT result_revision+3 FROM sophia.jobs WHERE project_id=j.project_id AND id=r.parent_job_id),'native_task.design_render_settled',jsonb_build_array(j.id));
 END IF;
 RETURN jsonb_build_object('state',j.state,'reason',j.reason);
END $$;

REVOKE ALL ON FUNCTION sophia.runtime_design_context(bytea,text,text,jsonb), sophia.runtime_design_record(bytea,text,text,jsonb),
 sophia.runtime_design_source_input(bytea,text,text,jsonb), sophia.runtime_design_source(bytea,text,text,jsonb,jsonb),
 sophia.runtime_design_render_input(bytea,text,text,jsonb), sophia.runtime_design_render(bytea,text,text,jsonb,text),
 sophia.runtime_design_render_result(bytea,text,text,jsonb), sophia.runtime_design_capture(bytea,text,text,jsonb),
 sophia.runtime_design_reserve(bytea,text,text,jsonb), sophia.runtime_design_settle(bytea,text,text,jsonb),
 sophia.runtime_review_context(bytea,text,text,jsonb), sophia.runtime_review_capture(bytea,text,text,jsonb),
 sophia.renderer_claim(bytea,text[]), sophia.renderer_capture_slot(bytea,text,text,text),
 sophia.renderer_record_capture(bytea,text,text,text,uuid,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.runtime_design_context(bytea,text,text,jsonb), sophia.runtime_design_record(bytea,text,text,jsonb),
 sophia.runtime_design_source_input(bytea,text,text,jsonb), sophia.runtime_design_source(bytea,text,text,jsonb,jsonb),
 sophia.runtime_design_render_input(bytea,text,text,jsonb), sophia.runtime_design_render(bytea,text,text,jsonb,text),
 sophia.runtime_design_render_result(bytea,text,text,jsonb), sophia.runtime_design_capture(bytea,text,text,jsonb),
 sophia.runtime_design_reserve(bytea,text,text,jsonb), sophia.runtime_design_settle(bytea,text,text,jsonb),
 sophia.runtime_review_context(bytea,text,text,jsonb), sophia.runtime_review_capture(bytea,text,text,jsonb),
 sophia.renderer_claim(bytea,text[]), sophia.renderer_capture_slot(bytea,text,text,text),
 sophia.renderer_record_capture(bytea,text,text,text,uuid,text,bigint) TO sophia_api;

COMMIT;
