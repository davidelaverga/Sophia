-- INC04-S02a (SOPHIA-INC-2026-11, INC-04 S02; INC04-R04/R06/R07/R08/R10): the explicit pinned contributed-API research
-- admission becomes the atomic boundary on the ONE existing inventory and ledger. Plan: docs/plans/atomic-admission.md.
-- Root allocated 0105 for this candidate; no amendment, no contract or generated change. 0001-0104 are not edited.
-- * Lineage: one funding lineage is (project_id, allowance_id) of api_contribution_tasks: an amendment reuses the allowance
--   (0094) and a rebuild copies the binding (0100); its grant never changes (lineage_funding_mixed).
-- * One immutable original cumulative ceiling (C02): admission of a new lineage freezes the grant's task cap on the binding;
--   an amendment or rebuild copies the ORIGINAL. The current grant task cap may only narrow it (never credit). A binding
--   admitted before 0105 has none: its original cap is proven only while every binding of the lineage carries the grant's
--   current revision (contribution_store, the only writer of a grant in 0001-0104, advances revision with every setting);
--   otherwise the lineage is held (lineage_cap_unproven) for a new admission, rebuilt delivery or paid model call, while
--   observation, settlement, Stop, erasure and replay stay available. Nothing is backfilled.
-- * Holds (C01, C03): an open lineage (a binding whose job is pending, running or outcome_unknown) with a FUNDED claim, or
--   a proven legacy binding, holds greatest(effective ceiling - its actual contributed commitment, 0), once per lineage.
--   Amounts are always derived from the existing ledgers (contribution_commit); nothing is stored but the claim's state.
--   Actual reserved, uncertain and settled reservations stay committed independently: a terminal job drops only the
--   UNUSED promise, because research_scope_of (0025) refuses every new reservation of an ended job. Only
--   end_research_reservation evidence ends a reservation.
-- * Claims (C01): api_contribution_claims distinguishes a funded promise from an unfunded successor. Admission inserts
--   funded; a rebuild (inside source withdrawal, revocation or Stop) inserts unfunded and takes no account lock, so those
--   always commit. A rebuilt successor REACQUIRES its remainder only at the writable dispatch of its create
--   (dispatch_runtime_outbox, marked S02A-FUND) under the account lock, or is denied (withheld); eligibility reads,
--   readiness views and fences only evaluate. A paid call of an unfunded claim is refused. The only transition is
--   unfunded -> funded.
-- * Arithmetic (C03): totals are actual commitments + other lineages' holds + this lineage's own after-value, counted
--   once: cap 1, committed 0.7: the lineage counts 1; a 0.1 call makes 0.8 committed + 0.2 held, still 1. The 0104
--   preview helper selection_protection_at keeps its full-new meaning; admission uses explicit after-values.
-- * Final instant (C04): the exact live account qualification row is locked FOR SHARE last; then one clock_timestamp()
--   decides grant, global route, that row, protection, identity and money; exactly those facts are frozen. A new paid
--   model call rechecks the CURRENT qualification and protection the same way; dispatch rechecks the current qualification.
-- * Identity (C06): only typed recorded facts. owner_declared (one root, or an owner-declared separate root) is admitted;
--   unknown provenance is held (account_identity_unresolved) for this pinned admission and new paid calls: no scoped
--   owner-approved conservative group policy exists. No label or note text is read; unrecorded real-world duplicates of
--   one provider account across roots cannot be detected.
-- * Unknown effects: an account with an uncertain contributed reservation or outcome_unknown contributed job admits no new
--   work and reacquires no successor (uncertain_effects_unreconciled); a running lineage's in-cap call is not blocked.
-- * The binding is immutable (INSERT only). Seven functions are replaced with their bodies unchanged except the lines
--   marked 0105; their security and grants are kept.
BEGIN;

-- --- frozen admission facts and the claim -------------------------------------------------------------------------------

