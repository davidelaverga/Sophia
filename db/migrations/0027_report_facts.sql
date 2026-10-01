-- SMC-M03 S4 part 4 (plan §2.8.8): what a report version says about itself, checked against what it is.
-- * Section facts: at publication the service splits the stored Markdown of the new and the previous version into
--   sections by heading and records, deterministically, which sections were added, revised, removed and kept, and
--   whether a conclusion or recommendation section changed. The Knowledge chips are generated from these facts,
--   never from prose.
-- * The truth gate: the model's notes must agree with the facts. A note that says nothing changed when sections did,
--   that calls the conclusion unchanged when it changed, or that claims to have kept a removed section is refused
--   once (the submit answers notes_rejected with the problems and the facts, and nothing is published; a retry of
--   that same call is answered the same way). The next submit that still contradicts them publishes with notes
--   written from the facts. A note never contradicts them.
--   A first version has no "carried over" note.
-- * Members edit a report's description with attribution and an expected revision.
-- * A read keeps the title the extractor reported, for the Sources tab.
-- 0001–0026 are not edited; research_publish, runtime_research_submit and runtime_research_capture are replaced with
-- the same signatures.
BEGIN;

-- The call whose notes were refused: a retry of that same call is refused the same way, never published instead.
ALTER TABLE sophia.research_tasks ADD COLUMN notes_rejected_at timestamptz,
 ADD COLUMN notes_rejected_call text CHECK(notes_rejected_call IS NULL OR notes_rejected_call ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,239}$'),
 ADD CONSTRAINT research_tasks_notes_rejected CHECK((notes_rejected_at IS NULL)=(notes_rejected_call IS NULL));
ALTER TABLE sophia.source_provenance ADD COLUMN title text CHECK(title IS NULL OR length(title) BETWEEN 1 AND 300);

-- --- section facts --------------------------------------------------------------------------------------------

-- A Markdown text as sections: the text before the first heading (heading null), then one per ATX heading, in order,
-- each with its anchor (the heading lower-cased, punctuation dropped, spaces as hyphens) and the hash of its body
-- with whitespace collapsed. A heading inside a fenced code block is not a heading.
CREATE FUNCTION sophia.markdown_sections(p_text text) RETURNS TABLE(ord integer, anchor text, heading text, body_hash text)
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE line text; fenced boolean:=false; cur_heading text:=NULL; cur_body text:=''; n integer:=0; m text[];
BEGIN
 FOREACH line IN ARRAY regexp_split_to_array(coalesce(p_text,''),E'\r?\n') LOOP
  IF line ~ '^\s{0,3}(```|~~~)' THEN fenced:=NOT fenced; END IF;
  m:=CASE WHEN fenced THEN NULL ELSE regexp_match(line,'^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$') END;
  IF m IS NOT NULL AND btrim(m[1])<>'' THEN
   IF cur_heading IS NOT NULL OR btrim(cur_body)<>'' THEN
    ord:=n; heading:=cur_heading;
    anchor:=CASE WHEN cur_heading IS NULL THEN '' ELSE btrim(regexp_replace(regexp_replace(lower(cur_heading),'[^[:alnum:][:space:]-]','','g'),'\s+','-','g'),'-') END;
    body_hash:=encode(sha256(convert_to(btrim(regexp_replace(cur_body,'\s+',' ','g')),'UTF8')),'hex');
    RETURN NEXT; n:=n+1;
   END IF;
   cur_heading:=btrim(m[1]); cur_body:='';
  ELSE
   cur_body:=cur_body||line||E'\n';
  END IF;
 END LOOP;
 IF cur_heading IS NOT NULL OR btrim(cur_body)<>'' THEN
  ord:=n; heading:=cur_heading;
  anchor:=CASE WHEN cur_heading IS NULL THEN '' ELSE btrim(regexp_replace(regexp_replace(lower(cur_heading),'[^[:alnum:][:space:]-]','','g'),'\s+','-','g'),'-') END;
  body_hash:=encode(sha256(convert_to(btrim(regexp_replace(cur_body,'\s+',' ','g')),'UTF8')),'hex');
  RETURN NEXT;
 END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.markdown_sections(text) FROM PUBLIC;

