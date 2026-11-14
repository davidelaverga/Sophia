-- INC04-S03b B2 (0108): provider-reported model evidence. Run against a disposable database with every migration
-- installed (pnpm test:sql). Never use production. Everything below rolls back. Every report is SYNTHETIC, in the shape
-- of the carried producer patch: nothing here is a provider's report or qualifies a T3 install, route or account.
-- * Privileges: only the worker executes the recorder; no application role executes a helper or touches the table.
-- * The seal: no direct insert (even by the owner), no truncate. Row-level update and delete refusals, the recorder's
--   journal, state, kind, cap, change-only and concurrency rules run through real operations in
--   packages/persistence/src/runner-operations.db.test.ts.
-- * The checks agree with runner-model-report.ts: integers by value (1, 1.0, 1e0 alike), UTF-16 length and order over
--   code points (never a collation), JavaScript's trim set, C0/C1 in model ids only, the producer's attempt order and
--   relations, and the canonical form.
BEGIN;

-- --- privileges ------------------------------------------------------------------------------------------------------
DO $$ DECLARE f text; r text; BEGIN
 FOREACH f IN ARRAY ARRAY['sophia.owner_runner_model_cps(text)','sophia.owner_runner_model_key(text)',
   'sophia.owner_runner_model_space(integer)','sophia.owner_runner_model_attempt_id(jsonb)',
   'sophia.owner_runner_model_native_id(jsonb)','sophia.owner_runner_model_model_id(jsonb)',
   'sophia.owner_runner_model_int(jsonb,bigint)','sophia.owner_runner_model_keys(jsonb,text[])',
   'sophia.owner_runner_model_enum(jsonb,text[])','sophia.owner_runner_model_canonical(jsonb)',
   'sophia.owner_runner_model_immutable()','sophia.owner_runner_model_sealed()'] LOOP
  FOREACH r IN ARRAY ARRAY['sophia_api','sophia_worker','sophia_conversation_assembler'] LOOP
   IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION '% may execute %', r, f; END IF;
  END LOOP;
 END LOOP;
 FOREACH f IN ARRAY ARRAY['sophia.owner_runner_record_models(uuid,uuid,uuid,jsonb)','sophia.owner_runner_model_canonical(jsonb)',
   'sophia.owner_runner_model_int(jsonb,bigint)'] LOOP
  IF EXISTS(SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid=f::regprocedure AND a.grantee=0) THEN RAISE EXCEPTION 'PUBLIC may execute %', f; END IF;
 END LOOP;
 IF NOT has_function_privilege('sophia_worker','sophia.owner_runner_record_models(uuid,uuid,uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'The worker cannot record model evidence'; END IF;
 FOREACH r IN ARRAY ARRAY['sophia_api','sophia_conversation_assembler'] LOOP
  IF has_function_privilege(r,'sophia.owner_runner_record_models(uuid,uuid,uuid,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION '% may record model evidence', r; END IF;
 END LOOP;
 FOREACH r IN ARRAY ARRAY['sophia_api','sophia_worker','sophia_conversation_assembler'] LOOP
  IF has_table_privilege(r,'sophia.owner_runner_model_reports','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   THEN RAISE EXCEPTION '% may use the evidence table', r; END IF;
 END LOOP;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='sophia.owner_runner_model_reports'::regclass) THEN
  RAISE EXCEPTION 'Row security is off'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='sophia.owner_runner_record_models(uuid,uuid,uuid,jsonb)'::regprocedure)
  IS NOT TRUE THEN RAISE EXCEPTION 'The recorder must run as its definer'; END IF;
END $$;

-- --- the seal: no direct insert (even the owner's, even an orphan row), no truncate --------------------------------------
DO $$ BEGIN
 BEGIN
  INSERT INTO sophia.owner_runner_model_reports(project_id, operation_id, seq, state, evidence_sha256, owner_id,
   connection_id, connection_revision, resource_id, goal_id, attempt_id, binding_id, qualification_id,
   qualification_revision, profile_id, profile_revision, adapter_pin, environment_ref, envelope_version, operation_kind,
   operation_revision, gateway_journal_id)
  VALUES (gen_random_uuid(), gen_random_uuid(), 1, 'absent', repeat('0',64), gen_random_uuid(), gen_random_uuid(), 1,
   gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, 'p', 1, 'pin', 'env',
   2, 'create', 1, gen_random_uuid());
  RAISE EXCEPTION 'A direct insert was accepted';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
 BEGIN
  TRUNCATE sophia.owner_runner_model_reports;
  RAISE EXCEPTION 'A truncate was accepted';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
 BEGIN
  PERFORM sophia.owner_runner_record_models(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), '{"state":"absent"}');
  RAISE EXCEPTION 'An unknown operation was accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN
  PERFORM sophia.owner_runner_record_models(NULL, gen_random_uuid(), gen_random_uuid(), '{"state":"absent"}');
  RAISE EXCEPTION 'A NULL target was accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
END $$;

-- --- integers by value ---------------------------------------------------------------------------------------------------
DO $$ DECLARE v text; BEGIN
 FOREACH v IN ARRAY ARRAY['1','1.0','1.00','1e0','10e-1','0.1e1'] LOOP
  IF sophia.owner_runner_model_int(v::jsonb,1) IS DISTINCT FROM 1 THEN RAISE EXCEPTION '% is not 1', v; END IF;
 END LOOP;
 IF sophia.owner_runner_model_int('9007199254740991',0)<>9007199254740991 THEN RAISE EXCEPTION '2^53-1 refused'; END IF;
 FOREACH v IN ARRAY ARRAY['9007199254740992','1.5','-1','0.999999999999999999999','"1"','true','null','[1]',
   '1e100'] LOOP
  IF sophia.owner_runner_model_int(v::jsonb,0) IS NOT NULL THEN RAISE EXCEPTION '% accepted as a count', v; END IF;
 END LOOP;
 IF sophia.owner_runner_model_int('0',1) IS NOT NULL OR sophia.owner_runner_model_int('0',0)<>0 THEN
  RAISE EXCEPTION 'The positive floor is wrong'; END IF;
END $$;

-- --- strings: UTF-16 length and order, the trim set, controls -------------------------------------------------------------
DO $$ BEGIN
 -- Order by UTF-16 code unit: a supplementary character (high surrogate D83D) before U+E000; never a collation.
 IF NOT sophia.owner_runner_model_key(U&'\+01F600')<sophia.owner_runner_model_key(U&'\E000') THEN
  RAISE EXCEPTION 'U+1F600 must sort before U+E000'; END IF;
 IF NOT (sophia.owner_runner_model_key('B')<sophia.owner_runner_model_key('a')
    AND sophia.owner_runner_model_key('a')<sophia.owner_runner_model_key('ab')) THEN
  RAISE EXCEPTION 'Code-unit order is wrong'; END IF;
 -- Model ids: 1-200 UTF-16 units (a supplementary character counts twice), trimmed, no C0/C1.
 IF NOT (sophia.owner_runner_model_model_id(to_jsonb(repeat(U&'\00E9',200)))
    AND sophia.owner_runner_model_model_id(to_jsonb(repeat(U&'\+01F600',100)))
    AND sophia.owner_runner_model_model_id(to_jsonb('model'||U&'\00A0'||'x'))) THEN
  RAISE EXCEPTION 'A valid model id was refused'; END IF;
 IF sophia.owner_runner_model_model_id(to_jsonb(repeat(U&'\00E9',201)))
    OR sophia.owner_runner_model_model_id(to_jsonb(repeat(U&'\+01F600',100)||'a'))
    OR sophia.owner_runner_model_model_id('""')
    OR sophia.owner_runner_model_model_id(to_jsonb(U&'\00A0'||'m')) OR sophia.owner_runner_model_model_id(to_jsonb('m'||U&'\3000'))
    OR sophia.owner_runner_model_model_id(to_jsonb('m'||U&'\FEFF')) OR sophia.owner_runner_model_model_id(to_jsonb('m'||U&'\2028'))
    OR sophia.owner_runner_model_model_id(to_jsonb('m'||chr(127)||'x')) OR sophia.owner_runner_model_model_id(to_jsonb('m'||chr(133)||'x'))
    OR sophia.owner_runner_model_model_id(to_jsonb('m'||chr(1)||'x')) OR sophia.owner_runner_model_model_id('1') THEN
  RAISE EXCEPTION 'An invalid model id was accepted'; END IF;
 -- Attempt ids: trimmed and non-empty, controls are data, unbounded.
 IF NOT (sophia.owner_runner_model_attempt_id(to_jsonb('a'||chr(1)||'x'))
    AND sophia.owner_runner_model_attempt_id(to_jsonb(repeat('x',5000)))) THEN
  RAISE EXCEPTION 'A valid attempt id was refused'; END IF;
 IF sophia.owner_runner_model_attempt_id('" a"') OR sophia.owner_runner_model_attempt_id(to_jsonb('a'||chr(10)))
    OR sophia.owner_runner_model_attempt_id('""') THEN RAISE EXCEPTION 'An untrimmed attempt id was accepted'; END IF;
 -- Thread and run ids as the receipt holds them: non-blank.
 IF NOT sophia.owner_runner_model_native_id('" x "') OR sophia.owner_runner_model_native_id('"  "') THEN
  RAISE EXCEPTION 'The native id check is wrong'; END IF;
END $$;

-- --- the canonical report -------------------------------------------------------------------------------------------------
CREATE TEMP TABLE r0108(name text PRIMARY KEY, body jsonb) ON COMMIT DROP;
INSERT INTO r0108 VALUES ('valid', '{"state":"collected","threadId":"t-1","runId":"r-1","collectedAt":"c",
 "activeAttemptId":"a2","attemptPolicy":"latest_by_attempt_ordinal","attemptLimit":8,"attemptsOwned":2,"attemptsOmitted":0,
 "attempts":[{"attemptId":"a2","attemptOrdinal":2,"reason":"steering_restart","status":"completed","active":true,
  "providerInstanceId":"claudeAgent","rootTurns":3,"terminalRootTurns":2,"reportingRootTurns":1,"unboundTurns":0,
  "modelEvidence":"reported","models":["B","a"],"modelsOmitted":0,"excludedModelValues":1},
 {"attemptId":"a1","attemptOrdinal":1,"reason":"initial","status":"superseded","active":false,
  "providerInstanceId":"claudeAgent","rootTurns":1,"terminalRootTurns":1,"reportingRootTurns":0,"unboundTurns":0,
  "modelEvidence":"unknown","models":[],"modelsOmitted":0,"excludedModelValues":0}]}');

DO $$ DECLARE v jsonb:=(SELECT body FROM r0108 WHERE name='valid'); c jsonb; bad jsonb; BEGIN
 c:=sophia.owner_runner_model_canonical(v);
 IF c IS NULL OR c<>v THEN RAISE EXCEPTION 'The valid report is not its own canonical form: %', c; END IF;
 -- Integral spellings canonicalize to the same report (and so the same digest).
 IF sophia.owner_runner_model_canonical(jsonb_set(jsonb_set(v,'{attemptLimit}','8.0'),'{attempts,0,rootTurns}','3e0'))<>c THEN
  RAISE EXCEPTION '1.0 and 1 are not the same report'; END IF;
 IF sophia.owner_runner_model_canonical(v-'collectedAt'||'{"collectedAt":"other"}')-'collectedAt'<>c-'collectedAt' THEN
  RAISE EXCEPTION 'collectedAt changed the rest'; END IF;
 -- Each of these breaks the producer's contract or relations: no canonical form.
 FOREACH bad IN ARRAY ARRAY[
   v||'{"evidence":"collected"}', v-'state'||'{"evidence":"collected"}', v||'{"accepted":true}',
   jsonb_set(v,'{attemptLimit}','8.5'), jsonb_set(v,'{attemptLimit}','0'), jsonb_set(v,'{attemptsOwned}','3'),
   jsonb_set(v,'{attempts,0,models}','["a","B"]'), jsonb_set(v,'{attempts,0,models}','["a","a"]'),
   jsonb_set(v,'{attempts,0,models}','[]'), jsonb_set(v,'{attempts,0,reportingRootTurns}','0'),
   jsonb_set(v,'{attempts,0,terminalRootTurns}','4'), jsonb_set(v,'{attempts,0,modelsOmitted}','1'),
   jsonb_set(v,'{attempts,0,active}','false'), jsonb_set(v,'{attempts,1,active}','true'),
   jsonb_set(v,'{attempts,0,attemptOrdinal}','1'), jsonb_set(v,'{attempts,1,attemptId}','"a2"'),
   jsonb_set(v,'{attempts,0,providerInstanceId}','"9bad"'), jsonb_set(v,'{attempts,0,reason}','"other"'),
   jsonb_set(v,'{attempts,0,effort}','"high"'), jsonb_set(v,'{threadId}','" "'), jsonb_set(v,'{runId}','1'),
   jsonb_set(v,'{attempts,0,models}',to_jsonb(ARRAY[repeat('x',201)]))] LOOP
  IF sophia.owner_runner_model_canonical(bad) IS NOT NULL THEN RAISE EXCEPTION 'Accepted: %', bad; END IF;
 END LOOP;
 -- Ties: equal ordinals ordered by id code unit (the producer's comparator), refused the other way round.
 v:=jsonb_set(jsonb_set(v,'{attempts,1,attemptOrdinal}','2'),'{attempts,1,attemptId}','"a3"');
 IF sophia.owner_runner_model_canonical(v) IS NULL THEN RAISE EXCEPTION 'An ordered tie was refused'; END IF;
 v:=jsonb_set(v,'{attempts,1,attemptId}','"a1"');
 IF sophia.owner_runner_model_canonical(v) IS NOT NULL THEN RAISE EXCEPTION 'A misordered tie was accepted'; END IF;
 -- An unavailable report keeps only its reason and time.
 IF sophia.owner_runner_model_canonical('{"state":"unavailable","threadId":"t","runId":"r","reason":"attempts_not_loaded",
     "collectedAt":"x"}') IS NULL
    OR sophia.owner_runner_model_canonical('{"state":"unavailable","threadId":"t","runId":"r","reason":"other",
     "collectedAt":"x"}') IS NOT NULL THEN RAISE EXCEPTION 'The unavailable check is wrong'; END IF;
END $$;

ROLLBACK;
