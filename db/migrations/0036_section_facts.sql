-- SMC-M03 (PR #32; CC-0019's two deferred items): section facts that count each section once, and a truth gate that
-- reads the conclusion and the recommendations apart; and a result that cites what its draft cites (CX-0019).
-- * section_facts (0027) paired old and new sections on the anchor alone, so a heading that repeats ('### Pros' under
--   each option) was paired with every section of that name: one edit read as several revisions, and identical texts
--   as revised. Now a section pairs with at most one: the section at the same heading path (its parent headings'
--   anchors, by level, and its own) and occurrence on that path; then, among the sections left, on the path below the
--   outermost heading, in order (a renamed title keeps what sits under it, repeated headings each with its own); then
--   by anchor in order (a renamed parent keeps its children). The stored shape is unchanged (ReportSections, five
--   keys): each list names sections by their headings as before, a repeated heading once per section, and
--   conclusionChanged still says that a conclusion or a recommendation section changed.
-- * note_problems (0027) called "conclusion unchanged" a contradiction whenever either kind changed, and its pattern
--   crossed clauses. Now a note contradicts the facts about the conclusion only if a conclusion section changed, and
--   about the recommendations (a new problem) only if a recommendation section changed, each read within its own
--   clause, a subject that lists both nouns naming each. "No changes to X" and "nothing changed in X", where X is a
--   section left as it was or the conclusion or recommendations, and "nothing changed except X" are not "nothing
--   changed"; "no changes to the report" (or the text, this version, ...) still is. A kept note naming a removed
--   heading contradicts the facts only when no section of that name remains. Problems are distinct and at most 20, as
--   the submission contract allows.
-- * A submitted result cites what its draft cites (CX-0019) by the parser's rule, in the submit's own transaction: the
--   API reads the current draft back and parses it with the report's parser (the code Studio and the page use), and
--   to the model's list research_draft_citations adds each id the parser numbers that the current draft names and the
--   task may cite (research_readable), never its own question, manifest or a draft of this attempt, up to 200 in all.
--   The parser is not mirrored here, so the two cannot drift: the service checks the ids, the parser picks them.
--   The API's earlier reconciliation (probes through runtime_research_context, and guesses from a page's text at which
--   source was the manifest or an earlier draft) is gone: what it offers is checked here. That exclusion applies to
--   what is added: the model's own list is checked by research_publish (0027) as before, which admits every source
--   research_readable does, the question, manifest and drafts among them. And the PDF's render input
--   (runtime_research_render_input, 0031) still offers every readable id the draft names but the draft itself, so a PDF
--   printed before submit can number a question or an earlier draft the version's Sources leave out. Aligning either
--   changes what a submit or a render accepts (a report that cites only its question; a link the PDF's check then calls
--   unresolved): left for a later migration.
-- 0001-0035 are not edited. section_facts and note_problems are replaced with the same signatures; their callers
-- (research_publish 0027, research_rendition_settled 0034) resolve them at call time and are not replaced.
-- runtime_research_submit (0031) is replaced with the same signature and grants, one line changed.
BEGIN;

