-- INC04-S01b (SOPHIA-INC-2026-11, INC-04 S01; C01, C03), contract amendment A56: the trusted read-only selection
-- preview's snapshot, and the two owner/operator facts a legitimate positive preview needs. docs/plans/selection-preview.md.
-- * Owner protection (root RC2): nullable, owner-declared fields on the existing accounting root (api_accounts). NULL is
--   no declaration, so policy_absent. No default, no backfill. `none_applicable` is the owner's explicit scoped decision
--   for exactly {research}/{sophia-research-md-v1}; `protected` keeps owner-entered slots and/or spend free. Written
--   only through the existing owner write (api_contribution_write → api_account_update, replaced here with one more
--   patch key); a cap edit that conflicts with a declared amount is refused as any invalid account is.
-- * Account qualification: an operator's record that one account's connection, at one credential revision, was verified
--   for a route, model, effort and operation on evidence kept outside the database. Migration owner only, like 0092/0094
--   qualifications. Recording it qualifies nothing by itself; the global route qualification is still required, and a
--   credential rotation stales it.
-- * selection_snapshot: one actor-checked read, sophia_api only, under the caller's REPEATABLE READ READ ONLY
--   transaction. Its first statement fixes one instant (clock_timestamp), and every expiry and freshness is judged from
--   raw columns at that instant by private at-time helpers that restate the existing rules. The existing VOLATILE
--   admission helpers are not called and not changed. It returns server-internal facts: states, booleans, ids and
--   revisions; never an amount, label, eligible list, other member's pin, evidence reference or credential.
-- * Capacity (root D3/RC1/RC3): the owner's bounded_total_spend grant, judged on the existing ledgers only
--   (contribution_commit, contribution_slots_held, the project allowances): grant total, account total across every
--   project and alias, account and grant slots, and the project's non-model budget, each against the prospective task's
--   cap. Free slots never overcome exhausted money. Any uncertain effect of the account is reported.
-- * The pool: the project's non-revoked API grants, the caller's pinned grant even if revoked, then its native resources.
--   A 201st row means more than 200: the snapshot is incomplete and lists none (RC4).
-- 0001-0102 are not edited. api_account_update and api_contributions_mine (0094) are replaced with the same signatures,
-- security and grants, unchanged except the lines marked 0104.
BEGIN;

-- --- owner protection on the accounting root -----------------------------------------------------------------------

ALTER TABLE sophia.api_accounts
 ADD COLUMN protection_applicability text CHECK(protection_applicability IN ('none_applicable','protected')),
 ADD COLUMN protection_operations text[] CHECK(protection_operations IS NULL OR protection_operations='{research}'::text[]),
 ADD COLUMN protection_roles text[] CHECK(protection_roles IS NULL OR protection_roles='{sophia-research-md-v1}'::text[]),
 ADD COLUMN protected_concurrency integer CHECK(protected_concurrency IS NULL OR protected_concurrency>=1),
 ADD COLUMN protected_spend_usd numeric(12,6) CHECK(protected_spend_usd IS NULL OR protected_spend_usd>0),
 ADD COLUMN protection_declared_at timestamptz,
 ADD COLUMN protection_valid_until timestamptz,
 ADD CONSTRAINT api_accounts_protection_whole CHECK(
  (protection_applicability IS NULL)=(protection_operations IS NULL)
  AND (protection_applicability IS NULL)=(protection_roles IS NULL)
  AND (protection_applicability IS NULL)=(protection_declared_at IS NULL)
  AND (protection_applicability IS NOT NULL
   OR (protected_concurrency IS NULL AND protected_spend_usd IS NULL AND protection_valid_until IS NULL))),
 ADD CONSTRAINT api_accounts_protection_none CHECK(
  protection_applicability IS DISTINCT FROM 'none_applicable' OR (protected_concurrency IS NULL AND protected_spend_usd IS NULL)),
 ADD CONSTRAINT api_accounts_protection_amount CHECK(
  protection_applicability IS DISTINCT FROM 'protected' OR protected_concurrency IS NOT NULL OR protected_spend_usd IS NOT NULL),
 ADD CONSTRAINT api_accounts_protection_within CHECK(
  (protected_concurrency IS NULL OR protected_concurrency<=concurrency_limit)
  AND (protected_spend_usd IS NULL OR protected_spend_usd<=total_cap_usd)),
 ADD CONSTRAINT api_accounts_protection_validity CHECK(
  protection_valid_until IS NULL OR protection_valid_until>protection_declared_at);

