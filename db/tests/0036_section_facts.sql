-- 0036: section facts pair each section at most once, and the truth gate reads the conclusion and the
-- recommendations apart. Pure functions: nothing to seed. Run by pnpm test:sql after every migration; it rolls back.
BEGIN;
-- markdown_outline splits exactly as markdown_sections (0027): same sections, anchors, headings and body hashes.
DO $$ DECLARE t text:=E'Intro.\r\n# Hosts ##\nA.\n\n##\tCosts\n```\n# not a heading\n```\n  ### ???\nx\n#### C# notes\ny\n## Pros #\n';
BEGIN
 IF EXISTS((SELECT ord,anchor,heading,body_hash FROM sophia.markdown_sections(t)) EXCEPT ALL
   (SELECT ord,anchor,heading,body_hash FROM sophia.markdown_outline(t)))
  OR (SELECT count(*) FROM sophia.markdown_outline(t))<>(SELECT count(*) FROM sophia.markdown_sections(t)) THEN
  RAISE EXCEPTION 'markdown_outline splits differently from markdown_sections'; END IF;
 IF (SELECT array_agg(path ORDER BY ord) FROM sophia.markdown_outline(t))
   <>ARRAY['','/hosts','/hosts/costs','/hosts/costs/','/hosts/costs//c-notes','/hosts/pros'] THEN
  RAISE EXCEPTION 'Heading paths wrong: %',(SELECT array_agg(path ORDER BY ord) FROM sophia.markdown_outline(t)); END IF;
END $$;
-- A repeated subheading is one section per occurrence: identical texts have no change, one edit is one revision, and a
-- new option's Pros (inserted between A and B) is added. Each section is counted once on each side.
DO $$ DECLARE
 o text:=E'# Options\n\n## Option A\nFast.\n\n### Pros\nCheap.\n\n### Cons\nLoud.\n\n## Option B\nSlow.\n\n### Pros\nQuiet.\n\n### Cons\nCostly.\n';
 n text:=replace(replace(o,'Cheap.','Cheap and simple.'),'## Option B',E'## Option C\nNew.\n\n### Pros\nFree.\n\n## Option B'); f jsonb;
BEGIN
 f:=sophia.section_facts(o,o);
 IF f<>jsonb_build_object('added','[]'::jsonb,'revised','[]'::jsonb,'removed','[]'::jsonb,'unchanged',
   '["Options","Option A","Pros","Cons","Option B","Pros","Cons"]'::jsonb,'conclusionChanged',false) THEN
  RAISE EXCEPTION 'Identical texts report a change: %',f; END IF;
 IF cardinality(sophia.note_problems('No changes.',NULL,f))<>0 THEN RAISE EXCEPTION 'A true "No changes." was refused'; END IF;
 f:=sophia.section_facts(o,n);
 IF f<>jsonb_build_object('added','["Option C","Pros"]'::jsonb,'revised','["Pros"]'::jsonb,'removed','[]'::jsonb,
   'unchanged','["Options","Option A","Cons","Option B","Pros","Cons"]'::jsonb,'conclusionChanged',false) THEN
  RAISE EXCEPTION 'Repeated headings miscounted: %',f; END IF;
 -- The same path repeated ('## Update' three times under one title) pairs by occurrence, never each with each.
 o:=E'# Log\n## Update\nMon.\n## Update\nTue.\n## Update\nWed.\n';
 f:=sophia.section_facts(o,replace(o,'Tue.','Tue, late.'));
 IF f<>'{"added":[],"revised":["Update"],"removed":[],"unchanged":["Log","Update","Update"],"conclusionChanged":false}' THEN
  RAISE EXCEPTION 'One edit among repeated paths miscounted: %',f; END IF;
 f:=sophia.section_facts(o,o||E'## Update\nThu.\n');
 IF f<>'{"added":["Update"],"revised":[],"removed":[],"unchanged":["Log","Update","Update","Update"],"conclusionChanged":false}' THEN
  RAISE EXCEPTION 'An appended repeated path miscounted: %',f; END IF;
