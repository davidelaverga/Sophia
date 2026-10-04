-- 0037: an amendment's notes account for every section it removed, notes written from the facts keep whole headings,
-- and every research task's statement asks it to keep the request's stated shape. Run by pnpm test:sql after every
-- migration; it rolls back. (Seeding, the update brief and publication are checked end to end in
-- packages/persistence/src/research.db.test.ts.)
BEGIN;
-- How a cost grows, as 0036_section_facts.sql times it (a test file is its own transaction, so it is defined again
-- here): p_query (its %s the size) at p_n and at 4 times p_n, in turns, the least of each kept, failing when the larger
-- took p_limit times as long. No fixed number of milliseconds: a slower or busier host would miss it.
CREATE FUNCTION pg_temp.assert_linear(p_label text, p_query text, p_n integer, p_limit float8 DEFAULT 8) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE small float8:='Infinity'; large float8:='Infinity'; started timestamptz; ratio float8; turns integer:=0;
 report text;
BEGIN
 EXECUTE format(p_query,p_n);
 WHILE turns<7 LOOP
  turns:=turns+1; started:=clock_timestamp(); EXECUTE format(p_query,p_n);
  small:=least(small,1000*extract(epoch FROM clock_timestamp()-started));
  started:=clock_timestamp(); EXECUTE format(p_query,4*p_n);
  large:=least(large,1000*extract(epoch FROM clock_timestamp()-started));
  ratio:=large/greatest(small,5);
  EXIT WHEN turns>=3 AND ratio<p_limit;
 END LOOP;
 report:=format('%s: 4 times the input took %s times as long (%s ms, then %s ms), limit %s, %s turns',p_label,
  round(ratio::numeric,1),round(small::numeric,1),round(large::numeric,1),p_limit,turns);
 IF current_setting('sophia.growth_log',true)='on' THEN RAISE NOTICE 'growth: %',report; END IF;
 IF ratio>=p_limit THEN RAISE EXCEPTION '%',report; END IF;
END $$;

-- The CX-0026 report and its amendment, as the pilot published them: a title and seven sections (a table, the
-- recommendations among them), then the title, new recommendations and a list of sources. Every note that keeps quiet
-- about the six sections it removed (the recommendations were rewritten, a rename), or claims them kept, is refused,
-- and every removed section is accounted for in the problems. Under 0036 each of these notes was published ({}).
CREATE TEMP TABLE pilot ON COMMIT DROP AS SELECT x.v1, sophia.section_facts(x.v1,x.v2) AS f FROM (SELECT
 E'# USB-C fast charging for phones\n\n## Summary\nS.\n\n## Compatibility and standards\nC.\n\n## Charging speed in practice\nX.\n\n'
 ||E'## Product claims vs. evidence\nP.\n\n## Comparison table\n| Phone | Watts |\n|---|---|\n| A | 25 |\n\n## Recommendations for buyers\nR.\n\n'
 ||E'## Limitations of this review\nL.\n' AS v1,
 E'# USB-C fast charging for phones\n\n## Revised recommendations\nR2.\n\n## Sources\n[1](x)\n' AS v2) x;
DO $$ DECLARE f jsonb:=(SELECT f FROM pilot); bad text;
 quiet text[]:=ARRAY['Summary','Compatibility and standards','Charging speed in practice','Product claims vs. evidence','Comparison table',
  'Limitations of this review'];
BEGIN
 IF f<>'{"added":["Revised recommendations","Sources"],"revised":[],"removed":["Summary","Compatibility and standards",'
   '"Charging speed in practice","Product claims vs. evidence","Comparison table","Recommendations for buyers","Limitations of this review"],'
   '"unchanged":["USB-C fast charging for phones"],"conclusionChanged":true}' THEN
  RAISE EXCEPTION 'The pilot''s facts changed: %',f; END IF;
 SELECT string_agg(format('%s | %s => %s',x.change,coalesce(x.kept,'-'),sophia.note_problems(x.change,x.kept,f)),E'\n') INTO bad FROM (VALUES
  ('Revised only the recommendations section; the remainder of the report is unchanged.',
   'Compatibility, charging, product claims and limitations are retained unchanged.'),
  ('Revised only the recommendations section; the remainder of the report is unchanged.',NULL),
  ('Rewrote the recommendations.','The remaining sections are unchanged.'),
  ('Rewrote the recommendations.','Other sections unchanged.'),
  ('Rewrote the recommendations.','Remaining content preserved.'),
  ('Rewrote the recommendations.','Original text preserved.'),
  ('Rewrote the recommendations.','The v1 text stays.'),
  ('Rewrote the text of the recommendations; the rest is unchanged.',NULL),
  ('Replaced the text of the recommendations section; everything else is unchanged.',NULL),
  ('Revised the recommendations and replaced the sources with the previous report.',NULL),
  ('Only the recommendations changed.',NULL),
  ('Everything is unchanged except the recommendations.',NULL),
  ('Recommendations revised; the comparison table is unchanged.',NULL),
  ('Recommendations revised.','Everything else is retained.'),
  ('Recommendations revised.',NULL),
  ('Updated the recommendations.','The comparison table and summary.'),
  ('Expanded recommendations with a budget option; nothing else changed.',NULL),
  ('Recommendations updated; all other sections kept.',NULL),
  -- A removal of the one section the request named is no wholesale removal, nor is "left out" a keep.
  ('Removed the old recommendations and wrote revised ones; the remainder of the report is unchanged.',NULL),
  ('Dropped the previous recommendations in favour of new picks; everything else is unchanged.',NULL),
  ('Deleted the original recommendations and wrote new ones.','All other sections are retained.'),
  ('Revised the recommendations, keeping the original sections; removed the old buying advice.',NULL),
  ('Only the recommendations were left out of the update; the rest is unchanged.',NULL),
  -- A removal denied is no removal disclosed.
  ('Revised the recommendations. No other sections were removed.',NULL),
  ('Revised the recommendations.','None of the other sections were dropped.'),
  ('Revised the recommendations; none of the six other sections were removed.',NULL),
  ('Revised the recommendations; I did not cut the remaining sections.',NULL),
  ('Revised the recommendations; no original sections were cut.',NULL),
  ('Revised the recommendations; never removed the other sections.',NULL),
  ('Revised the recommendations; the summary, compatibility, charging, claims, comparison table and limitations were not removed.',NULL),
  ('Revised the recommendations; the summary, compatibility, charging, claims, comparison table and limitations are still included.',NULL),
  -- A word of the title is no word on the sections that share it, unless a piece says they went.
  ('Revised the fast-charging recommendations for phones; the rest is unchanged.',NULL),
  -- A count that does not cover them.
  ('Removed 2 sections, revised the recommendations.','The rest is unchanged.')) x(change,kept)
  WHERE cardinality(sophia.note_problems(x.change,x.kept,f))=0
   OR EXISTS(SELECT 1 FROM unnest(quiet) h WHERE NOT EXISTS(SELECT 1 FROM unnest(sophia.note_problems(x.change,x.kept,f)) p
    WHERE strpos(p,'"'||h||'"')>0))
   OR EXISTS(SELECT 1 FROM unnest(sophia.note_problems(x.change,x.kept,f)) p WHERE strpos(p,'Recommendations for buyers')>0);
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'A false note was published, or a removal left unnamed:\n%',bad; END IF;
 -- How each kind is said: a claim that the rest was kept, silence, a removed section called unchanged or kept. The
 -- recommendations, renamed, are no removal even where no note names them.
 SELECT string_agg(format('%s | %s => %s',x.change,coalesce(x.kept,'-'),sophia.note_problems(x.change,x.kept,f)),E'\n') INTO bad FROM (VALUES
  ('Revised only the recommendations section; the remainder of the report is unchanged.',NULL,ARRAY[
   'The notes say the rest of the report was kept, but 6 sections were removed: "Summary", "Compatibility and standards", '
   ||'"Charging speed in practice", "Product claims vs. evidence", "Comparison table", "Limitations of this review".']),
  ('Recommendations revised.',NULL,ARRAY['The notes do not say that 6 sections were removed: "Summary", "Compatibility and standards", '
   ||'"Charging speed in practice", "Product claims vs. evidence", "Comparison table", "Limitations of this review".']),
  ('Rewrote it as asked.',NULL,ARRAY['The notes do not say that 6 sections were removed: "Summary", "Compatibility and standards", '
   ||'"Charging speed in practice", "Product claims vs. evidence", "Comparison table", "Limitations of this review".']),
  ('Recommendations revised; the comparison table is unchanged.',NULL,ARRAY[
   'The change note calls "Comparison table" unchanged, but it was removed.',
   'The notes do not say that 5 sections were removed: "Summary", "Compatibility and standards", "Charging speed in practice", '
   ||'"Product claims vs. evidence", "Limitations of this review".']),
  ('Revised only the recommendations section; the remainder of the report is unchanged.',
   'Compatibility, charging, product claims and limitations are retained unchanged.',ARRAY[
   'The kept note names "Compatibility and standards", which was removed.','The kept note names "Product claims vs. evidence", which was removed.',
   'The kept note names "Limitations of this review", which was removed.',
   'The notes say the rest of the report was kept, but 3 sections were removed: "Summary", "Charging speed in practice", "Comparison table".'])
  ) x(change,kept,want)
  WHERE sophia.note_problems(x.change,x.kept,f)<>x.want;
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'A refusal is worded otherwise:\n%',bad; END IF;
 -- An amendment whose base the task can read is also told where to restore them from.
 IF sophia.amendment_note_problems('Recommendations revised.',NULL,f,
   '{"renamed":[],"disclose":true,"baseVersion":1,"baseSourceId":"37000000-0000-0000-0000-000000000001"}')<>ARRAY[
   'The notes do not say that 6 sections were removed: "Summary", "Compatibility and standards", "Charging speed in practice", '
   ||'"Product claims vs. evidence", "Comparison table", "Limitations of this review".',
   'New notes do not bring these sections back: research_write_draft replaced the whole report. Unless the request asked to remove '
   ||'them, restore them from version 1 (sourceId 37000000-0000-0000-0000-000000000001) with research_write_draft, then submit again; '
   ||'if it did, name them in changeNote.'] THEN
  RAISE EXCEPTION 'No restore problem: %',sophia.amendment_note_problems('Recommendations revised.',NULL,f,
   '{"renamed":[],"disclose":true,"baseVersion":1,"baseSourceId":"37000000-0000-0000-0000-000000000001"}'); END IF;
 -- So is one whose notes call every removed section kept.
 IF sophia.amendment_note_problems('Revised the recommendations.',
   'Summary, compatibility, charging speed, product claims, comparison table and limitations are retained unchanged.',f,
   '{"renamed":[],"disclose":true,"baseVersion":1,"baseSourceId":"37000000-0000-0000-0000-000000000001"}')<>ARRAY[
   'The kept note names "Summary", which was removed.','The kept note names "Comparison table", which was removed.',
   'The kept note names "Compatibility and standards", which was removed.','The kept note names "Charging speed in practice", which was removed.',
   'The kept note names "Product claims vs. evidence", which was removed.','The kept note names "Limitations of this review", which was removed.',
   'New notes do not bring these sections back: research_write_draft replaced the whole report. Unless the request asked to remove '
   ||'them, restore them from version 1 (sourceId 37000000-0000-0000-0000-000000000001) with research_write_draft, then submit again; '
   ||'if it did, name them in changeNote.'] THEN
  RAISE EXCEPTION 'No restore problem after the kept note: %',sophia.amendment_note_problems('Revised the recommendations.',
   'Summary, compatibility, charging speed, product claims, comparison table and limitations are retained unchanged.',f,
   '{"renamed":[],"disclose":true,"baseVersion":1,"baseSourceId":"37000000-0000-0000-0000-000000000001"}'); END IF;
