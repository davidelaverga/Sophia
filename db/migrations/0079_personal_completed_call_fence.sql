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
-- * Also fenced (FND-C62, R2-B85): a call held 'uncertain' (usage_unknown, stopped_usage_unknown: set only after the
--   provider was asked, so it may have answered), or settled later from it keeping that reason; an unknown usage is
--   not proof that nothing was made. And a bound call settled before 0079 with no reason, no answer kept and its turn
--   not answered: it cannot be told from an unfinished one, so 0079 marks it 'settled_before_fence' (cost, usage and
--   history kept; nothing deleted or made up) and it is fenced the same.
-- * Not fenced: a call released before the provider was asked ('released', proved never asked); a call settled by the
--   runtime with no reason (its answer kept, or none to keep); a call still registered (another process answers it:
--   the payer hold of 0073 applies); a new turn; another epoch (an erasure deletes the turns and their bindings).
-- * The API admits a live call only with this file installed (its marker below), never on 0078 alone.
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
 -- 0079 completed-call fence (the API's installation marker).
 PERFORM sophia.personal_hold();
 e:=coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=a),0);
 IF EXISTS(SELECT FROM sophia.personal_settled_answers k WHERE k.owner_id=a AND k.turn_id=p_turn AND k.epoch=e) THEN
  RETURN 'kept';
 END IF;
 IF EXISTS(SELECT FROM sophia.personal_answer_calls b JOIN sophia.personal_companion_usage u ON u.call_id=b.call_id
  WHERE b.owner_id=a AND b.turn_id=p_turn AND b.epoch=e
   AND ((u.state='reserved' AND NOT EXISTS(SELECT FROM sophia.personal_companion_calls c WHERE c.call_id=u.call_id))
    OR u.state='uncertain'
    OR (u.state='settled' AND u.reason IN ('unfinished_call','usage_unknown','stopped_usage_unknown','settled_before_fence')))) THEN
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

-- Bound calls settled before 0079 with no reason, no answer kept for their turn in its epoch, the turn not answered.
UPDATE sophia.personal_companion_usage u SET reason='settled_before_fence'
 WHERE u.state='settled' AND u.reason IS NULL
  AND EXISTS(SELECT FROM sophia.personal_answer_calls b JOIN sophia.personal_turns t
    ON t.owner_id=b.owner_id AND t.id=b.turn_id AND t.author='person' AND t.reply<>'answered'
   WHERE b.call_id=u.call_id
    AND NOT EXISTS(SELECT FROM sophia.personal_settled_answers k
     WHERE k.owner_id=b.owner_id AND k.turn_id=b.turn_id AND k.epoch=b.epoch));

COMMIT;
