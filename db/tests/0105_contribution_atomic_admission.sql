-- INC04-S02a (0105): the atomic contributed-API admission at the SQL boundary. Run against a disposable database with
-- every migration installed (pnpm test:sql). Never use production. Everything below rolls back.
-- * No application role executes a 0105 helper or reads the claim table; the replaced entry points keep their grants.
-- * Only dispatch_runtime_outbox (marked S02A-FUND) reaches the claim write; every eligibility read only evaluates.
-- * The binding's frozen facts are all-or-none, and the binding is INSERT only; a claim only moves unfunded -> funded.
-- * The pure refusals: protection with explicit after-values (and policy_absent), the exact qualification row at an
--   instant, and typed identity.
-- Real admissions, races, holds, reacquisition and the preview run in contribution-admission.db.test.ts.
BEGIN;

-- --- privileges and the one writable boundary ---------------------------------------------------------------------------
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS sig, p.proname, p.proacl FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND p.proname IN ('contribution_binding_frozen','contribution_claim_transition','contribution_lineage_committed',
    'contribution_lineage_ceiling','contribution_lineage_holds','contribution_committed','contribution_account_uncertain',
    'contribution_totals_after','contribution_protection_refusal','contribution_lock_account_qualification',
    'contribution_qualification_refusal','contribution_identity_refusal','contribution_reacquire','contribution_dispatch_fund') LOOP
  IF has_function_privilege('sophia_api',f.sig,'EXECUTE') OR has_function_privilege('sophia_worker',f.sig,'EXECUTE')
     OR has_function_privilege('sophia_conversation_assembler',f.sig,'EXECUTE') THEN
   RAISE EXCEPTION 'An application role executes %', f.sig; END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(f.proacl) a WHERE a.grantee=0) THEN RAISE EXCEPTION '% is executable by PUBLIC', f.sig; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='sophia'::regnamespace AND proname IN ('contribution_binding_frozen',
   'contribution_claim_transition','contribution_lineage_committed','contribution_lineage_ceiling','contribution_lineage_holds',
   'contribution_committed','contribution_account_uncertain','contribution_totals_after','contribution_protection_refusal',
   'contribution_lock_account_qualification','contribution_qualification_refusal','contribution_identity_refusal',
   'contribution_reacquire','contribution_dispatch_fund'))<>14 THEN RAISE EXCEPTION 'A 0105 helper is missing'; END IF;
 IF has_table_privilege('sophia_api','sophia.api_contribution_claims','SELECT')
    OR has_table_privilege('sophia_worker','sophia.api_contribution_claims','SELECT')
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='sophia.api_contribution_claims'::regclass) THEN
  RAISE EXCEPTION 'The claim table is readable or without RLS'; END IF;
 -- The replaced entry points keep their privileges: the worker dispatches, nobody else calls the private ones.
 IF NOT has_function_privilege('sophia_worker','sophia.dispatch_runtime_outbox(uuid,uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'dispatch_runtime_outbox lost its grant'; END IF;
 FOR f IN SELECT p.oid::regprocedure AS sig, p.prosecdef, p.proconfig FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND p.proname IN ('contribution_admission','contribution_bind_task','contribution_rebuild_bind','contribution_delivery_ineligible',
    'contribution_model_reserve','dispatch_runtime_outbox') LOOP
  IF NOT f.prosecdef OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, sophia'] THEN
   RAISE EXCEPTION '% is no longer a definer with a fixed search_path', f.sig; END IF;
  IF has_function_privilege('sophia_api',f.sig,'EXECUTE') AND f.sig::text<>'sophia.dispatch_runtime_outbox(uuid,uuid,uuid)' THEN
   RAISE EXCEPTION 'sophia_api executes %', f.sig; END IF;
 END LOOP;
END $$;

-- Only dispatch_runtime_outbox calls the writable acquisition; only contribution_dispatch_fund asks reacquire to write;
-- the eligibility helper only evaluates. A static scan of every function body in the schema.
DO $$ DECLARE callers text[]; writers text[]; BEGIN
 SELECT array_agg(proname::text ORDER BY proname) INTO callers FROM pg_proc WHERE pronamespace='sophia'::regnamespace
  AND prosrc ~ 'contribution_dispatch_fund\(' AND proname<>'contribution_dispatch_fund';
 IF callers IS DISTINCT FROM ARRAY['dispatch_runtime_outbox']::text[] THEN
  RAISE EXCEPTION 'contribution_dispatch_fund is reached from %', callers; END IF;
 SELECT array_agg(proname::text ORDER BY proname) INTO writers FROM pg_proc WHERE pronamespace='sophia'::regnamespace
  AND prosrc ~* 'contribution_reacquire\([^)]*,\s*true\)';
 IF writers IS DISTINCT FROM ARRAY['contribution_dispatch_fund']::text[] THEN RAISE EXCEPTION 'reacquire writes from %', writers; END IF;
 SELECT array_agg(proname::text ORDER BY proname) INTO writers FROM pg_proc WHERE pronamespace='sophia'::regnamespace
  AND prosrc ~* 'update\s+sophia\.api_contribution_claims';
 IF writers IS DISTINCT FROM ARRAY['contribution_reacquire']::text[] THEN RAISE EXCEPTION 'claims are updated from %', writers; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='sophia'::regnamespace AND proname='contribution_delivery_ineligible'
   AND prosrc ~ 'contribution_reacquire\(t,false\)') THEN RAISE EXCEPTION 'The eligibility read no longer evaluates only'; END IF;
 IF (SELECT position('S02A-FUND-BEGIN' IN prosrc)>0 AND position('S02A-FUND-END' IN prosrc)>position('S02A-FUND-BEGIN' IN prosrc)
     AND position('native_delivery_ineligible(o,g,c,b,rt)' IN prosrc)<position('S02A-FUND-BEGIN' IN prosrc)
     AND position('runtime_unavailable(rt)' IN prosrc)<position('S02A-FUND-BEGIN' IN prosrc)
   FROM pg_proc WHERE pronamespace='sophia'::regnamespace AND proname='dispatch_runtime_outbox') IS NOT TRUE THEN
  RAISE EXCEPTION 'S02A-FUND is not after the dispatch''s authority checks'; END IF;
