-- 0043: the sections a design's captures must show at full size. Run by pnpm test:sql after every migration; it rolls
-- back.
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
  IF seen IS DISTINCT FROM CASE WHEN jsonb_typeof(c->'seen')='array'
    THEN ARRAY(SELECT jsonb_array_elements_text(c->'seen')) END THEN
   RAISE EXCEPTION 'design_seen_sections(%) is %',c,seen; END IF;
 END LOOP;
END $$;
ROLLBACK;