ALTER TABLE sophia.api_contribution_tasks
 ADD COLUMN lineage_cap_usd numeric(12,6) CHECK(lineage_cap_usd IS NULL OR lineage_cap_usd>0),
 ADD COLUMN account_revision bigint,
 ADD COLUMN account_provenance text CHECK(account_provenance IS NULL OR account_provenance IN ('owner_declared','unknown')),
 ADD COLUMN account_qualification_id uuid,
 ADD COLUMN account_qualification_revision bigint,
 ADD COLUMN protection_witness text CHECK(protection_witness IS NULL OR protection_witness IN ('none_applicable','preserves_protected')),
 ADD COLUMN checked_at timestamptz,
 -- All or none: a binding admitted under 0105 (or copied from one) carries every checked fact; a legacy one none.
 ADD CONSTRAINT api_contribution_tasks_checked_facts CHECK(
  (lineage_cap_usd IS NULL AND account_revision IS NULL AND account_provenance IS NULL AND account_qualification_id IS NULL
   AND account_qualification_revision IS NULL AND protection_witness IS NULL AND checked_at IS NULL)
  OR (lineage_cap_usd IS NOT NULL AND account_revision IS NOT NULL AND account_provenance IS NOT NULL
   AND account_qualification_id IS NOT NULL AND account_qualification_revision IS NOT NULL AND protection_witness IS NOT NULL
   AND checked_at IS NOT NULL));
CREATE INDEX api_contribution_tasks_by_lineage ON sophia.api_contribution_tasks(project_id,allowance_id);

-- The binding is a record of what was admitted: INSERT only. No current path updates or deletes it, and no foreign key
-- cascades into it; settlement, erasure and withdrawal never write it.
CREATE FUNCTION sophia.contribution_binding_frozen() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 RAISE EXCEPTION 'A contribution binding is immutable: its funding facts are frozen at admission' USING ERRCODE='55000';
END $$;
CREATE TRIGGER api_contribution_tasks_frozen BEFORE UPDATE OR DELETE ON sophia.api_contribution_tasks
 FOR EACH ROW EXECUTE FUNCTION sophia.contribution_binding_frozen();

-- Whether one binding's promise is funded. Not a balance: no amount is stored. A legacy binding has no claim.
CREATE TABLE sophia.api_contribution_claims (
 project_id uuid NOT NULL, job_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('funded','unfunded')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), funded_at timestamptz,
 PRIMARY KEY(project_id,job_id), FOREIGN KEY(project_id,job_id) REFERENCES sophia.api_contribution_tasks(project_id,job_id),
 CHECK((state='funded')=(funded_at IS NOT NULL))
);
ALTER TABLE sophia.api_contribution_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.api_contribution_claims FROM PUBLIC;

-- The one transition: an unfunded successor that reacquired its remainder. Nothing else changes or disappears.
CREATE FUNCTION sophia.contribution_claim_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.state='unfunded' AND NEW.state='funded' AND NEW.funded_at IS NOT NULL
    AND NEW.project_id=OLD.project_id AND NEW.job_id=OLD.job_id AND NEW.created_at=OLD.created_at THEN
  RETURN NEW; END IF;
 RAISE EXCEPTION 'A contribution claim only moves from unfunded to funded' USING ERRCODE='55000';
END $$;
CREATE TRIGGER api_contribution_claims_transition BEFORE UPDATE OR DELETE ON sophia.api_contribution_claims
 FOR EACH ROW EXECUTE FUNCTION sophia.contribution_claim_transition();

-- --- private ledger derivations (reachable only through the SECURITY DEFINER functions that call them) ----------------

-- What one lineage has committed under its grant: the same sum the task-cap check reads (0094/0100).
CREATE FUNCTION sophia.contribution_lineage_committed(p_project uuid, p_allowance uuid, p_grant uuid) RETURNS numeric
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(sum(sophia.contribution_commit(r)),0) FROM sophia.api_contribution_reservations x
  JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id
  WHERE r.project_id=p_project AND r.allowance_id=p_allowance AND x.grant_id=p_grant $$;