-- Why a protection declaration is not acceptable, or NULL. Exactly its fields, typed; amounts within the contract.
CREATE FUNCTION sophia.account_protection_refusal(p jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE k text;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RETURN 'a declaration is an object or null'; END IF;
 FOR k IN SELECT jsonb_object_keys(p) LOOP
  IF k NOT IN ('applicability','operations','roles','protectedConcurrency','protectedSpendUsd','validUntil') THEN
   RETURN 'unknown field '||k; END IF;
 END LOOP;
 IF NOT p ?& ARRAY['applicability','operations','roles'] THEN RETURN 'applicability, operations and roles are required'; END IF;
 IF p->'applicability' NOT IN ('"none_applicable"','"protected"') THEN RETURN 'unknown applicability'; END IF;
 IF p->'operations' IS DISTINCT FROM '["research"]'::jsonb THEN RETURN 'operations are exactly ["research"]'; END IF;
 IF p->'roles' IS DISTINCT FROM '["sophia-research-md-v1"]'::jsonb THEN RETURN 'roles are exactly ["sophia-research-md-v1"]'; END IF;
 IF p ? 'protectedConcurrency' AND (jsonb_typeof(p->'protectedConcurrency')<>'number'
    OR (p->>'protectedConcurrency') !~ '^[1-9][0-9]{0,3}$') THEN RETURN 'protectedConcurrency is a positive whole number'; END IF;
 IF p ? 'protectedSpendUsd' AND (jsonb_typeof(p->'protectedSpendUsd')<>'number'
    OR (p->>'protectedSpendUsd')::numeric<=0 OR (p->>'protectedSpendUsd')::numeric>10000) THEN
  RETURN 'protectedSpendUsd is a positive amount up to 10000'; END IF;
 IF p ? 'validUntil' AND jsonb_typeof(p->'validUntil')<>'null' AND (jsonb_typeof(p->'validUntil')<>'string'
    OR (p->>'validUntil') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$') THEN
  RETURN 'validUntil is an RFC 3339 time or null'; END IF;
 RETURN NULL;
END $$;

-- api_account_update (0094), replaced: the same, and the owner's protection declaration (0104).
CREATE OR REPLACE FUNCTION sophia.api_account_update(p_account uuid, p_expected_revision bigint, p_patch jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); acc sophia.api_accounts; k text;
 pr jsonb; pr_set boolean; pr_clear boolean; -- 0104
BEGIN
 SELECT * INTO acc FROM sophia.api_accounts WHERE id=p_account FOR UPDATE;
 IF a IS NULL OR NOT FOUND OR acc.owner_id<>a THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_expected_revision IS DISTINCT FROM acc.revision THEN RAISE EXCEPTION 'Stale contribution revision' USING ERRCODE='40001'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'Invalid API account' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
  IF k NOT IN ('label','totalCapUsd','concurrency','provenance','protection') THEN RAISE EXCEPTION 'Unknown account setting %', k USING ERRCODE='22023'; END IF; -- 0104: protection
 END LOOP;
 -- 0104: the declaration is replaced whole or withdrawn (JSON null); never merged with an earlier one.
 pr_set:=p_patch ? 'protection'; pr:=p_patch->'protection'; pr_clear:=pr_set AND jsonb_typeof(pr)='null';
 IF pr_set AND NOT pr_clear AND sophia.account_protection_refusal(pr) IS NOT NULL THEN
  RAISE EXCEPTION 'Invalid API account' USING ERRCODE='22023'; END IF;
 BEGIN
  UPDATE sophia.api_accounts SET label=coalesce(p_patch->>'label',label),
   total_cap_usd=coalesce((p_patch->>'totalCapUsd')::numeric,total_cap_usd),
   concurrency_limit=coalesce((p_patch->>'concurrency')::integer,concurrency_limit),
   provenance=coalesce(p_patch->>'provenance',provenance),
   -- 0104
   protection_applicability=CASE WHEN NOT pr_set THEN protection_applicability WHEN pr_clear THEN NULL ELSE pr->>'applicability' END,
   protection_operations=CASE WHEN NOT pr_set THEN protection_operations WHEN pr_clear THEN NULL
    ELSE ARRAY(SELECT jsonb_array_elements_text(pr->'operations')) END,
   protection_roles=CASE WHEN NOT pr_set THEN protection_roles WHEN pr_clear THEN NULL
    ELSE ARRAY(SELECT jsonb_array_elements_text(pr->'roles')) END,
   protected_concurrency=CASE WHEN NOT pr_set THEN protected_concurrency WHEN pr_clear THEN NULL
    ELSE (pr->>'protectedConcurrency')::integer END,
   protected_spend_usd=CASE WHEN NOT pr_set THEN protected_spend_usd WHEN pr_clear THEN NULL
    ELSE (pr->>'protectedSpendUsd')::numeric END,
   protection_declared_at=CASE WHEN NOT pr_set THEN protection_declared_at WHEN pr_clear THEN NULL ELSE now() END,
   protection_valid_until=CASE WHEN NOT pr_set THEN protection_valid_until WHEN pr_clear THEN NULL
    ELSE (pr->>'validUntil')::timestamptz END,
   revision=revision+1, updated_at=now()
  WHERE id=acc.id RETURNING * INTO acc;
 EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'Invalid API account' USING ERRCODE='22023';
  -- 0104: a validUntil of the right shape but no real time (a 13th month) is refused as any invalid account is.
  WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'Invalid API account' USING ERRCODE='22023';
 END;
 RETURN jsonb_build_object('accountId',acc.id,'revision',acc.revision);
END $$;

-- The owner's own view of their declaration (0104), or JSON null.
CREATE FUNCTION sophia.account_protection_view(x sophia.api_accounts) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN x.protection_applicability IS NULL THEN 'null'::jsonb ELSE jsonb_build_object(
  'applicability',x.protection_applicability,'operations',to_jsonb(x.protection_operations),'roles',to_jsonb(x.protection_roles),
  'protectedConcurrency',x.protected_concurrency,'protectedSpendUsd',x.protected_spend_usd,
  'declaredAt',x.protection_declared_at,'validUntil',x.protection_valid_until) END $$;


-- --- account-scoped qualification (operator) -----------------------------------------------------------------------

CREATE TABLE sophia.api_account_qualifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 account_id uuid NOT NULL, connection_id uuid NOT NULL, credential_revision bigint NOT NULL CHECK(credential_revision>0),
 route_id text NOT NULL, model text NOT NULL, effort text NOT NULL,
 operations text[] NOT NULL CHECK(cardinality(operations)>0 AND operations <@ ARRAY['research']::text[]),
 verification text NOT NULL CHECK(verification IN ('operator_verified_call','operator_verified_console')),
 -- A pointer to evidence kept outside the database; never a key, a provider response or a credential.
 evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref)) BETWEEN 1 AND 300),
 observed_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz, revoked_reason text CHECK(revoked_reason IS NULL OR length(btrim(revoked_reason)) BETWEEN 1 AND 300),
 recorded_by text NOT NULL DEFAULT 'operator' CHECK(recorded_by='operator'),
 FOREIGN KEY(connection_id) REFERENCES sophia.api_connections(id),
 FOREIGN KEY(account_id) REFERENCES sophia.api_accounts(id),
 CHECK(expires_at>observed_at), CHECK((revoked_at IS NULL)=(revoked_reason IS NULL))
);
CREATE UNIQUE INDEX api_account_qualifications_one_live ON sophia.api_account_qualifications(connection_id,credential_revision)
 WHERE revoked_at IS NULL;
