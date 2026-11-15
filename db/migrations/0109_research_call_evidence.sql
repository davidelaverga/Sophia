-- INC04-S03A-R07-C2A (SOPHIA-INC-2026-11, INC-04 R07; root contract R1 5c5f89ee + R2 c2dde9b6, mandatory C01/C02): the
-- durable, private, original-scope evidence of each tracked model call, and a sticky bounded restriction of NEW paid work
-- when that evidence conflicts. Root allocated 0109 (with amendment A57). 0001-0108 are not edited.
-- * Mode (P02). A reserve request names `mode: tracked_v1` and its honest contract (`c1p_complete_report` or
--   `legacy_report`); without a mode it is legacy and its reply is byte-identical to before. The mode, the contract, the
--   authenticated call binding (project, runtime, runtime unit, resource, binding, attempt, native session, call key) and
--   the ORIGINAL funding lineage read from the server's own rows (payer, account, grant and revision, connection,
--   credential revision, qualification and revision) are frozen at reserve in research_call_identities. The declared
--   route, model, effort and prices are metadata only: no SQL repricing, no second balance, no admission ledger.
-- * Contract (K04). A complete report is accepted only for the admitted route and provider the C1P mapping names
--   (research-sol-medium-v1/openai-research, source-review-luna-high-v1/openai-review), read from the authoritative
--   research task, design task or review, or review manifest; anything else is refused, never downgraded silently.
-- * ACK (C01). A tracked reserve answers a closed `binding` echo: mode, contract, evidence id, call id, attempt, native
--   session, project, runtime unit and (REPAIR-001 F03) the executor resource its binding froze, each from the
--   authenticated rows, together with the reservation's state, kind, purpose and amount. The bridge compares it with its
--   exact request and its attempt's authenticated command resource before any provider effect.
-- * Funding (C02). All three reserve wrappers derive the original funding from authoritative rows: the job's own frozen
--   contribution binding, or (design and review, which share a lineage's allowance) the binding of the allowance's
--   lineage. An account-backed call reaches the account gate (grant, connection, account FOR UPDATE, the claim, the exact
--   qualification row, then the evidence guard FOR SHARE, last) before any effect; legacy callers are gated the same way.
--   Only a genuinely account-null scope uses the allowance restriction.
-- * Facts (P03/K02). A tracked settle carries closed evidence: the report kind, four disjoint counts each known(value),
--   unknown or no_separate_reported_class, the consumer's ending (the provider terminal kind stays unknown), and the
--   response id's own namespace and status. Facts are monotone: unknown -> known extends; a changed known value, id, cost
--   or outcome is a retained conflict that raises nothing and changes no established money. A retained digest replays
--   its original disposition. At most 16 history rows, one fixed accepted truth row, a write-once first overflow and a
--   write-once first conflict; after the cap a valid extension still updates the truth and the money once. An input past
--   the cap, even one equal to the current truth, is never a replay: it answers `capped` (REPAIR-001 F02).
-- * Restriction (P05/K01). A conflict, or the first input past the 16-row cap even when it is a valid extension
--   (REPAIR-001 F01), sets the account's guard (or, account-null, the allowance's restriction) sticky:
--   no reset, timeout, Stop, turn end or revocation releases it (C3 owns reconciliation). New paid work (admission,
--   reacquisition, model reserve, normal-funded and rebuilt create/resume/steer dispatch) reads the guard FOR SHARE after
--   every other blocking lock and decides at a fresh instant. The fact writer locks allowance -> reservation -> guard,
--   the guard LAST, and never takes an account or qualification lock. Late settlement, Stop and reconciliation stay
--   available.
-- * IDs (P06/K03). A supported response id is 1..8192 UTF-8 bytes of well-formed text; it is kept whole and only here.
--   An unsupported id is omitted with a fixed reason (an optional correlation digest is not an identity). The request
--   header id stays unknown (C2B). No raw id reaches usage, provider_request_id, an error or a public projection.
BEGIN;

-- --- private tables ---------------------------------------------------------------------------------------------------

-- An account's evidence guard: a sticky restriction flag, never a balance.
CREATE TABLE sophia.research_evidence_guards (
 account_id uuid PRIMARY KEY REFERENCES sophia.api_accounts(id),
 restricted boolean NOT NULL DEFAULT false,
 first_project_id uuid, first_reservation_id uuid, restricted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(restricted=(restricted_at IS NOT NULL)), CHECK(restricted=(first_reservation_id IS NOT NULL)),
 CHECK((first_project_id IS NULL)=(first_reservation_id IS NULL))
);

-- An account-null allowance's sticky restriction (project-funded calls of the same allowance only).
CREATE TABLE sophia.research_allowance_restrictions (
 project_id uuid NOT NULL, allowance_id uuid NOT NULL, first_reservation_id uuid NOT NULL,
 restricted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,allowance_id),
 FOREIGN KEY(project_id,allowance_id) REFERENCES sophia.research_allowances(project_id,id)
);

-- A tracked reservation's frozen original identity (INSERT only).
CREATE TABLE sophia.research_call_identities (
 project_id uuid NOT NULL, reservation_id uuid NOT NULL,
 evidence_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 mode text NOT NULL CHECK(mode='tracked_v1'),
 contract text NOT NULL CHECK(contract IN ('c1p_complete_report','legacy_report')),
 operation text NOT NULL CHECK(operation IN ('research','design','source_review')),
 runtime_id uuid NOT NULL, runtime_unit_id text NOT NULL, resource_id uuid NOT NULL, binding_id uuid NOT NULL,
 attempt_id uuid NOT NULL, native_session_id text NOT NULL, call_id text NOT NULL, job_id uuid NOT NULL, allowance_id uuid NOT NULL,
 route_id text, provider text NOT NULL,
 declared jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(declared)='object'),
 payer text NOT NULL CHECK(payer IN ('project','contributor_api_account')),
 account_id uuid REFERENCES sophia.research_evidence_guards(account_id),
 grant_id uuid, grant_revision bigint, connection_id uuid, credential_revision bigint,
 qualification_id uuid, qualification_revision bigint,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,reservation_id),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_reservations(project_id,id),
 CHECK((payer='contributor_api_account')=(account_id IS NOT NULL)),
 CHECK(payer='project' OR (grant_id IS NOT NULL AND grant_revision IS NOT NULL AND connection_id IS NOT NULL
  AND credential_revision IS NOT NULL AND qualification_id IS NOT NULL AND qualification_revision IS NOT NULL)),
 CHECK(payer='contributor_api_account' OR (grant_id IS NULL AND connection_id IS NULL AND qualification_id IS NULL))
);

-- The closed knowledge of one disjoint count.
CREATE FUNCTION sophia.research_call_count_ok(p_class text, p_value bigint) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT p_class IN ('known','unknown','no_separate_reported_class') AND (p_class='known')=(p_value IS NOT NULL)
  AND (p_value IS NULL OR p_value>=0) $$;

-- The one fixed accepted-truth row of a tracked reservation.
CREATE TABLE sophia.research_call_truth (
 project_id uuid NOT NULL, reservation_id uuid NOT NULL,
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 report text NOT NULL CHECK(report IN ('complete_report','not_complete','legacy_usage')),
 noncached_input_class text NOT NULL, noncached_input bigint,
 cache_read_class text NOT NULL, cache_read bigint,
 cache_write_class text NOT NULL, cache_write bigint,
 output_class text NOT NULL, output bigint,
 consumer_ending text NOT NULL CHECK(consumer_ending IN ('stream_completed','stream_error','consumer_closed')),
 provider_terminal text NOT NULL DEFAULT 'unknown' CHECK(provider_terminal='unknown'),
 outcome text NOT NULL CHECK(outcome IN ('settled','uncertain','released')),
 cost_usd numeric(12,6) CHECK(cost_usd IS NULL OR cost_usd>=0),
 response_id_status text NOT NULL CHECK(response_id_status IN ('unknown','supported','identity_unsupported')),
 response_id text CHECK(response_id IS NULL OR octet_length(response_id) BETWEEN 1 AND 8192),
 response_id_reason text CHECK(response_id_reason IS NULL OR response_id_reason IN ('empty','not_string','nul','unpaired_surrogate','over_bound')),
 response_id_correlation text CHECK(response_id_correlation IS NULL OR response_id_correlation ~ '^[0-9a-f]{64}$'),
 header_id_status text NOT NULL DEFAULT 'unknown' CHECK(header_id_status='unknown'),
 history_count integer NOT NULL DEFAULT 0 CHECK(history_count BETWEEN 0 AND 16),
 first_overflow_digest text CHECK(first_overflow_digest IS NULL OR first_overflow_digest ~ '^[0-9a-f]{64}$'),
 first_overflow_at timestamptz,
 first_conflict_digest text CHECK(first_conflict_digest IS NULL OR first_conflict_digest ~ '^[0-9a-f]{64}$'),
 first_conflict_reason text CHECK(first_conflict_reason IS NULL OR first_conflict_reason IN
  ('count_changed','id_changed','cost_changed','outcome_changed','report_changed','ending_changed')),
 first_conflict_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,reservation_id),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_call_identities(project_id,reservation_id),
 CHECK(sophia.research_call_count_ok(noncached_input_class,noncached_input)), CHECK(sophia.research_call_count_ok(cache_read_class,cache_read)),
 CHECK(sophia.research_call_count_ok(cache_write_class,cache_write)), CHECK(sophia.research_call_count_ok(output_class,output)),
 CHECK((outcome='settled')=(cost_usd IS NOT NULL)),
 CHECK((response_id_status='supported')=(response_id IS NOT NULL)),
 CHECK((response_id_status='identity_unsupported')=(response_id_reason IS NOT NULL)),
 CHECK(response_id_status='identity_unsupported' OR response_id_correlation IS NULL),
 CHECK((first_overflow_digest IS NULL)=(first_overflow_at IS NULL)),
 CHECK((first_conflict_digest IS NULL)=(first_conflict_reason IS NULL) AND (first_conflict_digest IS NULL)=(first_conflict_at IS NULL))
);

-- At most 16 retained inputs of a tracked reservation, each its closed facts (the id only by its digest).
CREATE TABLE sophia.research_call_history (
 project_id uuid NOT NULL, reservation_id uuid NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 16),
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 disposition text NOT NULL CHECK(disposition IN ('accepted','extended','subsumed','conflict')),
 report text NOT NULL CHECK(report IN ('complete_report','not_complete','legacy_usage')),
 noncached_input_class text NOT NULL, noncached_input bigint,
 cache_read_class text NOT NULL, cache_read bigint,
 cache_write_class text NOT NULL, cache_write bigint,
 output_class text NOT NULL, output bigint,
 consumer_ending text NOT NULL, outcome text NOT NULL, cost_usd numeric(12,6),
 response_id_status text NOT NULL, response_id_sha256 text CHECK(response_id_sha256 IS NULL OR response_id_sha256 ~ '^[0-9a-f]{64}$'),
 response_id_reason text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,reservation_id,ordinal), UNIQUE(project_id,reservation_id,digest),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_call_identities(project_id,reservation_id),
 CHECK(sophia.research_call_count_ok(noncached_input_class,noncached_input)), CHECK(sophia.research_call_count_ok(cache_read_class,cache_read)),
 CHECK(sophia.research_call_count_ok(cache_write_class,cache_write)), CHECK(sophia.research_call_count_ok(output_class,output))
);

