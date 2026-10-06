-- 0043: the sections a design's captures must show at full size, and the gate's width sweep. Run by pnpm test:sql after
-- every migration; it rolls back.
BEGIN;
-- An edit names its own sections only while it may change nothing else: the page around them can add a section, and
-- the stylesheet reaches every one (#117). A create, and a scope that does not say, take them all (null).
DO $$
DECLARE
 seen text[];
 cases jsonb:='[
  {"mode":"edit","scope":{"sections":["s2"],"shell":false,"styles":false},"seen":["s2"]},
  {"mode":"edit","scope":{"sections":["s1","s3"],"shell":false,"styles":false},"seen":["s1","s3"]},
  {"mode":"edit","scope":{"sections":["s2"],"shell":true,"styles":false},"seen":null},
  {"mode":"edit","scope":{"sections":["s2"],"shell":false,"styles":true},"seen":null},
  {"mode":"edit","scope":{"sections":["*"],"shell":false,"styles":false},"seen":null},
  {"mode":"edit","scope":{"sections":["s2"]},"seen":null},
  {"mode":"create","scope":{"sections":["*"],"shell":true,"styles":true},"seen":null}]';
 c jsonb;
BEGIN
 FOR c IN SELECT jsonb_array_elements(cases) LOOP
  seen:=sophia.design_seen_sections(jsonb_populate_record(NULL::sophia.design_tasks,c));
  IF seen IS DISTINCT FROM (CASE WHEN jsonb_typeof(c->'seen')='array'
    THEN ARRAY(SELECT jsonb_array_elements_text(c->'seen')) END) THEN
   RAISE EXCEPTION 'design_seen_sections(%) is %',c,seen; END IF;
 END LOOP;
END $$;
-- The gate needs the render's width sweep to pass, as a global check (#117, CX-0039).
DO $$
DECLARE
 base jsonb:='[{"name":"source_verified","target":null,"outcome":"passed"},
  {"name":"sandbox_active","target":null,"outcome":"passed"},
  {"name":"requests_contained","target":null,"outcome":"passed"},
  {"name":"source_unchanged","target":null,"outcome":"passed"}]';
 sweep text[]:=ARRAY['check widths_visible did not pass'];
 got text[];
BEGIN
 got:=sophia.design_gate_failures(jsonb_build_object('status','succeeded','checks',base),'{"blocks":[]}','{}');
 IF got IS DISTINCT FROM sweep THEN RAISE EXCEPTION 'without the sweep: %',got; END IF;
 got:=sophia.design_gate_failures(jsonb_build_object('status','succeeded','checks',
  base||'[{"name":"widths_visible","target":null,"outcome":"failed"}]'::jsonb),'{"blocks":[]}','{}');
 IF got IS DISTINCT FROM sweep THEN RAISE EXCEPTION 'a failed sweep: %',got; END IF;
 got:=sophia.design_gate_failures(jsonb_build_object('status','succeeded','checks',
  base||'[{"name":"widths_visible","target":"w390-light","outcome":"passed"}]'::jsonb),'{"blocks":[]}','{}');
 IF got IS DISTINCT FROM sweep THEN RAISE EXCEPTION 'a sweep named at a target: %',got; END IF;
 got:=sophia.design_gate_failures(jsonb_build_object('status','succeeded','checks',
  base||'[{"name":"widths_visible","target":null,"outcome":"passed"}]'::jsonb),'{"blocks":[]}','{}');
 IF got IS DISTINCT FROM '{}'::text[] THEN RAISE EXCEPTION 'a passed sweep: %',got; END IF;
END $$;
ROLLBACK;