END $$;
-- What is left after the path pass pairs on the path below the title, then by anchor, each in order: a renamed title
-- keeps its sections, repeated ones each with its own; a renamed parent keeps its children in order; a removed
-- Option B takes its own Pros, never A's.
DO $$ DECLARE f jsonb;
 o text:=E'# Options\n\n## Option A\nFast.\n\n### Pros\nCheap.\n\n### Cons\nLoud.\n\n## Option B\nSlow.\n\n### Pros\nQuiet.\n\n### Cons\nCostly.\n';
 l text:=E'# Log\n## Update\nMon.\n## Update\nTue.\n## Update\nWed.\n';
 w text:=E'# T\n## Week\n### Update\nMon.\n### Update\nTue.\n### Update\nWed.\n';
BEGIN
 f:=sophia.section_facts(o,replace(o,'# Options','# Choices'));
 IF f<>'{"added":["Choices"],"revised":[],"removed":["Options"],"unchanged":["Option A","Pros","Cons","Option B","Pros","Cons"],"conclusionChanged":false}' THEN
  RAISE EXCEPTION 'A renamed title mixed up repeated sections: %',f; END IF;
 f:=sophia.section_facts(o,replace(replace(o,'# Options','# Options, with C'),'## Option B',E'## Option C\nNew.\n\n### Pros\nFree.\n\n## Option B'));
 IF f<>'{"added":["Options, with C","Option C","Pros"],"revised":[],"removed":["Options"],"unchanged":["Option A","Pros","Cons","Option B","Pros","Cons"],"conclusionChanged":false}' THEN
  RAISE EXCEPTION 'A renamed title with a new option read an untouched section as revised: %',f; END IF;
 f:=sophia.section_facts(l,replace(l,'# Log','# Journal'));
 IF f<>'{"added":["Journal"],"revised":[],"removed":["Log"],"unchanged":["Update","Update","Update"],"conclusionChanged":false}' THEN
  RAISE EXCEPTION 'A renamed title paired repeated paths out of order: %',f; END IF;
 f:=sophia.section_facts(w,replace(w,'## Week','## Week 1'));
 IF f<>'{"added":["Week 1"],"revised":[],"removed":["Week"],"unchanged":["T","Update","Update","Update"],"conclusionChanged":false}' THEN
  RAISE EXCEPTION 'A renamed parent paired its children out of order: %',f; END IF;
 f:=sophia.section_facts(E'# Hosting\n\n## Pros\na\n\n## Cons\nb\n',E'# Hosting, with costs\n\n## Pros\na\n\n## Cons\nb2\n');
 IF f<>'{"added":["Hosting, with costs"],"revised":["Cons"],"removed":["Hosting"],"unchanged":["Pros"],"conclusionChanged":false}' THEN
  RAISE EXCEPTION 'A renamed title lost its sections: %',f; END IF;
 f:=sophia.section_facts(E'## Option A\nx\n\n### Pros\na\n\n## Option B\ny\n\n### Pros\nb\n',E'## Option A\nx\n\n### Pros\na\n');
 IF f<>'{"added":[],"revised":[],"removed":["Option B","Pros"],"unchanged":["Option A","Pros"],"conclusionChanged":false}' THEN
  RAISE EXCEPTION 'A removed option took the wrong Pros: %',f; END IF;
END $$;
-- The gate, per noun: each true note is published, each contradiction refused with its own sentence.
DO $$ DECLARE b text:=E'# R\n\n## Findings\nA.\n\n## Methods\nM.\n\n## Recommendations\nUse A.\n\n## Conclusion\nA wins.\n';
 r jsonb; c jsonb; bad text;
