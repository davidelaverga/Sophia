-- INC03-CC-003 A3 (0103): the owner's control of an automatic Personal answer, the launch fence and withdrawn results,
-- at the SQL boundary. Run against a disposable database with every migration installed (pnpm test:sql). Never use
-- production. Everything below rolls back. Profiles and payers are synthetic: no key, provider or model exists here.
-- Where an operator step is needed (enrolling a payer, reconciling a call) it is done as the migration owner.
-- * Controlled reservations are tagged; only a fresh grant launches; a replay, a decided tag or no tag never does.
-- * C1/C2 before reservation, before launch (denied and released), after launch (possible effect, nothing released),
--   after publication (answered stays answered); kept answers move to the withheld store; late answers of the original
--   call are withheld whether the turn was withdrawn or answered and whether or not the cost was settled already.
-- * Replacements: admitted at once only when the original's money is resolved and admission is on; else held with its
--   reason; admitted (C3) or refused-and-remembered (C3'), or cancelled (C4: its turn stays recorded).
-- * Revisions, replay, path binding, another owner, seq 100, the log's cursor, the view and the erasure.
BEGIN;
INSERT INTO sophia.personal_companion_payers(payer,owner_id,allowance_micros)
 VALUES('sql-103-payer','00000000-0000-0000-0000-00000000103a',1000000000);
CREATE TEMP TABLE q103(k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
INSERT INTO q103 VALUES('profile',jsonb_build_object('version',1,'owner','00000000-0000-0000-0000-00000000103a',
 'payer','sql-103-payer','routeId','sql-103-route','roleDigest','sha256:'||repeat('a',64),
 'provider','sql-103-provider','model','synthetic-model','reasoningEffort',NULL,'maxTokens',256,
 'prices',jsonb_build_object('input',1,'cacheRead',0.5,'cacheWrite',0.25,'output',2)));
GRANT SELECT, INSERT, UPDATE ON q103 TO sophia_api;

CREATE FUNCTION pg_temp.q103_p() RETURNS jsonb LANGUAGE sql AS $$ SELECT v FROM q103 WHERE k='profile' $$;
CREATE FUNCTION pg_temp.q103_epoch() RETURNS bigint LANGUAGE sql AS $$
 SELECT coalesce((SELECT epoch FROM sophia.personal_spaces WHERE owner_id=sophia.actor_id()),0) $$;
CREATE FUNCTION pg_temp.q103_send(p_name text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb:=sophia.send_personal_answer_input('sql-103-'||p_name,'personal_answer_v1',pg_temp.q103_epoch(),
 'Words of '||p_name,pg_temp.q103_p());
BEGIN
 IF r->'decision'->>'outcome'<>'admitted' THEN RAISE EXCEPTION 'Not admitted: %', r; END IF;
 RETURN r;
END $$;
CREATE FUNCTION pg_temp.q103_claim(p_turn uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE c uuid:=sophia.claim_personal_reply(p_turn);
BEGIN
 IF c IS NULL THEN RAISE EXCEPTION 'Turn % was not claimed', p_turn; END IF;
 RETURN c;
END $$;
CREATE FUNCTION pg_temp.q103_reserve(p_turn uuid, p_claim uuid, p_profile jsonb, p_execution jsonb, OUT outcome text,
 OUT call uuid, OUT digest text) LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
 call:=gen_random_uuid();
 PERFORM sophia.begin_companion_call(call);
 r:=sophia.reserve_personal_answer_controlled(call,'sql-103-payer','sql-103-route',100,p_turn,p_claim,p_profile,
  p_execution);
 outcome:=r->>'outcome';
 digest:=r->>'executionDigest';
END $$;
CREATE FUNCTION pg_temp.q103_control(p_key text, p_input uuid, p_action text, p_expected integer, p_text text DEFAULT NULL,
 p_admission boolean DEFAULT true) RETURNS jsonb LANGUAGE sql AS $$
 SELECT sophia.control_personal_answer_input('sql-103-'||p_key,p_input,p_action,p_expected,pg_temp.q103_epoch(),p_text,
  pg_temp.q103_p(),p_admission) $$;
CREATE FUNCTION pg_temp.q103_admit(p_key text, p_input uuid, p_control uuid, p_expected integer, p_admission boolean)
RETURNS jsonb LANGUAGE sql AS $$
 SELECT sophia.admit_personal_answer_input('sql-103-'||p_key,p_input,p_control,p_expected,pg_temp.q103_epoch(),
  pg_temp.q103_p(),p_admission) $$;
CREATE FUNCTION pg_temp.q103_usage(p_call uuid) RETURNS sophia.personal_companion_usage LANGUAGE sql SECURITY DEFINER
AS $$ SELECT * FROM sophia.personal_companion_usage WHERE call_id=p_call $$;
CREATE FUNCTION pg_temp.q103_launch(p_call uuid) RETURNS sophia.personal_answer_launches LANGUAGE sql SECURITY DEFINER
AS $$ SELECT * FROM sophia.personal_answer_launches WHERE call_id=p_call $$;
CREATE FUNCTION pg_temp.q103_withheld(p_call uuid) RETURNS sophia.personal_withheld_results LANGUAGE sql SECURITY DEFINER
AS $$ SELECT * FROM sophia.personal_withheld_results WHERE call_id=p_call $$;
CREATE FUNCTION pg_temp.q103_kept(p_turn uuid) RETURNS integer LANGUAGE sql SECURITY DEFINER
AS $$ SELECT count(*)::integer FROM sophia.personal_settled_answers WHERE turn_id=p_turn $$;
CREATE FUNCTION pg_temp.q103_reply(p_turn uuid) RETURNS text LANGUAGE sql
AS $$ SELECT reply FROM sophia.personal_turns WHERE id=p_turn $$;
CREATE FUNCTION pg_temp.q103_answers(p_turn uuid) RETURNS integer LANGUAGE sql
AS $$ SELECT count(*)::integer FROM sophia.personal_turns WHERE reply_to=p_turn $$;
CREATE FUNCTION pg_temp.q103_counts() RETURNS jsonb LANGUAGE sql
AS $$ SELECT '{"inputTokens":1,"outputTokens":1}'::jsonb $$;

SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-00000000103a',true);

-- S1: a legacy turn's call through the controlled entry is tagged (no input, revision 0); the grant is one-shot.
DO $$ DECLARE r jsonb:=sophia.send_personal_turn('sql-103-legacy','Legacy words'); t uuid:=(r->>'turnId')::uuid;
 c uuid:=pg_temp.q103_claim(t); res record; l sophia.personal_answer_launches;
BEGIN
 res:=pg_temp.q103_reserve(t,c,NULL,pg_temp.q103_p());
 IF res.outcome<>'reserved' OR res.digest !~ '^sha256:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Legacy: %', res; END IF;
 l:=pg_temp.q103_launch(res.call);
 IF l.state<>'tagged' OR l.input_id IS NOT NULL OR l.control_revision<>0 THEN RAISE EXCEPTION 'Not tagged: %', l; END IF;
 IF sophia.begin_personal_answer_launch(res.call,c,res.digest)<>'granted' THEN RAISE EXCEPTION 'Not granted'; END IF;
 IF sophia.begin_personal_answer_launch(res.call,c,res.digest)<>'already_launched' THEN
  RAISE EXCEPTION 'A replayed intent was not refused as already launched'; END IF;
 IF sophia.begin_personal_answer_launch(gen_random_uuid(),c,res.digest)<>'not_tagged' THEN
  RAISE EXCEPTION 'An untagged call was not reported as such'; END IF;
 IF sophia.settle_personal_companion_answer(res.call,40,pg_temp.q103_counts(),'Legacy answer',NULL)<>'kept' THEN
  RAISE EXCEPTION 'The legacy answer was not kept'; END IF;
 IF sophia.record_personal_settled_reply(t,c) IS NULL THEN RAISE EXCEPTION 'The legacy answer was not written'; END IF;
 PERFORM sophia.end_companion_call(res.call);
END $$;

-- S2: a mismatched execution reserves nothing; C1 before any reservation; replay; stale and terminal refusals; A53 and
-- the legacy retry are unchanged for the withdrawn input.
DO $$ DECLARE r jsonb:=pg_temp.q103_send('x1'); t uuid:=(r->>'turnId')::uuid; i uuid:=(r->>'inputId')::uuid;
 c uuid:=pg_temp.q103_claim(t); first jsonb; again jsonb; rc jsonb;
BEGIN
 BEGIN
  PERFORM pg_temp.q103_reserve(t,c,pg_temp.q103_p(),pg_temp.q103_p()||'{"model":"another-model"}');
  RAISE EXCEPTION 'A mismatched execution reserved';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 first:=pg_temp.q103_control('x1-cancel',i,'cancel',0);
 rc:=first->'receipt';
 IF (first->>'replayed')::boolean OR rc->>'outcome'<>'applied' OR rc->>'phase'<>'before_reservation'
  OR (rc->>'revisionAfter')::integer<>1 OR rc->'prior'->>'financial'<>'none' OR rc->'prior'->>'effect'<>'none' THEN
  RAISE EXCEPTION 'C1 before reservation: %', first; END IF;
 IF pg_temp.q103_reply(t)<>'withdrawn' THEN RAISE EXCEPTION 'The turn was not withdrawn'; END IF;
 again:=pg_temp.q103_control('x1-cancel',i,'cancel',0);
 IF NOT (again->>'replayed')::boolean OR again->'receipt'<>rc THEN RAISE EXCEPTION 'Not replayed: %', again; END IF;
 BEGIN PERFORM pg_temp.q103_control('x1-stale',i,'cancel',0); RAISE EXCEPTION 'A stale control applied';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM pg_temp.q103_control('x1-again',i,'cancel',1); RAISE EXCEPTION 'A withdrawn input was controlled';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 BEGIN PERFORM sophia.cancel_personal_answer_input('sql-103-x1-a53',i,1,pg_temp.q103_epoch());
  RAISE EXCEPTION 'A53 cancelled an admitted input';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 BEGIN PERFORM sophia.retry_personal_turn('sql-103-x1-retry',t); RAISE EXCEPTION 'A withdrawn turn was retried';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 IF (SELECT count(*) FROM sophia.personal_input_decisions WHERE input_id=i)<>1 THEN
  RAISE EXCEPTION 'A 0101 decision was appended'; END IF;
 INSERT INTO q103 VALUES('x1',jsonb_build_object('input',i,'turn',t,'controlId',rc->>'controlId'));
END $$;

-- S3: C1 before launch: the tagged call is denied and released; its intent is then refused as withdrawn.
DO $$ DECLARE r jsonb:=pg_temp.q103_send('x2'); t uuid:=(r->>'turnId')::uuid; i uuid:=(r->>'inputId')::uuid;
 c uuid:=pg_temp.q103_claim(t); res record; rc jsonb;
BEGIN
 res:=pg_temp.q103_reserve(t,c,pg_temp.q103_p(),pg_temp.q103_p());
 IF res.outcome<>'reserved' OR (pg_temp.q103_launch(res.call)).control_revision<>0
  OR (pg_temp.q103_launch(res.call)).input_id<>i THEN RAISE EXCEPTION 'Automatic not tagged: %', res; END IF;
 rc:=pg_temp.q103_control('x2-cancel',i,'cancel',0)->'receipt';
 IF rc->>'phase'<>'before_launch' OR rc->'prior'->>'effect'<>'none' OR rc->'prior'->>'financial'<>'settled' THEN
  RAISE EXCEPTION 'C1 before launch: %', rc; END IF;
 IF (pg_temp.q103_launch(res.call)).state<>'denied' OR (pg_temp.q103_usage(res.call)).state<>'released'
  OR (pg_temp.q103_usage(res.call)).reason<>'withdrawn_before_launch' THEN RAISE EXCEPTION 'Not denied and released'; END IF;
 IF sophia.begin_personal_answer_launch(res.call,c,res.digest)<>'withdrawn' THEN
  RAISE EXCEPTION 'A denied call was not refused'; END IF;
 IF sophia.reserve_personal_answer_controlled(gen_random_uuid(),'sql-103-payer','sql-103-route',100,t,c,pg_temp.q103_p(),
  pg_temp.q103_p())->>'outcome'<>'withdrawn' THEN RAISE EXCEPTION 'A withdrawn input reserved'; END IF;
 PERFORM sophia.end_companion_call(res.call);
END $$;

-- S4: a recheck that fails (another execution digest) refuses the tag and releases it; a later right digest is still
-- refused. The failed turn is then withdrawn before launch.
DO $$ DECLARE r jsonb:=pg_temp.q103_send('x3'); t uuid:=(r->>'turnId')::uuid; i uuid:=(r->>'inputId')::uuid;
 c uuid:=pg_temp.q103_claim(t); res record; rc jsonb;
BEGIN
 res:=pg_temp.q103_reserve(t,c,pg_temp.q103_p(),pg_temp.q103_p());
 IF sophia.begin_personal_answer_launch(res.call,c,'sha256:'||repeat('0',64))<>'refused'
  OR (pg_temp.q103_launch(res.call)).refused_reason<>'execution_changed'
  OR (pg_temp.q103_usage(res.call)).reason<>'refused_before_launch' THEN RAISE EXCEPTION 'Not refused and released'; END IF;
 IF sophia.begin_personal_answer_launch(res.call,c,res.digest)<>'refused' THEN RAISE EXCEPTION 'A refused tag launched'; END IF;
 PERFORM sophia.end_companion_call(res.call);
 PERFORM sophia.fail_personal_reply(t,c);
 rc:=pg_temp.q103_control('x3-cancel',i,'cancel',0)->'receipt';
 IF rc->>'phase'<>'before_launch' OR pg_temp.q103_reply(t)<>'withdrawn' THEN RAISE EXCEPTION 'Failed turn: %', rc; END IF;
END $$;

-- S5: C2 after launch: possible effect, nothing released; the replacement is held while the call is in progress; the
-- late answer is withheld (settled), never kept or written; identical replay; a different body is refused; the held
-- replacement's refused admission is remembered and replayed; admitted once the call settled and admission is on.
DO $$ DECLARE r jsonb:=pg_temp.q103_send('x4'); t uuid:=(r->>'turnId')::uuid; i uuid:=(r->>'inputId')::uuid;
 c uuid:=pg_temp.q103_claim(t); res record; rc jsonb; y uuid; refused jsonb; again jsonb; ok jsonb;
BEGIN
 res:=pg_temp.q103_reserve(t,c,pg_temp.q103_p(),pg_temp.q103_p());
 IF sophia.begin_personal_answer_launch(res.call,c,res.digest)<>'granted' THEN RAISE EXCEPTION 'Not granted'; END IF;
 rc:=pg_temp.q103_control('x4-replace',i,'replace',0,'Corrected words')->'receipt';
 y:=(rc->'replacement'->>'inputId')::uuid;
 IF rc->>'phase'<>'after_launch' OR rc->'prior'->>'effect'<>'possible' OR rc->'prior'->>'financial'<>'unresolved'
  OR rc->'replacement'->>'state'<>'held' OR rc->'replacement'->>'heldReason'<>'prior_in_progress'
  OR rc->'replacement'->'decision'<>'null'::jsonb THEN RAISE EXCEPTION 'C2 after launch: %', rc; END IF;
 IF (pg_temp.q103_usage(res.call)).state<>'reserved' OR (pg_temp.q103_launch(res.call)).state<>'launching' THEN
  RAISE EXCEPTION 'A launched call was released or rewritten'; END IF;
 IF pg_temp.q103_reply(t)<>'withdrawn' OR pg_temp.q103_reply((rc->'replacement'->>'turnId')::uuid)<>'recorded' THEN
  RAISE EXCEPTION 'Turn states after C2'; END IF;
 IF sophia.settle_personal_companion_answer(res.call,60,pg_temp.q103_counts(),'Late words','A note')<>'settled' THEN
  RAISE EXCEPTION 'The late answer was not settled'; END IF;
 IF (pg_temp.q103_withheld(res.call)).source<>'late_settlement' OR pg_temp.q103_kept(t)<>0
  OR (pg_temp.q103_usage(res.call)).reason IS NOT NULL THEN RAISE EXCEPTION 'The late answer was not withheld'; END IF;
 IF sophia.record_personal_settled_reply(t,c) IS NOT NULL OR sophia.record_personal_reply(t,c,'Late words','A note') IS NOT NULL
  OR pg_temp.q103_answers(t)<>0 THEN RAISE EXCEPTION 'A withdrawn answer was written'; END IF;
 IF sophia.settle_personal_companion_answer(res.call,60,pg_temp.q103_counts(),'Late words','A note')<>'not_settled' THEN
  RAISE EXCEPTION 'An identical replay was not idempotent'; END IF;
 BEGIN
  PERFORM sophia.settle_personal_companion_answer(res.call,60,pg_temp.q103_counts(),'Other words',NULL);
  RAISE EXCEPTION 'A different withheld answer was accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 IF sophia.personal_withheld_answer(res.call)->>'text'<>'Late words' THEN RAISE EXCEPTION 'Withheld read'; END IF;
 PERFORM sophia.end_companion_call(res.call);
 refused:=pg_temp.q103_admit('y4-admit-off',y,(rc->>'controlId')::uuid,1,false);
 IF refused->'receipt'->>'outcome'<>'refused' OR refused->'receipt'->>'heldReason'<>'admission_off'
  OR (refused->'receipt'->>'revisionAfter')::integer<>1 THEN RAISE EXCEPTION 'Refused admission: %', refused; END IF;
 again:=pg_temp.q103_admit('y4-admit-off',y,(rc->>'controlId')::uuid,1,true);
 IF NOT (again->>'replayed')::boolean OR again->'receipt'<>refused->'receipt' THEN
  RAISE EXCEPTION 'A refused admission replayed otherwise: %', again; END IF;
 BEGIN PERFORM pg_temp.q103_admit('y4-admit-path',y,gen_random_uuid(),1,true); RAISE EXCEPTION 'Path not bound';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 ok:=pg_temp.q103_admit('y4-admit',y,(rc->>'controlId')::uuid,1,true);
 IF ok->'receipt'->>'outcome'<>'applied' OR ok->'receipt'->'decision'->>'outcome'<>'admitted'
  OR (ok->'receipt'->>'revisionAfter')::integer<>2 OR pg_temp.q103_reply((rc->'replacement'->>'turnId')::uuid)<>'pending' THEN
  RAISE EXCEPTION 'Admission: %', ok; END IF;
 BEGIN PERFORM pg_temp.q103_admit('y4-admit-stale',y,(rc->>'controlId')::uuid,1,true); RAISE EXCEPTION 'Stale admit';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 -- The admitted replacement is ordinary admitted work, itself controllable: withdrawn before reservation.
 IF pg_temp.q103_control('y4-cancel',y,'cancel',2)->'receipt'->>'phase'<>'before_reservation' THEN
  RAISE EXCEPTION 'The admitted replacement was not controllable'; END IF;
 INSERT INTO q103 VALUES('x4',jsonb_build_object('input',i,'call',res.call));
END $$;

-- S6: a kept answer not yet written moves to the withheld store on withdrawal; an answered input stays answered and a
-- later identical body of its call is retained withheld while the cost stays as settled.
DO $$ DECLARE r jsonb:=pg_temp.q103_send('x5'); t uuid:=(r->>'turnId')::uuid; i uuid:=(r->>'inputId')::uuid;
 c uuid:=pg_temp.q103_claim(t); res record; rc jsonb;
BEGIN
 res:=pg_temp.q103_reserve(t,c,pg_temp.q103_p(),pg_temp.q103_p());
 PERFORM sophia.begin_personal_answer_launch(res.call,c,res.digest);
 IF sophia.settle_personal_companion_answer(res.call,60,pg_temp.q103_counts(),'Kept words',NULL)<>'kept' THEN
  RAISE EXCEPTION 'Not kept'; END IF;
 rc:=pg_temp.q103_control('x5-cancel',i,'cancel',0)->'receipt';
 IF rc->>'phase'<>'after_launch' OR rc->'prior'->>'answer'<>'withheld' OR pg_temp.q103_kept(t)<>0
  OR (pg_temp.q103_withheld(res.call)).source<>'kept_transfer' THEN RAISE EXCEPTION 'Kept transfer: %', rc; END IF;
 IF sophia.record_personal_settled_reply(t,c) IS NOT NULL OR pg_temp.q103_answers(t)<>0 THEN
  RAISE EXCEPTION 'A transferred answer was written'; END IF;
 PERFORM sophia.end_companion_call(res.call);
 INSERT INTO q103 VALUES('x5',jsonb_build_object('input',i,'call',res.call));
END $$;
DO $$ DECLARE r jsonb:=pg_temp.q103_send('x6'); t uuid:=(r->>'turnId')::uuid; i uuid:=(r->>'inputId')::uuid;
 c uuid:=pg_temp.q103_claim(t); res record; rc jsonb;
BEGIN
 res:=pg_temp.q103_reserve(t,c,pg_temp.q103_p(),pg_temp.q103_p());
 PERFORM sophia.begin_personal_answer_launch(res.call,c,res.digest);
 PERFORM sophia.settle_personal_companion_answer(res.call,60,pg_temp.q103_counts(),'Published words',NULL);
 IF sophia.record_personal_settled_reply(t,c) IS NULL THEN RAISE EXCEPTION 'Not published'; END IF;
 PERFORM sophia.end_companion_call(res.call);
 rc:=pg_temp.q103_control('x6-cancel',i,'cancel',0)->'receipt';
 IF rc->>'phase'<>'after_publication' OR rc->'prior'->>'answer'<>'published' OR pg_temp.q103_reply(t)<>'answered' THEN
  RAISE EXCEPTION 'After publication: %', rc; END IF;
 IF sophia.settle_personal_companion_answer(res.call,60,pg_temp.q103_counts(),'Published words',NULL)<>'not_settled'
  OR (pg_temp.q103_withheld(res.call)).source<>'late_settlement' OR pg_temp.q103_answers(t)<>1 THEN
  RAISE EXCEPTION 'An answered input''s late body was not retained apart'; END IF;
END $$;

-- S7: the call's runner went away (reserved, no registration): the replacement is held for the unresolved cost; an
-- operator reconciles the cost (its reason kept); the owner then admits the replacement; a late body is still withheld.
DO $$ DECLARE r jsonb:=pg_temp.q103_send('x7'); t uuid:=(r->>'turnId')::uuid; i uuid:=(r->>'inputId')::uuid;
 c uuid:=pg_temp.q103_claim(t); res record; rc jsonb;
BEGIN
 res:=pg_temp.q103_reserve(t,c,pg_temp.q103_p(),pg_temp.q103_p());
 PERFORM sophia.begin_personal_answer_launch(res.call,c,res.digest);
 PERFORM sophia.end_companion_call(res.call);
 rc:=pg_temp.q103_control('x7-replace',i,'replace',0,'Second thoughts')->'receipt';
 IF rc->'replacement'->>'heldReason'<>'prior_cost_unresolved' OR rc->'prior'->>'answer'<>'unknown' THEN
  RAISE EXCEPTION 'Held for cost: %', rc; END IF;
 INSERT INTO q103 VALUES('x7',jsonb_build_object('input',i,'turn',t,'call',res.call,'y',rc->'replacement'->>'inputId',
  'control',rc->>'controlId'));
END $$;
RESET ROLE;
SELECT sophia.reconcile_personal_companion((SELECT (v->>'call')::uuid FROM q103 WHERE k='x7'),55,
 '{"inputTokens":1,"outputTokens":1}');
SET LOCAL ROLE sophia_api;
DO $$ DECLARE x jsonb:=(SELECT v FROM q103 WHERE k='x7'); ok jsonb; view jsonb;
BEGIN
 IF (pg_temp.q103_usage((x->>'call')::uuid)).reason<>'unfinished_call' THEN RAISE EXCEPTION 'Reconcile reason'; END IF;
 ok:=pg_temp.q103_admit('y7-admit',(x->>'y')::uuid,(x->>'control')::uuid,1,true);
 IF ok->'receipt'->>'outcome'<>'applied' OR ok->'receipt'->'prior'->>'answer'<>'unknown'
  OR ok->'receipt'->'prior'->>'financial'<>'settled' THEN RAISE EXCEPTION 'Admit after settlement: %', ok; END IF;
 IF sophia.settle_personal_companion_answer((x->>'call')::uuid,55,pg_temp.q103_counts(),'Very late',NULL)<>'not_settled'
  OR (pg_temp.q103_withheld((x->>'call')::uuid)).body<>'Very late'
  OR (pg_temp.q103_usage((x->>'call')::uuid)).reason<>'unfinished_call' THEN
  RAISE EXCEPTION 'A body after reconciliation was not withheld apart from its cost'; END IF;
 view:=sophia.personal_answer_control_view((x->>'input')::uuid);
 IF view->'control'->>'state'<>'withdrawn' OR jsonb_array_length(view->'withheld')<>1
  OR view->'control'->'replacedBy'->>0<>x->>'y' OR view->'route'->>'routeId'<>'sql-103-route'
  OR view->'route'->>'profileDigest' !~ '^sha256:' OR jsonb_array_length(view->'decisions')<>1
  OR view->'calls'->0->>'launch'<>'launching' OR view->'calls'->0->>'financial'<>'settled' THEN
  RAISE EXCEPTION 'View: %', view; END IF;
 PERFORM pg_temp.q103_control('y7-cancel',(x->>'y')::uuid,'cancel',2);
END $$;

-- S8: a held replacement cancelled stays recorded (never admitted); it cannot be admitted after.
DO $$ DECLARE r jsonb:=pg_temp.q103_send('x8'); i uuid:=(r->>'inputId')::uuid; rc jsonb; y uuid; yt uuid; cancel jsonb;
BEGIN
 rc:=pg_temp.q103_control('x8-replace',i,'replace',0,'Replacement held',false)->'receipt';
 y:=(rc->'replacement'->>'inputId')::uuid;
 yt:=(rc->'replacement'->>'turnId')::uuid;
 IF rc->'replacement'->>'heldReason'<>'admission_off' THEN RAISE EXCEPTION 'Not held: %', rc; END IF;
 BEGIN PERFORM pg_temp.q103_control('y8-replace',y,'replace',1,'No'); RAISE EXCEPTION 'A held one was replaced';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 cancel:=pg_temp.q103_control('y8-cancel',y,'cancel',1)->'receipt';
 IF cancel->>'phase'<>'before_admission' OR pg_temp.q103_reply(yt)<>'recorded' THEN
  RAISE EXCEPTION 'Held cancel: %', cancel; END IF;
 BEGIN PERFORM pg_temp.q103_admit('y8-admit',y,(rc->>'controlId')::uuid,2,true); RAISE EXCEPTION 'Cancelled admitted';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 IF EXISTS(SELECT FROM sophia.personal_input_decisions WHERE input_id=y) THEN RAISE EXCEPTION 'A decision was written'; END IF;
END $$;

-- S9: another owner sees and controls nothing of this one's.
DO $$ DECLARE x jsonb:=(SELECT v FROM q103 WHERE k='x1');
BEGIN
 PERFORM set_config('sophia.actor_id','00000000-0000-0000-0000-00000000103b',true);
 BEGIN PERFORM sophia.personal_answer_control_view((x->>'input')::uuid); RAISE EXCEPTION 'Another owner read';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sophia.control_personal_answer_input('sql-103-b',(x->>'input')::uuid,'cancel',1,0,NULL,NULL,false);
  RAISE EXCEPTION 'Another owner controlled';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF EXISTS(SELECT FROM sophia.personal_answer_controls) OR EXISTS(SELECT FROM sophia.personal_answer_control_ops)
  OR jsonb_array_length(sophia.personal_answer_control_log(0,100)->'items')<>0 THEN
  RAISE EXCEPTION 'Another owner listed controls'; END IF;
 PERFORM set_config('sophia.actor_id','00000000-0000-0000-0000-00000000103a',true);
END $$;

-- S10: an input admitted at decision seq 100 (the 0101 cap) is controlled: control is not a decision.
DO $$ DECLARE r jsonb; i uuid; n integer;
BEGIN
 r:=sophia.send_personal_answer_input('sql-103-cap','personal_answer_v1',pg_temp.q103_epoch(),'Capped',
  pg_temp.q103_p()||'{"payer":"sql-103-later"}');
 IF r->'decision'->>'outcome'<>'waiting' THEN RAISE EXCEPTION 'Not waiting: %', r; END IF;
 i:=(r->>'inputId')::uuid;
 FOR n IN 1..98 LOOP
  PERFORM sophia.retry_personal_answer_input('sql-103-cap-'||n,i,n,pg_temp.q103_epoch(),
   pg_temp.q103_p()||'{"payer":"sql-103-later"}');
 END LOOP;
 INSERT INTO q103 VALUES('cap',jsonb_build_object('input',i));
END $$;
RESET ROLE;
INSERT INTO sophia.personal_companion_payers(payer,owner_id,allowance_micros)
 VALUES('sql-103-later','00000000-0000-0000-0000-00000000103a',1000000000);
SET LOCAL ROLE sophia_api;
DO $$ DECLARE i uuid:=(SELECT (v->>'input')::uuid FROM q103 WHERE k='cap'); r jsonb; rc jsonb;
BEGIN
 r:=sophia.retry_personal_answer_input('sql-103-cap-99',i,99,pg_temp.q103_epoch(),
  pg_temp.q103_p()||'{"payer":"sql-103-later"}');
 IF r->'decision'->>'outcome'<>'admitted' OR (r->'decision'->>'seq')::integer<>100 THEN
  RAISE EXCEPTION 'Not admitted at 100: %', r; END IF;
 rc:=pg_temp.q103_control('cap-cancel',i,'cancel',0)->'receipt';
 IF rc->>'outcome'<>'applied' OR (rc->>'revisionAfter')::integer<>1
  OR (SELECT max(seq) FROM sophia.personal_input_decisions WHERE input_id=i)<>100 THEN
  RAISE EXCEPTION 'Seq 100 control: %', rc; END IF;
END $$;

-- S13 (R1, first): a call reserved and tagged but never granted, withdrawn before launch, has no answer to retain.
DO $$ DECLARE r jsonb:=pg_temp.q103_send('x14'); t uuid:=(r->>'turnId')::uuid; i uuid:=(r->>'inputId')::uuid;
 c uuid:=pg_temp.q103_claim(t); res record;
BEGIN
 -- Reserved and tagged, never granted: withdrawn before launch, it was never asked, so it has no answer to retain.
 res:=pg_temp.q103_reserve(t,c,pg_temp.q103_p(),pg_temp.q103_p());
 IF pg_temp.q103_control('x14-cancel',i,'cancel',0)->'receipt'->>'phase'<>'before_launch' THEN
  RAISE EXCEPTION 'Not before launch'; END IF;
 IF sophia.retain_personal_withheld_answer(res.call,'Words never asked for',NULL)<>'not_withdrawn'
  OR (pg_temp.q103_withheld(res.call)).call_id IS NOT NULL THEN RAISE EXCEPTION 'An unlaunched call retained'; END IF;
 PERFORM sophia.end_companion_call(res.call);
END $$;

-- S13 (R1): a complete answer of the original call whose cost could not be settled (stopped, or usage unknown) is
-- retained privately, its money left exactly as it is: uncertain, no amount, never settled, released or reconciled
-- here; the replacement stays held on the unresolved cost. Only that binding retains: a call never launched, one whose
-- input is not withdrawn, and another owner's call write nothing. Identical replay; a different body is refused.
DO $$ DECLARE r jsonb:=pg_temp.q103_send('x13'); t uuid:=(r->>'turnId')::uuid; i uuid:=(r->>'inputId')::uuid;
 c uuid:=pg_temp.q103_claim(t); res record; rc jsonb; y uuid; u sophia.personal_companion_usage; refused jsonb;
BEGIN
 res:=pg_temp.q103_reserve(t,c,pg_temp.q103_p(),pg_temp.q103_p());
 IF sophia.begin_personal_answer_launch(res.call,c,res.digest)<>'granted' THEN RAISE EXCEPTION 'Not granted'; END IF;
 IF sophia.retain_personal_withheld_answer(res.call,'Too early',NULL)<>'not_withdrawn'
  OR (pg_temp.q103_withheld(res.call)).call_id IS NOT NULL THEN RAISE EXCEPTION 'Retained while not withdrawn'; END IF;
 rc:=pg_temp.q103_control('x13-replace',i,'replace',0,'Instead words')->'receipt';
 y:=(rc->'replacement'->>'inputId')::uuid;
 IF rc->>'phase'<>'after_launch' THEN RAISE EXCEPTION 'Not after launch: %', rc; END IF;
 -- The call was stopped: its usage is not known, so it is held, as the live companion holds it.
 IF NOT sophia.hold_personal_companion(res.call,'stopped_usage_unknown') THEN RAISE EXCEPTION 'Not held'; END IF;
 IF sophia.retain_personal_withheld_answer(res.call,'Whole late words','A note')<>'retained' THEN
  RAISE EXCEPTION 'Not retained'; END IF;
 u:=pg_temp.q103_usage(res.call);
 IF (pg_temp.q103_withheld(res.call)).body<>'Whole late words' OR (pg_temp.q103_withheld(res.call)).suggestion<>'A note'
  OR (pg_temp.q103_withheld(res.call)).source<>'late_settlement' OR (pg_temp.q103_withheld(res.call)).input_id<>i
  OR u.state<>'uncertain' OR u.reason<>'stopped_usage_unknown' OR u.used_micros IS NOT NULL OR u.usage IS NOT NULL
  OR pg_temp.q103_kept(t)<>0 OR pg_temp.q103_answers(t)<>0 OR pg_temp.q103_reply(t)<>'withdrawn' THEN
  RAISE EXCEPTION 'Retention changed money or wrote an answer: %', to_jsonb(u); END IF;
 IF sophia.record_personal_reply(t,c,'Whole late words','A note') IS NOT NULL OR pg_temp.q103_answers(t)<>0 THEN
  RAISE EXCEPTION 'A retained answer was written'; END IF;
 IF sophia.retain_personal_withheld_answer(res.call,'Whole late words','A note')<>'retained' THEN
  RAISE EXCEPTION 'An identical replay was not idempotent'; END IF;
 BEGIN
  PERFORM sophia.retain_personal_withheld_answer(res.call,'Other words','A note');
  RAISE EXCEPTION 'A different retained answer was accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM sophia.retain_personal_withheld_answer(res.call,'',NULL);
  RAISE EXCEPTION 'An empty answer was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM sophia.end_companion_call(res.call);
 refused:=pg_temp.q103_admit('y13-admit',y,(rc->>'controlId')::uuid,1,true);
 IF refused->'receipt'->>'outcome'<>'refused' OR refused->'receipt'->>'heldReason'<>'prior_cost_unresolved'
  OR (pg_temp.q103_usage(res.call)).state<>'uncertain' THEN
  RAISE EXCEPTION 'The replacement was admitted on an unresolved cost: %', refused; END IF;
 -- Another owner's view of the same call: nothing.
 PERFORM set_config('sophia.actor_id','00000000-0000-0000-0000-00000000103b',true);
 IF sophia.retain_personal_withheld_answer(res.call,'Whole late words','A note')<>'not_withdrawn' THEN
  RAISE EXCEPTION 'Another owner retained'; END IF;
 PERFORM set_config('sophia.actor_id','00000000-0000-0000-0000-00000000103a',true);
 INSERT INTO q103 VALUES('x13',jsonb_build_object('input',i,'call',res.call));
END $$;
-- S11: the log, a page at a time, by seq.
DO $$ DECLARE p1 jsonb:=sophia.personal_answer_control_log(0,2); p2 jsonb; total integer;
BEGIN
 IF jsonb_array_length(p1->'items')<>2 OR (p1->>'next')::bigint<>(p1->'items'->1->>'controlSeq')::bigint THEN
  RAISE EXCEPTION 'Page 1: %', p1; END IF;
 p2:=sophia.personal_answer_control_log((p1->>'next')::bigint,100);
 total:=(SELECT count(*) FROM sophia.personal_answer_control_ops);
 IF jsonb_array_length(p2->'items')<>total-2 OR p2->'next'<>'null'::jsonb
  OR (p2->'items'->0->>'controlSeq')::bigint<=(p1->>'next')::bigint THEN RAISE EXCEPTION 'Page 2: %', p2; END IF;
 BEGIN PERFORM sophia.personal_answer_control_log(0,101); RAISE EXCEPTION 'An unbounded page';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;

-- S12: the erasure takes every control, operation, launch and withheld answer with the turns; an old key is refused.
DO $$ DECLARE x jsonb:=(SELECT v FROM q103 WHERE k='x1');
BEGIN
 PERFORM sophia.erase_personal_space('sql-103-erase','delete');
 IF EXISTS(SELECT FROM sophia.personal_answer_controls) OR EXISTS(SELECT FROM sophia.personal_answer_control_ops) THEN
  RAISE EXCEPTION 'Controls survived the erasure'; END IF;
 IF (pg_temp.q103_withheld((SELECT (v->>'call')::uuid FROM q103 WHERE k='x5'))).call_id IS NOT NULL
  OR (pg_temp.q103_launch((SELECT (v->>'call')::uuid FROM q103 WHERE k='x4'))).call_id IS NOT NULL THEN
  RAISE EXCEPTION 'Withheld answers or launches survived the erasure'; END IF;
 BEGIN
  PERFORM sophia.control_personal_answer_input('sql-103-x1-cancel',(x->>'input')::uuid,'cancel',0,
   pg_temp.q103_epoch(),NULL,NULL,false);
  RAISE EXCEPTION 'An erased key was replayed';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 -- R1: an erased call's answer is not resurrected by a late retention.
 IF sophia.retain_personal_withheld_answer((SELECT (v->>'call')::uuid FROM q103 WHERE k='x13'),'Whole late words',
   'A note')<>'not_withdrawn'
  OR (pg_temp.q103_withheld((SELECT (v->>'call')::uuid FROM q103 WHERE k='x13'))).call_id IS NOT NULL THEN
  RAISE EXCEPTION 'An erased answer was retained again'; END IF;
END $$;

-- Grants: no write or direct read of the function-only tables; no execute on the internal helpers.
RESET ROLE;
DO $$ BEGIN
 IF has_table_privilege('sophia_api','sophia.personal_answer_launches','SELECT')
  OR has_table_privilege('sophia_api','sophia.personal_withheld_results','SELECT')
  OR has_table_privilege('sophia_api','sophia.personal_answer_controls','INSERT')
  OR has_table_privilege('sophia_api','sophia.personal_answer_control_ops','INSERT')
  OR has_function_privilege('sophia_api','sophia.personal_answer_replacement_hold(uuid,bigint,jsonb,boolean)','EXECUTE')
  OR has_function_privilege('sophia_api','sophia.personal_answer_call_effects(uuid,bigint)','EXECUTE')
  OR NOT has_function_privilege('sophia_api',
   'sophia.settle_personal_companion_answer(uuid,bigint,jsonb,text,text)','EXECUTE')
  OR NOT has_function_privilege('sophia_api','sophia.retain_personal_withheld_answer(uuid,text,text)','EXECUTE')
  OR has_function_privilege('sophia_worker','sophia.retain_personal_withheld_answer(uuid,text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'Grants'; END IF;
END $$;
ROLLBACK;