-- A lineage's ORIGINAL contributed ceiling: the frozen cap of its first binding admitted under 0105 (every later binding
-- copies it), or, for a lineage admitted before 0105, the grant's cap while every binding of the lineage still carries
-- the grant's current revision. NULL: not provable (C02). Never the current grant's cap otherwise.
CREATE FUNCTION sophia.contribution_lineage_ceiling(p_project uuid, p_allowance uuid) RETURNS numeric
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(
  (SELECT t.lineage_cap_usd FROM sophia.api_contribution_tasks t WHERE t.project_id=p_project AND t.allowance_id=p_allowance
    AND t.lineage_cap_usd IS NOT NULL ORDER BY t.checked_at, t.created_at, t.job_id LIMIT 1),
  (SELECT CASE WHEN bool_and(t.grant_revision=gr.revision AND t.grant_id=gr.id) THEN min(gr.task_cap_usd) END
    FROM sophia.api_contribution_tasks t JOIN sophia.api_contribution_grants gr ON gr.id=t.grant_id
    WHERE t.project_id=p_project AND t.allowance_id=p_allowance)) $$;

-- The holds of every OPEN, FUNDED (or proven legacy) lineage of an account, optionally of one grant, except one lineage:
-- greatest(least(original ceiling, current task cap) - actual lineage commitment, 0), counted once per lineage. An
-- unprovable legacy lineage holds nothing (it can make no new paid call); an unfunded successor holds nothing.
CREATE FUNCTION sophia.contribution_lineage_holds(p_account uuid, p_grant uuid, p_except_project uuid, p_except_allowance uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(sum(CASE WHEN c.ceiling IS NULL THEN 0
   ELSE greatest(least(c.ceiling,gr.task_cap_usd)-sophia.contribution_lineage_committed(l.project_id,l.allowance_id,l.grant_id),0) END),0)
 FROM (SELECT DISTINCT t.project_id, t.allowance_id, t.grant_id FROM sophia.api_contribution_tasks t
   JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
   LEFT JOIN sophia.api_contribution_claims k ON k.project_id=t.project_id AND k.job_id=t.job_id
   WHERE t.account_id=p_account AND (p_grant IS NULL OR t.grant_id=p_grant)
    AND NOT (t.project_id IS NOT DISTINCT FROM p_except_project AND t.allowance_id IS NOT DISTINCT FROM p_except_allowance)
    AND j.state IN ('pending','running','outcome_unknown')
    AND (k.state='funded' OR (k.job_id IS NULL AND t.lineage_cap_usd IS NULL))) l
 JOIN sophia.api_contribution_grants gr ON gr.id=l.grant_id
 CROSS JOIN LATERAL (SELECT sophia.contribution_lineage_ceiling(l.project_id,l.allowance_id) AS ceiling) c $$;

-- Actual commitments (every project and alias) of an account, or of one grant: reserved and uncertain at the reserved
-- amount, settled at cost (0094 contribution_commit). Project-paid search and read are not here.
CREATE FUNCTION sophia.contribution_committed(p_account uuid, p_grant uuid) RETURNS numeric LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(sum(sophia.contribution_commit(r)),0) FROM sophia.api_contribution_reservations x
  JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id
  WHERE x.account_id=p_account AND (p_grant IS NULL OR x.grant_id=p_grant) $$;

-- An unreconciled possible effect anywhere on the account: an uncertain contributed reservation or outcome_unknown job.
CREATE FUNCTION sophia.contribution_account_uncertain(p_account uuid) RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.api_contribution_reservations x JOIN sophia.research_reservations r
   ON r.project_id=x.project_id AND r.id=x.reservation_id WHERE x.account_id=p_account AND r.state='uncertain')
  OR EXISTS(SELECT 1 FROM sophia.api_contribution_tasks t JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
   WHERE t.account_id=p_account AND j.state='outcome_unknown') $$;

-- Totals after an operation on one lineage (C03): actual commitments, other lineages' holds, and this lineage counted
-- once at p_own_after (its actual commitment plus remaining promise after the operation) instead of its actual one.
CREATE FUNCTION sophia.contribution_totals_after(p_account uuid, p_grant uuid, p_project uuid, p_allowance uuid,
 p_own_committed numeric, p_own_after numeric, OUT account_after numeric, OUT grant_after numeric)
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.contribution_committed(p_account,NULL)-p_own_committed+p_own_after
   +sophia.contribution_lineage_holds(p_account,NULL,p_project,p_allowance),
  sophia.contribution_committed(p_account,p_grant)-p_own_committed+p_own_after
   +sophia.contribution_lineage_holds(p_account,p_grant,p_project,p_allowance) $$;

