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
-- * A submitted result cites what its draft cites (CX-0019) by the parser's rule, in the submit's own transaction: to
--   the model's list, research_draft_citations adds every source the current draft names where the report's parser
--   numbers it (markdown_citing_text, which reads the draft block by block as the parser does: never in a code span,
--   a fenced block, an image, an autolink or a link to a page) that the task may cite (research_readable), never its
--   own question, manifest or a draft of this attempt, up to 200 in all.
--   The API's reconciliation (probes through runtime_research_context, and guesses from a page's text at which source
--   was the manifest or an earlier draft) is gone. That exclusion applies to what is added: the model's own list is
--   checked by research_publish (0027) as before, which admits every source research_readable does, the question,
--   manifest and drafts among them. And the PDF's render input (runtime_research_render_input, 0031) still offers every
--   readable id the draft names but the draft itself, so a PDF printed before submit can number a question or an
--   earlier draft the version's Sources leave out. Aligning either changes what a submit or a render accepts (a report
--   that cites only its question; a link the PDF's check then calls unresolved): left for a later migration.
-- 0001-0035 are not edited. section_facts and note_problems are replaced with the same signatures; their callers
-- (research_publish 0027, research_rendition_settled 0034) resolve them at call time and are not replaced.
-- runtime_research_submit (0031) is replaced with the same signature and grants, one line changed.
BEGIN;

