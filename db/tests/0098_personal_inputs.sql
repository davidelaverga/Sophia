-- INC03-CC-002 P1 (0098): held Personal inputs at the SQL boundary. Run against a disposable database with every
-- migration installed (pnpm test:sql). Never use production. Everything below rolls back.
-- * A person's held input keeps the words once (a recorded person turn) and metadata only; nothing asks for a reply.
-- * The write is fenced to the epoch it names; the contract is explicit (NULL or anything but automatic_v1: 22023).
-- * Keys share the owner's personal namespace; another person reads nothing; sophia_api writes the table in no way.
BEGIN;
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-00000000098a',true);
DO $$ DECLARE r jsonb; BEGIN
 r:=sophia.send_personal_input('sql-98-1','automatic_v1',0,'Held words');
 IF r->>'input'<>'recorded' OR r->>'effect'<>'none' OR r->>'interactionContract'<>'automatic_v1'
  OR r->>'operation'<>'send_input' OR r->>'inputId' IS NULL OR r->>'turnId' IS NULL THEN
  RAISE EXCEPTION 'Receipt wrong: %', r; END IF;
 IF (SELECT reply FROM sophia.personal_turns WHERE id=(r->>'turnId')::uuid)<>'recorded' THEN
  RAISE EXCEPTION 'The turn is not recorded'; END IF;
 IF (SELECT count(*) FROM sophia.personal_inputs)<>1 OR sophia.next_personal_reply() IS NOT NULL
  OR sophia.claim_personal_reply((r->>'turnId')::uuid) IS NOT NULL THEN
  RAISE EXCEPTION 'Inputs wrong, or the recorded turn is offered for a reply'; END IF;
 IF sophia.send_personal_input('sql-98-1','automatic_v1',0,'Held words')<>r THEN
  RAISE EXCEPTION 'Replay is not the original receipt'; END IF;
END $$;
DO $$ DECLARE c text; BEGIN
 FOREACH c IN ARRAY ARRAY['', 'automatic', 'legacy_explicit_ask'] LOOP
  BEGIN
   PERFORM sophia.send_personal_input('sql-98-c-'||c,c,0,'x');
   RAISE EXCEPTION 'Contract % accepted', c;
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 BEGIN
  PERFORM sophia.send_personal_input('sql-98-null',NULL,0,'x');
  RAISE EXCEPTION 'A NULL contract was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM sophia.send_personal_input('sql-98-epoch','automatic_v1',3,'x');
  RAISE EXCEPTION 'Another epoch was accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM sophia.send_personal_input('sql-98-1','automatic_v1',0,'Other words');
  RAISE EXCEPTION 'Other words under the key were accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM sophia.send_personal_turn('sql-98-1','Held words');
  RAISE EXCEPTION 'The legacy send under the key was accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  INSERT INTO sophia.personal_inputs(owner_id,turn_id,idempotency_key,interaction_contract,contract_version,origin,
   audience,addressing_basis)
  SELECT owner_id,turn_id,'forged',interaction_contract,contract_version,origin,audience,addressing_basis
    FROM sophia.personal_inputs LIMIT 1;
  RAISE EXCEPTION 'sophia_api wrote the table';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM sophia.personal_append_recorded('x');
  RAISE EXCEPTION 'sophia_api called the internal append';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM sophia.personal_turns)<>1 THEN RAISE EXCEPTION 'A refused write kept something'; END IF;
END $$;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-00000000098b',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM sophia.personal_inputs) OR EXISTS(SELECT 1 FROM sophia.personal_turns) THEN
  RAISE EXCEPTION 'Another person reads a held input'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('public','sophia.send_personal_input(text,text,bigint,text)','EXECUTE')
  OR has_function_privilege('public','sophia.personal_append_recorded(text)','EXECUTE')
  OR has_function_privilege('sophia_worker','sophia.send_personal_input(text,text,bigint,text)','EXECUTE')
  OR has_table_privilege('sophia_worker','sophia.personal_inputs','SELECT') THEN
  RAISE EXCEPTION 'A new function or the table is reachable beyond the API'; END IF;
END $$;
ROLLBACK;
