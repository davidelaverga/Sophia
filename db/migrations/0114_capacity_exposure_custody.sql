-- INC04-R07 C4/C5 W1 (SOPHIA-INC-2026-11, INC04-R05/R07; Root87, migration 0114 allocated to SAME Native1; Host keeps
-- 0113, which this migration neither needs nor touches): capacity-exposure custody, and the exposure facts a restrictive
-- selection preview reads. Plan: docs/plans/capacity-exposure-wiring.md. Contract: frozen PRECODE-R2 + ADDENDUM-001 +
-- FG01-FG05, ENTRY01-ENTRY05, Root84/85/86 as corrected by Root87. No amendment, contract or generated change.
-- * Custody is OPERATOR evidence, migration owner only (like 0107's recorder): scopes (one 0107 exact scope and its
--   qualification revisions), registered windows (R2 window.register.v1), issuers (R2), bindings of one 0107 reading
--   window to one registered window and kind, binding revocations, dimension mappings, attributions (R2) and effect
--   finality (R2). Every payload is R2's typed canonical TLV, byte for byte (domain and field count inside the digest);
--   validation runs key completeness, then each field's closed grammar (a real calendar), then cross-field rules, then
--   the append-time semantics. An exact replay returns its receipt (judged before any current check, so it survives a
--   later change and grants nothing); a different payload under the same key is one sticky conflict with a stable
--   receipt, never an update. Finality keeps every distinct payload of a subject (knowledge extension, FG01-FG05): the
--   accepted pure fold decides extension, provenance or conflict at read time.
-- * Sealed: nothing is updated, deleted or truncated; a row is written only inside its own append's seal. RLS is on,
--   with no policy and no application grant; every function is executable by no application role.
-- * The read (selection_capacity_exposure_at) gathers, for one API candidate's current 0107 reading, the facts the
--   API's pure adapter needs, and nothing it may disclose: it is reached only from selection_api_candidate, which only
--   the definer snapshot calls after 0106's role decision, so a viewer never reaches it. It writes nothing.
-- * selection_api_candidate (0107) is replaced: its 0107 body byte for byte, plus one optional key, 'exposure', added
--   only when the read transaction set sophia.capacity_exposure to 'w1' (the API's default-off capacityExposure
--   switch). The setting selects what the trusted assembler receives; it grants nothing (the snapshot still decides
--   the role first, and nothing it adds leaves the server). Unset, the candidate is exactly 0107's.
-- * Nothing here writes, releases or reclassifies a ledger, reservation, claim, allowance or uncertain hold, and
--   nothing is read by admission or dispatch. Counts are reported first-known lower bounds; money state, ended_at and
--   provider terminals are never finality; bounds stay null (C2 is not here).
-- * selection_capacity_exposure_0114() is the private installed marker for the switch's readiness and route guard.
BEGIN;

-- --- the codec (R2 typed TLV; codec_r2.py byte for byte for the R2 domains) ---------------------------------------------

-- The closed field list of each domain, in canonical order. R2 domains keep their frozen fields; W1's own domains
-- (scope, binding, revocation, mapping and the key domains R2 left implicit) are new and are no prefix of another.
CREATE FUNCTION sophia.capacity_exposure_fields(p_domain text)
RETURNS TABLE(ord integer, name text, typ text, nullable boolean, choices text[]) LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 WITH c(dim, unit, wk) AS (SELECT ARRAY['openai.output_tokens','openai.input_tokens','openai.input_cached_tokens',
   'openai.model_requests'], ARRAY['tokens','requests'], ARRAY['minute','hour','day','month','provider_defined'])
 SELECT f.ord, f.name, f.typ, f.nullable, f.choices FROM c, LATERAL (VALUES
  ('sophia.c4c5.window.register.v1',1,'scope_id','uuid',false,NULL::text[]),
  ('sophia.c4c5.window.register.v1',2,'qual_revision','int+',false,NULL),
  ('sophia.c4c5.window.register.v1',3,'dimension','enum',false,c.dim),
  ('sophia.c4c5.window.register.v1',4,'unit','enum',false,c.unit),
  ('sophia.c4c5.window.register.v1',5,'window_kind','enum',false,c.wk),
  ('sophia.c4c5.window.register.v1',6,'epoch_key','epoch',false,NULL),
  ('sophia.c4c5.window.register.v1',7,'window_start','ts',false,NULL),
  ('sophia.c4c5.window.register.v1',8,'window_end','ts',false,NULL),
  ('sophia.c4c5.window.register.v1',9,'window_semantics','enum',false,ARRAY['fixed_epoch','rolling','unknown']),
  ('sophia.c4c5.window.register.v1',10,'measurement_basis','enum',false,ARRAY['issuer_local','shared_qualified']),
  ('sophia.c4c5.window.register.v1',11,'epoch_basis','enum',false,ARRAY['provider_reported','owner_policy']),
  ('sophia.c4c5.window.register.v1',12,'approval_ref_digest','hex64',false,NULL),
  ('sophia.c4c5.window.register.v1',13,'evidence_digest','hex64',false,NULL),
  ('sophia.c4c5.window.key.v1',1,'scope_id','uuid',false,NULL),
  ('sophia.c4c5.window.key.v1',2,'qual_revision','int+',false,NULL),
  ('sophia.c4c5.window.key.v1',3,'dimension','enum',false,c.dim),
  ('sophia.c4c5.window.key.v1',4,'window_kind','enum',false,c.wk),
  ('sophia.c4c5.window.key.v1',5,'epoch_key','epoch',false,NULL),
  ('sophia.c4c5.issuer.register.v1',1,'issuer_id','uuid',false,NULL),
  ('sophia.c4c5.issuer.register.v1',2,'kind','enum',false,ARRAY['controlled_fixture','owner_operator','provider_feed']),
  ('sophia.c4c5.issuer.register.v1',3,'scope_id','uuid',false,NULL),
  ('sophia.c4c5.issuer.register.v1',4,'qual_revision','int+',false,NULL),
  ('sophia.c4c5.issuer.register.v1',5,'registered_at','ts',false,NULL),
  ('sophia.c4c5.issuer.register.v1',6,'approval_ref_digest','hex64',false,NULL),
  ('sophia.c4c5.issuer.register.v1',7,'evidence_digest','hex64',false,NULL),
  ('sophia.c4c5.issuer.key.v1',1,'issuer_id','uuid',false,NULL),
  ('sophia.c4c5.attribution.append.v1',1,'observation_id','uuid',false,NULL),
  ('sophia.c4c5.attribution.append.v1',2,'project_id','uuid',false,NULL),
  ('sophia.c4c5.attribution.append.v1',3,'reservation_id','uuid',false,NULL),
  ('sophia.c4c5.attribution.append.v1',4,'dimension','enum',false,c.dim),
  ('sophia.c4c5.attribution.append.v1',5,'coverage','enum',false,ARRAY['reflected','not_reflected']),
  ('sophia.c4c5.attribution.append.v1',6,'q','int0',true,NULL),
  ('sophia.c4c5.attribution.append.v1',7,'basis','enum',false,
   ARRAY['provider_response_record','provider_attributed_export','controlled_fixture']),
  ('sophia.c4c5.attribution.append.v1',8,'n1','canon_id',true,NULL),
  ('sophia.c4c5.attribution.append.v1',9,'n2','canon_id',true,NULL),
  ('sophia.c4c5.attribution.append.v1',10,'evidence_digest','hex64',false,NULL),
  ('sophia.c4c5.attribution.append.v1',11,'issuer_id','uuid',false,NULL),
  ('sophia.c4c5.attribution.append.v1',12,'issuer_qual_revision','int+',false,NULL),
  ('sophia.c4c5.attribution.key.v1',1,'observation_id','uuid',false,NULL),
  ('sophia.c4c5.attribution.key.v1',2,'project_id','uuid',false,NULL),
  ('sophia.c4c5.attribution.key.v1',3,'reservation_id','uuid',false,NULL),
  ('sophia.c4c5.attribution.key.v1',4,'dimension','enum',false,c.dim),
  ('sophia.c4c5.finality.append.v1',1,'project_id','uuid',false,NULL),
  ('sophia.c4c5.finality.append.v1',2,'reservation_id','uuid',false,NULL),
  ('sophia.c4c5.finality.append.v1',3,'dimension','enum',false,c.dim),
  ('sophia.c4c5.finality.append.v1',4,'basis','enum',false,ARRAY['provider_terminal_known','never_left_release']),
  ('sophia.c4c5.finality.append.v1',5,'final_at','ts',false,NULL),
  ('sophia.c4c5.finality.append.v1',6,'count_kind','enum',false,ARRAY['final_total','none']),
  ('sophia.c4c5.finality.append.v1',7,'final_count','int0',true,NULL),
  ('sophia.c4c5.finality.append.v1',8,'evidence_digest','hex64',false,NULL),
  ('sophia.c4c5.finality.append.v1',9,'approval_ref_digest','hex64',false,NULL),
  ('sophia.c4c5.finality.append.v1',10,'issuer_id','uuid',false,NULL),
  ('sophia.c4c5.finality.append.v1',11,'issuer_qual_revision','int+',false,NULL),
  ('sophia.c4c5.finality.key.v1',1,'project_id','uuid',false,NULL),
  ('sophia.c4c5.finality.key.v1',2,'reservation_id','uuid',false,NULL),
  ('sophia.c4c5.finality.key.v1',3,'dimension','enum',false,c.dim),
  ('sophia.c4c5.scope.register.v1',1,'scope_id','uuid',false,NULL),
  ('sophia.c4c5.scope.register.v1',2,'account_id','uuid',false,NULL),
  ('sophia.c4c5.scope.register.v1',3,'connection_id','uuid',false,NULL),
  ('sophia.c4c5.scope.register.v1',4,'credential_revision','int+',false,NULL),
  ('sophia.c4c5.scope.register.v1',5,'route_id','epoch',false,NULL),
  ('sophia.c4c5.scope.register.v1',6,'model','epoch',false,NULL),
  ('sophia.c4c5.scope.register.v1',7,'effort','epoch',false,NULL),
  ('sophia.c4c5.scope.register.v1',8,'operation','enum',false,ARRAY['research']),
  ('sophia.c4c5.scope.register.v1',9,'account_qualification_id','uuid',false,NULL),
  ('sophia.c4c5.scope.register.v1',10,'account_qualification_revision','int+',false,NULL),
  ('sophia.c4c5.scope.register.v1',11,'route_qualification_id','uuid',false,NULL),
  ('sophia.c4c5.scope.register.v1',12,'approval_ref_digest','hex64',false,NULL),
  ('sophia.c4c5.scope.register.v1',13,'evidence_digest','hex64',false,NULL),
  ('sophia.c4c5.scope.key.v1',1,'scope_id','uuid',false,NULL),
  ('sophia.c4c5.binding.append.v1',1,'observation_id','uuid',false,NULL),
  ('sophia.c4c5.binding.append.v1',2,'window_ref','epoch',false,NULL),
  ('sophia.c4c5.binding.append.v1',3,'scope_id','uuid',false,NULL),
  ('sophia.c4c5.binding.append.v1',4,'qual_revision','int+',false,NULL),
  ('sophia.c4c5.binding.append.v1',5,'dimension','enum',false,c.dim),
  ('sophia.c4c5.binding.append.v1',6,'window_kind','enum',false,c.wk),
  ('sophia.c4c5.binding.append.v1',7,'epoch_key','epoch',false,NULL),
  ('sophia.c4c5.binding.append.v1',8,'kind','enum',false,ARRAY['remaining_at','consumed_in_window','verdict_only']),
  ('sophia.c4c5.binding.append.v1',9,'issuer_id','uuid',false,NULL),
  ('sophia.c4c5.binding.append.v1',10,'issuer_seq','int+',false,NULL),
  ('sophia.c4c5.binding.append.v1',11,'measurement_id','epoch',true,NULL),
  ('sophia.c4c5.binding.append.v1',12,'evidence_kind','enum',false,
   ARRAY['provider_usage_api','provider_attributed_export','owner_operator_reading','controlled_fixture']),
  ('sophia.c4c5.binding.append.v1',13,'evidence_digest','hex64',false,NULL),
  ('sophia.c4c5.binding.key.v1',1,'observation_id','uuid',false,NULL),
  ('sophia.c4c5.binding.key.v1',2,'window_ref','epoch',false,NULL),
  ('sophia.c4c5.binding.revoke.v1',1,'observation_id','uuid',false,NULL),
  ('sophia.c4c5.binding.revoke.v1',2,'window_ref','epoch',false,NULL),
  ('sophia.c4c5.binding.revoke.v1',3,'reason_digest','hex64',false,NULL),
  ('sophia.c4c5.binding.revoke.v1',4,'approval_ref_digest','hex64',false,NULL),
  ('sophia.c4c5.binding.revoke.v1',5,'evidence_digest','hex64',false,NULL),
  ('sophia.c4c5.mapping.register.v1',1,'provider','epoch',false,NULL),
  ('sophia.c4c5.mapping.register.v1',2,'route_id','epoch',false,NULL),
  ('sophia.c4c5.mapping.register.v1',3,'contract','enum',false,ARRAY['c1p_complete_report','legacy_report']),
  ('sophia.c4c5.mapping.register.v1',4,'source_field','enum',false,ARRAY['noncached_input','cache_read','cache_write',
   'output','raw_input_total','raw_cache_read','raw_output','input_total_from_parts']),
  ('sophia.c4c5.mapping.register.v1',5,'dimension','enum',false,c.dim),
  ('sophia.c4c5.mapping.register.v1',6,'unit','enum',false,c.unit),
  ('sophia.c4c5.mapping.register.v1',7,'semantics','enum',false,ARRAY['reported_lower_bound']),
  ('sophia.c4c5.mapping.register.v1',8,'revision','int+',false,NULL),
  ('sophia.c4c5.mapping.register.v1',9,'issuer_id','uuid',false,NULL),
  ('sophia.c4c5.mapping.register.v1',10,'approval_ref_digest','hex64',false,NULL),
  ('sophia.c4c5.mapping.register.v1',11,'evidence_digest','hex64',false,NULL),
  ('sophia.c4c5.mapping.key.v1',1,'provider','epoch',false,NULL),
  ('sophia.c4c5.mapping.key.v1',2,'route_id','epoch',false,NULL),
  ('sophia.c4c5.mapping.key.v1',3,'contract','enum',false,ARRAY['c1p_complete_report','legacy_report']),
  ('sophia.c4c5.mapping.key.v1',4,'source_field','enum',false,ARRAY['noncached_input','cache_read','cache_write',
   'output','raw_input_total','raw_cache_read','raw_output','input_total_from_parts'])
 ) AS f(domain, ord, name, typ, nullable, choices) WHERE f.domain=p_domain ORDER BY f.ord $$;

