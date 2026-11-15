-- INC04-R07-C3-RECONCILE-001 (SOPHIA-INC-2026-11, INC-04 R07 C3, Stage A): known-evidence reconciliation, nonmonetary
-- cause adjudication and certification over the 0111 generation fence. Root reserved 0112. 0001-0111 are not edited;
-- four existing functions are replaced here (marked), every other definition is new.
-- * AUTHORITY. Every operation names a durable, append-only, operator-only authority record (kind, exact scope, approver
--   and verifier references) created by the migration owner. An approval string, a digest or a GUC is never authority by
--   itself; the record binds scope and evidence. It is not proof of a live billing check: production execution stays an
--   external owner/fixed-scope executor with independent verification.
-- * A. reconcile_research_reservation: a monetary-open (reserved/uncertain) reservation settles ONCE through the existing
--   end_research_reservation, bound to its ORIGINAL identities (allowance, account|null, resource, operation, call,
--   provider and, where its resource has one, the 0111 fence and generation that froze it as open). The only basis is
--   provider_billed_attestation with a canonical 6-decimal cost (a genuinely evidenced zero is that basis at 0.000000).
--   conservative_at_reserved (D1) is refused. Truth, history and witnesses are never touched; absence is never zero.
-- * B (F01). Every conflict or overflow is one recorded cause (research_restriction_causes; backfilled from retained
--   truth/history), adjudicated nonmonetarily and append-only (research_cause_adjudications) only once its reservation is
--   final. Money, truth, witnesses and history never change to make a cause disappear.
-- * C (F02). The account-null allowance restriction is an active projection: episodes opened by causes, closed only by an
--   allowance certificate. The ACTUAL reserve_research gate and the ACTUAL restriction writer use it; a fresh cause opens
--   a new episode (recurrence); legacy rows and history are kept.
-- * D (F03). An account certificate covers every alias connection, every current project and every cause of the
--   account: projects in id order FOR UPDATE, the guard LAST; membership and the complete current cause set are recomputed
--   after that last wait and must equal what the operator certified. The replaced cause writer locks the guard LAST even
--   when it is already restricted, so every new cause serializes with it. The guard clears only through the replaced
--   trigger, which validates the durable certificate of the same transaction against the current causes.
-- * R1 (C3REC-F01). record_research_late_facts: the governed, non-native path of late original-generation facts after the
--   original runtime is revoked (a late_fact_attestation authority, the original binding and fence/generation, a durable
--   operation key: same key + same input replays, same key + changed input refuses, a later observation is a distinct
--   key), for a FENCED original generation. The report goes through a FACT-ONLY copy of the fact writer (observed_v1,
--   history, conflicts, causes, recurrence; the money transition replaced by a pure comparison), on reserved, uncertain,
--   settled or released targets alike, and never moves money; billed cost stays the separate reconciliation.
-- * R2 P03/P03-A. The original generation is a canonical tuple (project, the call's frozen resource and runtime, the
--   generation token of that resource's immutable 0111 link binding, or JSON null exactly when the resource has no
--   contribution link (a legacy runtime resource), the resource's fence or null), proven after the project wait by one bound
--   read of the ORIGINAL runtime row, which a maintained path must have revoked, and, where the resource has a fence, that
--   exact fence. Non-fenced revocations are a same-resource re-registration of the runtime unit (0094, non-rotating) and a
--   legacy re-registration; an ordinary rotation drains the resource and leaves its runtime active (refused here). A
--   replacement never counts.
-- * R2 P02. While the money is open the truth's financial pair stays the money's (uncertain, no cost): a reported outcome
--   and cost are a claim, kept on the operation record with basis reported_unverified beside the unchanged money.
-- * E. Closed versioned inputs; canonical jsonb and sha256 digests; exact replay before mutable checks; bounded sets
--   refused whole. Unknown jobs, uncertain money, qualification and caps remain their own barriers.

BEGIN;

-- --- durable records (private, append-only) -------------------------------------------------------------------------

CREATE TABLE sophia.research_financial_authorities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 authority_key text NOT NULL UNIQUE CHECK(authority_key ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,119}$'),
 kind text NOT NULL CHECK(kind IN ('provider_billed_attestation','cause_adjudication','certification','late_fact_attestation')),
 account_id uuid, project_id uuid, allowance_id uuid,
 approver_ref text NOT NULL CHECK(length(approver_ref) BETWEEN 1 AND 300 AND approver_ref !~ '[[:cntrl:]]'),
 verifier_ref text NOT NULL CHECK(length(verifier_ref) BETWEEN 1 AND 300 AND verifier_ref !~ '[[:cntrl:]]'),
 recorded_by text NOT NULL DEFAULT session_user,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(approver_ref<>verifier_ref),
 CHECK((account_id IS NOT NULL)<>(project_id IS NOT NULL)), CHECK((project_id IS NULL)=(allowance_id IS NULL))
);
CREATE TABLE sophia.research_financial_authority_revocations (
 authority_id uuid PRIMARY KEY REFERENCES sophia.research_financial_authorities(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 300),
 revoked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- One recorded restriction cause: a conflict or an overflow of one tracked reservation, in its original scope.
CREATE TABLE sophia.research_restriction_causes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 scope text NOT NULL CHECK(scope IN ('account','allowance')),
 account_id uuid, project_id uuid NOT NULL, allowance_id uuid NOT NULL, reservation_id uuid NOT NULL,
 seq integer NOT NULL CHECK(seq>0),
 kind text NOT NULL CHECK(kind IN ('conflict','overflow')),
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 origin text NOT NULL CHECK(origin IN ('writer','backfill_0112')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((scope='account')=(account_id IS NOT NULL)),
 UNIQUE(project_id,reservation_id,kind,digest),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_reservations(project_id,id)
);
CREATE UNIQUE INDEX research_restriction_causes_account_seq ON sophia.research_restriction_causes(account_id,seq) WHERE scope='account';
CREATE UNIQUE INDEX research_restriction_causes_allowance_seq ON sophia.research_restriction_causes(project_id,allowance_id,seq) WHERE scope='allowance';

CREATE TABLE sophia.research_cause_adjudications (
 cause_id uuid PRIMARY KEY REFERENCES sophia.research_restriction_causes(id),
 outcome text NOT NULL CHECK(outcome='original_money_stands'),
 authority_id uuid NOT NULL REFERENCES sophia.research_financial_authorities(id),
 input jsonb NOT NULL, digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'), result jsonb NOT NULL,
 adjudicated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sophia.research_reservation_reconciliations (
 project_id uuid NOT NULL, reservation_id uuid NOT NULL,
 basis text NOT NULL CHECK(basis='provider_billed_attestation'),
 cost_usd numeric(12,6) NOT NULL CHECK(cost_usd>=0),
 prior_state text NOT NULL CHECK(prior_state IN ('reserved','uncertain')),
 authority_id uuid NOT NULL REFERENCES sophia.research_financial_authorities(id),
 fence_id uuid REFERENCES sophia.research_runtime_fences(id),
 input jsonb NOT NULL, digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'), result jsonb NOT NULL,
 reconciled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,reservation_id),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_reservations(project_id,id)
);

-- R1 (C3REC-F01): one governed late-fact operation, keyed by its durable operation identity (P01).
CREATE TABLE sophia.research_late_fact_operations (
 operation_key text PRIMARY KEY CHECK(operation_key ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,119}$'),
 project_id uuid NOT NULL, reservation_id uuid NOT NULL,
 -- R2 P03: the original generation's canonical tuple and the basis of its revocation proof.
 fence_id uuid REFERENCES sophia.research_runtime_fences(id),
 generation text CHECK(generation ~ '^[0-9a-f]{64}$'), -- P03-A: NULL exactly when the original resource has no contribution link
 CHECK(fence_id IS NULL OR generation IS NOT NULL),
 original_runtime_id uuid NOT NULL,
 original_basis text NOT NULL CHECK(original_basis IN ('fence','runtime_revoked')),
 CHECK((fence_id IS NULL)=(original_basis='runtime_revoked')),
 -- R2 P02: what the report claimed, never financial truth, beside the reservation's money as it stood (unchanged).
 reported_outcome text NOT NULL CHECK(reported_outcome IN ('settled','uncertain')),
 reported_cost_usd numeric(12,6) CHECK(reported_cost_usd IS NULL OR reported_cost_usd>=0),
 CHECK((reported_outcome='settled')=(reported_cost_usd IS NOT NULL)),
 reported_basis text NOT NULL CHECK(reported_basis='reported_unverified'),
 money_state text NOT NULL CHECK(money_state IN ('reserved','settled','uncertain','released')),
 money_settled_usd numeric(12,6),
 authority_id uuid NOT NULL REFERENCES sophia.research_financial_authorities(id),
 input jsonb NOT NULL, digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'), result jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_call_identities(project_id,reservation_id)
);

-- An account-null allowance's restriction episodes (opened by a cause) and the certificates that close them.
CREATE TABLE sophia.research_allowance_restriction_episodes (
 project_id uuid NOT NULL, allowance_id uuid NOT NULL, episode integer NOT NULL CHECK(episode>0),
 opened_reservation_id uuid NOT NULL,
 origin text NOT NULL CHECK(origin IN ('writer','backfill_0112')),
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,allowance_id,episode),
 FOREIGN KEY(project_id,allowance_id) REFERENCES sophia.research_allowances(project_id,id)
);
CREATE TABLE sophia.research_allowance_certificates (
 id uuid PRIMARY KEY, project_id uuid NOT NULL, allowance_id uuid NOT NULL, episode integer NOT NULL,
 covered_through_seq integer NOT NULL CHECK(covered_through_seq>=0),
 cause_set_digest text NOT NULL CHECK(cause_set_digest ~ '^[0-9a-f]{64}$'),
 authority_id uuid NOT NULL REFERENCES sophia.research_financial_authorities(id),
 input jsonb NOT NULL, digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'), result jsonb NOT NULL,
 certified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(project_id,allowance_id,episode),
 FOREIGN KEY(project_id,allowance_id,episode) REFERENCES sophia.research_allowance_restriction_episodes(project_id,allowance_id,episode)
);
-- An account guard's certificate; no foreign key reaches the account or its guard (no hidden account wait).
CREATE TABLE sophia.research_account_certificates (
 id uuid PRIMARY KEY, account_id uuid NOT NULL,
 covered_through_seq integer NOT NULL CHECK(covered_through_seq>=0),
 project_ids uuid[] NOT NULL, connection_ids uuid[] NOT NULL,
 cause_set_digest text NOT NULL CHECK(cause_set_digest ~ '^[0-9a-f]{64}$'),
 prior_first_project_id uuid, prior_first_reservation_id uuid, prior_restricted_at timestamptz,
 txid bigint NOT NULL DEFAULT txid_current(),
 authority_id uuid NOT NULL REFERENCES sophia.research_financial_authorities(id),
 input jsonb NOT NULL, digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'), result jsonb NOT NULL,
 certified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION sophia.research_reconciliation_frozen() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 RAISE EXCEPTION 'Reconciliation records are append-only' USING ERRCODE='55000';
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['research_financial_authorities','research_financial_authority_revocations','research_restriction_causes',
   'research_cause_adjudications','research_reservation_reconciliations','research_allowance_restriction_episodes',
   'research_allowance_certificates','research_account_certificates','research_late_fact_operations'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON sophia.%I FOR EACH ROW EXECUTE FUNCTION sophia.research_reconciliation_frozen()',
   t||'_frozen',t);
  EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON sophia.%I FOR EACH STATEMENT EXECUTE FUNCTION sophia.research_reconciliation_frozen()',
   t||'_kept',t);
  EXECUTE format('ALTER TABLE sophia.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON sophia.%I FROM PUBLIC, sophia_api, sophia_worker',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sophia_conversation_assembler') THEN
   EXECUTE format('REVOKE ALL ON sophia.%I FROM sophia_conversation_assembler',t); END IF;
 END LOOP;
END $$;

-- --- backfill: the causes and episodes that already exist ------------------------------------------------------------

-- Every retained conflict (truth first conflict and every conflict history row) and first overflow of a tracked
-- reservation, in its original scope, ordered by when it was recorded.
INSERT INTO sophia.research_restriction_causes(scope,account_id,project_id,allowance_id,reservation_id,seq,kind,digest,origin,recorded_at)
SELECT CASE WHEN c.account_id IS NULL THEN 'allowance' ELSE 'account' END, c.account_id, c.project_id, c.allowance_id, c.reservation_id,
 row_number() OVER (PARTITION BY coalesce(c.account_id::text,c.project_id::text||'/'||c.allowance_id::text)
  ORDER BY c.at, c.reservation_id, c.kind, c.digest)::integer,
 c.kind, c.digest, 'backfill_0112', c.at
FROM (SELECT DISTINCT ON (x.project_id,x.reservation_id,x.kind,x.digest) x.* FROM (
  SELECT i.account_id, i.project_id, i.allowance_id, i.reservation_id, 'conflict' AS kind, t.first_conflict_digest AS digest, t.first_conflict_at AS at
   FROM sophia.research_call_truth t JOIN sophia.research_call_identities i ON i.project_id=t.project_id AND i.reservation_id=t.reservation_id
   WHERE t.first_conflict_digest IS NOT NULL
  UNION ALL
  SELECT i.account_id, i.project_id, i.allowance_id, i.reservation_id, 'conflict', h.digest, h.created_at
   FROM sophia.research_call_history h JOIN sophia.research_call_identities i ON i.project_id=h.project_id AND i.reservation_id=h.reservation_id
   WHERE h.disposition='conflict'
  UNION ALL
  SELECT i.account_id, i.project_id, i.allowance_id, i.reservation_id, 'overflow', t.first_overflow_digest, t.first_overflow_at
   FROM sophia.research_call_truth t JOIN sophia.research_call_identities i ON i.project_id=t.project_id AND i.reservation_id=t.reservation_id
   WHERE t.first_overflow_digest IS NOT NULL) x
  ORDER BY x.project_id,x.reservation_id,x.kind,x.digest,x.at) c;

-- Every existing (sticky) allowance restriction is its first, open episode.
INSERT INTO sophia.research_allowance_restriction_episodes(project_id,allowance_id,episode,opened_reservation_id,origin,opened_at)
SELECT project_id, allowance_id, 1, first_reservation_id, 'backfill_0112', restricted_at FROM sophia.research_allowance_restrictions;

-- --- canonical helpers ----------------------------------------------------------------------------------------------

-- A closed input: exactly these keys, nothing else.
CREATE FUNCTION sophia.research_closed(p jsonb, p_keys text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_typeof(p)='object' AND (SELECT coalesce(array_agg(k ORDER BY k),'{}') FROM jsonb_object_keys(p) k)
  =(SELECT array_agg(k ORDER BY k) FROM unnest(p_keys) k) $$;
-- A uuid given as its canonical lowercase string (or JSON null where p_nullable), else NULL with p_ok false.
CREATE FUNCTION sophia.research_uuid_field(p jsonb, p_nullable boolean, OUT ok boolean, OUT v uuid) LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF p IS NOT NULL AND jsonb_typeof(p)='null' AND p_nullable THEN ok:=true; v:=NULL; RETURN; END IF;
 ok:=p IS NOT NULL AND jsonb_typeof(p)='string' AND (p#>>'{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 v:=CASE WHEN ok THEN (p#>>'{}')::uuid END;
END $$;
-- A canonical USD amount: a JSON STRING with exactly six decimals (numeric(12,6)); a JSON number is refused, so no
-- spelling (1e-1, 0.1, 0.10) is ever a second canonical form.
CREATE FUNCTION sophia.research_usd_field(p jsonb) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p IS NOT NULL AND jsonb_typeof(p)='string' AND (p#>>'{}') ~ '^(0|[1-9][0-9]{0,5})\.[0-9]{6}$'
  THEN (p#>>'{}')::numeric(12,6) END $$;
CREATE FUNCTION sophia.research_ref_field(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p IS NOT NULL AND jsonb_typeof(p)='string' AND length(p#>>'{}') BETWEEN 1 AND 300 AND (p#>>'{}') !~ '[[:cntrl:]]'
  THEN p#>>'{}' END $$;
CREATE FUNCTION sophia.research_digest(p_kind text, p_canonical jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to(p_kind||'|'||p_canonical::text,'UTF8')),'hex') $$;

-- An authority of this kind for exactly this scope, not revoked.
CREATE FUNCTION sophia.research_authority_check(p_id uuid, p_kind text, p_account uuid, p_project uuid, p_allowance uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sophia.research_financial_authorities a WHERE a.id=p_id AND a.kind=p_kind
   AND ((p_account IS NOT NULL AND a.account_id=p_account) OR (p_account IS NULL AND a.project_id=p_project AND a.allowance_id=p_allowance)))
   OR EXISTS(SELECT 1 FROM sophia.research_financial_authority_revocations v WHERE v.authority_id=p_id) THEN
  RAISE EXCEPTION 'No operator authority of this kind for this exact scope' USING ERRCODE='42501'; END IF;
END $$;

-- The complete current cause set of a scope, canonical (by seq), and its digest. Bounded: more than 256 causes is
-- refused whole, never truncated.
CREATE FUNCTION sophia.research_cause_set(p_account uuid, p_project uuid, p_allowance uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE s jsonb; n integer;
BEGIN
 SELECT count(*) INTO n FROM sophia.research_restriction_causes c
  WHERE (p_account IS NOT NULL AND c.scope='account' AND c.account_id=p_account)
   OR (p_account IS NULL AND c.scope='allowance' AND c.project_id=p_project AND c.allowance_id=p_allowance);
 IF n>256 THEN RAISE EXCEPTION 'The cause set exceeds its bound; nothing was certified' USING ERRCODE='54000'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('seq',c.seq,'projectId',c.project_id,'reservationId',c.reservation_id,'kind',c.kind,
   'digest',c.digest) ORDER BY c.seq),'[]') INTO s
  FROM sophia.research_restriction_causes c
  WHERE (p_account IS NOT NULL AND c.scope='account' AND c.account_id=p_account)
   OR (p_account IS NULL AND c.scope='allowance' AND c.project_id=p_project AND c.allowance_id=p_allowance);
 RETURN s;
END $$;
CREATE FUNCTION sophia.research_cause_set_digest(p_scope_key text, p_set jsonb) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.research_digest('research-cause-set-v1|'||p_scope_key,p_set) $$;
-- Every cause of the scope up to p_through is adjudicated and its reservation has ended; none lies beyond p_through.
CREATE FUNCTION sophia.research_causes_covered(p_account uuid, p_project uuid, p_allowance uuid, p_through integer) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT NOT EXISTS(SELECT 1 FROM sophia.research_restriction_causes c
  LEFT JOIN sophia.research_cause_adjudications a ON a.cause_id=c.id
  JOIN sophia.research_reservations r ON r.project_id=c.project_id AND r.id=c.reservation_id
  WHERE ((p_account IS NOT NULL AND c.scope='account' AND c.account_id=p_account)
    OR (p_account IS NULL AND c.scope='allowance' AND c.project_id=p_project AND c.allowance_id=p_allowance))
   AND (c.seq>p_through OR a.cause_id IS NULL OR r.state NOT IN ('settled','released'))) $$;
-- The account's current alias connections and current Sophia projects (grants of its connections, its ledger, its tracked
-- calls, its tasks and its causes), each sorted.
CREATE FUNCTION sophia.research_account_connections(p_account uuid) RETURNS uuid[] LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(array_agg(c.id ORDER BY c.id),'{}') FROM sophia.api_connections c WHERE c.account_id=p_account $$;
CREATE FUNCTION sophia.research_account_projects(p_account uuid) RETURNS uuid[] LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(array_agg(p ORDER BY p),'{}') FROM (
  SELECT g.project_id p FROM sophia.api_contribution_grants g JOIN sophia.api_connections c ON c.id=g.connection_id WHERE c.account_id=p_account
  UNION SELECT project_id FROM sophia.api_contribution_reservations WHERE account_id=p_account
  UNION SELECT project_id FROM sophia.api_contribution_tasks WHERE account_id=p_account
  UNION SELECT project_id FROM sophia.research_call_identities WHERE account_id=p_account
  UNION SELECT project_id FROM sophia.research_restriction_causes WHERE account_id=p_account) x $$;
-- The active projection of an account-null allowance restriction: an open (uncertified) episode, or a legacy row that
-- has no episode at all.
CREATE FUNCTION sophia.research_allowance_restricted(p_project uuid, p_allowance uuid) RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.research_allowance_restriction_episodes e WHERE e.project_id=p_project AND e.allowance_id=p_allowance
   AND NOT EXISTS(SELECT 1 FROM sophia.research_allowance_certificates c
    WHERE c.project_id=e.project_id AND c.allowance_id=e.allowance_id AND c.episode=e.episode))
  OR (EXISTS(SELECT 1 FROM sophia.research_allowance_restrictions x WHERE x.project_id=p_project AND x.allowance_id=p_allowance)
   AND NOT EXISTS(SELECT 1 FROM sophia.research_allowance_restriction_episodes e WHERE e.project_id=p_project AND e.allowance_id=p_allowance)) $$;


-- --- the actual gate and writers, replaced (marked) -------------------------------------------------------------------

-- research_call_restrict_allowance (0109), replaced: the same historical row (kept, never deleted), and 0112 RECURRENCE:
-- a new episode whenever the allowance is not actively restricted (the caller holds the allowance row).
CREATE OR REPLACE FUNCTION sophia.research_call_restrict_allowance(i sophia.research_call_identities) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF i.account_id IS NOT NULL THEN RETURN; END IF;
 INSERT INTO sophia.research_allowance_restrictions(project_id,allowance_id,first_reservation_id)
 VALUES(i.project_id,i.allowance_id,i.reservation_id) ON CONFLICT (project_id,allowance_id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM sophia.research_allowance_restriction_episodes e WHERE e.project_id=i.project_id AND e.allowance_id=i.allowance_id
   AND NOT EXISTS(SELECT 1 FROM sophia.research_allowance_certificates c
    WHERE c.project_id=e.project_id AND c.allowance_id=e.allowance_id AND c.episode=e.episode)) THEN
  INSERT INTO sophia.research_allowance_restriction_episodes(project_id,allowance_id,episode,opened_reservation_id,origin)
  SELECT i.project_id,i.allowance_id,coalesce(max(e.episode),0)+1,i.reservation_id,'writer'
  FROM sophia.research_allowance_restriction_episodes e WHERE e.project_id=i.project_id AND e.allowance_id=i.allowance_id;
 END IF;
END $$;

-- Record one new cause of a tracked reservation (true), or find it already recorded (false: the caller restricts nothing
-- again). Its identity is (reservation, kind, canonical facts digest): the v1 or v2
-- digest domain of the call's facts_version, the same digest the history keys on. A below-cap repeat of a retained input
-- is a history replay that never reaches this writer; a post-cap repeat finds its recorded cause and changes nothing (no
-- new cause, no new episode, no restriction); new conflicting or overflowing evidence has a new digest and restricts anew.
-- Account-null: under the allowance row the caller holds. Account: the guard is locked LAST, even when it is already
-- restricted, so a certification holding it (after all of the account's projects) serializes with every new cause.
CREATE FUNCTION sophia.research_restriction_cause(i sophia.research_call_identities, p_kind text, p_digest text) RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE v_seq integer;
BEGIN
 IF i.account_id IS NOT NULL THEN
  PERFORM 1 FROM sophia.research_evidence_guards WHERE account_id=i.account_id FOR UPDATE;
 END IF;
 IF EXISTS(SELECT 1 FROM sophia.research_restriction_causes c WHERE c.project_id=i.project_id AND c.reservation_id=i.reservation_id
   AND c.kind=p_kind AND c.digest=p_digest) THEN RETURN false; END IF;
 IF i.account_id IS NULL THEN
  SELECT coalesce(max(c.seq),0)+1 INTO v_seq FROM sophia.research_restriction_causes c
   WHERE c.scope='allowance' AND c.project_id=i.project_id AND c.allowance_id=i.allowance_id;
  INSERT INTO sophia.research_restriction_causes(scope,account_id,project_id,allowance_id,reservation_id,seq,kind,digest,origin)
  VALUES('allowance',NULL,i.project_id,i.allowance_id,i.reservation_id,v_seq,p_kind,p_digest,'writer');
 ELSE
  SELECT coalesce(max(c.seq),0)+1 INTO v_seq FROM sophia.research_restriction_causes c WHERE c.scope='account' AND c.account_id=i.account_id;
  INSERT INTO sophia.research_restriction_causes(scope,account_id,project_id,allowance_id,reservation_id,seq,kind,digest,origin)
  VALUES('account',i.account_id,i.project_id,i.allowance_id,i.reservation_id,v_seq,p_kind,p_digest,'writer');
 END IF;
 RETURN true;
END $$;

-- research_call_settle: effective 0110 byte for byte, plus 0112 CAUSE-WRITER.
CREATE OR REPLACE FUNCTION sophia.research_call_settle(p_project uuid, p_reservation uuid, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.research_call_identities; r sophia.research_reservations; t sophia.research_call_truth; f sophia.research_call_fact;
 h sophia.research_call_history; disposition text; reason text; capped boolean:=false;
 o jsonb; m jsonb; v1 text; -- 0110: the input observation (private), its merge, and the A57-only disposition
BEGIN
 SELECT * INTO i FROM sophia.research_call_identities WHERE project_id=p_project AND reservation_id=p_reservation;
 IF NOT FOUND THEN
  IF p_request ? 'evidence' THEN RAISE EXCEPTION 'A legacy reservation settles without evidence' USING ERRCODE='22023'; END IF;
  RETURN NULL;
 END IF;
 IF NOT (p_request ? 'evidence') THEN RAISE EXCEPTION 'A tracked reservation settles only with its evidence' USING ERRCODE='22023'; END IF;
 IF p_request ? 'providerRequestId' THEN RAISE EXCEPTION 'A tracked reservation keeps no provider request id' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.research_allowances WHERE project_id=p_project AND id=i.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=p_project AND id=p_reservation FOR UPDATE;
 IF i.facts_version=2 THEN -- 0110: the observation apart from the A57 facts; absent or all-unknown keeps the v1 digest
  f:=sophia.research_call_facts(i,sophia.research_call_without_observed(p_request));
  o:=sophia.research_call_observed_of(p_request->'evidence');
  IF o IS NOT NULL THEN f.observed:=sophia.research_call_observed_canonical(o); f.digest:=sophia.research_call_fact_digest(i,f); END IF;
 ELSE
  f:=sophia.research_call_facts(i,p_request);
 END IF;
 SELECT * INTO h FROM sophia.research_call_history WHERE project_id=p_project AND reservation_id=p_reservation AND digest=f.digest;
 IF FOUND THEN -- a retained input: its original disposition, nothing changes
  RETURN jsonb_build_object('disposition',h.disposition,'replay',true,'capped',false,'digest',f.digest);
 END IF;
 SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN
  IF o IS NOT NULL THEN -- 0110: a first observation's contradiction (reported, or against its own A57 facts) moves no money
   m:=sophia.research_call_observe(sophia.research_call_truth_observed(jsonb_populate_record(NULL::sophia.research_call_truth,
    '{"sent":"unknown","n1_status":"unknown","header_id_status":"unknown","provider_terminal":"unknown"}')),o,
    sophia.research_call_a57_side(f.response_id_status,f.response_id,f.response_id_reason,f.noncached_input,f.cache_read,f.output),true);
   IF m ? 'conflict' THEN disposition:='conflict'; reason:=m->>'conflict'; END IF;
  END IF;
  IF disposition='conflict' THEN NULL;
  ELSIF NOT sophia.research_call_money(r,f,p_request->'usage') THEN disposition:='conflict'; reason:='outcome_changed';
  ELSE disposition:='accepted'; END IF;
  INSERT INTO sophia.research_call_truth(project_id,reservation_id,digest,report,noncached_input_class,noncached_input,cache_read_class,cache_read,
   cache_write_class,cache_write,output_class,output,consumer_ending,outcome,cost_usd,response_id_status,response_id,response_id_reason,
   response_id_correlation,first_conflict_digest,first_conflict_reason,first_conflict_at)
  VALUES(p_project,p_reservation,f.digest,f.report,f.noncached_input_class,f.noncached_input,f.cache_read_class,f.cache_read,
   f.cache_write_class,f.cache_write,f.output_class,f.output,f.consumer_ending,
   CASE WHEN disposition='conflict' THEN r.state ELSE f.outcome END,CASE WHEN disposition='conflict' THEN r.settled_usd ELSE f.cost_usd END,
   f.response_id_status,f.response_id,f.response_id_reason,f.response_id_correlation,
   CASE WHEN disposition='conflict' THEN f.digest END,reason,CASE WHEN disposition='conflict' THEN clock_timestamp() END)
  RETURNING * INTO t;
  IF m IS NOT NULL THEN -- 0110: the first observation is the truth's, with its witnesses
   PERFORM sophia.research_call_observed_write(i,t,m,true);
   SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation;
  END IF;
 ELSIF t.digest=f.digest THEN
  -- The current truth again: below the cap nothing changes. Once the cap is reached, an input that is the current truth
  -- but was never retained is an unretained post-cap input (F02): stably capped through the tail below, never a replay.
  IF t.history_count<16 THEN
   RETURN jsonb_build_object('disposition','current','replay',true,'capped',false,'digest',f.digest);
  END IF;
  disposition:='subsumed';
 ELSE
  SELECT * INTO disposition, reason FROM sophia.research_call_compare(t,f);
  IF i.facts_version=2 THEN -- 0110: classified BEFORE any money helper
   v1:=disposition;
   m:=sophia.research_call_observe(sophia.research_call_truth_observed(t),o,sophia.research_call_a57_merged(t,f,v1='extended'),v1='extended');
   IF v1='conflict' THEN NULL; -- R1 F01: 0109's own conflict and reason stand; this input's witnesses are still kept below
   ELSIF m ? 'conflict' THEN disposition:='conflict'; reason:=m->>'conflict';
   ELSIF v1<>'extended' AND (m->>'gained')::boolean THEN disposition:='extended'; -- metadata only: no money path
   END IF;
  END IF;
  IF disposition='extended' AND (v1 IS NULL OR v1='extended') THEN
   IF NOT sophia.research_call_money(r,f,p_request->'usage') THEN disposition:='conflict'; reason:='outcome_changed';
   ELSE PERFORM sophia.research_call_extend(i,t,f); END IF;
  END IF;
  IF disposition='conflict' THEN
   UPDATE sophia.research_call_truth SET first_conflict_digest=coalesce(first_conflict_digest,f.digest),
    first_conflict_reason=coalesce(first_conflict_reason,reason),first_conflict_at=coalesce(first_conflict_at,clock_timestamp())
   WHERE project_id=p_project AND reservation_id=p_reservation;
  END IF;
  SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation;
  IF m IS NOT NULL THEN -- 0110: knowledge only without a contradiction; a witness always (first per dimension, sticky)
   PERFORM sophia.research_call_observed_write(i,t,m,disposition<>'conflict');
   SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation;
  END IF;
 END IF;
 capped:=sophia.research_call_retain(t,f,disposition);
 -- A conflict, or an input past the cap (the first overflow, valid or not: F01), restricts its original scope, sticky.
 IF disposition='conflict' OR capped THEN
  -- 0112 CAUSE-WRITER: every conflict or overflow is first recorded as one cause of its original scope (the account's under
  -- its guard, locked LAST even when it is already restricted); only a genuinely new cause restricts, anew.
  IF sophia.research_restriction_cause(i,CASE WHEN disposition='conflict' THEN 'conflict' ELSE 'overflow' END,f.digest) THEN
  PERFORM sophia.research_call_restrict_allowance(i);
  -- LAST: the account's guard (initialized at reserve under the account row); no lock is taken after it.
  IF i.account_id IS NOT NULL THEN
   UPDATE sophia.research_evidence_guards SET restricted=true, restricted_at=clock_timestamp(), first_project_id=p_project,
    first_reservation_id=p_reservation WHERE account_id=i.account_id AND NOT restricted;
  END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('disposition',CASE WHEN capped AND disposition='subsumed' THEN 'capped' ELSE disposition END,
  'replay',false,'capped',capped,'digest',f.digest);
END $$;

-- R1 (C3REC-F01) FACT-ONLY: the money transition's pure comparison. A report that differs from money that has already
-- ENDED (settled or released) is a retained conflict (false); while the money is OPEN nothing is compared and nothing
-- moves. It never calls end_research_reservation.
CREATE FUNCTION sophia.research_call_money_unchanged(r sophia.research_reservations, f sophia.research_call_fact) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT NOT (r.state IN ('settled','released') AND NOT (r.state=f.outcome AND r.settled_usd IS NOT DISTINCT FROM f.cost_usd)) $$;

-- R1 (C3REC-F01) FACT-ONLY writer of governed late facts: the effective (0112) research_call_settle above, byte for byte
-- except its two money calls, which are the pure comparison (marked FACT-ONLY), and the R2 P02 OPEN-MONEY line. The same facts_version/observed_v1,
-- history cap, first conflict/overflow, sticky witnesses and cause writer with recurrence; it never moves money.
CREATE FUNCTION sophia.research_call_record_late_facts(p_project uuid, p_reservation uuid, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.research_call_identities; r sophia.research_reservations; t sophia.research_call_truth; f sophia.research_call_fact;
 h sophia.research_call_history; disposition text; reason text; capped boolean:=false;
 o jsonb; m jsonb; v1 text; -- 0110: the input observation (private), its merge, and the A57-only disposition
BEGIN
 SELECT * INTO i FROM sophia.research_call_identities WHERE project_id=p_project AND reservation_id=p_reservation;
 IF NOT FOUND THEN
  IF p_request ? 'evidence' THEN RAISE EXCEPTION 'A legacy reservation settles without evidence' USING ERRCODE='22023'; END IF;
  RETURN NULL;
 END IF;
 IF NOT (p_request ? 'evidence') THEN RAISE EXCEPTION 'A tracked reservation settles only with its evidence' USING ERRCODE='22023'; END IF;
 IF p_request ? 'providerRequestId' THEN RAISE EXCEPTION 'A tracked reservation keeps no provider request id' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.research_allowances WHERE project_id=p_project AND id=i.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=p_project AND id=p_reservation FOR UPDATE;
 IF i.facts_version=2 THEN -- 0110: the observation apart from the A57 facts; absent or all-unknown keeps the v1 digest
  f:=sophia.research_call_facts(i,sophia.research_call_without_observed(p_request));
  o:=sophia.research_call_observed_of(p_request->'evidence');
  IF o IS NOT NULL THEN f.observed:=sophia.research_call_observed_canonical(o); f.digest:=sophia.research_call_fact_digest(i,f); END IF;
 ELSE
  f:=sophia.research_call_facts(i,p_request);
 END IF;
 -- R2 P02: while the money is OPEN the report's outcome and cost are a claim, not the call's financial truth; the truth's
 -- financial pair stays the money's (unknown). The facts, their digest, history and witnesses stay exactly as reported.
 IF r.state IN ('reserved','uncertain') THEN f.outcome:='uncertain'; f.cost_usd:=NULL; END IF; /* R2 P02 OPEN-MONEY */
 SELECT * INTO h FROM sophia.research_call_history WHERE project_id=p_project AND reservation_id=p_reservation AND digest=f.digest;
 IF FOUND THEN -- a retained input: its original disposition, nothing changes
  RETURN jsonb_build_object('disposition',h.disposition,'replay',true,'capped',false,'digest',f.digest);
 END IF;
 SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN
  IF o IS NOT NULL THEN -- 0110: a first observation's contradiction (reported, or against its own A57 facts) moves no money
   m:=sophia.research_call_observe(sophia.research_call_truth_observed(jsonb_populate_record(NULL::sophia.research_call_truth,
    '{"sent":"unknown","n1_status":"unknown","header_id_status":"unknown","provider_terminal":"unknown"}')),o,
    sophia.research_call_a57_side(f.response_id_status,f.response_id,f.response_id_reason,f.noncached_input,f.cache_read,f.output),true);
   IF m ? 'conflict' THEN disposition:='conflict'; reason:=m->>'conflict'; END IF;
  END IF;
  IF disposition='conflict' THEN NULL;
  ELSIF NOT sophia.research_call_money_unchanged(r,f) /* R1 FACT-ONLY */ THEN disposition:='conflict'; reason:='outcome_changed';
  ELSE disposition:='accepted'; END IF;
  INSERT INTO sophia.research_call_truth(project_id,reservation_id,digest,report,noncached_input_class,noncached_input,cache_read_class,cache_read,
   cache_write_class,cache_write,output_class,output,consumer_ending,outcome,cost_usd,response_id_status,response_id,response_id_reason,
   response_id_correlation,first_conflict_digest,first_conflict_reason,first_conflict_at)
  VALUES(p_project,p_reservation,f.digest,f.report,f.noncached_input_class,f.noncached_input,f.cache_read_class,f.cache_read,
   f.cache_write_class,f.cache_write,f.output_class,f.output,f.consumer_ending,
   CASE WHEN disposition='conflict' THEN r.state ELSE f.outcome END,CASE WHEN disposition='conflict' THEN r.settled_usd ELSE f.cost_usd END,
   f.response_id_status,f.response_id,f.response_id_reason,f.response_id_correlation,
   CASE WHEN disposition='conflict' THEN f.digest END,reason,CASE WHEN disposition='conflict' THEN clock_timestamp() END)
  RETURNING * INTO t;
  IF m IS NOT NULL THEN -- 0110: the first observation is the truth's, with its witnesses
   PERFORM sophia.research_call_observed_write(i,t,m,true);
   SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation;
  END IF;
 ELSIF t.digest=f.digest THEN
  -- The current truth again: below the cap nothing changes. Once the cap is reached, an input that is the current truth
  -- but was never retained is an unretained post-cap input (F02): stably capped through the tail below, never a replay.
  IF t.history_count<16 THEN
   RETURN jsonb_build_object('disposition','current','replay',true,'capped',false,'digest',f.digest);
  END IF;
  disposition:='subsumed';
 ELSE
  SELECT * INTO disposition, reason FROM sophia.research_call_compare(t,f);
  IF i.facts_version=2 THEN -- 0110: classified BEFORE any money helper
   v1:=disposition;
   m:=sophia.research_call_observe(sophia.research_call_truth_observed(t),o,sophia.research_call_a57_merged(t,f,v1='extended'),v1='extended');
   IF v1='conflict' THEN NULL; -- R1 F01: 0109's own conflict and reason stand; this input's witnesses are still kept below
   ELSIF m ? 'conflict' THEN disposition:='conflict'; reason:=m->>'conflict';
   ELSIF v1<>'extended' AND (m->>'gained')::boolean THEN disposition:='extended'; -- metadata only: no money path
   END IF;
  END IF;
  IF disposition='extended' AND (v1 IS NULL OR v1='extended') THEN
   IF NOT sophia.research_call_money_unchanged(r,f) /* R1 FACT-ONLY */ THEN disposition:='conflict'; reason:='outcome_changed';
   ELSE PERFORM sophia.research_call_extend(i,t,f); END IF;
  END IF;
  IF disposition='conflict' THEN
   UPDATE sophia.research_call_truth SET first_conflict_digest=coalesce(first_conflict_digest,f.digest),
    first_conflict_reason=coalesce(first_conflict_reason,reason),first_conflict_at=coalesce(first_conflict_at,clock_timestamp())
   WHERE project_id=p_project AND reservation_id=p_reservation;
  END IF;
  SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation;
  IF m IS NOT NULL THEN -- 0110: knowledge only without a contradiction; a witness always (first per dimension, sticky)
   PERFORM sophia.research_call_observed_write(i,t,m,disposition<>'conflict');
   SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation;
  END IF;
 END IF;
 capped:=sophia.research_call_retain(t,f,disposition);
 -- A conflict, or an input past the cap (the first overflow, valid or not: F01), restricts its original scope, sticky.
 IF disposition='conflict' OR capped THEN
  -- 0112 CAUSE-WRITER: every conflict or overflow is first recorded as one cause of its original scope (the account's under
  -- its guard, locked LAST even when it is already restricted); only a genuinely new cause restricts, anew.
  IF sophia.research_restriction_cause(i,CASE WHEN disposition='conflict' THEN 'conflict' ELSE 'overflow' END,f.digest) THEN
  PERFORM sophia.research_call_restrict_allowance(i);
  -- LAST: the account's guard (initialized at reserve under the account row); no lock is taken after it.
  IF i.account_id IS NOT NULL THEN
   UPDATE sophia.research_evidence_guards SET restricted=true, restricted_at=clock_timestamp(), first_project_id=p_project,
    first_reservation_id=p_reservation WHERE account_id=i.account_id AND NOT restricted;
  END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('disposition',CASE WHEN capped AND disposition='subsumed' THEN 'capped' ELSE disposition END,
  'replay',false,'capped',capped,'digest',f.digest);
END $$;

-- reserve_research: effective 0109 byte for byte, plus 0112 ACTIVE-GATE.
CREATE OR REPLACE FUNCTION sophia.reserve_research(p_project uuid, p_allowance uuid, p_key text, p_kind text, p_provider text,
  p_amount numeric, p_purpose text DEFAULT 'call')
RETURNS sophia.research_reservations LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.research_grants; a sophia.research_allowances; r sophia.research_reservations; committed numeric; n integer;
BEGIN
 IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'A reservation is a positive amount' USING ERRCODE='22023'; END IF;
 IF p_purpose IS NULL OR p_purpose NOT IN ('call','partial_result') THEN
  RAISE EXCEPTION 'Unknown reservation purpose' USING ERRCODE='22023'; END IF;
 IF p_purpose='partial_result' AND p_kind IS DISTINCT FROM 'model' THEN
  RAISE EXCEPTION 'Only a model call writes the partial result' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM sophia.research_grants WHERE project_id=p_project FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research gate closed' USING ERRCODE='55000'; END IF;
 SELECT * INTO a FROM sophia.research_allowances WHERE project_id=p_project AND id=p_allowance FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research allowance not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=p_project AND allowance_id=p_allowance AND reservation_key=p_key;
 IF FOUND THEN
  IF r.kind<>p_kind OR r.provider<>p_provider OR r.reserved_usd<>p_amount OR r.purpose<>p_purpose THEN
   RAISE EXCEPTION 'Idempotency key reused for another reservation' USING ERRCODE='23505'; END IF;
  RETURN r;
 END IF;
 IF g.state<>'enabled' THEN RAISE EXCEPTION 'Research gate closed' USING ERRCODE='55000'; END IF;
 IF a.overrun_usd>a.reconciled_overrun_usd THEN
  RAISE EXCEPTION 'Research allowance overrun: a call cost more than it reserved; nothing more until it is reconciled'
   USING ERRCODE='55000'; END IF;
 -- 0109: an account-null allowance whose call evidence conflicted takes no new model call until it is reconciled.
 -- 0112 ACTIVE-GATE: the active projection (an uncertified episode), not the mere existence of the historical row.
 IF p_kind='model' AND sophia.research_allowance_restricted(p_project,p_allowance) THEN
  PERFORM sophia.contribution_refuse('evidence_conflict_unreconciled'); END IF;
 IF p_kind IN ('search','read') THEN
  SELECT count(*) INTO n FROM sophia.research_reservations
   WHERE project_id=p_project AND allowance_id=p_allowance AND kind=p_kind AND state<>'released';
  IF n>=(CASE p_kind WHEN 'search' THEN a.max_searches ELSE a.max_reads END) THEN
   RAISE EXCEPTION 'Research source policy limit reached: %', p_kind USING ERRCODE='55000'; END IF;
 END IF;
 IF p_purpose='partial_result' AND EXISTS(SELECT 1 FROM sophia.research_reservations
   WHERE project_id=p_project AND allowance_id=p_allowance AND purpose='partial_result' AND state='reserved') THEN
  RAISE EXCEPTION 'A partial-result call is already in flight' USING ERRCODE='55000'; END IF;
 committed:=a.reserved_usd+a.spent_usd+a.uncertain_usd;
 IF committed+p_amount>a.cap_usd-(CASE WHEN p_purpose='partial_result' THEN 0 ELSE a.headroom_usd END) THEN
  RAISE EXCEPTION 'Research allowance exhausted' USING ERRCODE='55000'; END IF;
 SELECT coalesce(sum(x.reserved_usd+x.spent_usd+x.uncertain_usd),0) INTO committed
  FROM sophia.research_allowances x WHERE x.project_id=p_project;
 committed:=committed-sophia.contribution_project_committed(p_project);
 IF committed+(CASE WHEN p_kind='model' AND sophia.contribution_allowance(p_project,p_allowance) THEN 0 ELSE p_amount END)>g.total_cap_usd THEN RAISE EXCEPTION 'Research grant exhausted' USING ERRCODE='55000'; END IF;
 INSERT INTO sophia.research_reservations(project_id,allowance_id,reservation_key,kind,provider,purpose,reserved_usd)
 VALUES(p_project,p_allowance,p_key,p_kind,p_provider,p_purpose,p_amount) RETURNING * INTO r;
 UPDATE sophia.research_allowances SET reserved_usd=reserved_usd+p_amount WHERE project_id=p_project AND id=p_allowance;
 RETURN r;
END $$;


-- research_evidence_guard_transition (0109), replaced: false -> true as before; 0112 CERTIFIED-CLEAR: true -> false only
-- under the durable account certificate of THIS transaction (its id is passed by a transaction-local setting, which is a
-- pointer only), and only while every current cause of the account is covered by it.
CREATE OR REPLACE FUNCTION sophia.research_evidence_guard_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.research_account_certificates;
BEGIN
 IF TG_OP='UPDATE' AND NEW.account_id=OLD.account_id AND NEW.created_at=OLD.created_at THEN
  IF NOT OLD.restricted AND NEW.restricted THEN RETURN NEW; END IF;
  IF OLD.restricted AND NOT NEW.restricted THEN
   SELECT * INTO c FROM sophia.research_account_certificates
    WHERE id=sophia.uuid_or_null(current_setting('sophia.research_certificate',true)) AND account_id=NEW.account_id AND txid=txid_current();
   IF FOUND AND sophia.research_causes_covered(NEW.account_id,NULL,NULL,c.covered_through_seq) THEN RETURN NEW; END IF;
  END IF;
 END IF;
 RAISE EXCEPTION 'An evidence restriction is sticky' USING ERRCODE='55000';
END $$;

-- An allowance certificate is inserted only for the open (latest) episode and only when every current cause of the
-- allowance is covered by it (enforced on the record itself, not only in the operator function).
CREATE FUNCTION sophia.research_allowance_certificate_check() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF NEW.episode<>(SELECT max(e.episode) FROM sophia.research_allowance_restriction_episodes e
   WHERE e.project_id=NEW.project_id AND e.allowance_id=NEW.allowance_id)
  OR NOT sophia.research_causes_covered(NULL,NEW.project_id,NEW.allowance_id,NEW.covered_through_seq) THEN
  RAISE EXCEPTION 'An allowance certificate must cover the open episode and every current cause' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER research_allowance_certificates_checked BEFORE INSERT ON sophia.research_allowance_certificates
 FOR EACH ROW EXECUTE FUNCTION sophia.research_allowance_certificate_check();


-- --- operator functions (migration owner only) -----------------------------------------------------------------------

-- A durable authority record: kind, exact scope (an account, or one project's allowance), approver and verifier
-- references. An exact repeat of the same key returns the same record; another input under that key is refused.
CREATE FUNCTION sophia.record_research_financial_authority(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a sophia.research_financial_authorities; k text; v_kind text; u record; ok boolean:=true; v_acc uuid; v_prj uuid; v_alw uuid;
 ap text; ve text; s jsonb;
BEGIN
 IF NOT sophia.research_closed(p_input,ARRAY['version','authorityKey','kind','scope','approverRef','verifierRef'])
  OR p_input->>'version' IS DISTINCT FROM 'research-authority-v1' OR jsonb_typeof(p_input->'authorityKey')<>'string'
  OR jsonb_typeof(p_input->'kind')<>'string' OR jsonb_typeof(p_input->'scope')<>'object' THEN
  RAISE EXCEPTION 'Invalid authority input' USING ERRCODE='22023'; END IF;
 k:=p_input->>'authorityKey'; v_kind:=p_input->>'kind'; s:=p_input->'scope';
 ap:=sophia.research_ref_field(p_input->'approverRef'); ve:=sophia.research_ref_field(p_input->'verifierRef');
 IF sophia.research_closed(s,ARRAY['accountId']) THEN
  u:=sophia.research_uuid_field(s->'accountId',false); ok:=u.ok; v_acc:=u.v;
 ELSIF sophia.research_closed(s,ARRAY['projectId','allowanceId']) THEN
  u:=sophia.research_uuid_field(s->'projectId',false); ok:=u.ok; v_prj:=u.v;
  u:=sophia.research_uuid_field(s->'allowanceId',false); ok:=ok AND u.ok; v_alw:=u.v;
 ELSE RAISE EXCEPTION 'Invalid authority input' USING ERRCODE='22023'; END IF;
 IF NOT ok OR ap IS NULL OR ve IS NULL OR ap=ve
  OR v_kind NOT IN ('provider_billed_attestation','cause_adjudication','certification','late_fact_attestation') THEN
  RAISE EXCEPTION 'Invalid authority input' USING ERRCODE='22023'; END IF;
 SELECT * INTO a FROM sophia.research_financial_authorities WHERE authority_key=k;
 IF FOUND THEN
  IF a.kind=v_kind AND a.account_id IS NOT DISTINCT FROM v_acc AND a.project_id IS NOT DISTINCT FROM v_prj
   AND a.allowance_id IS NOT DISTINCT FROM v_alw AND a.approver_ref=ap AND a.verifier_ref=ve THEN
   RETURN jsonb_build_object('authorityId',a.id,'kind',a.kind); END IF;
  RAISE EXCEPTION 'Authority key reused for another authority' USING ERRCODE='23505';
 END IF;
 INSERT INTO sophia.research_financial_authorities(authority_key,kind,account_id,project_id,allowance_id,approver_ref,verifier_ref)
 VALUES(k,v_kind,v_acc,v_prj,v_alw,ap,ve) RETURNING * INTO a;
 RETURN jsonb_build_object('authorityId',a.id,'kind',a.kind);
END $$;

CREATE FUNCTION sophia.revoke_research_financial_authority(p_authority uuid, p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 300 OR NOT EXISTS(SELECT 1 FROM sophia.research_financial_authorities WHERE id=p_authority) THEN
  RAISE EXCEPTION 'Invalid authority revocation' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.research_financial_authority_revocations(authority_id,reason) VALUES(p_authority,p_reason) ON CONFLICT DO NOTHING;
END $$;

-- The closed research-reconcile-v1 input, validated and rebuilt canonically; one fixed refusal that names no value.
CREATE FUNCTION sophia.research_reconcile_input(p_input jsonb, OUT canonical jsonb, OUT digest text, OUT project uuid, OUT reservation uuid,
 OUT state text, OUT reserved numeric, OUT allowance uuid, OUT account uuid, OUT resource uuid, OUT operation text, OUT call_id text,
 OUT provider text, OUT fence uuid, OUT generation text, OUT cost numeric, OUT authority uuid, OUT evidence_ref text)
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
DECLARE e jsonb; u record; ok boolean:=true;
BEGIN
 IF NOT sophia.research_closed(p_input,ARRAY['version','projectId','reservationId','expected','basis','costUsd','authorityId','evidenceRef'])
  OR p_input->>'version' IS DISTINCT FROM 'research-reconcile-v1' THEN
  RAISE EXCEPTION 'Invalid reconciliation input' USING ERRCODE='22023'; END IF;
 IF p_input->'basis'='"conservative_at_reserved"'::jsonb THEN
  RAISE EXCEPTION 'conservative_at_reserved is disabled (D1): only provider-billed evidence reconciles' USING ERRCODE='0A000'; END IF;
 IF p_input->'basis' IS DISTINCT FROM '"provider_billed_attestation"'::jsonb THEN
  RAISE EXCEPTION 'Invalid reconciliation input' USING ERRCODE='22023'; END IF;
 e:=p_input->'expected';
 IF NOT sophia.research_closed(e,ARRAY['state','reservedUsd','allowanceId','accountId','resourceId','operation','callId','provider','fenceId','generation']) THEN
  RAISE EXCEPTION 'Invalid reconciliation input' USING ERRCODE='22023'; END IF;
 u:=sophia.research_uuid_field(p_input->'projectId',false); ok:=ok AND u.ok; project:=u.v;
 u:=sophia.research_uuid_field(p_input->'reservationId',false); ok:=ok AND u.ok; reservation:=u.v;
 u:=sophia.research_uuid_field(e->'allowanceId',false); ok:=ok AND u.ok; allowance:=u.v;
 u:=sophia.research_uuid_field(e->'accountId',true); ok:=ok AND u.ok; account:=u.v;
 u:=sophia.research_uuid_field(e->'resourceId',true); ok:=ok AND u.ok; resource:=u.v;
 u:=sophia.research_uuid_field(e->'fenceId',true); ok:=ok AND u.ok; fence:=u.v;
 u:=sophia.research_uuid_field(p_input->'authorityId',false); ok:=ok AND u.ok; authority:=u.v;
 state:=CASE WHEN e->'state' IN ('"reserved"','"uncertain"') THEN e->>'state' END;
 reserved:=sophia.research_usd_field(e->'reservedUsd'); cost:=sophia.research_usd_field(p_input->'costUsd');
 operation:=CASE WHEN jsonb_typeof(e->'operation')='null' THEN NULL WHEN e->'operation' IN ('"research"','"design"','"source_review"') THEN e->>'operation' ELSE '!' END;
 call_id:=CASE WHEN jsonb_typeof(e->'callId')='null' THEN NULL ELSE sophia.research_ref_field(e->'callId') END;
 provider:=CASE WHEN jsonb_typeof(e->'provider')='string' AND (e->>'provider') ~ '^[a-z][a-z0-9-]{0,62}$' THEN e->>'provider' END;
 generation:=CASE WHEN jsonb_typeof(e->'generation')='null' THEN NULL WHEN jsonb_typeof(e->'generation')='string' AND (e->>'generation') ~ '^[0-9a-f]{64}$'
  THEN e->>'generation' ELSE '!' END;
 evidence_ref:=sophia.research_ref_field(p_input->'evidenceRef');
 IF NOT ok OR state IS NULL OR reserved IS NULL OR reserved<=0 OR cost IS NULL OR provider IS NULL OR evidence_ref IS NULL
  OR operation='!' OR generation='!' OR (jsonb_typeof(e->'callId')<>'null' AND call_id IS NULL)
  OR (fence IS NULL)<>(generation IS NULL) THEN
  RAISE EXCEPTION 'Invalid reconciliation input' USING ERRCODE='22023'; END IF;
 canonical:=jsonb_build_object('version','research-reconcile-v1','projectId',project,'reservationId',reservation,
  'expected',jsonb_build_object('state',state,'reservedUsd',reserved::numeric(12,6)::text,'allowanceId',allowance,'accountId',account,
   'resourceId',resource,'operation',operation,'callId',call_id,'provider',provider,'fenceId',fence,'generation',generation),
  'basis','provider_billed_attestation','costUsd',cost::numeric(12,6)::text,'authorityId',authority,'evidenceRef',evidence_ref);
 digest:=sophia.research_digest('research-reconcile-v1',canonical);
END $$;

-- A. Known-evidence reconciliation of ONE monetary-open reservation, against its original binding, exactly once.
CREATE FUNCTION sophia.reconcile_research_reservation(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE c record; prior sophia.research_reservation_reconciliations; r sophia.research_reservations; i sophia.research_call_identities;
 x sophia.api_contribution_reservations; v_account uuid; v_resource uuid; fz sophia.research_runtime_fences; ended sophia.research_reservations;
 res jsonb;
BEGIN
 SELECT * INTO c FROM sophia.research_reconcile_input(p_input);
 -- REPLAY: the stored result first, before any mutable eligibility (the row is settled by then).
 SELECT * INTO prior FROM sophia.research_reservation_reconciliations WHERE project_id=c.project AND reservation_id=c.reservation;
 IF FOUND THEN
  IF prior.digest=c.digest THEN RETURN prior.result; END IF;
  RAISE EXCEPTION 'A different reconciliation of this reservation is recorded' USING ERRCODE='23505';
 END IF;
 -- Lock order: the project, then the allowance, then the reservation (end_research_reservation's order).
 PERFORM 1 FROM sophia.projects WHERE id=c.project FOR UPDATE;
 SELECT * INTO prior FROM sophia.research_reservation_reconciliations WHERE project_id=c.project AND reservation_id=c.reservation;
 IF FOUND THEN
  IF prior.digest=c.digest THEN RETURN prior.result; END IF;
  RAISE EXCEPTION 'A different reconciliation of this reservation is recorded' USING ERRCODE='23505';
 END IF;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=c.project AND id=c.reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research reservation not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.research_allowances WHERE project_id=r.project_id AND id=r.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=c.project AND id=c.reservation FOR UPDATE;
 SELECT * INTO i FROM sophia.research_call_identities WHERE project_id=r.project_id AND reservation_id=r.id;
 SELECT * INTO x FROM sophia.api_contribution_reservations WHERE project_id=r.project_id AND reservation_id=r.id;
 v_account:=coalesce(x.account_id,i.account_id);
 v_resource:=coalesce(i.resource_id,(SELECT t.resource_id FROM sophia.api_contribution_tasks t WHERE t.project_id=x.project_id AND t.job_id=x.job_id));
 -- The ORIGINAL binding, from the authoritative rows: never a current display owner, never an alias's own allowance.
 IF r.allowance_id<>c.allowance OR v_account IS DISTINCT FROM c.account OR v_resource IS DISTINCT FROM c.resource
  OR i.operation IS DISTINCT FROM c.operation OR i.call_id IS DISTINCT FROM c.call_id OR r.provider<>c.provider OR r.reserved_usd<>c.reserved THEN
  RAISE EXCEPTION 'The reconciliation does not name this reservation''s original binding' USING ERRCODE='22023'; END IF;
 -- Where its resource was fenced (0111), the fence and generation that froze it as monetary-open.
 SELECT * INTO fz FROM sophia.research_runtime_fences WHERE project_id=r.project_id AND resource_id=v_resource;
 IF FOUND THEN
  IF c.fence IS DISTINCT FROM fz.id OR c.generation IS DISTINCT FROM fz.generation OR NOT EXISTS(
    SELECT 1 FROM sophia.research_runtime_fence_snapshots s, jsonb_array_elements(s.encoding::jsonb) e
    WHERE s.fence_id=fz.id AND s.kind='monetary_open' AND e->>'reservationId'=r.id::text) THEN
   RAISE EXCEPTION 'The reconciliation does not name the fence that froze this reservation' USING ERRCODE='22023'; END IF;
 ELSIF c.fence IS NOT NULL THEN
  RAISE EXCEPTION 'The reconciliation does not name the fence that froze this reservation' USING ERRCODE='22023';
 END IF;
 PERFORM sophia.research_authority_check(c.authority,'provider_billed_attestation',v_account,r.project_id,r.allowance_id);
 IF r.state IN ('settled','released') THEN
  RAISE EXCEPTION 'The reservation already ended as %; nothing is charged again', r.state USING ERRCODE='40001'; END IF;
 IF r.state<>c.state THEN RAISE EXCEPTION 'The reservation is no longer %', c.state USING ERRCODE='40001'; END IF;
 -- The one money transition: the existing accounting (spent, uncertain/reserved release of the commitment, overrun).
 ended:=sophia.end_research_reservation(r.project_id,r.id,'settled',c.cost,NULL,NULL);
 res:=jsonb_build_object('projectId',r.project_id,'reservationId',r.id,'basis','provider_billed_attestation','priorState',r.state,
  'state',ended.state,'settledUsd',ended.settled_usd::text,'reservedUsd',ended.reserved_usd::text,'overrunUsd',ended.overrun_usd::text,
  'accountId',v_account,'fenceId',fz.id,'authorityId',c.authority,'digest',c.digest);
 INSERT INTO sophia.research_reservation_reconciliations(project_id,reservation_id,basis,cost_usd,prior_state,authority_id,fence_id,input,digest,result)
 VALUES(r.project_id,r.id,'provider_billed_attestation',c.cost,r.state,c.authority,fz.id,c.canonical,c.digest,res);
 RETURN res;
END $$;

-- B (F01). Nonmonetary adjudication of ONE recorded cause; its reservation must have ended (money first).
CREATE FUNCTION sophia.adjudicate_research_cause(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE k sophia.research_restriction_causes; prior sophia.research_cause_adjudications; r sophia.research_reservations;
 u record; ok boolean:=true; v_cause uuid; v_project uuid; v_reservation uuid; v_authority uuid; v_ref text; canon jsonb; dg text; res jsonb;
BEGIN
 IF NOT sophia.research_closed(p_input,ARRAY['version','causeId','projectId','reservationId','kind','digest','outcome','authorityId','evidenceRef'])
  OR p_input->>'version' IS DISTINCT FROM 'research-adjudicate-v1' OR p_input->'outcome' IS DISTINCT FROM '"original_money_stands"'::jsonb
  OR p_input->'kind' NOT IN ('"conflict"','"overflow"') OR jsonb_typeof(p_input->'digest')<>'string'
  OR (p_input->>'digest') !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Invalid adjudication input' USING ERRCODE='22023'; END IF;
 u:=sophia.research_uuid_field(p_input->'causeId',false); ok:=ok AND u.ok; v_cause:=u.v;
 u:=sophia.research_uuid_field(p_input->'projectId',false); ok:=ok AND u.ok; v_project:=u.v;
 u:=sophia.research_uuid_field(p_input->'reservationId',false); ok:=ok AND u.ok; v_reservation:=u.v;
 u:=sophia.research_uuid_field(p_input->'authorityId',false); ok:=ok AND u.ok; v_authority:=u.v;
 v_ref:=sophia.research_ref_field(p_input->'evidenceRef');
 IF NOT ok OR v_ref IS NULL THEN RAISE EXCEPTION 'Invalid adjudication input' USING ERRCODE='22023'; END IF;
 canon:=jsonb_build_object('version','research-adjudicate-v1','causeId',v_cause,'projectId',v_project,'reservationId',v_reservation,
  'kind',p_input->>'kind','digest',p_input->>'digest','outcome','original_money_stands','authorityId',v_authority,'evidenceRef',v_ref);
 dg:=sophia.research_digest('research-adjudicate-v1',canon);
 SELECT * INTO prior FROM sophia.research_cause_adjudications WHERE cause_id=v_cause;
 IF FOUND THEN
  IF prior.digest=dg THEN RETURN prior.result; END IF;
  RAISE EXCEPTION 'A different adjudication of this cause is recorded' USING ERRCODE='23505';
 END IF;
 SELECT * INTO k FROM sophia.research_restriction_causes WHERE id=v_cause;
 IF NOT FOUND OR k.project_id<>v_project OR k.reservation_id<>v_reservation OR k.kind<>p_input->>'kind' OR k.digest<>p_input->>'digest' THEN
  RAISE EXCEPTION 'The adjudication does not name this recorded cause' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=k.project_id FOR UPDATE;
 PERFORM 1 FROM sophia.research_allowances WHERE project_id=k.project_id AND id=k.allowance_id FOR UPDATE;
 SELECT * INTO prior FROM sophia.research_cause_adjudications WHERE cause_id=v_cause;
 IF FOUND THEN
  IF prior.digest=dg THEN RETURN prior.result; END IF;
  RAISE EXCEPTION 'A different adjudication of this cause is recorded' USING ERRCODE='23505';
 END IF;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=k.project_id AND id=k.reservation_id;
 IF r.state NOT IN ('settled','released') THEN
  RAISE EXCEPTION 'The reservation is still open; its money is reconciled first' USING ERRCODE='55000'; END IF;
 PERFORM sophia.research_authority_check(v_authority,'cause_adjudication',k.account_id,k.project_id,k.allowance_id);
 res:=jsonb_build_object('causeId',k.id,'scope',k.scope,'seq',k.seq,'projectId',k.project_id,'reservationId',k.reservation_id,'kind',k.kind,
  'digest',k.digest,'outcome','original_money_stands','reservationState',r.state,'settledUsd',r.settled_usd::text,'authorityId',v_authority,
  'inputDigest',dg);
 INSERT INTO sophia.research_cause_adjudications(cause_id,outcome,authority_id,input,digest,result)
 VALUES(k.id,'original_money_stands',v_authority,canon,dg,res);
 RETURN res;
END $$;

-- The operator's read of a scope before certifying it (no lock): projects, aliases, causes, digest, coverage.
CREATE FUNCTION sophia.research_certification_preview(p_account uuid, p_project uuid, p_allowance uuid) RETURNS jsonb LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s jsonb; key text; through integer;
BEGIN
 IF (p_account IS NULL)=(p_project IS NULL) OR (p_project IS NULL)<>(p_allowance IS NULL) THEN
  RAISE EXCEPTION 'Name an account, or one project''s allowance' USING ERRCODE='22023'; END IF;
 s:=sophia.research_cause_set(p_account,p_project,p_allowance);
 key:=coalesce(p_account::text,p_project::text||'/'||p_allowance::text);
 SELECT coalesce(max((e->>'seq')::integer),0) INTO through FROM jsonb_array_elements(s) e;
 RETURN jsonb_build_object('scopeKey',key,'causes',s,'causeSetDigest',sophia.research_cause_set_digest(key,s),'coveredThrough',through,
  'covered',sophia.research_causes_covered(p_account,p_project,p_allowance,through),
  'projectIds',CASE WHEN p_account IS NOT NULL THEN to_jsonb(sophia.research_account_projects(p_account)) END,
  'connectionIds',CASE WHEN p_account IS NOT NULL THEN to_jsonb(sophia.research_account_connections(p_account)) END,
  'restricted',CASE WHEN p_account IS NOT NULL THEN (SELECT g.restricted FROM sophia.research_evidence_guards g WHERE g.account_id=p_account)
   ELSE sophia.research_allowance_restricted(p_project,p_allowance) END,
  'episode',CASE WHEN p_account IS NULL THEN (SELECT max(e.episode) FROM sophia.research_allowance_restriction_episodes e
   WHERE e.project_id=p_project AND e.allowance_id=p_allowance) END);
END $$;

-- C (F02). Certify an account-null allowance's open episode: the project, then the allowance (the restriction writer's
-- row), then the complete current causes recomputed AFTER that wait must equal what the operator certified.
CREATE FUNCTION sophia.certify_research_allowance(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE u record; ok boolean:=true; v_project uuid; v_allowance uuid; v_authority uuid; v_episode integer; v_set_digest text; v_ref text;
 canon jsonb; dg text; prior sophia.research_allowance_certificates; latest integer; s jsonb; through integer; v_id uuid:=gen_random_uuid(); res jsonb;
BEGIN
 IF NOT sophia.research_closed(p_input,ARRAY['version','projectId','allowanceId','episode','causeSetDigest','authorityId','evidenceRef'])
  OR p_input->>'version' IS DISTINCT FROM 'research-certify-allowance-v1' OR jsonb_typeof(p_input->'episode')<>'string'
  OR (p_input->>'episode') !~ '^[1-9][0-9]{0,8}$' OR jsonb_typeof(p_input->'causeSetDigest')<>'string'
  OR (p_input->>'causeSetDigest') !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Invalid certification input' USING ERRCODE='22023'; END IF;
 u:=sophia.research_uuid_field(p_input->'projectId',false); ok:=ok AND u.ok; v_project:=u.v;
 u:=sophia.research_uuid_field(p_input->'allowanceId',false); ok:=ok AND u.ok; v_allowance:=u.v;
 u:=sophia.research_uuid_field(p_input->'authorityId',false); ok:=ok AND u.ok; v_authority:=u.v;
 v_ref:=sophia.research_ref_field(p_input->'evidenceRef'); v_episode:=(p_input->>'episode')::integer; v_set_digest:=p_input->>'causeSetDigest';
 IF NOT ok OR v_ref IS NULL THEN RAISE EXCEPTION 'Invalid certification input' USING ERRCODE='22023'; END IF;
 canon:=jsonb_build_object('version','research-certify-allowance-v1','projectId',v_project,'allowanceId',v_allowance,
  'episode',v_episode::text,'causeSetDigest',v_set_digest,'authorityId',v_authority,'evidenceRef',v_ref);
 dg:=sophia.research_digest('research-certify-allowance-v1',canon);
 SELECT * INTO prior FROM sophia.research_allowance_certificates WHERE project_id=v_project AND allowance_id=v_allowance AND episode=v_episode;
 IF FOUND THEN
  IF prior.digest=dg THEN RETURN prior.result; END IF;
  RAISE EXCEPTION 'A different certificate of this episode is recorded' USING ERRCODE='23505';
 END IF;
 PERFORM 1 FROM sophia.projects WHERE id=v_project FOR UPDATE;
 PERFORM 1 FROM sophia.research_allowances WHERE project_id=v_project AND id=v_allowance FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research allowance not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM sophia.research_allowance_certificates WHERE project_id=v_project AND allowance_id=v_allowance AND episode=v_episode;
 IF FOUND THEN
  IF prior.digest=dg THEN RETURN prior.result; END IF;
  RAISE EXCEPTION 'A different certificate of this episode is recorded' USING ERRCODE='23505';
 END IF;
 SELECT max(e.episode) INTO latest FROM sophia.research_allowance_restriction_episodes e WHERE e.project_id=v_project AND e.allowance_id=v_allowance;
 IF latest IS NULL OR latest<>v_episode OR NOT sophia.research_allowance_restricted(v_project,v_allowance) THEN
  RAISE EXCEPTION 'The certificate names no open restriction episode of this allowance' USING ERRCODE='40001'; END IF;
 -- After the last wait: the complete current causes.
 s:=sophia.research_cause_set(NULL,v_project,v_allowance);
 IF sophia.research_cause_set_digest(v_project::text||'/'||v_allowance::text,s)<>v_set_digest THEN
  RAISE EXCEPTION 'The causes changed; preview them again' USING ERRCODE='40001'; END IF;
 SELECT coalesce(max((e->>'seq')::integer),0) INTO through FROM jsonb_array_elements(s) e;
 IF NOT sophia.research_causes_covered(NULL,v_project,v_allowance,through) THEN
  RAISE EXCEPTION 'A cause is not adjudicated, or its reservation is still open' USING ERRCODE='55000'; END IF;
 PERFORM sophia.research_authority_check(v_authority,'certification',NULL,v_project,v_allowance);
 res:=jsonb_build_object('certificateId',v_id,'projectId',v_project,'allowanceId',v_allowance,'episode',v_episode,'coveredThrough',through,
  'causeSetDigest',v_set_digest,'authorityId',v_authority,'inputDigest',dg);
 INSERT INTO sophia.research_allowance_certificates(id,project_id,allowance_id,episode,covered_through_seq,cause_set_digest,authority_id,input,digest,result)
 VALUES(v_id,v_project,v_allowance,v_episode,through,v_set_digest,v_authority,canon,dg,res);
 RETURN res;
END $$;

-- D (F03). Certify an account guard: the account's projects in id order FOR UPDATE, then its alias connections (the
-- existing membership synchronization), the guard LAST; then the current projects, aliases and complete causes must
-- equal the certified ones (membership drift or a new cause refuses). The guard clears only through the replaced trigger
-- and this transaction's durable certificate.
CREATE FUNCTION sophia.certify_research_account(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE u record; ok boolean:=true; v_account uuid; v_authority uuid; v_projects uuid[]; v_connections uuid[]; v_set_digest text; v_ref text;
 canon jsonb; dg text; prior sophia.research_account_certificates; g sophia.research_evidence_guards; s jsonb; through integer;
 v_id uuid:=gen_random_uuid(); res jsonb;
BEGIN
 IF NOT sophia.research_closed(p_input,ARRAY['version','accountId','projectIds','connectionIds','causeSetDigest','authorityId','evidenceRef'])
  OR p_input->>'version' IS DISTINCT FROM 'research-certify-account-v1' OR jsonb_typeof(p_input->'projectIds')<>'array'
  OR jsonb_typeof(p_input->'connectionIds')<>'array' OR jsonb_array_length(p_input->'projectIds')>256
  OR jsonb_array_length(p_input->'connectionIds')>256 OR jsonb_typeof(p_input->'causeSetDigest')<>'string'
  OR (p_input->>'causeSetDigest') !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Invalid certification input' USING ERRCODE='22023'; END IF;
 u:=sophia.research_uuid_field(p_input->'accountId',false); ok:=ok AND u.ok; v_account:=u.v;
 u:=sophia.research_uuid_field(p_input->'authorityId',false); ok:=ok AND u.ok; v_authority:=u.v;
 v_ref:=sophia.research_ref_field(p_input->'evidenceRef'); v_set_digest:=p_input->>'causeSetDigest';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements((p_input->'projectIds')||(p_input->'connectionIds')) e WHERE NOT (sophia.research_uuid_field(e,false)).ok) THEN ok:=false; END IF;
 IF NOT ok OR v_ref IS NULL THEN RAISE EXCEPTION 'Invalid certification input' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg((e#>>'{}')::uuid ORDER BY o),'{}') INTO v_projects FROM jsonb_array_elements(p_input->'projectIds') WITH ORDINALITY x(e,o);
 SELECT coalesce(array_agg((e#>>'{}')::uuid ORDER BY o),'{}') INTO v_connections FROM jsonb_array_elements(p_input->'connectionIds') WITH ORDINALITY x(e,o);
 IF v_projects<>(SELECT coalesce(array_agg(DISTINCT p ORDER BY p),'{}') FROM unnest(v_projects) p)
  OR v_connections<>(SELECT coalesce(array_agg(DISTINCT p ORDER BY p),'{}') FROM unnest(v_connections) p) THEN
  RAISE EXCEPTION 'Invalid certification input' USING ERRCODE='22023'; END IF;
 canon:=jsonb_build_object('version','research-certify-account-v1','accountId',v_account,'projectIds',to_jsonb(v_projects),
  'connectionIds',to_jsonb(v_connections),'causeSetDigest',v_set_digest,'authorityId',v_authority,'evidenceRef',v_ref);
 dg:=sophia.research_digest('research-certify-account-v1',canon);
 -- REPLAY first.
 SELECT * INTO prior FROM sophia.research_account_certificates WHERE account_id=v_account AND digest=dg;
 IF FOUND THEN RETURN prior.result; END IF;
 IF sophia.research_account_projects(v_account)<>v_projects THEN
  RAISE EXCEPTION 'The account''s projects changed; preview them again' USING ERRCODE='40001'; END IF;
 -- Lock order: every project of the account in id order, then its alias connections in id order (the existing
 -- membership protocol of contribution_lock_connection: projects, then the connection, which every grant, link,
 -- registration and connection change takes), then the guard LAST; no lock after it.
 IF sophia.research_account_connections(v_account)<>v_connections THEN
  RAISE EXCEPTION 'The account''s connections changed; preview them again' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=ANY(v_projects) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM sophia.api_connections WHERE id=ANY(v_connections) ORDER BY id FOR UPDATE;
 SELECT * INTO g FROM sophia.research_evidence_guards WHERE account_id=v_account FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'The account has no evidence guard' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM sophia.research_account_certificates WHERE account_id=v_account AND digest=dg;
 IF FOUND THEN RETURN prior.result; END IF;
 -- After the last wait: membership, aliases and the complete current causes.
 IF sophia.research_account_projects(v_account)<>v_projects OR sophia.research_account_connections(v_account)<>v_connections THEN
  RAISE EXCEPTION 'The account''s projects or connections changed while the certification waited' USING ERRCODE='40001'; END IF;
 s:=sophia.research_cause_set(v_account,NULL,NULL);
 IF sophia.research_cause_set_digest(v_account::text,s)<>v_set_digest THEN
  RAISE EXCEPTION 'The causes changed; preview them again' USING ERRCODE='40001'; END IF;
 SELECT coalesce(max((e->>'seq')::integer),0) INTO through FROM jsonb_array_elements(s) e;
 IF NOT g.restricted THEN RAISE EXCEPTION 'The account is not restricted; there is nothing to certify' USING ERRCODE='55000'; END IF;
 IF NOT sophia.research_causes_covered(v_account,NULL,NULL,through) THEN
  RAISE EXCEPTION 'A cause is not adjudicated, or its reservation is still open' USING ERRCODE='55000'; END IF;
 PERFORM sophia.research_authority_check(v_authority,'certification',v_account,NULL,NULL);
 res:=jsonb_build_object('certificateId',v_id,'accountId',v_account,'projectIds',to_jsonb(v_projects),'connectionIds',to_jsonb(v_connections),
  'coveredThrough',through,'causeSetDigest',v_set_digest,'authorityId',v_authority,'inputDigest',dg);
 INSERT INTO sophia.research_account_certificates(id,account_id,covered_through_seq,project_ids,connection_ids,cause_set_digest,
  prior_first_project_id,prior_first_reservation_id,prior_restricted_at,authority_id,input,digest,result)
 VALUES(v_id,v_account,through,v_projects,v_connections,v_set_digest,g.first_project_id,g.first_reservation_id,g.restricted_at,
  v_authority,canon,dg,res);
 PERFORM set_config('sophia.research_certificate',v_id::text,true);
 UPDATE sophia.research_evidence_guards SET restricted=false, restricted_at=NULL, first_project_id=NULL, first_reservation_id=NULL
  WHERE account_id=v_account;
 PERFORM set_config('sophia.research_certificate','',true);
 RETURN res;
END $$;

-- R1 (C3REC-F01). The governed, non-native path of LATE original-generation facts: an owner-only operation under a
-- late_fact_attestation authority, bound to the reservation's ORIGINAL identities and original generation (R2 P03: the
-- canonical tuple of the call's frozen resource and runtime, that resource's generation token (null exactly without a
-- contribution link) and its fence or null; the
-- ORIGINAL runtime row is revoked, by the fence where there is one or by a maintained re-registration where there is none; the
-- native path stays refused by the post-wait lease check). The report is exactly the existing tracked settle request and goes through the
-- FACT-ONLY writer (facts_version, observed_v1, history cap, conflicts, the 0112 cause writer and its recurrence). It
-- never moves money, whatever the reservation's state (reserved, uncertain, settled, released) or the report's
-- completeness: a complete report is not a charge, and the billed cost stays the separate reconciliation.
-- P01: the SAME operationKey with the same canonical input returns the stored result before any mutable check; with any
-- changed input it refuses; a later observation uses a DISTINCT key (an exact covered repeat appends nothing).
-- R2 P02: the result and the record keep what the report CLAIMED (reported, basis reported_unverified) apart from the
-- reservation's money (financial), which the operation never changes.
CREATE FUNCTION sophia.record_research_late_facts(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE e jsonb; rep jsonb; u record; ok boolean:=true; v_key text; v_project uuid; v_reservation uuid; v_authority uuid; v_ref text;
 x_attempt uuid; x_runtime uuid; x_resource uuid; x_account uuid; x_grant uuid; x_allowance uuid; x_fence uuid; x_generation text;
 x_session text; x_call text; x_unit text; x_operation text; x_provider text;
 canon jsonb; dg text; prior sophia.research_late_fact_operations; i sophia.research_call_identities; r sophia.research_reservations;
 a0 jsonb; a1 jsonb; r1 sophia.research_reservations; fz sophia.research_runtime_fences; w jsonb; res jsonb; c0 integer; c1 integer;
 gen text; rs text; fenced boolean; linked boolean; v_basis text; rep_outcome text; rep_cost numeric(12,6);
BEGIN
 IF NOT sophia.research_closed(p_input,ARRAY['version','operationKey','projectId','reservationId','expected','report','authorityId','evidenceRef'])
  OR p_input->>'version' IS DISTINCT FROM 'research-late-facts-v1' OR jsonb_typeof(p_input->'operationKey')<>'string'
  OR (p_input->>'operationKey') !~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,119}$' OR jsonb_typeof(p_input->'report')<>'object' THEN
  RAISE EXCEPTION 'Invalid late-fact input' USING ERRCODE='22023'; END IF;
 rep:=p_input->'report';
 IF octet_length(rep::text)>262144 THEN RAISE EXCEPTION 'The late report exceeds its bound; nothing was recorded' USING ERRCODE='54000'; END IF;
 e:=p_input->'expected';
 IF NOT sophia.research_closed(e,ARRAY['attemptId','nativeSessionId','callId','runtimeUnitId','runtimeId','resourceId','operation','provider',
   'accountId','grantId','allowanceId','fenceId','generation']) THEN RAISE EXCEPTION 'Invalid late-fact input' USING ERRCODE='22023'; END IF;
 v_key:=p_input->>'operationKey';
 u:=sophia.research_uuid_field(p_input->'projectId',false); ok:=ok AND u.ok; v_project:=u.v;
 u:=sophia.research_uuid_field(p_input->'reservationId',false); ok:=ok AND u.ok; v_reservation:=u.v;
 u:=sophia.research_uuid_field(p_input->'authorityId',false); ok:=ok AND u.ok; v_authority:=u.v;
 u:=sophia.research_uuid_field(e->'attemptId',false); ok:=ok AND u.ok; x_attempt:=u.v;
 u:=sophia.research_uuid_field(e->'runtimeId',false); ok:=ok AND u.ok; x_runtime:=u.v;
 u:=sophia.research_uuid_field(e->'resourceId',false); ok:=ok AND u.ok; x_resource:=u.v;
 u:=sophia.research_uuid_field(e->'allowanceId',false); ok:=ok AND u.ok; x_allowance:=u.v;
 u:=sophia.research_uuid_field(e->'accountId',true); ok:=ok AND u.ok; x_account:=u.v;
 u:=sophia.research_uuid_field(e->'grantId',true); ok:=ok AND u.ok; x_grant:=u.v;
 u:=sophia.research_uuid_field(e->'fenceId',true); ok:=ok AND u.ok; x_fence:=u.v;
 x_session:=sophia.research_ref_field(e->'nativeSessionId'); x_call:=sophia.research_ref_field(e->'callId');
 x_unit:=CASE WHEN jsonb_typeof(e->'runtimeUnitId')='string' AND (e->>'runtimeUnitId') ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$' THEN e->>'runtimeUnitId' END;
 x_operation:=CASE WHEN e->'operation' IN ('"research"','"design"','"source_review"') THEN e->>'operation' END;
 x_provider:=CASE WHEN jsonb_typeof(e->'provider')='string' AND (e->>'provider') ~ '^[a-z][a-z0-9-]{0,62}$' THEN e->>'provider' END;
 x_generation:=CASE WHEN jsonb_typeof(e->'generation')='null' THEN NULL WHEN jsonb_typeof(e->'generation')='string'
  AND (e->>'generation') ~ '^[0-9a-f]{64}$' THEN e->>'generation' ELSE '!' END;
 v_ref:=sophia.research_ref_field(p_input->'evidenceRef');
 IF NOT ok OR x_session IS NULL OR x_call IS NULL OR x_unit IS NULL OR x_operation IS NULL OR x_provider IS NULL OR v_ref IS NULL
  OR x_generation='!' THEN RAISE EXCEPTION 'Invalid late-fact input' USING ERRCODE='22023'; END IF;
 -- The report: exactly the tracked settle request of this call (deeper evidence validation is the existing writer's).
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(rep) k WHERE k NOT IN ('attemptId','nativeSessionId','reservationId','outcome','costUsd','usage','evidence'))
  OR NOT (rep ? 'attemptId' AND rep ? 'nativeSessionId' AND rep ? 'reservationId' AND rep ? 'outcome' AND rep ? 'evidence')
  OR rep->'attemptId' IS DISTINCT FROM e->'attemptId' OR rep->'nativeSessionId' IS DISTINCT FROM e->'nativeSessionId'
  OR rep->'reservationId' IS DISTINCT FROM p_input->'reservationId' OR jsonb_typeof(rep->'evidence')<>'object'
  OR NOT ((rep->'outcome'='"settled"' AND jsonb_typeof(rep->'costUsd')='number' AND (rep->>'costUsd')::numeric>=0
    AND (rep->>'costUsd')::numeric<=999999.999999 AND (NOT (rep ? 'usage') OR jsonb_typeof(rep->'usage')='object'))
   OR (rep->'outcome'='"uncertain"' AND NOT (rep ? 'costUsd') AND (NOT (rep ? 'usage') OR jsonb_typeof(rep->'usage')='object'))) THEN
  RAISE EXCEPTION 'Invalid late-fact input' USING ERRCODE='22023'; END IF;
 canon:=jsonb_build_object('version','research-late-facts-v1','operationKey',v_key,'projectId',v_project,'reservationId',v_reservation,
  'expected',jsonb_build_object('attemptId',x_attempt,'nativeSessionId',x_session,'callId',x_call,'runtimeUnitId',x_unit,'runtimeId',x_runtime,
   'resourceId',x_resource,'operation',x_operation,'provider',x_provider,'accountId',x_account,'grantId',x_grant,'allowanceId',x_allowance,
   'fenceId',x_fence,'generation',x_generation),'report',rep,'authorityId',v_authority,'evidenceRef',v_ref);
 dg:=sophia.research_digest('research-late-facts-v1',canon);
 -- P01 REPLAY: the stored result before any mutable check; the same key with another input refuses.
 SELECT * INTO prior FROM sophia.research_late_fact_operations WHERE operation_key=v_key;
 IF FOUND THEN
  IF prior.digest=dg THEN RETURN prior.result; END IF;
  RAISE EXCEPTION 'This late-fact operation key names another input' USING ERRCODE='23505';
 END IF;
 -- The project first (every runtime writer, the fence and the reconciliation serialize on it).
 PERFORM 1 FROM sophia.projects WHERE id=v_project FOR UPDATE;
 SELECT * INTO prior FROM sophia.research_late_fact_operations WHERE operation_key=v_key;
 IF FOUND THEN
  IF prior.digest=dg THEN RETURN prior.result; END IF;
  RAISE EXCEPTION 'This late-fact operation key names another input' USING ERRCODE='23505';
 END IF;
 SELECT * INTO i FROM sophia.research_call_identities WHERE project_id=v_project AND reservation_id=v_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only a tracked call takes governed late facts' USING ERRCODE='22023'; END IF;
 -- The ORIGINAL binding (the frozen identity of the call).
 IF i.attempt_id<>x_attempt OR i.native_session_id<>x_session OR i.call_id<>x_call OR i.runtime_unit_id<>x_unit OR i.runtime_id<>x_runtime
  OR i.resource_id<>x_resource OR i.operation<>x_operation OR i.provider<>x_provider OR i.account_id IS DISTINCT FROM x_account
  OR i.grant_id IS DISTINCT FROM x_grant OR i.allowance_id<>x_allowance THEN
  RAISE EXCEPTION 'The late facts do not name this call''s original binding' USING ERRCODE='22023'; END IF;
 -- R2 P03 ORIGINAL-GENERATION (non-native only). The ORIGINAL resource's link (0111 FENCE-ORDER: project, link, runtime
 -- rows) and its generation token from that link's immutable binding: never the current or a replacement resource.
 -- P03-A: a resource WITH a link requires exactly its token; JSON null only, and always, for a resource with NO link.
 PERFORM 1 FROM sophia.api_contribution_runtimes WHERE project_id=v_project AND resource_id=i.resource_id FOR SHARE;
 linked:=FOUND;
 gen:=CASE WHEN linked THEN sophia.contribution_runtime_generation(v_project,i.resource_id) END;
 IF linked AND (gen IS NULL OR x_generation IS DISTINCT FROM gen) OR NOT linked AND x_generation IS NOT NULL THEN
  RAISE EXCEPTION 'The late facts do not name their original generation' USING ERRCODE='22023'; END IF;
 -- The bound selector: exactly the call's ORIGINAL runtime row (frozen id, project and resource). It must be revoked: an
 -- active original keeps its own native path, and nothing here reactivates or chooses a runtime.
 SELECT ri.state INTO rs FROM sophia.runtime_instances ri WHERE ri.id=i.runtime_id AND ri.project_id=v_project AND ri.resource_id=i.resource_id FOR SHARE;
 IF rs IS DISTINCT FROM 'revoked' THEN
  RAISE EXCEPTION 'The original runtime is not revoked; its own native path is the writer' USING ERRCODE='55000'; END IF;
 -- The resource's fence where it exists (one per resource): named, same generation, the original runtime in its frozen set.
 -- Where none exists the input names none. A fence is never ignored, and a fence is never invented.
 SELECT * INTO fz FROM sophia.research_runtime_fences WHERE project_id=v_project AND resource_id=i.resource_id;
 fenced:=FOUND;
 IF fenced AND (x_fence IS DISTINCT FROM fz.id OR fz.generation IS DISTINCT FROM gen OR NOT (i.runtime_id=ANY(fz.runtime_ids)))
  OR NOT fenced AND x_fence IS NOT NULL THEN
  RAISE EXCEPTION 'The late facts do not name the fence of their original generation' USING ERRCODE='22023'; END IF;
 v_basis:=CASE WHEN fenced THEN 'fence' ELSE 'runtime_revoked' END;
 PERFORM sophia.research_authority_check(v_authority,'late_fact_attestation',i.account_id,i.project_id,i.allowance_id);
 -- No metadata billing: observational facts never move money (checked again after the writer, defensively).
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=v_project AND id=v_reservation;
 SELECT to_jsonb(x) INTO a0 FROM (SELECT reserved_usd,spent_usd,uncertain_usd,overrun_usd FROM sophia.research_allowances
  WHERE project_id=v_project AND id=r.allowance_id) x;
 SELECT count(*) INTO c0 FROM sophia.research_restriction_causes WHERE project_id=v_project AND reservation_id=v_reservation;
 w:=sophia.research_call_record_late_facts(v_project,v_reservation,rep);
 SELECT * INTO r1 FROM sophia.research_reservations WHERE project_id=v_project AND id=v_reservation;
 SELECT to_jsonb(x) INTO a1 FROM (SELECT reserved_usd,spent_usd,uncertain_usd,overrun_usd FROM sophia.research_allowances
  WHERE project_id=v_project AND id=r.allowance_id) x;
 IF r1.state<>r.state OR r1.settled_usd IS DISTINCT FROM r.settled_usd OR a1<>a0 THEN
  RAISE EXCEPTION 'Late facts must not move money' USING ERRCODE='55000'; END IF;
 SELECT count(*) INTO c1 FROM sophia.research_restriction_causes WHERE project_id=v_project AND reservation_id=v_reservation;
 -- R2 P02: the claim as reported (the writer validated it), apart from the money as it stands.
 rep_outcome:=rep->>'outcome'; rep_cost:=CASE WHEN rep_outcome='settled' THEN (rep->>'costUsd')::numeric(12,6) END;
 res:=jsonb_build_object('operationKey',v_key,'projectId',v_project,'reservationId',v_reservation,'disposition',w->>'disposition',
  'replay',(w->>'replay')::boolean,'capped',(w->>'capped')::boolean,'factsDigest',w->>'digest','newCause',c1>c0,
  'fenceId',CASE WHEN fenced THEN fz.id END,'generation',gen,'originalRuntimeId',i.runtime_id,'originalBasis',v_basis,
  'reported',jsonb_build_object('outcome',rep_outcome,'costUsd',rep_cost::text,'basis','reported_unverified'),
  'financial',jsonb_build_object('reservationState',r1.state,'settledUsd',r1.settled_usd::text),
  'authorityId',v_authority,'inputDigest',dg);
 INSERT INTO sophia.research_late_fact_operations(operation_key,project_id,reservation_id,fence_id,generation,original_runtime_id,
  original_basis,reported_outcome,reported_cost_usd,reported_basis,money_state,money_settled_usd,authority_id,input,digest,result)
 VALUES(v_key,v_project,v_reservation,CASE WHEN fenced THEN fz.id END,gen,i.runtime_id,v_basis,rep_outcome,rep_cost,'reported_unverified',
  r1.state,r1.settled_usd,v_authority,canon,dg,res);
 RETURN res;
END $$;

-- --- privileges -----------------------------------------------------------------------------------------------------
DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY['sophia.research_reconciliation_frozen()','sophia.research_closed(jsonb,text[])',
   'sophia.research_uuid_field(jsonb,boolean)','sophia.research_usd_field(jsonb)','sophia.research_ref_field(jsonb)',
   'sophia.research_digest(text,jsonb)','sophia.research_authority_check(uuid,text,uuid,uuid,uuid)',
   'sophia.research_cause_set(uuid,uuid,uuid)','sophia.research_cause_set_digest(text,jsonb)',
   'sophia.research_causes_covered(uuid,uuid,uuid,integer)','sophia.research_account_connections(uuid)',
   'sophia.research_account_projects(uuid)','sophia.research_allowance_restricted(uuid,uuid)',
   'sophia.research_restriction_cause(sophia.research_call_identities,text,text)','sophia.research_allowance_certificate_check()',
   'sophia.record_research_financial_authority(jsonb)','sophia.revoke_research_financial_authority(uuid,text)',
   'sophia.research_reconcile_input(jsonb)','sophia.reconcile_research_reservation(jsonb)','sophia.adjudicate_research_cause(jsonb)',
   'sophia.research_certification_preview(uuid,uuid,uuid)','sophia.certify_research_allowance(jsonb)',
   'sophia.certify_research_account(jsonb)','sophia.record_research_late_facts(jsonb)',
   'sophia.research_call_record_late_facts(uuid,uuid,jsonb)','sophia.research_call_money_unchanged(sophia.research_reservations,sophia.research_call_fact)',
   'sophia.research_call_restrict_allowance(sophia.research_call_identities)',
   'sophia.research_call_settle(uuid,uuid,jsonb)','sophia.research_evidence_guard_transition()'] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, sophia_api, sophia_worker',f);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sophia_conversation_assembler') THEN
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM sophia_conversation_assembler',f); END IF;
 END LOOP;
END $$;

COMMIT;
