-- INC03-CC-002 P2 (0099): a held Personal input is not activity a welcome back is decided on, at the SQL boundary, in
-- the helper and through both greeting steps (begin_personal_greeting, record_personal_greeting) that call it under the
-- space's lock. Run against a disposable database with every migration installed (pnpm test:sql). Never use
-- production. Every person, key and word is synthetic. Everything below rolls back.
BEGIN;
-- The helper as 0021 made it, but for its body: language, volatility, definer, search path, owner, no grant.
DO $$ DECLARE p pg_proc; o pg_proc; BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid='sophia.personal_welcome_due()'::regprocedure;
 SELECT * INTO o FROM pg_proc WHERE oid='sophia.personal_owner()'::regprocedure;
 IF NOT p.prosecdef OR p.provolatile<>'s' OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='sql')
  OR p.prorettype<>'boolean'::regtype OR p.proconfig IS DISTINCT FROM o.proconfig OR p.proowner<>o.proowner THEN
  RAISE EXCEPTION 'personal_welcome_due changed shape: %', row_to_json(p); END IF;
 IF position('recorded' IN p.prosrc)=0 THEN RAISE EXCEPTION 'personal_welcome_due is not 0099''s'; END IF;
 IF has_function_privilege('public','sophia.personal_welcome_due()','EXECUTE')
  OR has_function_privilege('sophia_api','sophia.personal_welcome_due()','EXECUTE')
  OR has_function_privilege('sophia_worker','sophia.personal_welcome_due()','EXECUTE') THEN
  RAISE EXCEPTION 'personal_welcome_due is executable beyond its definer callers'; END IF;
END $$;

-- (a) Empty, and (b) only held words (hours old): no welcome is due, none is claimed or written.
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-00000000099a',true);
DO $$ BEGIN
 IF sophia.begin_personal_greeting('sql-99-a-empty',NULL) ? 'claim' THEN RAISE EXCEPTION 'An empty space is due'; END IF;
 PERFORM sophia.send_personal_input('sql-99-a','automatic_v1',0,'Held words, never asked.');
END $$;
RESET ROLE;
UPDATE sophia.personal_turns SET created_at=now()-interval '3 hours'
 WHERE owner_id='00000000-0000-0000-0000-00000000099a';
DO $$ BEGIN
 IF sophia.personal_welcome_due() THEN RAISE EXCEPTION 'Held words alone made a welcome due'; END IF;
END $$;
SET LOCAL ROLE sophia_api;
DO $$ DECLARE g jsonb; r jsonb; BEGIN
 g:=sophia.begin_personal_greeting('sql-99-a-held',NULL);
 IF g ? 'claim' THEN RAISE EXCEPTION 'Held words alone gave a welcome claim: %', g; END IF;
 r:=sophia.record_personal_greeting('sql-99-a-rec',gen_random_uuid(),NULL,'A welcome nobody is due.');
 IF r->>'turnId' IS NOT NULL OR EXISTS(SELECT 1 FROM sophia.personal_turns WHERE author='sophia') THEN
  RAISE EXCEPTION 'A welcome was written over held words alone'; END IF;
END $$;

-- (c) A quiet legacy conversation, then held words just now: the welcome stays due (held words are not activity); it is
-- claimed and written under the claim, and the held turn is untouched.
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-00000000099c',true);
DO $$ BEGIN PERFORM sophia.send_personal_turn('sql-99-c-legacy','An earlier legacy message.'); END $$;
RESET ROLE;
UPDATE sophia.personal_turns SET created_at=now()-interval '3 hours'
 WHERE owner_id='00000000-0000-0000-0000-00000000099c';
SET LOCAL ROLE sophia_api;
DO $$ DECLARE g jsonb; r jsonb; h jsonb; BEGIN
 h:=sophia.send_personal_input('sql-99-c-held','automatic_v1',0,'Held just now.');
 g:=sophia.begin_personal_greeting('sql-99-c-g',NULL);
 IF NOT g ? 'claim' THEN RAISE EXCEPTION 'Held words just now stopped a due welcome: %', g; END IF;
 r:=sophia.record_personal_greeting('sql-99-c-g',(g->>'claim')::uuid,NULL,'Welcome back.');
 IF r->>'turnId' IS NULL THEN RAISE EXCEPTION 'The claimed welcome was not written: %', r; END IF;
 IF (SELECT reply FROM sophia.personal_turns WHERE id=(h->>'turnId')::uuid)<>'recorded'
  OR (SELECT count(*) FROM sophia.personal_turns WHERE author='sophia')<>1 THEN
  RAISE EXCEPTION 'The welcome changed the held turn, or more than one was written'; END IF;
END $$;

-- (d) Her welcome is the last activity, then held words (hours old): no second welcome is due.
RESET ROLE;
UPDATE sophia.personal_turns SET created_at=now()-interval '2 hours'
 WHERE owner_id='00000000-0000-0000-0000-00000000099c';
SET LOCAL ROLE sophia_api;
DO $$ BEGIN PERFORM sophia.send_personal_input('sql-99-d-held','automatic_v1',0,'Held after her welcome.'); END $$;
RESET ROLE;
UPDATE sophia.personal_turns SET created_at=now()-interval '90 minutes'
 WHERE owner_id='00000000-0000-0000-0000-00000000099c' AND reply='recorded';
DO $$ BEGIN
 IF sophia.personal_welcome_due() THEN RAISE EXCEPTION 'Held words after a welcome made another one due'; END IF;
END $$;

-- (e) Legacy control, unchanged: a claim taken, then a legacy message: the claimed welcome is not written.
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-00000000099e',true);
DO $$ BEGIN PERFORM sophia.send_personal_turn('sql-99-e-legacy','Quiet since.'); END $$;
RESET ROLE;
UPDATE sophia.personal_turns SET created_at=now()-interval '3 hours'
 WHERE owner_id='00000000-0000-0000-0000-00000000099e';
SET LOCAL ROLE sophia_api;
DO $$ DECLARE g jsonb; r jsonb; BEGIN
 g:=sophia.begin_personal_greeting('sql-99-e-g',NULL);
 IF NOT g ? 'claim' THEN RAISE EXCEPTION 'A quiet legacy conversation is not due: %', g; END IF;
 PERFORM sophia.send_personal_turn('sql-99-e-now','Back now.');
 r:=sophia.record_personal_greeting('sql-99-e-g',(g->>'claim')::uuid,NULL,'Welcome back.');
 IF r->>'turnId' IS NOT NULL THEN RAISE EXCEPTION 'A welcome was written after a new legacy message'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