-- Identity and history rows never change or disappear; the truth row is never deleted.
CREATE FUNCTION sophia.research_call_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 RAISE EXCEPTION 'Call evidence is append-only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER research_call_identities_frozen BEFORE UPDATE OR DELETE ON sophia.research_call_identities
 FOR EACH ROW EXECUTE FUNCTION sophia.research_call_append_only();
CREATE TRIGGER research_call_history_frozen BEFORE UPDATE OR DELETE ON sophia.research_call_history
 FOR EACH ROW EXECUTE FUNCTION sophia.research_call_append_only();
CREATE TRIGGER research_call_truth_kept BEFORE DELETE ON sophia.research_call_truth
 FOR EACH ROW EXECUTE FUNCTION sophia.research_call_append_only();

-- A restriction is sticky: a guard may be created or move false -> true, once; an allowance restriction never goes.
CREATE FUNCTION sophia.research_evidence_guard_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF TG_OP='UPDATE' AND NOT OLD.restricted AND NEW.restricted AND NEW.account_id=OLD.account_id AND NEW.created_at=OLD.created_at THEN
  RETURN NEW; END IF;
 RAISE EXCEPTION 'An evidence restriction is sticky' USING ERRCODE='55000';
END $$;
CREATE TRIGGER research_evidence_guards_sticky BEFORE UPDATE OR DELETE ON sophia.research_evidence_guards
 FOR EACH ROW EXECUTE FUNCTION sophia.research_evidence_guard_transition();
CREATE TRIGGER research_allowance_restrictions_sticky BEFORE UPDATE OR DELETE ON sophia.research_allowance_restrictions
 FOR EACH ROW EXECUTE FUNCTION sophia.research_call_append_only();

ALTER TABLE sophia.research_evidence_guards ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.research_allowance_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.research_call_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.research_call_truth ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.research_call_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.research_evidence_guards, sophia.research_allowance_restrictions, sophia.research_call_identities,
 sophia.research_call_truth, sophia.research_call_history FROM PUBLIC;

-- --- the tracked request and its contract --------------------------------------------------------------------------------

