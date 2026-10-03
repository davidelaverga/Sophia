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
--   numbers it (markdown_citing_text, which reads the draft block by block and each block from left to right as the
--   parser does: never in a code span, a fenced block, an image, an autolink or a link to a page) that the task may
--   cite (research_readable), never its own question, manifest or a draft of this attempt, up to 200 in all.
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

-- A table row's cells as the report's parser (packages/report markdown.ts, cells) splits them: on '|' outside code
-- spans (each backtick opens or closes one) and not after a backslash, the outer pipes dropped; a row of pipes alone
-- is one empty cell.
CREATE FUNCTION sophia.markdown_cells(p_row text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(string_to_array(string_agg(CASE WHEN u.k%2=1 THEN regexp_replace(u.part,'(?<!\\)\|',chr(1),'g') ELSE u.part END,'`'
   ORDER BY u.k),chr(1)),ARRAY[''])
 FROM unnest(string_to_array(regexp_replace(regexp_replace(regexp_replace(p_row,
   '^[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$','','g'),
   '^\|',''),'\|$',''),'`')) WITH ORDINALITY u(part,k) $$;
REVOKE ALL ON FUNCTION sophia.markdown_cells(text) FROM PUBLIC;

-- The inline runs the report's parser reads in a text (each a heading, a paragraph, a list item or a table cell: what a
-- code span or a link may span), joined by U+0001, which is taken out of the text first. Blocks as the parser splits
-- them, its patterns read with JavaScript's whitespace (U+00A0 and U+FEFF among it) and its '.' (which stops at U+2028
-- and U+2029): a paragraph ends at a blank line or at a line that starts a block or a table; a fenced block (closed by
-- a fence of its kind at least as long) and a rule are read as nothing; a list item takes the indented lines under it,
-- trimmed; a table's cells are as many as its head has; a quote's lines are read again as blocks, four deep at most,
-- then as one paragraph. A quote is read in place: its lines lose their marks, and the lines after it wait on a stack.
CREATE FUNCTION sophia.markdown_runs(p_text text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE ws constant text:='[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]';
 -- The same characters, as a string.
 wsc constant text:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||' '||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)
  ||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)
  ||chr(12288)||chr(65279);
 blank constant text:='^'||ws||'*$';
 rule constant text:='^ {0,3}(-('||ws||'*-){2,}|\*('||ws||'*\*){2,}|_('||ws||'*_){2,})'||ws||'*$';
 quote constant text:='^ {0,3}>'||ws||'?([^\u2028\u2029]*)$';
 item constant text:='^('||ws||'*)([-*+]|([0-9]{1,9})[.)])'||ws||'+([^\u2028\u2029]*)$';
 tab constant text:='^'||ws||'*(\|'||ws||'*)?:?-+:?'||ws||'*(\|'||ws||'*:?-+:?'||ws||'*)*(\|'||ws||'*)?$';
 head constant text:='^ {0,3}#{1,6}'||ws||'+(.*)$';
 -- What a block's line may start with, past spaces: anything else starts a table or a paragraph alone.
 marks constant text:='>#`~-*_+0123456789';
 -- Whether a line with no U+2028 or U+2029 starts a block: a fence, a heading, a quote, an item or a rule.
 starts constant text:='^( {0,3}(`{3,}|~{3,}|#{1,6}'||ws||'|>)|'||ws||'*([-*+]|[0-9]{1,9}[.)])'||ws||')|'||rule;
 l text[]:=regexp_split_to_array(replace(coalesce(p_text,''),chr(1),' '),E'\r\n?|\n');
 i integer:=1; b integer:=cardinality(l)+1; d integer:=0; top integer:=0; st integer[]:='{}'; runs text[]:='{}';
 line text; m text[]; t text; f text; fw boolean; fence text; ordered boolean; cols integer; body text[]; j integer; k integer;