-- The owner's protection at an explicit instant and explicit after-values (C03/C04): absent, not yet valid, expired or not
-- exactly this scope is policy_absent; none_applicable as declared; protected refuses an operation that leaves fewer
-- than the declared slots or spend free. (selection_protection_at, 0104, keeps its preview meaning: one more new task.)
CREATE FUNCTION sophia.contribution_protection_refusal(acc sophia.api_accounts, gr sophia.api_contribution_grants,
 p_slots_after integer, p_spend_after numeric, p_now timestamptz) RETURNS text LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE
  WHEN acc.protection_applicability IS NULL OR acc.protection_declared_at>p_now
    OR (acc.protection_valid_until IS NOT NULL AND acc.protection_valid_until<=p_now)
    OR acc.protection_operations IS DISTINCT FROM '{research}'::text[] OR acc.protection_roles IS DISTINCT FROM '{sophia-research-md-v1}'::text[]
    OR NOT gr.operation=ANY(acc.protection_operations) OR NOT gr.role_id=ANY(acc.protection_roles)
   THEN 'protection_policy_absent'
  WHEN acc.protection_applicability='none_applicable' THEN NULL
  WHEN acc.protected_concurrency IS NOT NULL AND p_slots_after>acc.concurrency_limit-acc.protected_concurrency THEN 'reserve_protected'
  WHEN acc.protected_spend_usd IS NOT NULL AND p_spend_after>acc.total_cap_usd-acc.protected_spend_usd THEN 'reserve_protected'
  ELSE NULL END $$;

-- The exact live account qualification row of a connection's CURRENT credential revision and settings, locked FOR SHARE
-- (always the last lock taken): a revocation waits for this transaction, or this read skips a row revoked meanwhile.
CREATE FUNCTION sophia.contribution_lock_account_qualification(conn sophia.api_connections)
RETURNS sophia.api_account_qualifications LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE q sophia.api_account_qualifications;
BEGIN
 SELECT * INTO q FROM sophia.api_account_qualifications WHERE connection_id=conn.id AND account_id=conn.account_id
  AND credential_revision=conn.credential_revision AND route_id=conn.route_id AND model=conn.model AND effort=conn.effort
  AND revoked_at IS NULL ORDER BY observed_at DESC, id DESC LIMIT 1 FOR SHARE;
 RETURN q;
END $$;

-- Why that row does not qualify the connection for research at p_now, or NULL.
CREATE FUNCTION sophia.contribution_qualification_refusal(q sophia.api_account_qualifications, conn sophia.api_connections,
 p_now timestamptz) RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN q.id IS NULL OR q.revoked_at IS NOT NULL OR q.observed_at>p_now OR q.expires_at<=p_now
   OR NOT ('research'=ANY(q.operations)) OR q.connection_id<>conn.id OR q.account_id<>conn.account_id
   OR q.credential_revision<>conn.credential_revision OR q.route_id<>conn.route_id OR q.model<>conn.model OR q.effort<>conn.effort
  THEN 'account_unqualified' ELSE NULL END $$;

-- Typed identity facts only (C06): an owner_declared root (one root, or an owner-declared separate root) is resolved;
-- unknown provenance is not, and no scoped owner-approved conservative group policy exists to admit it.
CREATE FUNCTION sophia.contribution_identity_refusal(acc sophia.api_accounts) RETURNS text LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN acc.provenance='owner_declared' THEN NULL ELSE 'account_identity_unresolved' END $$;

-- --- admission (C01-C06) ---------------------------------------------------------------------------------------------

