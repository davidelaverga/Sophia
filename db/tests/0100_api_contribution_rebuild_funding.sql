-- INC01-COHERENT-WRITE-003 (0100): a rebuilt contributed research task keeps its funding binding. Run against a disposable
-- database with every migration installed (pnpm test:sql). Never use production. Everything below rolls back.
-- * The new helpers are private definers with a fixed search_path; no application role and not PUBLIC executes them.
-- * WRITE-004: dispatch and the paid model call decide a rebuilt task's slot (contribution_rebuild_capacity).
-- * The five replaced 0094 functions keep their grants; research_rebuild calls the bind.
-- The behaviour (rebuild binding, cumulative caps, barriers, orphans, erasure that always commits) runs on real roles
-- in packages/persistence/src/inc01-coherent.db.test.ts.
BEGIN;

DO $$ DECLARE f record; r text; BEGIN
 FOR f IN SELECT p.oid, p.proname, p.prosecdef, p.proconfig, p.proacl FROM pg_proc p
   WHERE p.pronamespace='sophia'::regnamespace AND p.proname IN ('contribution_lineage_unbound','contribution_rebuild_bind',
    'contribution_rebuilt','contribution_slots_held_by_others','contribution_rebuild_capacity') LOOP
  IF NOT f.prosecdef OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, sophia']
     OR EXISTS(SELECT 1 FROM aclexplode(f.proacl) a WHERE a.grantee=0) THEN
   RAISE EXCEPTION '% is not a private definer with a fixed search_path', f.proname; END IF;
  FOREACH r IN ARRAY ARRAY['sophia_api','sophia_worker','sophia_conversation_assembler'] LOOP
   IF has_function_privilege(r,f.oid,'EXECUTE') THEN RAISE EXCEPTION '% executes %', r, f.proname; END IF;
  END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='sophia'::regnamespace
     AND proname IN ('contribution_lineage_unbound','contribution_rebuild_bind','contribution_rebuilt',
      'contribution_slots_held_by_others','contribution_rebuild_capacity'))<>5 THEN
  RAISE EXCEPTION 'The 0100 helpers are missing'; END IF;
 -- The funding read stays the API's; the replaced private 0094 functions stay private.
 IF NOT has_function_privilege('sophia_api','sophia.research_task_funding(uuid,uuid)','EXECUTE')
    OR has_function_privilege('sophia_worker','sophia.research_task_funding(uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'research_task_funding changed hands'; END IF;
 -- The runtime reserve entry stays the API's (0025), and executable by no other role.
 IF NOT has_function_privilege('sophia_api','sophia.runtime_research_reserve(bytea,text,text,jsonb)','EXECUTE')
    OR has_function_privilege('sophia_worker','sophia.runtime_research_reserve(bytea,text,text,jsonb)','EXECUTE')
    OR has_function_privilege('sophia_conversation_assembler','sophia.runtime_research_reserve(bytea,text,text,jsonb)','EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid='sophia.runtime_research_reserve(bytea,text,text,jsonb)'::regprocedure
      AND a.grantee=0) THEN
  RAISE EXCEPTION 'runtime_research_reserve changed hands'; END IF;
 FOR f IN SELECT p.oid, p.proname, p.proacl FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND p.proname IN ('contribution_delivery_ineligible','contribution_model_reserve','contribution_withhold','research_rebuild') LOOP
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',(SELECT proowner FROM pg_proc WHERE oid=f.oid)))) a
     WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION '% is executable by PUBLIC', f.proname; END IF;
  FOREACH r IN ARRAY ARRAY['sophia_api','sophia_worker','sophia_conversation_assembler'] LOOP
   IF has_function_privilege(r,f.oid,'EXECUTE') THEN RAISE EXCEPTION '% executes the private %', r, f.proname; END IF;
  END LOOP;
 END LOOP;
 -- The producer binds; the four consumers and the runtime reserve entry fence an unbound contributed lineage.
 IF position('contribution_rebuild_bind' IN (SELECT prosrc FROM pg_proc WHERE oid='sophia.research_rebuild(uuid,sophia.jobs,sophia.research_tasks,sophia.goals)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'research_rebuild does not bind'; END IF;
 FOR f IN SELECT p.proname, p.prosrc FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND p.proname IN ('contribution_delivery_ineligible','contribution_model_reserve','contribution_withhold','research_task_funding',
    'runtime_research_reserve') LOOP
  IF position('contribution_lineage_unbound' IN f.prosrc)=0 THEN RAISE EXCEPTION '% does not fence an unbound lineage', f.proname; END IF;
 END LOOP;
 -- WRITE-004: dispatch and the paid model call decide a rebuilt task's slot; dispatch takes the account row in a write.
 FOR f IN SELECT p.proname, p.prosrc FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND p.proname IN ('contribution_delivery_ineligible','contribution_model_reserve') LOOP
  IF position('contribution_rebuild_capacity' IN f.prosrc)=0 THEN RAISE EXCEPTION '% does not decide a rebuilt task''s slot', f.proname; END IF;
 END LOOP;
 IF position('FROM sophia.api_accounts WHERE id=t.account_id FOR UPDATE' IN (SELECT prosrc FROM pg_proc
     WHERE oid='sophia.contribution_delivery_ineligible(sophia.outbox,sophia.execution_bindings)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'dispatch does not wait on the account row for a rebuilt task'; END IF;
END $$;

-- A job that is not a research task, or does not exist, is never an unbound contributed lineage, nor a rebuilt task;
-- an unknown account holds no slot.
DO $$ BEGIN
 IF sophia.contribution_lineage_unbound(gen_random_uuid(),gen_random_uuid()) THEN
  RAISE EXCEPTION 'An unknown job reads as an unbound contributed lineage'; END IF;
 IF sophia.contribution_rebuilt(gen_random_uuid(),gen_random_uuid()) THEN RAISE EXCEPTION 'An unknown job reads as rebuilt'; END IF;
 IF sophia.contribution_slots_held_by_others(gen_random_uuid(),NULL,gen_random_uuid(),gen_random_uuid())<>0 THEN
  RAISE EXCEPTION 'An unknown account holds a slot'; END IF;
END $$;

ROLLBACK;
