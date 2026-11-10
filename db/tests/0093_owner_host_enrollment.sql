-- INC01-CC-003 S1a (0093): owner-host enrollment at the SQL boundary. Run against a disposable database with every
-- migration installed (pnpm test:sql). Never use production. Everything below rolls back.
-- * No application role reads or writes the three tables directly; each role calls only its own functions.
-- * A pairing is one-use, expiring and the owner's own; a lost redemption reply is answered with the same host.
-- * A hello identity is bound once and never changed; retire, revoke and re-pairing fence a host.
-- The GO ledger over real 0092 operations is exercised in packages/persistence/src/owner-host-enrollment.db.test.ts.
BEGIN;
INSERT INTO sophia.execution_connections(id,owner_id,upstream_origin,state) VALUES
 ('93000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000093a1','t3','linked'),
 ('93000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000093b1','t3','linked'),
 ('93000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000093a1','t3','revoked');
-- An expired pairing, made directly (as the migration owner) so its clock is in the past.
INSERT INTO sophia.owner_host_pairings(owner_id,connection_id,code_sha256,created_at,expires_at) VALUES
 ('00000000-0000-0000-0000-0000000093a1','93000000-0000-0000-0000-0000000000c1',sha256('expired-code'),
  now()-interval '20 minutes',now()-interval '11 minutes');

-- --- the tables are reachable only through the functions ---------------------------------------------------------
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-0000000093a1',true);
DO $$ BEGIN
 BEGIN PERFORM 1 FROM sophia.owner_host_pairings; RAISE EXCEPTION 'The API reads pairings directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM 1 FROM sophia.owner_hosts; RAISE EXCEPTION 'The API reads hosts directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM 1 FROM sophia.owner_host_exchanges; RAISE EXCEPTION 'The API reads exchanges directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.owner_host_enqueue('00000000-0000-0000-0000-0000000093a1','env',gen_random_uuid(),'observe','x','{}',5000);
  RAISE EXCEPTION 'The API enqueues an exchange';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.owner_host_settle('00000000-0000-0000-0000-0000000093a1',gen_random_uuid());
  RAISE EXCEPTION 'The API settles an exchange';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.owner_host_fence_new_work(gen_random_uuid(),'x'); RAISE EXCEPTION 'The API calls the fence helper';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.owner_host_authenticate(sha256('x')); RAISE EXCEPTION 'The API calls authenticate directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE sophia_worker;
-- r5 (HOST-S1A-R4-F02): enqueue refuses a null or wrongly typed version, kind or id at validation (by its own message:
-- a request that passed validation would be refused later, for its operation, under the same SQLSTATE).
DO $$ DECLARE j uuid:='93000000-0000-0000-0000-0000000000aa'; o text:='93000000-0000-0000-0000-0000000000ab';
 req jsonb:=jsonb_build_object('v',1,'kind','observe','journalId','93000000-0000-0000-0000-0000000000aa',
  'projectId','93000000-0000-0000-0000-0000000000ac','operationId','93000000-0000-0000-0000-0000000000ab',
  'digest',repeat('a',64),'envelope','{}'::jsonb);
 bad jsonb; BEGIN
 FOR bad IN SELECT x FROM unnest(ARRAY[jsonb_set(req,'{v}','null'),jsonb_set(req,'{v}','"1"'),req-'v',jsonb_set(req,'{kind}','null'),
   jsonb_set(req,'{journalId}','null'),jsonb_set(req,'{operationId}','5'),jsonb_set(req,'{envelope}','null')]) x LOOP
  BEGIN PERFORM sophia.owner_host_enqueue('00000000-0000-0000-0000-0000000093a1','env-a',j,'observe','observe:'||o||':'||gen_random_uuid(),bad,5000);
   RAISE EXCEPTION 'Malformed request accepted: %', bad;
  EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM<>'Invalid exchange' THEN RAISE EXCEPTION 'Not refused at validation: % (%)', bad, SQLERRM; END IF; END;
 END LOOP;
 BEGIN PERFORM sophia.owner_host_enqueue('00000000-0000-0000-0000-0000000093a1','env-a',j,NULL,'observe:'||o,req,5000);
  RAISE EXCEPTION 'A null kind was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM<>'Invalid exchange' THEN RAISE EXCEPTION 'Null kind: %', SQLERRM; END IF; END;