-- What changed between two Markdown versions, by section (headings, in the new version's order; removed ones in the
-- old's). A null previous text is a first version: every section is added.
CREATE FUNCTION sophia.section_facts(p_old text, p_new text) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 WITH o AS (SELECT * FROM sophia.markdown_sections(p_old) WHERE p_old IS NOT NULL),
  n AS (SELECT * FROM sophia.markdown_sections(p_new)),
  pairs AS (SELECT n.ord, n.anchor, coalesce(n.heading,'(introduction)') AS heading,
    CASE WHEN o.anchor IS NULL THEN 'added' WHEN o.body_hash=n.body_hash THEN 'unchanged' ELSE 'revised' END AS change
   FROM n LEFT JOIN o ON o.anchor=n.anchor),
  gone AS (SELECT o.ord, coalesce(o.heading,'(introduction)') AS heading, o.anchor FROM o WHERE NOT EXISTS(SELECT 1 FROM n WHERE n.anchor=o.anchor))
 SELECT jsonb_build_object(
  'added',(SELECT coalesce(jsonb_agg(heading ORDER BY ord),'[]') FROM pairs WHERE change='added'),
  'revised',(SELECT coalesce(jsonb_agg(heading ORDER BY ord),'[]') FROM pairs WHERE change='revised'),
  'removed',(SELECT coalesce(jsonb_agg(heading ORDER BY ord),'[]') FROM gone),
  'unchanged',(SELECT coalesce(jsonb_agg(heading ORDER BY ord),'[]') FROM pairs WHERE change='unchanged'),
  'conclusionChanged',p_old IS NOT NULL AND (EXISTS(SELECT 1 FROM pairs WHERE change<>'unchanged' AND anchor ~ '(conclusion|recommendation)')
    OR EXISTS(SELECT 1 FROM gone WHERE anchor ~ '(conclusion|recommendation)'))) $$;
REVOKE ALL ON FUNCTION sophia.section_facts(text,text) FROM PUBLIC;

-- Where the model's notes contradict the facts, one sentence each; empty when they agree.
CREATE FUNCTION sophia.note_problems(p_change text, p_kept text, p_facts jsonb) RETURNS text[] LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
DECLARE changed integer:=jsonb_array_length(p_facts->'added')+jsonb_array_length(p_facts->'revised')+jsonb_array_length(p_facts->'removed');
 notes text:=lower(coalesce(p_change,'')||' '||coalesce(p_kept,'')); out text[]:='{}'; h text;
BEGIN
 IF changed>0 AND lower(coalesce(p_change,'')) ~ '(\mno changes?\M|\mnothing changed\M|^\s*unchanged\s*\.?\s*$)' THEN
  out:=out||format('The note says nothing changed, but %s sections changed.',changed); END IF;
 IF (p_facts->>'conclusionChanged')::boolean AND notes ~ '(conclusions?|recommendations?)[^.]{0,40}\m(unchanged|the same|did not change|stays?)\M|\m(unchanged|same)\s+(conclusion|recommendation)' THEN
  out:=out||'The note calls the conclusion unchanged, but it changed.'::text; END IF;
 FOR h IN SELECT jsonb_array_elements_text(p_facts->'removed') LOOP
  IF length(h)>=4 AND strpos(lower(coalesce(p_kept,'')),lower(h))>0 THEN
   out:=out||format('The kept note names "%s", which was removed.',h); END IF;
 END LOOP;
 RETURN out;
END $$;
REVOKE ALL ON FUNCTION sophia.note_problems(text,text,jsonb) FROM PUBLIC;

-- Notes written from the facts, when the model's still contradicted them after its repair.
CREATE FUNCTION sophia.template_notes(p_facts jsonb) RETURNS TABLE(change_note text, retained_note text) LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT left(coalesce(nullif(concat_ws('; ',
   CASE WHEN jsonb_array_length(p_facts->'revised')>0 THEN jsonb_array_length(p_facts->'revised')||' revised: '||(SELECT string_agg(x,', ') FROM jsonb_array_elements_text(p_facts->'revised') x) END,
   CASE WHEN jsonb_array_length(p_facts->'added')>0 THEN jsonb_array_length(p_facts->'added')||' added: '||(SELECT string_agg(x,', ') FROM jsonb_array_elements_text(p_facts->'added') x) END,
   CASE WHEN jsonb_array_length(p_facts->'removed')>0 THEN jsonb_array_length(p_facts->'removed')||' removed: '||(SELECT string_agg(x,', ') FROM jsonb_array_elements_text(p_facts->'removed') x) END),''),
   'No section changed')||'.',200),
  CASE WHEN jsonb_array_length(p_facts->'unchanged')>0 THEN left(jsonb_array_length(p_facts->'unchanged')||' unchanged: '||
   (SELECT string_agg(x,', ') FROM jsonb_array_elements_text(p_facts->'unchanged') x)||'.',200) END $$;
REVOKE ALL ON FUNCTION sophia.template_notes(jsonb) FROM PUBLIC;

-- --- publication, replaced ------------------------------------------------------------------------------------

-- research_publish (0026), replaced: the same, and the version's facts include its sections, its notes pass the truth
-- gate (one refusal, then notes from the facts), and a first version carries no "kept" note.
CREATE OR REPLACE FUNCTION sophia.research_publish(s sophia.research_scope, p_key text, p_result jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.research_tasks; j sophia.jobs; g sophia.goals; d sophia.research_drafts; a sophia.artifacts; prev sophia.artifact_versions;
 v sophia.artifact_versions; citations uuid[]; previous uuid[]; lims text[]; vnum integer; validation sophia.source_objects;
 result sophia.source_objects; v_title text:=btrim(p_result->>'title'); v_summary text:=btrim(p_result->>'summary');
 v_answer text:=btrim(p_result->>'resultSummary'); v_change text:=nullif(btrim(coalesce(p_result->>'changeNote','')),'');
 v_kept text:=nullif(btrim(coalesce(p_result->>'retainedNote','')),''); bad uuid; artifact uuid; v_bytes bigint; v_previous_bytes bigint;
 sections jsonb; problems text[]; replaced boolean:=false; new_text text; old_text text;
BEGIN
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
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

 IF j.artifact_id IS NOT NULL THEN
  SELECT * INTO a FROM sophia.artifacts WHERE project_id=s.project_id AND id=j.artifact_id FOR UPDATE;
 ELSE
  SELECT ar.* INTO a FROM sophia.artifacts ar JOIN sophia.jobs jj ON jj.project_id=ar.project_id AND jj.artifact_id=ar.id
   JOIN sophia.research_tasks rt ON rt.project_id=jj.project_id AND rt.job_id=jj.id
   WHERE ar.project_id=s.project_id AND rt.root_job_id=t.root_job_id LIMIT 1 FOR UPDATE OF ar;
 END IF;
 IF a.id IS NOT NULL THEN
  SELECT * INTO prev FROM sophia.artifact_versions WHERE project_id=s.project_id AND id=a.stable_version_id;
  IF v_change IS NULL THEN RAISE EXCEPTION 'An amended report says what changed' USING ERRCODE='22023'; END IF;
 END IF;

 -- The facts, then the truth gate on the notes.
 SELECT body INTO new_text FROM sophia.source_texts WHERE project_id=s.project_id AND source_id=d.source_id;
 SELECT body INTO old_text FROM sophia.source_texts WHERE project_id=s.project_id AND source_id=prev.source_id;
 sections:=sophia.section_facts(CASE WHEN prev.id IS NULL THEN NULL ELSE coalesce(old_text,'') END,new_text);
 IF prev.id IS NULL THEN v_kept:=NULL; END IF;
 problems:=CASE WHEN prev.id IS NULL THEN '{}'::text[] ELSE sophia.note_problems(v_change,v_kept,sections) END;
 IF cardinality(problems)>0 THEN
  IF t.notes_rejected_at IS NULL OR t.notes_rejected_call=p_key THEN
   UPDATE sophia.research_tasks SET notes_rejected_at=coalesce(notes_rejected_at,now()), notes_rejected_call=p_key
    WHERE project_id=s.project_id AND job_id=t.job_id;
   RETURN jsonb_build_object('taskId',j.id,'outcome','notes_rejected','problems',to_jsonb(problems),'sections',sections);
  END IF;
  SELECT tn.change_note, tn.retained_note INTO v_change, v_kept FROM sophia.template_notes(sections) tn;
  replaced:=true;
 END IF;

 IF a.id IS NULL THEN
  artifact:=gen_random_uuid();
  INSERT INTO sophia.artifacts(project_id,id,title,format,summary,summary_updated_at)
  VALUES(s.project_id,artifact,v_title,'markdown',v_summary,now()) RETURNING * INTO a;
 ELSIF a.summary_author_id IS NULL AND a.summary IS DISTINCT FROM v_summary THEN
  -- A member's own description stays; the worker's is replaced with the new version's.
  UPDATE sophia.artifacts SET summary=v_summary, summary_revision=summary_revision+1, summary_updated_at=now()
   WHERE project_id=s.project_id AND id=a.id RETURNING * INTO a;
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
   jsonb_build_object('check','authority_current','ok',true,'authorityEpoch',g.authority_epoch,'goalRevision',g.revision),
   jsonb_build_object('check','notes_agree_with_facts','ok',true,'replacedFromFacts',replaced)))));
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
   'bytes',v_bytes,'previousBytes',v_previous_bytes,'sections',sections,'notesFromFacts',replaced),
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
  'sourceId',v.source_id,'sha256',v.source_hash,'resultSourceId',result.id,'notesFromFacts',replaced);
