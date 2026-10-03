-- 0036: section facts pair each section at most once, the truth gate reads the conclusion and the recommendations
-- apart, and a result cites what its draft cites. Run by pnpm test:sql after every migration; it rolls back.
BEGIN;
-- markdown_outline splits as markdown_sections (0027): same sections, anchors, headings and body hashes. One difference
-- on purpose, as Studio's sectionsOf reads it: text before the first heading that is only newlines and tabs is no
-- section (markdown_sections' btrim strips spaces alone, so it kept one).
DO $$ DECLARE t text:=E'Intro.\r\n# Hosts ##\nA.\n\n##\tCosts\n```\n# not a heading\n```\n  ### ???\nx\n#### C# notes\ny\n## Pros #\n';
 blank text:=E'\n \t\r\n# Hosts\nA.\n'; started timestamptz;
BEGIN
 IF (SELECT array_agg(coalesce(heading,'(introduction)') ORDER BY ord) FROM sophia.markdown_sections(blank))<>ARRAY['(introduction)','Hosts']
   OR (SELECT array_agg(coalesce(heading,'(introduction)') ORDER BY ord) FROM sophia.markdown_outline(blank))<>ARRAY['Hosts']
   OR (SELECT body_hash FROM sophia.markdown_outline(blank))<>(SELECT body_hash FROM sophia.markdown_sections(blank) WHERE ord=1) THEN
  RAISE EXCEPTION 'Blank lines before the first heading: %',(SELECT array_agg(heading ORDER BY ord) FROM sophia.markdown_outline(blank)); END IF;
 -- Each body is joined once: a 256 KiB section of short lines (the draft cap) takes well under a second, where adding
 -- line by line copied the body each time (about 2 s here).
 started:=clock_timestamp();
 PERFORM count(*) FROM sophia.markdown_outline(E'# Notes\n'||repeat(E'a\n',131068));
 IF clock_timestamp()-started>interval '1 second' THEN
  RAISE EXCEPTION 'A long section took %',clock_timestamp()-started; END IF;
 -- Whitespace as Studio's sectionsOf reads it (JavaScript's): an introduction that is only a no-break space or a byte
 -- order mark is no section either, and a heading's text drops them at its ends.
 IF (SELECT array_agg(coalesce(heading,'(introduction)') ORDER BY ord)
    FROM sophia.markdown_outline(chr(65279)||E'\n'||chr(160)||E'\n# Hosts'||chr(160)||E'\nA.\n'))<>ARRAY['Hosts']
   OR sophia.section_facts(chr(65279)||E'\n# Hosts\nA.\n',E'# Hosts\nA.\n')
    <>'{"added":[],"revised":[],"removed":[],"unchanged":["Hosts"],"conclusionChanged":false}'
   OR sophia.section_facts(E'# Hosts\nA.\n',chr(160)||E'\n# Hosts\nA.\n')->'added'<>'[]' THEN
  RAISE EXCEPTION 'A blank introduction of JavaScript whitespace made a section'; END IF;
 -- An anchor reads those spaces as Studio's anchorOf does: a byte order mark or a no-break space joins words with '-'.
 IF sophia.heading_anchor('Fast'||chr(65279)||'hosts'||chr(160)||chr(160)||'2026')<>'fast-hosts-2026' THEN
  RAISE EXCEPTION 'An anchor read JavaScript whitespace unlike Studio: %',
   sophia.heading_anchor('Fast'||chr(65279)||'hosts'||chr(160)||chr(160)||'2026'); END IF;
 -- One heading line of spaces at the draft cap reads in well under a second (cutting its closing marks with a lazy
 -- match took minutes).
 started:=clock_timestamp();
 IF (SELECT heading FROM sophia.markdown_outline('# a'||repeat(' ',262140)||'b ##'))<>'a'||repeat(' ',262140)||'b' THEN
  RAISE EXCEPTION 'A long heading lost its text'; END IF;
 IF clock_timestamp()-started>interval '1 second' THEN
  RAISE EXCEPTION 'A heading line of spaces took %',clock_timestamp()-started; END IF;
 IF EXISTS((SELECT ord,anchor,heading,body_hash FROM sophia.markdown_sections(t)) EXCEPT ALL
   (SELECT ord,anchor,heading,body_hash FROM sophia.markdown_outline(t)))
  OR (SELECT count(*) FROM sophia.markdown_outline(t))<>(SELECT count(*) FROM sophia.markdown_sections(t)) THEN
  RAISE EXCEPTION 'markdown_outline splits differently from markdown_sections'; END IF;
 IF (SELECT array_agg(path ORDER BY ord) FROM sophia.markdown_outline(t))
   <>ARRAY['','/hosts','/hosts/costs','/hosts/costs/','/hosts/costs//c-notes','/hosts/pros'] THEN
  RAISE EXCEPTION 'Heading paths wrong: %',(SELECT array_agg(path ORDER BY ord) FROM sophia.markdown_outline(t)); END IF;