-- The normalized tracked part of a reserve request, or NULL when it is legacy (no mode). A tracked request is a model
-- call's; its contract and declared metadata are closed. Raises with fixed messages only.
CREATE FUNCTION sophia.research_call_request(p_request jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE d jsonb:=coalesce(p_request->'declared','{}'::jsonb);
BEGIN
 IF NOT (p_request ? 'mode') THEN
  IF p_request ? 'contract' OR p_request ? 'declared' THEN RAISE EXCEPTION 'A contract is named only by a tracked request' USING ERRCODE='22023'; END IF;
  RETURN NULL;
 END IF;
 IF p_request->>'mode' IS DISTINCT FROM 'tracked_v1' THEN RAISE EXCEPTION 'Unknown evidence mode' USING ERRCODE='22023'; END IF;
 IF p_request->>'kind' IS DISTINCT FROM 'model' THEN RAISE EXCEPTION 'Only a model call is tracked' USING ERRCODE='22023'; END IF;
 IF coalesce(p_request->>'contract','') NOT IN ('c1p_complete_report','legacy_report') THEN
  RAISE EXCEPTION 'Unknown evidence contract' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(d)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(d) k WHERE k NOT IN ('routeId','model','reasoningEffort','prices'))
    OR (d ? 'routeId' AND coalesce(d->>'routeId','') !~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$')
    OR (d ? 'model' AND coalesce(d->>'model','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$')
    OR (d ? 'reasoningEffort' AND jsonb_typeof(d->'reasoningEffort')<>'null' AND coalesce(d->>'reasoningEffort','') !~ '^[a-z]{1,16}$')
    OR (d ? 'prices' AND (jsonb_typeof(d->'prices')<>'object'
     OR EXISTS(SELECT 1 FROM jsonb_each(d->'prices') e WHERE e.key NOT IN ('input','cacheRead','cacheWrite','output')
      OR jsonb_typeof(e.value)<>'number' OR (e.value#>>'{}')::numeric<0 OR (e.value#>>'{}')::numeric>10000))) THEN
  RAISE EXCEPTION 'Invalid declared route metadata' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('mode','tracked_v1','contract',p_request->>'contract','declared',d);
END $$;

-- K04: a complete report only on the admitted route and provider the C1P mapping names; never downgraded silently.
CREATE FUNCTION sophia.research_call_contract_check(p_contract text, p_route text, p_provider text) RETURNS void LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
BEGIN
 -- Fail closed: an unknown (NULL) route or provider is never in the mapping.
 IF p_contract='c1p_complete_report' AND NOT coalesce((p_route,p_provider) IN (('research-sol-medium-v1','openai-research'),
   ('source-review-luna-high-v1','openai-review')),false) THEN
  RAISE EXCEPTION 'A complete report is not qualified for this route' USING ERRCODE='22023'; END IF;
END $$;

-- The account's evidence guard, read FOR SHARE (after every other blocking lock: a conflict committed while this waited
-- is seen). Absent is unrestricted only because the caller holds the account row, which every initialization needs.
CREATE FUNCTION sophia.research_evidence_guard_read(p_account uuid) RETURNS boolean LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE v boolean;
BEGIN
 SELECT restricted INTO v FROM sophia.research_evidence_guards WHERE account_id=p_account FOR SHARE;
 RETURN coalesce(v,false);
END $$;

-- --- the account gate of a new model reservation (C02) -------------------------------------------------------------------

-- The original funding binding of a call: its job's own frozen binding, else (design and review share a lineage's
-- allowance) the binding of the allowance's lineage; NULL when the scope is genuinely account-null.
CREATE FUNCTION sophia.research_call_binding(p_project uuid, p_allowance uuid, p_job uuid) RETURNS sophia.api_contribution_tasks
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks;
BEGIN
 SELECT * INTO t FROM sophia.api_contribution_tasks WHERE project_id=p_project AND job_id=p_job;
 IF FOUND THEN RETURN t; END IF;
 -- 0100: a research job of a contributed lineage without its own binding is never funded by omission.
 IF sophia.contribution_lineage_unbound(p_project,p_job) THEN PERFORM sophia.contribution_refuse('lineage_unbound'); END IF;
 SELECT * INTO t FROM sophia.api_contribution_tasks WHERE project_id=p_project AND allowance_id=p_allowance
  ORDER BY created_at DESC, job_id DESC LIMIT 1;
 RETURN t;
END $$;

-- contribution_model_reserve (0105), replaced: the same gate, plus (0109) the original lineage binding of a design or
-- review (which share their lineage's allowance), the claim row locked before the exact qualification row, and the
-- evidence guard (initialized for a tracked call under the account row) read FOR SHARE LAST; it hands the funding facts
-- it judged to research_model_gate in this transaction.
CREATE OR REPLACE FUNCTION sophia.contribution_model_reserve(s sophia.research_scope, p_provider text, p_amount numeric) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks; gr sophia.api_contribution_grants; conn sophia.api_connections; acc sophia.api_accounts; why text;
 used numeric; k sophia.api_contribution_claims; q sophia.api_account_qualifications; v_now timestamptz; v_ceiling numeric; -- 0105
 v_after record; -- 0105
 restricted boolean; -- 0109
BEGIN
 SELECT * INTO t FROM sophia.api_contribution_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 IF NOT FOUND THEN
  -- 0100: no new paid call for a contributed lineage without its binding; nothing else would bound it.
  IF sophia.contribution_lineage_unbound(s.project_id,s.job_id) THEN PERFORM sophia.contribution_refuse('lineage_unbound'); END IF;
  -- 0109 (C02): a design or review shares its lineage's allowance; the lineage's original binding funds it.
  t:=sophia.research_call_binding(s.project_id,s.allowance_id,s.job_id);
  IF t.job_id IS NULL THEN RETURN; END IF;
 END IF;
 IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'A reservation is a positive amount' USING ERRCODE='22023'; END IF;
 -- The requester's and owner's member rows, so a removal waits for this reservation's commit (or makes it fail).
 PERFORM 1 FROM sophia.project_members WHERE project_id=t.project_id AND actor_id IN (t.requester_id,t.owner_id) ORDER BY actor_id FOR SHARE;
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=t.grant_id FOR SHARE;
 why:=sophia.contribution_grant_unusable(gr); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 IF gr.revision<>t.grant_revision THEN PERFORM sophia.contribution_refuse('grant_revision_changed'); END IF;
 IF NOT sophia.contribution_requester_eligible(gr,t.requester_id) THEN PERFORM sophia.contribution_refuse('requester_ineligible'); END IF;
 IF NOT sophia.contribution_member(t.project_id,t.owner_id,false) THEN PERFORM sophia.contribution_refuse('owner_not_member'); END IF;
 IF p_provider IS DISTINCT FROM 'openai-research' THEN PERFORM sophia.contribution_refuse('provider_not_contributed'); END IF;
 SELECT * INTO conn FROM sophia.api_connections WHERE id=t.connection_id FOR SHARE;
 IF conn.state<>'connected' OR conn.credential_revision<>t.credential_revision
    OR NOT EXISTS(SELECT 1 FROM sophia.api_contribution_runtimes x WHERE x.project_id=t.project_id AND x.resource_id=t.resource_id AND x.state='current') THEN
  PERFORM sophia.contribution_refuse('credential_revision_changed'); END IF;
 IF NOT sophia.contribution_route_qualified(gr.route_id,gr.model,gr.effort) THEN PERFORM sophia.contribution_refuse('route_unqualified'); END IF;
 SELECT * INTO acc FROM sophia.api_accounts WHERE id=t.account_id FOR UPDATE;
 -- WRITE-004: after the account row's wait, a rebuilt task's call needs its slot (current limits and counts).
 IF sophia.contribution_rebuilt(t.project_id,t.job_id) AND sophia.contribution_rebuild_capacity(t,acc,gr) IS NOT NULL THEN
  PERFORM sophia.contribution_refuse('account_busy'); END IF;
 -- 0105: an unfunded successor has not reacquired its remainder (it reacquires at dispatch); a legacy binding has no claim.
 -- 0109 (E1): the claim row is locked here, before the qualification row, not first by a later write.
 SELECT * INTO k FROM sophia.api_contribution_claims WHERE project_id=t.project_id AND job_id=t.job_id FOR UPDATE;
 IF FOUND AND k.state<>'funded' THEN PERFORM sophia.contribution_refuse('lineage_unfunded'); END IF;
 why:=sophia.contribution_identity_refusal(acc); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 v_ceiling:=sophia.contribution_lineage_ceiling(t.project_id,t.allowance_id);
 IF v_ceiling IS NULL THEN PERFORM sophia.contribution_refuse('lineage_cap_unproven'); END IF;
 -- 0105: the current qualification row; then (0109) the evidence guard, initialized for a tracked call under the account
 -- row and read FOR SHARE, LAST. Everything below is judged after it, at one instant.
 q:=sophia.contribution_lock_account_qualification(conn);
 IF current_setting('sophia.research_call_init',true)='on' THEN -- 0109
  INSERT INTO sophia.research_evidence_guards(account_id) VALUES(acc.id) ON CONFLICT (account_id) DO NOTHING; END IF;
 restricted:=sophia.research_evidence_guard_read(acc.id); -- 0109
 v_now:=clock_timestamp();
 SELECT coalesce(sum(sophia.contribution_commit(r)),0) INTO used FROM sophia.api_contribution_reservations x
  JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id
  WHERE r.project_id=s.project_id AND r.allowance_id=s.allowance_id AND x.grant_id=gr.id;
 IF used+p_amount>least(v_ceiling,gr.task_cap_usd) THEN PERFORM sophia.contribution_refuse('task_cap_reached'); END IF; -- 0105
 -- 0105: totals with this lineage once at greatest(ceiling, used+amount) (its own hold replaced by the reservation).
 SELECT * INTO v_after FROM sophia.contribution_totals_after(acc.id,gr.id,s.project_id,s.allowance_id,used,
  greatest(least(v_ceiling,gr.task_cap_usd),used+p_amount));
 IF v_after.grant_after>gr.total_cap_usd THEN PERFORM sophia.contribution_refuse('grant_exhausted'); END IF;
 IF v_after.account_after>acc.total_cap_usd THEN PERFORM sophia.contribution_refuse('account_exhausted'); END IF;
 -- r3: the time-bound authority is decided here, after the last wait, at the wall clock, immediately before
 -- reserve_research writes the reservation (every row it locks is already held: no further wait).
 why:=sophia.selection_grant_unusable_at(gr,v_now); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF; -- 0105
 IF sophia.selection_global_route_at(gr.route_id,gr.model,gr.effort,v_now)<>'current' THEN -- 0105
  PERFORM sophia.contribution_refuse('route_unqualified'); END IF;
 why:=sophia.contribution_qualification_refusal(q,conn,v_now); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 -- 0105: the owner's current protection; this task already holds its slot.
 why:=sophia.contribution_protection_refusal(acc,gr,sophia.contribution_slots_held(acc.id),v_after.account_after,v_now);
 IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 IF restricted THEN PERFORM sophia.contribution_refuse('evidence_conflict_unreconciled'); END IF; -- 0109
 -- 0109: exactly the original funding facts judged here, for the caller in this transaction (research_model_gate).
 PERFORM set_config('sophia.research_call_funding',jsonb_build_object('jobId',t.job_id,'accountId',acc.id,'grantId',gr.id,
  'grantRevision',t.grant_revision,'connectionId',conn.id,'credentialRevision',t.credential_revision,'qualificationId',q.id,
  'qualificationRevision',q.revision)::text,true);
END $$;

-- The account gate of a new model reservation of ANY job (research, design or review): contribution_model_reserve on the
-- job and allowance, with the guard initialized when the call is tracked. Returns the frozen original funding facts, or
-- NULL for a genuinely account-null scope.
CREATE FUNCTION sophia.research_model_gate(p_project uuid, p_allowance uuid, p_job uuid, p_provider text, p_amount numeric,
 p_init boolean) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE f text;
BEGIN
 PERFORM set_config('sophia.research_call_funding','',true);
 PERFORM set_config('sophia.research_call_init',CASE WHEN p_init THEN 'on' ELSE 'off' END,true);
 PERFORM sophia.contribution_model_reserve(ROW(p_project,NULL,NULL,NULL,NULL,NULL,p_job,p_allowance,NULL,NULL,NULL,NULL)::sophia.research_scope,
  p_provider,p_amount);
 f:=nullif(current_setting('sophia.research_call_funding',true),'');
 PERFORM set_config('sophia.research_call_funding','',true);
 PERFORM set_config('sophia.research_call_init','off',true);
 RETURN f::jsonb;
END $$;

-- reserve_research (0094), replaced: the same, and a NEW model reservation of an allowance under an account-null
-- evidence restriction is refused (legacy callers too). A replay is not new.
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
 IF p_kind='model' AND EXISTS(SELECT 1 FROM sophia.research_allowance_restrictions x WHERE x.project_id=p_project AND x.allowance_id=p_allowance) THEN
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

-- --- the tracked identity and its ACK ---------------------------------------------------------------------------------

-- The authenticated execution binding a reserve was made under: every scope matched it to the leased runtime's own
-- resource and runtime unit, so its resource and unit are the runtime's (no runtime is chosen here).
CREATE FUNCTION sophia.research_call_bound(p_project uuid, p_binding uuid) RETURNS sophia.execution_bindings LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT * FROM sophia.execution_bindings WHERE project_id=p_project AND id=p_binding $$;

-- Freeze a NEW tracked reservation's identity: mode, contract, binding, the original funding facts and declared metadata.
CREATE FUNCTION sophia.research_call_identify(p_project uuid, r sophia.research_reservations, p_tracked jsonb, p_operation text,
 p_scope jsonb, p_route text, p_fund jsonb) RETURNS sophia.research_call_identities LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.research_call_identities; b sophia.execution_bindings:=sophia.research_call_bound(p_project,(p_scope->>'bindingId')::uuid);
BEGIN
 PERFORM sophia.research_call_contract_check(p_tracked->>'contract',p_route,r.provider);
 INSERT INTO sophia.research_call_identities(project_id,reservation_id,mode,contract,operation,runtime_id,runtime_unit_id,resource_id,
  binding_id,attempt_id,native_session_id,call_id,job_id,allowance_id,route_id,provider,declared,payer,account_id,grant_id,grant_revision,
  connection_id,credential_revision,qualification_id,qualification_revision)
 VALUES(p_project,r.id,'tracked_v1',p_tracked->>'contract',p_operation,(p_scope->>'runtimeId')::uuid,b.runtime_unit_id,b.resource_id,
  (p_scope->>'bindingId')::uuid,(p_scope->>'attemptId')::uuid,p_scope->>'nativeSessionId',p_scope->>'callId',(p_scope->>'jobId')::uuid,
  r.allowance_id,p_route,r.provider,p_tracked->'declared',
  CASE WHEN p_fund IS NULL THEN 'project' ELSE 'contributor_api_account' END,(p_fund->>'accountId')::uuid,(p_fund->>'grantId')::uuid,
  (p_fund->>'grantRevision')::bigint,(p_fund->>'connectionId')::uuid,(p_fund->>'credentialRevision')::bigint,
  (p_fund->>'qualificationId')::uuid,(p_fund->>'qualificationRevision')::bigint)
 RETURNING * INTO i;
 RETURN i;
END $$;

-- A replayed key keeps its original mode, contract and declared metadata: a change of any is another reservation.
CREATE FUNCTION sophia.research_call_replay(p_project uuid, r sophia.research_reservations, p_tracked jsonb) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.research_call_identities;
BEGIN
 SELECT * INTO i FROM sophia.research_call_identities WHERE project_id=p_project AND reservation_id=r.id;
 IF (i.reservation_id IS NULL)<>(p_tracked IS NULL) OR (p_tracked IS NOT NULL AND (i.contract<>p_tracked->>'contract'
    OR i.declared<>p_tracked->'declared')) THEN
  RAISE EXCEPTION 'Idempotency key reused for another reservation' USING ERRCODE='23505'; END IF;
END $$;

-- The closed call-binding echo of a tracked reservation (C01), with the authenticated executor resource its binding froze
-- (F03): no token, credential or provider id.
CREATE FUNCTION sophia.research_call_ack(p_project uuid, p_reservation uuid) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('mode',i.mode,'contract',i.contract,'evidenceId',i.evidence_id,'callId',i.call_id,'attemptId',i.attempt_id,
  'nativeSessionId',i.native_session_id,'projectId',i.project_id,'runtimeUnitId',i.runtime_unit_id,'resourceId',i.resource_id)
 FROM sophia.research_call_identities i WHERE i.project_id=p_project AND i.reservation_id=p_reservation $$;

-- Link an account-backed design or review reservation to its lineage's payer (research links through 0094's helper).
CREATE FUNCTION sophia.research_call_link(p_project uuid, r sophia.research_reservations, p_fund jsonb) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks;
BEGIN
 IF p_fund IS NULL OR r.kind<>'model' THEN RETURN; END IF;
 SELECT * INTO t FROM sophia.api_contribution_tasks WHERE project_id=p_project AND job_id=(p_fund->>'jobId')::uuid;
 INSERT INTO sophia.api_contribution_reservations(project_id,reservation_id,job_id,grant_id,grant_revision,account_id,connection_id,credential_revision)
 VALUES(p_project,r.id,t.job_id,t.grant_id,t.grant_revision,t.account_id,t.connection_id,t.credential_revision)
 ON CONFLICT (project_id,reservation_id) DO NOTHING;
END $$;

-- The reserve reply: unchanged for a legacy reservation; a tracked one adds its binding echo.
CREATE FUNCTION sophia.research_call_reply(p_project uuid, r sophia.research_reservations, p_target jsonb) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('reservationId',r.id,'state',r.state,'kind',r.kind,'purpose',r.purpose,'amountUsd',r.reserved_usd,'target',p_target)
  ||coalesce((SELECT jsonb_build_object('binding',sophia.research_call_ack(p_project,r.id))
   FROM sophia.research_call_identities i WHERE i.project_id=p_project AND i.reservation_id=r.id),'{}'::jsonb) $$;

-- --- the three reserve wrappers -----------------------------------------------------------------------------------------

-- runtime_research_reserve (0100), replaced: the same, plus the tracked mode, the evidence guard in the model gate, and
-- the frozen identity with its echo.
CREATE OR REPLACE FUNCTION sophia.runtime_research_reserve(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true); r sophia.research_reservations;
 k text:=p_request->>'kind'; key text; ref text:=p_request->>'targetRef'; url text; q text:=p_request->>'query';
 purpose text:=coalesce(p_request->>'purpose','call'); amount numeric; a sophia.research_allowances; t sophia.research_tasks;
 tracked jsonb:=sophia.research_call_request(p_request); fund jsonb; fresh boolean:=false; -- 0109
BEGIN
 IF coalesce(p_request->>'callId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid call id' USING ERRCODE='22023'; END IF;
 key:=s.native_session_id||':'||(p_request->>'callId');
 IF k='read' THEN
  url:=sophia.research_target_url(s,ref);
  IF url IS NULL THEN RAISE EXCEPTION 'Read target not found' USING ERRCODE='22023'; END IF;
 ELSIF ref IS NOT NULL THEN RAISE EXCEPTION 'Only a read names a target' USING ERRCODE='22023';
 END IF;
 IF (k='search')<>(q IS NOT NULL) OR (q IS NOT NULL AND length(btrim(q)) NOT BETWEEN 1 AND 400) THEN
  RAISE EXCEPTION 'A search names its query, and only a search' USING ERRCODE='22023'; END IF;
 amount:=(p_request->>'amountUsd')::numeric;
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 PERFORM 1 FROM sophia.research_grants WHERE project_id=s.project_id FOR UPDATE;
 SELECT * INTO a FROM sophia.research_allowances WHERE project_id=s.project_id AND id=s.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id AND reservation_key=key;
 IF FOUND THEN
  IF r.target_ref IS DISTINCT FROM ref OR r.query IS DISTINCT FROM q THEN
   RAISE EXCEPTION 'Idempotency key reused for another reservation' USING ERRCODE='23505'; END IF;
  PERFORM sophia.research_call_replay(s.project_id,r,tracked); -- 0109
 ELSE
  IF purpose='partial_result' THEN
   IF k IS DISTINCT FROM 'model' THEN RAISE EXCEPTION 'Only a model call writes the partial result' USING ERRCODE='22023'; END IF;
   IF t.finalizing_at IS NULL AND amount>0
     AND a.reserved_usd+a.spent_usd+a.uncertain_usd+amount<=a.cap_usd-a.headroom_usd THEN
    RAISE EXCEPTION 'A partial-result call needs the allowance spent: an ordinary call still fits' USING ERRCODE='22023'; END IF;
   IF t.finalize_calls>=4 THEN RAISE EXCEPTION 'Research finalize step has used its calls' USING ERRCODE='55000'; END IF;
   UPDATE sophia.research_tasks SET finalizing_at=coalesce(finalizing_at,now()), finalize_calls=finalize_calls+1
    WHERE project_id=s.project_id AND job_id=s.job_id;
  ELSIF t.finalizing_at IS NOT NULL THEN
   RAISE EXCEPTION 'Research is finalizing: no more searches, reads or ordinary calls' USING ERRCODE='55000';
  END IF;
 END IF;
 -- 0109: a new model call reaches the original account's gate (guard initialized when tracked, read last).
 IF r.id IS NULL AND k='model' THEN
  fund:=sophia.research_model_gate(s.project_id,s.allowance_id,s.job_id,p_request->>'provider',amount,tracked IS NOT NULL);
  fresh:=true;
 END IF;
 IF r.id IS NULL AND k<>'model' AND sophia.contribution_lineage_unbound(s.project_id,s.job_id) THEN
  PERFORM sophia.contribution_refuse('lineage_unbound'); END IF;
 r:=sophia.reserve_research(s.project_id,s.allowance_id,key,k,p_request->>'provider',amount,purpose);
 PERFORM sophia.contribution_link_reservation(s,r);
 IF r.target_ref IS NULL AND r.query IS NULL AND (ref IS NOT NULL OR q IS NOT NULL) THEN
  UPDATE sophia.research_reservations SET target_ref=ref, target_url=url, query=q WHERE project_id=s.project_id AND id=r.id RETURNING * INTO r;
 END IF;
 IF fresh AND tracked IS NOT NULL THEN -- 0109
  PERFORM sophia.research_call_identify(s.project_id,r,tracked,'research',jsonb_build_object('runtimeId',s.runtime_id,'bindingId',s.binding_id,
   'attemptId',s.attempt_id,'nativeSessionId',s.native_session_id,'callId',p_request->>'callId','jobId',s.job_id),t.route,fund);
 END IF;
 RETURN sophia.research_call_reply(s.project_id,r,
  CASE WHEN r.target_ref IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('ref',r.target_ref,'url',r.target_url) END);
END $$;

-- The admitted route of a design or review attempt: its design task's, or its design review's.
CREATE FUNCTION sophia.research_call_design_route(s sophia.design_scope) RETURNS text LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE s.kind WHEN 'design' THEN (SELECT t.route FROM sophia.design_tasks t WHERE t.project_id=s.project_id AND t.job_id=s.design_job_id)
  ELSE (SELECT v.route FROM sophia.design_reviews v WHERE v.project_id=s.project_id AND v.job_id=s.job_id) END $$;

-- runtime_design_reserve (0039), replaced: the same, plus (0109) the lock order of reserve_research first, the original
-- account's gate for an account-backed lineage (design shares the research lineage's allowance), its payer link, and the
-- tracked identity.
CREATE OR REPLACE FUNCTION sophia.runtime_design_reserve(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,NULL,true);
 key text:=sophia.design_call_key(s,p_request); r sophia.research_reservations;
 tracked jsonb:=sophia.research_call_request(p_request); fund jsonb; amount numeric:=(p_request->>'amountUsd')::numeric; -- 0109
BEGIN
 IF p_request->>'kind' IS DISTINCT FROM 'model' OR coalesce(p_request->>'purpose','call')<>'call' THEN
  RAISE EXCEPTION 'A design or review reserves model calls only' USING ERRCODE='22023'; END IF;
 -- 0109: reserve_research's own lock order (the grant, then the allowance), then the funding gate.
 PERFORM 1 FROM sophia.research_grants WHERE project_id=s.project_id FOR UPDATE;
 PERFORM 1 FROM sophia.research_allowances WHERE project_id=s.project_id AND id=s.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id AND reservation_key=key;
 IF FOUND THEN PERFORM sophia.research_call_replay(s.project_id,r,tracked);
 ELSE fund:=sophia.research_model_gate(s.project_id,s.allowance_id,s.job_id,p_request->>'provider',amount,tracked IS NOT NULL);
 END IF;
 r:=sophia.reserve_research(s.project_id,s.allowance_id,key,'model',p_request->>'provider',amount,'call');
 IF NOT EXISTS(SELECT 1 FROM sophia.research_call_identities i WHERE i.project_id=s.project_id AND i.reservation_id=r.id) AND tracked IS NOT NULL THEN
  PERFORM sophia.research_call_link(s.project_id,r,fund);
  PERFORM sophia.research_call_identify(s.project_id,r,tracked,'design',jsonb_build_object('runtimeId',s.runtime_id,'bindingId',s.binding_id,
   'attemptId',s.attempt_id,'nativeSessionId',s.native_session_id,'callId',p_request->>'callId','jobId',s.job_id),
   sophia.research_call_design_route(s),fund);
 ELSIF fund IS NOT NULL THEN
  PERFORM sophia.research_call_link(s.project_id,r,fund);
 END IF;
 RETURN sophia.research_call_reply(s.project_id,r,'null'::jsonb);
END $$;

-- runtime_source_review_reserve (0042), replaced: the same, plus (0109) the original account's gate when the review's
-- allowance belongs to an account-backed lineage, its payer link, and the tracked identity.
CREATE OR REPLACE FUNCTION sophia.runtime_source_review_reserve(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.review_scope:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true); r sophia.research_reservations;
 key text; calls integer;
 tracked jsonb:=sophia.research_call_request(p_request); fund jsonb; route text; -- 0109
BEGIN
 IF coalesce(p_request->>'callId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid call id' USING ERRCODE='22023'; END IF;
 IF p_request->>'kind' IS DISTINCT FROM 'model' OR coalesce(p_request->>'purpose','call')<>'call' OR p_request ? 'targetRef' OR p_request ? 'query' THEN
  RAISE EXCEPTION 'A review reserves model calls only' USING ERRCODE='22023'; END IF;
 key:=s.native_session_id||':'||(p_request->>'callId');
 PERFORM 1 FROM sophia.research_grants WHERE project_id=s.project_id FOR UPDATE;
 PERFORM 1 FROM sophia.research_allowances WHERE project_id=s.project_id AND id=s.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id AND reservation_key=key;
 IF NOT FOUND THEN
  SELECT count(*) INTO calls FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id
   AND kind='model' AND state<>'released';
  IF calls>=(sophia.source_review_limits()->>'maxModelRequests')::integer THEN
   RAISE EXCEPTION 'Review model request limit reached: % calls', calls USING ERRCODE='55000'; END IF;
  fund:=sophia.research_model_gate(s.project_id,s.allowance_id,s.job_id,p_request->>'provider',(p_request->>'amountUsd')::numeric,tracked IS NOT NULL); -- 0109
 ELSE
  PERFORM sophia.research_call_replay(s.project_id,r,tracked); -- 0109
 END IF;
 r:=sophia.reserve_research(s.project_id,s.allowance_id,key,'model',p_request->>'provider',(p_request->>'amountUsd')::numeric,'call');
 IF fund IS NOT NULL THEN PERFORM sophia.research_call_link(s.project_id,r,fund); END IF; -- 0109
 IF tracked IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.research_call_identities i WHERE i.project_id=s.project_id AND i.reservation_id=r.id) THEN
  SELECT t.body::jsonb->'route'->>'id' INTO route FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=s.manifest_source_id;
  PERFORM sophia.research_call_identify(s.project_id,r,tracked,'source_review',jsonb_build_object('runtimeId',s.runtime_id,'bindingId',s.binding_id,
   'attemptId',s.attempt_id,'nativeSessionId',s.native_session_id,'callId',p_request->>'callId','jobId',s.job_id),route,fund);
 END IF;
 RETURN sophia.research_call_reply(s.project_id,r,'null'::jsonb);
END $$;

-- --- the facts of a tracked settlement ------------------------------------------------------------------------------------

CREATE TYPE sophia.research_call_fact AS (
 digest text, report text,
 noncached_input_class text, noncached_input bigint, cache_read_class text, cache_read bigint,
 cache_write_class text, cache_write bigint, output_class text, output bigint,
 consumer_ending text, outcome text, cost_usd numeric(12,6),
 response_id_status text, response_id text, response_id_sha256 text, response_id_reason text, response_id_correlation text
);

-- One count's closed knowledge from the evidence; fixed messages only.
CREATE FUNCTION sophia.research_call_count(p jsonb, p_allow_none boolean, OUT o_class text, OUT o_value bigint) LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF jsonb_typeof(p)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('class','value')) THEN
  RAISE EXCEPTION 'Invalid settlement evidence' USING ERRCODE='22023'; END IF;
 o_class:=p->>'class';
 IF o_class='known' THEN
  IF jsonb_typeof(p->'value')<>'number' OR (p->>'value')::numeric<>trunc((p->>'value')::numeric) OR (p->>'value')::numeric<0
     OR (p->>'value')::numeric>9007199254740991 THEN RAISE EXCEPTION 'Invalid settlement evidence' USING ERRCODE='22023'; END IF;
  o_value:=(p->>'value')::bigint;
 ELSIF o_class='unknown' OR (o_class='no_separate_reported_class' AND p_allow_none) THEN
  IF p ? 'value' THEN RAISE EXCEPTION 'Invalid settlement evidence' USING ERRCODE='22023'; END IF;
 ELSE RAISE EXCEPTION 'Invalid settlement evidence' USING ERRCODE='22023';
 END IF;
END $$;

-- The canonical digest of closed facts: the original identity, knowledge, values, provenance, consumer ending, outcome,
-- cost and the id namespace and status (the id only by its own digest; an unsupported id's optional correlation
-- digest too, which is not an identity); never the time.
CREATE FUNCTION sophia.research_call_fact_digest(i sophia.research_call_identities, f sophia.research_call_fact) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT encode(sha256(convert_to(concat_ws('|','research-call-facts-v1',i.evidence_id::text,i.mode,i.contract,f.report,
  f.noncached_input_class,coalesce(f.noncached_input::text,'-'),f.cache_read_class,coalesce(f.cache_read::text,'-'),
  f.cache_write_class,coalesce(f.cache_write::text,'-'),f.output_class,coalesce(f.output::text,'-'),f.consumer_ending,
  'provider_terminal=unknown',f.outcome,coalesce(f.cost_usd::text,'-'),f.response_id_status,coalesce(f.response_id_sha256,'-'),
  coalesce(f.response_id_reason,'-'),coalesce(f.response_id_correlation,'-'),'header=unknown'),'UTF8')),'hex') $$;

-- The normalized, validated facts of a tracked settlement and their canonical digest (the original identity, the facts'
-- knowledge, values, provenance, consumer ending, outcome, cost and the id namespace and status; never the time).
CREATE FUNCTION sophia.research_call_facts(i sophia.research_call_identities, p_request jsonb) RETURNS sophia.research_call_fact
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
DECLARE e jsonb:=p_request->'evidence'; c jsonb; f sophia.research_call_fact; id jsonb; complete boolean;
BEGIN
 IF jsonb_typeof(e)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(e) k WHERE k NOT IN ('contract','report','counts','ending','responseId'))
    OR jsonb_typeof(e->'counts')<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(e->'counts') k
     WHERE k NOT IN ('nonCachedInput','cacheRead','cacheWrite','output')) THEN
  RAISE EXCEPTION 'Invalid settlement evidence' USING ERRCODE='22023'; END IF;
 IF e->>'contract' IS DISTINCT FROM i.contract THEN RAISE EXCEPTION 'Settlement evidence names another contract' USING ERRCODE='22023'; END IF;
 f.report:=e->>'report';
 IF f.report IS NULL OR f.report NOT IN ('complete_report','not_complete','legacy_usage')
    OR (f.report='complete_report' AND i.contract<>'c1p_complete_report') OR (f.report='legacy_usage' AND i.contract<>'legacy_report') THEN
  RAISE EXCEPTION 'Invalid settlement evidence' USING ERRCODE='22023'; END IF;
 c:=e->'counts';
 SELECT * INTO f.noncached_input_class, f.noncached_input FROM sophia.research_call_count(c->'nonCachedInput',false);
 SELECT * INTO f.cache_read_class, f.cache_read FROM sophia.research_call_count(c->'cacheRead',false);
 SELECT * INTO f.cache_write_class, f.cache_write FROM sophia.research_call_count(c->'cacheWrite',f.report='complete_report');
 SELECT * INTO f.output_class, f.output FROM sophia.research_call_count(c->'output',false);
 complete:=f.noncached_input_class='known' AND f.cache_read_class='known' AND f.output_class='known';
 IF (f.report='complete_report' AND NOT (complete AND f.cache_write_class='no_separate_reported_class'))
    OR (f.report='not_complete' AND (f.noncached_input_class<>'unknown' OR f.cache_read_class<>'unknown' OR f.cache_write_class<>'unknown'
     OR f.output_class<>'unknown'))
    OR (f.report='legacy_usage' AND NOT (f.noncached_input_class='known' AND f.output_class='known')) THEN
  RAISE EXCEPTION 'Invalid settlement evidence' USING ERRCODE='22023'; END IF;
 f.consumer_ending:=e->>'ending';
 IF f.consumer_ending IS NULL OR f.consumer_ending NOT IN ('stream_completed','stream_error','consumer_closed') THEN
  RAISE EXCEPTION 'Invalid settlement evidence' USING ERRCODE='22023'; END IF;
 f.outcome:=p_request->>'outcome';
 IF f.report='not_complete' THEN
  IF f.outcome IS DISTINCT FROM 'uncertain' OR p_request ? 'costUsd' THEN RAISE EXCEPTION 'Invalid settlement evidence' USING ERRCODE='22023'; END IF;
 ELSIF f.outcome IS DISTINCT FROM 'settled' OR NOT (p_request ? 'costUsd') THEN
  RAISE EXCEPTION 'Invalid settlement evidence' USING ERRCODE='22023';
 END IF;
 f.cost_usd:=(p_request->>'costUsd')::numeric(12,6);
 id:=e->'responseId';
 IF jsonb_typeof(id)<>'object' THEN RAISE EXCEPTION 'Invalid settlement evidence' USING ERRCODE='22023'; END IF;
 f.response_id_status:=id->>'status';
 IF f.response_id_status='unknown' AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(id) k WHERE k<>'status') THEN NULL;
 ELSIF f.response_id_status='supported' AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(id) k WHERE k NOT IN ('status','value'))
   AND jsonb_typeof(id->'value')='string' AND octet_length(id->>'value') BETWEEN 1 AND 8192 THEN
  f.response_id:=id->>'value'; f.response_id_sha256:=encode(sha256(convert_to(f.response_id,'UTF8')),'hex');
 ELSIF f.response_id_status='identity_unsupported' AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(id) k WHERE k NOT IN ('status','reason','correlation'))
   AND coalesce(id->>'reason','') IN ('empty','not_string','nul','unpaired_surrogate','over_bound')
   AND (NOT (id ? 'correlation') OR coalesce(id->>'correlation','') ~ '^[0-9a-f]{64}$') THEN
  f.response_id_reason:=id->>'reason'; f.response_id_correlation:=id->>'correlation';
 ELSE RAISE EXCEPTION 'Invalid settlement evidence' USING ERRCODE='22023';
 END IF;
 f.digest:=sophia.research_call_fact_digest(i,f);
 RETURN f;