-- A heading's anchor, as markdown_sections (0027) computes it: lower case, punctuation dropped, spaces as hyphens.
CREATE FUNCTION sophia.heading_anchor(p_heading text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT btrim(regexp_replace(regexp_replace(lower(p_heading),'[^[:alnum:][:space:]-]','','g'),'\s+','-','g'),'-') $$;
REVOKE ALL ON FUNCTION sophia.heading_anchor(text) FROM PUBLIC;

-- A Markdown text as sections, split as markdown_sections (0027) splits it, each with its heading path: '' for the text
-- before the first heading, else '/' and the anchors of the headings it sits under (by level) and its own. One
-- difference, as Studio's sectionsOf reads it: text before the first heading that is only blank lines (newlines, tabs)
-- is no section, where markdown_sections' btrim, which strips spaces alone, kept it. Each body's lines are joined
-- once, so a long section costs its length, not its length times its lines.
CREATE FUNCTION sophia.markdown_outline(p_text text)
RETURNS TABLE(ord integer, anchor text, heading text, body_hash text, path text)
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE line text; fenced boolean:=false; cur_heading text:=NULL; cur_anchor text:=''; cur_path text:=''; cur_lines text[]:='{}';
 body text; n integer:=0; m text[]; levels integer[]:='{}'; anchors text[]:='{}'; k integer;
BEGIN
 FOREACH line IN ARRAY regexp_split_to_array(coalesce(p_text,''),E'\r?\n') LOOP
  IF line ~ '^\s{0,3}(```|~~~)' THEN fenced:=NOT fenced; END IF;
  m:=CASE WHEN fenced THEN NULL ELSE regexp_match(line,'^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$') END;
  IF m IS NOT NULL AND btrim(m[2])<>'' THEN
   body:=array_to_string(cur_lines,E'\n');
   IF cur_heading IS NOT NULL OR body ~ '\S' THEN
    ord:=n; anchor:=cur_anchor; heading:=cur_heading; path:=cur_path;
    body_hash:=encode(sha256(convert_to(btrim(regexp_replace(body,'\s+',' ','g')),'UTF8')),'hex');
    RETURN NEXT; n:=n+1;
   END IF;
   cur_heading:=btrim(m[2]); cur_lines:='{}';
   cur_anchor:=sophia.heading_anchor(cur_heading);
   k:=cardinality(levels);
   WHILE k>0 AND levels[k]>=length(m[1]) LOOP k:=k-1; END LOOP;
   levels:=levels[1:k]||length(m[1]); anchors:=anchors[1:k]||cur_anchor;
   cur_path:='/'||array_to_string(anchors,'/');
  ELSE
   cur_lines:=array_append(cur_lines,line);
  END IF;
 END LOOP;
 body:=array_to_string(cur_lines,E'\n');
 IF cur_heading IS NOT NULL OR body ~ '\S' THEN
  ord:=n; anchor:=cur_anchor; heading:=cur_heading; path:=cur_path;
  body_hash:=encode(sha256(convert_to(btrim(regexp_replace(body,'\s+',' ','g')),'UTF8')),'hex');
  RETURN NEXT;
 END IF;
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

-- A table row's cells as the report's parser (packages/report markdown.ts, cells) splits them: on '|' outside code
-- spans (each backtick opens or closes one) and not after a backslash, the outer pipes dropped.
CREATE FUNCTION sophia.markdown_cells(p_row text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT string_to_array(string_agg(CASE WHEN u.k%2=1 THEN regexp_replace(u.part,'(?<!\\)\|',chr(1),'g') ELSE u.part END,'`'
   ORDER BY u.k),chr(1))
 FROM unnest(string_to_array(regexp_replace(regexp_replace(btrim(p_row,E' \t\f\v'),'^\|',''),'\|$',''),'`'))
  WITH ORDINALITY u(part,k) $$;
REVOKE ALL ON FUNCTION sophia.markdown_cells(text) FROM PUBLIC;

-- The inline runs the report's parser reads in a text's lines (each a heading, a paragraph, a list item or a table
-- cell: what a code span or a link may span), joined by U+0001, which markdown_citing_text takes out of the text first.
-- Blocks as the parser splits them: a paragraph ends at a blank line or at a line that starts a block or a table; a
-- fenced block (closed by a fence of its kind at least as long) and a rule are read as nothing; a list item takes the
-- indented lines under it; a table's cells are as many as its head has; a quote's lines are read again as blocks, four
-- deep at most.
CREATE FUNCTION sophia.markdown_runs(p_lines text[], p_depth integer) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
DECLARE item constant text:='^(\s*)([-*+]|(\d{1,9})[.)])\s+(.*)$'; tab constant text:='^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$';
 rule constant text:='^ {0,3}([-*_])(\s*\1){2,}\s*$'; i integer:=1; n integer:=cardinality(p_lines); m text[]; fence text;
 ordered boolean; cols integer; body text[]; runs text[]:='{}';
BEGIN
 WHILE i<=n LOOP
  m:=regexp_match(p_lines[i],'^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$');
  IF p_lines[i] ~ '^\s*$' OR p_lines[i] ~ rule OR m[2] ~ '\S' THEN
   IF m[2] ~ '\S' THEN runs:=array_append(runs,m[2]); END IF;
   i:=i+1;
  ELSIF p_lines[i] ~ '^ {0,3}(`{3,}|~{3,})' THEN
   fence:=substring(p_lines[i] FROM '^ {0,3}(`{3,}|~{3,})'); i:=i+1;
   WHILE i<=n AND NOT (starts_with(btrim(p_lines[i],E' \t\f\v'),fence) AND translate(btrim(p_lines[i],E' \t\f\v'),'`~','')='') LOOP
    i:=i+1; END LOOP;
   i:=i+1;
  ELSIF p_lines[i] ~ '^ {0,3}>' THEN
   body:='{}';
   WHILE i<=n AND p_lines[i] ~ '^ {0,3}>' LOOP body:=array_append(body,substring(p_lines[i] FROM '^ {0,3}>\s?(.*)$')); i:=i+1; END LOOP;
   runs:=array_append(runs,CASE WHEN p_depth>=4 THEN array_to_string(body,E'\n') ELSE sophia.markdown_runs(body,p_depth+1) END);
  ELSIF p_lines[i] ~ item THEN
   -- A list: an item, the indented lines under it, a blank line before the next; a top-level item of the other kind
   -- (a number after bullets) starts a new list.
   ordered:=(regexp_match(p_lines[i],item))[3] IS NOT NULL; body:='{}';
   LOOP
    EXIT WHEN i>n; m:=regexp_match(p_lines[i],item);
    IF m IS NOT NULL THEN
     EXIT WHEN length(replace(m[1],E'\t','  '))<2 AND (m[3] IS NOT NULL)<>ordered;
     IF cardinality(body)>0 THEN runs:=array_append(runs,array_to_string(body,E'\n')); END IF;
     body:=ARRAY[m[4]];
    ELSIF cardinality(body)>0 AND p_lines[i] ~ '^\s{2,}\S' THEN body:=array_append(body,p_lines[i]);
    ELSIF p_lines[i] !~ '^\s*$' OR coalesce(p_lines[i+1] !~ item,true) THEN EXIT;
    END IF;
    i:=i+1;
   END LOOP;
   runs:=array_append(runs,array_to_string(body,E'\n'));
  ELSIF strpos(p_lines[i],'|')>0 AND strpos(p_lines[i+1],'|')>0 AND p_lines[i+1] ~ tab THEN
   body:=sophia.markdown_cells(p_lines[i]); cols:=cardinality(body); runs:=array_append(runs,array_to_string(body,chr(1))); i:=i+2;
   WHILE i<=n AND strpos(p_lines[i],'|')>0 LOOP
    runs:=array_append(runs,array_to_string((sophia.markdown_cells(p_lines[i]))[1:cols],chr(1))); i:=i+1; END LOOP;
  ELSE
   body:=ARRAY[p_lines[i]]; i:=i+1;
   WHILE i<=n AND p_lines[i] !~ '^\s*$' AND p_lines[i] !~ '^ {0,3}(`{3,}|~{3,}|#{1,6}\s|>)|^\s*([-*+]|\d{1,9}[.)])\s'
     AND p_lines[i] !~ rule AND NOT coalesce(strpos(p_lines[i],'|')>0 AND strpos(p_lines[i+1],'|')>0 AND p_lines[i+1] ~ tab,false) LOOP
    body:=array_append(body,p_lines[i]); i:=i+1; END LOOP;
   runs:=array_append(runs,array_to_string(body,E'\n'));
  END IF;
 END LOOP;
 RETURN array_to_string(runs,chr(1));
END $$;
REVOKE ALL ON FUNCTION sophia.markdown_runs(text[],integer) FROM PUBLIC;

-- A Markdown text with what the report's parser never reads as a citation blanked, run by run (markdown_runs): a fenced
-- block, a code span, an image, an autolink, and a link's target unless it is a source or a ref to one alone
-- ([1](<id> "title") and [1](source: <id>) keep the id where the target stood). An escaped mark is text, so an escaped
-- '[' opens no link. What is left names a source where the report numbers it: bare, bracketed, in a bare URL, or as a
-- link's target. Read in one pass where the parser reads left to right: brackets and parentheses nested more than one
-- deep, a link in a link's label, and a code span that opens inside a link's target are read as the common case.
CREATE FUNCTION sophia.markdown_citing_text(p_text text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT translate(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
  sophia.markdown_runs(regexp_split_to_array(replace(coalesce(p_text,''),chr(1),' '),E'\r\n?|\n'),0),
  '\\[^0-9A-Za-z\s\u0001]|`[^`\u0001]*`',' ','g'),
  '!\[(?:[^][\u0001]|\[[^][\u0001]*\])*\]\((?:[^()\n\u0001]|\([^()\n\u0001]*\))*\)',' ','g'),
  '<(?:https?|mailto):[^>\u0001]*>',' ','gi'),
  '\[((?:[^][\u0001]|\[[^][\u0001]*\])*)\]\(\s*<?\s*(?:(?:search|link|input|source):\s*)?'
  ||'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:#\d{1,4})?\s*>?(?:\s(?:[^()\n\u0001]|\([^()\n\u0001]*\))*)?\)',
  '[\1] \2 ','gi'),
  '\[((?:[^][\u0001]|\[[^][\u0001]*\])*)\]\((?:[^()\n\u0001]|\([^()\n\u0001]*\))*\)','[\1]','g'),chr(1),E'\n') $$;