ALTER TABLE sophia.api_account_qualifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.api_account_qualifications FROM PUBLIC;

-- Operator: record that one account's connection, at its CURRENT credential revision, was verified for its route, model,
-- effort and operations at p_observed_at, on evidence kept elsewhere. Migration owner only (EXECUTE granted to no role).
CREATE FUNCTION sophia.qualify_api_account(p_connection uuid, p_operations text[], p_verification text, p_evidence_ref text,
 p_observed_at timestamptz, p_expires_at timestamptz) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE conn sophia.api_connections; q sophia.api_account_qualifications;
BEGIN
 SELECT * INTO conn FROM sophia.api_connections WHERE id=p_connection FOR UPDATE;
 IF NOT FOUND OR conn.state='revoked' THEN RAISE EXCEPTION 'The connection is missing or revoked' USING ERRCODE='22023'; END IF;
 IF conn.credential_revision<1 THEN RAISE EXCEPTION 'The connection has no registered credential revision' USING ERRCODE='22023'; END IF;
 IF p_observed_at IS NULL OR p_observed_at>clock_timestamp() THEN
  RAISE EXCEPTION 'An observation cannot be in the future' USING ERRCODE='22023'; END IF;
 BEGIN
  INSERT INTO sophia.api_account_qualifications(account_id,connection_id,credential_revision,route_id,model,effort,operations,
   verification,evidence_ref,observed_at,expires_at)
  VALUES(conn.account_id,conn.id,conn.credential_revision,conn.route_id,conn.model,conn.effort,p_operations,p_verification,
   p_evidence_ref,p_observed_at,p_expires_at) RETURNING * INTO q;
 EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'This credential revision already has a live qualification: revoke it first' USING ERRCODE='23505';
 WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'Invalid account qualification' USING ERRCODE='22023';
 END;
 RETURN jsonb_build_object('qualificationId',q.id,'accountId',q.account_id,'connectionId',q.connection_id,
  'credentialRevision',q.credential_revision,'expiresAt',q.expires_at);