-- A heading's anchor, as markdown_sections (0027) computes it: lower case, punctuation dropped, spaces as hyphens; its
-- spaces are JavaScript's, as Studio's anchorOf reads them (a byte order mark is one there, and was dropped here).
CREATE FUNCTION sophia.heading_anchor(p_heading text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT btrim(regexp_replace(regexp_replace(lower(p_heading),
   '[^[:alnum:]\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff-]','','g'),
   '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+','-','g'),'-') $$;
REVOKE ALL ON FUNCTION sophia.heading_anchor(text) FROM PUBLIC;

-- A Markdown text as sections, split as markdown_sections (0027) splits it, each with its heading path: '' for the text
-- before the first heading, else '/' and the anchors of the headings it sits under (by level) and its own. Read as
-- Studio's sectionsOf reads it, with JavaScript's whitespace (U+00A0 and U+FEFF among it, which '\s' here is not): so
-- text before the first heading that is only whitespace is no section, where markdown_sections' btrim, which strips
-- spaces alone, kept one. A heading is read in one pass: 0027's lazy '(.*?)\s*#*\s*$' tried every split of a run of
-- spaces (one heading line of 160 KiB took 46 s), so the opening is matched alone and the closing marks and the spaces
-- around them are cut from the end, read reversed from its start. Each body's lines are joined once, so a long section
-- costs its length, not its length times its lines.
CREATE FUNCTION sophia.markdown_outline(p_text text)
RETURNS TABLE(ord integer, anchor text, heading text, body_hash text, path text)
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE ws constant text:='[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]';
 line text; fenced boolean:=false; cur_heading text:=NULL; cur_anchor text:=''; cur_path text:=''; cur_lines text[]:='{}';
 body text; n integer:=0; m text[]; t text; levels integer[]:='{}'; anchors text[]:='{}'; k integer;
BEGIN
 -- A last line of NULL closes the last section.
 FOREACH line IN ARRAY regexp_split_to_array(coalesce(p_text,''),E'\r?\n')||NULL::text LOOP
  IF line ~ ('^'||ws||'{0,3}(```|~~~)') THEN fenced:=NOT fenced; END IF;
  m:=CASE WHEN fenced THEN NULL ELSE regexp_match(line,'^('||ws||'{0,3}(#{1,6})'||ws||'+)') END;
  -- A heading's text, its closing marks cut; '.' in Studio's pattern stops at CR, U+2028 and U+2029, so with one
  -- inside the line is no heading.
  t:=substr(line,length(m[1])+1);
  t:=left(t,length(t)-length(substring(reverse(t) FROM '^'||ws||'*#*'||ws||'*')));
  IF line IS NULL OR (t<>'' AND t !~ '[\r\u2028\u2029]') THEN
   body:=array_to_string(cur_lines,E'\n');
   IF cur_heading IS NOT NULL OR body ~ '[^\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]' THEN
    ord:=n; anchor:=cur_anchor; heading:=cur_heading; path:=cur_path;
    body_hash:=encode(sha256(convert_to(btrim(regexp_replace(body,ws||'+',' ','g'),' '),'UTF8')),'hex');
    RETURN NEXT; n:=n+1;
   END IF;
   EXIT WHEN line IS NULL;
   cur_heading:=t; cur_lines:='{}';
   cur_anchor:=sophia.heading_anchor(cur_heading);
   k:=cardinality(levels);
   WHILE k>0 AND levels[k]>=length(m[2]) LOOP k:=k-1; END LOOP;
   levels:=levels[1:k]||length(m[2]); anchors:=anchors[1:k]||cur_anchor;
   cur_path:='/'||array_to_string(anchors,'/');
  ELSE
   cur_lines:=array_append(cur_lines,line);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION sophia.markdown_outline(text) FROM PUBLIC;

-- section_facts (0027), replaced: the same five keys and names, each section paired at most once (see the header).
CREATE OR REPLACE FUNCTION sophia.section_facts(p_old text, p_new text) RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 WITH o AS (SELECT s.*, row_number() OVER (PARTITION BY s.path ORDER BY s.ord) AS occ, regexp_replace(s.path,'^/[^/]*','') AS sub
    FROM sophia.markdown_outline(p_old) s WHERE p_old IS NOT NULL),
  n AS (SELECT s.*, row_number() OVER (PARTITION BY s.path ORDER BY s.ord) AS occ, regexp_replace(s.path,'^/[^/]*','') AS sub
    FROM sophia.markdown_outline(p_new) s),
  exact AS (SELECT n.ord AS n_ord, o.ord AS o_ord FROM n JOIN o ON o.path=n.path AND o.occ=n.occ),
  -- A renamed title changes every path: what sits under it pairs on the path below the title, in order.
  sub_n AS (SELECT n.ord, n.sub, row_number() OVER (PARTITION BY n.sub ORDER BY n.ord) AS r
   FROM n WHERE n.sub<>'' AND NOT EXISTS(SELECT 1 FROM exact e WHERE e.n_ord=n.ord)),
  sub_o AS (SELECT o.ord, o.sub, row_number() OVER (PARTITION BY o.sub ORDER BY o.ord) AS r
   FROM o WHERE o.sub<>'' AND NOT EXISTS(SELECT 1 FROM exact e WHERE e.o_ord=o.ord)),
  placed AS (SELECT n_ord, o_ord FROM exact UNION ALL
   SELECT sn.ord, so.ord FROM sub_n sn JOIN sub_o so ON so.sub=sn.sub AND so.r=sn.r),
  rest_n AS (SELECT n.ord, n.heading IS NULL AS intro, n.anchor,
    row_number() OVER (PARTITION BY n.heading IS NULL, n.anchor ORDER BY n.ord) AS r
   FROM n WHERE NOT EXISTS(SELECT 1 FROM placed p WHERE p.n_ord=n.ord)),
  rest_o AS (SELECT o.ord, o.heading IS NULL AS intro, o.anchor,
    row_number() OVER (PARTITION BY o.heading IS NULL, o.anchor ORDER BY o.ord) AS r
   FROM o WHERE NOT EXISTS(SELECT 1 FROM placed p WHERE p.o_ord=o.ord)),
  matched AS (SELECT n_ord, o_ord FROM placed UNION ALL
   SELECT rn.ord, ro.ord FROM rest_n rn JOIN rest_o ro ON ro.intro=rn.intro AND ro.anchor=rn.anchor AND ro.r=rn.r),
  pairs AS (SELECT n.ord, n.anchor, coalesce(n.heading,'(introduction)') AS heading,
    CASE WHEN m.o_ord IS NULL THEN 'added' WHEN o.body_hash=n.body_hash THEN 'unchanged' ELSE 'revised' END AS change
   FROM n LEFT JOIN matched m ON m.n_ord=n.ord LEFT JOIN o ON o.ord=m.o_ord),
  gone AS (SELECT o.ord, o.anchor, coalesce(o.heading,'(introduction)') AS heading FROM o
   WHERE NOT EXISTS(SELECT 1 FROM matched m WHERE m.o_ord=o.ord))
 SELECT jsonb_build_object(
  'added',(SELECT coalesce(jsonb_agg(heading ORDER BY ord),'[]') FROM pairs WHERE change='added'),
  'revised',(SELECT coalesce(jsonb_agg(heading ORDER BY ord),'[]') FROM pairs WHERE change='revised'),
  'removed',(SELECT coalesce(jsonb_agg(heading ORDER BY ord),'[]') FROM gone),
  'unchanged',(SELECT coalesce(jsonb_agg(heading ORDER BY ord),'[]') FROM pairs WHERE change='unchanged'),
  'conclusionChanged',p_old IS NOT NULL AND (EXISTS(SELECT 1 FROM pairs WHERE change<>'unchanged' AND anchor ~ '(conclusion|recommendation)')
    OR EXISTS(SELECT 1 FROM gone WHERE anchor ~ '(conclusion|recommendation)'))) $$;

-- Whether a note says that the section a noun names did not change. Either the noun, not after "except (for)",
-- "besides", "other than", "apart/aside from" or a change word ("new conclusion, findings unchanged"), with what joins
-- it in the subject (", X", "and (the|its|all) X", "(...)" or ", as/like ...,"), then within the same clause, before
-- the other noun and before any contrast or change word ("now" unless it reads the same), "unchanged", "the same",
-- "did not change" or "stays"; a colon or a dash may come first. Or "unchanged", "same", "no change(s) to/in" or
-- "nothing changed in/to/about" right before the noun or before "the other and the noun". Clauses end at . ; , : ! ?
-- a dash or a line break.
CREATE FUNCTION sophia.note_keeps(p_note text, p_noun text, p_other text) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 WITH w AS (SELECT '(?!\m(but|while|whereas|though|although|yet|except|new|changed|revised|updated|expanded|extended|'
   ||'added|rewritten|reworked|reworded|refined|tightened|shortened|trimmed|dropped|removed|replaced|corrected|moved)\M'
   ||'|\mnow\M(?!\s+(reads?|is|are|stays?|remains?)\s+(unchanged|the same)))' AS stop),
  p AS (SELECT stop, '(the\s+|its\s+|all\s+(the\s+)?)?'||stop||'[[:alpha:]]+(\s+'||stop||'[[:alpha:]]+)?\M' AS item FROM w)
 SELECT lower(coalesce(p_note,'')) ~ ('(?<!\m(except(\s+for)?|besides|other\s+than|apart\s+from|aside\s+from|new|changed|revised|rewrote|rewritten|'
   ||'updated|expanded|reworked|reworded|refined|tightened|shortened|corrected)\s+(the\s+)?)\m'
   ||p_noun||'\M(\s*,\s*((and|&)\s+)?'||item||'|\s+(and|&)\s+'||item||'|\s*\(('||stop||'[^()\n]){1,40}\)'
   ||'|,\s+(as|like)\s+('||stop||'[^.;,:!?\n–—]){1,25},)*(\s*[:–—])?'
   ||'((?!'||p_other||'\M)'||stop||'[^.;,:!?\n–—]){0,40}?\m(unchanged|the same|did not change|stays?)\M')
  OR lower(coalesce(p_note,'')) ~ ('(\m(unchanged|same)(\s*:)?|\mno changes?\s+(to|in)|\mnothing changed\s+(in|to|about))\s+'
   ||'(the\s+)?('||p_other||'(\s*,\s*|\s+(and|&)\s+)(the\s+)?)?'||p_noun||'\M') FROM p $$;
REVOKE ALL ON FUNCTION sophia.note_keeps(text,text,text) FROM PUBLIC;

-- note_problems (0027), replaced: where the model's notes contradict the facts, one distinct sentence each, at most 20.
CREATE OR REPLACE FUNCTION sophia.note_problems(p_change text, p_kept text, p_facts jsonb) RETURNS text[] LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
DECLARE changed integer:=jsonb_array_length(p_facts->'added')+jsonb_array_length(p_facts->'revised')+jsonb_array_length(p_facts->'removed');
 notes text:=coalesce(p_change,'')||E'.\n'||coalesce(p_kept,''); kept text:=lower(coalesce(p_kept,'')); out text[]:='{}';
 conclusion boolean; recommendation boolean; h text;
BEGIN
 -- Which kind changed: the anchors of the changed sections' headings, by section_facts' own rule.
 SELECT coalesce(bool_or(a ~ 'conclusion'),false), coalesce(bool_or(a ~ 'recommendation'),false) INTO conclusion, recommendation
  FROM (SELECT sophia.heading_anchor(x) AS a FROM unnest(ARRAY['added','revised','removed']) k, jsonb_array_elements_text(p_facts->k) x) t;
 -- "No changes" or "nothing changed", unless "except X", "but X" and the like follow, or "to/in/about X" where X begins
 -- with a section left unchanged or a conclusion or recommendation (judged below), never the whole text.
 IF changed>0 AND (lower(coalesce(p_change,'')) ~ '^\s*unchanged\s*\.?\s*$' OR EXISTS(SELECT 1 FROM regexp_matches(lower(coalesce(p_change,'')),
    '(?:\mno changes?|\mnothing changed)\M(?!,?\s+(?:except|but|save|apart|aside|besides|beyond|other|outside)\M)'
    ||'(?:,?\s+(?:to|in|about)\s+(?:the\s+)?([^.;,:!?\n–—]*))?','g') x(m), sophia.heading_anchor(coalesce(x.m[1],'')) a
   WHERE a='' OR a ~ '^(report|document|text|content|draft|version|substance|anything|any|it|its|this|that|everything|all)(-|$)'
    OR NOT (a ~ '^(conclusions?|recommendations?)(-|$)' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_facts->'unchanged') y,
     sophia.heading_anchor(y) u WHERE u<>'' AND (a=u OR left(a,length(u)+1)=u||'-'))))) THEN
  out:=out||format('The note says nothing changed, but %s sections changed.',changed); END IF;
 IF (p_facts->>'conclusionChanged')::boolean AND conclusion AND sophia.note_keeps(notes,'conclusions?','recommendations?') THEN
  out:=out||'The note calls the conclusion unchanged, but it changed.'::text; END IF;
 IF (p_facts->>'conclusionChanged')::boolean AND recommendation AND sophia.note_keeps(notes,'recommendations?','conclusions?') THEN
  out:=out||'The note calls the recommendations unchanged, but they changed.'::text; END IF;
 -- A removed heading the kept note names, once, unless a section with that anchor remains (a repeated heading).
 FOR h IN SELECT r.x FROM jsonb_array_elements_text(p_facts->'removed') WITH ORDINALITY r(x,i)
   WHERE NOT EXISTS(SELECT 1 FROM unnest(ARRAY['added','revised','unchanged']) k, jsonb_array_elements_text(p_facts->k) y
    WHERE sophia.heading_anchor(y)=sophia.heading_anchor(r.x))
   GROUP BY r.x ORDER BY min(r.i) LOOP
  IF length(h)>=4 AND strpos(kept,lower(h))>0 THEN
   out:=out||format('The kept note names "%s", which was removed.',h); END IF;
 END LOOP;
 RETURN out[1:20];