-- contribution_admission (0094), replaced: the same, then after the account row (every admission and reservation of the
-- account, across projects and aliases) identity, unknown effects and the lineage's original ceiling; the exact
-- qualification row last; then ONE instant decides time-bound authority, qualification, money and protection, and the
-- checked facts are handed to contribution_bind_task in this transaction.
CREATE OR REPLACE FUNCTION sophia.contribution_admission(p_project uuid, p_actor uuid, pin sophia.research_funding_pins, p_role text,
 p_route text, p_outputs jsonb, p_base_job uuid) RETURNS sophia.api_contribution_grants LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE gr sophia.api_contribution_grants; conn sophia.api_connections; acc sophia.api_accounts; why text; base sophia.api_contribution_tasks;
 q sophia.api_account_qualifications; v_now timestamptz; v_ceiling numeric; v_cap numeric; v_own numeric:=0; v_need numeric; -- 0105
 v_after record; v_slots integer; v_allowance uuid; -- 0105
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
 -- 0105: the exact qualification row, locked last; every check below reads after this final wait, at one instant.
 q:=sophia.contribution_lock_account_qualification(conn);
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
 -- 0105: exactly the facts checked here, for contribution_bind_task in this transaction (never a later lookup).
 PERFORM set_config('sophia.contribution_admission',jsonb_build_object('grantId',gr.id,'actorId',p_actor,'project',p_project,
  'lineageCap',v_ceiling,'accountRevision',acc.revision,'provenance',acc.provenance,'qualificationId',q.id,
  'qualificationRevision',q.revision,'witness',CASE acc.protection_applicability WHEN 'none_applicable' THEN 'none_applicable'
   ELSE 'preserves_protected' END,'checkedAt',v_now)::text,true);
 RETURN gr;
END $$;

-- contribution_bind_task (0094), replaced: the same row, plus the facts contribution_admission checked in this
-- transaction (refused if they are missing or name another grant, actor or project), and a FUNDED claim.
CREATE OR REPLACE FUNCTION sophia.contribution_bind_task(p_project uuid, p_job uuid, p_allowance uuid, p_actor uuid,
 gr sophia.api_contribution_grants, rt sophia.runtime_instances) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE conn sophia.api_connections; f jsonb:=nullif(current_setting('sophia.contribution_admission',true),'')::jsonb; -- 0105
BEGIN
 IF f IS NULL OR (f->>'grantId')::uuid IS DISTINCT FROM gr.id OR (f->>'actorId')::uuid IS DISTINCT FROM p_actor
    OR (f->>'project')::uuid IS DISTINCT FROM p_project THEN -- 0105
  RAISE EXCEPTION 'A contribution is bound only with the facts its admission checked' USING ERRCODE='55000'; END IF;
 SELECT * INTO conn FROM sophia.api_connections WHERE id=gr.connection_id;
 INSERT INTO sophia.api_contribution_tasks(project_id,job_id,allowance_id,grant_id,grant_revision,connection_id,credential_revision,
  account_id,owner_id,requester_id,resource_id,requested_route,requested_model,requested_effort,
  lineage_cap_usd,account_revision,account_provenance,account_qualification_id,account_qualification_revision, -- 0105
  protection_witness,checked_at) -- 0105
 VALUES(p_project,p_job,p_allowance,gr.id,gr.revision,conn.id,conn.credential_revision,conn.account_id,gr.owner_id,p_actor,
  rt.resource_id,gr.route_id,gr.model,gr.effort,
  (f->>'lineageCap')::numeric,(f->>'accountRevision')::bigint,f->>'provenance',(f->>'qualificationId')::uuid, -- 0105
  (f->>'qualificationRevision')::bigint,f->>'witness',(f->>'checkedAt')::timestamptz); -- 0105
 INSERT INTO sophia.api_contribution_claims(project_id,job_id,state,funded_at) VALUES(p_project,p_job,'funded',(f->>'checkedAt')::timestamptz); -- 0105
 PERFORM set_config('sophia.contribution_admission','',true); -- 0105: used once
END $$;