END $$;

CREATE FUNCTION sophia.revoke_api_account_qualification(p_id uuid, p_reason text) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 300 THEN
  RAISE EXCEPTION 'A revocation names its reason' USING ERRCODE='22023'; END IF;
 UPDATE sophia.api_account_qualifications SET revoked_at=clock_timestamp(), revoked_reason=p_reason, revision=revision+1
  WHERE id=p_id AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Qualification not found or already revoked' USING ERRCODE='22023'; END IF;
END $$;

-- --- at-time helpers: existing rules restated on raw columns at one explicit instant --------------------------------

-- contribution_grant_unusable (0094) at p_now.
CREATE FUNCTION sophia.selection_grant_unusable_at(gr sophia.api_contribution_grants, p_now timestamptz) RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN gr.id IS NULL THEN 'grant_missing' WHEN gr.state='revoked' THEN 'grant_revoked'
  WHEN gr.admin_disabled_at IS NOT NULL THEN 'admin_disabled' WHEN gr.state='paused' THEN 'grant_paused'
  WHEN gr.expires_at<=p_now THEN 'grant_expired' ELSE NULL END $$;

-- A route's global qualification (0094 contribution_route_qualified) at p_now: current, revoked, expired or none.
CREATE FUNCTION sophia.selection_global_route_at(p_route text, p_model text, p_effort text, p_now timestamptz) RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 WITH q AS (SELECT * FROM sophia.api_route_qualifications WHERE route_id=p_route AND model=p_model AND effort=p_effort
  AND qualified_at<=p_now)
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM q WHERE (revoked_at IS NULL OR revoked_at>p_now) AND expires_at>p_now) THEN 'current'
  WHEN EXISTS(SELECT 1 FROM q WHERE revoked_at<=p_now) THEN 'revoked'
  WHEN EXISTS(SELECT 1 FROM q) THEN 'expired'
  ELSE 'none' END $$;

-- An account connection's own qualification at p_now: current for its exact account, connection, CURRENT credential
-- revision and settings; else the latest such record's revoked/expired; else stale if any record of the connection
-- observed by then names another revision or setting; else none. A record observed after p_now does not exist yet.
CREATE FUNCTION sophia.selection_account_qualification_at(conn sophia.api_connections, p_now timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 WITH mine AS (SELECT * FROM sophia.api_account_qualifications q WHERE q.connection_id=conn.id AND q.account_id=conn.account_id
   AND q.credential_revision=conn.credential_revision AND q.route_id=conn.route_id AND q.model=conn.model
   AND q.effort=conn.effort AND q.observed_at<=p_now),
  live AS (SELECT * FROM mine WHERE (revoked_at IS NULL OR revoked_at>p_now) AND expires_at>p_now
   ORDER BY observed_at DESC, id DESC LIMIT 1),
  latest AS (SELECT * FROM mine ORDER BY observed_at DESC, id DESC LIMIT 1)
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM live) THEN (SELECT jsonb_build_object('state','current','operations',to_jsonb(operations),
   'revision',revision,'id',id) FROM live)
  WHEN EXISTS(SELECT 1 FROM latest WHERE revoked_at<=p_now) THEN jsonb_build_object('state','revoked')
  WHEN EXISTS(SELECT 1 FROM latest) THEN jsonb_build_object('state','expired')
  WHEN EXISTS(SELECT 1 FROM sophia.api_account_qualifications q WHERE q.connection_id=conn.id AND q.observed_at<=p_now)
   THEN jsonb_build_object('state','stale')
  ELSE jsonb_build_object('state','none') END $$;

