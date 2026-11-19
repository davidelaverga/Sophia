-- INC04-S03b B2 (SOPHIA-INC-2026-11; root lease INC04-S03B-B2-CONSUMER-001): provider-reported model evidence for an
-- owner-runner operation's own native run, appended by the worker beside its observation. Plan:
-- docs/plans/owner-runner-source-authority.md ("Reported models"). Root allocated 0108 for this candidate; no amendment,
-- contract or generated change. 0001-0107 are not edited, and no existing function is replaced.
-- * The producer is a PATCHED T3 (patches/t3code/ade47301-provider-reported-models.patch, docs/SOURCE_MAP.md §2p), which
--   Sophia neither applies nor installs. An unpatched producer sends nothing, and the worker records `absent`.
-- * What a row is: the report a host sent for the operation's run, checked and rebuilt in canonical form, under the
--   operation's own provenance (copied from its row, never from the report). It is evidence of what a provider reported,
--   as one read collected it. It is NOT what an adapter accepted, an effort, the effective or final model, or the
--   requested selection: `requested_settings` is read only to keep its digest beside the evidence, never compared.
-- * Only the worker writes, only through owner_runner_record_models, only for a create or input in `received` that is
--   bound to the answering journal. A Stop, another journal, or any other state appends nothing. It changes no
--   operation, binding, reservation, outbox row, command, grant or financial fact, and decides no lifecycle step.
-- * Append-only: at most 32 ordinary rows per operation, then exactly one `capped` row, then nothing. A row is appended
--   only when its canonical evidence (all but the producer's collectedAt) differs from the latest one; the first time a
--   content was seen is kept. Earlier rows are never changed or removed: a later absence, erasure or contradiction adds a
--   row, never retracts one. Nothing here claims completeness or finality, and no row is merged into a union.
-- * Checked as the coordination package checks it (runner-model-report.ts), over Unicode code points rather than
--   collations: model ids of 1-200 UTF-16 units, trimmed as JavaScript trims, without C0/C1 controls, distinct and in
--   UTF-16 code-unit order; attempt ids trimmed and non-blank; integers by value (1 and 1.0 alike, integral and within
--   0..2^53-1, positive where the producer's contract says so); the producer's attempt order and relations. A report
--   that is not valid is recorded as `malformed` with no content; a report for another thread or run as `foreign`.
-- * Private: no application role reads the table (an owner read would be its own amendment). The worker executes the
--   recorder only.
BEGIN;

-- --- the evidence --------------------------------------------------------------------------------------------------------

CREATE TABLE sophia.owner_runner_model_reports (
 project_id uuid NOT NULL, operation_id uuid NOT NULL,
 seq integer NOT NULL CHECK(seq BETWEEN 1 AND 33),
 state text NOT NULL CHECK(state IN ('absent','collected','unavailable','malformed','foreign','capped')),
 -- collected: the canonical report without its collectedAt; nothing else keeps content.
 evidence jsonb CHECK(evidence IS NULL OR jsonb_typeof(evidence)='object'),
 unavailable_reason text CHECK(unavailable_reason IS NULL
  OR unavailable_reason IN ('attempts_not_loaded','provider_turns_not_loaded','provider_turns_load_failed')),
 malformed_reason text CHECK(malformed_reason IS NULL OR malformed_reason IN ('invalid','oversize')),
 -- The producer's own clock, as reported for the first sighting of this content: provenance, never an order.
 reported_collected_at text,
 evidence_sha256 text CHECK(evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$'),
 -- The operation's provenance at append, copied from its row.
 owner_id uuid NOT NULL, connection_id uuid NOT NULL, connection_revision bigint NOT NULL,
 resource_id uuid NOT NULL, goal_id uuid NOT NULL, attempt_id uuid NOT NULL, binding_id uuid NOT NULL,
 qualification_id uuid NOT NULL, qualification_revision bigint NOT NULL,
 profile_id text NOT NULL, profile_revision bigint NOT NULL, adapter_pin text NOT NULL, environment_ref text NOT NULL,
 envelope_version smallint NOT NULL, repository_root text, base_commit text, requested_settings_sha256 text
  CHECK(requested_settings_sha256 IS NULL OR requested_settings_sha256 ~ '^[0-9a-f]{64}$'),
 operation_kind text NOT NULL CHECK(operation_kind IN ('create','input')), operation_revision bigint NOT NULL,
 native_thread_id text, native_run_id text, gateway_journal_id uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id, operation_id, seq),
 FOREIGN KEY(project_id, operation_id) REFERENCES sophia.owner_runner_operations(project_id, id),
 CHECK((state='collected')=(evidence IS NOT NULL)),
 CHECK((state='unavailable')=(unavailable_reason IS NOT NULL)),
 CHECK((state='malformed')=(malformed_reason IS NOT NULL)),
 CHECK((state IN ('collected','unavailable'))=(reported_collected_at IS NOT NULL)),
 CHECK((state='capped')=(evidence_sha256 IS NULL)),
 CHECK(state='capped' OR seq<=32), CHECK(state<>'capped' OR seq=33)
);
ALTER TABLE sophia.owner_runner_model_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.owner_runner_model_reports FROM PUBLIC;

-- Nothing recorded is ever changed or removed.
CREATE FUNCTION sophia.owner_runner_model_immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
BEGIN
 RAISE EXCEPTION 'Model evidence is append-only: % is refused', TG_OP USING ERRCODE='55000';
END $$;
CREATE TRIGGER owner_runner_model_reports_immutable BEFORE UPDATE OR DELETE ON sophia.owner_runner_model_reports
 FOR EACH ROW EXECUTE FUNCTION sophia.owner_runner_model_immutable();
CREATE TRIGGER owner_runner_model_reports_no_truncate BEFORE TRUNCATE ON sophia.owner_runner_model_reports
 FOR EACH STATEMENT EXECUTE FUNCTION sophia.owner_runner_model_immutable();

-- A row is written only by the recorder, inside its seal for exactly that operation.
CREATE FUNCTION sophia.owner_runner_model_sealed() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF current_setting('sophia.owner_runner_model_seal',true) IS DISTINCT FROM NEW.operation_id::text THEN
  RAISE EXCEPTION 'Model evidence is written only by its recorder' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER owner_runner_model_reports_sealed BEFORE INSERT ON sophia.owner_runner_model_reports
 FOR EACH ROW EXECUTE FUNCTION sophia.owner_runner_model_sealed();

-- --- the checks (pure) -------------------------------------------------------------------------------------------------

-- A string's code points (the database is UTF8: no NUL and no surrogate can occur in text).
CREATE FUNCTION sophia.owner_runner_model_cps(p text) RETURNS integer[] LANGUAGE sql IMMUTABLE STRICT
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(array_agg(ascii(c) ORDER BY i), '{}') FROM unnest(string_to_array(p, NULL)) WITH ORDINALITY AS u(c, i)
$$;

-- An order key equal to UTF-16 code-unit order (JavaScript's `<`): U+E000..U+FFFF sort after every supplementary
-- character, whose high surrogate (U+D800..U+DBFF) precedes them. Arrays compare element by element, a prefix first.
CREATE FUNCTION sophia.owner_runner_model_key(p text) RETURNS integer[] LANGUAGE sql IMMUTABLE STRICT
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(array_agg(CASE WHEN cp BETWEEN 57344 AND 65535 THEN cp+1114112 ELSE cp END ORDER BY i), '{}')
 FROM unnest(sophia.owner_runner_model_cps(p)) WITH ORDINALITY AS u(cp, i)
$$;

-- JavaScript's String.prototype.trim whitespace (Node 24.21.0): WhiteSpace and LineTerminator code points.
CREATE FUNCTION sophia.owner_runner_model_space(cp integer) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT
SET search_path=pg_catalog,sophia AS $$
 SELECT cp IN (9,10,11,12,13,32,160,5760,8232,8233,8239,8287,12288,65279) OR cp BETWEEN 8192 AND 8202
$$;

-- A JSON string equal to its JavaScript trim and non-empty: an attempt id (the pin's TrimmedNonEmptyString).
CREATE FUNCTION sophia.owner_runner_model_attempt_id(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE cps integer[];
BEGIN
 IF v IS NULL OR jsonb_typeof(v)<>'string' THEN RETURN false; END IF;
 cps:=sophia.owner_runner_model_cps(v#>>'{}');
 RETURN cardinality(cps)>0 AND NOT sophia.owner_runner_model_space(cps[1])
  AND NOT sophia.owner_runner_model_space(cps[cardinality(cps)]);
END $$;

-- A thread or run id as the receipt holds it: a JSON string with at least one non-space code point.
CREATE FUNCTION sophia.owner_runner_model_native_id(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT v IS NOT NULL AND jsonb_typeof(v)='string'
  AND EXISTS(SELECT 1 FROM unnest(sophia.owner_runner_model_cps(v#>>'{}')) cp WHERE NOT sophia.owner_runner_model_space(cp))
$$;

-- A model id exactly as the producer admits it: 1-200 UTF-16 units, trimmed, no C0 or C1 control.
CREATE FUNCTION sophia.owner_runner_model_model_id(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE cps integer[]; units integer;
BEGIN
 IF NOT sophia.owner_runner_model_attempt_id(v) THEN RETURN false; END IF;
 cps:=sophia.owner_runner_model_cps(v#>>'{}');
 SELECT count(*)+count(*) FILTER (WHERE cp>65535) INTO units FROM unnest(cps) cp;
 RETURN units BETWEEN 1 AND 200 AND NOT EXISTS(SELECT 1 FROM unnest(cps) cp WHERE cp<=31 OR cp BETWEEN 127 AND 159);
END $$;

-- An integer by value: any integral JSON number spelling (1, 1.0, 1e0) within p_min..2^53-1; NULL otherwise. The
-- integrality and range are judged on the exact numeric before any cast, so nothing rounds into a value.
CREATE FUNCTION sophia.owner_runner_model_int(v jsonb, p_min bigint) RETURNS bigint LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE n numeric;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)<>'number' THEN RETURN NULL; END IF;
 n:=(v#>>'{}')::numeric;
 IF n<>trunc(n) OR n<p_min OR n>9007199254740991 THEN RETURN NULL; END IF;
 RETURN n::bigint;
END $$;

-- An object with exactly these keys.
CREATE FUNCTION sophia.owner_runner_model_keys(v jsonb, p_keys text[]) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT v IS NOT NULL AND jsonb_typeof(v)='object'
  AND (SELECT coalesce(array_agg(k ORDER BY k COLLATE "C"),'{}') FROM jsonb_object_keys(v) k)
   =(SELECT array_agg(k ORDER BY k COLLATE "C") FROM unnest(p_keys) k)
$$;

CREATE FUNCTION sophia.owner_runner_model_enum(v jsonb, p_values text[]) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT v IS NOT NULL AND jsonb_typeof(v)='string' AND (v#>>'{}')=ANY(p_values)
$$;

-- The report a host sent (collected or unavailable), checked and rebuilt in canonical form; NULL when it is not one.
CREATE FUNCTION sophia.owner_runner_model_canonical(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE a jsonb; m jsonb; out_attempts jsonb:='[]'; out_models jsonb; ids text[]:='{}'; active_id text; aid text;
 lim bigint; owned bigint; omitted bigint; n integer; ord bigint; prev_ord bigint; prev_id text; mkey integer[];
 prev_mkey integer[]; root bigint; term bigint; rep bigint; unb bigint; momit bigint; excl bigint; mcount integer;
 reported boolean;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR NOT sophia.owner_runner_model_native_id(p->'threadId')
    OR NOT sophia.owner_runner_model_native_id(p->'runId') THEN RETURN NULL; END IF;
 IF p->>'state'='unavailable' AND jsonb_typeof(p->'state')='string' THEN
  IF NOT sophia.owner_runner_model_keys(p, ARRAY['state','threadId','runId','reason','collectedAt'])
     OR NOT sophia.owner_runner_model_enum(p->'reason',
      ARRAY['attempts_not_loaded','provider_turns_not_loaded','provider_turns_load_failed'])
     OR jsonb_typeof(p->'collectedAt')<>'string' THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('state','unavailable','threadId',p->>'threadId','runId',p->>'runId','reason',p->>'reason',
   'collectedAt',p->>'collectedAt');
 END IF;
 IF NOT sophia.owner_runner_model_enum(p->'state', ARRAY['collected'])
    OR NOT sophia.owner_runner_model_keys(p, ARRAY['state','threadId','runId','collectedAt','activeAttemptId',
     'attemptPolicy','attemptLimit','attemptsOwned','attemptsOmitted','attempts'])
    OR jsonb_typeof(p->'collectedAt')<>'string'
    OR NOT sophia.owner_runner_model_enum(p->'attemptPolicy', ARRAY['latest_by_attempt_ordinal'])
    OR jsonb_typeof(p->'attempts')<>'array' THEN RETURN NULL; END IF;
 IF jsonb_typeof(p->'activeAttemptId')='null' THEN active_id:=NULL;
 ELSIF sophia.owner_runner_model_attempt_id(p->'activeAttemptId') THEN active_id:=p->>'activeAttemptId';
 ELSE RETURN NULL; END IF;
 lim:=sophia.owner_runner_model_int(p->'attemptLimit',1);
 owned:=sophia.owner_runner_model_int(p->'attemptsOwned',0);
 omitted:=sophia.owner_runner_model_int(p->'attemptsOmitted',0);
 n:=jsonb_array_length(p->'attempts');
 IF lim IS NULL OR owned IS NULL OR omitted IS NULL OR n>8 OR n>lim OR omitted<>owned-n OR (omitted>0 AND n<>lim)
  THEN RETURN NULL; END IF;
 FOR a IN SELECT e FROM jsonb_array_elements(p->'attempts') WITH ORDINALITY AS x(e, i) ORDER BY i LOOP
  IF NOT sophia.owner_runner_model_keys(a, ARRAY['attemptId','attemptOrdinal','reason','status','active',
      'providerInstanceId','rootTurns','terminalRootTurns','reportingRootTurns','unboundTurns','modelEvidence','models',
      'modelsOmitted','excludedModelValues'])
     OR NOT sophia.owner_runner_model_attempt_id(a->'attemptId')
     OR NOT sophia.owner_runner_model_enum(a->'reason', ARRAY['initial','steering_restart','retry','provider_recovery'])
     OR NOT sophia.owner_runner_model_enum(a->'status',
      ARRAY['pending','running','completed','interrupted','failed','cancelled','superseded'])
     OR jsonb_typeof(a->'active')<>'boolean' OR jsonb_typeof(a->'providerInstanceId')<>'string'
     OR NOT ((a->>'providerInstanceId') COLLATE "C" ~ '^[a-zA-Z][a-zA-Z0-9_-]{0,63}$')
     OR NOT sophia.owner_runner_model_enum(a->'modelEvidence', ARRAY['reported','unknown'])
     OR jsonb_typeof(a->'models')<>'array' THEN RETURN NULL; END IF;
  aid:=a->>'attemptId';
  ord:=sophia.owner_runner_model_int(a->'attemptOrdinal',1);
  root:=sophia.owner_runner_model_int(a->'rootTurns',0); term:=sophia.owner_runner_model_int(a->'terminalRootTurns',0);
  rep:=sophia.owner_runner_model_int(a->'reportingRootTurns',0); unb:=sophia.owner_runner_model_int(a->'unboundTurns',0);
  momit:=sophia.owner_runner_model_int(a->'modelsOmitted',0);
  excl:=sophia.owner_runner_model_int(a->'excludedModelValues',0);
  IF ord IS NULL OR root IS NULL OR term IS NULL OR rep IS NULL OR unb IS NULL OR momit IS NULL OR excl IS NULL
     OR term>root OR rep>term THEN RETURN NULL; END IF;
  -- The producer's order: ordinal descending, then id ascending by UTF-16 code unit; ids distinct.
  IF aid=ANY(ids) THEN RETURN NULL; END IF;
  IF prev_id IS NOT NULL AND (ord>prev_ord OR (ord=prev_ord
     AND NOT sophia.owner_runner_model_key(prev_id)<sophia.owner_runner_model_key(aid))) THEN RETURN NULL; END IF;
  IF (a->'active')::boolean IS DISTINCT FROM (active_id IS NOT NULL AND aid=active_id) THEN RETURN NULL; END IF;
  mcount:=jsonb_array_length(a->'models'); prev_mkey:=NULL; out_models:='[]';
  IF mcount>8 THEN RETURN NULL; END IF;
  FOR m IN SELECT e FROM jsonb_array_elements(a->'models') WITH ORDINALITY AS x(e, i) ORDER BY i LOOP
   IF NOT sophia.owner_runner_model_model_id(m) THEN RETURN NULL; END IF;
   mkey:=sophia.owner_runner_model_key(m#>>'{}');
   IF prev_mkey IS NOT NULL AND NOT prev_mkey<mkey THEN RETURN NULL; END IF;
   prev_mkey:=mkey; out_models:=out_models||jsonb_build_array(m#>>'{}');
  END LOOP;
  reported:=(a->>'modelEvidence')='reported';
  IF reported<>(mcount>0) OR reported<>(rep>0) OR (momit>0 AND mcount<>8) THEN RETURN NULL; END IF;
  out_attempts:=out_attempts||jsonb_build_array(jsonb_build_object('attemptId',aid,'attemptOrdinal',ord,
   'reason',a->>'reason','status',a->>'status','active',(a->'active')::boolean,'providerInstanceId',a->>'providerInstanceId',
   'rootTurns',root,'terminalRootTurns',term,'reportingRootTurns',rep,'unboundTurns',unb,
   'modelEvidence',a->>'modelEvidence','models',out_models,'modelsOmitted',momit,'excludedModelValues',excl));
  ids:=ids||aid; prev_ord:=ord; prev_id:=aid;
 END LOOP;
 RETURN jsonb_build_object('state','collected','threadId',p->>'threadId','runId',p->>'runId',
  'collectedAt',p->>'collectedAt','activeAttemptId',active_id,'attemptPolicy','latest_by_attempt_ordinal',
  'attemptLimit',lim,'attemptsOwned',owned,'attemptsOmitted',omitted,'attempts',out_attempts);
END $$;

-- --- the recorder (the worker) -----------------------------------------------------------------------------------------

-- Append the evidence a run observation carried, or `absent`. Same lock order as owner_runner_record: the project, then
-- the operation. Returns {operationId, changed, seq?, state?, capped?}; a report it cannot accept is recorded, not raised.
CREATE FUNCTION sophia.owner_runner_record_models(p_project uuid, p_operation uuid, p_journal uuid, p_report jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.owner_runner_operations; c jsonb; st text; digest text;
 last_row sophia.owner_runner_model_reports; ordinary integer; capped boolean; next_seq integer;
 unchanged jsonb:=jsonb_build_object('operationId',p_operation,'changed',false);
BEGIN
 IF p_project IS NULL OR p_operation IS NULL THEN RAISE EXCEPTION 'Invalid model evidence target' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=p_project AND id=p_operation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Operation not found' USING ERRCODE='22023'; END IF;
 -- Only the journal it was bound to speaks for it, only while it is received, and only for its own run.
 IF p_journal IS NULL OR o.gateway_journal_id IS DISTINCT FROM p_journal OR o.state<>'received'
    OR o.kind NOT IN ('create','input') THEN RETURN unchanged; END IF;
 IF p_report IS NULL OR jsonb_typeof(p_report)<>'object' THEN c:=jsonb_build_object('state','malformed','reason','invalid');
 -- A proven superset of the worker's own bound (32768 compact UTF-8 bytes): jsonb text adds one space per separator.
 ELSIF octet_length(p_report::text)>49152 THEN c:=jsonb_build_object('state','malformed','reason','oversize');
 ELSIF p_report->>'state'='absent' AND sophia.owner_runner_model_keys(p_report, ARRAY['state']) THEN
  c:=jsonb_build_object('state','absent');
 ELSIF p_report->>'state'='malformed' AND sophia.owner_runner_model_keys(p_report, ARRAY['state','reason'])
    AND sophia.owner_runner_model_enum(p_report->'reason', ARRAY['invalid','oversize']) THEN
  c:=jsonb_build_object('state','malformed','reason',p_report->>'reason');
 ELSE
  c:=sophia.owner_runner_model_canonical(p_report);
  IF c IS NULL THEN c:=jsonb_build_object('state','malformed','reason','invalid');
  ELSIF o.native_run_id IS NULL OR c->>'runId' IS DISTINCT FROM o.native_run_id
     OR c->>'threadId' IS DISTINCT FROM o.native_thread_id THEN c:=jsonb_build_object('state','foreign');
  END IF;
 END IF;
 st:=c->>'state';
 digest:=sophia.owner_runner_sha256((c-'collectedAt')::text);
 SELECT count(*) FILTER (WHERE r.state<>'capped'), coalesce(bool_or(r.state='capped'),false) INTO ordinary, capped
  FROM sophia.owner_runner_model_reports r WHERE r.project_id=p_project AND r.operation_id=p_operation;
 IF capped THEN RETURN unchanged||jsonb_build_object('capped',true); END IF;
 SELECT * INTO last_row FROM sophia.owner_runner_model_reports r WHERE r.project_id=p_project AND r.operation_id=p_operation
  ORDER BY r.seq DESC LIMIT 1;
 IF FOUND AND last_row.evidence_sha256=digest THEN RETURN unchanged; END IF;
 next_seq:=ordinary+1;
 IF ordinary>=32 THEN st:='capped'; next_seq:=33; END IF;
 PERFORM set_config('sophia.owner_runner_model_seal',p_operation::text,true);
 INSERT INTO sophia.owner_runner_model_reports(project_id, operation_id, seq, state, evidence, unavailable_reason,
  malformed_reason, reported_collected_at, evidence_sha256, owner_id, connection_id, connection_revision, resource_id,
  goal_id, attempt_id, binding_id, qualification_id, qualification_revision, profile_id, profile_revision, adapter_pin,
  environment_ref, envelope_version, repository_root, base_commit, requested_settings_sha256, operation_kind,
  operation_revision, native_thread_id, native_run_id, gateway_journal_id)
 VALUES (p_project, p_operation, next_seq, st,
  CASE WHEN st='collected' THEN c-'collectedAt' END,
  CASE WHEN st='unavailable' THEN c->>'reason' END,
  CASE WHEN st='malformed' THEN c->>'reason' END,
  CASE WHEN st IN ('collected','unavailable') THEN c->>'collectedAt' END,
  CASE WHEN st<>'capped' THEN digest END,
  o.owner_id, o.connection_id, o.connection_revision, o.resource_id, o.goal_id, o.attempt_id, o.binding_id,
  o.qualification_id, o.qualification_revision, o.profile_id, o.profile_revision, o.adapter_pin, o.environment_ref,
  o.envelope_version, o.repository_root, o.base_commit,
  CASE WHEN o.requested_settings IS NOT NULL THEN sophia.owner_runner_sha256(o.requested_settings::text) END,
  o.kind, o.revision, o.native_thread_id, o.native_run_id, o.gateway_journal_id);
 PERFORM set_config('sophia.owner_runner_model_seal','',true);
 RETURN jsonb_build_object('operationId',p_operation,'changed',true,'seq',next_seq,'state',st,'capped',st='capped');
END $$;

REVOKE ALL ON FUNCTION sophia.owner_runner_model_immutable(), sophia.owner_runner_model_sealed(),
 sophia.owner_runner_model_cps(text), sophia.owner_runner_model_key(text), sophia.owner_runner_model_space(integer),
 sophia.owner_runner_model_attempt_id(jsonb), sophia.owner_runner_model_native_id(jsonb),
 sophia.owner_runner_model_model_id(jsonb), sophia.owner_runner_model_int(jsonb,bigint),
 sophia.owner_runner_model_keys(jsonb,text[]), sophia.owner_runner_model_enum(jsonb,text[]),
 sophia.owner_runner_model_canonical(jsonb), sophia.owner_runner_record_models(uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.owner_runner_record_models(uuid,uuid,uuid,jsonb) TO sophia_worker;

COMMIT;