END $$;

-- runtime_research_submit (0026), replaced: the same, and a replay of a published submit returns what the first call
-- did, including whether the notes were written from the facts.
CREATE OR REPLACE FUNCTION sophia.runtime_research_submit(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
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
    'sourceId',v.source_id,'sha256',v.source_hash,'resultSourceId',j.result_source_id,
    'notesFromFacts',coalesce((v.change_facts->>'notesFromFacts')::boolean,false));
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

-- runtime_research_capture (0025), replaced: the same, and a read keeps the page title the extractor reported.
CREATE OR REPLACE FUNCTION sophia.runtime_research_capture(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true);
 r sophia.research_reservations:=sophia.research_own_reservation(s,p_request->>'reservationId'); p sophia.source_provenance;
 src sophia.source_objects; k text:=p_request->>'kind'; body text; parent uuid; links text[]; lims text[]; n integer;
 v_title text:=nullif(left(btrim(coalesce(p_request->>'title','')),300),'');
BEGIN
 SELECT * INTO p FROM sophia.source_provenance WHERE project_id=s.project_id AND reservation_id=r.id;
 IF FOUND THEN
  IF p.kind IS DISTINCT FROM k THEN RAISE EXCEPTION 'Idempotency key reused for another capture' USING ERRCODE='23505'; END IF;
  SELECT * INTO src FROM sophia.source_objects WHERE project_id=s.project_id AND id=p.source_id;
 ELSE
  IF r.state='released' THEN RAISE EXCEPTION 'A released call has nothing to capture' USING ERRCODE='22023'; END IF;
  IF NOT ((k='search_results' AND r.kind='search') OR (k='web_read' AND r.kind='read')) THEN
   RAISE EXCEPTION 'The capture does not match its call' USING ERRCODE='22023'; END IF;
  IF p_request->>'provider' IS DISTINCT FROM r.provider THEN RAISE EXCEPTION 'The capture does not match its call' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(v ORDER BY i),'{}') INTO lims FROM jsonb_array_elements_text(coalesce(p_request->'limitations','[]')) WITH ORDINALITY AS e(v,i);
  IF cardinality(lims)>20 OR EXISTS(SELECT 1 FROM unnest(lims) l WHERE length(l) NOT BETWEEN 1 AND 300) THEN
   RAISE EXCEPTION 'Invalid limitations' USING ERRCODE='22023'; END IF;
  IF k='search_results' THEN
   IF jsonb_typeof(p_request->'results')<>'array' OR jsonb_array_length(p_request->'results')>5 OR EXISTS(
     SELECT 1 FROM jsonb_array_elements(p_request->'results') x WHERE jsonb_typeof(x)<>'object'
      OR coalesce(length(x->>'url'),0) NOT BETWEEN 1 AND 2048 OR x->>'url' !~* '^https?://') THEN
    RAISE EXCEPTION 'Invalid search results' USING ERRCODE='22023'; END IF;
   body:=jsonb_pretty(jsonb_build_object('schema','sophia.search-results.v1','query',r.query,
    'results',(SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('rank',i,'url',x->>'url','title',left(x->>'title',300),
      'snippet',left(x->>'snippet',1000),'publishedAt',left(x->>'publishedAt',64),'score',x->'score')) ORDER BY i),'[]')
     FROM jsonb_array_elements(p_request->'results') WITH ORDINALITY AS e(x,i))));
   src:=sophia.put_text_source(s.project_id,s.actor_id,'application/json',body);
   v_title:=coalesce(v_title,left('Search: '||r.query,300));
  ELSE
   body:=p_request->>'text';
   IF body IS NULL OR octet_length(body)>262144 THEN RAISE EXCEPTION 'A read capture is 0 to 262144 bytes of text' USING ERRCODE='22023'; END IF;
   SELECT coalesce(array_agg(v ORDER BY i),'{}') INTO links FROM jsonb_array_elements_text(coalesce(p_request->'links','[]')) WITH ORDINALITY AS e(v,i);
   IF cardinality(links)>200 OR EXISTS(SELECT 1 FROM unnest(links) l WHERE length(l) NOT BETWEEN 1 AND 2048 OR l !~* '^https?://') THEN
    RAISE EXCEPTION 'Invalid links' USING ERRCODE='22023'; END IF;
   IF r.target_ref LIKE 'search:%' OR r.target_ref LIKE 'link:%' THEN parent:=split_part(split_part(r.target_ref,':',2),'#',1)::uuid; END IF;
   src:=sophia.put_text_source(s.project_id,s.actor_id,'text/markdown; charset=utf-8',body);
  END IF;
  INSERT INTO sophia.source_provenance(project_id,source_id,kind,provider,reservation_id,target_ref,parent_source_id,requested_url,
   provider_http_status,origin_http_status,reported_final_url,provider_request_id,extraction,coverage,limitations,links,title)
  VALUES(s.project_id,src.id,k,r.provider,r.id,r.target_ref,parent,r.target_url,
   (p_request->>'providerHttpStatus')::integer,(p_request->>'originHttpStatus')::integer,p_request->>'reportedFinalUrl',
   left(p_request->>'providerRequestId',200),p_request->>'extraction',p_request->>'coverage',lims,coalesce(links,'{}'),v_title)
  RETURNING * INTO p;
 END IF;
 SELECT CASE WHEN p.kind='search_results' THEN jsonb_array_length(t.body::jsonb->'results') ELSE cardinality(p.links) END
  INTO n FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=src.id;
 RETURN jsonb_build_object('sourceId',src.id,'sha256',src.sha256,'byteLength',src.byte_length,'kind',p.kind,
  'refs',(SELECT coalesce(jsonb_agg((CASE WHEN p.kind='search_results' THEN 'search:' ELSE 'link:' END)||src.id||'#'||i ORDER BY i),'[]')
   FROM generate_series(1,n) i));