-- contribution_runtime_of + runtime_unavailable (0094) as a fact at p_now: the grant's current-revision runtime is
-- active for its role and route, leased, ready and seen within the existing 90 seconds. Authority (grant, owner,
-- route, connection) is judged separately by the snapshot, not folded into this availability.
CREATE FUNCTION sophia.selection_runtime_ready_at(gr sophia.api_contribution_grants, conn sophia.api_connections,
 p_now timestamptz) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.api_contribution_runtimes x JOIN sophia.runtime_instances r
   ON r.project_id=x.project_id AND r.resource_id=x.resource_id
  WHERE x.project_id=gr.project_id AND x.connection_id=conn.id AND x.credential_revision=conn.credential_revision
   AND x.state='current' AND r.state='active'
   AND r.roles @> jsonb_build_array(jsonb_build_object('id',gr.role_id,'route',gr.route_id))
   AND r.lease_id IS NOT NULL AND r.seen_at IS NOT NULL AND r.ready_state='ready'
   AND r.seen_at>=p_now-interval '90 seconds') $$;

-- What the account commits now, across every project and alias of its root (contribution_commit).
CREATE FUNCTION sophia.selection_account_committed(p_account uuid) RETURNS numeric LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(sum(sophia.contribution_commit(r)),0) FROM sophia.api_contribution_reservations x
  JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id WHERE x.account_id=p_account $$;