-- contribution_rebuild_bind (0100), replaced: the same exact copy of the original frozen binding, every 0105 fact
-- included, and an UNFUNDED claim: the successor reacquires its remainder at dispatch. No lock is taken and nothing is
-- decided here, so the erasure, revocation and Stop that rebuild always commit (C01, C07).
CREATE OR REPLACE FUNCTION sophia.contribution_rebuild_bind(p_project uuid, p_old_job uuid, p_new_job uuid) RETURNS void LANGUAGE sql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 WITH ins AS (
  INSERT INTO sophia.api_contribution_tasks(project_id,job_id,allowance_id,grant_id,grant_revision,connection_id,credential_revision,
   account_id,owner_id,requester_id,resource_id,requested_route,requested_model,requested_effort,
   lineage_cap_usd,account_revision,account_provenance,account_qualification_id,account_qualification_revision, -- 0105
   protection_witness,checked_at) -- 0105
  SELECT x.project_id,p_new_job,x.allowance_id,x.grant_id,x.grant_revision,x.connection_id,x.credential_revision,x.account_id,
   x.owner_id,x.requester_id,x.resource_id,x.requested_route,x.requested_model,x.requested_effort,
   x.lineage_cap_usd,x.account_revision,x.account_provenance,x.account_qualification_id,x.account_qualification_revision, -- 0105
   x.protection_witness,x.checked_at -- 0105
  FROM sophia.api_contribution_tasks x WHERE x.project_id=p_project AND x.job_id=p_old_job
  ON CONFLICT (project_id,job_id) DO NOTHING
  RETURNING project_id, job_id)
 INSERT INTO sophia.api_contribution_claims(project_id,job_id,state) SELECT project_id,job_id,'unfunded' FROM ins -- 0105
 ON CONFLICT (project_id,job_id) DO NOTHING $$;

-- 0105: whether a rebuilt successor's lineage can (re)fund its remainder now (C01): identity, unknown effects, original
-- ceiling, time-bound authority, current qualification, money and protection, at one instant. With p_write (only from
-- contribution_dispatch_fund, at the writable dispatch of its create, after the grant, connection and account locks)
-- the exact qualification row is locked last and the claim becomes funded. NULL: funded, or it would fund.
CREATE FUNCTION sophia.contribution_reacquire(t sophia.api_contribution_tasks, p_write boolean) RETURNS text LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE k sophia.api_contribution_claims; gr sophia.api_contribution_grants; conn sophia.api_connections; acc sophia.api_accounts;
 q sophia.api_account_qualifications; v_now timestamptz; v_ceiling numeric; v_own numeric; v_after record; why text;
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
 IF p_write THEN
  UPDATE sophia.api_contribution_claims SET state='funded', funded_at=v_now WHERE project_id=t.project_id AND job_id=t.job_id;
 END IF;
 RETURN NULL;
END $$;

-- 0105: the writable acquisition, called only by dispatch_runtime_outbox (S02A-FUND) for the create it is about to send,
-- after native_delivery_ineligible and runtime_unavailable. Admission's lock order after the project (already held):
-- grant, connection, account, then (in contribution_reacquire) the exact qualification row. NULL: nothing to acquire,
-- or acquired; otherwise why the successor is withheld.
CREATE FUNCTION sophia.contribution_dispatch_fund(b sophia.execution_bindings) RETURNS text LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks; why text;
BEGIN
 SELECT x.* INTO t FROM sophia.api_contribution_tasks x JOIN sophia.jobs j ON j.project_id=x.project_id AND j.id=x.job_id
  WHERE j.project_id=b.project_id AND j.attempt_id=b.attempt_id;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM sophia.api_contribution_claims k WHERE k.project_id=t.project_id AND k.job_id=t.job_id
   AND k.state='unfunded') THEN RETURN NULL; END IF;
 PERFORM 1 FROM sophia.api_contribution_grants WHERE id=t.grant_id FOR SHARE;
 PERFORM 1 FROM sophia.api_connections WHERE id=t.connection_id FOR SHARE;
 PERFORM 1 FROM sophia.api_accounts WHERE id=t.account_id FOR UPDATE;
 why:=sophia.contribution_reacquire(t,true);
 RETURN CASE WHEN why IS NULL THEN NULL ELSE 'its contribution cannot fund its remainder: '||why END;
END $$;

-- contribution_delivery_ineligible (0100), replaced: the same, then the account's CURRENT qualification for every
-- contributed delivery of new work (C04), and whether a rebuilt unfunded successor's remainder could be funded now (C01,
-- an evaluation: it writes nothing; the claim is written only at the dispatch itself, S02A-FUND). Stop and retire are
-- never blocked here.
CREATE OR REPLACE FUNCTION sophia.contribution_delivery_ineligible(o sophia.outbox, b sophia.execution_bindings) RETURNS text LANGUAGE plpgsql VOLATILE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks; gr sophia.api_contribution_grants; conn sophia.api_connections; why text;
 acc sophia.api_accounts; rebuilt boolean; q sophia.api_account_qualifications; -- 0105
