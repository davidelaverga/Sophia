-- SMC-M03 S2 (A11): the usage writer records what the research route reports. 0022 gave usage_records the provider's
-- cache counters; this release fills them, and records the model calls compaction makes, so an attempt's spend
-- counts every call it caused.
-- * An assistant message's usage carries cacheReadTokens and cacheWriteTokens when the adapter reported them (the
--   bundle of sophia-runtime-m03-dev sends them; an older bundle sends neither). Absent stays null. dsh's adapter
--   leaves a zero counter out, so null means zero or not reported. dsh's counts are disjoint: input_tokens is
--   uncached input only.
-- * A compaction/summary observation is one model call with its own usage. It is recorded with purpose
--   'compaction', so readers of "the turn's model call" (a task's result) keep reading turns only.
-- * Idempotent as before: one row per (attempt, native session#seq).
BEGIN;

ALTER TABLE sophia.usage_records ADD COLUMN purpose text NOT NULL DEFAULT 'turn' CHECK(purpose IN ('turn','compaction'));

-- A token count from an observation, or null when it is absent or not a non-negative integer.
CREATE FUNCTION sophia.usage_count(p jsonb) RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN jsonb_typeof(p)='number' AND p::text ~ '^[0-9]{1,18}$' THEN p::text::bigint END $$;
REVOKE ALL ON FUNCTION sophia.usage_count(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION sophia.runtime_record_observations(p_token_sha256 bytea, p_unit text, p_bridge text, p_observations jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_lease(p_token_sha256,p_unit,p_bridge); o jsonb; b sophia.execution_bindings;
 obs_id uuid; n integer:=0; seq bigint; d jsonb;
BEGIN
 FOR o IN SELECT value FROM jsonb_array_elements(p_observations) ORDER BY (value->>'nativeSeq')::bigint LOOP
  IF o->>'runtimeUnitId' IS DISTINCT FROM rt.runtime_unit_id THEN RAISE EXCEPTION 'Observation names another runtime unit' USING ERRCODE='42501'; END IF;
  SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=rt.project_id AND resource_id=rt.resource_id AND runtime_unit_id=rt.runtime_unit_id
   AND attempt_id=CASE WHEN o->>'attemptId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (o->>'attemptId')::uuid END;
  IF NOT FOUND OR o->>'nativeSessionId' IS DISTINCT FROM b.native_session_id THEN
   RAISE EXCEPTION 'Observation names an attempt or native session this runtime does not own' USING ERRCODE='42501'; END IF;
  seq:=(o->>'nativeSeq')::bigint;
  INSERT INTO sophia.native_observations(project_id,binding_id,upstream_key,type,native_seq,data)
  VALUES(rt.project_id,b.id,rt.runtime_unit_id||':'||b.native_session_id||':'||seq,left(o->>'type',64),seq,o->'data')
  ON CONFLICT (project_id,binding_id,upstream_key) DO NOTHING RETURNING id INTO obs_id;
  IF obs_id IS NULL THEN CONTINUE; END IF;
  n:=n+1;
  d:=o->'data';
  IF o->>'type' IN ('assistant/message','compaction/summary') AND jsonb_typeof(d)='object'
     AND (d->>'model' IS NOT NULL OR d->>'inputTokens' IS NOT NULL) THEN
   INSERT INTO sophia.usage_records(project_id,attempt_id,provider_call_id,billing_kind,input_tokens,output_tokens,
     cache_read_tokens,cache_write_tokens,provider,model,purpose)
   VALUES(rt.project_id,b.attempt_id,b.native_session_id||'#'||seq,'api',(d->>'inputTokens')::bigint,(d->>'outputTokens')::bigint,
    sophia.usage_count(d->'cacheReadTokens'),sophia.usage_count(d->'cacheWriteTokens'),left(d->>'provider',200),left(d->>'model',200),
    CASE o->>'type' WHEN 'compaction/summary' THEN 'compaction' ELSE 'turn' END) ON CONFLICT DO NOTHING;
  ELSIF o->>'type'='turn/end' THEN
   PERFORM sophia.capture_native_result(rt.project_id,b.id,seq,o->'data'->'reason'->>'kind');
  END IF;
  obs_id:=NULL;
 END LOOP;
 RETURN n;
END $$;

COMMIT;