-- The owner's protection witness for this grant's use at p_now. Absent, not yet valid, expired or not exactly this
-- scope: policy_absent. none_applicable as declared. protected: each declared dimension preserved or violated by one
-- more prospective task (a slot, and up to the grant's task cap).
CREATE FUNCTION sophia.selection_protection_at(acc sophia.api_accounts, gr sophia.api_contribution_grants, p_slots integer,
 p_committed numeric, p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT CASE
  WHEN acc.protection_applicability IS NULL OR acc.protection_declared_at>p_now
    OR (acc.protection_valid_until IS NOT NULL AND acc.protection_valid_until<=p_now)
    OR acc.protection_operations IS DISTINCT FROM '{research}'::text[] OR acc.protection_roles IS DISTINCT FROM '{sophia-research-md-v1}'::text[]
    OR NOT gr.operation=ANY(acc.protection_operations) OR NOT gr.role_id=ANY(acc.protection_roles)
   THEN jsonb_build_object('witness','policy_absent')
  WHEN acc.protection_applicability='none_applicable' THEN jsonb_build_object('witness','none_applicable')
  ELSE jsonb_build_object('witness','covered','dimensions',
   coalesce((SELECT jsonb_agg(d ORDER BY d->>'ref') FROM (
    SELECT jsonb_build_object('ref','account_concurrency','verdict',CASE WHEN p_slots+1<=acc.concurrency_limit-acc.protected_concurrency
      THEN 'preserves_protected' ELSE 'would_violate' END) AS d WHERE acc.protected_concurrency IS NOT NULL
    UNION ALL
    SELECT jsonb_build_object('ref','account_spend','verdict',CASE WHEN p_committed+gr.task_cap_usd<=acc.total_cap_usd-acc.protected_spend_usd
      THEN 'preserves_protected' ELSE 'would_violate' END) WHERE acc.protected_spend_usd IS NOT NULL) z),'[]'::jsonb))
  END $$;

-- The project's non-model research budget for one more prospective task: the gate is enabled and what the project
-- itself commits (contributed model calls excluded, 0094) plus the new task's allowance cap fits its total (0024, 0094).
CREATE FUNCTION sophia.selection_project_budget(p_project uuid) RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce((SELECT g.state='enabled'
   AND (SELECT coalesce(sum(a.reserved_usd+a.spent_usd+a.uncertain_usd),0) FROM sophia.research_allowances a WHERE a.project_id=p_project)
    -sophia.contribution_project_committed(p_project)+g.task_cap_usd<=g.total_cap_usd
  FROM sophia.research_grants g WHERE g.project_id=p_project),false) $$;

-- One API grant as a candidate's raw facts at p_now (server-internal: no amount, label, list or evidence).
CREATE FUNCTION sophia.selection_api_candidate(gr sophia.api_contribution_grants, p_actor uuid, pin sophia.research_funding_pins,
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
 committed:=sophia.selection_account_committed(acc.id);
 SELECT coalesce(sum(sophia.contribution_commit(r)),0) INTO gcommitted FROM sophia.api_contribution_reservations x
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

-- One native resource as a candidate's raw facts at p_now. Recorded facts only: no host freshness, capacity or reserve
-- rule exists, so those stay unknown in the assembler.
CREATE FUNCTION sophia.selection_native_candidate(r sophia.executor_resources, p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql
STABLE SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.execution_connections; q sophia.owner_runner_qualifications; route text;
BEGIN
 SELECT * INTO c FROM sophia.execution_connections WHERE id=r.connection_id AND owner_id=r.owner_id;
 SELECT * INTO q FROM sophia.owner_runner_qualifications WHERE project_id=r.project_id AND resource_id=r.id AND revoked_at IS NULL;
 IF NOT FOUND THEN
  SELECT * INTO q FROM sophia.owner_runner_qualifications WHERE project_id=r.project_id AND resource_id=r.id
   ORDER BY qualified_at DESC, id DESC LIMIT 1;
 END IF;
 -- project_native_qualification_state (0097) on the record itself; connection and membership are judged on their own.
 route:=CASE WHEN q.id IS NULL THEN 'none' WHEN q.revoked_at IS NOT NULL THEN 'revoked' WHEN q.expires_at<=p_now THEN 'expired'
  WHEN q.owner_id<>r.owner_id OR q.connection_id IS DISTINCT FROM r.connection_id OR q.resource_revision<>r.revision
   OR c.id IS NULL OR q.connection_revision<>c.revision THEN 'stale' ELSE 'current' END;
 RETURN jsonb_build_object('kind','native','resourceId',r.id,'resourceRevision',r.revision,'ownerId',r.owner_id,
  'tool',CASE r.harness WHEN 'codex-native' THEN 'codex' ELSE 'claude' END,'state',r.state,
  'connectionState',CASE WHEN c.id IS NULL THEN NULL WHEN c.state='linked' AND c.expires_at IS NOT NULL AND c.expires_at<=p_now
   THEN 'expired' ELSE c.state END,
  'route',route,'qualificationRevision',q.revision,'operations',to_jsonb(coalesce(q.operations,'{}'::text[])),
  'sourcePolicy',CASE WHEN route='current' THEN q.source_policy END,'accountKey',q.account_key,
  'accountBusy',CASE WHEN q.id IS NULL THEN NULL ELSE EXISTS(SELECT 1 FROM sophia.owner_runner_reservations x
   WHERE x.account_key=q.account_key) END,
  'unsettledEffects',CASE WHEN q.id IS NULL THEN NULL ELSE EXISTS(SELECT 1 FROM sophia.owner_runner_operations o
   WHERE o.account_key=q.account_key AND o.state IN ('possible_send','unknown')) END);
END $$;

-- What one named source is for project work now: eligible, ineligible, withdrawn (erased) or missing.
CREATE FUNCTION sophia.selection_source(p_project uuid, p_id uuid) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce((SELECT jsonb_build_object('id',s.id,
   'state',CASE WHEN s.state='deleted' THEN 'withdrawn' WHEN s.scope='project' AND s.eligible AND s.state='ready' THEN 'eligible'
    ELSE 'ineligible' END,
   'eligibilityRevision',CASE WHEN s.scope='project' AND s.eligible AND s.state='ready' THEN s.eligibility_revision END)
  FROM sophia.source_objects s WHERE s.project_id=p_project AND s.id=p_id),
  jsonb_build_object('id',p_id,'state','missing','eligibilityRevision',NULL)) $$;

-- --- the owner's readout -------------------------------------------------------------------------------------------

-- The owner's own view of their connection's account qualification now (0104): its state, kind of verification,
-- recorder, observation, expiry and credential revision. Never the evidence reference or any credential.
CREATE FUNCTION sophia.account_qualification_view(c sophia.api_connections, p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('state',sophia.selection_account_qualification_at(c,p_now)->>'state')
  ||coalesce((SELECT jsonb_build_object('verification',q.verification,'recordedBy',q.recorded_by,'observedAt',q.observed_at,
     'expiresAt',q.expires_at,'credentialRevision',q.credential_revision,'revoked',q.revoked_at IS NOT NULL AND q.revoked_at<=p_now)
    FROM sophia.api_account_qualifications q WHERE q.connection_id=c.id AND q.account_id=c.account_id AND q.observed_at<=p_now
    ORDER BY (q.credential_revision=c.credential_revision) DESC, q.observed_at DESC, q.id DESC LIMIT 1),
   jsonb_build_object('verification',NULL,'recordedBy',NULL,'observedAt',NULL,'expiresAt',NULL,'credentialRevision',NULL,'revoked',false)) $$;

-- api_contributions_mine (0094), replaced: the same, each own account's protection and each own connection's account
-- qualification (0104).
CREATE OR REPLACE FUNCTION sophia.api_contributions_mine() RETURNS jsonb LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object(
  'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('accountId',x.id,'label',x.label,'provider',x.provider,'category',x.category,
     'provenance',x.provenance,'separateOwnership',x.separate_ownership_note IS NOT NULL,'concurrencyLimit',x.concurrency_limit,
     'totalCapUsd',x.total_cap_usd,'revision',x.revision,'slotsHeld',sophia.contribution_slots_held(x.id),
     'committedUsd',(SELECT coalesce(sum(sophia.contribution_commit(r)),0) FROM sophia.api_contribution_reservations l
       JOIN sophia.research_reservations r ON r.project_id=l.project_id AND r.id=l.reservation_id WHERE l.account_id=x.id),
     'providerBalance','unknown',
     'protection',sophia.account_protection_view(x)) ORDER BY x.created_at) FROM sophia.api_accounts x WHERE x.owner_id=sophia.actor_id()),'[]'), -- 0104: protection
  'connections',coalesce((SELECT jsonb_agg(jsonb_build_object('connectionId',c.id,'accountId',c.account_id,'label',c.label,
     'route',c.route_id,'model',c.model,'effort',c.effort,'credentialRef',c.credential_ref,'credentialRevision',c.credential_revision,
     'custodianKind',c.custodian_kind,'custodianLabel',c.custodian_label,'state',c.state,'revision',c.revision,
     'accountQualification',sophia.account_qualification_view(c,clock_timestamp())) ORDER BY c.created_at) -- 0104
   FROM sophia.api_connections c WHERE c.owner_id=sophia.actor_id()),'[]'),
  'grants',coalesce((SELECT jsonb_agg(sophia.contribution_grant_receipt(g)||jsonb_build_object('connectionId',g.connection_id,
     'eligible',g.eligible,'eligibleActors',to_jsonb(g.eligible_actors),'taskCapUsd',g.task_cap_usd,'totalCapUsd',g.total_cap_usd,
     'concurrency',g.concurrency,'fundingPolicy',g.funding_policy,'activeSettlement',g.active_settlement,
     'adminDisabledReason',g.admin_disabled_reason,'readiness',to_jsonb(sophia.contribution_readiness(g,NULL)),
     'committedUsd',(SELECT coalesce(sum(sophia.contribution_commit(r)),0) FROM sophia.api_contribution_reservations l
       JOIN sophia.research_reservations r ON r.project_id=l.project_id AND r.id=l.reservation_id WHERE l.grant_id=g.id)) ORDER BY g.created_at)
   FROM sophia.api_contribution_grants g WHERE g.owner_id=sophia.actor_id()),'[]'))
 WHERE sophia.actor_id() IS NOT NULL $$;

-- --- the snapshot ----------------------------------------------------------------------------------------------------

-- The calling member's selection facts for one prospective standalone research request in p_project, at one instant,
-- or NULL for a nonmember or a missing project. Read only: it writes, locks, reserves, notifies and sends nothing.
CREATE FUNCTION sophia.selection_snapshot(p_project uuid, p_source_ids uuid[]) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
DECLARE now_ timestamptz:=clock_timestamp(); a uuid:=sophia.actor_id(); m sophia.project_members; pr sophia.projects;
 rg sophia.research_grants; pin sophia.research_funding_pins; budget boolean; n integer; pool jsonb:='[]';
 gr sophia.api_contribution_grants; r sophia.executor_resources;
BEGIN
 IF p_source_ids IS NULL OR cardinality(p_source_ids)>8 OR array_position(p_source_ids,NULL) IS NOT NULL
    OR cardinality(p_source_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_source_ids) x) THEN
  RAISE EXCEPTION 'Invalid request: at most 8 distinct sources' USING ERRCODE='22023'; END IF;
 IF a IS NULL OR p_project IS NULL OR NOT sophia.is_member(p_project) THEN RETURN NULL; END IF;
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project;
 SELECT * INTO m FROM sophia.project_members WHERE project_id=p_project AND actor_id=a;
 SELECT * INTO rg FROM sophia.research_grants WHERE project_id=p_project;
 SELECT * INTO pin FROM sophia.research_funding_pins WHERE project_id=p_project AND requester_id=a;
 budget:=sophia.selection_project_budget(p_project);
 -- The complete pool, or proof (a 201st row) that it is larger than one evaluation may hold.
 SELECT count(*) INTO n FROM (
  SELECT 1 FROM sophia.api_contribution_grants g WHERE g.project_id=p_project AND (g.state<>'revoked' OR g.id IS NOT DISTINCT FROM pin.grant_id)
  UNION ALL SELECT 1 FROM sophia.executor_resources x WHERE x.project_id=p_project AND x.harness IN ('codex-native','claude-native')
  LIMIT 201) z;
 IF n<=200 THEN
  FOR gr IN SELECT * FROM sophia.api_contribution_grants g WHERE g.project_id=p_project
    AND (g.state<>'revoked' OR g.id IS NOT DISTINCT FROM pin.grant_id) ORDER BY g.id LOOP
   pool:=pool||jsonb_build_array(sophia.selection_api_candidate(gr,a,pin,budget,now_));
  END LOOP;
  FOR r IN SELECT * FROM sophia.executor_resources x WHERE x.project_id=p_project AND x.harness IN ('codex-native','claude-native')
    ORDER BY x.id LOOP
   pool:=pool||jsonb_build_array(sophia.selection_native_candidate(r,now_));
  END LOOP;
 END IF;
 RETURN jsonb_build_object('evaluatedAt',now_,'projectId',p_project,'actorId',a,
  'member',jsonb_build_object('role',m.role,'active',m.active,'revision',m.revision),
  'audienceRevision',pr.audience_revision,'eligibilityRevision',pr.eligibility_revision,
  'gate',CASE WHEN rg.project_id IS NULL THEN NULL ELSE jsonb_build_object('state',rg.state,'revision',rg.revision) END,
  'projectBudget',budget,
  'pin',CASE WHEN pin.grant_id IS NULL THEN NULL ELSE jsonb_build_object('grantId',pin.grant_id,'grantRevision',pin.grant_revision) END,
  'sources',coalesce((SELECT jsonb_agg(sophia.selection_source(p_project,x.id) ORDER BY x.n)
   FROM unnest(p_source_ids) WITH ORDINALITY AS x(id,n)),'[]'),
  'complete',n<=200,'candidates',pool);
