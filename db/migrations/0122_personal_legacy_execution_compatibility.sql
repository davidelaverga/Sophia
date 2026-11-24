-- 0122: the frozen execution accepts the model/effort strings that legacy liveSettings already accepts.
-- A model is nonempty; effort is any string or null. PostgreSQL jsonb/text representation limits still apply.
-- Automatic answers keep 0101's stricter profile validator, 0102's admitted-profile guard and 0103's exact comparison.
-- No execution field, owner check, payer/route binding, reservation/launch fence, signature or grant changes.
-- 0103 and 0121 remain byte-identical; only this private validator is replaced under its original attributes.
BEGIN;

CREATE OR REPLACE FUNCTION sophia.personal_answer_execution(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE name_rx constant text:='^[a-z][a-z0-9-]{0,62}[a-z0-9]$'; k text; prices jsonb;
BEGIN
 IF p IS NULL OR pg_catalog.jsonb_typeof(p)<>'object' THEN RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 IF (SELECT pg_catalog.array_agg(x ORDER BY x) FROM pg_catalog.jsonb_object_keys(p) x)
   IS DISTINCT FROM ARRAY['maxTokens','model','owner','payer','prices','provider','reasoningEffort','roleDigest',
    'routeId','version']::text[] THEN
  RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['owner','payer','routeId','provider','roleDigest','model'] LOOP
  IF pg_catalog.jsonb_typeof(p->k)<>'string' THEN RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p->'version'<>'1'::jsonb OR p->>'payer' !~ name_rx OR p->>'routeId' !~ name_rx OR p->>'provider' !~ name_rx
  OR p->>'roleDigest' !~ '^sha256:[0-9a-f]{64}$' OR p->>'model' = '' THEN
  RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 IF NOT (pg_catalog.jsonb_typeof(p->'reasoningEffort')='null'
   OR pg_catalog.jsonb_typeof(p->'reasoningEffort')='string') THEN
  RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 IF pg_catalog.jsonb_typeof(p->'maxTokens')<>'number' THEN RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 IF (p->>'maxTokens')::numeric<>pg_catalog.trunc((p->>'maxTokens')::numeric)
  OR (p->>'maxTokens')::numeric NOT BETWEEN 1 AND 4096 THEN
  RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 prices:=p->'prices';
 IF pg_catalog.jsonb_typeof(prices)<>'object' OR (SELECT pg_catalog.array_agg(x ORDER BY x)
   FROM pg_catalog.jsonb_object_keys(prices) x) IS DISTINCT FROM ARRAY['cacheRead','cacheWrite','input','output']::text[] THEN
  RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['cacheRead','cacheWrite','input','output'] LOOP
  IF pg_catalog.jsonb_typeof(prices->k)<>'number' OR (prices->>k)::numeric<0 THEN
   RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p->>'owner'<>sophia.personal_owner()::text THEN
  RAISE EXCEPTION 'The execution is for another owner' USING ERRCODE='42501'; END IF;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_execution(jsonb) FROM PUBLIC;

COMMIT;
