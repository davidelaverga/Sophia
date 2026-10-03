-- SMC-M03 (PR #32; CC-0019's two deferred items): section facts that count each section once, and a truth gate that
-- reads the conclusion and the recommendations apart.
-- * section_facts (0027) paired old and new sections on the anchor alone, so a heading that repeats ('### Pros' under
--   each option) was paired with every section of that name: one edit read as several revisions, and identical texts
--   as revised. Now a section pairs with at most one: the section at the same heading path (its parent headings'
--   anchors, by level, and its own) and occurrence on that path; then, among the sections left, by anchor in order (a
--   renamed title or parent keeps its children). The stored shape is unchanged (ReportSections, five keys): each list
--   names sections by their headings as before, a repeated heading once per section, and conclusionChanged still says
--   that a conclusion or a recommendation section changed.
-- * note_problems (0027) called "conclusion unchanged" a contradiction whenever either kind changed, and its pattern
--   crossed clauses. Now a note contradicts the facts about the conclusion only if a conclusion section changed, and
--   about the recommendations (a new problem) only if a recommendation section changed, each read within its own
--   clause. "No changes to X", "nothing changed in X" and "nothing changed except X" are not "nothing changed". A kept
--   note naming a removed heading contradicts the facts only when no section of that name remains. Problems are
--   distinct and at most 20, as the submission contract allows.
-- 0001-0035 are not edited. section_facts and note_problems are replaced with the same signatures; their callers
-- (research_publish 0027, research_rendition_settled 0034) resolve them at call time and are not replaced.
BEGIN;

-- A heading's anchor, as markdown_sections (0027) computes it: lower case, punctuation dropped, spaces as hyphens.
CREATE FUNCTION sophia.heading_anchor(p_heading text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT btrim(regexp_replace(regexp_replace(lower(p_heading),'[^[:alnum:][:space:]-]','','g'),'\s+','-','g'),'-') $$;
REVOKE ALL ON FUNCTION sophia.heading_anchor(text) FROM PUBLIC;

-- A Markdown text as sections, split exactly as markdown_sections (0027) splits it, each with its heading path: '' for
-- the text before the first heading, else '/' and the anchors of the headings it sits under (by level) and its own.
CREATE FUNCTION sophia.markdown_outline(p_text text)
RETURNS TABLE(ord integer, anchor text, heading text, body_hash text, path text)
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE line text; fenced boolean:=false; cur_heading text:=NULL; cur_anchor text:=''; cur_path text:=''; cur_body text:='';
 n integer:=0; m text[]; levels integer[]:='{}'; anchors text[]:='{}'; k integer;
BEGIN
 FOREACH line IN ARRAY regexp_split_to_array(coalesce(p_text,''),E'\r?\n') LOOP
  IF line ~ '^\s{0,3}(```|~~~)' THEN fenced:=NOT fenced; END IF;
  m:=CASE WHEN fenced THEN NULL ELSE regexp_match(line,'^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$') END;
  IF m IS NOT NULL AND btrim(m[2])<>'' THEN
   IF cur_heading IS NOT NULL OR btrim(cur_body)<>'' THEN
    ord:=n; anchor:=cur_anchor; heading:=cur_heading; path:=cur_path;
    body_hash:=encode(sha256(convert_to(btrim(regexp_replace(cur_body,'\s+',' ','g')),'UTF8')),'hex');
    RETURN NEXT; n:=n+1;
   END IF;
   cur_heading:=btrim(m[2]); cur_body:='';
   cur_anchor:=sophia.heading_anchor(cur_heading);
   k:=cardinality(levels);
   WHILE k>0 AND levels[k]>=length(m[1]) LOOP k:=k-1; END LOOP;
   levels:=levels[1:k]||length(m[1]); anchors:=anchors[1:k]||cur_anchor;
   cur_path:='/'||array_to_string(anchors,'/');
  ELSE
   cur_body:=cur_body||line||E'\n';
  END IF;
 END LOOP;
 IF cur_heading IS NOT NULL OR btrim(cur_body)<>'' THEN
  ord:=n; anchor:=cur_anchor; heading:=cur_heading; path:=cur_path;
  body_hash:=encode(sha256(convert_to(btrim(regexp_replace(cur_body,'\s+',' ','g')),'UTF8')),'hex');
  RETURN NEXT;
 END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.markdown_outline(text) FROM PUBLIC;

-- section_facts (0027), replaced: the same five keys and names, each section paired at most once (see the header).
CREATE OR REPLACE FUNCTION sophia.section_facts(p_old text, p_new text) RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 WITH o AS (SELECT s.*, row_number() OVER (PARTITION BY s.path ORDER BY s.ord) AS occ
    FROM sophia.markdown_outline(p_old) s WHERE p_old IS NOT NULL),
  n AS (SELECT s.*, row_number() OVER (PARTITION BY s.path ORDER BY s.ord) AS occ FROM sophia.markdown_outline(p_new) s),
  exact AS (SELECT n.ord AS n_ord, o.ord AS o_ord FROM n JOIN o ON o.path=n.path AND o.occ=n.occ),
  rest_n AS (SELECT n.ord, n.heading IS NULL AS intro, n.anchor,
    row_number() OVER (PARTITION BY n.heading IS NULL, n.anchor ORDER BY n.ord) AS r
   FROM n WHERE NOT EXISTS(SELECT 1 FROM exact e WHERE e.n_ord=n.ord)),
  rest_o AS (SELECT o.ord, o.heading IS NULL AS intro, o.anchor,
    row_number() OVER (PARTITION BY o.heading IS NULL, o.anchor ORDER BY o.ord) AS r
   FROM o WHERE NOT EXISTS(SELECT 1 FROM exact e WHERE e.o_ord=o.ord)),
  matched AS (SELECT n_ord, o_ord FROM exact UNION ALL
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

-- Whether a note says that the section a noun names did not change. Either the noun (or "the noun and the other"),
-- not after "except (for)", "besides", "other than" or "apart/aside from", then within the same clause, before the
-- other noun and before any contrast or change word, "unchanged", "the same", "did not change" or "stays"; a colon or a
-- dash may follow the noun directly. Or "unchanged", "same", "no change(s) to/in" or "nothing changed in/to/about"
-- right before the noun. Clauses end at . ; , : ! ? a dash or a line break.
CREATE FUNCTION sophia.note_keeps(p_note text, p_noun text, p_other text) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT lower(coalesce(p_note,'')) ~ ('(?<!\m(except(\s+for)?|besides|other\s+than|apart\s+from|aside\s+from)\s+(the\s+)?)\m'||p_noun||'\M'
   ||'(\s+(and|&)\s+(the\s+)?'||p_other||'\M)?(\s*[:–—])?'
   ||'((?!'||p_other||'|\m(but|while|whereas|though|although|yet|except|now|new|changed|revised|updated|expanded|extended|'
   ||'added|rewritten|reworked|reworded|refined|tightened|shortened|trimmed|dropped|removed|replaced|corrected|moved)\M)'
   ||'[^.;,:!?\n–—]){0,40}?\m(unchanged|the same|did not change|stays?)\M')
  OR lower(coalesce(p_note,'')) ~ ('(\m(unchanged|same)(\s*:)?|\mno changes?\s+(to|in)|\mnothing changed\s+(in|to|about))\s+'
   ||'(the\s+)?'||p_noun||'\M') $$;
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
 IF changed>0 AND lower(coalesce(p_change,'')) ~ ('(\mno changes?\M|\mnothing changed\M)'
   ||'(?!,?\s+(to|in|about|except|but|save|apart|aside|besides|beyond|other|outside)\M)|^\s*unchanged\s*\.?\s*$') THEN
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

COMMIT;
