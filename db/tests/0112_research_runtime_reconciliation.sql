-- INC04-R07-C3-RECONCILE-001 (0112): reconciliation, adjudication and certification, statically. Literal canonical
-- vectors (computed independently, then asserted against the actual SQL), closed inputs with one fixed refusal, D1
-- disabled, decimal spellings, the replaced functions' marks, append-only/RLS records and no ordinary-role reach.
-- Writes nothing.
DO $$
DECLARE c record; v jsonb; base jsonb;
BEGIN
 base:='{"version":"research-reconcile-v1","projectId":"11111111-1111-4111-8111-111111111111",
  "reservationId":"22222222-2222-4222-8222-222222222222","expected":{"state":"uncertain","reservedUsd":"0.100000",
  "allowanceId":"33333333-3333-4333-8333-333333333333","accountId":null,"resourceId":null,"operation":"research","callId":"llm-1",
  "provider":"openai-research","fenceId":null,"generation":null},"basis":"provider_billed_attestation","costUsd":"0.034000",
  "authorityId":"44444444-4444-4444-8444-444444444444","evidenceRef":"invoice:synthetic-1"}';
 SELECT * INTO c FROM sophia.research_reconcile_input(base);
 IF c.canonical::text<>'{"basis": "provider_billed_attestation", "costUsd": "0.034000", "version": "research-reconcile-v1", "expected": {"state": "uncertain", "callId": "llm-1", "fenceId": null, "provider": "openai-research", "accountId": null, "operation": "research", "generation": null, "resourceId": null, "allowanceId": "33333333-3333-4333-8333-333333333333", "reservedUsd": "0.100000"}, "projectId": "11111111-1111-4111-8111-111111111111", "authorityId": "44444444-4444-4444-8444-444444444444", "evidenceRef": "invoice:synthetic-1", "reservationId": "22222222-2222-4222-8222-222222222222"}'
  OR c.digest<>'e0bd896333a2007e2bddd64e3169e7011e53b01391ea735eeb584bc185a0a883' OR c.cost<>0.034 OR c.reserved<>0.1 THEN
  RAISE EXCEPTION 'reconcile vector: % %', c.canonical, c.digest; END IF;
 IF sophia.research_cause_set_digest('11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333',
   '[{"seq":1,"projectId":"11111111-1111-4111-8111-111111111111","reservationId":"22222222-2222-4222-8222-222222222222","kind":"conflict","digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
     {"seq":2,"projectId":"11111111-1111-4111-8111-111111111111","reservationId":"22222222-2222-4222-8222-222222222222","kind":"overflow","digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]')
   <>'056f940755e987d1a39da996827317cbc9bb4051b448ee5f3de4b4c047cc2547' THEN
  RAISE EXCEPTION 'cause-set vector'; END IF;
 IF sophia.research_cause_set_digest('44444444-4444-4444-8444-444444444444','[]')
   <>'33ea4e2b7ebefce72fa50419af181ddb9247d4884ecaf3a2790e9d58a68f3208' THEN RAISE EXCEPTION 'empty cause-set vector'; END IF;

 -- D1 is disabled: a conservative-at-reserved basis is refused as such (feature not supported), not as a typo.
 BEGIN
  PERFORM sophia.research_reconcile_input(jsonb_set(base,'{basis}','"conservative_at_reserved"'));
  RAISE EXCEPTION 'D1 accepted' USING ERRCODE='P0001';
 EXCEPTION WHEN feature_not_supported THEN NULL;
 END;
 -- Closed, canonical input: every malformed variant is refused with one fixed message.
 FOR v IN SELECT x FROM unnest(ARRAY[
   base||'{"extra":1}', base-'evidenceRef', jsonb_set(base,'{costUsd}','0.034'), jsonb_set(base,'{costUsd}','"0.034"'),
   jsonb_set(base,'{costUsd}','"3.4e-2"'), jsonb_set(base,'{costUsd}','"-0.034000"'), jsonb_set(base,'{costUsd}','"00.034000"'),
   jsonb_set(base,'{expected,reservedUsd}','"0.000000"'), jsonb_set(base,'{expected,state}','"settled"'),
   jsonb_set(base,'{expected,accountId}','"not-a-uuid"'), jsonb_set(base,'{projectId}','"11111111-1111-4111-8111-11111111111A"'),
   jsonb_set(base,'{expected,fenceId}','"55555555-5555-4555-8555-555555555555"'),
   jsonb_set(base,'{expected,generation}','"zz"'), jsonb_set(base,'{expected,operation}','"chat"'),
   jsonb_set(base,'{basis}','"unknown"'), jsonb_set(base,'{basis}','null'), jsonb_set(base,'{version}','"research-reconcile-v2"'),
   jsonb_set(base,'{evidenceRef}','""'), jsonb_set(base,'{evidenceRef}',to_jsonb(repeat('x',301))),
   base#-'{expected,callId}', jsonb_set(base,'{expected,extra}','1')]::jsonb[]) x LOOP
  BEGIN
   PERFORM sophia.research_reconcile_input(v);
   RAISE EXCEPTION 'accepted malformed reconciliation input %', v USING ERRCODE='P0001';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
 END LOOP;
 -- A genuinely evidenced zero is a valid basis value (distinct from absence).
 SELECT * INTO c FROM sophia.research_reconcile_input(jsonb_set(base,'{costUsd}','"0.000000"'));
 IF c.cost<>0 THEN RAISE EXCEPTION 'zero'; END IF;
END $$;

-- The replaced functions carry their marks; the backfill and the projection are consistent.
DO $$
BEGIN
 IF (SELECT prosrc FROM pg_proc WHERE oid='sophia.research_call_settle(uuid,uuid,jsonb)'::regprocedure) NOT LIKE '%0112 CAUSE-WRITER%'
  OR (SELECT prosrc FROM pg_proc WHERE oid='sophia.reserve_research(uuid,uuid,text,text,text,numeric,text)'::regprocedure) NOT LIKE '%0112 ACTIVE-GATE%'
  OR (SELECT prosrc FROM pg_proc WHERE oid='sophia.research_evidence_guard_transition()'::regprocedure) NOT LIKE '%research_account_certificates%'
  OR (SELECT prosrc FROM pg_proc WHERE oid='sophia.research_call_record_late_facts(uuid,uuid,jsonb)'::regprocedure) LIKE '%research_call_money(%'
  OR (SELECT prosrc FROM pg_proc WHERE oid='sophia.research_call_record_late_facts(uuid,uuid,jsonb)'::regprocedure) NOT LIKE '%R1 FACT-ONLY%'
  OR (SELECT prosrc FROM pg_proc WHERE oid='sophia.research_call_record_late_facts(uuid,uuid,jsonb)'::regprocedure) NOT LIKE '%R2 P02 OPEN-MONEY%'
  OR (SELECT prosrc FROM pg_proc WHERE oid='sophia.research_call_settle(uuid,uuid,jsonb)'::regprocedure) LIKE '%R2 P02%'
  OR (SELECT prosrc FROM pg_proc WHERE oid='sophia.record_research_late_facts(jsonb)'::regprocedure) NOT LIKE '%R2 P03 ORIGINAL-GENERATION%'
  OR (SELECT prosrc FROM pg_proc WHERE oid='sophia.research_call_restrict_allowance(sophia.research_call_identities)'::regprocedure) NOT LIKE '%research_allowance_restriction_episodes%' THEN
  RAISE EXCEPTION 'a replaced function lacks its 0112 mark'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.research_allowance_restrictions x WHERE NOT EXISTS(SELECT 1 FROM sophia.research_allowance_restriction_episodes e
   WHERE e.project_id=x.project_id AND e.allowance_id=x.allowance_id)) THEN RAISE EXCEPTION 'a legacy restriction has no episode'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.research_call_truth t WHERE t.first_conflict_digest IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.research_restriction_causes c
   WHERE c.project_id=t.project_id AND c.reservation_id=t.reservation_id AND c.kind='conflict' AND c.digest=t.first_conflict_digest)) THEN
  RAISE EXCEPTION 'a retained first conflict is not a recorded cause'; END IF;
END $$;

-- Append-only, RLS, and no ordinary role reaches any record or operator function, whatever it sets.
DO $$
DECLARE r text; f text; t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['research_financial_authorities','research_financial_authority_revocations','research_restriction_causes',
   'research_cause_adjudications','research_reservation_reconciliations','research_allowance_restriction_episodes',
   'research_allowance_certificates','research_account_certificates','research_late_fact_operations'] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('sophia.'||t)::regclass) THEN RAISE EXCEPTION '% without RLS', t; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid=('sophia.'||t)::regclass AND tgfoid='sophia.research_reconciliation_frozen()'::regprocedure)<>2 THEN
   RAISE EXCEPTION '% is not frozen', t; END IF;
  FOREACH r IN ARRAY ARRAY['sophia_api','sophia_worker','sophia_conversation_assembler'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) AND has_table_privilege(r,'sophia.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION '% has a privilege on %', r, t; END IF;
  END LOOP;
 END LOOP;
 FOREACH f IN ARRAY ARRAY['sophia.record_research_financial_authority(jsonb)','sophia.revoke_research_financial_authority(uuid,text)',
   'sophia.reconcile_research_reservation(jsonb)','sophia.adjudicate_research_cause(jsonb)','sophia.certify_research_allowance(jsonb)',
   'sophia.certify_research_account(jsonb)','sophia.research_certification_preview(uuid,uuid,uuid)','sophia.research_reconcile_input(jsonb)',
   'sophia.record_research_late_facts(jsonb)','sophia.research_call_record_late_facts(uuid,uuid,jsonb)',
   'sophia.research_restriction_cause(sophia.research_call_identities,text,text)','sophia.research_cause_set(uuid,uuid,uuid)',
   'sophia.research_allowance_restricted(uuid,uuid)','sophia.research_causes_covered(uuid,uuid,uuid,integer)',
   'sophia.research_call_restrict_allowance(sophia.research_call_identities)','sophia.research_call_settle(uuid,uuid,jsonb)'] LOOP
  FOREACH r IN ARRAY ARRAY['sophia_api','sophia_worker','sophia_conversation_assembler'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) AND has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION '% can execute %', r, f; END IF;
  END LOOP;
  IF has_function_privilege('public',f,'EXECUTE') THEN RAISE EXCEPTION 'PUBLIC can execute %', f; END IF;
 END LOOP;
 -- No new foreign key reaches an account or its guard (no hidden account wait).
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid IN ('sophia.api_accounts'::regclass,'sophia.research_evidence_guards'::regclass)
   AND conrelid IN ('sophia.research_financial_authorities'::regclass,'sophia.research_restriction_causes'::regclass,
    'sophia.research_cause_adjudications'::regclass,'sophia.research_reservation_reconciliations'::regclass,
    'sophia.research_allowance_restriction_episodes'::regclass,'sophia.research_allowance_certificates'::regclass,
    'sophia.research_account_certificates'::regclass)) THEN RAISE EXCEPTION 'a 0112 foreign key reaches an account'; END IF;