BEGIN
 IF o.destination NOT IN ('native.create','native.resume','native.steer') OR b.id IS NULL THEN RETURN NULL; END IF;
 SELECT x.* INTO t FROM sophia.api_contribution_tasks x JOIN sophia.jobs j ON j.project_id=x.project_id AND j.id=x.job_id
  WHERE j.project_id=b.project_id AND j.attempt_id=b.attempt_id;
 IF NOT FOUND THEN
  -- 0100: a contributed lineage without its binding (a rebuild before 0100) is never delivered as project work.
  IF EXISTS(SELECT 1 FROM sophia.jobs j WHERE j.project_id=b.project_id AND j.attempt_id=b.attempt_id
     AND sophia.contribution_lineage_unbound(j.project_id,j.id)) THEN
   RETURN 'its contributed lineage has no funding binding'; END IF;
  RETURN NULL;
 END IF;
 -- WRITE-004: a rebuilt task's slot is decided here. Under the project lock dispatch holds, a writable transaction takes
 -- its grant, connection and account rows in admission's order; every check below reads after that wait. A read-only
 -- transaction (a read) only reads.
 rebuilt:=sophia.contribution_rebuilt(t.project_id,t.job_id);
 IF rebuilt AND current_setting('transaction_read_only')='off' THEN
  PERFORM 1 FROM sophia.api_contribution_grants WHERE id=t.grant_id FOR SHARE;
  PERFORM 1 FROM sophia.api_connections WHERE id=t.connection_id FOR SHARE;
  PERFORM 1 FROM sophia.api_accounts WHERE id=t.account_id FOR UPDATE;
 END IF;
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=t.grant_id;
 why:=sophia.contribution_grant_unusable(gr);
 IF why IS NOT NULL THEN RETURN 'its contribution is unusable: '||why; END IF;
 IF gr.revision<>t.grant_revision THEN RETURN 'its contribution grant changed since it was admitted'; END IF;
 IF NOT sophia.contribution_requester_eligible(gr,t.requester_id) THEN RETURN 'its requester can no longer use this contribution'; END IF;
 IF NOT sophia.contribution_member(t.project_id,t.owner_id,false) THEN RETURN 'the contribution owner is no longer a project member'; END IF;
 SELECT * INTO conn FROM sophia.api_connections WHERE id=t.connection_id;
 IF conn.state<>'connected' OR conn.credential_revision<>t.credential_revision THEN
  RETURN 'its contribution''s credential is no longer the one it was admitted with'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.api_contribution_runtimes x WHERE x.project_id=t.project_id AND x.resource_id=t.resource_id AND x.state='current') THEN
  RETURN 'its contribution runtime was rotated'; END IF;
 IF NOT sophia.contribution_route_qualified(gr.route_id,gr.model,gr.effort) THEN RETURN 'its contribution is unusable: route_unqualified'; END IF;
 IF rebuilt THEN
  SELECT * INTO acc FROM sophia.api_accounts WHERE id=t.account_id;
  CASE sophia.contribution_rebuild_capacity(t,acc,gr)
   WHEN 'account' THEN RETURN 'its contribution''s account capacity is held by earlier work';
   WHEN 'grant' THEN RETURN 'its contribution''s grant capacity is held by earlier work';
   ELSE NULL;
  END CASE;
  -- 0105: an unfunded successor is judged as its dispatch would fund it; only dispatch_runtime_outbox writes the claim.
  why:=sophia.contribution_reacquire(t,false);
  IF why IS NOT NULL THEN RETURN 'its contribution cannot fund its remainder: '||why; END IF;
 END IF;
 -- 0105: the account's own qualification, current now (an admission's witness is not perpetual authorization).
 SELECT * INTO q FROM sophia.api_account_qualifications WHERE connection_id=conn.id AND account_id=conn.account_id
  AND credential_revision=conn.credential_revision AND route_id=conn.route_id AND model=conn.model AND effort=conn.effort
  AND revoked_at IS NULL ORDER BY observed_at DESC, id DESC LIMIT 1;
 IF sophia.contribution_qualification_refusal(q,conn,clock_timestamp()) IS NOT NULL THEN
  RETURN 'its contribution''s account is not currently qualified'; END IF;
 RETURN NULL;
