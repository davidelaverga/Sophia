-- INC03-CC-002 S01a (0095): automatic_v1 inputs at the SQL boundary. Run against a disposable database with every
-- migration installed (pnpm test:sql). Never use production. Everything below rolls back.
-- * An editor's automatic start and send record a message, its request and an input each, and nothing that acts.
-- * The contract is explicit: NULL or anything but automatic_v1 is 22023.
-- * sophia_api reads input metadata of its own projects only, and writes the table in no way.
BEGIN;
INSERT INTO sophia.projects(id,title,created_by) VALUES
 ('95000000-0000-0000-0000-000000000001','Project A','00000000-0000-0000-0000-00000000095a'),
 ('95000000-0000-0000-0000-000000000002','Project B','00000000-0000-0000-0000-00000000095b');
INSERT INTO sophia.project_members(project_id,actor_id,role) VALUES
 ('95000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000095a','editor'),
 ('95000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000095b','admin');
SELECT sophia.set_conversation_settings('95000000-0000-0000-0000-000000000001','enabled','INC03-CC-002 SQL test');
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-00000000095a',true);
DO $$ DECLARE s jsonb; m jsonb; BEGIN
 s:=sophia.start_conversation_input('95000000-0000-0000-0000-000000000001','sql-key-1','automatic_v1','Title','First words','A');
 IF s->>'input'<>'recorded' OR s->>'effect'<>'none' OR s->>'interactionContract'<>'automatic_v1' OR s->>'inputId' IS NULL
  OR s ? 'sophia' OR s ? 'replyId' THEN RAISE EXCEPTION 'Start receipt wrong: %', s; END IF;
 m:=sophia.send_conversation_input((s->>'conversationId')::uuid,'sql-key-2','automatic_v1','@Luis stop it','A');
 IF m->>'input'<>'recorded' OR m->>'effect'<>'none' THEN RAISE EXCEPTION 'Send receipt wrong: %', m; END IF;
 IF (SELECT count(*) FROM sophia.saved_conversation_inputs)<>2 OR (SELECT count(*) FROM sophia.conversation_messages)<>2
  OR (SELECT count(*) FROM sophia.conversation_replies)<>0 THEN
  RAISE EXCEPTION 'Inputs, messages or replies wrong'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.saved_conversation_inputs WHERE addressing_basis<>'none' OR reply_target IS NOT NULL
  OR cardinality(structured_mentions)<>0) THEN RAISE EXCEPTION 'Addressing was inferred'; END IF;
 IF sophia.start_conversation_input('95000000-0000-0000-0000-000000000001','sql-key-1','automatic_v1','Title','First words','A')<>s
  THEN RAISE EXCEPTION 'Replay is not the original receipt'; END IF;
END $$;
DO $$ DECLARE c text; BEGIN
 FOREACH c IN ARRAY ARRAY[NULL,'','automatic','legacy_explicit_ask']::text[] LOOP
  BEGIN
   PERFORM sophia.start_conversation_input('95000000-0000-0000-0000-000000000001','sql-key-x',c,'T','x',NULL);
   RAISE EXCEPTION 'Contract % was accepted', coalesce(c,'NULL');
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 BEGIN
  INSERT INTO sophia.saved_conversation_inputs(project_id,conversation_id,message_id,actor_id,idempotency_key,operation,
   interaction_contract,contract_version,origin,audience_kind,settings_policy,settings_revision,message_seq,
   conversation_revision,erasure_revision,writer_role)
  SELECT project_id,conversation_id,message_id,actor_id,'forged',operation,interaction_contract,contract_version,origin,
   audience_kind,settings_policy,settings_revision,message_seq,conversation_revision,erasure_revision,writer_role
   FROM sophia.saved_conversation_inputs LIMIT 1;
  RAISE EXCEPTION 'The API writes an input directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-00000000095b',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM sophia.saved_conversation_inputs)<>0 THEN RAISE EXCEPTION 'Cross-project input RLS failed'; END IF;
END $$;
ROLLBACK;