END $$;

-- How one count of new facts relates to the truth: 0 same, 1 extends (unknown -> known), -1 less (known -> unknown),
-- 9 conflicts (a known value or class changed).
CREATE FUNCTION sophia.research_call_count_merge(t_class text, t_value bigint, n_class text, n_value bigint) RETURNS integer LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN t_class=n_class AND t_value IS NOT DISTINCT FROM n_value THEN 0
  WHEN t_class='unknown' THEN 1 WHEN n_class='unknown' THEN -1 ELSE 9 END $$;

-- Compare new facts with the truth: ('extended'|'subsumed'|'conflict', conflict reason or NULL).
CREATE FUNCTION sophia.research_call_compare(t sophia.research_call_truth, f sophia.research_call_fact, OUT o_disposition text, OUT o_reason text)
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
DECLARE m integer[]; ext boolean;
BEGIN
 m:=ARRAY[sophia.research_call_count_merge(t.noncached_input_class,t.noncached_input,f.noncached_input_class,f.noncached_input),
  sophia.research_call_count_merge(t.cache_read_class,t.cache_read,f.cache_read_class,f.cache_read),
  sophia.research_call_count_merge(t.cache_write_class,t.cache_write,f.cache_write_class,f.cache_write),
  sophia.research_call_count_merge(t.output_class,t.output,f.output_class,f.output)];
 IF 9=ANY(m) OR (1=ANY(m) AND -1=ANY(m)) THEN o_disposition:='conflict'; o_reason:='count_changed'; RETURN; END IF;
 IF t.outcome='settled' AND f.outcome='settled' AND t.cost_usd<>f.cost_usd THEN o_disposition:='conflict'; o_reason:='cost_changed'; RETURN; END IF;
 IF t.response_id_status='supported' AND f.response_id_status='supported' AND t.response_id<>f.response_id THEN
  o_disposition:='conflict'; o_reason:='id_changed'; RETURN; END IF;
 IF t.consumer_ending<>f.consumer_ending THEN o_disposition:='conflict'; o_reason:='ending_changed'; RETURN; END IF;
 IF t.report<>f.report AND NOT (t.report='not_complete' OR f.report='not_complete') THEN
  o_disposition:='conflict'; o_reason:='report_changed'; RETURN; END IF;
 ext:=1=ANY(m) OR (t.outcome='uncertain' AND f.outcome='settled')
  OR (t.response_id_status='unknown' AND f.response_id_status<>'unknown')
  OR (t.response_id_status='identity_unsupported' AND f.response_id_status='supported');
 IF ext AND (-1=ANY(m) OR (t.outcome='settled' AND f.outcome='uncertain')) THEN o_disposition:='conflict'; o_reason:='outcome_changed'; RETURN; END IF;
 o_disposition:=CASE WHEN ext THEN 'extended' ELSE 'subsumed' END;