END $$;

-- contribution_model_reserve (0100), replaced: the same, then (after the account row) a funded claim, typed identity and
-- the lineage's original ceiling; the current qualification row last; then ONE instant decides time-bound authority,
-- qualification, the per-lineage ceiling (least of original and current), money counted once (C03) and the owner's
-- CURRENT protection (C04). A replay of an existing reservation never reaches this (runtime_research_reserve).
CREATE OR REPLACE FUNCTION sophia.contribution_model_reserve(s sophia.research_scope, p_provider text, p_amount numeric) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks; gr sophia.api_contribution_grants; conn sophia.api_connections; acc sophia.api_accounts; why text;
 used numeric; k sophia.api_contribution_claims; q sophia.api_account_qualifications; v_now timestamptz; v_ceiling numeric; -- 0105
 v_after record; -- 0105
BEGIN
 SELECT * INTO t FROM sophia.api_contribution_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 IF NOT FOUND THEN
  -- 0100: no new paid call for a contributed lineage without its binding; nothing else would bound it.
  IF sophia.contribution_lineage_unbound(s.project_id,s.job_id) THEN PERFORM sophia.contribution_refuse('lineage_unbound'); END IF;
  RETURN;
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
 SELECT * INTO k FROM sophia.api_contribution_claims WHERE project_id=t.project_id AND job_id=t.job_id;
 IF FOUND AND k.state<>'funded' THEN PERFORM sophia.contribution_refuse('lineage_unfunded'); END IF;
 why:=sophia.contribution_identity_refusal(acc); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 v_ceiling:=sophia.contribution_lineage_ceiling(t.project_id,t.allowance_id);
 IF v_ceiling IS NULL THEN PERFORM sophia.contribution_refuse('lineage_cap_unproven'); END IF;
 -- 0105: the current qualification row, locked last; everything below is judged after it, at one instant.
 q:=sophia.contribution_lock_account_qualification(conn);
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
END $$;

-- --- the trusted preview's money facts (C05) -------------------------------------------------------------------------

-- selection_api_candidate (0104), replaced: the same, and the account and grant commitments include every open funded
-- lineage's remaining promise (contribution_lineage_holds), so promised money is never shown free. Still one more NEW
-- task (selection_protection_at keeps its meaning); no new field is returned.
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
  'protection',sophia.selection_protection_at(acc,gr,slots,committed,p_now));
END $$;

-- --- the one writable dispatch (C01) -----------------------------------------------------------------------------------

-- dispatch_runtime_outbox: latest 0075 byte for byte, plus S02A-FUND.
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
  IF o.destination='native.create' THEN
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
-- DEFINER functions that call them; the claim table is readable by no application role.
REVOKE ALL ON FUNCTION sophia.contribution_binding_frozen(), sophia.contribution_claim_transition(),
 sophia.contribution_lineage_committed(uuid,uuid,uuid), sophia.contribution_lineage_ceiling(uuid,uuid),
 sophia.contribution_lineage_holds(uuid,uuid,uuid,uuid), sophia.contribution_committed(uuid,uuid),
 sophia.contribution_account_uncertain(uuid),
 sophia.contribution_totals_after(uuid,uuid,uuid,uuid,numeric,numeric),
 sophia.contribution_protection_refusal(sophia.api_accounts,sophia.api_contribution_grants,integer,numeric,timestamptz),
 sophia.contribution_lock_account_qualification(sophia.api_connections),
 sophia.contribution_qualification_refusal(sophia.api_account_qualifications,sophia.api_connections,timestamptz),
 sophia.contribution_identity_refusal(sophia.api_accounts),
 sophia.contribution_reacquire(sophia.api_contribution_tasks,boolean),
 sophia.contribution_dispatch_fund(sophia.execution_bindings) FROM PUBLIC;

COMMIT;