END $$;
-- markdown_outline reads a heading as Studio's sectionsOf does, in one pass. The reference is 0027's loop read as Studio
-- reads it: its pattern with JavaScript's whitespace and '.' (which stops at CR, U+2028 and U+2029), an introduction
-- of whitespace alone dropped. They agree on shapes and on 3000 generated texts (closing #s, tabs, line separators,
-- fences, no-break spaces); a heading with 256 KiB of spaces, or 128K short lines, take well under a second.
CREATE FUNCTION pg_temp.studio_outline(p_text text) RETURNS TABLE(ord integer, heading text, body_hash text)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE ws constant text:='[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]';
 line text; fenced boolean:=false; cur_heading text:=NULL; cur_body text:=''; n integer:=0; m text[];
BEGIN
 FOREACH line IN ARRAY regexp_split_to_array(coalesce(p_text,''),E'\r?\n')||NULL::text LOOP
  IF line ~ ('^'||ws||'{0,3}(```|~~~)') THEN fenced:=NOT fenced; END IF;
  m:=CASE WHEN fenced THEN NULL ELSE regexp_match(line,'^'||ws||'{0,3}#{1,6}'||ws||'+([^\r\u2028\u2029]*?)'||ws||'*#*'||ws||'*$') END;
  IF line IS NULL OR m[1]<>'' THEN
   IF cur_heading IS NOT NULL OR regexp_replace(cur_body,ws,'','g')<>'' THEN
    ord:=n; heading:=cur_heading;
    body_hash:=encode(sha256(convert_to(btrim(regexp_replace(cur_body,ws||'+',' ','g'),' '),'UTF8')),'hex');
    RETURN NEXT; n:=n+1;
   END IF;
   cur_heading:=m[1]; cur_body:='';
  ELSE
   cur_body:=cur_body||line||E'\n';
  END IF;
 END LOOP;
