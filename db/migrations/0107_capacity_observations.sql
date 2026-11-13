-- INC04-S03a (SOPHIA-INC-2026-11, INC04-R03/R05/R07; root lease INC04-S03A-OBSERVATIONS-001, corrigenda S03-C01..C08):
-- scoped immutable capacity observations, read by the existing read-only selection preview only. Plan:
-- docs/plans/capacity-observations.md. Root allocated 0107 for this candidate; no amendment, contract or generated
-- change. 0001-0106 are not edited.
-- * A reading is OPERATOR evidence custody (migration owner only, like qualify_api_account in 0104), never a trusted
--   provider feed and never current quota by itself. It is bound to one closed, versioned scope: the API accounting
--   root and its owner and provider, the exact payment path it was taken through (connection and its CURRENT credential
--   revision) and the route, model, effort and operation. The recorder derives every scope fact from the connection's
--   own rows, never from labels. It is also bound to the exact account qualification (id and revision) and global route
--   qualification row it was taken under, both holding when it was observed; a revoke and requalification under
--   unchanged credentials and settings makes an old reading unbound, never current under the replacement, and never a
--   mask for a reading bound to the replacement. Native scopes are not in this slice.
-- * Sealed whole: the recorder writes the reading and every window in one call. A window is written only while the
--   recorder holds its seal; a reading whose window count differs is refused at commit; nothing is ever updated,
--   deleted or truncated. The same key and canonical payload replays the original; a changed payload conflicts.
-- * The epoch fence: a reading is never fresh past any of its windows' resets, so a prior-epoch "admits" becomes stale,
--   never current, when the reset passes. Complete coverage must name exactly its windows, each of known
--   applicability; no none-applicable claim exists (no qualified mechanism proves one).
-- * The read (selection_capacity_observation_at) judges at the caller's ONE instant: only readings observed AND
--   recorded by then, in the exact candidate scope, and first only those still bound to the current qualifications.
--   Among them, one stream's latest whole reading; two streams, or contradictory equal-time readings without an
--   authoritative order, are a conflict. Windows of distinct readings are never merged.
--   No value, evidence, channel, reflection or limitation is returned.
-- * Observations never write, release or reclassify a ledger, reservation, claim or uncertain hold, and they are not
--   read by admission or dispatch (0105): the preview is advisory. Coverage of limiting windows is not reflection of
--   Sophia's own consumption, which is recorded separately and never used.
-- * selection_api_candidate (0105) is replaced: its 0105 body byte for byte, plus one 'observation' key (-- 0107).
-- * selection_capacity_observations_0107() is a private installed marker for the preview's installation guard.
BEGIN;

-- --- records -----------------------------------------------------------------------------------------------------------

