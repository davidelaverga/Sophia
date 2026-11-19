-- INC04-S03A-R07-C2A (0109): research call evidence at the SQL boundary. Run against a disposable database with every
-- migration installed (pnpm test:sql). Never use production. Everything below rolls back.
-- * No application role reads the evidence tables or executes a 0109 helper; the replaced entry points stay definers.
-- * Lock order (P05/K01), statically: every new paid gate reads the evidence guard after the exact qualification row;
--   the fact writer touches the guard last and never an account or qualification row.
-- * The pure parts: the tracked request, the contract check, the closed facts and their canonical digest, and the
--   monotone comparison.
-- Real reservations, settlements, restrictions and two-connection races run in research-call-evidence.db.test.ts.
BEGIN;

-- --- privileges --------------------------------------------------------------------------------------------------------
DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['research_evidence_guards','research_allowance_restrictions','research_call_identities','research_call_truth',
   'research_call_history'] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('sophia.'||t)::regclass) THEN RAISE EXCEPTION '% has no RLS', t; END IF;
  IF has_table_privilege('sophia_api','sophia.'||t,'SELECT') OR has_table_privilege('sophia_worker','sophia.'||t,'SELECT')
     OR has_table_privilege('sophia_conversation_assembler','sophia.'||t,'SELECT') THEN RAISE EXCEPTION 'An application role reads %', t; END IF;
 END LOOP;
 FOR f IN SELECT p.oid, p.oid::regprocedure AS sig, p.proacl FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND (p.proname LIKE 'research_call_%' OR p.proname IN ('research_evidence_guard_read','research_evidence_guard_transition','research_model_gate')) LOOP
  IF has_function_privilege('sophia_api',f.oid,'EXECUTE') OR has_function_privilege('sophia_worker',f.oid,'EXECUTE')
     OR has_function_privilege('sophia_conversation_assembler',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'An application role executes %', f.sig; END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',(SELECT proowner FROM pg_proc WHERE oid=f.oid)))) a
     WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION '% is executable by PUBLIC', f.sig; END IF;
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure AS sig, p.prosecdef, p.proconfig FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND p.proname IN ('runtime_research_reserve','runtime_design_reserve','runtime_source_review_reserve','runtime_research_settle',
    'runtime_design_settle','runtime_source_review_settle','reserve_research','contribution_admission','contribution_model_reserve',
    'dispatch_runtime_outbox') LOOP
  IF NOT f.prosecdef OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, sophia'] THEN
   RAISE EXCEPTION '% is no longer a definer with a fixed search_path', f.sig; END IF;
 END LOOP;
END $$;

-- --- lock order, statically --------------------------------------------------------------------------------------------
DO $$ DECLARE f record; src text; BEGIN
 -- Every new paid gate: the exact qualification row, then the evidence guard read, then the fresh instant.
 FOR f IN SELECT p.proname, p.prosrc FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND p.proname IN ('contribution_admission','contribution_model_reserve','contribution_dispatch_fund') LOOP
  IF position('research_evidence_guard_read(acc.id)' IN f.prosrc)=0
     OR position('contribution_lock_account_qualification(conn)' IN f.prosrc)>position('research_evidence_guard_read(acc.id)' IN f.prosrc)
     OR position('research_evidence_guard_read(acc.id)' IN f.prosrc)>position('clock_timestamp()' IN f.prosrc) THEN
   RAISE EXCEPTION '% does not read the evidence guard after the qualification row and before its instant', f.proname; END IF;
 END LOOP;
 SELECT prosrc INTO src FROM pg_proc WHERE oid='sophia.contribution_reacquire(sophia.api_contribution_tasks,boolean)'::regprocedure;
 IF position('research_evidence_guard_read(acc.id)' IN src)=0 OR position('q:=sophia.contribution_lock_account_qualification(conn)' IN src)
    >position('research_evidence_guard_read(acc.id)' IN src) THEN RAISE EXCEPTION 'reacquire reads the guard before the qualification row'; END IF;
 -- E1: the claim row is locked before the qualification row wherever a writable gate holds it.
 FOR f IN SELECT p.proname, p.prosrc FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND p.proname IN ('contribution_model_reserve','contribution_dispatch_fund') LOOP
  IF position('api_contribution_claims WHERE project_id=t.project_id AND job_id=t.job_id FOR UPDATE' IN f.prosrc)=0
     OR position('api_contribution_claims WHERE project_id=t.project_id AND job_id=t.job_id FOR UPDATE' IN f.prosrc)
      >position('contribution_lock_account_qualification(conn)' IN f.prosrc) THEN
   RAISE EXCEPTION '% does not lock the claim before the qualification row', f.proname; END IF;
 END LOOP;
 -- The fact writer and every helper it calls: no account, qualification or claim row; the guard written last.
 FOR f IN SELECT p.proname, p.prosrc FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND p.proname IN ('research_call_settle','research_call_facts','research_call_compare','research_call_money','research_call_retain',
    'research_call_extend','research_call_restrict_allowance','research_call_fact_digest','research_call_count') LOOP
  IF f.prosrc ~* 'api_accounts|api_account_qualifications|api_contribution_claims|api_connections|api_contribution_grants' THEN
   RAISE EXCEPTION 'The fact writer % touches an account-side row', f.proname; END IF;
 END LOOP;
 SELECT prosrc INTO src FROM pg_proc WHERE oid='sophia.research_call_settle(uuid,uuid,jsonb)'::regprocedure;
 IF position('UPDATE sophia.research_evidence_guards' IN src)=0
    OR position('UPDATE sophia.research_evidence_guards' IN src)<position('research_call_retain(t,f,disposition)' IN src)
    OR position('UPDATE sophia.research_evidence_guards' IN src)<position('research_call_restrict_allowance(i)' IN src)
    OR position('UPDATE sophia.research_evidence_guards' IN src)<position('FROM sophia.research_reservations WHERE project_id=p_project AND id=p_reservation FOR UPDATE' IN src)
    OR position('FROM sophia.research_allowances WHERE project_id=p_project AND id=i.allowance_id FOR UPDATE' IN src)
     >position('FROM sophia.research_reservations WHERE project_id=p_project AND id=p_reservation FOR UPDATE' IN src) THEN
  RAISE EXCEPTION 'The fact writer does not lock allowance -> reservation and the guard last'; END IF;
 -- The read-only delivery predicate stays advisory: no guard lock in it.
 IF position('research_evidence_guard' IN (SELECT prosrc FROM pg_proc WHERE oid='sophia.contribution_delivery_ineligible(sophia.outbox,sophia.execution_bindings)'::regprocedure))>0 THEN
  RAISE EXCEPTION 'The delivery predicate reads the guard'; END IF;
 -- Every contributed create, resume and steer reaches the dispatch gate.
 IF position('IN (''native.create'',''native.resume'',''native.steer'')' IN (SELECT prosrc FROM pg_proc WHERE oid='sophia.dispatch_runtime_outbox(uuid,uuid,uuid)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'dispatch does not gate resume and steer'; END IF;
 -- All three reserve wrappers take the account gate; all three settles use the fact writer.
 FOR f IN SELECT p.proname, p.prosrc FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND p.proname IN ('runtime_research_reserve','runtime_design_reserve','runtime_source_review_reserve') LOOP
  IF position('research_model_gate(' IN f.prosrc)=0 OR position('research_call_request(p_request)' IN f.prosrc)=0 THEN
   RAISE EXCEPTION '% does not gate and track its model reservations', f.proname; END IF;
 END LOOP;
 FOR f IN SELECT p.proname, p.prosrc FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND p.proname IN ('runtime_research_settle','runtime_design_settle','runtime_source_review_settle') LOOP
  IF position('research_call_settle(s.project_id,r.id,p_request)' IN f.prosrc)=0 THEN RAISE EXCEPTION '% does not settle facts', f.proname; END IF;
 END LOOP;
END $$;

-- --- the tracked request and the contract ---------------------------------------------------------------------------------
DO $$ DECLARE v jsonb; BEGIN
 IF sophia.research_call_request('{"kind":"model"}') IS NOT NULL THEN RAISE EXCEPTION 'a request without a mode is tracked'; END IF;
 v:=sophia.research_call_request('{"kind":"model","mode":"tracked_v1","contract":"legacy_report"}');
 IF v IS DISTINCT FROM '{"mode":"tracked_v1","contract":"legacy_report","declared":{}}'::jsonb THEN RAISE EXCEPTION 'tracked: %', v; END IF;
 BEGIN PERFORM sophia.research_call_request('{"kind":"search","mode":"tracked_v1","contract":"legacy_report"}');
  RAISE EXCEPTION 'a search was tracked'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sophia.research_call_request('{"kind":"model","contract":"legacy_report"}');
  RAISE EXCEPTION 'a contract without a mode'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sophia.research_call_request('{"kind":"model","mode":"tracked_v1","contract":"partial_report"}');
  RAISE EXCEPTION 'an invented contract'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sophia.research_call_request('{"kind":"model","mode":"tracked_v1","contract":"legacy_report","declared":{"prices":{"input":-1}}}');
  RAISE EXCEPTION 'a negative declared price'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM sophia.research_call_contract_check('c1p_complete_report','research-sol-medium-v1','openai-research');
 PERFORM sophia.research_call_contract_check('c1p_complete_report','source-review-luna-high-v1','openai-review');
 PERFORM sophia.research_call_contract_check('legacy_report','conversation-service-luna-high-v1','openai-conversation');
 BEGIN PERFORM sophia.research_call_contract_check('c1p_complete_report','research-sol-medium-v1','openai-review');
  RAISE EXCEPTION 'a complete report on another provider'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sophia.research_call_contract_check('c1p_complete_report',NULL,'openai-research');
  RAISE EXCEPTION 'a complete report without an admitted route'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;

-- --- the closed facts, their digest and the monotone comparison -----------------------------------------------------------
DO $$ DECLARE i sophia.research_call_identities; c1p sophia.research_call_identities; f sophia.research_call_fact; g sophia.research_call_fact;
 t sophia.research_call_truth; d text; r text;
 counts jsonb:='{"nonCachedInput":{"class":"known","value":3},"cacheRead":{"class":"known","value":2},"cacheWrite":{"class":"no_separate_reported_class"},"output":{"class":"known","value":4}}';
 unknown jsonb:='{"nonCachedInput":{"class":"unknown"},"cacheRead":{"class":"unknown"},"cacheWrite":{"class":"unknown"},"output":{"class":"unknown"}}';
 complete jsonb; none jsonb;
BEGIN
 c1p:=jsonb_populate_record(NULL::sophia.research_call_identities,'{"evidence_id":"a6000000-0000-4000-8000-000000000001","mode":"tracked_v1","contract":"c1p_complete_report"}');
 complete:=jsonb_build_object('outcome','settled','costUsd',0.000046,'evidence',jsonb_build_object('contract','c1p_complete_report',
  'report','complete_report','counts',counts,'ending','stream_completed','responseId','{"status":"supported","value":"resp_1"}'::jsonb));
 none:=jsonb_build_object('outcome','uncertain','evidence',jsonb_build_object('contract','c1p_complete_report','report','not_complete',
  'counts',unknown,'ending','stream_completed','responseId','{"status":"unknown"}'::jsonb));
 f:=sophia.research_call_facts(c1p,complete);
 IF f.noncached_input<>3 OR f.cache_read<>2 OR f.cache_write IS NOT NULL OR f.cache_write_class<>'no_separate_reported_class' OR f.output<>4
    OR f.response_id<>'resp_1' OR f.response_id_sha256<>encode(sha256(convert_to('resp_1','UTF8')),'hex') THEN RAISE EXCEPTION 'facts: %', f; END IF;
 -- The digest is canonical: the same facts give the same digest; another identity, cost or id gives another; no time.
 IF (sophia.research_call_facts(c1p,complete)).digest<>f.digest THEN RAISE EXCEPTION 'the digest is not deterministic'; END IF;
 IF (sophia.research_call_facts(jsonb_populate_record(c1p,'{"evidence_id":"a6000000-0000-4000-8000-000000000002"}'),complete)).digest=f.digest
    OR (sophia.research_call_facts(c1p,jsonb_set(complete,'{costUsd}','0.000047'))).digest=f.digest
    OR (sophia.research_call_facts(c1p,jsonb_set(complete,'{evidence,responseId,value}','"resp_2"'))).digest=f.digest THEN
  RAISE EXCEPTION 'the digest misses the identity, the cost or the id'; END IF;
 -- Closed facts: each refusal is the fixed message, never the value.
 FOREACH d IN ARRAY ARRAY[
  jsonb_set(complete,'{evidence,report}','"partial_report"')::text,
  jsonb_set(complete,'{evidence,contract}','"legacy_report"')::text,
  jsonb_set(complete,'{evidence,counts,output}','{"class":"known","value":1.5}')::text,
  jsonb_set(complete,'{evidence,counts,output}','{"class":"known","value":-1}')::text,
  jsonb_set(complete,'{evidence,counts,cacheWrite}','{"class":"known","value":0}')::text,
  jsonb_set(complete,'{evidence,counts,output}','{"class":"unknown"}')::text,
  jsonb_set(complete,'{evidence,headerId}','"req_1"')::text,
  jsonb_set(complete,'{evidence,responseId}','{"status":"supported","value":""}')::text,
  jsonb_set(complete,'{evidence,responseId}',jsonb_build_object('status','supported','value',repeat('x',8193)))::text,
  jsonb_set(complete,'{evidence,responseId}','{"status":"identity_unsupported","reason":"nul","value":"x"}')::text,
  jsonb_set(none,'{outcome}','"settled"')::text,
  (complete-'costUsd')::text] LOOP
  BEGIN
   PERFORM sophia.research_call_facts(c1p,d::jsonb);
   RAISE EXCEPTION 'accepted: %', d;
  EXCEPTION WHEN invalid_parameter_value THEN
   GET STACKED DIAGNOSTICS r = MESSAGE_TEXT;
   IF r NOT IN ('Invalid settlement evidence','Settlement evidence names another contract') THEN RAISE EXCEPTION 'echo: %', r; END IF;
  END;
 END LOOP;
 -- A supported id of exactly 8192 UTF-8 bytes; an unsupported one keeps its reason and optional correlation only.
 g:=sophia.research_call_facts(c1p,jsonb_set(complete,'{evidence,responseId}',jsonb_build_object('status','supported','value',repeat('é',4096))));
 IF octet_length(g.response_id)<>8192 THEN RAISE EXCEPTION 'the 8192-byte id was not kept whole'; END IF;
 g:=sophia.research_call_facts(c1p,jsonb_set(complete,'{evidence,responseId}',jsonb_build_object('status','identity_unsupported','reason','over_bound','correlation',repeat('c',64))));
 IF g.response_id IS NOT NULL OR g.response_id_reason<>'over_bound' OR g.noncached_input<>3 THEN RAISE EXCEPTION 'unsupported id: %', g; END IF;
 -- A legacy contract: legacy usage only; never a complete report.
 i:=jsonb_populate_record(c1p,'{"contract":"legacy_report"}');
 BEGIN PERFORM sophia.research_call_facts(i,jsonb_set(complete,'{evidence,contract}','"legacy_report"')); RAISE EXCEPTION 'legacy complete';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 -- (no separately reported class exists only in a complete C1P report; a legacy cache write is known or unknown)
 g:=sophia.research_call_facts(i,jsonb_set(jsonb_set(jsonb_set(complete,'{evidence,contract}','"legacy_report"'),'{evidence,report}','"legacy_usage"'),
  '{evidence,counts,cacheWrite}','{"class":"unknown"}'));
 IF g.report<>'legacy_usage' THEN RAISE EXCEPTION 'legacy usage'; END IF;
 -- The monotone comparison.
 t:=jsonb_populate_record(NULL::sophia.research_call_truth,to_jsonb(sophia.research_call_facts(c1p,none)));
 SELECT o_disposition INTO r FROM sophia.research_call_compare(t,f);
 IF r<>'extended' THEN RAISE EXCEPTION 'unknown -> known is an extension, got %', r; END IF;
 t:=jsonb_populate_record(NULL::sophia.research_call_truth,to_jsonb(f));
 SELECT o_disposition INTO r FROM sophia.research_call_compare(t,sophia.research_call_facts(c1p,none));
 IF r<>'subsumed' THEN RAISE EXCEPTION 'less knowledge (uncertain, unknown counts) after the truth is subsumed, got %', r; END IF;
 SELECT o_disposition, o_reason INTO r, d FROM sophia.research_call_compare(t,sophia.research_call_facts(c1p,jsonb_set(complete,'{evidence,counts,output,value}','5')));
 IF r<>'conflict' OR d<>'count_changed' THEN RAISE EXCEPTION 'the same USD with other counts: % %', r, d; END IF;
 SELECT o_disposition, o_reason INTO r, d FROM sophia.research_call_compare(t,sophia.research_call_facts(c1p,jsonb_set(complete,'{evidence,responseId,value}','"resp_2"')));
 IF r<>'conflict' OR d<>'id_changed' THEN RAISE EXCEPTION 'a changed id: % %', r, d; END IF;
 SELECT o_disposition, o_reason INTO r, d FROM sophia.research_call_compare(t,sophia.research_call_facts(c1p,jsonb_set(complete,'{costUsd}','0.1')));
 IF r<>'conflict' OR d<>'cost_changed' THEN RAISE EXCEPTION 'a changed cost: % %', r, d; END IF;
 SELECT o_disposition INTO r FROM sophia.research_call_compare(t,sophia.research_call_facts(c1p,jsonb_set(complete,'{evidence,responseId}','{"status":"unknown"}')));
 IF r<>'subsumed' THEN RAISE EXCEPTION 'less knowledge is subsumed, got %', r; END IF;
 t:=jsonb_populate_record(t,'{"response_id_status":"unknown","response_id":null}');
 SELECT o_disposition INTO r FROM sophia.research_call_compare(t,f);
 IF r<>'extended' THEN RAISE EXCEPTION 'an id learnt later extends, got %', r; END IF;
END $$;

ROLLBACK;