END $$;

-- Record a conflict's or an overflow's restriction: the allowance's (account-null, under the held allowance row) at once;
-- the account's guard is written by the caller LAST.
CREATE FUNCTION sophia.research_call_restrict_allowance(i sophia.research_call_identities) RETURNS void LANGUAGE sql
SET search_path=pg_catalog,sophia AS $$
 INSERT INTO sophia.research_allowance_restrictions(project_id,allowance_id,first_reservation_id)
 SELECT i.project_id,i.allowance_id,i.reservation_id WHERE i.account_id IS NULL
 ON CONFLICT (project_id,allowance_id) DO NOTHING $$;

-- The one money transition of tracked facts on the existing ledger (end_research_reservation), or false when the
-- reservation already ended otherwise and these facts would change it (a conflict: nothing is raised or changed).
CREATE FUNCTION sophia.research_call_money(r sophia.research_reservations, f sophia.research_call_fact, p_usage jsonb) RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF r.state IN ('settled','released') AND NOT (r.state=f.outcome AND r.settled_usd IS NOT DISTINCT FROM f.cost_usd) THEN RETURN false; END IF;
 IF r.state='uncertain' AND f.outcome='uncertain' THEN RETURN true; END IF;
 PERFORM sophia.end_research_reservation(r.project_id,r.id,f.outcome,f.cost_usd,p_usage,NULL);
 RETURN true;
END $$;

-- Append one retained input (at most 16), or note the first overflow once.
CREATE FUNCTION sophia.research_call_retain(t sophia.research_call_truth, f sophia.research_call_fact, p_disposition text) RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF t.history_count>=16 THEN
  UPDATE sophia.research_call_truth SET first_overflow_digest=coalesce(first_overflow_digest,f.digest),
   first_overflow_at=coalesce(first_overflow_at,clock_timestamp()) WHERE project_id=t.project_id AND reservation_id=t.reservation_id;
  RETURN true;
 END IF;
 INSERT INTO sophia.research_call_history(project_id,reservation_id,ordinal,digest,disposition,report,noncached_input_class,noncached_input,
  cache_read_class,cache_read,cache_write_class,cache_write,output_class,output,consumer_ending,outcome,cost_usd,response_id_status,
  response_id_sha256,response_id_reason)
 VALUES(t.project_id,t.reservation_id,t.history_count+1,f.digest,p_disposition,f.report,f.noncached_input_class,f.noncached_input,
  f.cache_read_class,f.cache_read,f.cache_write_class,f.cache_write,f.output_class,f.output,f.consumer_ending,f.outcome,f.cost_usd,
  f.response_id_status,f.response_id_sha256,f.response_id_reason);
 UPDATE sophia.research_call_truth SET history_count=history_count+1 WHERE project_id=t.project_id AND reservation_id=t.reservation_id;
 RETURN false;
END $$;

