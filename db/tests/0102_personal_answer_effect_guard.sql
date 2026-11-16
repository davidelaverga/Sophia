-- INC03-CC-003 A2 (0102): the Personal answer effect guard at the SQL boundary. Run against a disposable database with
-- every migration installed (pnpm test:sql). Never use production. Everything below rolls back. Profiles and payers are
-- synthetic: no key, provider or model exists here. Where a state no API writer reaches is needed (a waiting,
-- cancelled or record-only input whose turn is pending; a decision of an older epoch) it is forged here as the
-- migration owner, as a fail-closed control.
-- * 0080's prefix comes first, unchanged: kept (whatever the fresh profile), lost, not_current; nothing is refused.
-- * Legacy turns go to 0080 whatever profile is given. Automatic turns need their latest decision admitted for this
--   turn and epoch, then a profile 0101 accepts and equal to the admitted one in every field and both arguments.
-- * Each refusal is one bounded row per owner, input, decision and epoch; no reservation, binding or decision follows.
BEGIN;
-- The synthetic payers, written as the migration owner (as an operator would): one admitted for each owner.
INSERT INTO sophia.personal_companion_payers(payer,owner_id,allowance_micros)
 VALUES('sql-102-payer','00000000-0000-0000-0000-00000000102a',1000000000),
  ('sql-102-other','00000000-0000-0000-0000-00000000102b',1000000000);