END $$;

REVOKE ALL ON FUNCTION sophia.account_protection_refusal(jsonb), sophia.account_protection_view(sophia.api_accounts),
 sophia.qualify_api_account(uuid,text[],text,text,timestamptz,timestamptz), sophia.revoke_api_account_qualification(uuid,text),
 sophia.selection_grant_unusable_at(sophia.api_contribution_grants,timestamptz),
 sophia.selection_global_route_at(text,text,text,timestamptz),
 sophia.selection_account_qualification_at(sophia.api_connections,timestamptz),
 sophia.selection_runtime_ready_at(sophia.api_contribution_grants,sophia.api_connections,timestamptz),
 sophia.selection_account_committed(uuid),
 sophia.selection_protection_at(sophia.api_accounts,sophia.api_contribution_grants,integer,numeric,timestamptz),
 sophia.selection_project_budget(uuid),
 sophia.selection_api_candidate(sophia.api_contribution_grants,uuid,sophia.research_funding_pins,boolean,timestamptz),
 sophia.selection_native_candidate(sophia.executor_resources,timestamptz), sophia.selection_source(uuid,uuid),
 sophia.account_qualification_view(sophia.api_connections,timestamptz),
 sophia.selection_snapshot(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.selection_snapshot(uuid,uuid[]) TO sophia_api;

COMMIT;