END $$;

-- The same claims in other words (CX-0026 review): a keep word the gate did not read ("as they were", "carried
-- forward", "unaffected", "maintained", "leaving ... unchanged"), sections listed after a change ("Revised X, and A, B
-- and C are as they were"), or a change that is no removal ("updated the comparison table"). Each is refused, every
-- removed section named, then where to restore them from. Before this review most were published ({}).
DO $$ DECLARE f jsonb:=(SELECT f FROM pilot); v1 text:=(SELECT v1 FROM pilot); tab jsonb; bad text;
 ctx constant jsonb:='{"disclose":true,"baseVersion":1,"baseSourceId":"37000000-0000-0000-0000-000000000001"}';
 quiet constant text[]:=ARRAY['Summary','Compatibility and standards','Charging speed in practice','Product claims vs. evidence','Comparison table',
  'Limitations of this review'];
 list constant text:='summary, compatibility, charging speed, product claims, comparison table and limitations';
 restore constant text:='New notes do not bring these sections back: research_write_draft replaced the whole report. Unless the request '
  ||'asked to remove them, restore them from version 1 (sourceId 37000000-0000-0000-0000-000000000001) with research_write_draft, then '
  ||'submit again; if it did, name them in changeNote.';
BEGIN
 tab:=sophia.section_facts(v1,replace(replace(v1,E'## Comparison table\n| Phone | Watts |\n|---|---|\n| A | 25 |\n\n',''),E'\nR.\n',E'\nR2.\n'));
 SELECT string_agg(format('%s | %s => %s',x.change,coalesce(x.kept,'-'),x.p),E'\n') INTO bad FROM (SELECT y.*,
   sophia.amendment_note_problems(y.change,y.kept,CASE WHEN y.pilot THEN f ELSE tab END,ctx) AS p FROM (VALUES
  (true,'Rewrote the recommendations, and the '||list||' are as they were.',NULL),
  (true,'Rewrote the recommendations, and the '||list||' are as they were.','The citations.'),
  (true,'Revised the recommendations, and the '||list||' are unchanged.',NULL),
  (true,'Revised the recommendations; '||list||' carried forward.',NULL),
  (true,'Revised the recommendations; '||list||' carry over.',NULL),
  (true,'Revised the recommendations; '||list||' are in place.',NULL),
  (true,'Revised the recommendations; '||list||' are as in version 1.',NULL),
  (true,'Revised the recommendations; '||list||' follow v1.',NULL),
  (true,'Revised the recommendations; '||list||' come from v1.',NULL),
  (true,'Revised the recommendations; the '||list||' come straight from version 1.',NULL),
  (true,'Revised the recommendations; '||list||' are unaffected.',NULL),
  (true,'Revised the recommendations; maintained the '||list||'.',NULL),
  (true,'Revised the recommendations; '||list||' as written.',NULL),
  (true,'Revised the recommendations; '||list||' still stand.',NULL),
  (true,'Revised the recommendations; '||list||' persist.',NULL),
  (true,'Revised the recommendations; '||list||' are unedited.',NULL),
  (true,'Revised only the recommendations section, leaving all other sections (summary, compatibility, charging speed, product claims, '
   ||'comparison table, limitations) as they were.',NULL),
  -- Listed between a removal and a keep, a section is neither disclosed nor called kept; after a removal, a keep word
  -- the gate did not read would leave the list saying it went.
  (true,'Removed the old recommendations, and the '||list||' are as they were.',NULL),
  (true,'Removed the old buying advice and the '||list||' are unchanged.',NULL),
  (false,'Dropped the old recommendations, and the summary, comparison table and limitations carried forward.',NULL),
  (false,'Dropped the old recommendations, and the summary, comparison table and limitations are maintained.',NULL),
  (false,'Dropped the old recommendations, and the summary, comparison table and limitations are still there.',NULL),
  (false,'Dropped the old recommendations, and the summary, comparison table and limitations are unaffected.',NULL),
  (false,'Dropped the old recommendations, and the summary, comparison table and limitations are as in v1.',NULL),
  (false,'Dropped the old recommendations, and the summary, comparison table and limitations follow v1.',NULL),
  (false,'Dropped the old recommendations, and the comparison table is left in place.',NULL),
  (false,'Removed the old recommendations, leaving the comparison table.',NULL),
  (false,'Revised the recommendations, while the summary, comparison table and limitations stay unchanged.',NULL),
  (false,'Revised the recommendations, leaving the comparison table and limitations unchanged.',NULL),
  (false,'Revised the recommendations, leaving the comparison table and other sections untouched.',NULL),
  (false,'Revised the recommendations, keeping the summary, comparison table and limitations as they were.',NULL),
  (false,'Revised the recommendations; the summary, comparison table and limitations are carried forward from version 1.',NULL),
  (false,'Revised the recommendations. Everything else, including the comparison table, is as in v1.',NULL),
  (false,'Only the recommendations were revised, with the comparison table and other sections unchanged.',NULL),
  (false,'Revised the recommendations; comparison table unaffected.',NULL),
  (false,'comparison table maintained',NULL),
  (false,'The comparison table is still part of the report.',NULL),
  (false,'Revised the recommendations; the report still includes the comparison table.',NULL),
  (false,'Revised the recommendations; the comparison table is left in place.',NULL),
  (false,'Revised the recommendations; the comparison table remains in place.',NULL),
  (false,'Revised the recommendations; the comparison table carries over.',NULL),
  (false,'Revised the recommendations; the comparison table follows v1.',NULL),
  (false,'Revised the recommendations; comparison table as in v1.',NULL),
  (false,'Revised the recommendations; the comparison table is the same as in version 1.',NULL),
  (false,'Revised the recommendations; the comparison table was maintained as it stood.',NULL),
  (false,'Revised the recommendations; the comparison table is preserved as before.',NULL),
  (false,'Revised the recommendations; the comparison table was kept intact.',NULL),
  (false,'Revised the recommendations; the comparison table was left as is.',NULL),
  (false,'Revised the recommendations, with the comparison table untouched.',NULL),
  (false,'Revised the recommendations, but the comparison table stays.',NULL),
  (false,'Revised the recommendations, the comparison table is unchanged.',NULL),
  (false,'Revised the recommendations; did not change the comparison table.',NULL),
  (false,'Revised the recommendations; the comparison table was not edited.',NULL),
  (false,'Revised the recommendations; nothing happened to the comparison table.',NULL),
  (false,'Reworded the recommendations; the comparison table and the limitations are both still there.',NULL),
  (false,'Removed the old recommendations; kept the summary, comparison table and limitations.',NULL),
  (false,'Removed the old recommendations and kept the summary, comparison table and limitations.',NULL),
  (false,'Dropped the old recommendations, and the summary, comparison table and limitations stayed.',NULL),
  (false,'Revised the recommendations.','Recommendations revised, comparison table, limitations.'),
  -- A change that is no removal discloses none.
  (false,'Revised the recommendations and updated the comparison table.',NULL),
  (false,'Revised the recommendations and comparison table.',NULL),
  (false,'Revised the recommendations and refreshed the comparison table.',NULL),
  (false,'Revised the recommendations to reflect the comparison table.',NULL),
  (false,'Cited a newer measurement in the comparison table instead.',NULL),
  (false,'Converted the prices in the comparison table to euros.',NULL)) y(pilot,change,kept)) x
  WHERE cardinality(x.p)=0 OR x.p[cardinality(x.p)]<>restore
   OR EXISTS(SELECT 1 FROM unnest(CASE WHEN x.pilot THEN quiet ELSE ARRAY['Comparison table'] END) h
    WHERE NOT EXISTS(SELECT 1 FROM unnest(x.p) q WHERE strpos(q,'"'||h||'"')>0));
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'A false note in other words was published, or a removal left unnamed:\n%',bad; END IF;
 -- How each is said: called unchanged, or left quiet where a change or an ambiguous list does not disclose it.
 SELECT string_agg(format('%s => %s',x.change,sophia.amendment_note_problems(x.change,NULL,x.facts,ctx)),E'\n') INTO bad FROM (VALUES
  (tab,'Revised the recommendations, leaving the comparison table and limitations unchanged.',
   ARRAY['The change note calls "Comparison table" unchanged, but it was removed.',restore]),
  (tab,'Revised the recommendations and updated the comparison table.',ARRAY['The notes do not say that 1 section was removed: "Comparison table".',restore]),
  (f,'Removed the old recommendations, and the '||list||' are as they were.',ARRAY[
   'The change note calls "Limitations of this review" unchanged, but it was removed.','The notes do not say that 5 sections were removed: '
   ||'"Summary", "Compatibility and standards", "Charging speed in practice", "Product claims vs. evidence", "Comparison table".',restore])) x(facts,change,want)
  WHERE sophia.amendment_note_problems(x.change,NULL,x.facts,ctx)<>x.want;
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'A refusal in other words is worded otherwise:\n%',bad; END IF;
END $$;

-- A count reads its number, in either order ("2 sections removed", "removed the 7 original sections"), and covers as
-- many quiet sections; a negated one, or a wholesale removal negated, covers none.
DO $$ DECLARE f jsonb:=(SELECT f FROM pilot); v1 text:=(SELECT v1 FROM pilot); two jsonb; bad text;
BEGIN
 SELECT string_agg(format('%s => %s, not %s',x.piece,sophia.note_removes_all(x.piece),x.n),E'\n') INTO bad FROM (VALUES
   ('Removed 2 sections, revised the recommendations',2),('removed 2 sections',2),('Dropped six sections as asked',6),
   ('Cut the three earlier sections',3),('Removed the 7 original sections as asked',7),('6 sections removed',6),
   ('Merged two sections',2),('No sections removed',0),('Removed nothing',0),('None of the other sections were removed',0),
   ('I did not cut the remaining sections',0),('Removed the other sections',1000000),('Removed the rest of the report',1000000),
   ('Removed the rest of the table',0),('Removed the old recommendations',0),('Only the title is kept',1000000),
   ('Nothing but the title is kept',1000000),('Nothing else was kept',1000000),('Only the recommendations were left out',0)) x(piece,n)
  WHERE sophia.note_removes_all(x.piece)<>x.n;
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'A count misread:\n%',bad; END IF;
 two:=sophia.section_facts(v1,replace(replace(replace(v1,E'## Limitations of this review\nL.\n',''),E'## Summary\nS.\n\n',''),E'\nR.\n',E'\nR2.\n'));
 IF two->'removed'<>'["Summary","Limitations of this review"]' THEN RAISE EXCEPTION 'Unexpected facts: %',two; END IF;
 SELECT string_agg(format('%s | %s => %s',x.change,coalesce(x.kept,'-'),sophia.note_problems(x.change,x.kept,x.facts)),E'\n') INTO bad FROM (VALUES
   (two,'Removed two sections as asked and revised the recommendations.','The rest is unchanged.','{}'::text[]),
   (two,'Removed 2 sections, revised the recommendations.','The rest is unchanged.','{}'),
   (two,'Dropped two sections as asked; revised the recommendations.',NULL,'{}'),
   (f,'Removed the 7 original sections as asked; wrote new recommendations.',NULL,'{}'),
   (f,'Dropped six sections as asked.',NULL,'{}'),
   (f,'Removed 2 sections, revised the recommendations.','The rest is unchanged.',ARRAY['The notes say the rest of the report was kept, '
    ||'but 6 sections were removed: "Summary", "Compatibility and standards", "Charging speed in practice", "Product claims vs. evidence", '
    ||'"Comparison table", "Limitations of this review".'])) x(facts,change,kept,want)
  WHERE sophia.note_problems(x.change,x.kept,x.facts)<>x.want;
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'A count was misjudged:\n%',bad; END IF;
END $$;

-- A word a removed section shares with a remaining heading (the report's topic, in a title) discloses it only in a
-- piece that says something went and names no other removed section by a word of its own.
DO $$ DECLARE f jsonb:=sophia.section_facts(E'# Home battery storage\n\n## Battery chemistry\nA.\n\n## Battery costs\nB.\n\n'
   ||E'## Battery recommendations\nC.\n',E'# Home battery storage\n\n## Battery recommendations\nC2.\n'); bad text;
BEGIN
 IF f->'removed'<>'["Battery chemistry","Battery costs"]' OR f->'revised'<>'["Battery recommendations"]' THEN
  RAISE EXCEPTION 'Unexpected facts: %',f; END IF;
 SELECT string_agg(format('%s => %s',x.change,sophia.note_problems(x.change,NULL,f)),E'\n') INTO bad FROM (VALUES
   ('Revised the battery recommendations; the rest is unchanged.',ARRAY['The notes say the rest of the report was kept, but 2 sections '
    ||'were removed: "Battery chemistry", "Battery costs".']),
   ('Removed the battery chemistry section and revised the battery recommendations; the rest is unchanged.',ARRAY['The notes say the '
    ||'rest of the report was kept, but 1 section was removed: "Battery costs".']),
   ('Removed the battery chemistry and costs sections; revised the battery recommendations.','{}'::text[]),
   ('Revised the recommendations; dropped the battery sections as asked.','{}')) x(change,want)
  WHERE sophia.note_problems(x.change,NULL,f)<>x.want;
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'A shared word was misjudged:\n%',bad; END IF;
END $$;

-- Honest notes are published: removals disclosed by name, by a key word, wholesale or by a count; revisions under
-- "the rest is unchanged" (subsections too: the facts have no paths); a dropped table with the rest kept; renames.
DO $$ DECLARE f jsonb:=(SELECT f FROM pilot); v1 text:=(SELECT v1 FROM pilot); bad text; recs jsonb; sub jsonb; tab jsonb;
BEGIN
 recs:=sophia.section_facts(v1,replace(replace(v1,E'\nR.\n',E'\nR, and a budget pick.\n'),E'\nS.\n',E'\nS, shorter.\n'));
 sub:=sophia.section_facts(replace(v1,E'\nR.\n',E'\n### For iPhone users\nI.\n\n### For Android users\nA.\n'),
  replace(v1,E'\nR.\n',E'\n### For iPhone users\nI, MagSafe.\n\n### For Android users\nA, PPS.\n'));
 tab:=sophia.section_facts(v1,replace(replace(v1,E'## Comparison table\n| Phone | Watts |\n|---|---|\n| A | 25 |\n\n',''),E'\nR.\n',E'\nR2.\n'));
 IF sub->'revised'<>'["For iPhone users","For Android users"]' OR sub->'removed'<>'[]' OR tab->'removed'<>'["Comparison table"]' THEN
  RAISE EXCEPTION 'Unexpected facts: % %',sub,tab; END IF;
 SELECT string_agg(format('%s | %s => %s',x.change,coalesce(x.kept,'-'),sophia.note_problems(x.change,x.kept,x.facts)),E'\n') INTO bad FROM (VALUES
  (f,'Rewrote the report as recommendations only, as asked; removed the other sections.',NULL),
  (f,'Recommendations revised; 6 sections removed.',NULL),
  (f,'Recommendations rewritten; removed summary, compatibility, charging, product claims, comparison table and limitations.',NULL),
  (f,'Updated the recommendations.','Only the title is kept; the other sections were dropped as asked.'),
  (f,'Updated the recommendations.','Dropped everything else as requested.'),
  (f,'Recommendations-only version as requested.','The title; nothing else was kept.'),
  (f,'Replaced the whole report with revised recommendations and sources.',NULL),
  (f,'Removed the summary, compatibility, charging, product claims, comparison table and limitations sections.',NULL),
  (recs,'Recommendations expanded; conclusion unchanged.',NULL),
  (recs,'Recommendations expanded; the rest is unchanged.',NULL),
  (recs,'Only the recommendations and the summary changed.',NULL),
  (sub,'Recommendations expanded; the rest is unchanged.',NULL),
  (sub,'Only the recommendations changed.',NULL),
  (tab,'Removed the comparison table.','The rest is unchanged.'),
  (tab,'Removed the old comparison table, everything else is unchanged.',NULL),
  (tab,'Dropped the table.','All other sections are kept.'),
  (tab,'Dropped the table; no other section was removed.',NULL),
  -- "other than", "besides", "apart from", "aside from" and "everything but" except a section from what they keep.
  (tab,'Revised the recommendations; everything other than the table is unchanged.',NULL),
  (tab,'Revised the recommendations. Besides the table, the rest is unchanged.',NULL),
  (tab,'Revised the recommendations; all other sections, apart from the table, are unchanged.',NULL),
  (tab,'Revised the recommendations; the rest, aside from the table, is unchanged.',NULL),
  (tab,'Revised the recommendations.','Everything but the table.'),
  (tab,'Revised the recommendations.','All sections other than the table.'),
  -- A piece saying a section went names it whatever a key word of the notes keeps.
  (tab,'Removed the comparison table; everything other than the table is unchanged.',NULL),
  (tab,'Removed the comparison table. Besides the table, the rest is unchanged.',NULL),
  (tab,'Removed the comparison table and revised the recommendations; all other sections, apart from the table, are unchanged.',NULL),
  (tab,'Revised the recommendations; the rest, aside from the dropped table, is unchanged.',NULL),
  (tab,'Removed the comparison table as asked; revised the recommendations.','Everything but the table.'),
  (tab,'Removed the comparison table as asked; revised the recommendations.','All sections other than the table.'),
  (tab,'Removed the comparison table as asked; revised the recommendations.','Apart from the table, every section as it was.'),
  (tab,'Removed the comparison table as asked; revised the recommendations.','The table''s data is kept in the recommendations.'),
  (tab,'Removed the table, keeping the comparison in prose.',NULL),
  -- A list belongs to the verb before it, or to a keep or a removal after it whose subject may be the whole list.
  (f,'Revised the recommendations, and the summary, compatibility, charging speed, product claims, comparison table and limitations were '
   ||'removed.',NULL),
  (f,'The summary, compatibility, charging speed, product claims, comparison table and limitations were removed as asked; the '
   ||'recommendations were rewritten.',NULL),
  (f,'Rewrote the report around the recommendations; removed the summary, compatibility, charging speed, product claims, comparison table '
   ||'and limitations, as asked.',NULL),
  (f,'Took out the summary, compatibility, charging speed, product claims, comparison table and limitations; rewrote the recommendations.',NULL),
  (f,'Rewrote the recommendations without the summary, compatibility, charging speed, product claims, comparison table and limitations.',NULL),
  (tab,'Removed the summary table and the comparison table, the rest is unchanged.',NULL),
  (tab,'Removed the comparison table and the summary is unchanged.',NULL),
  (tab,'Dropped the comparison table; summary and limitations are as they were.',NULL),
  (tab,'Revised the recommendations, leaving the summary and limitations unchanged; removed the comparison table.',NULL),
  (tab,'Revised the recommendations, and the comparison table was removed as asked.','Summary and limitations are unchanged.'),
  -- Other ways to say a section went: taken out, turned into prose, retired, merged, replaced, gone, no longer there,
  -- not kept, an exception.
  (tab,'Took the comparison table out, as asked; revised the recommendations.',NULL),
  (tab,'Turned the comparison table into a paragraph; the rest is unchanged.',NULL),
  (tab,'Retired the comparison table, as asked.',NULL),
  (tab,'Merged the comparison table into the recommendations.',NULL),
  (tab,'Replaced the comparison table with a sentence in the recommendations.',NULL),
  (tab,'Revised the recommendations. The comparison table is gone.',NULL),
  (tab,'Revised the recommendations; the comparison table is no longer included.',NULL),
  (tab,'Revised the recommendations; the comparison table was not kept.',NULL),
  (tab,'The comparison table was dropped as asked; everything else carried over.',NULL),
  (tab,'Revised the recommendations; everything other than the summary, comparison table and limitations is unchanged.',NULL),
  -- A kept note naming the removed table in full where it excepts it.
  (tab,'Revised the recommendations.','Everything except the comparison table.'),
  (tab,'Revised the recommendations.','Everything but the comparison table, which was removed.'),
  (tab,'Revised the recommendations.','Kept everything but the comparison table.')) x(facts,change,kept)
  WHERE cardinality(sophia.note_problems(x.change,x.kept,x.facts))<>0;
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'An honest note was refused:\n%',bad; END IF;
 -- Its kept note naming the removed table, a note keeping quiet about it, or one saying it was not removed or is still
 -- there, is still refused.
 IF sophia.note_problems('Revised the recommendations.','The rest is unchanged.',tab)
   <>ARRAY['The notes say the rest of the report was kept, but 1 section was removed: "Comparison table".'] THEN
  RAISE EXCEPTION 'A note about the dropped table was published'; END IF;
 SELECT string_agg(format('%s => %s',x.change,sophia.note_problems(x.change,NULL,tab)),E'\n') INTO bad FROM (VALUES
   ('Revised the recommendations; the comparison table is unchanged.'),
   ('Revised the recommendations; the comparison table was not removed.'),
   ('Revised the recommendations; did not remove or change the comparison table.'),
   ('Revised the recommendations; the comparison table was not touched.'),
   ('Revised the recommendations and left the comparison table alone.'),
   ('Revised the recommendations; the comparison table is still there.')) x(change)
  WHERE sophia.note_problems(x.change,NULL,tab)<>ARRAY['The change note calls "Comparison table" unchanged, but it was removed.'];
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'A note keeping the dropped table was published:\n%',bad; END IF;
 -- A renamed title is a removal for the bare gate; research_publish passes it in as renamed (the only outermost heading
 -- on each side), and then nothing is refused. A rebuild that never read its base is not asked to disclose (0036's
 -- rules and a removed section called kept still hold, without its name).
 IF sophia.note_problems('Added the costs.','The host list.',sophia.section_facts('# V1','# V2'))
   <>ARRAY['The notes do not say that 1 section was removed: "V1".']
  OR cardinality(sophia.amendment_note_problems('Added the costs.','The host list.',sophia.section_facts('# V1','# V2'),'{"renamed":["V1"]}'))<>0
  OR cardinality(sophia.amendment_note_problems('Added the costs.','The host list.',sophia.section_facts(E'# Hosts\nA.\n',E'# Costs\nB.\n'),
   '{"renamed":["Hosts"],"disclose":false}'))<>0
  OR sophia.amendment_note_problems('Added the costs.','The host list.',sophia.section_facts(E'# Hosts\nA.\n',E'# Costs\nB.\n'),'{"disclose":false}')
   <>ARRAY['The kept note names a section that is no longer in the report.']
  OR cardinality(sophia.amendment_note_problems('Added the costs.',NULL,sophia.section_facts(E'# Hosts\nA.\n',E'# Costs\nB.\n'),
   '{"disclose":false,"baseVersion":1,"baseSourceId":"x"}'))<>0 THEN
  RAISE EXCEPTION 'Renames or a rebuild without its base misjudged'; END IF;
END $$;

-- A revised section a note calls unchanged, by its heading or a key word only it has ("the comparison table is
-- unchanged" of a table that lost two rows), is refused. "Kept" or "still there" (it is), an exception ("unchanged
-- except two rows"), a change named beside it ("trimmed the comparison table; the rest of it is unchanged"), a claim
-- about the rest (the facts carry no heading paths), or a heading also unchanged (a repeated one) is not. Before this
-- review each named claim was published.
DO $$ DECLARE bad text; base text:=E'# Phone charging\n\n## Summary\nS.\n\n## Comparison table\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\n'
  ||E'## Recommendations for buyers\nR.\n\n## Limitations\nL.\n'; rev jsonb; sub jsonb; rep jsonb;
BEGIN
 rev:=sophia.section_facts(base,replace(replace(base,E'| 3 | 4 |\n',''),E'\nR.\n',E'\nR2.\n'));
 sub:=sophia.section_facts(E'# Phones\n\n## Advice\n### For iPhone users\nI.\n\n### For Android users\nA.\n',
  E'# Phones\n\n## Advice\n### For iPhone users\nI, MagSafe.\n\n### For Android users\nA, PPS.\n');
 rep:=sophia.section_facts(E'# Phones\n\n## Phone A\nA.\n\n### Pricing\nx\n\n## Phone B\nB.\n\n### Pricing\ny\n',
  E'# Phones\n\n## Phone A\nA.\n\n### Pricing\nx\n\n## Phone B\nB.\n\n### Pricing\ny2\n');
 IF rev->'revised'<>'["Comparison table","Recommendations for buyers"]' OR rev->'removed'<>'[]'
   OR sub->'revised'<>'["For iPhone users","For Android users"]' OR rep->'revised'<>'["Pricing"]' THEN
  RAISE EXCEPTION 'Unexpected facts: % % %',rev,sub,rep; END IF;
 SELECT string_agg(format('%s | %s => %s',x.change,coalesce(x.kept,'-'),sophia.note_problems(x.change,x.kept,x.facts)),E'\n') INTO bad FROM (VALUES
  (rev,'Revised the recommendations; the comparison table is unchanged.',NULL,'Comparison table'),
  (rev,'Revised the recommendations.','Comparison table unchanged.','Comparison table'),
  (rev,'Revised the recommendations.','Comparison table, summary and limitations are unchanged.','Comparison table'),
  (rev,'Revised the recommendations; the comparison table was not touched.',NULL,'Comparison table'),
  (rev,'Revised the recommendations.','The comparison table is retained as it was.','Comparison table'),
  (rev,'Revised the recommendations; the table is identical to version 1.',NULL,'Comparison table'),
  (sub,'Expanded the iPhone advice; the Android advice is unchanged.',NULL,'For Android users')) x(facts,change,kept,h)
  WHERE sophia.note_problems(x.change,x.kept,x.facts)<>ARRAY[format('The note calls "%s" unchanged, but it was revised.',x.h)];
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'A revised section called unchanged was published, or worded otherwise:\n%',bad; END IF;
 SELECT string_agg(format('%s | %s => %s',x.change,coalesce(x.kept,'-'),sophia.note_problems(x.change,x.kept,x.facts)),E'\n') INTO bad FROM (VALUES
  (rev,'Revised the recommendations and trimmed the comparison table to one row; the rest is unchanged.',NULL),
  (rev,'Updated the comparison table and the recommendations; summary and limitations unchanged.',NULL),
  (rev,'Revised the recommendations.','The comparison table is kept, with one row removed.'),
  (rev,'Revised the recommendations; the comparison table keeps its columns but lost a row.',NULL),
  (rev,'Revised the recommendations; the comparison table is unchanged except for one row.',NULL),
  (rev,'Trimmed a row from the comparison table; the rest of the comparison table is unchanged.',NULL),
  (rev,'Revised the recommendations; the comparison table is still there.',NULL),
  (sub,'Expanded the iPhone and Android advice; the advice section is otherwise unchanged.',NULL),
  (sub,'Expanded the advice; the rest is unchanged.',NULL),
  (rep,'Updated the price of phone B.','Pricing unchanged.')) x(facts,change,kept)
  WHERE cardinality(sophia.note_problems(x.change,x.kept,x.facts))<>0;
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'An honest note about a revised section was refused:\n%',bad; END IF;
END $$;

-- A key-word rename sets a removed section aside only from disclosure: a "kept" piece naming it by a word of its own
-- that the added heading does not share ("the table is retained" of a "Comparison table" become "Comparison at a
-- glance") is refused, and so is the claim that the rest was kept when no piece that does not say "kept" names the
-- renamed section. Before this review most were published.
DO $$ DECLARE bad text; v1 text:=(SELECT v1 FROM pilot); ren jsonb; seeded jsonb; wide jsonb;
 ctx constant jsonb:='{"disclose":true,"baseVersion":1,"baseSourceId":"37000000-0000-0000-0000-000000000001"}';
BEGIN
 ren:=sophia.section_facts(E'# Phone charging\n\n## Summary\nS.\n\n## Comparison table\n| A | B |\n|---|---|\n| 1 | 2 |\n\n## Recommendations\nR.\n',
  E'# Phone charging\n\n## Summary\nS.\n\n## Comparison at a glance\nA is faster than B.\n\n## Recommendations\nR2.\n');
 seeded:=sophia.section_facts(v1,replace(replace(v1,E'## Comparison table\n| Phone | Watts |\n|---|---|\n| A | 25 |\n',
  E'## Comparison summary\nA charges at 25 W.\n'),E'\nR.\n',E'\nR2.\n'));
 wide:=sophia.section_facts(v1,E'# USB-C fast charging for phones\n\n## Product summary\nS2.\n\n## Comparison at a glance\nA is fast.\n\n'
  ||E'## Revised recommendations\nR2.\n\n## Sources\n[1](x)\n');
 IF ren->'removed'<>'["Comparison table"]' OR ren->'added'<>'["Comparison at a glance"]' OR seeded->'removed'<>'["Comparison table"]'
   OR seeded->'added'<>'["Comparison summary"]' OR jsonb_array_length(wide->'removed')<>7 THEN
  RAISE EXCEPTION 'Unexpected facts: % % %',ren,seeded,wide; END IF;
 SELECT string_agg(format('%s | %s => %s',x.change,coalesce(x.kept,'-'),sophia.note_problems(x.change,x.kept,x.facts)),E'\n') INTO bad FROM (VALUES
  (ren,'Revised the recommendations.','The table and every other section are retained.',ARRAY['The kept note names "Comparison table", which was removed.']),
  (ren,'Revised the recommendations.','Every section, including the table, is retained.',ARRAY['The kept note names "Comparison table", which was removed.']),
  (ren,'Revised the recommendations; the table is unchanged.',NULL,ARRAY['The change note calls "Comparison table" unchanged, but it was removed.']),
  (ren,'Revised the recommendations; the comparison table is unchanged.',NULL,ARRAY['The change note calls "Comparison table" unchanged, but it was removed.']),
  (seeded,'Recommendations revised; the comparison table is unchanged.',NULL,ARRAY['The change note calls "Comparison table" unchanged, but it was removed.']),
  (seeded,'Revised the recommendations; the rest of the report is unchanged.',NULL,ARRAY['The notes say the rest of the report was kept, but 1 section '
   ||'was removed: "Comparison table".']),
  (seeded,'Revised the recommendations.','The table, citations and every other section are retained.',ARRAY['The kept note names "Comparison table", which was removed.']),
  (wide,'Revised the recommendations.','Product claims and the table are retained.',ARRAY['The kept note names "Product claims vs. evidence", which was removed.',
   'The kept note names "Comparison table", which was removed.','The notes do not say that 3 sections were removed: "Compatibility and standards", '
   ||'"Charging speed in practice", "Limitations of this review".'])) x(facts,change,kept,want)
  WHERE sophia.note_problems(x.change,x.kept,x.facts)<>x.want;
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'A renamed section called kept was published, or worded otherwise:\n%',bad; END IF;
 SELECT string_agg(format('%s | %s => %s',x.change,coalesce(x.kept,'-'),sophia.amendment_note_problems(x.change,x.kept,x.facts,ctx)),E'\n') INTO bad FROM (VALUES
  (ren,'Turned the comparison table into prose under a new heading.',NULL),
  (ren,'Renamed the comparison table section and wrote it as prose; the rest is unchanged.',NULL),
  (ren,'Rewrote the comparison as prose; the rest is unchanged.',NULL),
  (ren,'Revised the recommendations and rewrote the comparison in prose.',NULL),
  (seeded,'Revised the recommendations and turned the comparison table into a short summary.','The other sections are unchanged.')) x(facts,change,kept)
  WHERE cardinality(sophia.amendment_note_problems(x.change,x.kept,x.facts,ctx))<>0;
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'An honest note about a renamed section was refused:\n%',bad; END IF;
END $$;

-- A task that cannot read its base (a rebuild that dropped a withdrawn one) need not disclose what it removed, but its
-- notes may not claim the rest kept: refused by number, never naming a heading of the base, and with no restore.
-- Before this review the claim was published, and a key word called kept was refused with the base's heading.
DO $$ DECLARE f jsonb:=(SELECT f FROM pilot); bad text; ctx constant jsonb:='{"renamed":[],"disclose":false}'; BEGIN
 SELECT string_agg(format('%s | %s => %s',x.change,coalesce(x.kept,'-'),sophia.amendment_note_problems(x.change,x.kept,f,ctx)),E'\n') INTO bad FROM (VALUES
  ('Revised the recommendations; the remainder of the report is unchanged.','Everything else is retained as it was.',
   ARRAY['The notes say the rest of the report was kept, but 6 sections of the earlier version are no longer in it.']),
  ('Revised only the recommendations section; the remainder of the report is unchanged.',NULL,
   ARRAY['The notes say the rest of the report was kept, but 6 sections of the earlier version are no longer in it.']),
  ('Revised the recommendations; nothing else changed.',NULL,
   ARRAY['The notes say the rest of the report was kept, but 6 sections of the earlier version are no longer in it.']),
  ('Revised the recommendations.','Compatibility and limitations are retained.',ARRAY['The kept note names a section that is no longer in the report.']),
  ('Revised the recommendations.','The comparison table.',ARRAY['The kept note names a section that is no longer in the report.']),
  ('Revised the recommendations; the comparison table is unchanged.',NULL,
   ARRAY['The change note calls a section unchanged that is no longer in the report.']),
  ('Wrote new recommendations; the earlier version could not be read.',NULL,'{}'::text[]),
  ('Wrote new recommendations; the rest of the earlier report could not be carried over.',NULL,'{}'),
  ('Added the costs.','The host list.','{}')) x(change,kept,want)
  WHERE sophia.amendment_note_problems(x.change,x.kept,f,ctx)<>x.want;
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'A note without its base was misjudged:\n%',bad; END IF;
END $$;

-- A removed section the kept note names in full (0036's rule) is told where to restore it from too, like one named by
-- a key word. Before this review it was not.
DO $$ DECLARE v1 text:=(SELECT v1 FROM pilot); tab jsonb; p text[];
 ctx constant jsonb:='{"disclose":true,"baseVersion":1,"baseSourceId":"37000000-0000-0000-0000-000000000001"}';
BEGIN
 tab:=sophia.section_facts(v1,replace(replace(v1,E'## Comparison table\n| Phone | Watts |\n|---|---|\n| A | 25 |\n\n',''),E'\nR.\n',E'\nR2.\n'));
 p:=sophia.amendment_note_problems('Revised the recommendations.','All sections, including the comparison table.',tab,ctx);
 IF p<>ARRAY['The kept note names "Comparison table", which was removed.','New notes do not bring these sections back: research_write_draft '
   ||'replaced the whole report. Unless the request asked to remove them, restore them from version 1 (sourceId '
   ||'37000000-0000-0000-0000-000000000001) with research_write_draft, then submit again; if it did, name them in changeNote.'] THEN
  RAISE EXCEPTION 'A section named in full reads %',p; END IF;
END $$;

-- The submission contract holds whatever the facts: 25 removed headings of 2,000 characters give at most 20 distinct
-- problems of at most 300 characters, each called kept by a word of its own, left unnamed, called unchanged, or named
-- in full; so does a list of 2,000 removed headings, which also names where to restore them from.
DO $$ DECLARE o text; n text; bad text; f jsonb; many jsonb;
 ctx jsonb:='{"disclose":true,"baseVersion":12345,"baseSourceId":"37000000-0000-0000-0000-000000000001"}';
BEGIN
 SELECT string_agg(format(E'## Topic%s %s\nx\n',chr(97+i),repeat('alpha ',333)),E'\n'), string_agg(format('topic%s',chr(97+i)),', ')
  INTO o, n FROM generate_series(0,24) i;
 f:=sophia.section_facts(o,E'## Rest\ny\n');
 many:=sophia.section_facts((SELECT string_agg(format(E'## Topic %s %s\nx\n',i,repeat('alpha ',30)),E'\n') FROM generate_series(1,2000) i),
  E'## Rest\ny\n');
 IF jsonb_array_length(f->'removed')<>25 OR length(f->'removed'->>0)<2000 OR jsonb_array_length(many->'removed')<>2000 THEN
  RAISE EXCEPTION 'Unexpected facts'; END IF;
 SELECT string_agg(format('%s: %s',x.label,x.p),E'\n') INTO bad FROM (VALUES
   ('kept by a word',20,sophia.note_problems('Rewrote it.',n||' are kept.',f)),
   ('kept by a word, with a base',20,sophia.amendment_note_problems('Rewrote it.',n||' are kept.',f,ctx)),
   ('called unchanged',20,sophia.amendment_note_problems('The '||n||' sections are unchanged.',NULL,f,ctx)),
   ('left unnamed',2,sophia.amendment_note_problems('Rewrote it.','The rest is kept.',f,ctx)),
   ('one named in full, its words naming the rest',20,sophia.amendment_note_problems('Rewrote it.','Kept: '||(f->'removed'->>0)||'.',f,ctx)),
   ('2,000 left unnamed',2,sophia.amendment_note_problems('Rewrote it.','The rest is kept.',many,ctx))) x(label,want,p)
  WHERE cardinality(x.p)<>x.want OR EXISTS(SELECT 1 FROM unnest(x.p) y WHERE length(y)>300)
   OR cardinality(x.p)<>(SELECT count(DISTINCT y) FROM unnest(x.p) y);
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'Problems past the contract:\n%',bad; END IF;
 IF (sophia.amendment_note_problems('Rewrote it.','The rest is kept.',many,ctx))[1]<>'The notes say the rest of the report was kept, but '
   ||'2000 sections were removed: "Topic 1 alpha alpha alpha alpha alpha alpha alpha alpha alp…", "Topic 2 alpha alpha alpha alpha '
   ||'alpha alpha alpha alpha alp…", "Topic 3 alpha alpha alpha alpha alpha alpha alpha alpha alp…", … and 1997 more.' THEN
  RAISE EXCEPTION 'A long list reads %',(sophia.amendment_note_problems('Rewrote it.','The rest is kept.',many,ctx))[1]; END IF;
 -- Key words are read from the first 200 characters, so no word is too long to read and a long heading costs no more.
 IF sophia.note_words(repeat('x',3000)||' summary')<>ARRAY[repeat('x',200)] THEN
  RAISE EXCEPTION 'Key words read past 200 characters: %',sophia.note_words(repeat('x',3000)||' summary'); END IF;
END $$;

-- The notes are read once and the removed and revised sections set-wise: 2,000 removed headings (as many remaining),
-- or 2,000 revised ones, and two notes of 200 characters cost about 4 times what 500 do; the quiet ones are named
-- whatever their number.
CREATE TEMP TABLE sized ON COMMIT DROP AS SELECT x.n, sophia.section_facts(
  (SELECT string_agg(format(E'## Topic %s on hosting costs\nx\n',i),E'\n') FROM generate_series(1,x.n) i),
  (SELECT string_agg(format(E'## Region %s\ny\n',i),E'\n') FROM generate_series(1,x.n) i)) AS f,
 sophia.section_facts((SELECT string_agg(format(E'## Topic %s on hosting costs\nx\n',i),E'\n') FROM generate_series(1,x.n) i),
  (SELECT string_agg(format(E'## Topic %s on hosting costs\ny\n',i),E'\n') FROM generate_series(1,x.n) i)) AS revised
 FROM (VALUES (500),(2000)) x(n);
CREATE FUNCTION pg_temp.revised_notes(p_n integer) RETURNS text[] LANGUAGE sql AS $$
 SELECT sophia.amendment_note_problems('Rewrote the topics on hosting costs as asked.',
  rpad('Topic 7 on hosting costs is unchanged; topic 9 on hosting costs is as it was',200,' and so on'),revised,'{}') FROM sized WHERE n=p_n $$;
CREATE FUNCTION pg_temp.long_notes(p_n integer) RETURNS text[] LANGUAGE sql AS $$
 SELECT sophia.amendment_note_problems(
  rpad('Rewrote the recommendations with a budget option and a section on prices; the regions were trimmed as asked',200,' and more'),
  rpad('The remainder of the report is unchanged: hosts, prices, regions and the comparison table are kept as they were',200,' as is'),
  f,'{"disclose":true,"baseVersion":1,"baseSourceId":"37000000-0000-0000-0000-000000000001"}') FROM sized WHERE n=p_n $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM unnest(pg_temp.long_notes(2000)) p WHERE p ~ '^The kept note names "Topic [0-9]+ on hosting costs", which was removed\.$')<>19
   OR (pg_temp.long_notes(2000))[20] !~ '^New notes do not bring these sections back'
   OR jsonb_array_length((SELECT f FROM sized WHERE n=2000)->'removed')<>2000 THEN
  RAISE EXCEPTION 'The long notes read %',pg_temp.long_notes(2000); END IF;
 IF NOT (pg_temp.long_notes(500)::text ~ 'Topic 1 on') THEN RAISE EXCEPTION 'The smaller facts read %',pg_temp.long_notes(500); END IF;
 PERFORM pg_temp.assert_linear('The gate over removed headings and long notes',$q$SELECT pg_temp.long_notes(%s)$q$,500);
 IF pg_temp.revised_notes(2000)<>ARRAY['The note calls "Topic 7 on hosting costs" unchanged, but it was revised.',
   'The note calls "Topic 9 on hosting costs" unchanged, but it was revised.']
   OR jsonb_array_length((SELECT revised FROM sized WHERE n=2000)->'revised')<>2000 THEN
  RAISE EXCEPTION 'The revised headings read %',pg_temp.revised_notes(2000); END IF;
 PERFORM pg_temp.assert_linear('The gate over revised headings',$q$SELECT pg_temp.revised_notes(%s)$q$,500);
 IF (SELECT sophia.note_problems('Rewrote the recommendations.','The rest is unchanged.',f) FROM sized WHERE n=2000)
   <>ARRAY['The notes say the rest of the report was kept, but 2000 sections were removed: "Topic 1 on hosting costs", "Topic 2 on hosting costs", '
   ||'"Topic 3 on hosting costs", "Topic 4 on hosting costs", "Topic 5 on hosting costs", "Topic 6 on hosting costs", "Topic 7 on '
   ||'hosting costs", … and 1993 more.'] THEN
  RAISE EXCEPTION 'The quiet ones read %',(SELECT sophia.note_problems('Rewrote the recommendations.','The rest is unchanged.',f) FROM sized WHERE n=2000);
 END IF;
END $$;

-- Notes written from the facts keep whole headings within 200 characters: the removed first, then the added, then the
-- revised, what does not fit counted; written in 0027's order and form, so short facts read as they did.
DO $$ DECLARE f jsonb:=(SELECT f FROM pilot); t record; heads text[]; part text; names text[]; kind text;
BEGIN
 SELECT * INTO t FROM sophia.template_notes(f);
 IF t.change_note<>'2 added; 7 removed: Summary, Compatibility and standards, Charging speed in practice, Product claims vs. evidence, '
   ||'Comparison table, Recommendations for buyers, Limitations of this review.' OR t.retained_note<>'1 unchanged: USB-C fast charging for phones.' THEN
  RAISE EXCEPTION 'The pilot''s notes from the facts read % / %',t.change_note,t.retained_note; END IF;
 SELECT * INTO t FROM sophia.template_notes(sophia.section_facts(E'# Hosts\nA.\n\n## Costs\nUnknown.\n\n## Conclusion\nUse A.\n',
  E'# Hosts\nA.\n\n## Costs\nA is $1 a page.\n\n## Pricing tiers\nThree tiers.\n'));
 IF (t.change_note,t.retained_note)<>('1 revised: Costs; 1 added: Pricing tiers; 1 removed: Conclusion.'::text,'1 unchanged: Hosts.'::text) THEN
  RAISE EXCEPTION 'Short facts read % / %',t.change_note,t.retained_note; END IF;
 IF (SELECT (x.change_note,x.retained_note) FROM sophia.template_notes(sophia.section_facts(E'# A\nx\n',E'# A\nx\n')) x)
   <>('No section changed.'::text,'1 unchanged: A.'::text) THEN
  RAISE EXCEPTION 'No change reads otherwise'; END IF;
 -- 40 sections of each kind, with headings of 20 to 60 characters, and one heading longer than the note: each list
 -- names whole headings, in order, then what it left out.
 f:=jsonb_build_object('conclusionChanged',false,
  'removed',(SELECT jsonb_agg(format('Removed %s %s',i,repeat('r',i)) ORDER BY i) FROM generate_series(10,49) i),
  'added',(SELECT jsonb_agg(format('Added %s %s',i,repeat('a',i)) ORDER BY i) FROM generate_series(10,49) i),
  'revised',(SELECT jsonb_agg(format('Revised %s',i)) FROM generate_series(1,40) i)||jsonb_build_array(repeat('long ',60)),
  'unchanged',(SELECT jsonb_agg(format('Unchanged %s %s',i,repeat('u',i)) ORDER BY i) FROM generate_series(10,49) i));
 SELECT * INTO t FROM sophia.template_notes(f);
 IF length(t.change_note)>200 OR length(t.retained_note)>200 OR t.change_note !~ '^41 revised(: [^;]*)?; 40 added(: [^;]*)?; 40 removed: Removed 10 r+, .*\.$'
   OR t.retained_note !~ '^40 unchanged: Unchanged 10 u+, .*\.$' THEN
  RAISE EXCEPTION 'Long facts read % / %',t.change_note,t.retained_note; END IF;
 -- Each part: its count, then whole headings of its kind in order, then how many it left out.
 FOREACH part IN ARRAY regexp_split_to_array(rtrim(t.change_note,'.'),'; ')||rtrim(t.retained_note,'.') LOOP
  kind:=substring(part FROM '^[0-9]+ ([a-z]+)');
  SELECT array_agg(x ORDER BY i) INTO heads FROM jsonb_array_elements_text(f->kind) WITH ORDINALITY e(x,i);
  names:=CASE WHEN part ~ ': ' THEN regexp_split_to_array(regexp_replace(substring(part FROM ': (.*)$'),', … and [0-9]+ more$',''),', ') ELSE '{}' END;
  IF names<>heads[1:cardinality(names)] OR substring(part FROM '^([0-9]+) ')::integer<>cardinality(heads)
    OR coalesce(substring(part FROM ', … and ([0-9]+) more$')::integer,0)<>(CASE WHEN cardinality(names)>0 THEN cardinality(heads)-cardinality(names) ELSE 0 END) THEN
   RAISE EXCEPTION 'A part names a cut heading, or miscounts: %',part; END IF;
 END LOOP;
END $$;

-- Every research task is asked to keep the shape its question states; a task without a base reads research_prompt's
-- text (0025) first, as it did.
DO $$ DECLARE m jsonb:='{"schema":"sophia.research-manifest.v1","question":"About 500 words, four sections, at most 2 searches.",'
   '"outputs":["markdown"],"base":null}';
 line constant text:='If the question states a length, the sections it wants, or a limit on web searches or page reads, keep to it, and '
  ||'say in the limitations where you could not.';
BEGIN
 IF sophia.research_task_statement('37000000-0000-0000-0000-00000000000f',m)<>sophia.research_prompt(m)||E'\n\n'||line
   OR sophia.research_task_statement('37000000-0000-0000-0000-00000000000f',m-'base')<>sophia.research_prompt(m-'base')||E'\n\n'||line THEN
  RAISE EXCEPTION 'A task without a base reads %',sophia.research_task_statement('37000000-0000-0000-0000-00000000000f',m); END IF;
END $$;

-- Grants mirror 0036: the gate, its helpers, the citation rule and the task statement are callable by no one but their
-- owner (the submit and the dispatch run as it); the dispatch stays the worker's alone, and both it and the publish run
-- as the owner on their search path. The others run as their caller, on theirs.
DO $$ DECLARE fn text; conf text[]; BEGIN
 FOR fn, conf IN SELECT * FROM (VALUES
   ('sophia.note_words(text)','{search_path=pg_catalog}'),('sophia.note_pieces(text,boolean)','{search_path=pg_catalog}'),
   ('sophia.note_removes_all(text)','{search_path=pg_catalog}'),('sophia.note_blanket(text,text)','{search_path=pg_catalog}'),
   ('sophia.note_names(text[],integer,boolean)','{search_path=pg_catalog}'),
   ('sophia.amendment_note_problems(text,text,jsonb,jsonb)','{search_path=pg_catalog}'),
   ('sophia.note_problems(text,text,jsonb)','{search_path=pg_catalog}'),('sophia.template_notes(jsonb)','{search_path=pg_catalog}'),
   ('sophia.research_citable(sophia.research_scope,uuid)','{"search_path=pg_catalog, sophia"}'),
   ('sophia.research_draft_citations(sophia.research_scope,jsonb,jsonb)','{"search_path=pg_catalog, sophia"}'),
   ('sophia.research_task_statement(uuid,jsonb)','{"search_path=pg_catalog, sophia"}')) x(f,c) LOOP
  IF has_function_privilege('sophia_api',fn,'EXECUTE') OR has_function_privilege('sophia_worker',fn,'EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=fn::regprocedure AND a.grantee=0)
    OR (SELECT prosecdef OR proconfig IS DISTINCT FROM conf FROM pg_proc WHERE oid=fn::regprocedure) THEN
   RAISE EXCEPTION '% is callable by PUBLIC, the API or the worker role, or runs otherwise',fn; END IF;
 END LOOP;
 fn:='sophia.research_publish(sophia.research_scope,text,jsonb)';
 IF has_function_privilege('sophia_api',fn,'EXECUTE') OR has_function_privilege('sophia_worker',fn,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=fn::regprocedure AND a.grantee=0)
   OR NOT (SELECT prosecdef AND proconfig=ARRAY['search_path=pg_catalog, sophia'] FROM pg_proc WHERE oid=fn::regprocedure) THEN
  RAISE EXCEPTION 'The publish''s grants or definer changed'; END IF;
 fn:='sophia.dispatch_runtime_outbox(uuid,uuid,uuid)';
 IF NOT has_function_privilege('sophia_worker',fn,'EXECUTE') OR has_function_privilege('sophia_api',fn,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid=fn::regprocedure AND a.grantee=0)
   OR NOT (SELECT prosecdef AND proconfig=ARRAY['search_path=pg_catalog, sophia'] FROM pg_proc WHERE oid=fn::regprocedure) THEN
  RAISE EXCEPTION 'The dispatch''s grants or definer changed'; END IF;
END $$;
ROLLBACK;
