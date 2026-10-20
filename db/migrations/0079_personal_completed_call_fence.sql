-- 0079: an answer lost after its call ran is not paid for again (#435 4320198389, FND-B85, A42).
--
-- A live call may run to the end while every write of its settlement fails: the database away, the process gone.
-- Its reservation then stays 'reserved' (0073) and its binding to the turn stays (0078), but no answer is kept. Once
-- an operator settled that cost from the provider's record (reconcile_personal_companion, cost only), a normal retry
-- of the turn reserved a fresh call and asked the provider again: a second paid generation for an answer already made
-- and lost (B84's executed witness).
--
-- * A reservation for a turn is refused, 'lost', while that turn (in the current epoch, no answer kept for it) has a
--   bound call the runtime never finished: still 'reserved' with no registration left (it may have run, its process is
--   gone), or settled by an operator from 'reserved' (marked reason 'unfinished_call' here). Nothing is reserved or
--   asked, and the answer is not made up: it is unavailable. Asking again would be a deliberate new paid attempt,
--   which needs an owner's decision, not a retry.
-- * Not fenced: a call released before the provider was asked ('released'); a call held because the provider failed
--   or stopped ('uncertain', and settled from it later keeping its reason): the provider gave no answer to lose; a call
--   still registered (another process answers it: the payer hold of 0073 applies); a new turn; another epoch (an
--   erasure deletes the turns and their bindings).
-- * 0073 and 0078 are unchanged as files; their two functions are replaced here, same signatures and grants.
BEGIN;

-- 0073's reconciliation, unchanged except that a call settled from 'reserved' (the runtime never settled, held or
-- released it) keeps that it was unfinished.
CREATE OR REPLACE FUNCTION sophia.reconcile_personal_companion(p_call uuid, p_used bigint, p_usage jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE pp text;
BEGIN
 IF p_used IS NULL OR p_used<0 OR NOT sophia.personal_companion_counts(p_usage) THEN
  RAISE EXCEPTION 'A settlement is a used amount and the reported token counts' USING ERRCODE='22023';
 END IF;
 SELECT payer INTO pp FROM sophia.personal_companion_usage WHERE call_id=p_call;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM FROM sophia.personal_companion_payers WHERE payer=pp FOR UPDATE;
 UPDATE sophia.personal_companion_usage SET state='settled', used_micros=p_used, usage=p_usage, settled_at=now(),
  reason=CASE WHEN state='reserved' THEN 'unfinished_call' ELSE reason END
  WHERE call_id=p_call AND (state='uncertain' OR (state='reserved'
   AND NOT EXISTS(SELECT FROM sophia.personal_companion_calls c WHERE c.call_id=p_call)));
 RETURN FOUND;
END $$;

-- 0078's reservation (after B80), with the fence above between the kept answer and the turn's claim.
CREATE OR REPLACE FUNCTION sophia.reserve_personal_answer(p_call uuid, p_payer text, p_route text, p_micros bigint,
 p_turn uuid, p_claim uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); e bigint; outcome text;
BEGIN
 PERFORM sophia.personal_hold();
 e:=coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=a),0);
 IF EXISTS(SELECT FROM sophia.personal_settled_answers k WHERE k.owner_id=a AND k.turn_id=p_turn AND k.epoch=e) THEN
  RETURN 'kept';
 END IF;
 IF EXISTS(SELECT FROM sophia.personal_answer_calls b JOIN sophia.personal_companion_usage u ON u.call_id=b.call_id
  WHERE b.owner_id=a AND b.turn_id=p_turn AND b.epoch=e
   AND ((u.state='reserved' AND NOT EXISTS(SELECT FROM sophia.personal_companion_calls c WHERE c.call_id=u.call_id))
    OR (u.state='settled' AND u.reason='unfinished_call'))) THEN
  RETURN 'lost';
 END IF;
 IF NOT EXISTS(SELECT FROM sophia.personal_turns t WHERE t.owner_id=a AND t.id=p_turn AND t.author='person'
  AND t.reply='pending' AND t.answering_claim=p_claim) THEN
  RETURN 'not_current';
 END IF;
 outcome:=sophia.reserve_personal_companion(p_call, p_payer, p_route, p_micros);
 IF outcome='reserved' THEN
  INSERT INTO sophia.personal_answer_calls(owner_id,call_id,turn_id,epoch) VALUES(a,p_call,p_turn,e);
 END IF;
 RETURN outcome;
END $$;

COMMIT;
