-- A project's words, searched by its members (docs/handoffs/FND-C4-PROJECT-SEARCH-attempt-1.md, A38; #365 section 5,
-- FND-C4-PROJECT-SEARCH-01). The search itself is no function: it is one parameterized read the API makes as the member
-- (sophia_api, withActor 'read'), so every row it reads passes the member's own RLS, as the chat, the brief and the
-- report viewer read them. Nothing here is SECURITY DEFINER, reads a table, copies a text, or adds an index.
-- * markdown_section_texts: a Markdown text as sections, each with its body and which repeat of its anchor it is, so a
--   section is searched by its own words and named as the viewer names it (`costs`, `costs#1` for the second). It is
--   0036's markdown_outline loop, copied (0036 is not edited): the same splitter, fences, headings, whitespace and
--   preamble (heading NULL, anchor '', only when it has words). IMMUTABLE and SECURITY INVOKER; it reads no relation.
--   Each heading's anchor is 0036's heading_anchor expression, copied byte for byte and computed here, so the private
--   helper stays its owner's alone (0036's security test) and the API's search needs no grant of it (R-C4-SQL-01).
BEGIN;

CREATE FUNCTION sophia.markdown_section_texts(p_text text)
RETURNS TABLE(ord integer, anchor text, occurrence integer, heading text, body text)
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE ws constant text:='[\t\n\v\f\r    -     　﻿]';
 line text; fenced boolean:=false; cur_heading text:=NULL; cur_anchor text:=''; cur_lines text[]:='{}';
 cur_body text; n integer:=0; m text[]; t text; seen text[]:='{}';
BEGIN
 -- A last line of NULL closes the last section.
 FOREACH line IN ARRAY regexp_split_to_array(coalesce(p_text,''),E'\r?\n')||NULL::text LOOP
  IF line ~ ('^'||ws||'{0,3}(```|~~~)') THEN fenced:=NOT fenced; END IF;
  m:=CASE WHEN fenced THEN NULL ELSE regexp_match(line,'^('||ws||'{0,3}(#{1,6})'||ws||'+)') END;
  t:=substr(line,length(m[1])+1);
  t:=left(t,length(t)-length(substring(reverse(t) FROM '^'||ws||'*#*'||ws||'*')));
  IF line IS NULL OR (t<>'' AND t !~ '[\r  ]') THEN
   cur_body:=array_to_string(cur_lines,E'\n');
   IF cur_heading IS NOT NULL OR cur_body ~ '[^\t\n\v\f\r    -     　﻿]' THEN
    ord:=n; anchor:=cur_anchor; heading:=cur_heading; body:=cur_body;
    -- Which repeat of its anchor this heading is, 0 the first, as the viewer counts the headings it shows.
    occurrence:=CASE WHEN cur_heading IS NULL THEN 0 ELSE cardinality(array_positions(seen,cur_anchor)) END;
    IF cur_heading IS NOT NULL THEN seen:=seen||cur_anchor; END IF;
    RETURN NEXT; n:=n+1;
   END IF;
   EXIT WHEN line IS NULL;
   cur_heading:=t; cur_lines:='{}';
   -- 0036's heading_anchor(cur_heading), the same expression.
   cur_anchor:=btrim(regexp_replace(regexp_replace(lower(cur_heading),
     '[^[:alnum:]\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff-]','','g'),
     '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+','-','g'),'-');
  ELSE
   cur_lines:=array_append(cur_lines,line);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION sophia.markdown_section_texts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.markdown_section_texts(text) TO sophia_api;

COMMIT;