END $$;

-- --- the description --------------------------------------------------------------------------------------------

-- PATCH /api/v1/artifacts/{id}/summary: a member's edit of a report's description, attributed, against the revision
-- they saw. Editors and admins only.
CREATE FUNCTION sophia.edit_report_summary(p_artifact uuid, p_summary text, p_expected_revision bigint) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); ar sophia.artifacts; v_summary text:=btrim(p_summary); p uuid;
BEGIN
 SELECT project_id INTO p FROM sophia.artifacts WHERE id=p_artifact;
 IF a IS NULL OR p IS NULL OR NOT sophia.is_member(p) THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='22023'; END IF;
 IF NOT sophia.can_edit(p) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF v_summary IS NULL OR length(v_summary) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'A description is 1 to 240 characters' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 SELECT * INTO ar FROM sophia.artifacts WHERE project_id=p AND id=p_artifact FOR UPDATE;
 IF ar.summary_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Stale report description' USING ERRCODE='40001'; END IF;
 UPDATE sophia.artifacts SET summary=v_summary, summary_author_id=a, summary_revision=summary_revision+1, summary_updated_at=now()
  WHERE project_id=p AND id=p_artifact RETURNING * INTO ar;
 RETURN jsonb_build_object('artifactId',ar.id,'summary',ar.summary,'summaryAuthorId',ar.summary_author_id,
  'summaryRevision',ar.summary_revision,'summaryUpdatedAt',ar.summary_updated_at);
END $$;
REVOKE ALL ON FUNCTION sophia.edit_report_summary(uuid,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.edit_report_summary(uuid,text,bigint) TO sophia_api;

COMMIT;