-- The truth after a monotone extension: every value it already knew is kept; what it did not know is taken. Its digest is
-- the canonical digest of the merged facts.
CREATE FUNCTION sophia.research_call_extend(i sophia.research_call_identities, t sophia.research_call_truth, f sophia.research_call_fact)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE m sophia.research_call_fact:=f;
BEGIN
 m.report:=CASE WHEN t.report='not_complete' THEN f.report ELSE t.report END;
 IF t.noncached_input_class<>'unknown' THEN m.noncached_input_class:=t.noncached_input_class; m.noncached_input:=t.noncached_input; END IF;
 IF t.cache_read_class<>'unknown' THEN m.cache_read_class:=t.cache_read_class; m.cache_read:=t.cache_read; END IF;
 IF t.cache_write_class<>'unknown' THEN m.cache_write_class:=t.cache_write_class; m.cache_write:=t.cache_write; END IF;
 IF t.output_class<>'unknown' THEN m.output_class:=t.output_class; m.output:=t.output; END IF;
 m.consumer_ending:=t.consumer_ending;
 IF t.outcome<>'uncertain' THEN m.outcome:=t.outcome; m.cost_usd:=t.cost_usd; END IF;
 IF t.response_id_status='supported' OR (t.response_id_status='identity_unsupported' AND f.response_id_status<>'supported')
    OR f.response_id_status='unknown' THEN
  m.response_id_status:=t.response_id_status; m.response_id:=t.response_id; m.response_id_reason:=t.response_id_reason;
  m.response_id_correlation:=t.response_id_correlation;
  m.response_id_sha256:=CASE WHEN t.response_id IS NULL THEN NULL ELSE encode(sha256(convert_to(t.response_id,'UTF8')),'hex') END;
 END IF;
 m.digest:=sophia.research_call_fact_digest(i,m);
 UPDATE sophia.research_call_truth SET digest=m.digest, report=m.report,
  noncached_input_class=m.noncached_input_class, noncached_input=m.noncached_input, cache_read_class=m.cache_read_class, cache_read=m.cache_read,
  cache_write_class=m.cache_write_class, cache_write=m.cache_write, output_class=m.output_class, output=m.output,
  outcome=m.outcome, cost_usd=m.cost_usd, response_id_status=m.response_id_status, response_id=m.response_id,
  response_id_reason=m.response_id_reason, response_id_correlation=m.response_id_correlation, updated_at=clock_timestamp()
 WHERE project_id=t.project_id AND reservation_id=t.reservation_id;
END $$;

-- The fact writer of a tracked settlement: allowance -> reservation (end_research_reservation's order) -> truth, then the
-- account guard LAST on a conflict or past the cap. NULL for a legacy reservation (the caller settles it as before).
-- Never raises on a conflict and never changes established money.
CREATE FUNCTION sophia.research_call_settle(p_project uuid, p_reservation uuid, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.research_call_identities; r sophia.research_reservations; t sophia.research_call_truth; f sophia.research_call_fact;
 h sophia.research_call_history; disposition text; reason text; capped boolean:=false;
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
 f:=sophia.research_call_facts(i,p_request);
 SELECT * INTO h FROM sophia.research_call_history WHERE project_id=p_project AND reservation_id=p_reservation AND digest=f.digest;
 IF FOUND THEN -- a retained input: its original disposition, nothing changes
  RETURN jsonb_build_object('disposition',h.disposition,'replay',true,'capped',false,'digest',f.digest);
 END IF;
 SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN
  IF NOT sophia.research_call_money(r,f,p_request->'usage') THEN disposition:='conflict'; reason:='outcome_changed';
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
 ELSIF t.digest=f.digest THEN
  -- The current truth again: below the cap nothing changes. Once the cap is reached, an input that is the current truth
  -- but was never retained is an unretained post-cap input (F02): stably capped through the tail below, never a replay.
  IF t.history_count<16 THEN
   RETURN jsonb_build_object('disposition','current','replay',true,'capped',false,'digest',f.digest);
  END IF;
  disposition:='subsumed';
 ELSE
  SELECT * INTO disposition, reason FROM sophia.research_call_compare(t,f);
  IF disposition='extended' THEN
   IF NOT sophia.research_call_money(r,f,p_request->'usage') THEN disposition:='conflict'; reason:='outcome_changed';
   ELSE PERFORM sophia.research_call_extend(i,t,f); END IF;
  END IF;
  IF disposition='conflict' THEN
   UPDATE sophia.research_call_truth SET first_conflict_digest=coalesce(first_conflict_digest,f.digest),
    first_conflict_reason=coalesce(first_conflict_reason,reason),first_conflict_at=coalesce(first_conflict_at,clock_timestamp())
   WHERE project_id=p_project AND reservation_id=p_reservation;
  END IF;
  SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation;
 END IF;
 capped:=sophia.research_call_retain(t,f,disposition);
 -- A conflict, or an input past the cap (the first overflow, valid or not: F01), restricts its original scope, sticky.
 IF disposition='conflict' OR capped THEN
  PERFORM sophia.research_call_restrict_allowance(i);
  -- LAST: the account's guard (initialized at reserve under the account row); no lock is taken after it.
  IF i.account_id IS NOT NULL THEN
   UPDATE sophia.research_evidence_guards SET restricted=true, restricted_at=clock_timestamp(), first_project_id=p_project,
    first_reservation_id=p_reservation WHERE account_id=i.account_id AND NOT restricted;
  END IF;
 END IF;
 RETURN jsonb_build_object('disposition',CASE WHEN capped AND disposition='subsumed' THEN 'capped' ELSE disposition END,
  'replay',false,'capped',capped,'digest',f.digest);
END $$;

-- --- the three settle wrappers ------------------------------------------------------------------------------------------

-- runtime_research_settle (0025), replaced: the same for a legacy reservation; a tracked one settles through its facts.
CREATE OR REPLACE FUNCTION sophia.runtime_research_settle(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
 r sophia.research_reservations:=sophia.research_own_reservation(s,p_request->>'reservationId'); ev jsonb; -- 0109
BEGIN
 IF p_request ? 'usage' AND jsonb_typeof(p_request->'usage')<>'object' THEN RAISE EXCEPTION 'Invalid usage' USING ERRCODE='22023'; END IF;
 ev:=sophia.research_call_settle(s.project_id,r.id,p_request); -- 0109
 IF ev IS NULL THEN
  r:=sophia.end_research_reservation(s.project_id,r.id,p_request->>'outcome',(p_request->>'costUsd')::numeric,p_request->'usage',
   p_request->>'providerRequestId');
  RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'settledUsd',r.settled_usd);
 END IF;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND id=r.id;
 RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'settledUsd',r.settled_usd,'evidence',ev);
END $$;

-- runtime_design_settle (0039), replaced: the same for a legacy reservation; a tracked one settles through its facts.
CREATE OR REPLACE FUNCTION sophia.runtime_design_settle(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,NULL,false); r sophia.research_reservations;
 ev jsonb; -- 0109
BEGIN
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND id=sophia.uuid_or_null(p_request->>'reservationId')
  AND allowance_id=s.allowance_id AND starts_with(reservation_key,s.native_session_id||':');
 IF NOT FOUND THEN RAISE EXCEPTION 'Research reservation not found' USING ERRCODE='22023'; END IF;
 IF p_request ? 'usage' AND jsonb_typeof(p_request->'usage')<>'object' THEN RAISE EXCEPTION 'Invalid usage' USING ERRCODE='22023'; END IF;
 ev:=sophia.research_call_settle(s.project_id,r.id,p_request); -- 0109
 IF ev IS NULL THEN
  r:=sophia.end_research_reservation(s.project_id,r.id,p_request->>'outcome',(p_request->>'costUsd')::numeric,p_request->'usage',
   p_request->>'providerRequestId');
  RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'settledUsd',r.settled_usd);
 END IF;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND id=r.id;
 RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'settledUsd',r.settled_usd,'evidence',ev);
END $$;

-- runtime_source_review_settle (0042), replaced: the same for a legacy reservation; a tracked one settles through its facts.
CREATE OR REPLACE FUNCTION sophia.runtime_source_review_settle(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.review_scope:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false); r sophia.research_reservations;
 ev jsonb; -- 0109
BEGIN
 IF coalesce(p_request->>'reservationId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'Review reservation not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND id=(p_request->>'reservationId')::uuid
  AND allowance_id=s.allowance_id AND starts_with(reservation_key,s.native_session_id||':');
 IF NOT FOUND THEN RAISE EXCEPTION 'Review reservation not found' USING ERRCODE='22023'; END IF;
 IF p_request ? 'usage' AND jsonb_typeof(p_request->'usage')<>'object' THEN RAISE EXCEPTION 'Invalid usage' USING ERRCODE='22023'; END IF;
 ev:=sophia.research_call_settle(s.project_id,r.id,p_request); -- 0109
 IF ev IS NULL THEN
  r:=sophia.end_research_reservation(s.project_id,r.id,p_request->>'outcome',(p_request->>'costUsd')::numeric,p_request->'usage',
   p_request->>'providerRequestId');
  RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'settledUsd',r.settled_usd);
 END IF;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND id=r.id;
 RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'settledUsd',r.settled_usd,'evidence',ev);
END $$;

-- --- new paid work reads the evidence guard (P05/K01) ------------------------------------------------------------------

-- contribution_admission (0105), replaced: the same, plus the evidence guard read LAST and its refusal (lines 0109).
CREATE OR REPLACE FUNCTION sophia.contribution_admission(p_project uuid, p_actor uuid, pin sophia.research_funding_pins, p_role text,
 p_route text, p_outputs jsonb, p_base_job uuid) RETURNS sophia.api_contribution_grants LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE gr sophia.api_contribution_grants; conn sophia.api_connections; acc sophia.api_accounts; why text; base sophia.api_contribution_tasks;
 q sophia.api_account_qualifications; v_now timestamptz; v_ceiling numeric; v_cap numeric; v_own numeric:=0; v_need numeric; -- 0105
 v_after record; v_slots integer; v_allowance uuid; -- 0105
 restricted boolean; -- 0109