BEGIN
 r:=sophia.section_facts(b,replace(b,'Use A.','Use A and B.')); c:=sophia.section_facts(b,replace(b,'A wins.','B wins.'));
 IF NOT (r->>'conclusionChanged')::boolean OR NOT (c->>'conclusionChanged')::boolean THEN
  RAISE EXCEPTION 'conclusionChanged no longer covers both kinds'; END IF;
 SELECT string_agg(format('%s | %s | %s',x.f,x.change,coalesce(x.kept,'')),E'\n') INTO bad FROM (VALUES
  ('r','Recommendations expanded; conclusion unchanged.',NULL,'{}'),
  ('r','Recommendations cover B; costs unchanged.',NULL,'{}'),
  ('r','Recommendations cover B, costs unchanged.',NULL,'{}'),
  ('r','Recommendations expanded, conclusion unchanged.',NULL,'{}'),
  ('r','Recommendations expanded.','The conclusion is unchanged.','{}'),
  ('r','The recommendation changed but the conclusion is unchanged.',NULL,'{}'),
  ('r','Recommendations expanded and methods unchanged.',NULL,'{}'),
  ('r','Recommendations expanded — methods unchanged.',NULL,'{}'),
  ('r','Rewrote the recommendations','Unchanged sources and findings.','{}'),
  ('r','Expanded the recommendations; no changes to the conclusion.',NULL,'{}'),
  ('r','Nothing changed in the conclusion; recommendations expanded.',NULL,'{}'),
  ('r','No changes, except to the recommendations.',NULL,'{}'),
  ('r','Everything except the recommendations is unchanged.',NULL,'{}'),
  ('r','Recommendations unchanged.',NULL,'{"The note calls the recommendations unchanged, but they changed."}'),
  ('r','Findings tightened.','Recommendations: unchanged.','{"The note calls the recommendations unchanged, but they changed."}'),
  ('r','Recommendations and conclusion unchanged.',NULL,'{"The note calls the recommendations unchanged, but they changed."}'),
  ('c','Conclusion now favours B; recommendations unchanged.',NULL,'{}'),
  ('c','Conclusion: unchanged.',NULL,'{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Recommendations expanded but the conclusion is unchanged.',NULL,'{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','No change to the conclusion.',NULL,'{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','No changes.','The conclusion stays the same.',
   '{"The note says nothing changed, but 1 sections changed.","The note calls the conclusion unchanged, but it changed."}'),
  -- "Nothing changed" about the whole text is refused whatever follows; about a section left as it was, published.
  ('c','Unchanged.',NULL,'{"The note says nothing changed, but 1 sections changed."}'),
  ('c','No changes to the report.',NULL,'{"The note says nothing changed, but 1 sections changed."}'),
  ('c','No changes to any section.',NULL,'{"The note says nothing changed, but 1 sections changed."}'),
  ('c','No changes in substance.',NULL,'{"The note says nothing changed, but 1 sections changed."}'),
  ('c','Nothing changed in the text.',NULL,'{"The note says nothing changed, but 1 sections changed."}'),
  ('c','No changes in this version.',NULL,'{"The note says nothing changed, but 1 sections changed."}'),
  ('c','Nothing changed in the content.',NULL,'{"The note says nothing changed, but 1 sections changed."}'),
  ('c','No changes to speak of.',NULL,'{"The note says nothing changed, but 1 sections changed."}'),
  ('c','No change in the findings.',NULL,'{}'),
  ('c','No changes to the methods or findings.',NULL,'{}'),
  ('c','Nothing changed in the conclusion.',NULL,'{"The note calls the conclusion unchanged, but it changed."}'),
  ('r','Nothing changed in the recommendations.',NULL,'{"The note calls the recommendations unchanged, but they changed."}'),
  -- A claim on a coordinated subject (a list, "and its/all", a parenthesis, "as before") still names each noun.
  ('c','Light edits.','The conclusion and its recommendations are unchanged.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Light edits.','The conclusion and all recommendations are unchanged.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Light edits.','The conclusion and all the recommendations are unchanged.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Light edits.','The conclusion and its two recommendations are unchanged.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Light edits.','The conclusion (and the recommendations) are unchanged.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Light edits.','The recommendations, and the conclusion, are unchanged.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Light edits.','Conclusion, recommendations: unchanged.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Light edits.','Conclusion, methods and sources are unchanged.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Light edits.','The conclusion, methods and sources stay the same.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Light edits.','The conclusion, as before, is unchanged.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Light edits.','The conclusion now reads the same as before.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Light edits.','Unchanged: conclusion and findings.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Light edits.','The conclusion did not change.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Light edits.','The conclusion stays.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','Light edits.','The conclusion of this long and careful report is unchanged.','{"The note calls the conclusion unchanged, but it changed."}'),
  ('c','The conclusion favours B – the findings stay.',NULL,'{}'),
  ('c','The conclusion now favours B and the findings stay.',NULL,'{}'),
  ('c','New conclusion, findings unchanged.',NULL,'{}'),
  ('c','Revised the conclusion, methods unchanged.',NULL,'{}'),
  ('r','Light edits.','The recommendations, like the rest, are unchanged.','{"The note calls the recommendations unchanged, but they changed."}'),
  ('r','Light edits.','Recommendations, conclusion: unchanged.','{"The note calls the recommendations unchanged, but they changed."}'),
  ('r','Same conclusion and recommendations.',NULL,'{"The note calls the recommendations unchanged, but they changed."}'),
  ('r','Unchanged conclusion and recommendations.',NULL,'{"The note calls the recommendations unchanged, but they changed."}'),
  ('r','Unchanged: conclusion and recommendations.',NULL,'{"The note calls the recommendations unchanged, but they changed."}')
  ) x(f,change,kept,want)
 WHERE sophia.note_problems(x.change,x.kept,CASE x.f WHEN 'r' THEN r ELSE c END)<>x.want::text[];
 IF bad IS NOT NULL THEN RAISE EXCEPTION E'The gate misread:\n%',bad; END IF;
 -- A title named like the whole text does not make "no changes to the report" a note about one section.
 c:=sophia.section_facts(replace(b,'# R','# Report'),replace(replace(b,'# R','# Report'),'A wins.','B wins.'));
 IF sophia.note_problems('No changes to the report.',NULL,c)<>ARRAY['The note says nothing changed, but 1 sections changed.'] THEN
  RAISE EXCEPTION 'A section named Report excused "No changes to the report."'; END IF;