END $$;

-- The citations of a submitted result, and the sources its current draft cites that the task may cite (CX-0019). Which
-- ids the draft cites is the report's parser's to say (packages/report markdown.ts, the code Studio and the page read
-- the report with): the API parses the draft it reads back through runtime_research_context and offers what the parser
-- numbers as p_candidates, in order. Here each is checked, not read again: added after the model's list (which comes
-- first, as it came; research_publish still checks it) when it is an id (lower-cased; anything else is ignored) the
-- current draft names (anywhere, in any case), research_readable admits (an input, the base, a capture of its
-- allowance), and it is not the task's own question, manifest or a draft of this attempt; up to 200 distinct in all.
-- Only the first 200 candidates are read: the API offers no more. A stale or missing draft, citations that are not a
-- list, or no candidates, add nothing (research_publish refuses the first two).
CREATE FUNCTION sophia.research_draft_citations(s sophia.research_scope, p_result jsonb, p_candidates jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 WITH d AS (SELECT r.source_id, r.sha256 FROM sophia.research_drafts r WHERE r.project_id=s.project_id AND r.attempt_id=s.attempt_id
   ORDER BY r.seq DESC LIMIT 1),
  current AS (SELECT lower(t.body) AS body FROM d JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=d.source_id
   WHERE d.sha256=p_result->>'draftSha256' AND jsonb_typeof(p_result->'citations')='array'),
  listed AS (SELECT lower(c) AS id FROM current, jsonb_array_elements_text(p_result->'citations') c),
  offered AS (SELECT CASE WHEN lower(c.v#>>'{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     THEN lower(c.v#>>'{}')::uuid END AS id, c.o
    FROM jsonb_array_elements(CASE jsonb_typeof(p_candidates) WHEN 'array' THEN p_candidates ELSE '[]' END) WITH ORDINALITY c(v,o)
    WHERE c.o<=200 AND jsonb_typeof(c.v)='string'),
  extra AS (SELECT n.id, min(n.o) AS first FROM offered n, current
   WHERE n.id IS NOT NULL AND strpos(current.body,n.id::text)>0
    AND NOT EXISTS(SELECT 1 FROM listed l WHERE l.id=n.id::text)
    AND n.id IS DISTINCT FROM s.question_source_id AND n.id IS DISTINCT FROM s.manifest_source_id
    AND NOT EXISTS(SELECT 1 FROM sophia.research_drafts r WHERE r.project_id=s.project_id AND r.attempt_id=s.attempt_id
     AND r.source_id=n.id)
    AND sophia.research_readable(s,n.id)
   GROUP BY n.id ORDER BY first LIMIT greatest(0,200-(SELECT count(DISTINCT id) FROM listed)))
 SELECT CASE WHEN EXISTS(SELECT 1 FROM extra)
  THEN jsonb_set(p_result,'{citations}',(p_result->'citations')||(SELECT jsonb_agg(id ORDER BY first) FROM extra))
  ELSE p_result END $$;
REVOKE ALL ON FUNCTION sophia.research_draft_citations(sophia.research_scope,jsonb,jsonb) FROM PUBLIC;

-- runtime_research_submit (0031), replaced: the same, and a result cites what its draft cites (research_draft_citations,
-- with the ids the API's parser read in that draft: the request's draftCitations, which the API sets after validating
-- the request, so the runtime cannot). A replay returns the stored version before that is read.
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
  out:=sophia.research_publish(s,key,sophia.research_draft_citations(s,p_request->'result',p_request->'draftCitations'));
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

COMMIT;
