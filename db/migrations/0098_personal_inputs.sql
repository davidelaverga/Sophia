-- INC03-CC-002 P1 (0098, root-assigned): a person's Personal message retained as a versioned automatic_v1 input, held
-- (`recorded`), with no effect. Plan: docs/plans/personal-inputs.md. Pack v2 INC03-R01/R04/R06, C03-R01/R02 (docs commit
-- c43701ab). A record, not an intake: nothing assesses, answers, wakes, notifies, funds or dispatches it.
-- * One new writer, sophia.send_personal_input(key, contract, epoch, text), EXECUTE to sophia_api only. The owner is the
--   calling actor (personal_owner), never an argument. The write is fenced to the epoch the caller names, in its own
--   transaction (personal_fence: the space locked, another epoch refused 40001), before its key is read. The contract is
--   required and exactly 'automatic_v1' (NULL or anything else: 22023); there is no boolean and no default.
-- * The body is kept once, as a person turn in sophia.personal_turns, whose reply state is the new value `recorded`:
--   neither asked (pending), answered nor failed. next_personal_reply, claim_personal_reply, the answer reservation
--   and settlement (0078-0080) and retry_personal_turn read pending or failed only, so none of them takes it. Its
--   asked_at is set because 0021 requires one for every person turn: here it is when the turn was retained, not when
--   anything was asked, assessed or admitted.
-- * Its metadata, without words or digest, is one row of sophia.personal_inputs, keyed to the turn by owner and id and
--   deleted with it (erasure deletes the turns). The request key is the owner's one personal_requests namespace: the
--   same key and words replay the receipt; other words, the legacy send or another contract under the key is 23505;
--   after an erasure every older key is refused (40001), and an older epoch is refused whatever its key.
-- * Not hidden: the current Personal reads, poll and export (TURNS) show the turn with reply `recorded`, a value A10's
--   PersonalTurn does not list, and the companion's history (HISTORY) includes its words before a later legacy turn.
--   No route calls this writer; exposing it needs those reads, A10 and the Studio decided first (plan, "Integration").
-- No earlier migration is edited and no existing function is replaced; only the reply CHECK of personal_turns widens.
BEGIN;

ALTER TABLE sophia.personal_turns DROP CONSTRAINT personal_turns_reply_check;
ALTER TABLE sophia.personal_turns ADD CONSTRAINT personal_turns_reply_check
 CHECK(reply IN ('pending','answered','failed','recorded'));

CREATE TABLE sophia.personal_inputs (
 owner_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 turn_id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 interaction_contract text NOT NULL CHECK(interaction_contract='automatic_v1'),
 contract_version integer NOT NULL CHECK(contract_version=1),
 origin text NOT NULL CHECK(origin='text'),
 audience text NOT NULL CHECK(audience='personal_owner'),
 addressing_basis text NOT NULL CHECK(addressing_basis='personal_default'),
 state text NOT NULL DEFAULT 'recorded' CHECK(state='recorded'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,id),
 UNIQUE(owner_id,turn_id),
 UNIQUE(owner_id,idempotency_key),
 FOREIGN KEY(owner_id,turn_id) REFERENCES sophia.personal_turns(owner_id,id) ON DELETE CASCADE
);

ALTER TABLE sophia.personal_inputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON sophia.personal_inputs FOR SELECT TO sophia_api USING(owner_id=sophia.actor_id());
REVOKE ALL ON sophia.personal_inputs FROM PUBLIC;
GRANT SELECT ON sophia.personal_inputs TO sophia_api;
-- No write grant on the table, and none to the worker or the assembler: send_personal_input is the only writer.

-- A recorded person turn after the owner's last one. Internal: no grant. Never personal_append, which asks for a reply.
CREATE FUNCTION sophia.personal_append_recorded(p_body text) RETURNS sophia.personal_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE seq_value bigint; t sophia.personal_turns;
BEGIN
 UPDATE sophia.personal_spaces SET turn_seq=turn_seq+1 WHERE owner_id=sophia.personal_owner() RETURNING turn_seq INTO seq_value;
 INSERT INTO sophia.personal_turns(owner_id,seq,author,body,reply_to,reply,asked_at)
 VALUES(sophia.personal_owner(),seq_value,'person',p_body,NULL,'recorded',pg_catalog.now())
 RETURNING * INTO t;
 RETURN t;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_append_recorded(text) FROM PUBLIC;

-- The person's message, retained as an automatic_v1 input and held: no reply is asked for and nothing follows from it.
CREATE FUNCTION sophia.send_personal_input(p_key text, p_contract text, p_epoch bigint, p_text text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE a uuid:=sophia.personal_owner(); body text; semantic jsonb; prior jsonb; s sophia.personal_spaces;
 t sophia.personal_turns; input_id uuid:=pg_catalog.gen_random_uuid(); receipt jsonb;
BEGIN
 -- The space locked and the epoch checked in this transaction, before anything under the key is read.
 PERFORM sophia.personal_fence(p_epoch);
 IF p_contract IS DISTINCT FROM 'automatic_v1' THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 body:=sophia.personal_text(p_text,4000);
 semantic:=pg_catalog.jsonb_build_object('text',sophia.personal_digest(body),'interactionContract','automatic_v1',
  'contractVersion',1);
 prior:=sophia.personal_prior(p_key,'send_input',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 s:=sophia.personal_touch();
 t:=sophia.personal_append_recorded(body);
 INSERT INTO sophia.personal_inputs(owner_id,id,turn_id,idempotency_key,interaction_contract,contract_version,origin,
  audience,addressing_basis)
 VALUES(a,input_id,t.id,p_key,'automatic_v1',1,'text','personal_owner','personal_default');
 receipt:=sophia.personal_receipt('send_input',s.revision,pg_catalog.jsonb_build_object('turnId',t.id,'seq',t.seq))
  ||pg_catalog.jsonb_build_object('inputId',input_id,'interactionContract','automatic_v1','contractVersion',1,
   'input','recorded','effect','none');
 RETURN sophia.personal_remember(p_key,'send_input',semantic,receipt);
END $$;
REVOKE ALL ON FUNCTION sophia.send_personal_input(text,text,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.send_personal_input(text,text,bigint,text) TO sophia_api;

COMMIT;