END $$;
DO $$ BEGIN
 BEGIN PERFORM 1 FROM sophia.owner_host_exchanges; RAISE EXCEPTION 'The worker reads exchanges directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.owner_host_go(sha256('x'),gen_random_uuid()); RAISE EXCEPTION 'The worker grants GO';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.owner_host_redeem(sha256('x'),sha256('y')); RAISE EXCEPTION 'The worker redeems a pairing';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_class WHERE relname IN ('owner_host_pairings','owner_hosts','owner_host_exchanges')
   AND relnamespace='sophia'::regnamespace AND NOT relrowsecurity) THEN RAISE EXCEPTION 'RLS is not enabled'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='sophia' AND tablename LIKE 'owner_host%') THEN
  RAISE EXCEPTION 'An owner-host table has a policy'; END IF;
 IF has_table_privilege('sophia_api','sophia.owner_hosts','SELECT') OR has_table_privilege('sophia_worker','sophia.owner_hosts','SELECT')
    OR has_function_privilege('sophia_api','sophia.owner_host_maintain(integer)','EXECUTE')
    OR has_function_privilege('sophia_worker','sophia.owner_host_create_pairing(uuid,bytea,integer)','EXECUTE') THEN
  RAISE EXCEPTION 'A role holds a privilege it must not'; END IF;
END $$;

-- --- pairing ------------------------------------------------------------------------------------------------------
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-0000000093a1',true);
DO $$ DECLARE r jsonb; BEGIN
 r:=sophia.owner_host_create_pairing('93000000-0000-0000-0000-0000000000c1',sha256('code-one'),300);
 IF r->>'pairingId' IS NULL THEN RAISE EXCEPTION 'No pairing: %', r; END IF;
 -- Another owner's connection answers like a missing one; a revoked connection pairs nothing; bounds hold.
 BEGIN PERFORM sophia.owner_host_create_pairing('93000000-0000-0000-0000-0000000000c2',sha256('code-x'),300);
  RAISE EXCEPTION 'Paired another owner''s connection'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.owner_host_create_pairing('93000000-0000-0000-0000-0000000000c3',sha256('code-x'),300);
  RAISE EXCEPTION 'Paired a revoked connection'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sophia.owner_host_create_pairing('93000000-0000-0000-0000-0000000000c1',sha256('code-x'),601);
  RAISE EXCEPTION 'A pairing outlives 600 seconds'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sophia.owner_host_create_pairing('93000000-0000-0000-0000-0000000000c1','\x00'::bytea,300);
  RAISE EXCEPTION 'A short code hash was accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 r:=sophia.owner_host_create_pairing('93000000-0000-0000-0000-0000000000c1',sha256('code-revoked'),300);
 r:=sophia.owner_host_revoke_pairing((r->>'pairingId')::uuid);
 IF r->>'result'<>'revoked' THEN RAISE EXCEPTION 'Revoke pairing: %', r; END IF;
END $$;
-- No actor: nothing.
SELECT set_config('sophia.actor_id','',true);
DO $$ BEGIN
 BEGIN PERFORM sophia.owner_host_create_pairing('93000000-0000-0000-0000-0000000000c1',sha256('code-y'),300);
  RAISE EXCEPTION 'Paired with no actor'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF sophia.owner_host_list() IS NOT NULL THEN RAISE EXCEPTION 'Listed with no actor'; END IF;
END $$;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-0000000093a1',true);
DO $$ DECLARE l jsonb; BEGIN
 l:=sophia.owner_host_list();
 IF jsonb_array_length(l->'pairings')<>3 OR l::text ~ 'code|sha256|capability'
    OR (SELECT count(*) FROM jsonb_array_elements(l->'pairings') e WHERE (e->>'revoked')::boolean)<>1 THEN
  RAISE EXCEPTION 'Unsafe or wrong list: %', l; END IF;
