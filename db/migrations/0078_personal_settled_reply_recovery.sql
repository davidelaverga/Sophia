-- 0078: a settled answer is never paid for twice (#435 4319508047, FND-B76/B77).
--
-- A live call to the companion settles its cost (0073) before its reply is written (0021). Should every write of
-- the reply fail (the database away for a moment), the cost stayed settled and the answer was lost; once the turn's
-- claim lapsed, asking again called and settled the provider a second time for the one answer requested.
--
-- Here the answer is kept with the settlement, in the same transaction, privately to its owner and turn: a call's
-- cost and its answer commit together or not at all. The reply is then written from the kept answer, which goes in
-- the same transaction as the reply is kept; a later attempt at the turn (another process, a restart, Ask again)
-- finds the kept answer and writes it, asking the companion nothing.
--
-- * The kept answer is bound to its owner and to the turn its call was reserved to answer (personal_answer_calls,
--   written with the reservation), not to the turn's claim, asked_at or the call's registration, which a lapse or a
--   normal retry moves while the settlement waits (R-B77-S1-P1, R-B77-F-P1). A reservation for a turn whose answer
--   is already kept is refused under the same lock, so no second call is paid for it. A call settled after an erasure keeps no answer, and
--   an erasure (which deletes the turns) takes the kept answers with them. The cost ledger (0073) stays content-free
--   and is never touched here beyond the existing settlement.
-- * Nothing reads the table but these functions, each for the caller's own space (sophia.personal_owner()), in the
--   space's lock order (the space first, as 0021 and 0073 take it).
BEGIN;

CREATE TABLE sophia.personal_settled_answers (
 owner_id uuid NOT NULL,
 turn_id uuid NOT NULL,
 call_id uuid NOT NULL UNIQUE,
 epoch bigint NOT NULL,
 body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
 suggestion text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (owner_id, turn_id),
 FOREIGN KEY (owner_id, turn_id) REFERENCES sophia.personal_turns(owner_id, id) ON DELETE CASCADE
);
ALTER TABLE sophia.personal_settled_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.personal_settled_answers FROM PUBLIC;

-- Which turn a reserved call answers, written with its reservation and never after (R-B77-F-P1: not the turn's claim
-- or asked_at, which a normal retry moves): the durable association a settlement keeps its answer by. An erasure
-- (which deletes the turns) takes it.
CREATE TABLE sophia.personal_answer_calls (
 owner_id uuid NOT NULL,
 call_id uuid PRIMARY KEY,
 turn_id uuid NOT NULL,
 epoch bigint NOT NULL,
 FOREIGN KEY (owner_id, turn_id) REFERENCES sophia.personal_turns(owner_id, id) ON DELETE CASCADE
);
ALTER TABLE sophia.personal_answer_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.personal_answer_calls FROM PUBLIC;

-- The caller's call is reserved to answer p_turn (0073's reserve_personal_companion), and bound to it in the same
-- transaction, under the space's lock; or, when an answer is already kept for that turn, nothing is reserved:
-- 'kept' (its words are written instead, never asked for again). Settlements of the same space take the same lock,
-- so a kept answer committed just before is seen here (R-B77-F-P1's read-then-reserve race).
CREATE FUNCTION sophia.reserve_personal_answer(p_call uuid, p_payer text, p_route text, p_micros bigint, p_turn uuid)
 RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); e bigint; outcome text;
BEGIN
 PERFORM sophia.personal_hold();
 e:=coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=a),0);
 IF EXISTS(SELECT FROM sophia.personal_settled_answers k WHERE k.owner_id=a AND k.turn_id=p_turn AND k.epoch=e) THEN
  RETURN 'kept';
 END IF;
 IF NOT EXISTS(SELECT FROM sophia.personal_turns t WHERE t.owner_id=a AND t.id=p_turn AND t.author='person') THEN
  RETURN 'not_current';
 END IF;
 outcome:=sophia.reserve_personal_companion(p_call, p_payer, p_route, p_micros);
 IF outcome='reserved' THEN
  INSERT INTO sophia.personal_answer_calls(owner_id,call_id,turn_id,epoch) VALUES(a,p_call,p_turn,e);
 END IF;
 RETURN outcome;
END $$;

-- The caller's reserved call settles from its usage, and its answer is kept for the turn it was reserved to answer
-- (personal_answer_calls), in one transaction: while that turn is still the caller's person turn, pending or failed,
-- in the epoch the call was reserved in, which is the space's current one. After an erasure (another epoch, the turn
-- gone) the cost is settled and nothing is kept. The outcome says which:
--   'kept'        settled, and this answer is kept for the turn;
--   'settled'     settled, nothing kept here (erased, the turn answered or gone, unbound, or an answer already kept);
--   'not_settled' this call was not the caller's reserved one (already settled, held, released or unknown).
CREATE FUNCTION sophia.settle_personal_companion_answer(p_call uuid, p_used bigint, p_usage jsonb, p_body text,
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
 RETURN CASE WHEN kept IS NULL THEN 'settled' ELSE 'kept' END;
END $$;

-- The answer kept for one of the caller's turns, in the space's current epoch, or nothing: read only, so a reply
-- not yet written keeps it.
CREATE FUNCTION sophia.personal_settled_answer(p_turn uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('text',k.body,'suggestion',k.suggestion)
 FROM sophia.personal_settled_answers k
 WHERE k.owner_id=sophia.personal_owner() AND k.turn_id=p_turn
  AND k.epoch=coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=k.owner_id),0)
$$;

-- The turn's reply written from its kept answer, under p_claim, and the kept answer let go in the same transaction
-- once the reply is written (or already was): its receipt, as record_personal_reply answers; NULL when no answer is
-- kept or the claim is no longer the turn's (the kept answer then stays for the attempt that holds it).
CREATE FUNCTION sophia.record_personal_settled_reply(p_turn uuid, p_claim uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); k sophia.personal_settled_answers; receipt jsonb;
BEGIN
 PERFORM 1 FROM sophia.personal_spaces WHERE owner_id=a FOR UPDATE;
 SELECT * INTO k FROM sophia.personal_settled_answers WHERE owner_id=a AND turn_id=p_turn
  AND epoch=coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=a),0) FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 receipt:=sophia.record_personal_reply(p_turn, p_claim, k.body, k.suggestion);
 IF receipt IS NOT NULL THEN
  DELETE FROM sophia.personal_settled_answers WHERE owner_id=a AND turn_id=p_turn;
 END IF;
 RETURN receipt;
END $$;

REVOKE ALL ON FUNCTION sophia.reserve_personal_answer(uuid,text,text,bigint,uuid),
 sophia.settle_personal_companion_answer(uuid,bigint,jsonb,text,text),
 sophia.personal_settled_answer(uuid), sophia.record_personal_settled_reply(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.reserve_personal_answer(uuid,text,text,bigint,uuid),
 sophia.settle_personal_companion_answer(uuid,bigint,jsonb,text,text),
 sophia.personal_settled_answer(uuid), sophia.record_personal_settled_reply(uuid,uuid) TO sophia_api;

COMMIT;
