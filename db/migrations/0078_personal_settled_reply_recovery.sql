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
-- * The kept answer is bound to its owner, its turn (still pending under the claim the call was made for), its call
--   (registered to that owner in the space's current epoch) and that epoch; a call settled after an erasure keeps no
--   answer, and an erasure (which deletes the turns) takes the kept answers with them. The cost ledger (0073) stays
--   content-free and is never touched here beyond the existing settlement.
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

-- The caller's reserved call settles from its usage, and its answer is kept for the turn it was asked for, both or
-- neither: kept only while that turn is the caller's, pending under p_claim, and the call registered to the caller in
-- the space's current epoch. True if the call settled here (as settle_personal_companion answers).
CREATE FUNCTION sophia.settle_personal_companion_answer(p_call uuid, p_turn uuid, p_claim uuid, p_used bigint,
 p_usage jsonb, p_body text, p_suggestion text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); e bigint; settled boolean;
BEGIN
 IF p_body IS NULL OR length(p_body) NOT BETWEEN 1 AND 4000 THEN
  RAISE EXCEPTION 'A kept answer has its words' USING ERRCODE='22023';
 END IF;
 PERFORM sophia.personal_hold();
 settled:=sophia.settle_personal_companion(p_call, p_used, p_usage);
 IF NOT settled THEN RETURN false; END IF;
 SELECT c.epoch INTO e FROM sophia.personal_companion_calls c WHERE c.owner_id=a AND c.call_id=p_call;
 IF FOUND AND e=coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=a),0)
  AND EXISTS(SELECT FROM sophia.personal_turns t WHERE t.owner_id=a AND t.id=p_turn AND t.author='person'
   AND t.reply='pending' AND t.answering_claim=p_claim) THEN
  INSERT INTO sophia.personal_settled_answers(owner_id,turn_id,call_id,epoch,body,suggestion)
   VALUES(a,p_turn,p_call,e,p_body,p_suggestion)
   ON CONFLICT (owner_id,turn_id) DO NOTHING;
 END IF;
 RETURN true;
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

REVOKE ALL ON FUNCTION sophia.settle_personal_companion_answer(uuid,uuid,uuid,bigint,jsonb,text,text),
 sophia.personal_settled_answer(uuid), sophia.record_personal_settled_reply(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.settle_personal_companion_answer(uuid,uuid,uuid,bigint,jsonb,text,text),
 sophia.personal_settled_answer(uuid), sophia.record_personal_settled_reply(uuid,uuid) TO sophia_api;

COMMIT;