END $$;
-- Another owner sees none of it and revokes none of it.
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-0000000093b1',true);
DO $$ BEGIN
 IF jsonb_array_length(sophia.owner_host_list()->'pairings')<>0 THEN RAISE EXCEPTION 'Cross-owner pairing list'; END IF;
END $$;

-- --- redemption (the host: no actor, a capability hash) -----------------------------------------------------------
SELECT set_config('sophia.actor_id','',true);
DO $$ DECLARE r jsonb; r2 jsonb; BEGIN
 r:=sophia.owner_host_redeem(sha256('code-one'),sha256('cap-one'));
 IF r->>'result'<>'bound' OR (r->>'replayed')::boolean OR r->>'ownerId'<>'00000000-0000-0000-0000-0000000093a1' THEN
  RAISE EXCEPTION 'Redeem: %', r; END IF;
 -- The reply was lost: the same code and capability answer the same host, with no new host.
 r2:=sophia.owner_host_redeem(sha256('code-one'),sha256('cap-one'));
 IF r2->>'result'<>'bound' OR NOT (r2->>'replayed')::boolean OR r2->>'hostId'<>r->>'hostId' THEN RAISE EXCEPTION 'Replay: %', r2; END IF;
 -- Replay with another capability, expiry, revocation and an unknown code: refused.
 r2:=sophia.owner_host_redeem(sha256('code-one'),sha256('cap-other'));
 IF r2->>'result'<>'refused' OR r2->>'reason' !~ 'already used' THEN RAISE EXCEPTION 'Second capability: %', r2; END IF;
 r2:=sophia.owner_host_redeem(sha256('expired-code'),sha256('cap-other'));
 IF r2->>'result'<>'refused' OR r2->>'reason' !~ 'expired' THEN RAISE EXCEPTION 'Expired: %', r2; END IF;
 r2:=sophia.owner_host_redeem(sha256('code-revoked'),sha256('cap-other'));
 IF r2->>'result'<>'refused' OR r2->>'reason' !~ 'revoked' THEN RAISE EXCEPTION 'Revoked pairing: %', r2; END IF;
 r2:=sophia.owner_host_redeem(sha256('no-such-code'),sha256('cap-other'));
 IF r2->>'result'<>'refused' THEN RAISE EXCEPTION 'Unknown code: %', r2; END IF;
 -- A bound host with no hello is delivered nothing.
 IF sophia.owner_host_poll(sha256('cap-one'),10,15)<>'[]'::jsonb THEN RAISE EXCEPTION 'Delivered before hello'; END IF;
 -- An unknown capability is not authenticated.
 BEGIN PERFORM sophia.owner_host_poll(sha256('cap-nobody'),10,15); RAISE EXCEPTION 'Unknown capability polled';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- --- hello: bound once, immutable ---------------------------------------------------------------------------------
