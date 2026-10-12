-- CON-01 G1 (0048): saved project conversations at the SQL boundary. Run against a disposable database with every
-- migration installed (pnpm test:sql). Never use production. Everything below rolls back.
-- * A member of another project reads none of a project's conversations, messages, replies or settings, directly.
-- * sophia_api has no write grant on any conversation table and cannot read the request records at all.
-- * No login may call the operator's switch.
BEGIN;
INSERT INTO sophia.projects(id,title,created_by) VALUES
 ('48000000-0000-0000-0000-000000000001','Project A','00000000-0000-0000-0000-00000000004a'),
 ('48000000-0000-0000-0000-000000000002','Project B','00000000-0000-0000-0000-00000000004b');
INSERT INTO sophia.project_members(project_id,actor_id,role) VALUES
 ('48000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000004a','editor'),
 ('48000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000004b','admin');
SELECT sophia.set_conversation_settings('48000000-0000-0000-0000-000000000001','enabled','CON-01 SQL test');
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-00000000004a',true);
DO $$ DECLARE r jsonb; BEGIN
 r:=sophia.start_conversation('48000000-0000-0000-0000-000000000001','sql-key','Onboarding','First words',true,'a@example.test');
 IF r->>'sophia'<>'asked' OR r->>'replyId' IS NULL THEN RAISE EXCEPTION 'Start receipt wrong: %', r; END IF;
 IF (SELECT count(*) FROM sophia.conversations)<>1 OR (SELECT count(*) FROM sophia.conversation_messages)<>1
  OR (SELECT count(*) FROM sophia.conversation_replies)<>1 OR (SELECT count(*) FROM sophia.conversation_settings)<>1 THEN
  RAISE EXCEPTION 'A member does not read their project''s conversation'; END IF;
END $$;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-00000000004b',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM sophia.conversations)<>0 OR (SELECT count(*) FROM sophia.conversation_messages)<>0
  OR (SELECT count(*) FROM sophia.conversation_replies)<>0 OR (SELECT count(*) FROM sophia.conversation_settings)<>0 THEN
  RAISE EXCEPTION 'Cross-project conversation RLS failed'; END IF;
END $$;
DO $$ BEGIN
 BEGIN
  PERFORM 1 FROM sophia.conversation_requests;
  RAISE EXCEPTION 'The API reads the request records';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO sophia.conversation_messages(project_id,conversation_id,seq,author,actor_id,body)
  SELECT project_id,id,99,'member','00000000-0000-0000-0000-00000000004b','forged' FROM sophia.conversations;
  RAISE EXCEPTION 'The API writes a message directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE sophia.conversation_settings SET state='enabled';
  RAISE EXCEPTION 'The API writes the setting directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM sophia.set_conversation_settings('48000000-0000-0000-0000-000000000002','enabled','self-granted');
  RAISE EXCEPTION 'The API calls the operator switch';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