REVOKE ALL ON FUNCTION sophia.markdown_citing_text(text) FROM PUBLIC;

-- The citations of a submitted result, and every source its current draft names where the report numbers it
-- (markdown_citing_text) that the task may cite (CX-0019): research_readable admits it (an input, the base, a capture of
-- its allowance), and it is not the task's own question, manifest or a draft of this attempt. The model's list comes first, as it came (research_publish still checks it); the
-- draft's ids follow, lower case, in order of first appearance, up to 200 distinct in all. A stale or missing draft, or
-- citations that are not a list, add nothing (research_publish refuses them).
CREATE FUNCTION sophia.research_draft_citations(s sophia.research_scope, p_result jsonb) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 WITH d AS (SELECT r.source_id, r.sha256 FROM sophia.research_drafts r WHERE r.project_id=s.project_id AND r.attempt_id=s.attempt_id
   ORDER BY r.seq DESC LIMIT 1),
  current AS (SELECT t.body FROM d JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=d.source_id
   WHERE d.sha256=p_result->>'draftSha256' AND jsonb_typeof(p_result->'citations')='array'),
  listed AS (SELECT lower(c) AS id FROM current, jsonb_array_elements_text(p_result->'citations') c),
  named AS (SELECT lower(x.m[1]) AS id, min(x.o) AS first FROM current,
    regexp_matches(sophia.markdown_citing_text(current.body),'([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})','g')
     WITH ORDINALITY AS x(m,o) GROUP BY 1),
  extra AS (SELECT n.id, n.first FROM named n
   WHERE NOT EXISTS(SELECT 1 FROM listed l WHERE l.id=n.id)
    AND n.id::uuid IS DISTINCT FROM s.question_source_id AND n.id::uuid IS DISTINCT FROM s.manifest_source_id
    AND NOT EXISTS(SELECT 1 FROM sophia.research_drafts r WHERE r.project_id=s.project_id AND r.attempt_id=s.attempt_id
     AND r.source_id=n.id::uuid)
    AND sophia.research_readable(s,n.id::uuid)
   ORDER BY n.first LIMIT greatest(0,200-(SELECT count(DISTINCT id) FROM listed)))
 SELECT CASE WHEN EXISTS(SELECT 1 FROM extra)
  THEN jsonb_set(p_result,'{citations}',(p_result->'citations')||(SELECT jsonb_agg(id ORDER BY first) FROM extra))
  ELSE p_result END $$;
REVOKE ALL ON FUNCTION sophia.research_draft_citations(sophia.research_scope,jsonb) FROM PUBLIC;

-- runtime_research_submit (0031), replaced: the same, and a result cites what its draft cites (research_draft_citations).
-- A replay returns the stored version before that is read.
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
  out:=sophia.research_publish(s,key,sophia.research_draft_citations(s,p_request->'result'));
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