BEGIN
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=pin.grant_id AND project_id=p_project FOR SHARE;
 IF NOT FOUND THEN PERFORM sophia.contribution_refuse('grant_missing'); END IF;
 why:=sophia.contribution_grant_unusable(gr); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 IF gr.revision<>pin.grant_revision THEN PERFORM sophia.contribution_refuse('pin_stale'); END IF;
 IF p_role<>gr.role_id OR p_route<>gr.route_id OR p_outputs<>'["markdown"]'::jsonb THEN
  PERFORM sophia.contribution_refuse('operation_not_granted'); END IF;
 IF NOT sophia.contribution_requester_eligible(gr,p_actor) THEN PERFORM sophia.contribution_refuse('requester_ineligible'); END IF;
 -- Source disclosure: project text goes to the owner's provider account, so the owner must be a current member.
 IF NOT sophia.contribution_member(p_project,gr.owner_id,false) THEN PERFORM sophia.contribution_refuse('owner_not_member'); END IF;
 IF p_base_job IS NOT NULL THEN
  SELECT * INTO base FROM sophia.api_contribution_tasks WHERE project_id=p_project AND job_id=p_base_job;
  IF NOT FOUND OR base.grant_id<>gr.id THEN PERFORM sophia.contribution_refuse('lineage_funding_mixed'); END IF;
 END IF;
 SELECT * INTO conn FROM sophia.api_connections WHERE id=gr.connection_id FOR SHARE;
 IF conn.state<>'connected' THEN PERFORM sophia.contribution_refuse('connection_not_connected'); END IF;
 IF NOT sophia.contribution_route_qualified(gr.route_id,gr.model,gr.effort) THEN PERFORM sophia.contribution_refuse('route_unqualified'); END IF;
 -- The account row serializes every admission and reservation of this account, across projects and aliases.
 SELECT * INTO acc FROM sophia.api_accounts WHERE id=conn.account_id FOR UPDATE;
 v_slots:=sophia.contribution_slots_held(acc.id); -- 0105
 IF v_slots>=acc.concurrency_limit OR sophia.contribution_slots_held(acc.id,gr.id)>=gr.concurrency THEN
  PERFORM sophia.contribution_refuse('account_busy'); END IF;
 -- 0105: typed identity, then no new work beside an unreconciled effect, then the lineage's ORIGINAL ceiling.
 why:=sophia.contribution_identity_refusal(acc); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 IF sophia.contribution_account_uncertain(acc.id) THEN PERFORM sophia.contribution_refuse('uncertain_effects_unreconciled'); END IF;
 IF p_base_job IS NULL THEN v_ceiling:=gr.task_cap_usd;
 ELSE
  v_allowance:=base.allowance_id;
  v_ceiling:=sophia.contribution_lineage_ceiling(p_project,v_allowance);
  IF v_ceiling IS NULL THEN PERFORM sophia.contribution_refuse('lineage_cap_unproven'); END IF;
  v_own:=sophia.contribution_lineage_committed(p_project,v_allowance,gr.id);
 END IF;
 -- 0105: the exact qualification row; then (0109) the evidence guard FOR SHARE, LAST. Every check below reads after this
 -- final wait, at one instant.
 q:=sophia.contribution_lock_account_qualification(conn);
 restricted:=sophia.research_evidence_guard_read(acc.id); -- 0109
 v_now:=clock_timestamp();
 -- r3: the time-bound authority is decided here, after the last wait, at the wall clock.
 why:=sophia.selection_grant_unusable_at(gr,v_now); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF; -- 0105
 IF sophia.selection_global_route_at(gr.route_id,gr.model,gr.effort,v_now)<>'current' THEN -- 0105
  PERFORM sophia.contribution_refuse('route_unqualified'); END IF;
 why:=sophia.contribution_qualification_refusal(q,conn,v_now); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 -- 0105: money (C03). This lineage counts once: its actual commitment plus its whole remaining promise.
 v_cap:=least(v_ceiling,gr.task_cap_usd);
 v_need:=greatest(v_cap-v_own,0);
 SELECT * INTO v_after FROM sophia.contribution_totals_after(acc.id,gr.id,p_project,v_allowance,v_own,v_own+v_need);
 IF v_after.grant_after>gr.total_cap_usd THEN PERFORM sophia.contribution_refuse('grant_exhausted'); END IF;
 IF v_after.account_after>acc.total_cap_usd THEN PERFORM sophia.contribution_refuse('account_exhausted'); END IF;
 why:=sophia.contribution_protection_refusal(acc,gr,v_slots+1,v_after.account_after,v_now);
 IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 IF restricted THEN PERFORM sophia.contribution_refuse('evidence_conflict_unreconciled'); END IF; -- 0109
 -- 0105: exactly the facts checked here, for contribution_bind_task in this transaction (never a later lookup).
 PERFORM set_config('sophia.contribution_admission',jsonb_build_object('grantId',gr.id,'actorId',p_actor,'project',p_project,
  'lineageCap',v_ceiling,'accountRevision',acc.revision,'provenance',acc.provenance,'qualificationId',q.id,
  'qualificationRevision',q.revision,'witness',CASE acc.protection_applicability WHEN 'none_applicable' THEN 'none_applicable'
   ELSE 'preserves_protected' END,'checkedAt',v_now)::text,true);
 RETURN gr;
END $$;

-- contribution_reacquire (0105), replaced: the same, plus the evidence guard (lines 0109). Its writable branch is
-- reached only from contribution_dispatch_fund, which holds the claim and account rows.
CREATE OR REPLACE FUNCTION sophia.contribution_reacquire(t sophia.api_contribution_tasks, p_write boolean) RETURNS text LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE k sophia.api_contribution_claims; gr sophia.api_contribution_grants; conn sophia.api_connections; acc sophia.api_accounts;
 q sophia.api_account_qualifications; v_now timestamptz; v_ceiling numeric; v_own numeric; v_after record; why text;
 restricted boolean; -- 0109
BEGIN
 SELECT * INTO k FROM sophia.api_contribution_claims WHERE project_id=t.project_id AND job_id=t.job_id;
 IF NOT FOUND OR k.state='funded' THEN RETURN NULL; END IF;
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=t.grant_id;
 SELECT * INTO conn FROM sophia.api_connections WHERE id=t.connection_id;
 SELECT * INTO acc FROM sophia.api_accounts WHERE id=t.account_id;
 why:=sophia.contribution_identity_refusal(acc); IF why IS NOT NULL THEN RETURN why; END IF;
 IF sophia.contribution_account_uncertain(acc.id) THEN RETURN 'uncertain_effects_unreconciled'; END IF;
 v_ceiling:=sophia.contribution_lineage_ceiling(t.project_id,t.allowance_id);
 IF v_ceiling IS NULL THEN RETURN 'lineage_cap_unproven'; END IF;
 IF p_write THEN q:=sophia.contribution_lock_account_qualification(conn);
 ELSE SELECT * INTO q FROM sophia.api_account_qualifications WHERE connection_id=conn.id AND account_id=conn.account_id
   AND credential_revision=conn.credential_revision AND route_id=conn.route_id AND model=conn.model AND effort=conn.effort
   AND revoked_at IS NULL ORDER BY observed_at DESC, id DESC LIMIT 1;
 END IF;
 -- 0109: the evidence guard; writable, FOR SHARE and LAST (the caller holds the claim and account rows); a read only evaluates.
 restricted:=CASE WHEN p_write THEN sophia.research_evidence_guard_read(acc.id)
  ELSE coalesce((SELECT g.restricted FROM sophia.research_evidence_guards g WHERE g.account_id=acc.id),false) END;
 v_now:=clock_timestamp();
 why:=sophia.selection_grant_unusable_at(gr,v_now); IF why IS NOT NULL THEN RETURN why; END IF;
 IF gr.revision<>t.grant_revision THEN RETURN 'grant_revision_changed'; END IF;
 IF sophia.selection_global_route_at(gr.route_id,gr.model,gr.effort,v_now)<>'current' THEN RETURN 'route_unqualified'; END IF;
 why:=sophia.contribution_qualification_refusal(q,conn,v_now); IF why IS NOT NULL THEN RETURN why; END IF;
 v_own:=sophia.contribution_lineage_committed(t.project_id,t.allowance_id,gr.id);
 SELECT * INTO v_after FROM sophia.contribution_totals_after(acc.id,gr.id,t.project_id,t.allowance_id,v_own,
  greatest(least(v_ceiling,gr.task_cap_usd),v_own));
 IF v_after.grant_after>gr.total_cap_usd THEN RETURN 'grant_exhausted'; END IF;
 IF v_after.account_after>acc.total_cap_usd THEN RETURN 'account_exhausted'; END IF;
 -- Its own task row already holds its slot (contribution_slots_held counts it): no slot delta.
 why:=sophia.contribution_protection_refusal(acc,gr,sophia.contribution_slots_held(acc.id),v_after.account_after,v_now);
 IF why IS NOT NULL THEN RETURN why; END IF;
 IF restricted THEN RETURN 'evidence_conflict_unreconciled'; END IF; -- 0109
 IF p_write THEN
  UPDATE sophia.api_contribution_claims SET state='funded', funded_at=v_now WHERE project_id=t.project_id AND job_id=t.job_id;
 END IF;
 RETURN NULL;
END $$;

-- contribution_dispatch_fund (0105), replaced: the one writable gate of every contributed create, resume and steer at
-- its dispatch, normal-funded or rebuilt: the same locks in admission's order, the claim before the qualification row,
-- then the evidence guard LAST and one fresh instant (authority, revision, credential, route, qualification, restriction).
-- An unfunded successor reacquires through contribution_reacquire as before.
CREATE OR REPLACE FUNCTION sophia.contribution_dispatch_fund(b sophia.execution_bindings) RETURNS text LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks; why text; k sophia.api_contribution_claims; gr sophia.api_contribution_grants;
 conn sophia.api_connections; acc sophia.api_accounts; q sophia.api_account_qualifications; v_now timestamptz; restricted boolean;
BEGIN
 SELECT x.* INTO t FROM sophia.api_contribution_tasks x JOIN sophia.jobs j ON j.project_id=x.project_id AND j.id=x.job_id
  WHERE j.project_id=b.project_id AND j.attempt_id=b.attempt_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- Admission's lock order after the project (already held): grant, connection, account; then (E1) the claim row before
 -- the exact qualification row; then the evidence guard LAST. Funded or not, no early return before the guard.
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=t.grant_id FOR SHARE;
 SELECT * INTO conn FROM sophia.api_connections WHERE id=t.connection_id FOR SHARE;
 SELECT * INTO acc FROM sophia.api_accounts WHERE id=t.account_id FOR UPDATE;
 SELECT * INTO k FROM sophia.api_contribution_claims WHERE project_id=t.project_id AND job_id=t.job_id FOR UPDATE;
 IF FOUND AND k.state='unfunded' THEN
  why:=sophia.contribution_reacquire(t,true);
  RETURN CASE WHEN why IS NULL THEN NULL ELSE 'its contribution cannot fund its remainder: '||why END;
 END IF;
 q:=sophia.contribution_lock_account_qualification(conn);
 restricted:=sophia.research_evidence_guard_read(acc.id);
 v_now:=clock_timestamp();
 why:=sophia.selection_grant_unusable_at(gr,v_now);
 IF why IS NULL AND gr.revision<>t.grant_revision THEN why:='grant_revision_changed'; END IF;
 IF why IS NULL AND (conn.state<>'connected' OR conn.credential_revision<>t.credential_revision) THEN why:='credential_revision_changed'; END IF;
 IF why IS NULL AND sophia.selection_global_route_at(gr.route_id,gr.model,gr.effort,v_now)<>'current' THEN why:='route_unqualified'; END IF;
 IF why IS NULL THEN why:=sophia.contribution_qualification_refusal(q,conn,v_now); END IF;
 IF why IS NULL AND restricted THEN why:='evidence_conflict_unreconciled'; END IF;
 RETURN CASE WHEN why IS NULL THEN NULL ELSE 'its contribution cannot fund this work now: '||why END;
END $$;