BEGIN
 LOOP
  IF i>=b THEN
   EXIT WHEN top=0;
   i:=st[top*3-2]; b:=st[top*3-1]; d:=st[top*3]; top:=top-1; CONTINUE;
  END IF;
  -- What the line starts: 1 nothing (blank, a rule), 2 a heading, 3 a fence, 4 a quote, 5 a list, 0 a table or a
  -- paragraph.
  line:=l[i]; f:=left(ltrim(line,' '),1); k:=0; t:=NULL; fw:=f<>'' AND strpos(wsc,f)>0;
  IF f='' THEN k:=1;
  ELSIF strpos(marks,f)>0 OR fw THEN
   -- Only what that mark may start is tried (any of them after a space other than ' ').
   IF f='#' OR fw THEN t:=regexp_replace((regexp_match(line,head))[1],ws||'*#*'||ws||'*$',''); END IF;
   k:=CASE WHEN fw AND line ~ blank THEN 1 WHEN (strpos('-*_',f)>0 OR fw) AND line ~ rule THEN 1
    WHEN t<>'' AND t !~ '[\u2028\u2029]' THEN 2
    WHEN (f IN ('`','~') OR fw) AND line ~ '^ {0,3}(`{3,}|~{3,})' THEN 3 WHEN (f='>' OR fw) AND line ~ quote THEN 4
    WHEN f NOT IN ('>','#','`','~','_') AND line ~ item THEN 5 ELSE 0 END;
  END IF;
  IF k=1 THEN i:=i+1;
  ELSIF k=2 THEN runs:=array_append(runs,t); i:=i+1;
  ELSIF k=3 THEN
   fence:=substring(l[i] FROM '^ {0,3}(`{3,}|~{3,})'); i:=i+1;
   WHILE i<b LOOP
    t:=regexp_replace(l[i],'^'||ws||'+|'||ws||'+$','','g'); i:=i+1;
    EXIT WHEN starts_with(t,fence) AND translate(t,'`~','')='';
   END LOOP;
  ELSIF k=4 THEN
   -- A quote: its lines lose their marks in place and are read as blocks one level deeper while the rest waits.
   j:=i;
   WHILE j<b AND left(ltrim(l[j],' '),1)='>' LOOP m:=regexp_match(l[j],quote); EXIT WHEN m IS NULL; l[j]:=m[1]; j:=j+1; END LOOP;
   IF d>=4 THEN
    body:='{}'; FOR k IN i..j-1 LOOP body:=array_append(body,l[k]); END LOOP;
    runs:=array_append(runs,array_to_string(body,E'\n')); i:=j;
   ELSE
    IF j<b THEN top:=top+1; st[top*3-2]:=j; st[top*3-1]:=b; st[top*3]:=d; b:=j; END IF;
    d:=d+1;
    -- A quote of one line that is itself a quote ('>>>>') loses its marks here, one level at a time, as above.
    WHILE i+1=b AND left(ltrim(l[i],' '),1)='>' LOOP
     m:=regexp_match(l[i],quote); EXIT WHEN m IS NULL;
     l[i]:=m[1];
     IF d>=4 THEN runs:=array_append(runs,l[i]); i:=b; EXIT; END IF;
     d:=d+1;
    END LOOP;
   END IF;
  ELSIF k=5 THEN
   -- A list: an item, the indented lines under it, a blank line before the next; a top-level item of the other kind
   -- (a number after bullets) starts a new list.
   ordered:=(regexp_match(l[i],item))[3] IS NOT NULL; body:='{}';
   LOOP
    EXIT WHEN i>=b; m:=regexp_match(l[i],item);
    IF m IS NOT NULL THEN
     EXIT WHEN length(replace(m[1],E'\t','  '))<2 AND (m[3] IS NOT NULL)<>ordered;
     IF cardinality(body)>0 THEN runs:=array_append(runs,array_to_string(body,E'\n')); END IF;
     body:=ARRAY[m[4]];
    ELSIF cardinality(body)>0 AND l[i] ~ ('^'||ws||'{2,}') AND l[i] !~ blank THEN
     body:=array_append(body,regexp_replace(l[i],'^'||ws||'+|'||ws||'+$','','g'));
    ELSIF l[i] !~ blank OR i+1>=b OR l[i+1] !~ item THEN EXIT;
    END IF;
    i:=i+1;
   END LOOP;
   runs:=array_append(runs,array_to_string(body,E'\n'));
  ELSIF strpos(l[i],'|')>0 AND i+1<b AND strpos(l[i+1],'|')>0 AND l[i+1] ~ tab THEN
   body:=sophia.markdown_cells(l[i]); cols:=cardinality(body); runs:=array_append(runs,array_to_string(body,chr(1))); i:=i+2;
   WHILE i<b AND strpos(l[i],'|')>0 LOOP
    -- A row with no backtick or backslash splits on every '|' (markdown_cells reads the others).
    IF strpos(l[i],'`')=0 AND strpos(l[i],'\')=0 THEN
     body:=string_to_array(regexp_replace(regexp_replace(l[i],'^'||ws||'+|'||ws||'+$','','g'),'^\||\|$','','g'),'|');
    ELSE body:=sophia.markdown_cells(l[i]);
    END IF;
    runs:=array_append(runs,array_to_string(body[1:cols],chr(1))); i:=i+1;
   END LOOP;
  ELSE
   -- A paragraph: its lines up to a blank one, one that starts a block, or one over a table's delimiter row.
   body:=ARRAY[l[i]]; i:=i+1;
   WHILE i<b LOOP
    line:=l[i]; f:=left(ltrim(line,' '),1); fw:=f<>'' AND strpos(wsc,f)>0;
    EXIT WHEN f='' OR (fw AND line ~ blank) OR ((strpos(marks,f)>0 OR fw)
      AND CASE WHEN strpos(line,chr(8232))>0 OR strpos(line,chr(8233))>0 THEN line ~ rule OR line ~ quote OR line ~ item
        OR line ~ '^ {0,3}(`{3,}|~{3,})' OR coalesce(regexp_replace((regexp_match(line,head))[1],ws||'*#*'||ws||'*$','') !~ '[\u2028\u2029]',false)
       ELSE line ~ starts END)
     OR (strpos(line,'|')>0 AND i+1<b AND strpos(l[i+1],'|')>0 AND l[i+1] ~ tab);
    body:=array_append(body,l[i]); i:=i+1;
   END LOOP;
   runs:=array_append(runs,array_to_string(body,E'\n'));
  END IF;
 END LOOP;
 RETURN array_to_string(runs,chr(1));
END $$;
REVOKE ALL ON FUNCTION sophia.markdown_runs(text) FROM PUBLIC;

-- Whether the report's parser opens an address (safeHref: the URL standard's parse, http, https or mailto): trimmed, a
-- scheme of those, and for http and https a host the standard accepts: not empty, no space (nor one its international
-- form makes of U+00A0 and the like), no '<', '%' or other forbidden mark once '%XX' is decoded, encoded bytes that
-- spell UTF-8, an IPv4 address when its last label is a number, and a numeric port up to 65535; for mailto, the same
-- of an authority after '//' (a space or a forbidden mark refused), else anything. A host the standard refuses only
-- for the rest of its international form (a letter it disallows, a label that is no valid punycode) is accepted.
CREATE FUNCTION sophia.markdown_href(p_raw text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE ws constant text:='[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]';
 s text; m text[]; special boolean; host text; port text; parts text[]; part text; v numeric; k integer;
BEGIN
 s:=translate(regexp_replace(regexp_replace(coalesce(p_raw,''),'^'||ws||'+|'||ws||'+$','','g'),
  '^[\u0001-\u0020]+|[\u0001-\u0020]+$','','g'),E'\t\n\r','');
 m:=regexp_match(s,'^([A-Za-z][A-Za-z0-9+.-]*):(.*)$');
 special:=lower(m[1]) IN ('http','https');
 IF m IS NULL OR NOT (special OR lower(m[1])='mailto') THEN RETURN false; END IF;
 IF NOT special AND m[2] !~ '^//' THEN RETURN true; END IF;
 host:=CASE WHEN special THEN substring(m[2] FROM '^[/\\]*([^/\\?#]*)') ELSE substring(m[2] FROM '^//([^/?#]*)') END;
 IF host ~ '@' THEN host:=regexp_replace(host,'^.*@',''); IF host='' THEN RETURN false; END IF; END IF;
 IF host ~ '^\[' THEN
  m:=regexp_match(host,'^\[([0-9A-Fa-f:.]*)\](?::(.*))?$');
  IF m IS NULL OR m[1] !~ ':' THEN RETURN false; END IF;
  port:=m[2]; host:='';
 ELSE
  port:=substring(host FROM ':(.*)$'); host:=regexp_replace(host,':.*$','');
  IF host='' AND (special OR port IS NOT NULL) THEN RETURN false; END IF;
 END IF;
 IF port !~ '^[0-9]*$' OR (port<>'' AND port::numeric>65535) THEN RETURN false; END IF;
 IF NOT special THEN RETURN host !~ '[\u0001-\u0020#/:<>?@\[\\\]^|]'; END IF;
 IF host ~ '%(?![0-9A-Fa-f]{2})' THEN RETURN false; END IF;
 FOR m IN SELECT regexp_matches(host,'%([0-7][0-9A-Fa-f])','g') LOOP
  IF chr(('x'||m[1])::bit(8)::integer) ~ '[\u0001-\u0020#%/:<>?@\[\\\]^|\u007f]' THEN RETURN false; END IF;
 END LOOP;
 IF host ~ '[\u0001-\u0020#/:<>?@\[\\\]^|\u007f\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]' THEN RETURN false; END IF;
 -- What the host's international form drops (a byte order mark, a soft hyphen, a zero-width space) leaves no host;
 -- bytes past ASCII written as '%XX' must spell UTF-8.
 host:=translate(host,chr(65279)||chr(173)||chr(8203),'');
 IF host='' THEN RETURN false; END IF;
 FOR m IN SELECT regexp_matches(upper(host),'((?:%[0-9A-F]{2})+)','g') LOOP
  IF replace(m[1],'%','') !~ '^([0-7][0-9A-F]|[CD][0-9A-F][89AB][0-9A-F]|E[0-9A-F]([89AB][0-9A-F]){2}|F[0-4][0-9A-F]([89AB][0-9A-F]){3})*$' THEN
   RETURN false; END IF;
 END LOOP;
 -- A last label that is a number makes the host (its ASCII '%XX' decoded) an IPv4 address: at most four numbers
 -- (decimal, 0x hex or 0 octal), each below 256 but the last, which fills what is left.
 FOR m IN SELECT regexp_matches(host,'%([0-7][0-9A-Fa-f])','g') LOOP
  host:=replace(host,'%'||m[1],chr(('x'||m[1])::bit(8)::integer)); END LOOP;
 parts:=string_to_array(host,'.');
 IF cardinality(parts)>1 AND parts[cardinality(parts)]='' THEN parts:=parts[1:cardinality(parts)-1]; END IF;
 IF parts[cardinality(parts)] !~ '^([0-9]+|0[xX][0-9A-Fa-f]*)$' THEN RETURN true; END IF;
 IF cardinality(parts)>4 THEN RETURN false; END IF;
 FOR k IN 1..cardinality(parts) LOOP
  part:=parts[k];
  IF part ~ '^0[xX][0-9A-Fa-f]*$' THEN
   v:=0; FOREACH s IN ARRAY string_to_array(lower(substr(part,3)),NULL) LOOP v:=v*16+strpos('0123456789abcdef',s)-1; END LOOP;
  ELSIF part ~ '^0[0-7]+$' THEN
   v:=0; FOREACH s IN ARRAY string_to_array(substr(part,2),NULL) LOOP v:=v*8+s::integer; END LOOP;
  ELSIF part ~ '^[0-9]+$' AND part !~ '^0[0-9]' THEN v:=part::numeric;
  ELSE RETURN false; END IF;
  IF (k<cardinality(parts) AND v>255) OR (k=cardinality(parts) AND v>=256^(5-cardinality(parts))) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION sophia.markdown_href(text) FROM PUBLIC;

-- The text of inline runs (markdown_runs) as the report's parser reads it for citations (inlines, in one pass from left
-- to right, at each place the construct it would take there): an escape is its character; a code span, an image and
-- an autolink (to an address markdown_href accepts, with no '<' inside) are nothing; an emphasis is its text; a link
-- to a source or a ref to one ([1](<id>), [1](source: <id> "t")) is its label (unless that only numbers it) and the
-- id; any other link is its label, and its brackets and target as written when the label holds a link. Labels,
-- emphasis and targets close where the parser closes them (labels and targets balanced, escapes and code spans
-- skipped in labels and emphasis, not in targets), what each finds remembered per run or label as the parser does,
-- so a run costs its length; past eight levels of emphasis and labels, all is text. What is left names a source where
-- the report numbers it, the pieces the parser reads apart separated by a space. An underscore opens no emphasis after
-- a letter or a digit, '[[:alnum:]]' here where the parser has '\p{L}\p{N}' (a superscript digit differs); and an
-- autolink holds no '<', as in CommonMark, so '<https://a/<id>>' cites the id.
CREATE FUNCTION sophia.markdown_inline_text(p_runs text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE ws constant text:='[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]';
 uuid constant text:='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
 ref constant text:='(?:(?:search|link|input|source):'||ws||'*)?('||uuid||')(?:#[0-9]{1,4})?';
 wsc constant text:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||' '||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)
  ||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)
  ||chr(12288)||chr(65279);
 c text[]:=string_to_array(coalesce(p_runs,''),NULL); n integer:=cardinality(c); out text[]:='{}';
 tick integer[]; lt integer[]; gt integer[]; par integer[]; lab integer[]; em integer[]; walked integer[]; opens integer[];
 bytes bytea; boff integer[];
 i integer:=1; a integer:=1; b integer; depth integer:=0; sid integer:=1; sids integer:=1; seen boolean:=false;
 top integer:=0; st integer[]:='{}'; st_seen boolean[]:='{}'; st_id text[]:='{}';
 ch text; dl integer; k integer; nk integer; j integer; e integer; o integer; cl integer; key integer; found integer;
 first boolean; tg text; lb text; m text[]; kind integer;
