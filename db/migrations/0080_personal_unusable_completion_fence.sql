-- 0080: a call that completed with a known cost but no answer kept is not paid for again (finding 4321368164, FND-C67).
--
-- A live call can complete with known usage and no storable reply (no usable words, a tool call, or the provider's
-- token limit). Its cost was settled with no reason (0073) and nothing kept; the turn failed; a normal retry of that
-- turn reserved a new call and asked the provider again (C67's executed witness: two requests, two costs).
--
-- * A call bound to a turn (0078) that is settled from its usage is classified 'settled_without_answer' in the same
--   row update as its cost: this call's answer was not retained. No provider cause is claimed.
-- * When 0078's settlement keeps THIS call's own answer (kept = p_call), that classification is cleared for this call
--   only, in the same transaction. Not retained (epoch gone, turn not pending/failed, another call's answer already
--   kept): it stays, which is true; reservation answers 'kept' or 'not_current' first for those turns anyway.
-- * Reservation fences 'settled_without_answer' as it fences 0079's reasons (kept answer first, then the fence, then
--   the claim), so a retry of that turn asks nothing; a new turn is answered as before.
-- * Unbound ledger calls keep their reason as it was (the base settlement's ELSE). Locks are unchanged: settle+keep and
--   reserve take the space, then the payer, then the row; the direct settlement takes the payer, then the row, and only
--   reads the binding.
-- * Rows settled before this file with no reason, bound to a turn in the current epoch that is failed or pending, with
--   no answer kept for it, are classified the same here (amounts, counts and times unchanged).
-- * 0073, 0078 and 0079 are unchanged as files; their three functions are replaced, same signatures and grants. The
--   API admits a live call only with this file installed (its marker in reserve_personal_answer).
BEGIN;

CREATE OR REPLACE FUNCTION sophia.settle_personal_companion(p_call uuid, p_used bigint, p_usage jsonb) RETURNS boolean
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
  reason=CASE WHEN EXISTS(SELECT FROM sophia.personal_answer_calls b WHERE b.call_id=p_call) THEN 'settled_without_answer'
   ELSE reason END
  WHERE call_id=p_call AND owner_id=sophia.personal_owner() AND state='reserved';
 RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION sophia.settle_personal_companion_answer(p_call uuid, p_used bigint, p_usage jsonb, p_body text,
 p_suggestion text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); b sophia.personal_answer_calls; kept uuid;
BEGIN
 IF p_body IS NULL OR length(p_body) NOT BETWEEN 1 AND 4000 THEN
  RAISE EXCEPTION 'A kept answer has its words' USING ERRCODE='22023';
 END IF;
 PERFORM sophia.personal_hold();
 IF NOT EXISTS(SELECT FROM sophia.personal_companion_usage WHERE call_id=p_call AND owner_id=a)
  OR NOT sophia.settle_personal_companion(p_call, p_used, p_usage) THEN
  RETURN 'not_settled';
 END IF;
 SELECT * INTO b FROM sophia.personal_answer_calls WHERE call_id=p_call AND owner_id=a;
 IF NOT FOUND OR b.epoch<>coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=a),0)
  OR NOT EXISTS(SELECT FROM sophia.personal_turns t WHERE t.owner_id=a AND t.id=b.turn_id AND t.author='person'
   AND t.reply IN ('pending','failed')) THEN
  RETURN 'settled';
 END IF;
 INSERT INTO sophia.personal_settled_answers(owner_id,turn_id,call_id,epoch,body,suggestion)
  VALUES(a,b.turn_id,p_call,b.epoch,p_body,p_suggestion)
  ON CONFLICT (owner_id,turn_id) DO NOTHING
  RETURNING call_id INTO kept;
 -- 0080: this call's own answer retained: its cost is no longer one settled without an answer.
 IF kept=p_call THEN
  UPDATE sophia.personal_companion_usage SET reason=NULL WHERE call_id=p_call AND reason='settled_without_answer';
 END IF;
 RETURN CASE WHEN kept IS NULL THEN 'settled' ELSE 'kept' END;
END $$;

CREATE OR REPLACE FUNCTION sophia.reserve_personal_answer(p_call uuid, p_payer text, p_route text, p_micros bigint,
 p_turn uuid, p_claim uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); e bigint; outcome text;
BEGIN
 -- 0079 completed-call fence (the API's installation marker).
 -- 0080 unusable-completion fence (the API's installation marker).
 PERFORM sophia.personal_hold();
 e:=coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=a),0);
 IF EXISTS(SELECT FROM sophia.personal_settled_answers k WHERE k.owner_id=a AND k.turn_id=p_turn AND k.epoch=e) THEN
  RETURN 'kept';
 END IF;
 IF EXISTS(SELECT FROM sophia.personal_answer_calls b JOIN sophia.personal_companion_usage u ON u.call_id=b.call_id
  WHERE b.owner_id=a AND b.turn_id=p_turn AND b.epoch=e
   AND ((u.state='reserved' AND NOT EXISTS(SELECT FROM sophia.personal_companion_calls c WHERE c.call_id=u.call_id))
    OR u.state='uncertain'
    OR (u.state='settled' AND u.reason IN ('unfinished_call','usage_unknown','stopped_usage_unknown','settled_before_fence',
     'settled_without_answer')))) THEN
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

UPDATE sophia.personal_companion_usage u SET reason='settled_without_answer'
 WHERE u.state='settled' AND u.reason IS NULL
  AND EXISTS(SELECT FROM sophia.personal_answer_calls b
   JOIN sophia.personal_turns t ON t.owner_id=b.owner_id AND t.id=b.turn_id AND t.author='person'
    AND t.reply IN ('failed','pending')
   WHERE b.call_id=u.call_id
    AND b.epoch=coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=b.owner_id),0)
    AND NOT EXISTS(SELECT FROM sophia.personal_settled_answers k
     WHERE k.owner_id=b.owner_id AND k.turn_id=b.turn_id AND k.epoch=b.epoch));

COMMIT;