DO $$ DECLARE h jsonb:=jsonb_build_object('v',1,'journalId','93000000-0000-0000-0000-00000000003a','environmentRef','env-a',
  'adapterPin',repeat('a',40),'profileId','claude-ro','profileRevision',1,'accountKey','acct-a','t3Namespace','client:sess-a');
 r jsonb; bad jsonb; BEGIN
 -- r5 (HOST-S1A-R4-F02): exactly the JSON number 1 and typed fields, refused before anything is bound. The first valid
 -- hello below must still be `first`, so none of these bound the host.
 FOR bad IN SELECT x FROM unnest(ARRAY[jsonb_set(h,'{v}','null'),jsonb_set(h,'{v}','"1"'),jsonb_set(h,'{v}','2'),
   jsonb_set(h,'{v}','true'),jsonb_set(h,'{v}','1.5'),h-'v',jsonb_set(h,'{environmentRef}','5'),jsonb_set(h,'{journalId}','null'),
   jsonb_set(h,'{profileId}','7'),jsonb_set(h,'{accountKey}','{"k":1}'),jsonb_set(h,'{t3Namespace}','null'),
   jsonb_set(h,'{profileRevision}','null'),'null'::jsonb,'[]'::jsonb,'{}'::jsonb]) x LOOP
  BEGIN PERFORM sophia.owner_host_hello(sha256('cap-one'),bad); RAISE EXCEPTION 'Malformed hello accepted: %', bad;
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 BEGIN PERFORM sophia.owner_host_hello(sha256('cap-one'),NULL); RAISE EXCEPTION 'SQL NULL hello accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 r:=sophia.owner_host_hello(sha256('cap-one'),h);
 IF r->>'result'<>'ok' OR NOT (r->>'first')::boolean OR r->>'state'<>'active' THEN RAISE EXCEPTION 'First hello: %', r; END IF;
 r:=sophia.owner_host_hello(sha256('cap-one'),h);
 IF r->>'result'<>'ok' OR (r->>'first')::boolean THEN RAISE EXCEPTION 'Same hello: %', r; END IF;
 -- A changed namespace or journal is never adopted.
 r:=sophia.owner_host_hello(sha256('cap-one'),jsonb_set(jsonb_set(h,'{t3Namespace}','"client:sess-b"'),'{journalId}',
  '"93000000-0000-0000-0000-00000000003b"'));
 IF r->>'result'<>'conflict' OR NOT (r->'changed' ? 't3Namespace') OR NOT (r->'changed' ? 'journalId') THEN
  RAISE EXCEPTION 'Changed hello: %', r; END IF;
 IF sophia.owner_host_poll(sha256('cap-one'),10,15)<>'[]'::jsonb THEN RAISE EXCEPTION 'Delivered after a conflicting hello'; END IF;
 -- An extra key, a missing key, a wrong version or a namespace not of T3's client form: invalid.
 BEGIN PERFORM sophia.owner_host_hello(sha256('cap-one'),h||'{"bearer":"x"}'); RAISE EXCEPTION 'Extra hello key';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sophia.owner_host_hello(sha256('cap-one'),h-'accountKey'); RAISE EXCEPTION 'Missing hello key';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sophia.owner_host_hello(sha256('cap-one'),jsonb_set(h,'{t3Namespace}','"mcp-session-1"')); RAISE EXCEPTION 'Bad namespace';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sophia.owner_host_hello(sha256('cap-one'),jsonb_set(h,'{profileRevision}','"1"')); RAISE EXCEPTION 'String revision';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 -- The matching hello restores delivery.
 r:=sophia.owner_host_hello(sha256('cap-one'),h);
 IF r->>'result'<>'ok' THEN RAISE EXCEPTION 'Matching hello after a conflict: %', r; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM sophia.owner_hosts)<>1 OR (SELECT t3_namespace FROM sophia.owner_hosts)<>'client:sess-a'
    OR NOT (SELECT hello_ok FROM sophia.owner_hosts) THEN RAISE EXCEPTION 'The bound identity changed'; END IF;
 IF (SELECT count(*) FROM sophia.owner_host_pairings WHERE consumed_at IS NOT NULL)<>1 THEN RAISE EXCEPTION 'Consumed count'; END IF;
END $$;

-- --- the worker finds the active host; re-pairing retires it; revoking kills its capability -----------------------
SET LOCAL ROLE sophia_worker;
DO $$ BEGIN
 IF sophia.owner_host_runner('00000000-0000-0000-0000-0000000093a1','env-a')->>'journalId'<>'93000000-0000-0000-0000-00000000003a' THEN
  RAISE EXCEPTION 'Runner lookup'; END IF;
 IF sophia.owner_host_runner('00000000-0000-0000-0000-0000000093b1','env-a') IS NOT NULL THEN RAISE EXCEPTION 'Cross-owner runner'; END IF;
 -- An exchange for an operation that is not the runner's is invalid, not queued.
 BEGIN PERFORM sophia.owner_host_enqueue('00000000-0000-0000-0000-0000000093a1','env-a','93000000-0000-0000-0000-00000000003a',
   'observe','observe:93000000-0000-0000-0000-0000000000f1',jsonb_build_object('v',1,'kind','observe',
   'journalId','93000000-0000-0000-0000-00000000003a','operationId','93000000-0000-0000-0000-0000000000f1',
   'projectId','93000000-0000-0000-0000-0000000000f2','digest',repeat('0',64),'envelope','{}'::jsonb),5000);
  RAISE EXCEPTION 'Enqueued a stranger''s operation'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-0000000093a1',true);