BEGIN
 IF n=0 THEN RETURN ''; END IF;
 b:=1; WHILE b<=n AND c[b]<>chr(1) LOOP b:=b+1; END LOOP;
 LOOP
  IF i>=b THEN
   IF top=0 THEN
    out:=array_append(out,' '); EXIT WHEN b>n;
    i:=b+1; a:=i; b:=i; WHILE b<=n AND c[b]<>chr(1) LOOP b:=b+1; END LOOP; depth:=0; sids:=sids+1; sid:=sids; seen:=false;
    CONTINUE;
   END IF;
   -- A label or an emphasis ends: what the link adds after it, then the scan it was read from goes on.
   kind:=st[top*8-7];
   IF kind=2 THEN out:=array_append(out,' '||st_id[top]||' ');
   ELSIF kind=3 AND seen THEN
    out:=array_append(out,' '||convert_from(substring(bytes FROM boff[st[top*8-1]] FOR boff[st[top*8]+1]-boff[st[top*8-1]]),'UTF8')||' ');
   END IF;
   seen:=st_seen[top] OR seen OR kind=3;
   i:=st[top*8-6]; a:=st[top*8-5]; b:=st[top*8-4]; depth:=st[top*8-3]; sid:=st[top*8-2]; top:=top-1;
   out:=array_append(out,' '); CONTINUE;
  END IF;
  ch:=c[i]; kind:=0;
  IF strpos(E'\\\n`<*_[!',ch)=0 OR (depth>=8 AND ch NOT IN ('\',E'\n')) THEN out:=array_append(out,ch); i:=i+1; CONTINUE; END IF;
  IF ch='\' THEN
   out:=array_append(out,CASE WHEN i+1<b THEN c[i+1] ELSE ch END); i:=i+CASE WHEN i+1<b THEN 2 ELSE 1 END; CONTINUE;
  END IF;
  IF ch=E'\n' THEN out:=array_append(out,' '); i:=i+1; CONTINUE; END IF;
  IF tick IS NULL THEN
   -- What the scan looks up, once a run needs it (each table only if the text has its marks): the next '`', and the
   -- next '<' and '>', after each place; the ')' that closes each '(' on its line; and where each character starts
   -- in the text's bytes, which a label, a target or an address is read from.
   tick:=array_fill(0,ARRAY[n]); lt:=array_fill(0,ARRAY[n]); gt:=array_fill(0,ARRAY[n]); par:=array_fill(0,ARRAY[n]);
   bytes:=convert_to(p_runs,'UTF8'); boff:=array_fill(0,ARRAY[n+1]); boff[n+1]:=octet_length(bytes)+1;
   IF strpos(p_runs,'`')>0 THEN
    j:=0; FOR o IN REVERSE n..1 LOOP tick[o]:=j; IF c[o]='`' THEN j:=o; END IF; END LOOP;
   END IF;
   IF strpos(p_runs,'<')>0 AND strpos(p_runs,'>')>0 THEN
    k:=0; e:=0;
    FOR o IN REVERSE n..1 LOOP lt[o]:=k; gt[o]:=e; IF c[o]='<' THEN k:=o; ELSIF c[o]='>' THEN e:=o; END IF; END LOOP;
   END IF;
   IF strpos(p_runs,'](')>0 THEN
    j:=0; opens:='{}';
    FOR o IN 1..n LOOP
     IF c[o]='(' THEN j:=j+1; opens[j]:=o;
     ELSIF c[o]=')' THEN IF j>0 THEN par[opens[j]]:=o; j:=j-1; END IF;
     ELSIF c[o]=E'\n' OR c[o]=chr(1) THEN j:=0;
     END IF;
    END LOOP;
   END IF;
   IF strpos(p_runs,'](')>0 OR (strpos(p_runs,'<')>0 AND strpos(p_runs,'>')>0) THEN
    FOR o IN REVERSE n..1 LOOP boff[o]:=boff[o+1]-octet_length(c[o]); END LOOP;
   END IF;
  END IF;
  IF ch='`' THEN
   IF tick[i]>0 AND tick[i]<b THEN out:=array_append(out,' '); i:=tick[i]+1; CONTINUE; END IF;
  ELSIF ch='<' THEN
   j:=CASE WHEN lt[i]>0 AND lt[i]<b THEN lt[i] ELSE b END; k:=gt[i];
   IF k>0 AND k<j AND sophia.markdown_href(convert_from(substring(bytes FROM boff[i+1] FOR boff[k]-boff[i+1]),'UTF8')) THEN
    out:=array_append(out,' '); seen:=true; i:=k+1; CONTINUE;
   END IF;
  ELSIF ch IN ('*','_') THEN
   -- An emphasis: not an underscore inside a word, not before a space, closed where the parser closes it (past code
   -- spans, escapes and, for one mark, doubled ones), each walk's end remembered for every place it passed.
   dl:=CASE WHEN i+1<b AND c[i+1]=ch THEN 2 ELSE 1 END; o:=i+dl; found:=-1;
   IF NOT (ch='_' AND i>a AND c[i-1] ~ '[[:alnum:]]') AND o<b AND strpos(wsc,c[o])=0 THEN
    IF em IS NULL THEN em:=array_fill(0,ARRAY[8*n]); END IF;
    key:=(CASE ch WHEN '*' THEN 0 ELSE 2 END+dl-1)*2*n; k:=o; first:=true; walked:='{}';
    WHILE k<b LOOP
     IF NOT first AND em[key+2*k]=sid THEN found:=em[key+2*k-1]; EXIT; END IF;
     IF c[k]='`' THEN nk:=CASE WHEN tick[k]>0 AND tick[k]<b THEN tick[k]+1 ELSE -1 END;
     ELSIF c[k]='\' THEN nk:=k+2;
     ELSIF dl=1 AND c[k]=ch AND k+1<b AND c[k+1]=ch THEN nk:=k+2;
     ELSIF c[k]=ch AND (dl=1 OR (k+1<b AND c[k+1]=ch)) THEN nk:=k;
     ELSE nk:=k+1; END IF;
     IF first THEN
      first:=false; EXIT WHEN nk<0; k:=CASE WHEN nk=k THEN k+1 ELSE nk END; CONTINUE;
     END IF;
     walked:=array_append(walked,k);
     IF nk=k THEN found:=k; END IF;
     EXIT WHEN nk<=k;
     k:=nk;
    END LOOP;
    FOREACH j IN ARRAY walked LOOP em[key+2*j-1]:=found; em[key+2*j]:=sid; END LOOP;
   END IF;
   IF found>=0 THEN kind:=1; e:=found+dl-1; cl:=found; o:=i+dl-1; END IF;
  ELSIF ch='[' OR (i+1<b AND c[i+1]='[') THEN
   -- A link or an image: its label's ']' (brackets balanced, escapes and code spans skipped, never past a blank
   -- line; what one walk finds for every '[' it passes is remembered), then '(' and the ')' that closes it.
   o:=CASE WHEN ch='!' THEN i+1 ELSE i END;
   IF lab IS NULL THEN lab:=array_fill(0,ARRAY[2*n]); END IF;
   IF lab[2*o]<>sid THEN
    opens:=ARRAY[o]; j:=1; k:=o+1;
    WHILE k<b AND j>0 LOOP
     EXIT WHEN c[k]=E'\n' AND k+1<b AND c[k+1]=E'\n';
     IF c[k]='[' THEN j:=j+1; opens[j]:=k;
     ELSIF c[k]=']' THEN lab[2*opens[j]-1]:=k; lab[2*opens[j]]:=sid; j:=j-1;
     ELSIF c[k]='\' THEN k:=k+1;
     ELSIF c[k]='`' AND tick[k]>0 AND tick[k]<b THEN k:=tick[k];
     END IF;
     k:=k+1;
    END LOOP;
    FOR k IN 1..j LOOP lab[2*opens[k]-1]:=-1; lab[2*opens[k]]:=sid; END LOOP;
   END IF;
   cl:=lab[2*o-1]; e:=CASE WHEN cl>0 AND cl+1<b AND c[cl+1]='(' THEN par[cl+1] ELSE 0 END;
   IF e>0 AND e<b THEN
    IF ch='!' THEN out:=array_append(out,' '); i:=e+1; CONTINUE; END IF;
    tg:=regexp_replace(convert_from(substring(bytes FROM boff[cl+2] FOR boff[e]-boff[cl+2]),'UTF8'),'^'||ws||'+|'||ws||'+$','','g');
    lb:=convert_from(substring(bytes FROM boff[o+1] FOR boff[cl]-boff[o+1]),'UTF8');
    m:=regexp_match(tg,'^<?'||ref||'>?(?:'||ws||'.*)?$','i');
    IF m IS NOT NULL AND (lb ~ ('^'||ws||'*\[?\^?[0-9]{0,4}\]?'||ws||'*$')
      OR lb ~* ('^'||ws||'*<?'||ws||'*'||ref||ws||'*>?'||ws||'*$')) THEN
     out:=array_append(out,' '||m[1]||' '); i:=e+1; CONTINUE;
    END IF;
    kind:=CASE WHEN m IS NOT NULL THEN 2 WHEN sophia.markdown_href(substring(tg FROM '^[^\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*')) THEN 3 ELSE 4 END;
   END IF;
  END IF;
  IF kind>0 THEN
   -- Read the label or the emphasis (o+1 to cl) one level deeper, then go on after e.
   top:=top+1;
   st[top*8-7]:=kind; st[top*8-6]:=e+1; st[top*8-5]:=a; st[top*8-4]:=b; st[top*8-3]:=depth; st[top*8-2]:=sid;
   st[top*8-1]:=cl; st[top*8]:=e; st_seen[top]:=seen; st_id[top]:=m[1];
   out:=array_append(out,' '); a:=o+1; b:=cl; i:=a; depth:=depth+1; sids:=sids+1; sid:=sids; seen:=false;
   CONTINUE;
  END IF;
  out:=array_append(out,ch); i:=i+1;
 END LOOP;
 RETURN array_to_string(out,'');
