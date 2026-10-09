-- One bound voice tool call per key, whoever speaks (Codex P1 on PR #190, root's ruling). The API's tool-call path names
-- each call it executes by a key, live:<exchange>:<generation>:<call>, and admits its command under that key; nothing
-- kept that key to one call: a provider call id reused by another speaker admitted a second write under it, in either
-- order. Now the API claims the key before any handler runs, with or without voice qualification:
-- * the first claim holds it, with the speaker, the input epoch, the tool and the digest of the arguments it was made
--   for;
-- * the same speaker, epoch, tool and arguments again is the same call (the bridge's retry of a lost answer), and goes
--   on as before;
-- * anyone else, another epoch, another tool or other arguments under it is refused (23505, idempotency_conflict):
--   nothing runs. A provider call id reused for the same tool with other arguments (Codex P1 r4233409532: a control_work
--   with no arguments answered clarify, then a Hold under its id) is another call, never a retry of the first.
-- The digest is SHA-256 over the arguments' canonical JSON (keys sorted at every depth, no whitespace), computed by the
-- API from the call it received: the same arguments in another key order are the same call. Only the digest is kept,
-- never the arguments.
-- This holds on the tool-call path. A member's own Studio request under a live: key is outside it: commands are unique
-- per project, actor and key (0001), so it is admitted under that member's own name, and links to no call (0046).
-- The claim is an insert on the key's primary key: of two at once, exactly one holds it, and the other is refused once
-- the first commits (or claims it, if the first rolled back). The table has no foreign key (prodrev-r3 F1 on PR #190):
-- one would lock the project and the exchange rows FOR KEY SHARE until commit, and the recording that follows the claim
-- in the same transaction (0046, media_record_live_call) takes the project FOR UPDATE, so two calls of one project under
-- different keys deadlocked. Without one, the claim locks only its key's row: it takes no project or exchange lock, and
-- the API claims before it takes any, so no transaction that holds a project lock ever waits for a key. The function
-- checks the exchange exists and that the key names it; it is the only writer.
-- A key is kept only while a retry of its call may come, and holds only what deciding "the same call" needs: the
-- arguments' digest but never the arguments, and no time of its own. Once its exchange has ended, every call there is
-- refused at its bind (media_tool_speaker, 40001) before the claim commits, so the key protects nothing more; the
-- worker's periodic pass deletes it an hour after the end (live_call_keys_expire), a margin far past the bridge's
-- retries (a second at most).
-- It reads and writes nothing of voice qualification (0046): an API with that off needs this migration and none of 0046.
-- 0046's recording (media_record_live_call) compares the exchange, epoch and tool, not the arguments, and needs no more:
-- the API claims every call it records first, in the same transaction, so a call under a recorded key with other
-- arguments is refused here before the recording runs, and the claim outlives every call that could still bind.
-- No member reads the claims: row security, no policy, no grant. 0001-0046 are not edited.
BEGIN;

CREATE TABLE sophia.live_call_keys (
 idempotency_key text NOT NULL PRIMARY KEY
  CHECK(idempotency_key ~ '^live:[0-9a-f-]{36}:[0-9]{1,16}:[A-Za-z0-9._:-]{1,120}$'),
 exchange_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 input_epoch bigint NOT NULL CHECK(input_epoch>0),
 tool text NOT NULL CHECK(tool ~ '^[a-z][a-z_]{0,63}$'),
 args_sha256 text NOT NULL CHECK(args_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX live_call_keys_exchange ON sophia.live_call_keys(exchange_id);
ALTER TABLE sophia.live_call_keys ENABLE ROW LEVEL SECURITY;

-- Claim a bound tool call's key for its speaker, epoch, tool and arguments' digest, before anything runs for it. The same call again is a
-- no-op; another call under the key is refused. Run by the service in the transaction that binds the call to its
-- speaker (media_tool_speaker), so a call that does not bind claims nothing. It reads the exchange without locking it.
CREATE FUNCTION sophia.media_claim_live_call(p_exchange uuid, p_input_epoch bigint, p_actor uuid, p_key text, p_tool text,
 p_args_sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM sophia.require_service();
 IF NOT EXISTS(SELECT 1 FROM sophia.room_exchanges WHERE id=p_exchange) THEN
  RAISE EXCEPTION 'Exchange not found' USING ERRCODE='22023'; END IF;
 IF p_key NOT LIKE 'live:'||p_exchange::text||':%' THEN RAISE EXCEPTION 'The key names another exchange' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.live_call_keys(idempotency_key,exchange_id,actor_id,input_epoch,tool,args_sha256)
 VALUES(p_key,p_exchange,p_actor,p_input_epoch,p_tool,p_args_sha256) ON CONFLICT (idempotency_key) DO NOTHING;
 IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM sophia.live_call_keys WHERE idempotency_key=p_key AND exchange_id=p_exchange
   AND actor_id=p_actor AND input_epoch=p_input_epoch AND tool=p_tool AND args_sha256=p_args_sha256) THEN
  RAISE EXCEPTION 'Idempotency key reused: another call holds this key' USING ERRCODE='23505'; END IF;
END $$;

-- Delete the keys of exchanges that ended over an hour ago; returns how many. Run by the worker's periodic pass (apps/worker
-- dispatchOnce, on the sophia_worker login), never by a member. Its own statement: it locks only the keys it deletes.
CREATE FUNCTION sophia.live_call_keys_expire() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE n integer;
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'Expiry is the service''s, never a member''s' USING ERRCODE='42501'; END IF;
 DELETE FROM sophia.live_call_keys k USING sophia.room_exchanges e
  WHERE e.id=k.exchange_id AND e.state='ended' AND e.ended_at<=now()-interval '1 hour';
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN n;
END $$;

REVOKE ALL ON FUNCTION sophia.media_claim_live_call(uuid,bigint,uuid,text,text,text), sophia.live_call_keys_expire() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.media_claim_live_call(uuid,bigint,uuid,text,text,text) TO sophia_api;
GRANT EXECUTE ON FUNCTION sophia.live_call_keys_expire() TO sophia_worker;

COMMIT;