END $$;

-- --- the binding and the claim -----------------------------------------------------------------------------------------
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='sophia.api_contribution_tasks'::regclass AND tgname='api_contribution_tasks_frozen'
   AND NOT tgisinternal AND tgenabled='O') THEN RAISE EXCEPTION 'The binding is not frozen'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='sophia.api_contribution_claims'::regclass
   AND tgname='api_contribution_claims_transition' AND NOT tgisinternal AND tgenabled='O') THEN
  RAISE EXCEPTION 'The claim transition is not guarded'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='sophia.api_contribution_tasks'::regclass
   AND conname='api_contribution_tasks_checked_facts') THEN RAISE EXCEPTION 'Checked facts are not all-or-none'; END IF;
 -- No foreign key cascades into the binding or the claim (C07: no deletion path is invented or hidden).
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confdeltype IN ('c','n','d')
   AND (conrelid IN ('sophia.api_contribution_tasks'::regclass,'sophia.api_contribution_claims'::regclass)
    OR confrelid='sophia.api_contribution_tasks'::regclass)) THEN RAISE EXCEPTION 'A cascade reaches the binding'; END IF;
END $$;

-- --- the pure refusals ---------------------------------------------------------------------------------------------------
DO $$ DECLARE acc sophia.api_accounts; gr sophia.api_contribution_grants; q sophia.api_account_qualifications;
 conn sophia.api_connections; t0 timestamptz:='2026-11-13 12:00:00+00';