END $$;
DO $$ DECLARE t text; started timestamptz;
BEGIN
 FOR t IN SELECT x FROM unnest(ARRAY[E'# Title ##\n## a #b\n#   \n# a'||chr(8232)||E'b\n####### x\n## x \t#  \n#\t#\n# #a#',
   E'# a'||repeat(' ',300)||E'b\n## c'||repeat(' ',300)||'#'||repeat(' ',300)]) x
  UNION ALL SELECT (SELECT string_agg((ARRAY[' ','#','a',E'\t',E'\n','#',' ','b',chr(8232),E'\r','`','~',chr(160),'##'])
    [1+(('x'||substr(md5(i||'-'||j),1,4))::bit(16)::int % 14)],'') FROM generate_series(1,40) j) FROM generate_series(1,3000) i LOOP
  IF EXISTS((SELECT ord,heading,body_hash FROM pg_temp.studio_outline(t)) EXCEPT ALL
    (SELECT ord,heading,body_hash FROM sophia.markdown_outline(t)))
   OR (SELECT count(*) FROM sophia.markdown_outline(t))<>(SELECT count(*) FROM pg_temp.studio_outline(t)) THEN
   RAISE EXCEPTION 'markdown_outline reads % differently from Studio',quote_literal(t); END IF;
 END LOOP;
 started:=clock_timestamp();
 IF (SELECT array_agg(heading ORDER BY ord) FROM sophia.markdown_outline(E'# a'||repeat(' ',262144)||E'b\n## c'||repeat(' ',262144)||'#  '))
   <>ARRAY['a'||repeat(' ',262144)||'b','c'] THEN RAISE EXCEPTION 'A heading with 256 KiB of spaces read wrong'; END IF;
 IF clock_timestamp()-started>interval '1 second' THEN
  RAISE EXCEPTION 'A heading with 256 KiB of spaces took %',clock_timestamp()-started; END IF;
 started:=clock_timestamp();
 PERFORM sophia.markdown_outline(repeat(E'x\n',131072));
 IF clock_timestamp()-started>interval '1 second' THEN RAISE EXCEPTION '128K short lines took %',clock_timestamp()-started; END IF;
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
-- research_draft_citations: the model's list as it came, then each id the API's parser read in the current draft (the
-- candidates), in their order, lower case, that the draft names and the task may cite (an input, the base), never its
-- own question, manifest or drafts, a withdrawn source, another project's or one it may not read; malformed candidates
-- are ignored; at most 200 distinct in all, of the first 200 candidates. A stale or missing draft, citations that are
-- not a list, or candidates that are not one, add nothing. Seeded here: a task's scope needs only its project, attempt,
-- manifest and question.
DO $$ DECLARE
 pr uuid:='16000000-0000-0000-0000-000000000001'; pr2 uuid:='16000000-0000-0000-0000-000000000002';
 who uuid:='06000000-0000-0000-0000-000000000001'; g uuid:='26000000-0000-0000-0000-000000000001';
 att uuid:='36000000-0000-0000-0000-000000000001';
 man uuid:='46000000-0000-0000-0000-000000000001'; q uuid:='46000000-0000-0000-0000-000000000002';
 inp uuid:='46000000-0000-0000-0000-00000000000a'; base uuid:='46000000-0000-0000-0000-00000000000b';
 gone uuid:='46000000-0000-0000-0000-00000000000c'; stray uuid:='46000000-0000-0000-0000-00000000000d';
 inp2 uuid:='46000000-0000-0000-0000-00000000000e'; inp3 uuid:='46000000-0000-0000-0000-00000000000f';
 other_src uuid:='76000000-0000-0000-0000-000000000001';
 d0 uuid:='56000000-0000-0000-0000-000000000000'; d1 uuid:='56000000-0000-0000-0000-000000000001';
 d2 uuid:='56000000-0000-0000-0000-000000000002'; many uuid[]; all_ids jsonb;
 s sophia.research_scope; r jsonb; t text;