-- dispatch_runtime_outbox (0105), replaced: 0105's definition byte for byte except the one S02A-FUND condition, which
-- now gates every contributed create, resume and steer (line 0109).
CREATE OR REPLACE FUNCTION sophia.dispatch_runtime_outbox(p_project uuid, p_outbox uuid, p_lease_token uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.outbox; g sophia.goals; c sophia.commands; b sophia.execution_bindings; rt sophia.runtime_instances; why text;
 kind text; payload jsonb:='{}'; next_seq bigint; command_body jsonb; rc_id uuid:=gen_random_uuid(); manifest jsonb; txt text;
 job_kind text; job_id uuid; base uuid; seed sophia.source_objects; design_job uuid;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO o FROM sophia.outbox WHERE project_id=p_project AND id=p_outbox FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outbox row not found' USING ERRCODE='22023'; END IF;
 IF o.state<>'dispatching' OR o.lease_token IS DISTINCT FROM p_lease_token THEN RAISE EXCEPTION 'Lease lost; reconcile before recording' USING ERRCODE='40001'; END IF;
 IF o.lease_until<clock_timestamp() THEN
  UPDATE sophia.outbox SET state='outcome_unknown' WHERE project_id=p_project AND id=p_outbox;
  RETURN jsonb_build_object('result','outcome_unknown','reason','the dispatch lease expired');
 END IF;
 -- CON-D1-BEGIN
 IF o.conversation_reply_id IS NOT NULL THEN RETURN sophia.conversation_dispatch(o); END IF;
 -- CON-D1-END
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=o.goal_id FOR UPDATE;
 SELECT * INTO c FROM sophia.commands WHERE project_id=p_project AND id=o.command_id FOR UPDATE;
 -- CON-D2-BEGIN
 IF g.id IS NULL THEN
  UPDATE sophia.outbox SET state='denied',lease_until=NULL,outcome_reason='delivery has no goal' WHERE project_id=p_project AND id=o.id;
  UPDATE sophia.commands SET state='denied' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
  RETURN jsonb_build_object('result','denied','reason','delivery has no goal');
 END IF;
 -- CON-D2-END
 IF o.destination='control.settle' THEN
  PERFORM sophia.settle_native_control(p_project,g.id);
  UPDATE sophia.outbox SET state='settled', lease_until=NULL WHERE project_id=p_project AND id=p_outbox;
  UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
  RETURN jsonb_build_object('result','settled');
 END IF;
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=p_project AND id=o.binding_id FOR UPDATE;
 SELECT * INTO rt FROM sophia.runtime_instances WHERE project_id=p_project AND resource_id=b.resource_id AND runtime_unit_id=b.runtime_unit_id AND state='active';
 IF o.cleanup THEN
  kind:=c.kind;  -- hold or stop (admit_goal_command writes native.stop rows for both)
  -- RETIRE-KIND-BEGIN (0075, A41): a completed goal's retire_sessions is sent as the runtime's existing stop
  IF kind='retire_sessions' THEN kind:='stop'; END IF;
  -- RETIRE-KIND-END
  IF b.state IN ('settled','lost') OR (b.state='created' AND NOT EXISTS(SELECT 1 FROM sophia.runtime_commands WHERE project_id=p_project AND binding_id=b.id)) THEN
   UPDATE sophia.execution_bindings SET state='settled' WHERE project_id=p_project AND id=b.id AND state<>'lost';
   UPDATE sophia.outbox SET state='settled', lease_until=NULL WHERE project_id=p_project AND id=p_outbox;
   UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
   PERFORM sophia.settle_native_control(p_project,g.id);
   RETURN jsonb_build_object('result','settled','reason','no native session to fence');
  END IF;
  IF rt.id IS NULL THEN RETURN sophia.deny_native_delivery(o,c,'no active runtime for its executor resource and runtime unit'); END IF;
 ELSE
  IF o.destination='native.steer' AND sophia.reviews_only(p_project,b.attempt_id) THEN RETURN sophia.pass_steer_by(o,c); END IF;
  why:=sophia.native_delivery_ineligible(o,g,c,b,rt);
  IF why IS NOT NULL THEN RETURN sophia.deny_native_delivery(o,c,why); END IF;
  why:=sophia.runtime_unavailable(rt);
  IF why IS NOT NULL THEN RETURN sophia.defer_native_delivery(o,c,why); END IF;
  -- S02A-FUND-BEGIN (0105, C01): the one writable dispatch of a contributed create, after every check above. An
  -- unfunded rebuilt successor reacquires its lineage's remainder here (account row, then the exact qualification row),
  -- or is withheld: denied, never sent. No read, readiness view, fence or revocation writes a claim.
  IF o.destination IN ('native.create','native.resume','native.steer') THEN -- 0109: every contributed new-work dispatch
   why:=sophia.contribution_dispatch_fund(b);
   IF why IS NOT NULL THEN RETURN sophia.deny_native_delivery(o,c,why); END IF;
  END IF;
  -- S02A-FUND-END
  kind:=substr(o.destination,8);
  IF kind='create' THEN
   SELECT j.kind, j.id, t.body::jsonb INTO job_kind, job_id, manifest FROM sophia.jobs j
    JOIN sophia.source_texts t ON t.project_id=j.project_id AND t.source_id=j.input_source_id
    WHERE j.project_id=p_project AND j.command_id=c.id;
   IF job_kind='research' THEN
    IF EXISTS(SELECT 1 FROM sophia.jobs j2 JOIN sophia.execution_bindings b2 ON b2.project_id=j2.project_id AND b2.attempt_id=j2.attempt_id
      JOIN sophia.work_attempts w2 ON w2.project_id=j2.project_id AND w2.id=j2.attempt_id
      JOIN sophia.goals g2 ON g2.project_id=w2.project_id AND g2.id=w2.goal_id
      WHERE j2.project_id=p_project AND j2.kind='research' AND j2.id<>job_id AND j2.state IN ('pending','running','outcome_unknown')
       AND b2.state IN ('launching','running','idle') AND g2.status IN ('ready','running','checking')) THEN
     RETURN sophia.defer_native_delivery(o,c,'waiting for the research worker: another research task is under way');
    END IF;
    base:=(manifest->'base'->>'sourceId')::uuid;
    IF base IS NOT NULL THEN
     SELECT t.body INTO txt FROM sophia.source_texts t WHERE t.project_id=p_project AND t.source_id=base;
     seed:=sophia.put_text_source(p_project,c.actor_id,'text/markdown; charset=utf-8',txt);
     INSERT INTO sophia.research_drafts(project_id,attempt_id,seq,call_key,source_id,sha256)
     VALUES(p_project,b.attempt_id,1,'base:'||(manifest->'base'->>'versionId'),seed.id,seed.sha256);
    END IF;
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->>'route','text',sophia.research_task_statement(p_project,manifest));
   ELSIF job_kind='design' THEN
    design_job:=job_id;
    IF NOT EXISTS(SELECT 1 FROM sophia.design_tasks dt WHERE dt.project_id=p_project AND dt.job_id=design_job AND dt.package_source_id IS NOT NULL) THEN
     RETURN sophia.deny_native_delivery(o,c,'the design has no frozen content package');
    END IF;
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->>'route','text',sophia.design_task_statement(manifest));
   ELSIF job_kind='design_review' THEN
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->>'route','text',sophia.review_task_statement(manifest));
   ELSIF job_kind='source_review' THEN
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->'route'->>'id','text',sophia.source_review_statement(manifest));
   ELSE
    payload:=jsonb_build_object('role','sophia-brief-v1','text',sophia.draft_brief_prompt(manifest));
   END IF;
  ELSIF kind IN ('steer','input') THEN
   SELECT t.body INTO txt FROM sophia.source_texts t WHERE t.project_id=p_project AND t.source_id=c.body_source_id;
   IF txt IS NULL THEN RETURN sophia.deny_native_delivery(o,c,'its instruction has no readable text'); END IF;
   payload:=jsonb_build_object('text',txt);
  END IF;
 END IF;
 UPDATE sophia.runtime_instances SET command_sequence=command_sequence+1 WHERE id=rt.id RETURNING command_sequence INTO next_seq;
 command_body:=jsonb_build_object('schema','sophia.runtime-command.v1','commandId',rc_id,
  'binding',jsonb_build_object('projectId',p_project,'goalId',g.id,'goalRevision',g.revision,'attemptId',b.attempt_id,
   'resourceId',b.resource_id,'authorityEpoch',o.authority_epoch,'runtimeUnitId',b.runtime_unit_id),
  'kind',kind,'expectedNativeSessionId',CASE WHEN kind='resume' THEN to_jsonb(b.native_session_id) ELSE 'null'::jsonb END,
  'contextPacketId',CASE WHEN kind='create' THEN to_jsonb((SELECT input_source_id::text FROM sophia.jobs WHERE project_id=p_project AND command_id=c.id)) ELSE 'null'::jsonb END,
  'payload',payload);
 INSERT INTO sophia.runtime_commands(project_id,runtime_id,seq,id,outbox_id,command_id,binding_id,attempt_id,kind,authority_epoch,body)
 VALUES(p_project,rt.id,next_seq,rc_id,o.id,c.id,b.id,b.attempt_id,kind,o.authority_epoch,command_body);
 UPDATE sophia.outbox SET state='acknowledged', lease_until=NULL, outcome_reason=NULL WHERE project_id=p_project AND id=p_outbox;
 UPDATE sophia.commands SET state='dispatching' WHERE project_id=p_project AND id=c.id AND state='admitted';
 IF kind='create' THEN
  UPDATE sophia.execution_bindings SET state='launching' WHERE project_id=p_project AND id=b.id AND state='created';
  UPDATE sophia.jobs SET reason=NULL WHERE project_id=p_project AND command_id=c.id AND state='pending'
   AND (reason LIKE 'waiting for Sophia''s runtime%' OR reason LIKE 'waiting for the research worker%');
 END IF;
 RETURN jsonb_build_object('result','enqueued','runtimeId',rt.id,'seq',next_seq,'runtimeCommandId',rc_id);
END $$;

-- --- privileges ------------------------------------------------------------------------------------------------------
-- Replaced functions keep their grants (CREATE OR REPLACE). The new helpers are reachable only through the SECURITY
-- DEFINER functions that call them; the evidence tables are readable by no application role.
REVOKE ALL ON FUNCTION sophia.research_call_count_ok(text,bigint), sophia.research_call_append_only(),
 sophia.research_evidence_guard_transition(), sophia.research_call_request(jsonb), sophia.research_call_contract_check(text,text,text),
 sophia.research_evidence_guard_read(uuid), sophia.research_call_binding(uuid,uuid,uuid),
 sophia.research_model_gate(uuid,uuid,uuid,text,numeric,boolean), sophia.research_call_bound(uuid,uuid),
 sophia.research_call_identify(uuid,sophia.research_reservations,jsonb,text,jsonb,text,jsonb),
 sophia.research_call_replay(uuid,sophia.research_reservations,jsonb), sophia.research_call_ack(uuid,uuid),
 sophia.research_call_link(uuid,sophia.research_reservations,jsonb), sophia.research_call_reply(uuid,sophia.research_reservations,jsonb),
 sophia.research_call_design_route(sophia.design_scope), sophia.research_call_count(jsonb,boolean),
 sophia.research_call_facts(sophia.research_call_identities,jsonb), sophia.research_call_count_merge(text,bigint,text,bigint),
 sophia.research_call_compare(sophia.research_call_truth,sophia.research_call_fact),
 sophia.research_call_restrict_allowance(sophia.research_call_identities),
 sophia.research_call_money(sophia.research_reservations,sophia.research_call_fact,jsonb),
 sophia.research_call_retain(sophia.research_call_truth,sophia.research_call_fact,text),
 sophia.research_call_extend(sophia.research_call_identities,sophia.research_call_truth,sophia.research_call_fact),
 sophia.research_call_fact_digest(sophia.research_call_identities,sophia.research_call_fact),
 sophia.research_call_settle(uuid,uuid,jsonb) FROM PUBLIC;

COMMIT;