END $$;

-- R1 (C3REC-F01): the late-fact input is closed and bounded; every malformed variant refuses before any lookup or effect.
DO $$
DECLARE base jsonb; v jsonb;
BEGIN
 base:='{"version":"research-late-facts-v1","operationKey":"late:op-1","projectId":"11111111-1111-4111-8111-111111111111",
  "reservationId":"22222222-2222-4222-8222-222222222222","expected":{"attemptId":"55555555-5555-4555-8555-555555555555",
  "nativeSessionId":"sophia-55555555-5555-4555-8555-555555555555","callId":"llm-1","runtimeUnitId":"sophia-runtime-test",
  "runtimeId":"66666666-6666-4666-8666-666666666666","resourceId":"77777777-7777-4777-8777-777777777777","operation":"research",
  "provider":"openai-research","accountId":null,"grantId":null,"allowanceId":"33333333-3333-4333-8333-333333333333",
  "fenceId":"99999999-9999-4999-8999-999999999990","generation":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"report":{"attemptId":"55555555-5555-4555-8555-555555555555","nativeSessionId":"sophia-55555555-5555-4555-8555-555555555555",
  "reservationId":"22222222-2222-4222-8222-222222222222","outcome":"uncertain","evidence":{}},
  "authorityId":"44444444-4444-4444-8444-444444444444","evidenceRef":"synthetic"}';
 FOR v IN SELECT x FROM unnest(ARRAY[
   base||'{"extra":1}', base-'operationKey', jsonb_set(base,'{operationKey}','"has space"'), jsonb_set(base,'{version}','"research-late-facts-v2"'),
   jsonb_set(base,'{expected,extra}','1'), base#-'{expected,generation}', jsonb_set(base,'{expected,generation}','"AAAA"'),
   jsonb_set(base,'{expected,generation}','7'), base#-'{expected,fenceId}', jsonb_set(base,'{expected,fenceId}','"not-a-uuid"'),
   jsonb_set(base,'{expected,operation}','"chat"'), jsonb_set(base,'{report,providerRequestId}','"x"'), base#-'{report,evidence}',
   jsonb_set(base,'{report,attemptId}','"99999999-9999-4999-8999-999999999999"'), jsonb_set(base,'{report,outcome}','"settled"'),
   jsonb_set(jsonb_set(base,'{report,outcome}','"settled"'),'{report,costUsd}','"0.01"'),
   jsonb_set(base,'{report,costUsd}','0.01'), jsonb_set(base,'{report,reservationId}','"11111111-1111-4111-8111-111111111111"'),
   jsonb_set(base,'{evidenceRef}','""')]::jsonb[]) x LOOP
  BEGIN
   PERFORM sophia.record_research_late_facts(v);
   RAISE EXCEPTION 'accepted malformed late-fact input %', v USING ERRCODE='P0001';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
 END LOOP;
 BEGIN
  PERFORM sophia.record_research_late_facts(jsonb_set(base,'{report,evidence}',jsonb_build_object('pad',repeat('x',262145))));
  RAISE EXCEPTION 'accepted an over-bound late report' USING ERRCODE='P0001';
 EXCEPTION WHEN program_limit_exceeded THEN NULL;
 END;
 -- A well-formed input naming no tracked call refuses (and writes nothing).
 BEGIN
  PERFORM sophia.record_research_late_facts(base);
  RAISE EXCEPTION 'accepted late facts for no tracked call' USING ERRCODE='P0001';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM sophia.research_late_fact_operations) THEN RAISE EXCEPTION 'a refused late-fact input left a record'; END IF;