END $$;
REVOKE ALL ON FUNCTION sophia.markdown_inline_text(text) FROM PUBLIC;

CREATE FUNCTION sophia.markdown_citing_text(p_text text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT sophia.markdown_inline_text(sophia.markdown_runs(p_text)) $$;
REVOKE ALL ON FUNCTION sophia.markdown_citing_text(text) FROM PUBLIC;

-- The citations of a submitted result, and every source its current draft names where the report numbers it
-- (markdown_citing_text) that the task may cite (CX-0019): research_readable admits it (an input, the base, a capture
-- of its allowance), and it is not the task's own question, manifest or a draft of this attempt. The model's list comes
-- first, as it came (research_publish still checks it); the draft's ids follow, read as the parser reads a ref (a
-- prefix, the id, then '#' and up to four digits, so in '<id>#12<id2>' the second id is not one), lower case, in order
-- of first appearance, up to 200 distinct in all. A stale or missing draft, or citations that are not a list, add
-- nothing (research_publish refuses them).
CREATE FUNCTION sophia.research_draft_citations(s sophia.research_scope, p_result jsonb) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 WITH d AS (SELECT r.source_id, r.sha256 FROM sophia.research_drafts r WHERE r.project_id=s.project_id AND r.attempt_id=s.attempt_id
   ORDER BY r.seq DESC LIMIT 1),
  current AS (SELECT t.body FROM d JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=d.source_id
   WHERE d.sha256=p_result->>'draftSha256' AND jsonb_typeof(p_result->'citations')='array'),
  listed AS (SELECT lower(c) AS id FROM current, jsonb_array_elements_text(p_result->'citations') c),
  named AS (SELECT lower(x.m[1]) AS id, min(x.o) AS first FROM current,
    regexp_matches(sophia.markdown_citing_text(current.body),'(?:(?:search|link|input|source):[\t\n\v\f\r \u00a0\u1680\u2000-\u200a'
     ||'\u2028\u2029\u202f\u205f\u3000\ufeff]*)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:#[0-9]{1,4})?','gi')
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