CREATE TABLE sophia.capacity_observations (
 id uuid PRIMARY KEY,
 observation_key text NOT NULL CHECK(observation_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
 -- The closed scope (v1): every column NOT NULL, so its uniqueness is real.
 scope_version smallint NOT NULL CHECK(scope_version=1),
 route_kind text NOT NULL CHECK(route_kind='api'),
 owner_id uuid NOT NULL, account_id uuid NOT NULL, provider text NOT NULL,
 connection_id uuid NOT NULL, credential_revision bigint NOT NULL CHECK(credential_revision>0),
 route_id text NOT NULL, model text NOT NULL, effort text NOT NULL,
 operation text NOT NULL CHECK(operation='research'),
 -- The qualifications the reading was taken under (C01): the exact live account qualification (id and revision, 0104)
 -- and the exact global route qualification row (0094; it has no revision, so its own frozen facts are kept). A reading
 -- applies only while both are still exactly these, current at the reader's instant.
 account_qualification_id uuid NOT NULL REFERENCES sophia.api_account_qualifications(id),
 account_qualification_revision bigint NOT NULL CHECK(account_qualification_revision>0),
 route_qualification_id uuid NOT NULL REFERENCES sophia.api_route_qualifications(id),
 route_qualified_at timestamptz NOT NULL, route_qualification_expires_at timestamptz NOT NULL,
 -- Provenance: who holds the evidence and how it was verified, never the evidence itself.
 source_kind text NOT NULL CHECK(source_kind='operator_recorded'),
 verification text NOT NULL CHECK(verification IN ('operator_verified_call','operator_verified_console')),
 evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref)) BETWEEN 1 AND 500),
 source_channel text NOT NULL CHECK(source_channel ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'),
 window_set_ref text NOT NULL CHECK(window_set_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'),
 window_set_version text NOT NULL CHECK(window_set_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'),
 source_sequence bigint CHECK(source_sequence IS NULL OR source_sequence>=0),
 coverage text NOT NULL CHECK(coverage IN ('complete','partial','unavailable')),
 required_window_refs text[],
 -- Whether the reading reflects Sophia's own consumption: recorded, never used (C04).
 reflection text NOT NULL CHECK(reflection IN ('unknown','none','some','all')),
 limitations text[] NOT NULL CHECK(cardinality(limitations)<=10),
 observed_at timestamptz NOT NULL, fresh_until timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 window_count integer NOT NULL CHECK(window_count BETWEEN 0 AND 20),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
 CHECK(fresh_until>observed_at),
 CHECK((coverage='complete')=(required_window_refs IS NOT NULL)),
 CHECK(required_window_refs IS NULL OR cardinality(required_window_refs) BETWEEN 1 AND 20),
 CHECK(coverage='unavailable' OR window_count>=1),
 FOREIGN KEY(account_id,owner_id) REFERENCES sophia.api_accounts(id,owner_id),
 FOREIGN KEY(connection_id,owner_id) REFERENCES sophia.api_connections(id,owner_id)
);
CREATE UNIQUE INDEX capacity_observations_one_key ON sophia.capacity_observations(account_id,connection_id,
 credential_revision,route_id,model,effort,operation,observation_key);
CREATE INDEX capacity_observations_by_scope ON sophia.capacity_observations(connection_id,credential_revision,route_id,
 model,effort,operation,observed_at);

CREATE TABLE sophia.capacity_observation_windows (
 observation_id uuid NOT NULL REFERENCES sophia.capacity_observations(id),
 window_ref text NOT NULL CHECK(window_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'),
 window_epoch text CHECK(window_epoch IS NULL OR window_epoch ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'),
 scope text NOT NULL CHECK(scope IN ('account','model','spend','concurrency')),
 model_selector text,
 -- Provider-native, never converted, added or compared across windows.
 unit text NOT NULL CHECK(unit ~ '^[A-Za-z0-9][A-Za-z0-9._:/%-]{0,99}$'),
 -- Retained custody only: never projected and never used to decide anything.
 value numeric,
 -- The source's own statement; Sophia never derives it from a value.
 verdict text NOT NULL CHECK(verdict IN ('admits','exhausted','unknown')),
 applicability text NOT NULL CHECK(applicability IN ('known','partial','unknown')),
 reset_at timestamptz,
 PRIMARY KEY(observation_id,window_ref),
 CHECK((scope='model')=(model_selector IS NOT NULL))
);

CREATE TABLE sophia.capacity_observation_revocations (
 observation_id uuid PRIMARY KEY REFERENCES sophia.capacity_observations(id),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 500),
 revoked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE sophia.capacity_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.capacity_observation_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.capacity_observation_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.capacity_observations, sophia.capacity_observation_windows,
 sophia.capacity_observation_revocations FROM PUBLIC;

-- --- the seal ----------------------------------------------------------------------------------------------------------

-- Nothing recorded is ever changed or removed.
CREATE FUNCTION sophia.capacity_observation_immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
BEGIN
 RAISE EXCEPTION 'A capacity observation is sealed: % is refused', TG_OP USING ERRCODE='55000';
END $$;
CREATE TRIGGER capacity_observations_immutable BEFORE UPDATE OR DELETE ON sophia.capacity_observations
 FOR EACH ROW EXECUTE FUNCTION sophia.capacity_observation_immutable();
CREATE TRIGGER capacity_observations_no_truncate BEFORE TRUNCATE ON sophia.capacity_observations
 FOR EACH STATEMENT EXECUTE FUNCTION sophia.capacity_observation_immutable();
CREATE TRIGGER capacity_observation_windows_immutable BEFORE UPDATE OR DELETE ON sophia.capacity_observation_windows
 FOR EACH ROW EXECUTE FUNCTION sophia.capacity_observation_immutable();
CREATE TRIGGER capacity_observation_windows_no_truncate BEFORE TRUNCATE ON sophia.capacity_observation_windows
 FOR EACH STATEMENT EXECUTE FUNCTION sophia.capacity_observation_immutable();
CREATE TRIGGER capacity_observation_revocations_immutable BEFORE UPDATE OR DELETE ON sophia.capacity_observation_revocations
 FOR EACH ROW EXECUTE FUNCTION sophia.capacity_observation_immutable();
CREATE TRIGGER capacity_observation_revocations_no_truncate BEFORE TRUNCATE ON sophia.capacity_observation_revocations
 FOR EACH STATEMENT EXECUTE FUNCTION sophia.capacity_observation_immutable();

-- A reading and its windows are written only by the recorder, inside its seal for exactly that reading.
CREATE FUNCTION sophia.capacity_observation_sealed() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE target text:=to_jsonb(NEW)->>CASE TG_TABLE_NAME WHEN 'capacity_observations' THEN 'id' ELSE 'observation_id' END;
BEGIN
 IF current_setting('sophia.capacity_observation_seal',true) IS DISTINCT FROM target THEN
  RAISE EXCEPTION 'A capacity observation is sealed: it is written whole, only by its recorder' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capacity_observations_sealed BEFORE INSERT ON sophia.capacity_observations
 FOR EACH ROW EXECUTE FUNCTION sophia.capacity_observation_sealed();
CREATE TRIGGER capacity_observation_windows_sealed BEFORE INSERT ON sophia.capacity_observation_windows
 FOR EACH ROW EXECUTE FUNCTION sophia.capacity_observation_sealed();

-- No half reading reaches a commit.
CREATE FUNCTION sophia.capacity_observation_whole() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM sophia.capacity_observation_windows WHERE observation_id=NEW.id;
 IF n<>NEW.window_count THEN
  RAISE EXCEPTION 'A capacity observation is incomplete: % of its % windows', n, NEW.window_count USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER capacity_observations_whole AFTER INSERT ON sophia.capacity_observations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sophia.capacity_observation_whole();

-- --- the recorder (migration owner only) -----------------------------------------------------------------------------

-- An instant as text, UTC, microseconds: one spelling for the canonical payload.
CREATE FUNCTION sophia.capacity_observation_instant(t timestamptz) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT to_char(t AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') $$;

-- A closed object: exactly its keys (required ones present), or why not.
CREATE FUNCTION sophia.capacity_observation_keys(p jsonb, p_allowed text[], p_required text[], p_what text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
DECLARE k text;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' THEN RAISE EXCEPTION 'A % is an object', p_what USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(p) LOOP
  IF NOT k=ANY(p_allowed) THEN RAISE EXCEPTION 'Unknown % field %', p_what, k USING ERRCODE='22023'; END IF;
 END LOOP;
 FOREACH k IN ARRAY p_required LOOP
  IF NOT p ? k OR jsonb_typeof(p->k)='null' THEN RAISE EXCEPTION 'A % names its %', p_what, k USING ERRCODE='22023'; END IF;
 END LOOP;
END $$;

-- An optional string field: its text, NULL when absent or null, refused when another type.
CREATE FUNCTION sophia.capacity_observation_text(p jsonb, k text) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
BEGIN
 IF NOT p ? k OR jsonb_typeof(p->k)='null' THEN RETURN NULL; END IF;
 IF jsonb_typeof(p->k)<>'string' THEN RAISE EXCEPTION 'Field % is text', k USING ERRCODE='22023'; END IF;
 RETURN p->>k;
END $$;

-- A string array field (or NULL when absent or null): its distinct elements, sorted; duplicates are refused.
CREATE FUNCTION sophia.capacity_observation_list(p jsonb, k text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
DECLARE xs text[];
BEGIN
 IF NOT p ? k OR jsonb_typeof(p->k)='null' THEN RETURN NULL; END IF;
 IF jsonb_typeof(p->k)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->k) e WHERE jsonb_typeof(e)<>'string') THEN
  RAISE EXCEPTION 'Field % is a list of text', k USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(e ORDER BY e COLLATE "C"),'{}') INTO xs FROM jsonb_array_elements_text(p->k) e;
 IF cardinality(xs)<>(SELECT count(DISTINCT x) FROM unnest(xs) x) THEN
  RAISE EXCEPTION 'Field % names an item twice', k USING ERRCODE='22023'; END IF;
 RETURN xs;
END $$;

-- One window, checked and canonical (its value with no trailing zeros), or why not.
CREATE FUNCTION sophia.capacity_observation_window(w jsonb, p_model text, p_observed timestamptz, p_fresh timestamptz)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
DECLARE v numeric; r timestamptz; sel text;
BEGIN
 PERFORM sophia.capacity_observation_keys(w,
  ARRAY['windowRef','windowEpoch','scope','modelSelector','unit','value','verdict','applicability','resetAt'],
  ARRAY['windowRef','scope','unit','verdict','applicability'],'window');
 IF w ? 'value' AND jsonb_typeof(w->'value') NOT IN ('number','null') THEN
  RAISE EXCEPTION 'A window value is a number' USING ERRCODE='22023'; END IF;
 v:=CASE WHEN jsonb_typeof(w->'value')='number' THEN trim_scale((w->>'value')::numeric) END;
 r:=sophia.capacity_observation_text(w,'resetAt')::timestamptz;
 sel:=sophia.capacity_observation_text(w,'modelSelector');
 IF (w->>'scope'='model') AND sel IS DISTINCT FROM p_model THEN
  RAISE EXCEPTION 'A model window names exactly the reading''s model' USING ERRCODE='22023'; END IF;
 IF r IS NOT NULL AND (r<=p_observed OR p_fresh>r) THEN
  RAISE EXCEPTION 'A window resets after it was observed, and a reading is never fresh past a reset' USING ERRCODE='22023';
 END IF;
 RETURN jsonb_build_object('windowRef',w->>'windowRef','windowEpoch',sophia.capacity_observation_text(w,'windowEpoch'),
  'scope',w->>'scope','modelSelector',sel,'unit',w->>'unit','value',v,'verdict',w->>'verdict',
  'applicability',w->>'applicability','resetAt',CASE WHEN r IS NOT NULL THEN sophia.capacity_observation_instant(r) END);
END $$;

-- The qualifications a reading names, for exactly its connection (C01, A1 review): the connection's ONE live account
-- qualification at p_now (0104: its current credential revision and settings) is exactly the named id and revision, and
-- the named global route qualification row for its route, model and effort is current at p_now; and BOTH already held
-- when the reading was observed: the account qualification was observed by then and unexpired, the route row qualified
-- by then, unexpired and unrevoked. A reading taken before its qualification is never blessed by a later one.
CREATE FUNCTION sophia.capacity_observation_qualifications(conn sophia.api_connections, p_account_qualification uuid,
 p_account_revision bigint, p_route_qualification uuid, p_observed timestamptz, p_now timestamptz)
RETURNS sophia.api_route_qualifications LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
DECLARE live jsonb:=sophia.selection_account_qualification_at(conn,p_now); aq sophia.api_account_qualifications;
 rq sophia.api_route_qualifications;
BEGIN
 IF live->>'state' IS DISTINCT FROM 'current' OR (live->>'id')::uuid IS DISTINCT FROM p_account_qualification
    OR (live->>'revision')::bigint IS DISTINCT FROM p_account_revision OR NOT live->'operations' ? 'research' THEN
  RETURN NULL; END IF;
 SELECT * INTO aq FROM sophia.api_account_qualifications WHERE id=p_account_qualification;
 IF aq.observed_at>p_observed OR aq.expires_at<=p_observed
    OR (aq.revoked_at IS NOT NULL AND aq.revoked_at<=p_observed) THEN RETURN NULL; END IF;
 SELECT * INTO rq FROM sophia.api_route_qualifications q WHERE q.id=p_route_qualification AND q.route_id=conn.route_id
  AND q.model=conn.model AND q.effort=conn.effort
  AND q.qualified_at<=p_now AND q.expires_at>p_now AND (q.revoked_at IS NULL OR q.revoked_at>p_now)
  AND q.qualified_at<=p_observed AND q.expires_at>p_observed AND (q.revoked_at IS NULL OR q.revoked_at>p_observed);
 RETURN rq;
END $$;

-- Whether a recorded reading is still bound to its qualifications at p_now: the same rows, the route row with the same
-- frozen facts, each holding at the reading's own observation (capacity_observation_qualifications).
CREATE FUNCTION sophia.capacity_observation_bound(conn sophia.api_connections, o sophia.capacity_observations,
 p_now timestamptz) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
DECLARE rq sophia.api_route_qualifications:=sophia.capacity_observation_qualifications(conn,o.account_qualification_id,
 o.account_qualification_revision,o.route_qualification_id,o.observed_at,p_now);
BEGIN
 RETURN rq.id IS NOT NULL AND rq.qualified_at=o.route_qualified_at AND rq.expires_at=o.route_qualification_expires_at;
END $$;

-- The recorder's checked reading: scope and qualifications derived from the connection's own rows, every shape rule, and
-- the canonical payload (its key excluded) whose SHA-256 decides replay versus conflict.
CREATE FUNCTION sophia.capacity_observation_reading(p jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE conn sophia.api_connections; acc sophia.api_accounts; rq sophia.api_route_qualifications; observed timestamptz;
 fresh timestamptz; cov text; req text[]; wins jsonb:='[]'; w jsonb; refs text[]; seq bigint; lims text[];
BEGIN
 PERFORM sophia.capacity_observation_keys(p,
  ARRAY['observationKey','connectionId','credentialRevision','accountQualificationId','accountQualificationRevision',
   'routeQualificationId','operation','verification','evidenceRef','sourceChannel','windowSetRef','windowSetVersion',
   'sourceSequence','coverage','requiredWindowRefs','reflection','limitations','observedAt','freshUntil','windows'],
  ARRAY['observationKey','connectionId','credentialRevision','accountQualificationId','accountQualificationRevision',
   'routeQualificationId','operation','verification','evidenceRef','sourceChannel','windowSetRef','windowSetVersion',
   'coverage','reflection','observedAt','freshUntil','windows'],'reading');
 SELECT * INTO conn FROM sophia.api_connections WHERE id=sophia.capacity_observation_text(p,'connectionId')::uuid FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Connection not found' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p->'credentialRevision')<>'number' OR (p->>'credentialRevision')::numeric<>conn.credential_revision
    OR conn.credential_revision<1 THEN
  RAISE EXCEPTION 'A reading names its connection''s current credential revision' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p->'accountQualificationRevision')<>'number' THEN
  RAISE EXCEPTION 'A reading names its account qualification''s revision' USING ERRCODE='22023'; END IF;
 rq:=sophia.capacity_observation_qualifications(conn,
  sophia.capacity_observation_text(p,'accountQualificationId')::uuid,(p->>'accountQualificationRevision')::bigint,
  sophia.capacity_observation_text(p,'routeQualificationId')::uuid,
  sophia.capacity_observation_text(p,'observedAt')::timestamptz,clock_timestamp());
 IF rq.id IS NULL THEN
  RAISE EXCEPTION 'A reading names its connection''s current account qualification and a current route qualification, both holding when it was observed'
   USING ERRCODE='22023'; END IF;
 SELECT * INTO acc FROM sophia.api_accounts WHERE id=conn.account_id AND owner_id=conn.owner_id;
 cov:=sophia.capacity_observation_text(p,'coverage');
 IF cov='none_applicable' THEN
  RAISE EXCEPTION 'Unsupported coverage none_applicable: no qualified mechanism proves that no window applies'
   USING ERRCODE='0A000'; END IF;
 observed:=sophia.capacity_observation_text(p,'observedAt')::timestamptz;
 fresh:=sophia.capacity_observation_text(p,'freshUntil')::timestamptz;
 IF observed>clock_timestamp() THEN RAISE EXCEPTION 'An observation cannot be in the future' USING ERRCODE='22023'; END IF;
 IF fresh<=observed THEN RAISE EXCEPTION 'A reading is fresh only after it was observed' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p->'windows')<>'array' OR jsonb_array_length(p->'windows')>20 THEN
  RAISE EXCEPTION 'A reading has at most 20 windows' USING ERRCODE='22023'; END IF;
 FOR w IN SELECT e FROM jsonb_array_elements(p->'windows') e LOOP
  wins:=wins||jsonb_build_array(sophia.capacity_observation_window(w,conn.model,observed,fresh));
 END LOOP;
 SELECT coalesce(array_agg(x->>'windowRef' ORDER BY x->>'windowRef' COLLATE "C"),'{}') INTO refs
  FROM jsonb_array_elements(wins) x;
 IF cardinality(refs)<>(SELECT count(DISTINCT r) FROM unnest(refs) r) THEN
  RAISE EXCEPTION 'A window is named once' USING ERRCODE='22023'; END IF;
 req:=sophia.capacity_observation_list(p,'requiredWindowRefs');
 IF cov='complete' AND (req IS NULL OR cardinality(req)=0 OR req IS DISTINCT FROM refs
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(wins) x WHERE x->>'applicability'<>'known')) THEN
  RAISE EXCEPTION 'Complete coverage names exactly its windows, at least one, each of known applicability'
   USING ERRCODE='22023'; END IF;
 IF cov<>'complete' AND req IS NOT NULL THEN
  RAISE EXCEPTION 'Only complete coverage names required windows' USING ERRCODE='22023'; END IF;
 IF p ? 'sourceSequence' AND jsonb_typeof(p->'sourceSequence') NOT IN ('number','null') THEN
  RAISE EXCEPTION 'A source sequence is a number' USING ERRCODE='22023'; END IF;
 seq:=CASE WHEN jsonb_typeof(p->'sourceSequence')='number' THEN (p->>'sourceSequence')::bigint END;
 lims:=coalesce(sophia.capacity_observation_list(p,'limitations'),'{}');
 RETURN jsonb_build_object('scopeVersion',1,'routeKind','api','ownerId',conn.owner_id,'accountId',acc.id,
  'provider',acc.provider,'connectionId',conn.id,'credentialRevision',conn.credential_revision,'routeId',conn.route_id,
  'model',conn.model,'effort',conn.effort,'operation',sophia.capacity_observation_text(p,'operation'),
  'accountQualificationId',(p->>'accountQualificationId')::uuid,
  'accountQualificationRevision',(p->>'accountQualificationRevision')::bigint,'routeQualificationId',rq.id,
  'routeQualifiedAt',sophia.capacity_observation_instant(rq.qualified_at),
  'routeQualificationExpiresAt',sophia.capacity_observation_instant(rq.expires_at),
  'sourceKind','operator_recorded','verification',sophia.capacity_observation_text(p,'verification'),
  'evidenceRef',sophia.capacity_observation_text(p,'evidenceRef'),
  'sourceChannel',sophia.capacity_observation_text(p,'sourceChannel'),
  'windowSetRef',sophia.capacity_observation_text(p,'windowSetRef'),
  'windowSetVersion',sophia.capacity_observation_text(p,'windowSetVersion'),'sourceSequence',seq,'coverage',cov,
  'requiredWindowRefs',to_jsonb(req),'reflection',sophia.capacity_observation_text(p,'reflection'),
  'limitations',to_jsonb(lims),'observedAt',sophia.capacity_observation_instant(observed),
  'freshUntil',sophia.capacity_observation_instant(fresh),
  'windows',coalesce((SELECT jsonb_agg(x ORDER BY x->>'windowRef' COLLATE "C") FROM jsonb_array_elements(wins) x),'[]'));
END $$;

-- What a recorded reading's receipt says: identical for its first write and every replay.
CREATE FUNCTION sophia.capacity_observation_receipt(o sophia.capacity_observations) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('observationId',o.id,'observationKey',o.observation_key,'accountId',o.account_id,
  'connectionId',o.connection_id,'credentialRevision',o.credential_revision,
  'accountQualificationId',o.account_qualification_id,'accountQualificationRevision',o.account_qualification_revision,
  'routeQualificationId',o.route_qualification_id,'coverage',o.coverage,'windowCount',o.window_count,
  'observedAt',sophia.capacity_observation_instant(o.observed_at),
  'freshUntil',sophia.capacity_observation_instant(o.fresh_until),
  'recordedAt',sophia.capacity_observation_instant(o.recorded_at),'payloadSha256',o.payload_sha256) $$;

-- Write one checked reading and its windows inside the seal; NULL when its key is already taken in its scope.
CREATE FUNCTION sophia.capacity_observation_insert(id_ uuid, p_key text, r jsonb, h text) RETURNS uuid LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE got uuid; w jsonb;
BEGIN
 PERFORM set_config('sophia.capacity_observation_seal',id_::text,true);
 INSERT INTO sophia.capacity_observations(id,observation_key,scope_version,route_kind,owner_id,account_id,provider,
  connection_id,credential_revision,route_id,model,effort,operation,account_qualification_id,
  account_qualification_revision,route_qualification_id,route_qualified_at,route_qualification_expires_at,source_kind,
  verification,evidence_ref,source_channel,window_set_ref,window_set_version,source_sequence,coverage,
  required_window_refs,reflection,limitations,observed_at,fresh_until,window_count,payload_sha256)
 VALUES(id_,p_key,1,'api',(r->>'ownerId')::uuid,(r->>'accountId')::uuid,r->>'provider',(r->>'connectionId')::uuid,
  (r->>'credentialRevision')::bigint,r->>'routeId',r->>'model',r->>'effort',r->>'operation',
  (r->>'accountQualificationId')::uuid,(r->>'accountQualificationRevision')::bigint,(r->>'routeQualificationId')::uuid,
  (r->>'routeQualifiedAt')::timestamptz,(r->>'routeQualificationExpiresAt')::timestamptz,'operator_recorded',
  r->>'verification',r->>'evidenceRef',r->>'sourceChannel',r->>'windowSetRef',r->>'windowSetVersion',
  (r->>'sourceSequence')::bigint,r->>'coverage',
  CASE WHEN jsonb_typeof(r->'requiredWindowRefs')='array'
   THEN ARRAY(SELECT jsonb_array_elements_text(r->'requiredWindowRefs')) END,
  r->>'reflection',ARRAY(SELECT jsonb_array_elements_text(r->'limitations')),(r->>'observedAt')::timestamptz,
  (r->>'freshUntil')::timestamptz,jsonb_array_length(r->'windows'),h)
 ON CONFLICT (account_id,connection_id,credential_revision,route_id,model,effort,operation,observation_key) DO NOTHING
 RETURNING id INTO got;
 IF got IS NOT NULL THEN
  FOR w IN SELECT e FROM jsonb_array_elements(r->'windows') e LOOP
   INSERT INTO sophia.capacity_observation_windows(observation_id,window_ref,window_epoch,scope,model_selector,unit,value,
    verdict,applicability,reset_at)
   VALUES(id_,w->>'windowRef',w->>'windowEpoch',w->>'scope',w->>'modelSelector',w->>'unit',(w->>'value')::numeric,
    w->>'verdict',w->>'applicability',(w->>'resetAt')::timestamptz);
  END LOOP;
 END IF;
 PERFORM set_config('sophia.capacity_observation_seal','',true);
 RETURN got;
END $$;

-- Operator: record one sealed reading on evidence kept outside the database. Migration owner only (EXECUTE granted to no
-- role). The same key and payload returns the original receipt, also under a concurrent race; a changed payload under
-- the same key in the same scope is a conflict (23505). Recording it qualifies nothing and changes no ledger.
CREATE FUNCTION sophia.record_capacity_observation(p jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
DECLARE r jsonb; h text; key text; id_ uuid:=gen_random_uuid(); got uuid; o sophia.capacity_observations;
BEGIN
 BEGIN
  r:=sophia.capacity_observation_reading(p);
  key:=sophia.capacity_observation_text(p,'observationKey');
  h:=encode(sha256(convert_to(r::text,'UTF8')),'hex');
  got:=sophia.capacity_observation_insert(id_,key,r,h);
 EXCEPTION WHEN data_exception OR check_violation OR not_null_violation OR foreign_key_violation THEN
  RAISE EXCEPTION 'Invalid capacity observation: %', SQLERRM USING ERRCODE='22023';
 END;
 IF got IS NULL THEN
  SELECT * INTO o FROM sophia.capacity_observations x WHERE x.account_id=(r->>'accountId')::uuid
   AND x.connection_id=(r->>'connectionId')::uuid AND x.credential_revision=(r->>'credentialRevision')::bigint
   AND x.route_id=r->>'routeId' AND x.model=r->>'model' AND x.effort=r->>'effort' AND x.operation=r->>'operation'
   AND x.observation_key=key;
  IF o.payload_sha256 IS DISTINCT FROM h THEN
   RAISE EXCEPTION 'This observation key was recorded with a different reading' USING ERRCODE='23505'; END IF;
  RETURN sophia.capacity_observation_receipt(o);
 END IF;
 SELECT * INTO o FROM sophia.capacity_observations WHERE id=id_;
 RETURN sophia.capacity_observation_receipt(o);
END $$;

-- Operator: revoke a reading, naming why. Insert-only; the same reason again is a no-op, another reason a conflict.
-- Nothing it allowed in a past preview is undone, and no ledger changes.
CREATE FUNCTION sophia.revoke_capacity_observation(p_id uuid, p_reason text) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
DECLARE x sophia.capacity_observation_revocations;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sophia.capacity_observations WHERE id=p_id) THEN
  RAISE EXCEPTION 'Capacity observation not found' USING ERRCODE='22023'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
  RAISE EXCEPTION 'A revocation names its reason' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.capacity_observation_revocations(observation_id,reason) VALUES(p_id,p_reason)
  ON CONFLICT (observation_id) DO NOTHING;
 SELECT * INTO x FROM sophia.capacity_observation_revocations WHERE observation_id=p_id;
 IF x.reason<>p_reason THEN RAISE EXCEPTION 'This observation was revoked for another reason' USING ERRCODE='23505'; END IF;
 RETURN jsonb_build_object('observationId',p_id,'revokedAt',sophia.capacity_observation_instant(x.revoked_at));
END $$;

-- --- the read: one candidate's exact scope at one instant ------------------------------------------------------------

-- The reading that speaks for this grant's use through this connection at p_now, or NULL when none in its exact scope was
-- observed and recorded by then. Exact scope: the connection's account, owner and CURRENT credential revision, and the
-- grant's route, model, effort and operation (which the connection pins). Then, FIRST, which of those readings are still
-- bound to the qualifications current at p_now (capacity_observation_bound): readings of a replaced or lapsed
-- qualification never mask, outvote or conflict with a reading bound to the current one; when only such readings exist,
-- the answer is unbound (restrictive, never the no-reading baseline). Among the bound readings only: two streams
-- (channel, window set, version) are a conflict; in one, the latest observed, then the higher authoritative source
-- sequence; contradictory equal-time readings without two distinct sequences are a conflict. Revoked readings stay in
-- that choice: a revoked latest reading answers revoked, and an older positive is never resurrected. Otherwise recorded,
-- with its freshness at p_now and its windows, and no value, evidence, channel, reflection or limitation.
CREATE FUNCTION sophia.selection_capacity_observation_at(gr sophia.api_contribution_grants, conn sophia.api_connections,
 p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
DECLARE scoped uuid[]; bound uuid[]; streams integer; o sophia.capacity_observations; ties integer;
BEGIN
 IF gr.route_id IS DISTINCT FROM conn.route_id OR gr.model IS DISTINCT FROM conn.model
    OR gr.effort IS DISTINCT FROM conn.effort THEN RETURN NULL; END IF;
 SELECT coalesce(array_agg(v.id),'{}'), coalesce(array_agg(v.id) FILTER (WHERE sophia.capacity_observation_bound(conn,v,p_now)),'{}')
  INTO scoped, bound
  FROM sophia.capacity_observations v WHERE v.account_id=conn.account_id AND v.owner_id=conn.owner_id
   AND v.connection_id=conn.id AND v.credential_revision=conn.credential_revision AND v.route_id=gr.route_id
   AND v.model=gr.model AND v.effort=gr.effort AND v.operation=gr.operation AND v.observed_at<=p_now AND v.recorded_at<=p_now;
 IF cardinality(scoped)=0 THEN RETURN NULL; END IF;
 IF cardinality(bound)=0 THEN RETURN jsonb_build_object('state','unbound'); END IF;
 SELECT count(DISTINCT (v.source_channel,v.window_set_ref,v.window_set_version)) INTO streams
  FROM sophia.capacity_observations v WHERE v.id=ANY(bound);
 IF streams>1 THEN RETURN jsonb_build_object('state','conflict'); END IF;
 -- The latest observed, then the highest authoritative sequence (a missing one ranks lowest), then the id.
 SELECT v.* INTO o FROM sophia.capacity_observations v WHERE v.id=ANY(bound)
  ORDER BY v.observed_at DESC, v.source_sequence DESC NULLS LAST, v.id LIMIT 1;
 -- Another bound reading at the same instant that says something else, without two distinct sequences: no order.
 SELECT count(*) INTO ties FROM sophia.capacity_observations v WHERE v.id=ANY(bound)
   AND v.observed_at=o.observed_at AND v.payload_sha256<>o.payload_sha256
   AND (v.source_sequence IS NULL OR o.source_sequence IS NULL OR v.source_sequence=o.source_sequence);
 IF ties>0 THEN RETURN jsonb_build_object('state','conflict'); END IF;
 IF EXISTS(SELECT 1 FROM sophia.capacity_observation_revocations x WHERE x.observation_id=o.id AND x.revoked_at<=p_now) THEN
  RETURN jsonb_build_object('state','revoked'); END IF;
 RETURN jsonb_build_object('state','recorded','observationId',o.id,'observedAt',o.observed_at,'freshUntil',o.fresh_until,
  'fresh',o.fresh_until>p_now,'coverage',o.coverage,'requiredWindowRefs',to_jsonb(o.required_window_refs),
  'windows',coalesce((SELECT jsonb_agg(jsonb_build_object('windowRef',w.window_ref,'windowEpoch',w.window_epoch,
    'scope',w.scope,'unit',w.unit,'verdict',w.verdict,'applicability',w.applicability,'resetAt',w.reset_at)
    ORDER BY w.window_ref COLLATE "C") FROM sophia.capacity_observation_windows w WHERE w.observation_id=o.id),'[]'));
END $$;

-- The installed observations' private marker (0107). Executable by no application role.
CREATE FUNCTION sophia.selection_capacity_observations_0107() RETURNS integer LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT 107 $$;

-- --- the trusted preview's observation fact ----------------------------------------------------------------------------

-- selection_api_candidate (0105), replaced: its 0105 body byte for byte, and one key, 'observation': the reading that
-- speaks for this candidate's exact scope at the snapshot's instant, or null.
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
  'protection',sophia.selection_protection_at(acc,gr,slots,committed,p_now));
END $$;

-- --- privileges ------------------------------------------------------------------------------------------------------
-- The replaced candidate keeps its grants (CREATE OR REPLACE): none. Every new function is executable by no application
-- role: the recorder and revoker are the migration owner's; the read is reached only through the definer snapshot.
REVOKE ALL ON FUNCTION sophia.capacity_observation_immutable(), sophia.capacity_observation_sealed(),
 sophia.capacity_observation_whole(), sophia.capacity_observation_instant(timestamptz),
 sophia.capacity_observation_keys(jsonb,text[],text[],text), sophia.capacity_observation_text(jsonb,text),
 sophia.capacity_observation_list(jsonb,text),
 sophia.capacity_observation_window(jsonb,text,timestamptz,timestamptz),
 sophia.capacity_observation_qualifications(sophia.api_connections,uuid,bigint,uuid,timestamptz,timestamptz),
 sophia.capacity_observation_bound(sophia.api_connections,sophia.capacity_observations,timestamptz),
 sophia.capacity_observation_reading(jsonb), sophia.capacity_observation_receipt(sophia.capacity_observations),
 sophia.capacity_observation_insert(uuid,text,jsonb,text), sophia.record_capacity_observation(jsonb),
 sophia.revoke_capacity_observation(uuid,text),
 sophia.selection_capacity_observation_at(sophia.api_contribution_grants,sophia.api_connections,timestamptz),
 sophia.selection_capacity_observations_0107() FROM PUBLIC;

COMMIT;