END $$;

-- R2: the late-fact record keeps its original-generation basis consistent with its fence (P03) and a reported claim that
-- is only ever reported_unverified, with a cost exactly when the claim is settled (P02). Each variant violates one CHECK.
DO $$
DECLARE v text;
BEGIN
 FOREACH v IN ARRAY ARRAY[
   'NULL,''fence'',''settled'',0.01,''reported_unverified''',
   '''99999999-9999-4999-8999-999999999990'',''runtime_revoked'',''settled'',0.01,''reported_unverified''',
   'NULL,''runtime_revoked'',''settled'',0.01,''provider_billed_attestation''',
   'NULL,''runtime_revoked'',''settled'',NULL,''reported_unverified''',
   'NULL,''runtime_revoked'',''uncertain'',0.01,''reported_unverified''',
   'NULL,''billed'',''uncertain'',NULL,''reported_unverified'''] LOOP
  BEGIN
   EXECUTE 'INSERT INTO sophia.research_late_fact_operations(operation_key,project_id,reservation_id,fence_id,generation,original_runtime_id,'
    ||'original_basis,reported_outcome,reported_cost_usd,reported_basis,money_state,money_settled_usd,authority_id,input,digest,result) '
    ||'SELECT ''late:check'',gen_random_uuid(),gen_random_uuid(),'||split_part(v,',',1)||',repeat(''a'',64),gen_random_uuid(),'
    ||split_part(v,',',2)||','||split_part(v,',',3)||','||split_part(v,',',4)||','||split_part(v,',',5)
    ||',''reserved'',NULL,gen_random_uuid(),''{}'',repeat(''b'',64),''{}''';
   RAISE EXCEPTION 'the late-fact record accepted %', v USING ERRCODE='P0001';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
 END LOOP;
 -- P03-A: a fence implies a generation (a no-link resource has neither).
 BEGIN
  INSERT INTO sophia.research_late_fact_operations(operation_key,project_id,reservation_id,fence_id,generation,original_runtime_id,
   original_basis,reported_outcome,reported_cost_usd,reported_basis,money_state,money_settled_usd,authority_id,input,digest,result)
  SELECT 'late:check',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),NULL,gen_random_uuid(),'fence','uncertain',NULL,
   'reported_unverified','reserved',NULL,gen_random_uuid(),'{}',repeat('b',64),'{}';
  RAISE EXCEPTION 'the late-fact record accepted a fence without a generation' USING ERRCODE='P0001';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