CREATE TEMP TABLE q102(k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
INSERT INTO q102 VALUES('profile',jsonb_build_object('version',1,'owner','00000000-0000-0000-0000-00000000102a',
 'payer','sql-102-payer','routeId','sql-102-route','roleDigest','sha256:'||repeat('a',64),
 'provider','sql-102-provider','model','synthetic-model','reasoningEffort',NULL,'maxTokens',256,
 'prices',jsonb_build_object('input',1,'cacheRead',0.5,'cacheWrite',0.25,'output',2)));
GRANT SELECT, INSERT, UPDATE ON q102 TO sophia_api;

-- The admitted profile; a turn claimed as the companion claims it; a guarded reservation under a registered call.
CREATE FUNCTION pg_temp.q102_p() RETURNS jsonb LANGUAGE sql AS $$ SELECT v FROM q102 WHERE k='profile' $$;
CREATE FUNCTION pg_temp.q102_claim(p_turn uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE c uuid:=sophia.claim_personal_reply(p_turn);
BEGIN
 IF c IS NULL THEN RAISE EXCEPTION 'Turn % was not claimed', p_turn; END IF;
 RETURN c;
END $$;
CREATE FUNCTION pg_temp.q102_reserve(p_turn uuid, p_claim uuid, p_profile jsonb, p_payer text DEFAULT 'sql-102-payer',
 p_route text DEFAULT 'sql-102-route', OUT outcome text, OUT call uuid) LANGUAGE plpgsql AS $$
BEGIN
 call:=gen_random_uuid();
 PERFORM sophia.begin_companion_call(call);
 outcome:=sophia.reserve_personal_answer_guarded(call,p_payer,p_route,100,p_turn,p_claim,p_profile);
END $$;
-- The refusal kept for an input (the caller's own, through RLS), or NULL.
CREATE FUNCTION pg_temp.q102_refusal(p_input uuid) RETURNS sophia.personal_answer_effect_refusals LANGUAGE sql AS $$
 SELECT * FROM sophia.personal_answer_effect_refusals WHERE input_id=p_input $$;
-- An answer input sent and decided as A1 decides it, and its turn and input kept by name.
CREATE FUNCTION pg_temp.q102_send(p_name text, p_profile jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb:=sophia.send_personal_answer_input('sql-102-'||p_name,'personal_answer_v1',
 (SELECT epoch FROM sophia.personal_spaces WHERE owner_id=sophia.actor_id()),p_name,p_profile);
BEGIN
 INSERT INTO q102 VALUES(p_name,r);
 RETURN r;
END $$;

SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-00000000102a',true);

-- A legacy turn: no input row, so 0080 decides whatever profile is given (NULL here): reserved and bound.
DO $$ DECLARE r jsonb:=sophia.send_personal_turn('sql-102-l1','Legacy one'); t uuid:=(r->>'turnId')::uuid; c uuid;
 res record; BEGIN
 c:=pg_temp.q102_claim(t);
 res:=pg_temp.q102_reserve(t,c,NULL);
 IF res.outcome<>'reserved' THEN RAISE EXCEPTION 'A legacy turn was not reserved: %', res.outcome; END IF;
 INSERT INTO q102 VALUES('legacy',jsonb_build_object('call',res.call,'turn',t));
 PERFORM sophia.release_personal_companion(res.call,'not_prepared');
 PERFORM sophia.end_companion_call(res.call);
 PERFORM sophia.fail_personal_reply(t,c);
END $$;

-- A matched automatic turn reserves; its settled answer is kept; then a kept answer is found first, whatever the
-- profile (NULL, another one): no comparison, refusal or reservation.
DO $$ DECLARE r jsonb:=pg_temp.q102_send('kept',pg_temp.q102_p()); t uuid:=(r->>'turnId')::uuid; c uuid; res record;
 BEGIN
 IF r->'decision'->>'outcome'<>'admitted' THEN RAISE EXCEPTION 'Not admitted: %', r; END IF;
 c:=pg_temp.q102_claim(t);
 res:=pg_temp.q102_reserve(t,c,pg_temp.q102_p());
 IF res.outcome<>'reserved' THEN RAISE EXCEPTION 'A matched automatic turn was not reserved: %', res.outcome; END IF;
 IF sophia.settle_personal_companion_answer(res.call,50,'{"inputTokens":1,"outputTokens":1}','Kept words',NULL)<>'kept'
  THEN RAISE EXCEPTION 'The answer was not kept'; END IF;
 PERFORM sophia.end_companion_call(res.call);
 IF (pg_temp.q102_reserve(t,c,NULL)).outcome<>'kept'
  OR (pg_temp.q102_reserve(t,c,pg_temp.q102_p()||'{"model":"another-model"}')).outcome<>'kept'
  OR (pg_temp.q102_reserve(t,c,pg_temp.q102_p(),'sql-102-other','sql-102-elsewhere')).outcome<>'kept' THEN
  RAISE EXCEPTION 'A kept answer was not found first'; END IF;
 IF pg_temp.q102_refusal((r->>'inputId')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'A kept answer was refused'; END IF;
 IF sophia.record_personal_settled_reply(t,c) IS NULL THEN RAISE EXCEPTION 'The kept answer was not written'; END IF;
END $$;

RESET ROLE;
DO $$ BEGIN
 -- Two reservations: the legacy one and the matched automatic one, each bound to its turn; nothing else.
 IF (SELECT count(*) FROM sophia.personal_companion_usage WHERE owner_id='00000000-0000-0000-0000-00000000102a')<>2
  OR (SELECT count(*) FROM sophia.personal_answer_calls WHERE owner_id='00000000-0000-0000-0000-00000000102a')<>2
  OR NOT EXISTS(SELECT FROM sophia.personal_answer_calls WHERE call_id=(SELECT (v->>'call')::uuid FROM q102 WHERE k='legacy')
   AND turn_id=(SELECT (v->>'turn')::uuid FROM q102 WHERE k='legacy')) THEN
  RAISE EXCEPTION 'The reservations are not the two expected'; END IF;
 -- The version is compared too; no live profile of 0101's shape can differ in it (version is 1).
 IF sophia.personal_answer_profile_diff(pg_temp.q102_p(),pg_temp.q102_p()||'{"version":2}','sql-102-payer','sql-102-route')
  <>ARRAY['version'] THEN RAISE EXCEPTION 'The version is not compared'; END IF;
END $$;
SET LOCAL ROLE sophia_api;

-- Every field and both arguments: each difference refuses profile_mismatch, naming only the fields, in one row for the
-- input's decision (attempts counted); unsupported profiles refuse as such; then the matching profile reserves.
DO $$ DECLARE r jsonb:=pg_temp.q102_send('fields',pg_temp.q102_p()); t uuid:=(r->>'turnId')::uuid;
 i uuid:=(r->>'inputId')::uuid; c uuid; res record; f sophia.personal_answer_effect_refusals; n integer:=0; v jsonb;
 cases jsonb:='[
  {"patch":{"owner":"00000000-0000-0000-0000-00000000102b"},"want":["owner"]},
  {"patch":{"payer":"sql-102-other"},"want":["payer","payerArgument"]},
  {"patch":{"payer":"sql-102-other"},"payer":"sql-102-other","want":["payer"]},
  {"patch":{"routeId":"sql-102-elsewhere"},"want":["routeId","routeArgument"]},
  {"patch":{"routeId":"sql-102-elsewhere"},"route":"sql-102-elsewhere","want":["routeId"]},
  {"patch":{"roleDigest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"want":["roleDigest"]},
  {"patch":{"provider":"sql-102-provider-b"},"want":["provider"]},
  {"patch":{"model":"synthetic-model-b"},"want":["model"]},
  {"patch":{"reasoningEffort":"high"},"want":["reasoningEffort"]},
  {"patch":{"maxTokens":257},"want":["maxTokens"]},
  {"prices":{"input":1.5},"want":["prices.input"]},
  {"prices":{"cacheRead":0.6},"want":["prices.cacheRead"]},
  {"prices":{"cacheWrite":0},"want":["prices.cacheWrite"]},
  {"prices":{"output":2.000001},"want":["prices.output"]},
  {"patch":{},"payer":"sql-102-other","want":["payerArgument"]},
  {"patch":{},"route":"sql-102-elsewhere","want":["routeArgument"]},
  {"patch":{"model":"synthetic-model-b"},"prices":{"output":3},"route":"sql-102-elsewhere",
   "want":["model","prices.output","routeArgument"]}
 ]';
BEGIN
 c:=pg_temp.q102_claim(t);
 FOR v IN SELECT * FROM jsonb_array_elements(cases) LOOP
  n:=n+1;
  res:=pg_temp.q102_reserve(t,c,pg_temp.q102_p()||coalesce(v->'patch','{}')
    ||jsonb_build_object('prices',(pg_temp.q102_p()->'prices')||coalesce(v->'prices','{}')),
   coalesce(v->>'payer','sql-102-payer'),coalesce(v->>'route','sql-102-route'));
  f:=pg_temp.q102_refusal(i);
  IF res.outcome<>'profile_mismatch' OR f.reason<>'profile_mismatch' OR f.decision_seq<>1 OR f.attempts<>n
   OR f.turn_id<>t OR f.epoch<>0 OR to_jsonb(f.fields)<>v->'want' THEN
   RAISE EXCEPTION 'Case % wrong: % %', v, res.outcome, row_to_json(f); END IF;
 END LOOP;
 FOR v IN SELECT * FROM jsonb_array_elements(jsonb_build_array(NULL,pg_temp.q102_p()||'{"model":""}',
  pg_temp.q102_p()||'{"reasoningEffort":""}',pg_temp.q102_p()||'{"apiKeyEnv":"X"}',pg_temp.q102_p()||'{"version":2}',
  pg_temp.q102_p()||'{"prices":{"input":-1,"cacheRead":0,"cacheWrite":0,"output":0}}',
  pg_temp.q102_p()-'prices')) LOOP
  n:=n+1;
  res:=pg_temp.q102_reserve(t,c,CASE WHEN v='null'::jsonb THEN NULL ELSE v END);
  f:=pg_temp.q102_refusal(i);
  IF res.outcome<>'profile_unsupported' OR f.reason<>'profile_unsupported' OR f.fields<>'{}' OR f.attempts<>n THEN
   RAISE EXCEPTION 'Unsupported % wrong: % %', v, res.outcome, row_to_json(f); END IF;
 END LOOP;
 IF (SELECT count(*) FROM sophia.personal_answer_effect_refusals WHERE input_id=i)<>1 THEN
  RAISE EXCEPTION 'Refusals of one decision are not one row'; END IF;
 -- No decision was appended for any of it.
 IF (SELECT count(*) FROM sophia.personal_input_decisions WHERE input_id=i)<>1 THEN
  RAISE EXCEPTION 'A refusal appended a decision'; END IF;
 res:=pg_temp.q102_reserve(t,c,pg_temp.q102_p());
 IF res.outcome<>'reserved' THEN RAISE EXCEPTION 'The matching profile was not reserved: %', res.outcome; END IF;
 -- Its diagnostic stays as it was: the reservation writes none.
 IF (pg_temp.q102_refusal(i)).attempts<>n THEN RAISE EXCEPTION 'A reservation touched the refusal'; END IF;
 INSERT INTO q102 VALUES('fields-call',to_jsonb(res.call));
 PERFORM sophia.release_personal_companion(res.call,'not_prepared');
 PERFORM sophia.end_companion_call(res.call);
 PERFORM sophia.fail_personal_reply(t,c);
END $$;

RESET ROLE;
DO $$ BEGIN
 -- 17 mismatches and 7 unsupported profiles reserved nothing: one more reservation (the match) and its binding.
 IF (SELECT count(*) FROM sophia.personal_companion_usage WHERE owner_id='00000000-0000-0000-0000-00000000102a')<>3
  OR (SELECT count(*) FROM sophia.personal_answer_calls WHERE owner_id='00000000-0000-0000-0000-00000000102a')<>3
  OR NOT EXISTS(SELECT FROM sophia.personal_answer_calls WHERE call_id=(SELECT (v#>>'{}')::uuid FROM q102 WHERE k='fields-call')) THEN
  RAISE EXCEPTION 'A refused reservation left an effect'; END IF;
END $$;
-- Forged pending turns below for the states no writer makes pending: record-only, waiting, and cancelled inputs.
SET LOCAL ROLE sophia_api;
DO $$ DECLARE rec jsonb; w jsonb; x jsonb; BEGIN
 rec:=sophia.send_personal_input('sql-102-rec','automatic_v1',0,'Record only');
 INSERT INTO q102 VALUES('record',rec);
 w:=pg_temp.q102_send('waiting',pg_temp.q102_p()||'{"payer":"sql-102-none"}');
 x:=pg_temp.q102_send('cancelled',pg_temp.q102_p()||'{"payer":"sql-102-none"}');
 PERFORM sophia.cancel_personal_answer_input('sql-102-x',(x->>'inputId')::uuid,1,0);
 IF w->'decision'->>'outcome'<>'waiting' OR rec->>'input'<>'recorded' THEN RAISE EXCEPTION 'Setup wrong'; END IF;
END $$;
RESET ROLE;
UPDATE sophia.personal_turns SET reply='pending', asked_at=now()
 WHERE id IN (SELECT (v->>'turnId')::uuid FROM q102 WHERE k IN ('record','waiting','cancelled'));
SET LOCAL ROLE sophia_api;

-- An automatic origin with no decision, a waiting one or a cancelled one never reaches 0080: not_admitted, its own
-- bounded row (decision 0 for none), the same row again on a repeat.
DO $$ DECLARE nm text; v jsonb; t uuid; c uuid; res record; f sophia.personal_answer_effect_refusals; why text;
 seq integer; BEGIN
 FOREACH nm IN ARRAY ARRAY['record','waiting','cancelled'] LOOP
  SELECT q.v INTO v FROM q102 q WHERE q.k=nm;
  why:=CASE nm WHEN 'record' THEN 'no_decision' ELSE nm END;
  seq:=CASE nm WHEN 'record' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END;
  t:=(v->>'turnId')::uuid;
  c:=pg_temp.q102_claim(t);
  FOR n IN 1..3 LOOP
   res:=pg_temp.q102_reserve(t,c,pg_temp.q102_p());
   f:=pg_temp.q102_refusal((v->>'inputId')::uuid);
   IF res.outcome<>'not_admitted' OR f.attempts<>n OR f.fields<>'{}' OR f.reason<>why OR f.decision_seq<>seq THEN
    RAISE EXCEPTION '% wrong: % %', nm, res.outcome, row_to_json(f); END IF;
  END LOOP;
  PERFORM sophia.fail_personal_reply(t,c);
 END LOOP;
END $$;

-- A stale claim is not_current before anything else, whatever the profile: no refusal.
DO $$ DECLARE r jsonb:=pg_temp.q102_send('stale',pg_temp.q102_p()); t uuid:=(r->>'turnId')::uuid; c uuid; BEGIN
 c:=pg_temp.q102_claim(t);
 IF (pg_temp.q102_reserve(t,gen_random_uuid(),NULL)).outcome<>'not_current'
  OR (pg_temp.q102_reserve(t,gen_random_uuid(),pg_temp.q102_p()||'{"model":"x"}')).outcome<>'not_current'
  OR pg_temp.q102_refusal((r->>'inputId')::uuid) IS NOT NULL THEN
  RAISE EXCEPTION 'A stale claim was not refused first'; END IF;
 PERFORM sophia.fail_personal_reply(t,c);
END $$;

-- A lost (here: uncertain) answer stays lost, before any profile question: no refusal.
DO $$ DECLARE r jsonb:=pg_temp.q102_send('lost',pg_temp.q102_p()); t uuid:=(r->>'turnId')::uuid; c uuid; res record;
 BEGIN
 c:=pg_temp.q102_claim(t);
 res:=pg_temp.q102_reserve(t,c,pg_temp.q102_p());
 IF res.outcome<>'reserved' THEN RAISE EXCEPTION 'Not reserved: %', res.outcome; END IF;
 PERFORM sophia.hold_personal_companion(res.call,'usage_unknown');
 PERFORM sophia.end_companion_call(res.call);
 IF (pg_temp.q102_reserve(t,c,NULL)).outcome<>'lost'
  OR (pg_temp.q102_reserve(t,c,pg_temp.q102_p()||'{"maxTokens":1}')).outcome<>'lost'
  OR pg_temp.q102_refusal((r->>'inputId')::uuid) IS NOT NULL THEN
  RAISE EXCEPTION 'A lost answer was not refused first'; END IF;
 PERFORM sophia.fail_personal_reply(t,c);
END $$;

-- An admitted decision of another epoch than the space's (forged: an erasure would have deleted it) is stale.
DO $$ DECLARE r jsonb:=pg_temp.q102_send('epoch',pg_temp.q102_p()); t uuid:=(r->>'turnId')::uuid; c uuid; BEGIN
 c:=pg_temp.q102_claim(t);
 INSERT INTO q102 VALUES('epoch-claim',to_jsonb(c));
END $$;
RESET ROLE;
UPDATE sophia.personal_spaces SET epoch=epoch+1 WHERE owner_id='00000000-0000-0000-0000-00000000102a';
SET LOCAL ROLE sophia_api;
DO $$ DECLARE r jsonb:=(SELECT v FROM q102 WHERE k='epoch'); res record; f sophia.personal_answer_effect_refusals;
 BEGIN
 res:=pg_temp.q102_reserve((r->>'turnId')::uuid,(SELECT (v#>>'{}')::uuid FROM q102 WHERE k='epoch-claim'),
  pg_temp.q102_p());
 f:=pg_temp.q102_refusal((r->>'inputId')::uuid);
 IF res.outcome<>'not_admitted' OR f.reason<>'decision_stale' OR f.epoch<>1 OR f.decision_seq<>1 THEN
  RAISE EXCEPTION 'Stale decision wrong: % %', res.outcome, row_to_json(f); END IF;
END $$;

-- Owner-only reads, no writes, no internal helpers for the API role.
DO $$ BEGIN
 IF (SELECT count(*) FROM sophia.personal_answer_effect_refusals)<>5 THEN
  RAISE EXCEPTION 'The owner does not read exactly their refusals'; END IF;
 PERFORM set_config('sophia.actor_id','00000000-0000-0000-0000-00000000102b',true);
 IF EXISTS(SELECT FROM sophia.personal_answer_effect_refusals) THEN RAISE EXCEPTION 'Another owner reads refusals'; END IF;
 PERFORM set_config('sophia.actor_id','00000000-0000-0000-0000-00000000102a',true);
 BEGIN
  INSERT INTO sophia.personal_answer_effect_refusals(owner_id,input_id,turn_id,decision_seq,epoch,reason)
   SELECT owner_id,input_id,turn_id,99,epoch,'waiting' FROM sophia.personal_answer_effect_refusals LIMIT 1;
  RAISE EXCEPTION 'The API role wrote a refusal';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  DELETE FROM sophia.personal_answer_effect_refusals;
  RAISE EXCEPTION 'The API role deleted a refusal';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM sophia.personal_answer_profile_diff('{}','{}','a','b');
  RAISE EXCEPTION 'The API role ran an internal helper';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

RESET ROLE;
DO $$ BEGIN
 -- The table holds names and codes only: no value of any profile.
 IF EXISTS(SELECT FROM sophia.personal_answer_effect_refusals r, unnest(r.fields) x
   WHERE x NOT IN ('owner','payer','routeId','roleDigest','provider','model','reasoningEffort','maxTokens',
    'prices.input','prices.cacheRead','prices.cacheWrite','prices.output','version','payerArgument','routeArgument')) THEN
  RAISE EXCEPTION 'A refusal holds a value'; END IF;
 BEGIN
  INSERT INTO sophia.personal_answer_effect_refusals(owner_id,input_id,turn_id,decision_seq,epoch,reason,fields)
   SELECT owner_id,input_id,turn_id,decision_seq,epoch+7,'profile_mismatch',ARRAY['synthetic-model'] FROM
    sophia.personal_answer_effect_refusals WHERE decision_seq>0 LIMIT 1;
  RAISE EXCEPTION 'A value was kept as a field name';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO sophia.personal_answer_effect_refusals(owner_id,input_id,turn_id,decision_seq,epoch,reason)
   SELECT owner_id,input_id,turn_id,0,epoch+7,'waiting' FROM sophia.personal_answer_effect_refusals LIMIT 1;
  RAISE EXCEPTION 'A no-decision identity took another reason';
 EXCEPTION WHEN check_violation THEN NULL; END;
 -- Nothing the API role may execute is new but the guard.
 IF has_function_privilege('sophia_api','sophia.personal_answer_refuse(sophia.personal_inputs,integer,bigint,text,text[])',
   'EXECUTE') OR NOT has_function_privilege('sophia_api',
   'sophia.reserve_personal_answer_guarded(uuid,text,text,bigint,uuid,uuid,jsonb)','EXECUTE')
  OR has_function_privilege('public','sophia.reserve_personal_answer_guarded(uuid,text,text,bigint,uuid,uuid,jsonb)',
   'EXECUTE') THEN RAISE EXCEPTION 'Grants wrong'; END IF;
END $$;
SET LOCAL ROLE sophia_api;

-- Erasure deletes the owner's refusals with their inputs and turns.
DO $$ BEGIN
 PERFORM sophia.erase_personal_space('sql-102-erase','delete');
 IF EXISTS(SELECT FROM sophia.personal_answer_effect_refusals) THEN RAISE EXCEPTION 'Refusals outlived the erasure'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT FROM sophia.personal_answer_effect_refusals WHERE owner_id='00000000-0000-0000-0000-00000000102a') THEN
  RAISE EXCEPTION 'Refusals outlived the erasure (as owner)'; END IF;
END $$;

ROLLBACK;