DO $$ DECLARE r jsonb; BEGIN
 PERFORM sophia.owner_host_create_pairing('93000000-0000-0000-0000-0000000000c1',sha256('code-two'),300);
 PERFORM set_config('sophia.actor_id','',true);
 r:=sophia.owner_host_redeem(sha256('code-two'),sha256('cap-two'));
 IF r->>'result'<>'bound' THEN RAISE EXCEPTION 'Re-pair: %', r; END IF;
 -- A capability is bound to one host only.
 PERFORM set_config('sophia.actor_id','00000000-0000-0000-0000-0000000093a1',true);
 PERFORM sophia.owner_host_create_pairing('93000000-0000-0000-0000-0000000000c1',sha256('code-three'),300);
 PERFORM set_config('sophia.actor_id','',true);
 r:=sophia.owner_host_redeem(sha256('code-three'),sha256('cap-two'));
 IF r->>'result'<>'refused' THEN RAISE EXCEPTION 'A capability bound twice: %', r; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT state FROM sophia.owner_hosts WHERE capability_sha256=sha256('cap-one'))<>'retired'
    OR (SELECT state FROM sophia.owner_hosts WHERE capability_sha256=sha256('cap-two'))<>'bound' THEN
  RAISE EXCEPTION 'Re-pairing did not retire the earlier host'; END IF;
 -- The retired host keeps its identity: its journal's operations stay answerable through it.
 IF (SELECT journal_id FROM sophia.owner_hosts WHERE capability_sha256=sha256('cap-one'))<>'93000000-0000-0000-0000-00000000003a' THEN
  RAISE EXCEPTION 'Retirement dropped the journal'; END IF;
END $$;
SET LOCAL ROLE sophia_worker;
DO $$ BEGIN
 IF sophia.owner_host_runner('00000000-0000-0000-0000-0000000093a1','env-a') IS NOT NULL THEN
  RAISE EXCEPTION 'A retired host serves new work'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-0000000093b1',true);
DO $$ BEGIN
 BEGIN PERFORM sophia.owner_host_revoke(gen_random_uuid()); RAISE EXCEPTION 'Revoked a host that is not the actor''s';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-0000000093a1',true);
DO $$ DECLARE hid uuid; r jsonb; BEGIN
 SELECT (e->>'hostId')::uuid INTO hid FROM jsonb_array_elements(sophia.owner_host_list()->'hosts') e WHERE e->>'state'='retired';
 r:=sophia.owner_host_revoke(hid);
 IF r->>'result'<>'revoked' THEN RAISE EXCEPTION 'Revoke: %', r; END IF;
 PERFORM set_config('sophia.actor_id','',true);
 BEGIN PERFORM sophia.owner_host_poll(sha256('cap-one'),10,15); RAISE EXCEPTION 'A revoked capability polled';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- A revoked host's lost redemption reply is not answered as bound.
 r:=sophia.owner_host_redeem(sha256('code-one'),sha256('cap-one'));
 IF r->>'result'<>'refused' THEN RAISE EXCEPTION 'A revoked host redeemed again: %', r; END IF;
END $$;
RESET ROLE;
-- A pairing whose connection was revoked after it was made is refused at redemption.
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-0000000093a1',true);
SELECT sophia.owner_host_create_pairing('93000000-0000-0000-0000-0000000000c1',sha256('code-four'),300);
RESET ROLE;
UPDATE sophia.execution_connections SET state='revoked' WHERE id='93000000-0000-0000-0000-0000000000c1';
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','',true);
DO $$ DECLARE r jsonb; BEGIN
 r:=sophia.owner_host_redeem(sha256('code-four'),sha256('cap-four'));
 IF r->>'result'<>'refused' OR r->>'reason' !~ 'no longer linked' THEN RAISE EXCEPTION 'Redeemed on a revoked connection: %', r; END IF;
END $$;
ROLLBACK;