BEGIN
 INSERT INTO sophia.projects(id,title,created_by) VALUES(pr,'Citations',who),(pr2,'Elsewhere',who);
 INSERT INTO sophia.project_revisions(project_id,revision,frame,accepted_by) VALUES(pr,1,'{}',who);
 INSERT INTO sophia.goals(project_id,id,title,outcome,criteria,status,mission_revision) VALUES(pr,g,'Goal','Outcome','[]','running',1);
 INSERT INTO sophia.work_attempts(project_id,id,goal_id,goal_revision,authority_epoch,state) VALUES(pr,att,g,1,1,'running');
 SELECT array_agg(('66000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid ORDER BY i) INTO many FROM generate_series(1,205) i;
 INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
  SELECT pr,x,who,'project',repeat('a',64),'text/markdown','cite-'||x,1,x<>gone,'ready'
  FROM unnest(ARRAY[man,q,inp,base,gone,stray,inp2,inp3,d0,d1,d2]||many) x;
 -- Another project's source, drawn on by that project's manifest of the same id: never this task's.
 INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
  VALUES(pr2,other_src,who,'project',repeat('a',64),'text/markdown','cite-'||other_src,1,true,'ready'),
   (pr2,man,who,'project',repeat('a',64),'text/markdown','cite-man2',1,true,'ready');
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(pr2,other_src,man);
 INSERT INTO sophia.source_texts(project_id,source_id,body) VALUES
  (pr,man,jsonb_build_object('schema','sophia.research-manifest.v1','base',jsonb_build_object('sourceId',base))::text),
  (pr,d0,'# Draft'||E'\n\nTo do.\n'),
  (pr,d1,format(E'# Hosts\n\nOurs [%s], the base [%s], more (input:%s#2).\n\nAsked as [%s] under [%s]; drafted [%s] and [%s]; '
   ||'never [%s], [%s] or [%s].',upper(inp::text),base,inp3,q,man,d0,d1,gone,stray,other_src)),
  (pr,d2,(SELECT string_agg(format('[%s]',x),' ' ORDER BY i) FROM unnest(many) WITH ORDINALITY u(x,i)));
 -- The manifest draws on the inputs, the 205 among them; gone (no longer eligible) and stray are no input of it.
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
  SELECT pr,x,man FROM unnest(ARRAY[inp,inp2,inp3]||many) x;
 INSERT INTO sophia.research_drafts(project_id,attempt_id,seq,call_key,source_id,sha256) VALUES
  (pr,att,1,'d0',d0,repeat('0',64)),(pr,att,2,'d1',d1,repeat('1',64));
 s:=ROW(pr,NULL,NULL,att,'sess',g,NULL,NULL,who,NULL,man,q)::sophia.research_scope;
 -- Every id the draft names, each a candidate, the task's own and all; inp2 may be cited but the draft never names it.
 all_ids:=jsonb_build_array(inp3,inp,base,q,man,d0,d1,gone,stray,other_src,inp2);

 r:=sophia.research_draft_citations(s,jsonb_build_object('draftSha256',repeat('1',64),'title','T','citations',jsonb_build_array(base)),all_ids);
 IF r<>jsonb_build_object('draftSha256',repeat('1',64),'title','T','citations',jsonb_build_array(base,inp3,inp)) THEN
  RAISE EXCEPTION 'The current draft added the wrong sources: %',r; END IF;
 -- In the candidates' order, not the draft's; a candidate in capitals is read in lower case, as the draft is.
 r:=sophia.research_draft_citations(s,jsonb_build_object('draftSha256',repeat('1',64),'citations','[]'::jsonb),
  jsonb_build_array(upper(inp::text),base,inp3));
 IF r->'citations'<>jsonb_build_array(inp,base,inp3) THEN RAISE EXCEPTION 'Candidates read out of order: %',r; END IF;
 -- The model's list stays as written, ids it may not cite and all (research_publish refuses them); what follows is new.
 r:=sophia.research_draft_citations(s,jsonb_build_object('draftSha256',repeat('1',64),'citations',jsonb_build_array('X',upper(base::text),q)),all_ids);
 IF r->'citations'<>jsonb_build_array('X',upper(base::text),q,inp3,inp) THEN RAISE EXCEPTION 'The model''s list was changed: %',r; END IF;
 -- Malformed candidates are passed over: refs, ids cut or padded, numbers, nulls, objects.
 r:=sophia.research_draft_citations(s,jsonb_build_object('draftSha256',repeat('1',64),'citations','[]'::jsonb),
  jsonb_build_array('input:'||inp,inp||'#2',' '||inp,left(inp::text,35),'',42,NULL,jsonb_build_object('id',inp),jsonb_build_array(inp),base));
 IF r->'citations'<>jsonb_build_array(base) THEN RAISE EXCEPTION 'A malformed candidate was read: %',r; END IF;
 -- A stale draft (an earlier one's hash), citations that are not a list, no draft at all, or candidates that are not a
 -- list: nothing is added.
 SELECT string_agg(x::text,E'\n') INTO t FROM (VALUES
  (jsonb_build_object('draftSha256',repeat('0',64),'citations',jsonb_build_array(base)),all_ids),
  (jsonb_build_object('draftSha256',repeat('1',64),'citations',base::text),all_ids),
  (jsonb_build_object('draftSha256',repeat('1',64),'citations',jsonb_build_object('id',base)),all_ids),
  (jsonb_build_object('draftSha256',repeat('1',64)),all_ids),
  (jsonb_build_object('citations',jsonb_build_array(base)),all_ids),
  (jsonb_build_object('draftSha256',repeat('1',64),'citations','[]'::jsonb),NULL),
  (jsonb_build_object('draftSha256',repeat('1',64),'citations','[]'::jsonb),to_jsonb(inp::text)),
  (jsonb_build_object('draftSha256',repeat('1',64),'citations','[]'::jsonb),jsonb_build_object('0',inp))) v(x,c)
  WHERE sophia.research_draft_citations(s,x,c) IS DISTINCT FROM x;
 IF t IS NOT NULL THEN RAISE EXCEPTION E'A result gained citations it should not:\n%',t; END IF;
 IF sophia.research_draft_citations(ROW(pr,NULL,NULL,g,'sess',g,NULL,NULL,who,NULL,man,q)::sophia.research_scope,
   jsonb_build_object('draftSha256',repeat('1',64),'citations','[]'::jsonb),all_ids)
   <>jsonb_build_object('draftSha256',repeat('1',64),'citations','[]'::jsonb) THEN
  RAISE EXCEPTION 'An attempt with no draft gained citations'; END IF;

 -- At most 200 distinct: the model's (a repeat counts once), then the candidates' first 199.
 INSERT INTO sophia.research_drafts(project_id,attempt_id,seq,call_key,source_id,sha256) VALUES(pr,att,3,'d2',d2,repeat('2',64));
 r:=sophia.research_draft_citations(s,jsonb_build_object('draftSha256',repeat('2',64),'citations',jsonb_build_array(base,base)),to_jsonb(many));
 IF r->'citations'<>jsonb_build_array(base,base)||(SELECT jsonb_agg(x ORDER BY i) FROM unnest(many[1:199]) WITH ORDINALITY u(x,i)) THEN
  RAISE EXCEPTION 'The cap is not 200 in all, in order: %',r; END IF;
 r:=sophia.research_draft_citations(s,jsonb_build_object('draftSha256',repeat('2',64),
  'citations',(SELECT jsonb_agg(x ORDER BY i) FROM unnest(many[5:205]) WITH ORDINALITY u(x,i))),to_jsonb(many));
 IF jsonb_array_length(r->'citations')<>201 THEN RAISE EXCEPTION 'A list already past 200 gained citations'; END IF;
 -- Only the first 200 candidates are read.
 r:=sophia.research_draft_citations(s,jsonb_build_object('draftSha256',repeat('2',64),'citations','[]'::jsonb),
  (SELECT jsonb_agg('X'::text) FROM generate_series(1,200))||to_jsonb(many[1:1]));
 IF r->'citations'<>'[]' THEN RAISE EXCEPTION 'A candidate past the 200th was read: %',r; END IF;
 -- The earlier drafts, one that cites nothing, are named here and offered, and are still never added.
 UPDATE sophia.source_texts SET body=format('[%s] [%s] [%s] [%s]',d0,d1,many[1],many[2]) WHERE project_id=pr AND source_id=d2;
 r:=sophia.research_draft_citations(s,jsonb_build_object('draftSha256',repeat('2',64),'citations','[]'::jsonb),
  jsonb_build_array(d0,d1,d2,many[1]));
 IF r->'citations'<>jsonb_build_array(many[1]) THEN RAISE EXCEPTION 'A draft of the task was added: %',r; END IF;
 -- An input withdrawn since (no longer eligible) is no longer added; the others still are.
 UPDATE sophia.source_objects SET eligible=false WHERE project_id=pr AND id=many[1];
 r:=sophia.research_draft_citations(s,jsonb_build_object('draftSha256',repeat('2',64),'citations','[]'::jsonb),
  jsonb_build_array(many[1],many[2]));
 IF r->'citations'<>jsonb_build_array(many[2]) THEN RAISE EXCEPTION 'A withdrawn input was added: %',r; END IF;
END $$;
-- Grants mirror 0027: nothing here is callable by PUBLIC, the API or worker roles, but the submit, by the API alone, which runs
-- as its owner on the search path it had.
DO $$ DECLARE fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['sophia.heading_anchor(text)','sophia.markdown_outline(text)','sophia.note_keeps(text,text,text)',
   'sophia.section_facts(text,text)','sophia.note_problems(text,text,jsonb)',
   'sophia.research_draft_citations(sophia.research_scope,jsonb,jsonb)'] LOOP
  IF has_function_privilege('sophia_api',fn,'EXECUTE') OR has_function_privilege('sophia_worker',fn,'EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE p.oid=fn::regprocedure AND a.grantee=0) THEN
   RAISE EXCEPTION '% is callable by PUBLIC, the API or the worker role',fn; END IF;
 END LOOP;
 fn:='sophia.runtime_research_submit(bytea,text,text,jsonb)';
 IF NOT has_function_privilege('sophia_api',fn,'EXECUTE') OR has_function_privilege('sophia_worker',fn,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid=fn::regprocedure AND a.grantee=0)
   OR NOT (SELECT prosecdef AND proconfig=ARRAY['search_path=pg_catalog, sophia'] FROM pg_proc WHERE oid=fn::regprocedure) THEN
  RAISE EXCEPTION 'The submit''s grants or definer changed'; END IF;
END $$;
ROLLBACK;
