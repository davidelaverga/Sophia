-- SMC-M03 (PR #32; CX-0026, CX-0027): an amendment edits its report instead of replacing it, and its notes account for
-- every section it removed.
-- * The truth gate (CX-0026 #1). note_problems (0036) read "nothing changed", the conclusion, the recommendations and a
--   kept note naming a removed heading in full, so "the remainder of the report is unchanged" was published beside
--   facts that showed seven sections gone. Its rules stay, as amendment_note_problems' first part, which then reads
--   the sections removed (no section of the same anchor remains), a renamed one aside: the only outermost heading on
--   each side under another anchor (research_publish passes it in), or one that shares a key word with an added
--   heading ("Recommendations for buyers", "Revised recommendations").
--   - A removed section that either note calls kept or unchanged ("is retained", "was not removed", "is still
--     there"), by a key word of its own (one no remaining heading has), gets one sentence each: for the kept note in
--     0036's words, for the change note in its own; unless a piece saying it went names it too ("Removed the table,
--     keeping the comparison in prose").
--   - Every other removed section must be disclosed by a piece that does not say "kept": its heading or a key word
--     of its own; a word it shares with a remaining heading only where the piece says something went and names no
--     other removed section ("removed the battery chemistry" says nothing of "Battery costs"); a wholesale removal
--     ("removed the other sections", "everything else was dropped", "rewrote the whole report", "a
--     recommendations-only version", "only the title is kept"), never one negated ("none of the other sections were
--     removed") or of one section ("removed the old recommendations"); or a count ("6 sections removed") that covers
--     it. Otherwise one sentence names them.
--   - For an amendment whose base the task can still read, a section called kept or left quiet adds a last sentence:
--     the draft replaced the whole report, and where to restore the sections from.
--   Revisions never contradict "the rest is unchanged": the facts carry no heading paths, so a revised subsection of
--   a section the note names cannot be told from a change the note hides (0036's rules still judge the conclusion and
--   the recommendations). The rules read English: notes in another language pass as they did. Every problem is at
--   most 300 characters, distinct after that cut, and at most 20 (the submission contract: a longer one fails the
--   runtime's check after the task's one refusal is spent). The notes are read once, and the removed sections set-wise,
--   so a call costs the length of its facts.
-- * template_notes keeps whole headings within its 200 characters, the removed first, then the added, then the
--   revised, and counts what does not fit (", … and 3 more"), where left(..., 200) cut the last heading in half.
-- * An amendment's draft starts as its base (CX-0026 #2). When its create is dispatched (an admitted or rebuilt task
--   whose manifest still has a base), the attempt's first draft is a copy of the base's text, so research_read_context
--   shows the report as the task's current draft: inside the runtime's closed contract, and still there after a
--   compaction. A copy, never the base's own source: source_closure follows a draft to its task's manifest, so the
--   base would then draw on this task's inputs (and the copy, through that manifest, draws on the base). The
--   create's text (research_task_statement; research_prompt, 0025, is unchanged) says what an update is: the draft is
--   the whole report, change only what is asked, name what is removed, the base is the document and not a source;
--   and, for a base longer than one draft call can carry under the route's output limit (20,000 characters), to
--   report a blocker instead of a shorter report.
-- * research_publish, replaced: the same, and a draft that is still the version it amends, unchanged, is refused
--   once, with the notes' problems under the same one refusal; an earlier draft of the attempt (the base's copy among
--   them) leaves the model's list of citations. A version may cite what its base cited from an input of its lineage
--   that this task was not given again, or an earlier version of the report (research_citable): in the submit's check
--   and in research_draft_citations, one line changed. Dropped citations stay facts, never a refusal: a source
--   replaced on purpose must publish. The base stays a cited source (CC-0019 #7).
-- * Every research task is asked to keep a length, a section list or a limit on searches or reads its question states,
--   and to say in its limitations where it could not. Asked, not enforced.
-- 0001-0036 are not edited. note_problems, template_notes, research_draft_citations, research_publish and
-- dispatch_runtime_outbox are replaced with the same signatures and grants; note_problems calls the new gate with no
-- context (removals are judged, nothing names a version to restore from).
BEGIN;

-- --- the truth gate ---------------------------------------------------------------------------------------------

-- A heading's or a note's key words: its English lexemes of three letters or more, without the words any section or
-- note may use ("report", "section", "updated", "removed", "the rest"...). Read from its first 200 characters, a note's
-- length, so a long heading costs no more and no word is too long to read.
CREATE FUNCTION sophia.note_words(p_text text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(array_agg(DISTINCT l.lexeme),'{}') FROM unnest(to_tsvector('english'::regconfig,left(coalesce(p_text,''),200))) l
  WHERE l.lexeme ~ '^[[:alpha:]][[:alnum:]-]{2,}$'
   AND l.lexeme <> ALL ('{report,section,text,content,document,version,draft,part,page,note,updat,revis,new,final,previous,prior,origin,current,main,overview,detail,key,chang,remov,drop,kept,keep,retain,unchang,rest,remaind,everyth,els}'::text[]) $$;
REVOKE ALL ON FUNCTION sophia.note_words(text) FROM PUBLIC;

-- A note as pieces, each with what it says of what it names: 'keep' (unchanged, retained, kept, the same, still there,
-- no changes to, not removed...), 'change' (revised, removed, new, except, other than...) or 'mixed'; and whether it
-- says that something went (removed, dropped, cut, merged, moved, without...). Clauses end at . ; ! ? a line break or a
-- dash, and pieces at a comma, and, but, while, yet... ("everything but X" and "all sections but X" read as except);
-- a piece that says neither takes the words of the piece before it in its clause, else of the one after
-- ("compatibility, charging and limitations are retained"), else its note's: a kept note says what was kept, a change
-- note what changed.
CREATE FUNCTION sophia.note_pieces(p_note text, p_kept boolean) RETURNS TABLE(body text, polarity text, gone boolean)
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE negated constant text:='\m(no\s+changes?(\s+(to|in))?|nothing\s+(else\s+)?changed|no\s+other\s+changes?|unchanged)\M'
  ||'|(\mnot|\mnever|n[''’]t)\s+(been\s+)?(changed?|altered|alter|edited|edit|modified|modify|touched|touch|affected|removed|remove'
  ||'|dropped|drop|deleted|delete|cut|omitted|omit|moved|move)\M'
  ||'|\m(no|none|nothing|neither)\M[^,:]{0,80}?\m(removed|dropped|deleted|cut|omitted|touched|lost)\M';
 keeps constant text:='\m(keep_|untouched|intact|retained|retain|retains|retaining|kept|keep|keeps|keeping|preserved|preserve|preserves|preserving|identical|unaltered|unmodified|same|stays?|stayed|remains?|remained|carried\s+over|as\s+before|as\s+it\s+was|as\s+is|as-is|verbatim|left\s+(alone|as)|still\s+(there|here|included|present|in\s+place|in\s+the\s+(report|text|document)))\M'
  ||'|\mleft\s+[^,;]{0,80}?\s+alone\M';
 changes constant text:='\m(revised|revise|revises|rewrote|rewritten|rewrite|rewrites|updated|update|updates|expanded|expands|extended|added|adds|new|changed|replaced|replace|replaces|removed|remove|removes|dropped|drop|drops|deleted|delete|deletes|cut|cuts|trimmed|shortened|condensed|merged|merge|combined|moved|folded|split|renamed|restructured|reorganized|reorganised|corrected|refined|tightened|reworked|reworded|edited|except|excluding|without|instead|omitted|omits|omit|gone|took\s+out|taken\s+out|left\s+out|other\s+than|besides|apart\s+from|aside\s+from|save)\M';
 went constant text:='\m(removed|remove|removes|dropped|drop|drops|deleted|delete|deletes|cut|cuts|merged|merge|combined|moved|folded|without|omitted|omits|omit|gone|took\s+out|taken\s+out|left\s+out)\M';
 clause text; parts text[]; says text[]; goes boolean[]; t text; k integer; last text; last_goes boolean;
BEGIN
 FOREACH clause IN ARRAY regexp_split_to_array(lower(coalesce(p_note,'')),'[.;!?\n]+|\s[-–—]+\s|[–—]') LOOP
  clause:=regexp_replace(clause,'\m(everything|anything|nothing|all|(all|every|each|the)\s+([[:alpha:]]+\s+)?(sections?|parts?|text|content|rest))\s+but\M',
   '\1 except','g');
  parts:=regexp_split_to_array(clause,',|\s+(and|but|while|whereas|though|although|yet|&)\s+');
  says:='{}'; goes:='{}';
  FOR k IN 1..cardinality(parts) LOOP
   t:=regexp_replace(parts[k],negated,' keep_ ','g');
   says:=says||CASE WHEN t ~ keeps AND t ~ changes THEN 'mixed' WHEN t ~ keeps THEN 'keep' WHEN t ~ changes THEN 'change' END;
   goes:=goes||CASE WHEN t ~ keeps OR t ~ changes THEN t ~ went END;
  END LOOP;
  last:=NULL; last_goes:=NULL;
  FOR k IN 1..cardinality(parts) LOOP
   IF says[k] IS NULL THEN says[k]:=last; goes[k]:=last_goes; END IF;
   last:=says[k]; last_goes:=goes[k];
  END LOOP;
  last:=NULL; last_goes:=NULL;
  FOR k IN REVERSE cardinality(parts)..1 LOOP
   IF says[k] IS NULL THEN says[k]:=last; goes[k]:=last_goes; END IF;
   last:=says[k]; last_goes:=goes[k];
  END LOOP;
  FOR k IN 1..cardinality(parts) LOOP
   CONTINUE WHEN btrim(parts[k])='';
   body:=parts[k]; polarity:=coalesce(says[k],CASE WHEN p_kept THEN 'keep' ELSE 'change' END); gone:=coalesce(goes[k],false);
   RETURN NEXT;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION sophia.note_pieces(text,boolean) FROM PUBLIC;

-- How many sections a piece of a note says were removed without naming them: all of them (1000000) for a wholesale
-- removal ("removed the other sections", "everything else was dropped", "the rest was cut", "rewrote the whole
-- report", "replaced the report with...", "a recommendations-only version", "only the title is kept", "nothing else
-- was kept"), else the largest count it gives ("6 sections removed", "dropped six sections"), else 0. What follows a
-- negation in the piece is not read ("none of the other sections were removed", "I did not cut the remaining
-- sections"), and a removal names the rest, never one section ("removed the old recommendations").
CREATE FUNCTION sophia.note_removes_all(p_piece text) RETURNS integer LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 WITH n AS (SELECT lower(coalesce(p_piece,'')) AS whole,
   regexp_replace(lower(coalesce(p_piece,'')),'(\m(no|none|not|never|nothing|neither|nor)\M|n[''’]t\M).*$','') AS t,
   '(?:removed|dropped|deleted|cut|omitted|merged|combined|folded|left\s+out|took\s+out|taken\s+out)' AS rm,
   '(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)' AS num,
   '(?:other\s+|earlier\s+|original\s+|remaining\s+)?sections?' AS sections)
 SELECT CASE
  WHEN whole ~ '\mnothing\s+(else\s+)?((was|is|has\s+been)\s+)?(kept|retained|left|preserved)\M|\m(nothing|none)\s+(else\s+)?(but|except|other\s+than|apart\s+from|besides)\M'
    OR t ~ ('\m'||rm||'\s+(all\s+)?(of\s+)?(the\s+)?(rest(\s+of\s+the\s+(report|text|document))?|(other|remaining|original|earlier|previous|old)\s+(sections?|parts?|text|content))\M(?!\s+(of|in|on|about|for)\M)')
    OR t ~ ('\m(all\s+)?(the\s+)?(other|remaining|original|earlier|previous|old)\s+(sections?|parts?|text|content)\s+((were|was|are|is|have\s+been|has\s+been)\s+)?'||rm||'\M')
    OR t ~ ('\m'||rm||'\s+everything\s+else\M|\meverything\s+else\s+((was|is|has\s+been)\s+)?'||rm||'\M')
    OR t ~ ('\m(the\s+)?(rest|remainder)\s+((of\s+the\s+(report|text|document)\s+)?(was|is|has\s+been)\s+)?'||rm||'\M')
    OR t ~ '\m(rewrote|rewritten|replaced|restructured|reorganized|reorganised|rebuilt|redid|redone)\s+(the\s+)?(whole|entire)\s+(report|document|text)\M'
    OR t ~ '\m(rewrote|rewritten|replaced)\s+(the\s+)?(report|document)\s+(as|with|into|by)\M'
    OR t ~ '\m[[:alpha:]]+(-|\s+)only\s+(version|report|edition|rewrite)\M'
    OR t ~ '\monly\s+(the\s+)?[[:alpha:]]+(\s+[[:alpha:]]+)?\s+((is|was|were|are|has\s+been|have\s+been)\s+)?(kept|retained|left|preserved)\M(?!\s+out\M)'
   THEN 1000000
  -- The number is the one group each count captures.
  ELSE coalesce((SELECT max(CASE x[1] WHEN 'one' THEN 1 WHEN 'two' THEN 2 WHEN 'three' THEN 3 WHEN 'four' THEN 4 WHEN 'five' THEN 5
     WHEN 'six' THEN 6 WHEN 'seven' THEN 7 WHEN 'eight' THEN 8 WHEN 'nine' THEN 9 WHEN 'ten' THEN 10 WHEN 'eleven' THEN 11
     WHEN 'twelve' THEN 12 ELSE least(x[1]::numeric,1000000)::integer END)
    FROM (SELECT regexp_matches(t,'\m'||num||'\s+'||sections||'\s+(?:(?:were|was|have\s+been|has\s+been)\s+)?'||rm||'\M','g') AS x
     UNION ALL SELECT regexp_matches(t,'\m'||rm||'\s+(?:the\s+)?'||num||'\s+'||sections||'\M','g')) m),0) END
 FROM n $$;
REVOKE ALL ON FUNCTION sophia.note_removes_all(text) FROM PUBLIC;

-- Whether the notes claim that the rest of the report was kept or that nothing else changed ("the rest", "everything
-- else", "all other sections", "otherwise", "only X changed", "no other changes"...): how a refusal says it.
CREATE FUNCTION sophia.note_blanket(p_change text, p_kept text) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT lower(coalesce(p_change,'')||E'.\n'||coalesce(p_kept,'')) ~ ('\m(the\s+)?(rest|remainder)\M|\meverything\M|\m(all|anything)\s+else\M'
  ||'|\m(all|every|each)\s+(of\s+)?(the\s+)?(other|remaining|original|existing)\M|\m(the\s+)?(other|remaining)\s+(sections?|parts?|text|content)\M'
  ||'|\m(whole|entire)\s+(report|text|document)\M|\motherwise\M|\mnothing\s+else\M|\mno\s+(other|further)\s+(changes?|edits?)\M'
  ||'|\m(only|solely|exclusively)\M|-only\M|\m(limited|confined|restricted)\s+to\M') $$;
REVOKE ALL ON FUNCTION sophia.note_blanket(text,text) FROM PUBLIC;

-- Headings, in order, within p_room characters: whole (a note's), or quoted and cut at 60 (a problem's, at most 8).
-- What does not fit is counted (", … and 3 more"); nothing when not even the first fits.
CREATE FUNCTION sophia.note_names(p_names text[], p_room integer, p_quoted boolean) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
DECLARE n integer:=coalesce(cardinality(p_names),0); shown text:=''; item text; more text; k integer:=0;
BEGIN
 FOR i IN 1..CASE WHEN p_quoted THEN least(n,8) ELSE n END LOOP
  item:=CASE WHEN NOT p_quoted THEN p_names[i] WHEN length(p_names[i])>60 THEN '"'||left(p_names[i],59)||'…"' ELSE '"'||p_names[i]||'"' END;
  more:=CASE WHEN i<n THEN ', … and '||(n-i)||' more' ELSE '' END;
  EXIT WHEN length(shown)+CASE WHEN i>1 THEN 2 ELSE 0 END+length(item)+length(more)>p_room;
  shown:=shown||CASE WHEN i>1 THEN ', ' ELSE '' END||item; k:=i;
 END LOOP;
 RETURN CASE WHEN k=0 THEN '' WHEN k=n THEN shown ELSE shown||', … and '||(n-k)||' more' END;
END $$;
REVOKE ALL ON FUNCTION sophia.note_names(text[],integer,boolean) FROM PUBLIC;

-- Where an amendment's notes contradict its facts, one distinct sentence each, at most 20 of at most 300 characters.
-- p_ctx (research_publish's): {"renamed": [the old outermost heading, when the outermost one was renamed], "disclose":
-- whether removals must be disclosed (false when the task cannot read its base: a rebuild that dropped a withdrawn
-- base, or a base withdrawn since), "baseVersion", "baseSourceId": the version the task amends, while it can read it}.
-- With '{}', removals are judged and nothing names a version to restore from.
CREATE FUNCTION sophia.amendment_note_problems(p_change text, p_kept text, p_facts jsonb, p_ctx jsonb) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE changed integer:=jsonb_array_length(p_facts->'added')+jsonb_array_length(p_facts->'revised')+jsonb_array_length(p_facts->'removed');
 notes text:=coalesce(p_change,'')||E'.\n'||coalesce(p_kept,''); kept text:=lower(coalesce(p_kept,'')); out text[]:='{}';
 conclusion boolean; recommendation boolean; h text; gone text[]; renamed text[]; called text[]; quiet text[]; covered integer;
 told_quiet boolean:=false; lead text; restore text;
BEGIN
 -- 0036's rules, as they were. Which kind changed: the anchors of the changed sections' headings, by section_facts'
 -- own rule.
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
 -- The removed sections: each removed heading once, in order, unless a section with that anchor remains (a repeated
 -- heading). A kept note naming one in full, as 0036 refused it.
 SELECT coalesce(array_agg(r.x ORDER BY r.i),'{}') INTO gone FROM (SELECT e.x, min(e.i) AS i
   FROM jsonb_array_elements_text(p_facts->'removed') WITH ORDINALITY e(x,i)
   WHERE sophia.heading_anchor(e.x) NOT IN (SELECT sophia.heading_anchor(y) FROM unnest(ARRAY['added','revised','unchanged']) k,
     jsonb_array_elements_text(p_facts->k) y)
   GROUP BY e.x) r;
 FOREACH h IN ARRAY gone LOOP
  IF length(h)>=4 AND strpos(kept,lower(h))>0 THEN
   out:=out||format('The kept note names "%s", which was removed.',h); END IF;
 END LOOP;

 IF cardinality(gone)>0 THEN
  SELECT coalesce(array_agg(x),'{}') INTO renamed FROM jsonb_array_elements_text(coalesce(p_ctx->'renamed','[]')) x;
  -- Each removed section 0036 has not named, as one renamed (positional, or a key word of its own shared with an added
  -- heading), one called kept or unchanged, one disclosed, or one left quiet. The notes are read once, as pieces with
  -- their key words and their text as words between single spaces (for a heading named in full, never across two).
  -- * A piece that says the section went discloses it by its heading or a key word of its own (one no remaining
  --   heading has), whatever else the notes call kept ("Removed the table, keeping the comparison in prose").
  -- * Otherwise a "kept" piece naming it by a key word of its own calls it kept, or unchanged (a "kept" piece of the
  --   change note naming it in full always does).
  -- * Otherwise a piece that does not say "kept" discloses it by its heading or a key word of its own, and a piece
  --   that says something went by a word it shares with a remaining heading, unless that piece names another removed
  --   section by a word of its own ("removed the battery chemistry section" says nothing of "Battery costs").
  WITH p AS MATERIALIZED (SELECT row_number() OVER () AS n, x.polarity, x.gone, x.of_kept, sophia.note_removes_all(x.body) AS removes,
     x.body, ' '||btrim(regexp_replace(x.body,'[^[:alnum:]]+',' ','g'))||' ' AS t
    FROM (SELECT y.*, true AS of_kept FROM sophia.note_pieces(p_kept,true) y
     UNION ALL SELECT y.*, false FROM sophia.note_pieces(p_change,false) y) x),
   pw AS MATERIALIZED (SELECT DISTINCT p.n, w FROM p, unnest(sophia.note_words(p.body)) w),
   texts AS (SELECT coalesce(string_agg(p.t,'|') FILTER (WHERE NOT p.of_kept AND p.polarity='keep'),'') AS unchanged,
     coalesce(string_agg(p.t,'|') FILTER (WHERE p.polarity<>'keep' AND p.gone),'') AS went,
     coalesce(string_agg(p.t,'|') FILTER (WHERE p.polarity<>'keep'),'') AS told, coalesce(max(p.removes),0) AS removes FROM p),
   g AS (SELECT u.h, u.i, btrim(regexp_replace(lower(left(u.h,200)),'[^[:alnum:]]+',' ','g')) AS t FROM unnest(gone) WITH ORDINALITY u(h,i)
     WHERE NOT (length(u.h)>=4 AND strpos(kept,lower(u.h))>0) AND u.h <> ALL (renamed)),
   remaining AS MATERIALIZED (SELECT DISTINCT w FROM unnest(ARRAY['revised','unchanged']) k, jsonb_array_elements_text(p_facts->k) y,
     unnest(sophia.note_words(y)) w),
   added AS MATERIALIZED (SELECT DISTINCT w FROM jsonb_array_elements_text(p_facts->'added') y, unnest(sophia.note_words(y)) w),
   words AS MATERIALIZED (SELECT g.i, x.w, r.w IS NULL AS own, a.w IS NOT NULL AS shared FROM g CROSS JOIN LATERAL unnest(sophia.note_words(g.h)) x(w)
     LEFT JOIN remaining r ON r.w=x.w LEFT JOIN added a ON a.w=x.w),
   claimed AS (SELECT DISTINCT p.n FROM words JOIN pw ON pw.w=words.w JOIN p ON p.n=pw.n WHERE words.own AND p.polarity<>'keep' AND p.gone),
   s AS (SELECT words.i, bool_or(words.own AND words.shared) AS renamed,
      coalesce(bool_or(words.own AND p.polarity<>'keep' AND p.gone),false) AS own_went,
      coalesce(bool_or(words.own AND p.of_kept AND p.polarity='keep'),false) AS own_kept,
      coalesce(bool_or(words.own AND NOT p.of_kept AND p.polarity='keep'),false) AS own_unchanged,
      coalesce(bool_or(words.own AND p.polarity<>'keep'),false) AS own_told,
      coalesce(bool_or(NOT words.own AND p.polarity<>'keep' AND p.gone AND c.n IS NULL),false) AS shared_went
     FROM words LEFT JOIN pw ON pw.w=words.w LEFT JOIN p ON p.n=pw.n LEFT JOIN claimed c ON c.n=p.n GROUP BY words.i),
   c AS (SELECT g.h, g.i, CASE
      WHEN s.renamed THEN 'renamed'
      WHEN g.t<>'' AND strpos(texts.unchanged,' '||g.t||' ')>0 THEN 'unchanged'
      WHEN s.own_went OR (g.t<>'' AND strpos(texts.went,' '||g.t||' ')>0) THEN 'disclosed'
      WHEN s.own_kept THEN 'kept'
      WHEN s.own_unchanged THEN 'unchanged'
      WHEN s.own_told OR s.shared_went OR (g.t<>'' AND strpos(texts.told,' '||g.t||' ')>0) THEN 'disclosed'
      ELSE 'quiet' END AS kind
    FROM g CROSS JOIN texts LEFT JOIN s ON s.i=g.i)
  SELECT coalesce(array_agg(format(CASE c.kind WHEN 'kept' THEN 'The kept note names "%s", which was removed.'
      ELSE 'The change note calls "%s" unchanged, but it was removed.' END,CASE WHEN length(c.h)>200 THEN left(c.h,199)||'…' ELSE c.h END)
     ORDER BY c.i) FILTER (WHERE c.kind IN ('kept','unchanged')),'{}'),
   coalesce(array_agg(c.h ORDER BY c.i) FILTER (WHERE c.kind='quiet'),'{}'), (SELECT texts.removes FROM texts)
   INTO called, quiet, covered FROM c;
  out:=out||called;
  -- The quiet ones, unless a wholesale removal or a count covers them.
  IF cardinality(quiet)>0 AND coalesce((p_ctx->>'disclose')::boolean,true) AND covered<cardinality(quiet) THEN
   lead:=CASE WHEN sophia.note_blanket(p_change,p_kept) THEN 'The notes say the rest of the report was kept, but ' ELSE 'The notes do not say that ' END
    ||CASE WHEN cardinality(quiet)=1 THEN '1 section was' ELSE cardinality(quiet)||' sections were' END||' removed: ';
   out:=out||(lead||sophia.note_names(quiet,299-length(lead),true)||'.');
   told_quiet:=true;
  END IF;
  -- Where the task can read its base, a section called kept or left quiet can be restored from it: said last, and
  -- always within the 20.
  IF (cardinality(called)>0 OR told_quiet) AND coalesce((p_ctx->>'disclose')::boolean,true) AND p_ctx->>'baseVersion' IS NOT NULL THEN
   restore:=left(format('research_write_draft replaces the whole report, so what your draft leaves out is deleted. If the request did not '
    ||'ask to remove these sections, restore them from version %s (sourceId %s) and submit again; if it did, name them in changeNote.',
    p_ctx->>'baseVersion',p_ctx->>'baseSourceId'),300);
  END IF;
 END IF;
 out:=coalesce((SELECT array_agg(d.x ORDER BY d.i) FROM (SELECT left(u.y,300) AS x, min(u.i) AS i FROM unnest(out) WITH ORDINALITY u(y,i)
   GROUP BY 1) d),'{}');
 RETURN CASE WHEN restore IS NULL THEN out[1:20] ELSE out[1:19]||restore END;
END $$;
REVOKE ALL ON FUNCTION sophia.amendment_note_problems(text,text,jsonb,jsonb) FROM PUBLIC;

-- note_problems (0036), replaced: the gate above with no context. Its grants stay (none).
CREATE OR REPLACE FUNCTION sophia.note_problems(p_change text, p_kept text, p_facts jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT sophia.amendment_note_problems(p_change,p_kept,p_facts,'{}') $$;

-- template_notes (0027), replaced: notes written from the facts, when the model's still contradicted them after its
-- repair, in 0027's form ("1 revised: X; 2 added: Y, Z; 1 removed: W.", "4 unchanged: ...") and each within 200
-- characters, but with whole headings: the counts first, then the removed headings, the added and the revised in the
-- room left, what does not fit counted (", … and 3 more").
CREATE OR REPLACE FUNCTION sophia.template_notes(p_facts jsonb) RETURNS TABLE(change_note text, retained_note text)
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE kinds constant text[]:=ARRAY['revised','added','removed']; heads text[]:='{}'; lists text[]:=ARRAY['','','']; names text[];
 room integer; k integer;
BEGIN
 FOR k IN 1..3 LOOP
  heads:=heads||CASE WHEN jsonb_array_length(p_facts->kinds[k])>0 THEN jsonb_array_length(p_facts->kinds[k])||' '||kinds[k] END;
 END LOOP;
 room:=199-coalesce(length(array_to_string(heads,'; ')),0);
 FOREACH k IN ARRAY ARRAY[3,2,1] LOOP
  CONTINUE WHEN heads[k] IS NULL;
  SELECT array_agg(x ORDER BY i) INTO names FROM jsonb_array_elements_text(p_facts->kinds[k]) WITH ORDINALITY e(x,i);
  lists[k]:=sophia.note_names(names,room-2,false);
  IF lists[k]<>'' THEN room:=room-2-length(lists[k]); END IF;
 END LOOP;
 change_note:=coalesce(nullif(array_to_string(ARRAY(SELECT heads[x]||CASE WHEN lists[x]<>'' THEN ': '||lists[x] ELSE '' END
   FROM generate_series(1,3) x WHERE heads[x] IS NOT NULL ORDER BY x),'; '),''),'No section changed')||'.';
 retained_note:=NULL;
 IF jsonb_array_length(p_facts->'unchanged')>0 THEN
  SELECT array_agg(x ORDER BY i) INTO names FROM jsonb_array_elements_text(p_facts->'unchanged') WITH ORDINALITY e(x,i);
  retained_note:=jsonb_array_length(p_facts->'unchanged')||' unchanged';
  retained_note:=retained_note||coalesce(': '||nullif(sophia.note_names(names,197-length(retained_note),false),''),'')||'.';
 END IF;
 RETURN NEXT;
END $$;

-- --- what a version may cite --------------------------------------------------------------------------------------

-- Whether a version of this task may cite a source: what it may read (research_readable), or what its base cited that
-- its draft starts with: an input of its lineage this task was not given again (its text stays unreadable to the task:
-- the runtime's disclosure guard indexes the task's own inputs), or an earlier version of the same report (a version
-- may cite the one it amends, CC-0019 #7). Never a question, another task's manifest or draft, or a source that is
-- withdrawn.
CREATE FUNCTION sophia.research_citable(s sophia.research_scope, p_source uuid) RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.research_readable(s,p_source) OR EXISTS(
  SELECT 1 FROM sophia.source_texts m CROSS JOIN LATERAL (SELECT m.body::jsonb->'base' AS base) x
   JOIN sophia.source_dependencies d ON d.project_id=m.project_id AND d.derived_source_id=(x.base->>'sourceId')::uuid AND d.source_id=p_source
  WHERE m.project_id=s.project_id AND m.source_id=s.manifest_source_id
   AND (EXISTS(SELECT 1 FROM sophia.artifact_versions v WHERE v.project_id=s.project_id
      AND v.artifact_id=(x.base->>'artifactId')::uuid AND v.source_id=p_source)
    OR EXISTS(SELECT 1 FROM sophia.research_tasks t JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
      JOIN sophia.source_dependencies i ON i.project_id=j.project_id AND i.derived_source_id=j.input_source_id AND i.source_id=p_source
     WHERE t.project_id=s.project_id AND t.root_job_id=s.root_job_id)
     AND NOT EXISTS(SELECT 1 FROM sophia.research_tasks q WHERE q.project_id=s.project_id AND q.question_source_id=p_source))
   AND NOT sophia.source_withdrawn(s.project_id,p_source)) $$;
REVOKE ALL ON FUNCTION sophia.research_citable(sophia.research_scope,uuid) FROM PUBLIC;

-- research_draft_citations (0036), replaced: the same, and an id the task may cite (research_citable), where it read
-- research_readable.
CREATE OR REPLACE FUNCTION sophia.research_draft_citations(s sophia.research_scope, p_result jsonb, p_candidates jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 WITH d AS (SELECT r.source_id, r.sha256 FROM sophia.research_drafts r WHERE r.project_id=s.project_id AND r.attempt_id=s.attempt_id
   ORDER BY r.seq DESC LIMIT 1),
  current AS (SELECT replace(lower(t.body),E'\\','') AS body FROM d
   JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=d.source_id
   WHERE d.sha256=p_result->>'draftSha256' AND jsonb_typeof(p_result->'citations')='array'),
  listed AS (SELECT lower(c) AS id FROM current, jsonb_array_elements_text(p_result->'citations') c),
  offered AS (SELECT CASE WHEN lower(c.v#>>'{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     THEN lower(c.v#>>'{}')::uuid END AS id, c.o
    FROM jsonb_array_elements(CASE jsonb_typeof(p_candidates) WHEN 'array' THEN p_candidates ELSE '[]' END) WITH ORDINALITY c(v,o)
    WHERE c.o<=7282 AND jsonb_typeof(c.v)='string'),
  named AS MATERIALIZED (SELECT n.id, min(n.o) AS first FROM offered n
   WHERE n.id IS NOT NULL AND EXISTS(SELECT 1 FROM current)
    AND NOT EXISTS(SELECT 1 FROM listed l WHERE l.id=n.id::text)
    AND n.id IS DISTINCT FROM s.question_source_id AND n.id IS DISTINCT FROM s.manifest_source_id
    AND NOT EXISTS(SELECT 1 FROM sophia.research_drafts r WHERE r.project_id=s.project_id AND r.attempt_id=s.attempt_id
     AND r.source_id=n.id)
    AND EXISTS(SELECT 1 FROM sophia.source_objects o WHERE o.project_id=s.project_id AND o.id=n.id)
   GROUP BY n.id),
  readable AS MATERIALIZED (SELECT id, first FROM named WHERE sophia.research_citable(s,id)),
  extra AS (SELECT r.id, r.first FROM readable r, current WHERE strpos(current.body,r.id::text)>0
   ORDER BY r.first LIMIT greatest(0,200-(SELECT count(DISTINCT id) FROM listed)))
 SELECT CASE WHEN EXISTS(SELECT 1 FROM extra)
  THEN jsonb_set(p_result,'{citations}',(p_result->'citations')||(SELECT jsonb_agg(id ORDER BY first) FROM extra))
  ELSE p_result END $$;

-- --- the amendment's draft and task statement ------------------------------------------------------------------

-- The research create's text: research_prompt's (0025), then what every task is asked. An amendment's says first,
-- before the question, what an update is (see the header): its draft starts as its base (dispatch_runtime_outbox seeds
-- it before it sends this). Its lines are application text, model-facing: a change to them changes how the worker
-- updates a report.
CREATE FUNCTION sophia.research_task_statement(p_project uuid, p_manifest jsonb) RETURNS text LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE
 -- A base longer than this is more than one research_write_draft call can carry under the route's output limit
 -- (16000 tokens, reasoning included; a turn cut there fails the task).
 rewrite_limit constant integer:=20000;
 -- What every research task is asked, after its manifest; a rule for every task is one more line here.
 asked constant text[]:=ARRAY['If the question states a length, the sections it wants, or a limit on web searches or page reads, keep to it, '
  ||'and say in the limitations where you could not.'];
 statement text:=sophia.research_prompt(p_manifest); cut integer:=strpos(statement,E'\n\nQuestion: '); n integer; title text; size integer;
BEGIN
 SELECT v.version_number, regexp_replace(a.title,'\s+',' ','g'), char_length(t.body) INTO n, title, size
  FROM sophia.artifact_versions v JOIN sophia.artifacts a ON a.project_id=v.project_id AND a.id=v.artifact_id
  LEFT JOIN sophia.source_texts t ON t.project_id=v.project_id AND t.source_id=v.source_id
  WHERE v.project_id=p_project AND v.id=(p_manifest->'base'->>'versionId')::uuid AND v.source_id=(p_manifest->'base'->>'sourceId')::uuid;
 IF n IS NOT NULL AND cut>0 THEN
  statement:=left(statement,cut+1)||concat_ws(E'\n',
   format('This task updates version %s of an existing report, "%s". It does not write a new report.',n,title),
   format('- Your draft already holds version %s''s full text: research_read_context shows it as your current draft. '
    ||'Read it whole, then edit it. When you write, pass its sha256 as expectedSha256, not null.',n),
   '- research_write_draft replaces the whole report, and the published version is exactly your draft: a section, table, link or '
    ||'citation your draft leaves out is deleted, not kept.',
   '- Change only what the question asks. Keep every other section, table and citation link as it stands.',
   '- Remove or restructure a section only when the question asks; then name each removed section in changeNote. retainedNote '
    ||'names only what you kept unchanged.',
   format('- Version %s is the document you are editing, not a source: keep the citations already in the text, and cite any new '
    ||'source you read.',n),
   '- If the question limits web searches or reads, keep to it.',
   CASE WHEN size>rewrite_limit THEN '- This report is longer than one draft call can carry here. Do not rewrite it: call '
    ||'research_report_blocker naming the requested change. Never submit a shortened report.' END)
   ||substr(statement,cut);
 END IF;
 RETURN statement||E'\n\n'||array_to_string(asked,E'\n');
END $$;
REVOKE ALL ON FUNCTION sophia.research_task_statement(uuid,jsonb) FROM PUBLIC;

-- dispatch_runtime_outbox (0025), replaced: the same, and a research create whose manifest has a base starts its
-- attempt with a draft that is a copy of the base's text, and is sent research_task_statement's text. The base is
-- readable here: a create whose base was withdrawn is refused above (native_delivery_ineligible reads the manifest's
-- closure, its base included). The seed is written once: an attempt's create is sent once (one runtime command per
-- outbox row; a rebuild is a new attempt), and the drafts' key refuses a second seq 1.
CREATE OR REPLACE FUNCTION sophia.dispatch_runtime_outbox(p_project uuid, p_outbox uuid, p_lease_token uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.outbox; g sophia.goals; c sophia.commands; b sophia.execution_bindings; rt sophia.runtime_instances; why text;
 kind text; payload jsonb:='{}'; next_seq bigint; command_body jsonb; rc_id uuid:=gen_random_uuid(); manifest jsonb; txt text;
 job_kind text; job_id uuid; base uuid; seed sophia.source_objects;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO o FROM sophia.outbox WHERE project_id=p_project AND id=p_outbox FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outbox row not found' USING ERRCODE='22023'; END IF;
 IF o.state<>'dispatching' OR o.lease_token IS DISTINCT FROM p_lease_token THEN RAISE EXCEPTION 'Lease lost; reconcile before recording' USING ERRCODE='40001'; END IF;
 IF o.lease_until<clock_timestamp() THEN
  UPDATE sophia.outbox SET state='outcome_unknown' WHERE project_id=p_project AND id=p_outbox;
  RETURN jsonb_build_object('result','outcome_unknown','reason','the dispatch lease expired');
 END IF;
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=o.goal_id FOR UPDATE;
 SELECT * INTO c FROM sophia.commands WHERE project_id=p_project AND id=o.command_id FOR UPDATE;
 IF o.destination='control.settle' THEN
  PERFORM sophia.settle_native_control(p_project,g.id);
  UPDATE sophia.outbox SET state='settled', lease_until=NULL WHERE project_id=p_project AND id=p_outbox;
  UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
  RETURN jsonb_build_object('result','settled');
 END IF;
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=p_project AND id=o.binding_id FOR UPDATE;
 SELECT * INTO rt FROM sophia.runtime_instances WHERE project_id=p_project AND resource_id=b.resource_id AND runtime_unit_id=b.runtime_unit_id AND state='active';
 IF o.cleanup THEN
  kind:=c.kind;  -- hold or stop (admit_goal_command writes native.stop rows for both)
  IF b.state IN ('settled','lost') OR (b.state='created' AND NOT EXISTS(SELECT 1 FROM sophia.runtime_commands WHERE project_id=p_project AND binding_id=b.id)) THEN
   -- Nothing native was ever started (or it is already settled): the fence is the whole effect.
   UPDATE sophia.execution_bindings SET state='settled' WHERE project_id=p_project AND id=b.id AND state<>'lost';
   UPDATE sophia.outbox SET state='settled', lease_until=NULL WHERE project_id=p_project AND id=p_outbox;
   UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
   PERFORM sophia.settle_native_control(p_project,g.id);
   RETURN jsonb_build_object('result','settled','reason','no native session to fence');
  END IF;
  IF rt.id IS NULL THEN RETURN sophia.deny_native_delivery(o,c,'no active runtime for its executor resource and runtime unit'); END IF;
 ELSE
  why:=sophia.native_delivery_ineligible(o,g,c,b,rt);
  IF why IS NOT NULL THEN RETURN sophia.deny_native_delivery(o,c,why); END IF;
  why:=sophia.runtime_unavailable(rt);
  IF why IS NOT NULL THEN RETURN sophia.defer_native_delivery(o,c,why); END IF;
  kind:=substr(o.destination,8);
  IF kind='create' THEN
   SELECT j.kind, j.id, t.body::jsonb INTO job_kind, job_id, manifest FROM sophia.jobs j
    JOIN sophia.source_texts t ON t.project_id=j.project_id AND t.source_id=j.input_source_id
    WHERE j.project_id=p_project AND j.command_id=c.id;
   IF job_kind='research' THEN
    -- One research worker: another research task already started and not yet ended keeps this one queued.
    IF EXISTS(SELECT 1 FROM sophia.jobs j2 JOIN sophia.execution_bindings b2 ON b2.project_id=j2.project_id AND b2.attempt_id=j2.attempt_id
      JOIN sophia.work_attempts w2 ON w2.project_id=j2.project_id AND w2.id=j2.attempt_id
      JOIN sophia.goals g2 ON g2.project_id=w2.project_id AND g2.id=w2.goal_id
      WHERE j2.project_id=p_project AND j2.kind='research' AND j2.id<>job_id AND j2.state IN ('pending','running','outcome_unknown')
       AND b2.state IN ('launching','running','idle') AND g2.status IN ('ready','running','checking')) THEN
     RETURN sophia.defer_native_delivery(o,c,'waiting for the research worker: another research task is under way');
    END IF;
    -- An amendment edits its base: the attempt's first draft is a copy of the base's text. A copy, never the base's
    -- own source: source_closure follows a draft to its task's manifest, so the base would draw on this task's inputs.
    -- The copy draws on the base through that manifest; it has no dependency of its own, so a version published from
    -- it unedited lists only what it cites.
    base:=(manifest->'base'->>'sourceId')::uuid;
    IF base IS NOT NULL THEN
     SELECT t.body INTO txt FROM sophia.source_texts t WHERE t.project_id=p_project AND t.source_id=base;
     seed:=sophia.put_text_source(p_project,c.actor_id,'text/markdown; charset=utf-8',txt);
     INSERT INTO sophia.research_drafts(project_id,attempt_id,seq,call_key,source_id,sha256)
     VALUES(p_project,b.attempt_id,1,'base:'||(manifest->'base'->>'versionId'),seed.id,seed.sha256);
    END IF;
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->>'route','text',sophia.research_task_statement(p_project,manifest));
   ELSE
    payload:=jsonb_build_object('role','sophia-brief-v1','text',sophia.draft_brief_prompt(manifest));
   END IF;
  ELSIF kind IN ('steer','input') THEN
   SELECT t.body INTO txt FROM sophia.source_texts t WHERE t.project_id=p_project AND t.source_id=c.body_source_id;
   IF txt IS NULL THEN RETURN sophia.deny_native_delivery(o,c,'its instruction has no readable text'); END IF;
   payload:=jsonb_build_object('text',txt);
  END IF;
 END IF;
 UPDATE sophia.runtime_instances SET command_sequence=command_sequence+1 WHERE id=rt.id RETURNING command_sequence INTO next_seq;
 command_body:=jsonb_build_object('schema','sophia.runtime-command.v1','commandId',rc_id,
  'binding',jsonb_build_object('projectId',p_project,'goalId',g.id,'goalRevision',g.revision,'attemptId',b.attempt_id,
   'resourceId',b.resource_id,'authorityEpoch',o.authority_epoch,'runtimeUnitId',b.runtime_unit_id),
  'kind',kind,'expectedNativeSessionId',CASE WHEN kind='resume' THEN to_jsonb(b.native_session_id) ELSE 'null'::jsonb END,
  'contextPacketId',CASE WHEN kind='create' THEN to_jsonb((SELECT input_source_id::text FROM sophia.jobs WHERE project_id=p_project AND command_id=c.id)) ELSE 'null'::jsonb END,
  'payload',payload);
 INSERT INTO sophia.runtime_commands(project_id,runtime_id,seq,id,outbox_id,command_id,binding_id,attempt_id,kind,authority_epoch,body)
 VALUES(p_project,rt.id,next_seq,rc_id,o.id,c.id,b.id,b.attempt_id,kind,o.authority_epoch,command_body);
 UPDATE sophia.outbox SET state='acknowledged', lease_until=NULL, outcome_reason=NULL WHERE project_id=p_project AND id=p_outbox;
 UPDATE sophia.commands SET state='dispatching' WHERE project_id=p_project AND id=c.id AND state='admitted';
 IF kind='create' THEN
  UPDATE sophia.execution_bindings SET state='launching' WHERE project_id=p_project AND id=b.id AND state='created';
  UPDATE sophia.jobs SET reason=NULL WHERE project_id=p_project AND command_id=c.id AND state='pending'
   AND (reason LIKE 'waiting for Sophia''s runtime%' OR reason LIKE 'waiting for the research worker%');
 END IF;
 RETURN jsonb_build_object('result','enqueued','runtimeId',rt.id,'seq',next_seq,'runtimeCommandId',rc_id);
END $$;
REVOKE ALL ON FUNCTION sophia.dispatch_runtime_outbox(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.dispatch_runtime_outbox(uuid,uuid,uuid) TO sophia_worker;

-- --- publication, replaced --------------------------------------------------------------------------------------

-- research_publish (0027), replaced: the same, and
-- * an amendment's notes pass amendment_note_problems: with the renamed outermost heading (one on each side, under
--   another anchor), and, while the task can read its base, the base's version to restore removed sections from;
-- * a draft that is still the version it amends, unchanged, is refused, with those problems, under the same one
--   refusal: the second submit publishes it with notes from the facts, as the refusal says (the model's notes on a
--   report it did not change cannot be checked against facts that show no change);
-- * an earlier draft of the attempt (the base's copy among them) leaves the model's list, which must still name a
--   source; the citations are checked with research_citable.
CREATE OR REPLACE FUNCTION sophia.research_publish(s sophia.research_scope, p_key text, p_result jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.research_tasks; j sophia.jobs; g sophia.goals; d sophia.research_drafts; a sophia.artifacts; prev sophia.artifact_versions;
 v sophia.artifact_versions; citations uuid[]; previous uuid[]; lims text[]; vnum integer; validation sophia.source_objects;
 result sophia.source_objects; v_title text:=btrim(p_result->>'title'); v_summary text:=btrim(p_result->>'summary');
 v_answer text:=btrim(p_result->>'resultSummary'); v_change text:=nullif(btrim(coalesce(p_result->>'changeNote','')),'');
 v_kept text:=nullif(btrim(coalesce(p_result->>'retainedNote','')),''); bad uuid; artifact uuid; v_bytes bigint; v_previous_bytes bigint;
 sections jsonb; problems text[]; replaced boolean:=false; new_text text; old_text text; base jsonb; base_ok boolean; renamed jsonb;
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
 -- An earlier draft of the attempt is no source: it leaves the model's list, which must still name one.
 SELECT coalesce(array_agg(x ORDER BY x),'{}') INTO citations FROM unnest(citations) x WHERE NOT EXISTS(SELECT 1 FROM sophia.research_drafts r
  WHERE r.project_id=s.project_id AND r.attempt_id=s.attempt_id AND r.source_id=x AND r.seq<d.seq);
 SELECT x INTO bad FROM unnest(citations) x WHERE x=d.source_id OR NOT sophia.research_citable(s,x) LIMIT 1;
 IF bad IS NOT NULL OR cardinality(citations)=0 THEN RAISE EXCEPTION 'Citation not found' USING ERRCODE='22023'; END IF;

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
 problems:='{}';
 IF prev.id IS NOT NULL THEN
  SELECT m.body::jsonb->'base' INTO base FROM sophia.source_texts m WHERE m.project_id=s.project_id AND m.source_id=s.manifest_source_id;
  base_ok:=base->>'sourceId' IS NOT NULL AND sophia.research_readable(s,(base->>'sourceId')::uuid);
  -- A renamed title is no removal: one outermost heading on each side, under another anchor.
  SELECT CASE WHEN count(*) FILTER (WHERE o.was)=1 AND count(*) FILTER (WHERE NOT o.was)=1
    AND min(o.anchor) FILTER (WHERE o.was)<>min(o.anchor) FILTER (WHERE NOT o.was) THEN jsonb_agg(o.heading) FILTER (WHERE o.was) ELSE '[]' END
   INTO renamed FROM (SELECT true AS was, x.anchor, x.heading FROM sophia.markdown_outline(old_text) x WHERE x.path ~ '^/[^/]*$'
    UNION ALL SELECT false, x.anchor, x.heading FROM sophia.markdown_outline(new_text) x WHERE x.path ~ '^/[^/]*$') o;
  problems:=sophia.amendment_note_problems(v_change,v_kept,sections,jsonb_build_object('renamed',renamed,'disclose',base_ok,
   'baseVersion',CASE WHEN base_ok THEN (SELECT bv.version_number FROM sophia.artifact_versions bv
     WHERE bv.project_id=s.project_id AND bv.id=(base->>'versionId')::uuid) END,
   'baseSourceId',CASE WHEN base_ok THEN base->>'sourceId' END));
  IF d.sha256=prev.source_hash THEN
   problems:=(format('The draft is version %s unchanged. Make the change the request asks for with research_write_draft; if the report '
    ||'needs no change, submit it again as it is: it is published as unchanged, with notes written from the facts.',
    prev.version_number)||problems)[1:20];
  END IF;
 END IF;
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

COMMIT;