-- R2's unit map: no conversion exists.
CREATE FUNCTION sophia.capacity_exposure_unit_of(p_dimension text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p_dimension IN ('openai.output_tokens','openai.input_tokens','openai.input_cached_tokens') THEN 'tokens'
  WHEN p_dimension='openai.model_requests' THEN 'requests' END $$;

-- A refusal: a fixed code, no row. 22023 for every validation refusal (the persistence wrapper maps it).
CREATE FUNCTION sophia.capacity_exposure_refuse(p_code text) RETURNS void LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION '%', p_code USING ERRCODE='22023', DETAIL='capacity_exposure_refusal';
END $$;

-- One present value's (tag, canonical text) under its closed grammar, or the refusal payload_invalid.
CREATE FUNCTION sophia.capacity_exposure_value(p_typ text, p_choices text[], v jsonb, OUT tag text, OUT txt text)
LANGUAGE plpgsql STABLE SET search_path=pg_catalog SET TimeZone='UTC' AS $$
DECLARE s text; ok boolean;
BEGIN
 IF p_typ IN ('int+','int0') THEN
  s:=CASE WHEN jsonb_typeof(v)='number' THEN v::text END;
  IF s IS NULL OR s !~ '^(0|[1-9][0-9]{0,18})$' OR s::numeric>9223372036854775807 OR (p_typ='int+' AND s='0') THEN
   PERFORM sophia.capacity_exposure_refuse('payload_invalid'); END IF;
  tag:='i'; txt:=s; RETURN;
 END IF;
 s:=CASE WHEN jsonb_typeof(v)='string' THEN v#>>'{}' END;
 IF s IS NULL THEN PERFORM sophia.capacity_exposure_refuse('payload_invalid'); END IF;
 IF p_typ='uuid' THEN
  ok:=s ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; tag:='u';
 ELSIF p_typ='ts' THEN
  ok:=s ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'; tag:='t';
  IF ok THEN
   BEGIN -- a REAL calendar instant that re-formats to the identical string (2026-02-30, hour 24, month 13 refused)
    ok:=to_char(s::timestamptz,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')=s;
   EXCEPTION WHEN others THEN ok:=false;
   END;
  END IF;
 ELSIF p_typ='hex64' THEN ok:=s ~ '^[0-9a-f]{64}$'; tag:='h';
 ELSIF p_typ='epoch' THEN ok:=s ~ '^[!-~]{1,128}$'; tag:='s';
 ELSIF p_typ='canon_id' THEN
  ok:=s ~ '^(s:[0-9a-f]{64}|u:(empty|not_string|nul|unpaired_surrogate|over_bound))$'; tag:='s';
 ELSIF p_typ='enum' THEN ok:=s=ANY(p_choices); tag:='e';
 ELSE ok:=false;
 END IF;
 IF NOT ok THEN PERFORM sophia.capacity_exposure_refuse('payload_invalid'); END IF;
 txt:=s;
END $$;

-- One typed field: tag, decimal byte length, ':', bytes.
CREATE FUNCTION sophia.capacity_exposure_tlv(p_tag text, p_text text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT p_tag||octet_length(convert_to(p_text,'UTF8'))::text||':'||p_text $$;

-- The cross-field rules of a domain, on already-valid values (R2 order); NULL when consistent.
CREATE FUNCTION sophia.capacity_exposure_cross(p_domain text, p jsonb) RETURNS text LANGUAGE sql STABLE
SET search_path=pg_catalog SET TimeZone='UTC' AS $$
 SELECT CASE p_domain
  WHEN 'sophia.c4c5.window.register.v1' THEN CASE
   WHEN sophia.capacity_exposure_unit_of(p->>'dimension')<>p->>'unit' THEN 'window_unit_mismatch'
   WHEN NOT ((p->>'window_start')::timestamptz<(p->>'window_end')::timestamptz) THEN 'window_invalid' END
  WHEN 'sophia.c4c5.finality.append.v1' THEN CASE
   WHEN (p->>'count_kind'='final_total')<>(jsonb_typeof(p->'final_count')='number') THEN 'finality_count_invalid'
   WHEN p->>'basis'='never_left_release' AND NOT (p->>'count_kind'='final_total' AND p->>'final_count'='0')
    THEN 'finality_count_invalid' END
  WHEN 'sophia.c4c5.attribution.append.v1' THEN CASE
   WHEN (p->>'coverage'='reflected')<>(jsonb_typeof(p->'q')='number') THEN 'att_q_invalid' END
  WHEN 'sophia.c4c5.mapping.register.v1' THEN CASE
   WHEN sophia.capacity_exposure_unit_of(p->>'dimension')<>p->>'unit' THEN 'mapping_unit_mismatch' END
 END $$;

-- R2's canonical bytes as text: 'C4C5 ' then TLV of the domain, the field count, then every field in schema order
-- (null = 'n'; present = tag + decimal byte length + ':' + bytes). Every key required (a missing key alone:
-- payload_incomplete; an unknown key: payload_invalid), every field's grammar before any cross-field rule.
CREATE FUNCTION sophia.capacity_exposure_canonical(p_domain text, p jsonb) RETURNS text LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE f record; n integer; out text; t text; s text; rule text; missing boolean; extra boolean;
BEGIN
 SELECT count(*) INTO n FROM sophia.capacity_exposure_fields(p_domain);
 IF n=0 OR jsonb_typeof(p) IS DISTINCT FROM 'object' THEN PERFORM sophia.capacity_exposure_refuse('payload_invalid'); END IF;
 SELECT EXISTS(SELECT 1 FROM sophia.capacity_exposure_fields(p_domain) x WHERE NOT p ? x.name),
        EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN (SELECT x.name FROM sophia.capacity_exposure_fields(p_domain) x))
  INTO missing, extra;
 IF extra THEN PERFORM sophia.capacity_exposure_refuse('payload_invalid'); END IF;
 IF missing THEN PERFORM sophia.capacity_exposure_refuse('payload_incomplete'); END IF;
 out:='C4C5 '||sophia.capacity_exposure_tlv('s',p_domain)||sophia.capacity_exposure_tlv('i',n::text);
 FOR f IN SELECT * FROM sophia.capacity_exposure_fields(p_domain) LOOP
  IF jsonb_typeof(p->f.name)='null' THEN
   IF NOT f.nullable THEN PERFORM sophia.capacity_exposure_refuse('payload_invalid'); END IF;
   out:=out||'n';
  ELSE
   SELECT x.tag, x.txt INTO t, s FROM sophia.capacity_exposure_value(f.typ,f.choices,p->f.name) x;
   out:=out||sophia.capacity_exposure_tlv(t,s);
  END IF;
 END LOOP;
 rule:=sophia.capacity_exposure_cross(p_domain,p);
 IF rule IS NOT NULL THEN PERFORM sophia.capacity_exposure_refuse(rule); END IF;
 RETURN out;
END $$;

-- A canonical form's digest.
CREATE FUNCTION sophia.capacity_exposure_digest(p_canonical text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT encode(sha256(convert_to(p_canonical,'UTF8')),'hex') $$;

-- The key fields of a payload, as the key domain's own payload (a digest helper, never an append API).
CREATE FUNCTION sophia.capacity_exposure_key(p_key_domain text, p jsonb) RETURNS text LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.capacity_exposure_digest(sophia.capacity_exposure_canonical(p_key_domain,
  (SELECT jsonb_object_agg(f.name, p->f.name) FROM sophia.capacity_exposure_fields(p_key_domain) f))) $$;

-- An instant in microseconds since the epoch (the pure module's integer instants).
CREATE FUNCTION sophia.capacity_exposure_micros(t timestamptz) RETURNS bigint LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT (extract(epoch FROM t)*1000000)::bigint $$;

-- --- records ------------------------------------------------------------------------------------------------------------
-- Every record keeps its key digest, payload digest and canonical text, and the parsed fields the read needs.

CREATE TABLE sophia.capacity_exposure_scopes (
 key_sha256 text PRIMARY KEY CHECK(key_sha256 ~ '^[0-9a-f]{64}$'),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'), canonical text NOT NULL,
 scope_id uuid NOT NULL UNIQUE, account_id uuid NOT NULL, connection_id uuid NOT NULL,
 credential_revision bigint NOT NULL CHECK(credential_revision>0),
 route_id text NOT NULL, model text NOT NULL, effort text NOT NULL, operation text NOT NULL CHECK(operation='research'),
 account_qualification_id uuid NOT NULL, account_qualification_revision bigint NOT NULL CHECK(account_qualification_revision>0),
 route_qualification_id uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sophia.capacity_window_registrations (
 key_sha256 text PRIMARY KEY CHECK(key_sha256 ~ '^[0-9a-f]{64}$'),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'), canonical text NOT NULL,
 scope_id uuid NOT NULL REFERENCES sophia.capacity_exposure_scopes(scope_id), qual_revision bigint NOT NULL,
 dimension text NOT NULL, unit text NOT NULL, window_kind text NOT NULL, epoch_key text NOT NULL,
 window_start timestamptz NOT NULL, window_end timestamptz NOT NULL, window_semantics text NOT NULL,
 measurement_basis text NOT NULL, epoch_basis text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(window_start<window_end)
);

CREATE TABLE sophia.capacity_exposure_issuers (
 key_sha256 text PRIMARY KEY CHECK(key_sha256 ~ '^[0-9a-f]{64}$'),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'), canonical text NOT NULL,
 issuer_id uuid NOT NULL UNIQUE, kind text NOT NULL,
 scope_id uuid NOT NULL REFERENCES sophia.capacity_exposure_scopes(scope_id), qual_revision bigint NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- One 0107 reading window bound to one registered window and kind. The value, as_of and fresh_until are the reading's
-- own custody (never restated); the binding names the registration and issuer records it relied on.
CREATE TABLE sophia.capacity_observation_bindings (
 key_sha256 text PRIMARY KEY CHECK(key_sha256 ~ '^[0-9a-f]{64}$'),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'), canonical text NOT NULL,
 observation_id uuid NOT NULL, window_ref text NOT NULL,
 window_key_sha256 text NOT NULL REFERENCES sophia.capacity_window_registrations(key_sha256),
 registration_payload_sha256 text NOT NULL, issuer_payload_sha256 text NOT NULL,
 kind text NOT NULL, issuer_id uuid NOT NULL REFERENCES sophia.capacity_exposure_issuers(issuer_id),
 issuer_seq bigint NOT NULL, measurement_id text,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(observation_id,window_ref),
 FOREIGN KEY(observation_id,window_ref) REFERENCES sophia.capacity_observation_windows(observation_id,window_ref)
);
CREATE INDEX capacity_observation_bindings_by_window ON sophia.capacity_observation_bindings(window_key_sha256,kind);

CREATE TABLE sophia.capacity_binding_revocations (
 key_sha256 text PRIMARY KEY REFERENCES sophia.capacity_observation_bindings(key_sha256),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'), canonical text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sophia.capacity_dimension_mappings (
 key_sha256 text PRIMARY KEY CHECK(key_sha256 ~ '^[0-9a-f]{64}$'),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'), canonical text NOT NULL,
 provider text NOT NULL, route_id text NOT NULL, contract text NOT NULL, source_field text NOT NULL,
 dimension text NOT NULL, unit text NOT NULL, revision bigint NOT NULL,
 issuer_id uuid NOT NULL REFERENCES sophia.capacity_exposure_issuers(issuer_id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 -- Unsupported semantics are refused before a row exists: cache_write has no contract dimension, and no source
 -- field supports a model-request count.
 CHECK(source_field<>'cache_write' AND dimension<>'openai.model_requests')
);

CREATE TABLE sophia.capacity_attributions (
 key_sha256 text PRIMARY KEY CHECK(key_sha256 ~ '^[0-9a-f]{64}$'),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'), canonical text NOT NULL,
 observation_id uuid NOT NULL, project_id uuid NOT NULL, reservation_id uuid NOT NULL, dimension text NOT NULL,
 coverage text NOT NULL, q bigint, n1 text, evidence_digest text NOT NULL,
 issuer_id uuid NOT NULL REFERENCES sophia.capacity_exposure_issuers(issuer_id), issuer_qual_revision bigint NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((coverage='reflected')=(q IS NOT NULL))
);
CREATE INDEX capacity_attributions_by_observation ON sophia.capacity_attributions(observation_id,dimension);

-- Every distinct finality payload of one subject (project, reservation, dimension), in order; folded at read time.
CREATE TABLE sophia.capacity_effect_finality (
 subject_sha256 text NOT NULL CHECK(subject_sha256 ~ '^[0-9a-f]{64}$'),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'), canonical text NOT NULL,
 seq integer NOT NULL CHECK(seq BETWEEN 1 AND 16),
 project_id uuid NOT NULL, reservation_id uuid NOT NULL, dimension text NOT NULL,
 basis text NOT NULL, final_at timestamptz NOT NULL, count_kind text NOT NULL, final_count bigint,
 evidence_digest text NOT NULL, approval_ref_digest text NOT NULL,
 issuer_id uuid NOT NULL REFERENCES sophia.capacity_exposure_issuers(issuer_id), issuer_qual_revision bigint NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(subject_sha256,payload_sha256), UNIQUE(subject_sha256,seq)
);
CREATE INDEX capacity_effect_finality_by_effect ON sophia.capacity_effect_finality(project_id,reservation_id,dimension);

-- A different payload under a recorded key: kept once, sticky, restrictive for every read of that key.
CREATE TABLE sophia.capacity_exposure_conflicts (
 kind text NOT NULL CHECK(kind IN ('scope','window','issuer','binding','revocation','mapping','attribution')),
 key_sha256 text NOT NULL CHECK(key_sha256 ~ '^[0-9a-f]{64}$'),
 competing_payload_sha256 text NOT NULL CHECK(competing_payload_sha256 ~ '^[0-9a-f]{64}$'),
 first_payload_sha256 text NOT NULL CHECK(first_payload_sha256 ~ '^[0-9a-f]{64}$'),
 canonical text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(kind,key_sha256,competing_payload_sha256)
);

ALTER TABLE sophia.capacity_exposure_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.capacity_window_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.capacity_exposure_issuers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.capacity_observation_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.capacity_binding_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.capacity_dimension_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.capacity_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.capacity_effect_finality ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.capacity_exposure_conflicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.capacity_exposure_scopes, sophia.capacity_window_registrations, sophia.capacity_exposure_issuers,
 sophia.capacity_observation_bindings, sophia.capacity_binding_revocations, sophia.capacity_dimension_mappings,
 sophia.capacity_attributions, sophia.capacity_effect_finality, sophia.capacity_exposure_conflicts FROM PUBLIC;

-- --- the seal ----------------------------------------------------------------------------------------------------------

CREATE FUNCTION sophia.capacity_exposure_immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
BEGIN
 RAISE EXCEPTION 'Capacity-exposure custody is sealed: % is refused', TG_OP USING ERRCODE='55000';
END $$;

-- A row is written only inside its own append's seal (the key or subject digest it names).
CREATE FUNCTION sophia.capacity_exposure_sealed() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE target text:=coalesce(to_jsonb(NEW)->>'key_sha256',to_jsonb(NEW)->>'subject_sha256');
BEGIN
 IF current_setting('sophia.capacity_exposure_seal',true) IS DISTINCT FROM target THEN
  RAISE EXCEPTION 'Capacity-exposure custody is sealed: it is written only by its append' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['capacity_exposure_scopes','capacity_window_registrations','capacity_exposure_issuers',
  'capacity_observation_bindings','capacity_binding_revocations','capacity_dimension_mappings','capacity_attributions',
  'capacity_effect_finality','capacity_exposure_conflicts'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON sophia.%I FOR EACH ROW EXECUTE FUNCTION '
   'sophia.capacity_exposure_immutable()', t||'_immutable', t);
  EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON sophia.%I FOR EACH STATEMENT EXECUTE FUNCTION '
   'sophia.capacity_exposure_immutable()', t||'_no_truncate', t);
  EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON sophia.%I FOR EACH ROW EXECUTE FUNCTION '
   'sophia.capacity_exposure_sealed()', t||'_sealed', t);
 END LOOP;
END $$;

-- --- receipts ---------------------------------------------------------------------------------------------------------

-- Open one append's seal (transaction-local) and serialize every append of the same key.
CREATE FUNCTION sophia.capacity_exposure_open(p_kind text, p_key text) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('sophia.capacity_exposure:'||p_kind||':'||p_key,0));
 PERFORM set_config('sophia.capacity_exposure_seal',p_key,true);
END $$;

CREATE FUNCTION sophia.capacity_exposure_close() RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog AS $$
BEGIN
 PERFORM set_config('sophia.capacity_exposure_seal','',true);
END $$;

-- The receipt of a recorded key: a replay of the same payload, or the sticky conflict a different payload records
-- (inserted once; its retry returns the same receipt). NULL when the key has no record yet.
CREATE FUNCTION sophia.capacity_exposure_settled(p_kind text, p_table text, p_key text, p_payload text,
 p_canonical text) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE first_payload text; first_at timestamptz; x sophia.capacity_exposure_conflicts; fresh boolean:=false;
BEGIN
 EXECUTE format('SELECT payload_sha256, recorded_at FROM sophia.%I WHERE key_sha256=$1',p_table)
  INTO first_payload, first_at USING p_key;
 IF first_payload IS NULL THEN RETURN NULL; END IF;
 IF first_payload=p_payload THEN
  RETURN jsonb_build_object('kind',p_kind,'outcome','recorded','key',p_key,'payload',p_payload,
   'recordedAt',sophia.capacity_observation_instant(first_at),'replay',true);
 END IF;
 SELECT * INTO x FROM sophia.capacity_exposure_conflicts c
  WHERE c.kind=p_kind AND c.key_sha256=p_key AND c.competing_payload_sha256=p_payload;
 IF x.key_sha256 IS NULL THEN
  INSERT INTO sophia.capacity_exposure_conflicts(kind,key_sha256,competing_payload_sha256,first_payload_sha256,canonical)
   VALUES(p_kind,p_key,p_payload,first_payload,p_canonical) RETURNING * INTO x;
  fresh:=true;
 END IF;
 RETURN jsonb_build_object('kind',p_kind,'outcome','conflict','key',p_key,'payload',p_payload,'first',first_payload,
  'recordedAt',sophia.capacity_observation_instant(x.recorded_at),'replay',NOT fresh);
END $$;

CREATE FUNCTION sophia.capacity_exposure_recorded(p_kind text, p_key text, p_payload text, p_at timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('kind',p_kind,'outcome','recorded','key',p_key,'payload',p_payload,
  'recordedAt',sophia.capacity_observation_instant(p_at),'replay',false) $$;

-- Whether a key carries a sticky conflict.
CREATE FUNCTION sophia.capacity_exposure_conflicted(p_kind text, p_key text) RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.capacity_exposure_conflicts c WHERE c.kind=p_kind AND c.key_sha256=p_key) $$;

-- --- the appends (migration owner only) ---------------------------------------------------------------------------------

-- The registered, unconflicted scope a qualification revision speaks for; NULL when there is none.
CREATE FUNCTION sophia.capacity_exposure_scope_of(p_scope uuid, p_revision bigint) RETURNS sophia.capacity_exposure_scopes
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT s.* FROM sophia.capacity_exposure_scopes s WHERE s.scope_id=p_scope AND s.account_qualification_revision=p_revision
  AND NOT sophia.capacity_exposure_conflicted('scope',s.key_sha256) $$;

-- The registered, unconflicted issuer for exactly this scope and revision; NULL when there is none.
CREATE FUNCTION sophia.capacity_exposure_issuer_of(p_issuer uuid, p_scope uuid, p_revision bigint)
RETURNS sophia.capacity_exposure_issuers LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT i.* FROM sophia.capacity_exposure_issuers i WHERE i.issuer_id=p_issuer AND i.scope_id=p_scope
  AND i.qual_revision=p_revision AND NOT sophia.capacity_exposure_conflicted('issuer',i.key_sha256)
  AND sophia.capacity_exposure_scope_of(p_scope,p_revision) IS NOT NULL $$;

-- Operator: one 0107 exact scope and the qualification revisions it is registered under (W1 scope.register.v1).
CREATE FUNCTION sophia.register_capacity_scope(p jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
DECLARE c text:=sophia.capacity_exposure_canonical('sophia.c4c5.scope.register.v1',p);
 h text:=sophia.capacity_exposure_digest(c); k text:=sophia.capacity_exposure_key('sophia.c4c5.scope.key.v1',p);
 r jsonb; conn sophia.api_connections; x sophia.capacity_exposure_scopes;
BEGIN
 PERFORM sophia.capacity_exposure_open('scope',k);
 r:=sophia.capacity_exposure_settled('scope','capacity_exposure_scopes',k,h,c);
 IF r IS NULL THEN
  SELECT * INTO conn FROM sophia.api_connections WHERE id=(p->>'connection_id')::uuid;
  IF conn.id IS NULL OR conn.account_id<>(p->>'account_id')::uuid OR conn.credential_revision<>(p->>'credential_revision')::bigint
     OR conn.route_id<>p->>'route_id' OR conn.model<>p->>'model' OR conn.effort<>p->>'effort' THEN
   PERFORM sophia.capacity_exposure_refuse('scope_unknown'); END IF;
  IF NOT EXISTS(SELECT 1 FROM sophia.api_account_qualifications a WHERE a.id=(p->>'account_qualification_id')::uuid
      AND a.connection_id=conn.id AND a.revision=(p->>'account_qualification_revision')::bigint)
     OR NOT EXISTS(SELECT 1 FROM sophia.api_route_qualifications q WHERE q.id=(p->>'route_qualification_id')::uuid
      AND q.route_id=conn.route_id AND q.model=conn.model AND q.effort=conn.effort) THEN
   PERFORM sophia.capacity_exposure_refuse('scope_qualification_unknown'); END IF;
  INSERT INTO sophia.capacity_exposure_scopes(key_sha256,payload_sha256,canonical,scope_id,account_id,connection_id,
   credential_revision,route_id,model,effort,operation,account_qualification_id,account_qualification_revision,
   route_qualification_id)
  VALUES(k,h,c,(p->>'scope_id')::uuid,conn.account_id,conn.id,conn.credential_revision,conn.route_id,conn.model,
   conn.effort,p->>'operation',(p->>'account_qualification_id')::uuid,(p->>'account_qualification_revision')::bigint,
   (p->>'route_qualification_id')::uuid) RETURNING * INTO x;
  r:=sophia.capacity_exposure_recorded('scope',k,h,x.recorded_at);
 END IF;
 PERFORM sophia.capacity_exposure_close();
 RETURN r;
END $$;

-- Operator: a registered window (R2 window.register.v1); its key fixes unit, bounds, semantics and bases.
CREATE FUNCTION sophia.register_capacity_window(p jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
DECLARE c text:=sophia.capacity_exposure_canonical('sophia.c4c5.window.register.v1',p);
 h text:=sophia.capacity_exposure_digest(c); k text:=sophia.capacity_exposure_key('sophia.c4c5.window.key.v1',p);
 r jsonb; x sophia.capacity_window_registrations;
BEGIN
 PERFORM sophia.capacity_exposure_open('window',k);
 r:=sophia.capacity_exposure_settled('window','capacity_window_registrations',k,h,c);
 IF r IS NULL THEN
  IF sophia.capacity_exposure_scope_of((p->>'scope_id')::uuid,(p->>'qual_revision')::bigint) IS NULL THEN
   PERFORM sophia.capacity_exposure_refuse('window_scope_unregistered'); END IF;
  INSERT INTO sophia.capacity_window_registrations(key_sha256,payload_sha256,canonical,scope_id,qual_revision,dimension,
   unit,window_kind,epoch_key,window_start,window_end,window_semantics,measurement_basis,epoch_basis)
  VALUES(k,h,c,(p->>'scope_id')::uuid,(p->>'qual_revision')::bigint,p->>'dimension',p->>'unit',p->>'window_kind',
   p->>'epoch_key',(p->>'window_start')::timestamptz,(p->>'window_end')::timestamptz,p->>'window_semantics',
   p->>'measurement_basis',p->>'epoch_basis') RETURNING * INTO x;
  r:=sophia.capacity_exposure_recorded('window',k,h,x.recorded_at);
 END IF;
 PERFORM sophia.capacity_exposure_close();
 RETURN r;
END $$;

-- Operator: an attribution/binding issuer for one registered scope and revision (R2 issuer.register.v1).
CREATE FUNCTION sophia.register_capacity_issuer(p jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
DECLARE c text:=sophia.capacity_exposure_canonical('sophia.c4c5.issuer.register.v1',p);
 h text:=sophia.capacity_exposure_digest(c); k text:=sophia.capacity_exposure_key('sophia.c4c5.issuer.key.v1',p);
 r jsonb; x sophia.capacity_exposure_issuers;
BEGIN
 PERFORM sophia.capacity_exposure_open('issuer',k);
 r:=sophia.capacity_exposure_settled('issuer','capacity_exposure_issuers',k,h,c);
 IF r IS NULL THEN
  IF sophia.capacity_exposure_scope_of((p->>'scope_id')::uuid,(p->>'qual_revision')::bigint) IS NULL THEN
   PERFORM sophia.capacity_exposure_refuse('issuer_scope_unregistered'); END IF;
  INSERT INTO sophia.capacity_exposure_issuers(key_sha256,payload_sha256,canonical,issuer_id,kind,scope_id,qual_revision)
  VALUES(k,h,c,(p->>'issuer_id')::uuid,p->>'kind',(p->>'scope_id')::uuid,(p->>'qual_revision')::bigint)
  RETURNING * INTO x;
  r:=sophia.capacity_exposure_recorded('issuer',k,h,x.recorded_at);
 END IF;
 PERFORM sophia.capacity_exposure_close();
 RETURN r;
END $$;

-- Why one 0107 reading window may not be bound to a registered window, or NULL (R2 §1.4 in its order, then W1's own
-- scope, value and revocation checks). The values are the reading's custody, never restated by the binding.
CREATE FUNCTION sophia.capacity_binding_refusal(p jsonb, w sophia.capacity_window_registrations) RETURNS text
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.capacity_observations; ow sophia.capacity_observation_windows; s sophia.capacity_exposure_scopes;
BEGIN
 IF w.key_sha256 IS NULL OR sophia.capacity_exposure_conflicted('window',w.key_sha256) THEN RETURN 'obs_window_unregistered'; END IF;
 IF sophia.capacity_exposure_issuer_of((p->>'issuer_id')::uuid,w.scope_id,w.qual_revision) IS NULL THEN
  RETURN 'issuer_unqualified'; END IF;
 SELECT * INTO o FROM sophia.capacity_observations WHERE id=(p->>'observation_id')::uuid;
 SELECT * INTO ow FROM sophia.capacity_observation_windows WHERE observation_id=o.id AND window_ref=p->>'window_ref';
 IF ow.observation_id IS NULL THEN RETURN 'binding_reading_unknown'; END IF;
 s:=sophia.capacity_exposure_scope_of(w.scope_id,w.qual_revision);
 IF s.scope_id IS NULL OR (o.account_id,o.connection_id,o.credential_revision,o.route_id,o.model,o.effort,o.operation,
     o.account_qualification_id,o.account_qualification_revision,o.route_qualification_id)
   IS DISTINCT FROM (s.account_id,s.connection_id,s.credential_revision,s.route_id,s.model,s.effort,s.operation,
     s.account_qualification_id,s.account_qualification_revision,s.route_qualification_id) THEN
  RETURN 'binding_scope_mismatch'; END IF;
 IF ow.unit IS DISTINCT FROM w.unit THEN
  RETURN CASE WHEN ow.unit IS DISTINCT FROM sophia.capacity_exposure_unit_of(w.dimension) THEN 'obs_unit_mismatch'
   ELSE 'obs_window_mismatch' END; END IF;
 IF ow.window_epoch IS DISTINCT FROM w.epoch_key OR (ow.scope='model' AND ow.model_selector IS DISTINCT FROM s.model) THEN
  RETURN 'obs_window_mismatch'; END IF;
 IF NOT (w.window_start<=o.observed_at AND o.observed_at<w.window_end AND o.observed_at<o.fresh_until) THEN
  RETURN 'obs_time_invalid'; END IF;
 IF o.observed_at>o.recorded_at THEN RETURN 'obs_from_future'; END IF;
 IF (p->>'kind'='verdict_only')<>(ow.value IS NULL)
    OR (ow.value IS NOT NULL AND (ow.value<>trunc(ow.value) OR ow.value<0 OR ow.value>9007199254740991)) THEN
  RETURN 'obs_value_invalid'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.capacity_observation_revocations x WHERE x.observation_id=o.id) THEN
  RETURN 'binding_reading_revoked'; END IF;
 RETURN NULL;
END $$;

-- Operator: bind one 0107 reading window to one registered window and kind (W1 binding.append.v1).
CREATE FUNCTION sophia.bind_capacity_observation(p jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
DECLARE c text:=sophia.capacity_exposure_canonical('sophia.c4c5.binding.append.v1',p);
 h text:=sophia.capacity_exposure_digest(c); k text:=sophia.capacity_exposure_key('sophia.c4c5.binding.key.v1',p);
 wk text:=sophia.capacity_exposure_key('sophia.c4c5.window.key.v1',p);
 r jsonb; why text; w sophia.capacity_window_registrations; x sophia.capacity_observation_bindings;
BEGIN
 PERFORM sophia.capacity_exposure_open('binding',k);
 r:=sophia.capacity_exposure_settled('binding','capacity_observation_bindings',k,h,c);
 IF r IS NULL THEN
  SELECT * INTO w FROM sophia.capacity_window_registrations WHERE key_sha256=wk;
  why:=sophia.capacity_binding_refusal(p,w);
  IF why IS NOT NULL THEN PERFORM sophia.capacity_exposure_refuse(why); END IF;
  INSERT INTO sophia.capacity_observation_bindings(key_sha256,payload_sha256,canonical,observation_id,window_ref,
   window_key_sha256,registration_payload_sha256,issuer_payload_sha256,kind,issuer_id,issuer_seq,measurement_id)
  VALUES(k,h,c,(p->>'observation_id')::uuid,p->>'window_ref',wk,w.payload_sha256,
   (SELECT i.payload_sha256 FROM sophia.capacity_exposure_issuers i WHERE i.issuer_id=(p->>'issuer_id')::uuid),
   p->>'kind',(p->>'issuer_id')::uuid,(p->>'issuer_seq')::bigint,p->>'measurement_id') RETURNING * INTO x;
  r:=sophia.capacity_exposure_recorded('binding',k,h,x.recorded_at);
 END IF;
 PERFORM sophia.capacity_exposure_close();
 RETURN r;
END $$;

-- Operator: revoke one binding (W1 binding.revoke.v1). Insert-only; restrictive from then on, never the never-bound
-- baseline. Another payload for the same binding is a sticky conflict, also restrictive.
CREATE FUNCTION sophia.revoke_capacity_binding(p jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
DECLARE c text:=sophia.capacity_exposure_canonical('sophia.c4c5.binding.revoke.v1',p);
 h text:=sophia.capacity_exposure_digest(c); k text:=sophia.capacity_exposure_key('sophia.c4c5.binding.key.v1',p);
 r jsonb; x sophia.capacity_binding_revocations;
BEGIN
 PERFORM sophia.capacity_exposure_open('revocation',k);
 r:=sophia.capacity_exposure_settled('revocation','capacity_binding_revocations',k,h,c);
 IF r IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM sophia.capacity_observation_bindings b WHERE b.key_sha256=k) THEN
   PERFORM sophia.capacity_exposure_refuse('binding_unknown'); END IF;
  INSERT INTO sophia.capacity_binding_revocations(key_sha256,payload_sha256,canonical) VALUES(k,h,c) RETURNING * INTO x;
  r:=sophia.capacity_exposure_recorded('revocation',k,h,x.recorded_at);
 END IF;
 PERFORM sophia.capacity_exposure_close();
 RETURN r;
END $$;

-- Whether a mapping's issuer is qualified now (W1-F01): its registered record, scoped by its OWN scope and revision,
-- passes capacity_exposure_issuer_of (the issuer unconflicted, and its scope registered and unconflicted).
CREATE FUNCTION sophia.capacity_exposure_mapping_issuer_eligible(p_issuer uuid) RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.capacity_exposure_issuers i WHERE i.issuer_id=p_issuer
  AND sophia.capacity_exposure_issuer_of(i.issuer_id,i.scope_id,i.qual_revision) IS NOT NULL) $$;

-- Operator: one immutable dimension mapping (W1 mapping.register.v1): which reported count of a (provider, route,
-- contract) is which R2 dimension, as a reported lower bound. cache_write and model-request counts are unsupported.
CREATE FUNCTION sophia.register_capacity_mapping(p jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
DECLARE c text:=sophia.capacity_exposure_canonical('sophia.c4c5.mapping.register.v1',p);
 h text:=sophia.capacity_exposure_digest(c); k text:=sophia.capacity_exposure_key('sophia.c4c5.mapping.key.v1',p);
 r jsonb; x sophia.capacity_dimension_mappings;
BEGIN
 PERFORM sophia.capacity_exposure_open('mapping',k);
 r:=sophia.capacity_exposure_settled('mapping','capacity_dimension_mappings',k,h,c);
 IF r IS NULL THEN
  IF p->>'source_field'='cache_write' OR p->>'dimension'='openai.model_requests' THEN
   PERFORM sophia.capacity_exposure_refuse('mapping_unsupported'); END IF;
  -- W1-F01: the issuer's full scoped qualification (its own record AND its registered scope and revision, all
  -- unconflicted), never its row alone. An exact replay was answered above, before this current check.
  IF NOT sophia.capacity_exposure_mapping_issuer_eligible((p->>'issuer_id')::uuid) THEN
   PERFORM sophia.capacity_exposure_refuse('issuer_unqualified'); END IF;
  INSERT INTO sophia.capacity_dimension_mappings(key_sha256,payload_sha256,canonical,provider,route_id,contract,
   source_field,dimension,unit,revision,issuer_id)
  VALUES(k,h,c,p->>'provider',p->>'route_id',p->>'contract',p->>'source_field',p->>'dimension',p->>'unit',
   (p->>'revision')::bigint,(p->>'issuer_id')::uuid) RETURNING * INTO x;
  r:=sophia.capacity_exposure_recorded('mapping',k,h,x.recorded_at);
 END IF;
 PERFORM sophia.capacity_exposure_close();
 RETURN r;
END $$;

-- The tracked effect on a scope's account, or NULL: a model reservation whose 0109 identity names that account.
CREATE FUNCTION sophia.capacity_exposure_effect(p_project uuid, p_reservation uuid, p_account uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.research_call_identities i JOIN sophia.research_reservations r
   ON r.project_id=i.project_id AND r.id=i.reservation_id
  WHERE i.project_id=p_project AND i.reservation_id=p_reservation AND i.account_id=p_account AND r.kind='model') $$;

-- Operator: an attribution witness, the only source of q (R2 attribution.append.v1). Its authority is derived: the
-- binding of that observation and dimension, and the issuer registered for that binding's scope and revision.
CREATE FUNCTION sophia.append_capacity_attribution(p jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
DECLARE c text:=sophia.capacity_exposure_canonical('sophia.c4c5.attribution.append.v1',p);
 h text:=sophia.capacity_exposure_digest(c); k text:=sophia.capacity_exposure_key('sophia.c4c5.attribution.key.v1',p);
 r jsonb; w sophia.capacity_window_registrations; s sophia.capacity_exposure_scopes; x sophia.capacity_attributions;
BEGIN
 PERFORM sophia.capacity_exposure_open('attribution',k);
 r:=sophia.capacity_exposure_settled('attribution','capacity_attributions',k,h,c);
 IF r IS NULL THEN
  SELECT g.* INTO w FROM sophia.capacity_observation_bindings b JOIN sophia.capacity_window_registrations g
    ON g.key_sha256=b.window_key_sha256
   WHERE b.observation_id=(p->>'observation_id')::uuid AND g.dimension=p->>'dimension' ORDER BY b.key_sha256 LIMIT 1;
  IF w.key_sha256 IS NULL THEN PERFORM sophia.capacity_exposure_refuse('attribution_unbound'); END IF;
  IF w.qual_revision<>(p->>'issuer_qual_revision')::bigint
     OR sophia.capacity_exposure_issuer_of((p->>'issuer_id')::uuid,w.scope_id,w.qual_revision) IS NULL THEN
   PERFORM sophia.capacity_exposure_refuse('issuer_unqualified'); END IF;
  s:=sophia.capacity_exposure_scope_of(w.scope_id,w.qual_revision);
  IF NOT sophia.capacity_exposure_effect((p->>'project_id')::uuid,(p->>'reservation_id')::uuid,s.account_id) THEN
   PERFORM sophia.capacity_exposure_refuse('attribution_effect_unknown'); END IF;
  INSERT INTO sophia.capacity_attributions(key_sha256,payload_sha256,canonical,observation_id,project_id,reservation_id,
   dimension,coverage,q,n1,evidence_digest,issuer_id,issuer_qual_revision)
  VALUES(k,h,c,(p->>'observation_id')::uuid,(p->>'project_id')::uuid,(p->>'reservation_id')::uuid,p->>'dimension',
   p->>'coverage',(p->>'q')::bigint,p->>'n1',p->>'evidence_digest',(p->>'issuer_id')::uuid,
   (p->>'issuer_qual_revision')::bigint) RETURNING * INTO x;
  r:=sophia.capacity_exposure_recorded('attribution',k,h,x.recorded_at);
 END IF;
 PERFORM sophia.capacity_exposure_close();
 RETURN r;
END $$;

-- Operator: one effect-finality payload (R2 finality.append.v1), the only source of finality and of a final total.
-- Every distinct payload of a subject is kept in order (at most 16); an exact replay returns its receipt. The pure fold
-- (foldFinality, FG01-FG05) decides extension, provenance or sticky conflict at read time. Money never creates one.
CREATE FUNCTION sophia.append_capacity_finality(p jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
DECLARE c text:=sophia.capacity_exposure_canonical('sophia.c4c5.finality.append.v1',p);
 h text:=sophia.capacity_exposure_digest(c); k text:=sophia.capacity_exposure_key('sophia.c4c5.finality.key.v1',p);
 x sophia.capacity_effect_finality; n integer; replay boolean:=true; iss sophia.capacity_exposure_issuers;
 s sophia.capacity_exposure_scopes;
BEGIN
 PERFORM sophia.capacity_exposure_open('finality',k);
 SELECT * INTO x FROM sophia.capacity_effect_finality f WHERE f.subject_sha256=k AND f.payload_sha256=h;
 IF x.subject_sha256 IS NULL THEN
  replay:=false;
  SELECT * INTO iss FROM sophia.capacity_exposure_issuers i WHERE i.issuer_id=(p->>'issuer_id')::uuid;
  s:=sophia.capacity_exposure_scope_of(iss.scope_id,iss.qual_revision);
  IF iss.issuer_id IS NULL OR iss.qual_revision<>(p->>'issuer_qual_revision')::bigint
     OR sophia.capacity_exposure_issuer_of(iss.issuer_id,iss.scope_id,iss.qual_revision) IS NULL THEN
   PERFORM sophia.capacity_exposure_refuse('issuer_unqualified'); END IF;
  IF NOT sophia.capacity_exposure_effect((p->>'project_id')::uuid,(p->>'reservation_id')::uuid,s.account_id) THEN
   PERFORM sophia.capacity_exposure_refuse('finality_effect_unknown'); END IF;
  SELECT count(*) INTO n FROM sophia.capacity_effect_finality f WHERE f.subject_sha256=k;
  IF n>=16 THEN PERFORM sophia.capacity_exposure_refuse('finality_capped'); END IF;
  INSERT INTO sophia.capacity_effect_finality(subject_sha256,payload_sha256,canonical,seq,project_id,reservation_id,
   dimension,basis,final_at,count_kind,final_count,evidence_digest,approval_ref_digest,issuer_id,issuer_qual_revision)
  VALUES(k,h,c,n+1,(p->>'project_id')::uuid,(p->>'reservation_id')::uuid,p->>'dimension',p->>'basis',
   (p->>'final_at')::timestamptz,p->>'count_kind',(p->>'final_count')::bigint,p->>'evidence_digest',
   p->>'approval_ref_digest',(p->>'issuer_id')::uuid,(p->>'issuer_qual_revision')::bigint) RETURNING * INTO x;
 END IF;
 PERFORM sophia.capacity_exposure_close();
 RETURN jsonb_build_object('kind','finality','outcome','recorded','key',k,'payload',h,'seq',x.seq,
  'recordedAt',sophia.capacity_observation_instant(x.recorded_at),'replay',replay);
END $$;

-- --- the read: one API candidate's exposure facts at one instant -----------------------------------------------------

-- One effect's facts for one dimension: its reservation start, its tracked identity's provider, route and contract,
-- its truth row's reported classes and counts (null when it has none) and whether that row or its retained history
-- is conflicted or full, and its finality appends in order. ended_at, money state and costs are never read.
CREATE FUNCTION sophia.capacity_exposure_effect_facts(i sophia.research_call_identities, r sophia.research_reservations,
 p_dimension text, p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('projectId',i.project_id,'reservationId',i.reservation_id,
  'createdAt',sophia.capacity_exposure_micros(r.created_at),'provider',i.provider,'routeId',i.route_id,
  'contract',i.contract,
  'truth',(SELECT jsonb_build_object('report',t.report,
     'noncachedInputClass',t.noncached_input_class,'noncachedInput',t.noncached_input,
     'cacheReadClass',t.cache_read_class,'cacheRead',t.cache_read,'outputClass',t.output_class,'output',t.output,
     'rawInputTotal',t.raw_input_total,'rawCacheRead',t.raw_cache_read,'rawOutput',t.raw_output,
     'conflict',t.first_conflict_digest IS NOT NULL OR t.first_overflow_digest IS NOT NULL,
     'historyFull',t.history_count>=16 OR EXISTS(SELECT 1 FROM sophia.research_call_history h
       WHERE h.project_id=t.project_id AND h.reservation_id=t.reservation_id AND h.ordinal>=16),
     'historyConflict',EXISTS(SELECT 1 FROM sophia.research_call_history h
       WHERE h.project_id=t.project_id AND h.reservation_id=t.reservation_id AND h.disposition='conflict'))
    FROM sophia.research_call_truth t WHERE t.project_id=i.project_id AND t.reservation_id=i.reservation_id),
  'finality',coalesce((SELECT jsonb_agg(jsonb_build_object('payloadDigest',f.payload_sha256,'basis',f.basis,
     'finalAt',sophia.capacity_exposure_micros(f.final_at),'countKind',f.count_kind,'finalCount',f.final_count,
     'evidenceDigest',f.evidence_digest,'approvalRefDigest',f.approval_ref_digest,'issuerId',f.issuer_id,
     'issuerQualRevision',f.issuer_qual_revision) ORDER BY f.seq)
    FROM sophia.capacity_effect_finality f WHERE f.project_id=i.project_id AND f.reservation_id=i.reservation_id
     AND f.dimension=p_dimension AND f.recorded_at<=p_now),'[]')) $$;

-- Every effect a registered window's scope may carry: each model reservation whose 0109 identity names the scope's
-- account, in ANY project, created before the window ends (the pure module decides the rest). At most 200, and
-- 'truncated' past that; 'unrepresented' when a model reservation on the account (0094's contribution ledger) has no
-- identity, so its facts cannot be read: either makes the effect set incomplete, never smaller or zero.
CREATE FUNCTION sophia.capacity_exposure_effects(s sophia.capacity_exposure_scopes, w sophia.capacity_window_registrations,
 p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
DECLARE items jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(e.facts ORDER BY e.created_at, e.project_id, e.reservation_id),'[]') INTO items FROM (
  SELECT sophia.capacity_exposure_effect_facts(i,r,w.dimension,p_now) AS facts, r.created_at, i.project_id, i.reservation_id
   FROM sophia.research_call_identities i JOIN sophia.research_reservations r
    ON r.project_id=i.project_id AND r.id=i.reservation_id
   WHERE i.account_id=s.account_id AND r.kind='model' AND r.created_at<w.window_end AND r.created_at<=p_now
   ORDER BY r.created_at, i.project_id, i.reservation_id LIMIT 201) e;
 RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(items)>200 THEN '[]'::jsonb ELSE items END,
  'truncated',jsonb_array_length(items)>200,
  'unrepresented',EXISTS(SELECT 1 FROM sophia.api_contribution_reservations x JOIN sophia.research_reservations r
    ON r.project_id=x.project_id AND r.id=x.reservation_id
   WHERE x.account_id=s.account_id AND r.kind='model' AND r.created_at<w.window_end AND r.created_at<=p_now
    AND NOT EXISTS(SELECT 1 FROM sophia.research_call_identities i
     WHERE i.project_id=r.project_id AND i.reservation_id=r.id)));
END $$;

-- The accepted bindings of one partition (window key, kind, qualification revision) at p_now: each reading's own
-- as_of, freshness, value and measurement id. A revoked binding or reading is no evidence and is left out; a
-- conflicted one makes the partition conflicted (restrictive).
CREATE FUNCTION sophia.capacity_exposure_partition(b sophia.capacity_observation_bindings, p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object(
  'observations',coalesce(jsonb_agg(jsonb_build_object('id',o.id,'issuerId',x.issuer_id,
    'asOf',sophia.capacity_exposure_micros(o.observed_at),'freshUntil',sophia.capacity_exposure_micros(o.fresh_until),
    'value',ow.value,'measurementId',x.measurement_id,'current',x.observation_id=b.observation_id)
    ORDER BY o.observed_at, o.id) FILTER (WHERE x.key_sha256 IS NOT NULL),'[]'),
  'conflict',coalesce(bool_or(sophia.capacity_exposure_conflicted('binding',x.key_sha256)),false))
 FROM sophia.capacity_observation_bindings x
  JOIN sophia.capacity_observations o ON o.id=x.observation_id
  JOIN sophia.capacity_observation_windows ow ON ow.observation_id=x.observation_id AND ow.window_ref=x.window_ref
 WHERE x.window_key_sha256=b.window_key_sha256 AND x.kind=b.kind AND x.recorded_at<=p_now
  AND o.observed_at<=p_now AND o.recorded_at<=p_now
  AND NOT EXISTS(SELECT 1 FROM sophia.capacity_binding_revocations v WHERE v.key_sha256=x.key_sha256 AND v.recorded_at<=p_now)
  AND NOT EXISTS(SELECT 1 FROM sophia.capacity_observation_revocations v WHERE v.observation_id=o.id AND v.revoked_at<=p_now) $$;

-- The attributions of a partition's readings for one dimension, each with its issuer's qualification for the window's
-- scope and revision (derived custody) and its sticky conflict.
CREATE FUNCTION sophia.capacity_exposure_attributions(w sophia.capacity_window_registrations, p_observations uuid[],
 p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('observationId',a.observation_id,'projectId',a.project_id,
   'reservationId',a.reservation_id,'coverage',a.coverage,'q',a.q,'n1',a.n1,'evidenceDigest',a.evidence_digest,
   'issuerQualified',a.issuer_qual_revision=w.qual_revision
     AND sophia.capacity_exposure_issuer_of(a.issuer_id,w.scope_id,w.qual_revision) IS NOT NULL,
   'conflict',sophia.capacity_exposure_conflicted('attribution',a.key_sha256))
   ORDER BY a.observation_id, a.project_id, a.reservation_id),'[]')
 FROM sophia.capacity_attributions a
 WHERE a.observation_id=ANY(p_observations) AND a.dimension=w.dimension AND a.recorded_at<=p_now $$;

-- The registered mappings to one dimension for the (provider, route, contract) of the given effects, each with its
-- sticky conflict and its issuer's current scoped eligibility (W1-F01). An ineligible mapping is carried, never dropped,
-- and is restrictive like a conflicted one ('conflict' is either), so its counts are unresolved, never qualified or 0.
-- No row means the count is not eligible.
CREATE FUNCTION sophia.capacity_exposure_mappings(p_dimension text, p_effects jsonb, p_now timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('provider',m.provider,'routeId',m.route_id,'contract',m.contract,
   'sourceField',m.source_field,'eligible',q.eligible,'conflict',q.conflicted OR NOT q.eligible)
   ORDER BY m.provider, m.route_id, m.contract, m.source_field),'[]')
 FROM sophia.capacity_dimension_mappings m
 CROSS JOIN LATERAL (SELECT sophia.capacity_exposure_conflicted('mapping',m.key_sha256) AS conflicted,
   sophia.capacity_exposure_mapping_issuer_eligible(m.issuer_id) AS eligible) q
 WHERE m.dimension=p_dimension AND m.recorded_at<=p_now AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_effects) e
   WHERE e->>'provider'=m.provider AND e->>'routeId'=m.route_id AND e->>'contract'=m.contract) $$;

-- One bound window of the current reading: its registration, its partition's readings, the scope's effects, the
-- partition's attributions and the applicable mappings. No value leaves the server: only the API's pure adapter reads it.
CREATE FUNCTION sophia.capacity_exposure_window(b sophia.capacity_observation_bindings, p_now timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
DECLARE w sophia.capacity_window_registrations; s sophia.capacity_exposure_scopes; part jsonb; eff jsonb;
BEGIN
 SELECT * INTO w FROM sophia.capacity_window_registrations WHERE key_sha256=b.window_key_sha256;
 s:=sophia.capacity_exposure_scope_of(w.scope_id,w.qual_revision);
 part:=sophia.capacity_exposure_partition(b,p_now);
 eff:=sophia.capacity_exposure_effects(s,w,p_now);
 RETURN jsonb_build_object('windowRef',b.window_ref,'kind',b.kind,
  'registration',jsonb_build_object('windowKey',w.key_sha256,'scopeId',w.scope_id,'qualRevision',w.qual_revision,
   'dimension',w.dimension,'unit',w.unit,'start',sophia.capacity_exposure_micros(w.window_start),
   'end',sophia.capacity_exposure_micros(w.window_end),'semantics',w.window_semantics,
   'measurementBasis',w.measurement_basis),
  'observations',part->'observations','partitionConflict',part->'conflict',
  'effects',eff->'items','truncated',eff->'truncated','unrepresented',eff->'unrepresented',
  'attributions',sophia.capacity_exposure_attributions(w,
    ARRAY(SELECT (o->>'id')::uuid FROM jsonb_array_elements(part->'observations') o),p_now),
  'mappings',sophia.capacity_exposure_mappings(w.dimension,eff->'items',p_now));
END $$;

-- Whether one binding of the current reading is still valid evidence at p_now: not revoked, not conflicted, its
-- registration, scope and issuer unconflicted and still registered for its scope and revision.
CREATE FUNCTION sophia.capacity_exposure_binding_valid(b sophia.capacity_observation_bindings, p_now timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT NOT EXISTS(SELECT 1 FROM sophia.capacity_binding_revocations v WHERE v.key_sha256=b.key_sha256 AND v.recorded_at<=p_now)
  AND NOT sophia.capacity_exposure_conflicted('binding',b.key_sha256)
  AND NOT sophia.capacity_exposure_conflicted('revocation',b.key_sha256)
  AND EXISTS(SELECT 1 FROM sophia.capacity_window_registrations w WHERE w.key_sha256=b.window_key_sha256
   AND NOT sophia.capacity_exposure_conflicted('window',w.key_sha256)
   AND w.payload_sha256=b.registration_payload_sha256
   AND sophia.capacity_exposure_issuer_of(b.issuer_id,w.scope_id,w.qual_revision) IS NOT NULL) $$;

-- The exposure facts for one API candidate at p_now (W1): JSON null without a recorded current 0107 reading (0107 then
-- decides alone); never_bound when no window of that reading was ever bound (the 0107 baseline, byte-identical);
-- restricted when any of its bindings is revoked, conflicted or no longer backed by its registration and issuer
-- (never the never-bound fallback); else bound, with each bound window's facts.
CREATE FUNCTION sophia.selection_capacity_exposure_at(gr sophia.api_contribution_grants, conn sophia.api_connections,
 p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
DECLARE reading jsonb:=sophia.selection_capacity_observation_at(gr,conn,p_now); oid uuid; b sophia.capacity_observation_bindings;
 windows jsonb:='[]';
BEGIN
 IF reading IS NULL OR reading->>'state' IS DISTINCT FROM 'recorded' THEN RETURN 'null'::jsonb; END IF;
 oid:=(reading->>'observationId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM sophia.capacity_observation_bindings x WHERE x.observation_id=oid AND x.recorded_at<=p_now) THEN
  RETURN jsonb_build_object('v',1,'state','never_bound'); END IF;
 FOR b IN SELECT * FROM sophia.capacity_observation_bindings x WHERE x.observation_id=oid AND x.recorded_at<=p_now
   ORDER BY x.window_ref COLLATE "C" LOOP
  IF NOT sophia.capacity_exposure_binding_valid(b,p_now) THEN RETURN jsonb_build_object('v',1,'state','restricted'); END IF;
  windows:=windows||jsonb_build_array(sophia.capacity_exposure_window(b,p_now));
 END LOOP;
 RETURN jsonb_build_object('v',1,'state','bound','now',sophia.capacity_exposure_micros(p_now),'windows',windows);
END $$;

-- The installed custody's private marker (0114). Executable by no application role.
CREATE FUNCTION sophia.selection_capacity_exposure_0114() RETURNS integer LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT 114 $$;

-- --- the trusted preview's exposure fact ------------------------------------------------------------------------------

-- selection_api_candidate (0107), replaced: its 0107 body byte for byte, and one optional key, 'exposure', present only
-- when this read transaction set sophia.capacity_exposure to 'w1' (the API's capacityExposure switch). Unset, the
-- candidate is exactly 0107's.
CREATE OR REPLACE FUNCTION sophia.selection_api_candidate(gr sophia.api_contribution_grants, p_actor uuid, pin sophia.research_funding_pins,
 p_budget boolean, p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
DECLARE conn sophia.api_connections; acc sophia.api_accounts; why text; codes text[]:='{}'; slots integer; gslots integer;
 committed numeric; gcommitted numeric; reasons text[]:='{}'; member boolean;
BEGIN
 SELECT * INTO conn FROM sophia.api_connections WHERE id=gr.connection_id;
 SELECT * INTO acc FROM sophia.api_accounts WHERE id=conn.account_id;
 why:=sophia.selection_grant_unusable_at(gr,p_now); IF why IS NOT NULL THEN codes:=codes||why; END IF;
 member:=sophia.contribution_member(gr.project_id,gr.owner_id,false);
 IF NOT member THEN codes:=codes||'owner_not_member'::text; END IF;
 IF pin.grant_id=gr.id AND pin.grant_revision<>gr.revision THEN codes:=codes||'pin_stale'::text; END IF;
 slots:=sophia.contribution_slots_held(acc.id); gslots:=sophia.contribution_slots_held(acc.id,gr.id);
 committed:=sophia.selection_account_committed(acc.id)+sophia.contribution_lineage_holds(acc.id,NULL,NULL,NULL); -- 0105
 SELECT coalesce(sum(sophia.contribution_commit(r)),0)+sophia.contribution_lineage_holds(acc.id,gr.id,NULL,NULL) INTO gcommitted -- 0105
  FROM sophia.api_contribution_reservations x
  JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id WHERE x.grant_id=gr.id;
 -- Monetary dimensions first: free slots never overcome exhausted money (C01).
 IF gcommitted+gr.task_cap_usd>gr.total_cap_usd THEN reasons:=reasons||'grant_spend'::text; END IF;
 IF committed+gr.task_cap_usd>acc.total_cap_usd THEN reasons:=reasons||'account_spend'::text; END IF;
 IF NOT p_budget THEN reasons:=reasons||'project_budget'::text; END IF;
 IF slots>=acc.concurrency_limit THEN reasons:=reasons||'account_slots'::text; END IF;
 IF gslots>=gr.concurrency THEN reasons:=reasons||'grant_slots'::text; END IF;
 RETURN jsonb_build_object('kind','api','grantId',gr.id,'grantRevision',gr.revision,'ownerId',gr.owner_id,
  'accountId',acc.id,'accountRevision',acc.revision,'accountProvenance',acc.provenance,'provider',acc.provider,
  'connectionId',conn.id,'connectionRevision',conn.revision,'connectionState',conn.state,
  'operation',gr.operation,'roleId',gr.role_id,'route',gr.route_id,'model',gr.model,'effort',gr.effort,
  'expiresAt',gr.expires_at,'validFrom',greatest(gr.updated_at,gr.funding_acknowledged_at),
  'proofStatus',CASE WHEN why IS NULL THEN 'valid' WHEN why IN ('grant_revoked','admin_disabled') THEN 'revoked' ELSE 'stale' END,
  'unusable',to_jsonb(codes),'ownerMember',member,'requesterEligible',sophia.contribution_requester_eligible(gr,p_actor),
  'globalRoute',sophia.selection_global_route_at(gr.route_id,gr.model,gr.effort,p_now),
  'accountQualification',sophia.selection_account_qualification_at(conn,p_now),
  'runtimeReady',sophia.selection_runtime_ready_at(gr,conn,p_now),
  'capacity',jsonb_build_object('admits',cardinality(reasons)=0,'reasons',to_jsonb(reasons)),
  'slotsBusy',slots>=acc.concurrency_limit OR gslots>=gr.concurrency,
  'uncertainEffects',EXISTS(SELECT 1 FROM sophia.api_contribution_reservations x JOIN sophia.research_reservations r
     ON r.project_id=x.project_id AND r.id=x.reservation_id WHERE x.account_id=acc.id AND r.state='uncertain')
   OR EXISTS(SELECT 1 FROM sophia.api_contribution_tasks t JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
     WHERE t.account_id=acc.id AND j.state='outcome_unknown'),
  'observation',sophia.selection_capacity_observation_at(gr,conn,p_now), -- 0107
  'protection',sophia.selection_protection_at(acc,gr,slots,committed,p_now))
  || CASE WHEN current_setting('sophia.capacity_exposure',true)='w1' -- 0114
   THEN jsonb_build_object('exposure',sophia.selection_capacity_exposure_at(gr,conn,p_now)) ELSE '{}'::jsonb END; -- 0114
END $$;

-- --- privileges ------------------------------------------------------------------------------------------------------
-- The replaced candidate keeps its grants (CREATE OR REPLACE): none. Every new function is executable by no application
-- role: the appends are the migration owner's; the read is reached only through the definer snapshot.
DO $$
DECLARE f regprocedure;
BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='sophia' AND (p.proname LIKE 'capacity\_exposure\_%' OR p.proname IN ('capacity_binding_refusal',
    'register_capacity_scope','register_capacity_window','register_capacity_issuer','bind_capacity_observation',
    'revoke_capacity_binding','register_capacity_mapping','append_capacity_attribution','append_capacity_finality',
    'selection_capacity_exposure_at','selection_capacity_exposure_0114')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
 END LOOP;
END $$;

COMMIT;