BEGIN
 gr:=jsonb_populate_record(NULL::sophia.api_contribution_grants,jsonb_build_object('operation','research','role_id','sophia-research-md-v1'));
 acc:=jsonb_populate_record(NULL::sophia.api_accounts,jsonb_build_object('concurrency_limit',3,'total_cap_usd',10,'provenance','owner_declared'));
 -- No declaration is policy_absent, never clear.
 IF sophia.contribution_protection_refusal(acc,gr,1,1,t0) IS DISTINCT FROM 'protection_policy_absent' THEN RAISE EXCEPTION 'absent'; END IF;
 acc:=jsonb_populate_record(acc,jsonb_build_object('protection_applicability','none_applicable','protection_operations','{research}',
  'protection_roles','{sophia-research-md-v1}','protection_declared_at',t0-interval '1 hour'));
 IF sophia.contribution_protection_refusal(acc,gr,3,10,t0) IS NOT NULL THEN RAISE EXCEPTION 'none_applicable refused'; END IF;
 IF sophia.contribution_protection_refusal(acc,gr,1,1,t0-interval '2 hours') IS DISTINCT FROM 'protection_policy_absent' THEN
  RAISE EXCEPTION 'a declaration before it was made'; END IF;
 -- Protected: one slot and 4 USD kept free. After-values are explicit: the caller says what the operation leaves.
 acc:=jsonb_populate_record(acc,jsonb_build_object('protection_applicability','protected','protected_concurrency',1,'protected_spend_usd',4));
 IF sophia.contribution_protection_refusal(acc,gr,2,6,t0) IS NOT NULL THEN RAISE EXCEPTION 'exactly at the protected bound'; END IF;
 IF sophia.contribution_protection_refusal(acc,gr,3,6,t0) IS DISTINCT FROM 'reserve_protected' THEN RAISE EXCEPTION 'slot'; END IF;
 IF sophia.contribution_protection_refusal(acc,gr,2,6.000001,t0) IS DISTINCT FROM 'reserve_protected' THEN RAISE EXCEPTION 'spend'; END IF;
 acc:=jsonb_populate_record(acc,jsonb_build_object('protection_valid_until',t0));
 IF sophia.contribution_protection_refusal(acc,gr,1,1,t0) IS DISTINCT FROM 'protection_policy_absent' THEN RAISE EXCEPTION 'expired'; END IF;
 -- The exact qualification row at an instant: its own connection, credential revision and settings, research, live.
 conn:=jsonb_populate_record(NULL::sophia.api_connections,jsonb_build_object('id','a5000000-0000-0000-0000-000000000001',
  'account_id','a5000000-0000-0000-0000-000000000002','credential_revision',2,'route_id','research-sol-medium-v1',
  'model','gpt-6.1-sol','effort','medium'));
 q:=jsonb_populate_record(NULL::sophia.api_account_qualifications,jsonb_build_object('id','a5000000-0000-0000-0000-000000000003',
  'connection_id',conn.id,'account_id',conn.account_id,'credential_revision',2,'route_id','research-sol-medium-v1',
  'model','gpt-6.1-sol','effort','medium','operations','{research}','observed_at',t0-interval '1 hour','expires_at',t0+interval '1 hour'));
 IF sophia.contribution_qualification_refusal(q,conn,t0) IS NOT NULL THEN RAISE EXCEPTION 'a current row refused'; END IF;
 IF sophia.contribution_qualification_refusal(q,conn,t0+interval '1 hour') IS DISTINCT FROM 'account_unqualified' THEN
  RAISE EXCEPTION 'qualified at its exact expiry'; END IF;
 IF sophia.contribution_qualification_refusal(q,conn,t0-interval '2 hours') IS DISTINCT FROM 'account_unqualified' THEN
  RAISE EXCEPTION 'qualified before it was observed'; END IF;
 IF sophia.contribution_qualification_refusal(jsonb_populate_record(q,'{"credential_revision":1}'),conn,t0) IS DISTINCT FROM 'account_unqualified'
    OR sophia.contribution_qualification_refusal(jsonb_populate_record(q,'{"operations":["build"]}'),conn,t0) IS DISTINCT FROM 'account_unqualified'
    OR sophia.contribution_qualification_refusal(jsonb_populate_record(q,jsonb_build_object('revoked_at',t0-interval '1 minute')),conn,t0)
     IS DISTINCT FROM 'account_unqualified'
    OR sophia.contribution_qualification_refusal(NULL::sophia.api_account_qualifications,conn,t0) IS DISTINCT FROM 'account_unqualified' THEN
  RAISE EXCEPTION 'another revision, operation, a revoked row or no row qualified'; END IF;
 -- Typed identity only: owner_declared is resolved; unknown is held.
 IF sophia.contribution_identity_refusal(acc) IS NOT NULL
    OR sophia.contribution_identity_refusal(jsonb_populate_record(acc,'{"provenance":"unknown"}')) IS DISTINCT FROM 'account_identity_unresolved'
    OR sophia.contribution_identity_refusal(jsonb_populate_record(acc,'{"separate_ownership_note":"owned by my other company"}')) IS NOT NULL THEN
  RAISE EXCEPTION 'identity is not decided by its typed provenance'; END IF;
END $$;

ROLLBACK;
