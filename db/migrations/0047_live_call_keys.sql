-- One bound voice tool call per key, whoever speaks (Codex P1 on PR #190, root's ruling). The API's tool-call path names
-- each call it executes by a key, live:<exchange>:<generation>:<call>, and admits its command under that key; nothing
-- kept that key to one call: a provider call id reused by another speaker admitted a second write under it, in either
-- order. Now the API claims the key before any handler runs, with or without voice qualification:
-- * the first claim holds it, with the speaker, the input epoch and the tool it was made for;
-- * the same speaker, epoch and tool again is the same call (the bridge's retry of a lost answer), and goes on as before;
-- * anyone else, another epoch or another tool under it is refused (23505, idempotency_conflict): nothing runs.
-- The claim is an insert on the key's primary key: of two at once, exactly one holds it, and the other is refused once
-- the first commits (or claims it, if the first rolled back). It takes no project or exchange lock, and the API claims
-- before it takes any, so it adds no lock order. It reads and writes nothing of voice qualification (0046): an API with
-- that off needs this migration and none of 0046. No member reads the claims: row security, no policy, no grant.
-- 0001-0046 are not edited.
BEGIN;

CREATE TABLE sophia.live_call_keys (
 idempotency_key text NOT NULL PRIMARY KEY
  CHECK(idempotency_key ~ '^live:[0-9a-f-]{36}:[0-9]{1,16}:[A-Za-z0-9._:-]{1,120}$'),
 project_id uuid NOT NULL REFERENCES sophia.projects(id),
 exchange_id uuid NOT NULL REFERENCES sophia.room_exchanges(id),
 actor_id uuid NOT NULL,
 input_epoch bigint NOT NULL CHECK(input_epoch>0),
 tool text NOT NULL CHECK(tool ~ '^[a-z][a-z_]{0,63}$'),
 claimed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sophia.live_call_keys ENABLE ROW LEVEL SECURITY;

-- Claim a bound tool call's key for its speaker, epoch and tool, before anything runs for it. The same call again is a
-- no-op; another call under the key is refused. Run by the service in the transaction that binds the call to its
-- speaker (media_tool_speaker), so a call that does not bind claims nothing.
CREATE FUNCTION sophia.media_claim_live_call(p_exchange uuid, p_input_epoch bigint, p_actor uuid, p_key text, p_tool text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE p uuid;
BEGIN
 PERFORM sophia.require_service();
 SELECT project_id INTO p FROM sophia.room_exchanges WHERE id=p_exchange;
 IF p IS NULL THEN RAISE EXCEPTION 'Exchange not found' USING ERRCODE='22023'; END IF;
 IF p_key NOT LIKE 'live:'||p_exchange::text||':%' THEN RAISE EXCEPTION 'The key names another exchange' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.live_call_keys(idempotency_key,project_id,exchange_id,actor_id,input_epoch,tool)
 VALUES(p_key,p,p_exchange,p_actor,p_input_epoch,p_tool) ON CONFLICT (idempotency_key) DO NOTHING;
 IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM sophia.live_call_keys WHERE idempotency_key=p_key AND exchange_id=p_exchange
   AND actor_id=p_actor AND input_epoch=p_input_epoch AND tool=p_tool) THEN
  RAISE EXCEPTION 'Idempotency key reused: another call holds this key' USING ERRCODE='23505'; END IF;
END $$;

REVOKE ALL ON FUNCTION sophia.media_claim_live_call(uuid,bigint,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.media_claim_live_call(uuid,bigint,uuid,text,text) TO sophia_api;

COMMIT;