END $$;
-- A removed heading the kept note names is refused once, and not while a section of that name remains; at most 20
-- problems of at most 300 characters (the submission contract).
DO $$ DECLARE f jsonb; p text[]; o text; BEGIN
 f:=sophia.section_facts(E'## Option A\nx\n\n### Pros\na\n\n## Option B\ny\n\n### Pros\nb\n',E'## Option A\nx\n\n### Pros\na\n');
 IF cardinality(sophia.note_problems('Dropped option B.','The pros of option A.',f))<>0 THEN
  RAISE EXCEPTION 'A kept note naming a Pros that remains was refused'; END IF;
 IF sophia.note_problems('Dropped.','Option B and its pros.',f)<>ARRAY['The kept note names "Option B", which was removed.'] THEN
  RAISE EXCEPTION 'A kept note naming the removed option was accepted'; END IF;
 f:=sophia.section_facts(E'## Q\nq\n\n### Risks\na\n\n## R\nr\n\n### Risks\nb\n',E'## Q\nq\n');
 IF sophia.note_problems('Dropped R.','Kept the risks.',f)<>ARRAY['The kept note names "Risks", which was removed.'] THEN
  RAISE EXCEPTION 'A removed repeated heading was named more than once, or not at all: %',sophia.note_problems('Dropped R.','Kept the risks.',f); END IF;
 SELECT string_agg(format(E'## Part %s\nx\n',i),E'\n') INTO o FROM generate_series(1,25) i;
 p:=sophia.note_problems('Dropped the parts.',(SELECT string_agg('Part '||i,' ') FROM generate_series(1,25) i),sophia.section_facts(o,E'## Rest\ny\n'));
 IF cardinality(p)<>20 OR EXISTS(SELECT 1 FROM unnest(p) x WHERE length(x)>300) THEN
  RAISE EXCEPTION 'Problems exceed the contract: % of them',cardinality(p); END IF;
END $$;
-- Grants mirror 0027: nothing here is callable by the API or worker roles.
DO $$ DECLARE fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['sophia.heading_anchor(text)','sophia.markdown_outline(text)','sophia.note_keeps(text,text,text)',
   'sophia.section_facts(text,text)','sophia.note_problems(text,text,jsonb)'] LOOP
  IF has_function_privilege('sophia_api',fn,'EXECUTE') OR has_function_privilege('sophia_worker',fn,'EXECUTE') THEN
   RAISE EXCEPTION '% is callable by the API or worker role',fn; END IF;
 END LOOP;
END $$;
ROLLBACK;
