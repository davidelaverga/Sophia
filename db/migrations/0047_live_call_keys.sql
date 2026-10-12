-- One bound voice tool call per key, whoever speaks (Codex P1 on PR #190, root's ruling). The API's tool-call path names
-- each call it executes by a key, live:<exchange>:<generation>:<call>, and admits its command under that key; nothing
-- kept that key to one call: a provider call id reused by another speaker admitted a second write under it, in either
-- order. Now the API claims the key before any handler runs, with or without voice qualification:
-- * the first claim holds it, with the speaker, the input epoch, the tool and the digest of the call it was made for;
-- * the same speaker, epoch, tool and call again is the same call (the bridge's retry of a lost answer resends the same
--   call), and goes on as before;
-- * anyone else, another epoch, another tool or another call under it is refused (23505, idempotency_conflict): nothing
--   runs. A provider call id reused for the same tool with other arguments (Codex P1 r4233409532: a control_work with no
--   arguments answered clarify, then a Hold under its id) is another call, never a retry of the first; so is the same
--   tool and arguments in a later utterance (Codex P1 r4233923450: decide_mission_change answered clarify in the
--   utterance its proposal was put in, then accepted it under the same id in the next), another input mode or guide.
-- The call's digest is SHA-256 over the canonical JSON (keys sorted at every depth, no whitespace) of everything its
-- handlers read that the key and the other columns do not hold: {args, utterance, inputMode, guide}, an absent one as
-- null. The API computes it from the call it received: the same arguments in another key order are the same call. Only
-- the digest is kept, never the arguments.
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
-- call's digest but never its arguments, and no time of its own. Once its exchange has ended, every call there is
-- refused at its bind (media_tool_speaker, 40001) before the claim commits, so the key protects nothing more; the
-- worker's periodic pass deletes it an hour after the end (live_call_keys_expire), a margin far past the bridge's
-- retries (a second at most).
-- Its claim reads and writes nothing of voice qualification (0046): an API with that off needs this migration and none
-- of 0046. Only media_live_call_answer, below, reads 0046's record of a call, and live_call_seal and
-- media_mark_live_call write its answer there, each only for a call that was recorded (voice qualification on). They
-- replace 0046's media_answer_live_call on the API's path; it stays, unused there.
-- 0046's recording (media_record_live_call) compares the exchange, epoch and tool, not the call's digest, and needs no
-- more: the API claims every call it records first, in the same transaction, so another call under a recorded key is
-- refused here before the recording runs, and the claim outlives every call that could still bind.
-- A recorded call's answer is written under its fence's generation (live_call_fences, below; Codex P1 r4234782534).
-- No member reads the claims or the generations: row security, no policy, no grant. 0001-0046 are not edited.
BEGIN;

CREATE TABLE sophia.live_call_keys (
 idempotency_key text NOT NULL PRIMARY KEY
  CHECK(idempotency_key ~ '^live:[0-9a-f-]{36}:[0-9]{1,16}:[A-Za-z0-9._:-]{1,120}$'),
 exchange_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 input_epoch bigint NOT NULL CHECK(input_epoch>0),
 tool text NOT NULL CHECK(tool ~ '^[a-z][a-z_]{0,63}$'),
 call_sha256 text NOT NULL CHECK(call_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX live_call_keys_exchange ON sophia.live_call_keys(exchange_id);
ALTER TABLE sophia.live_call_keys ENABLE ROW LEVEL SECURITY;

-- Claim a bound tool call's key for its speaker, epoch, tool and call's digest, before anything runs for it. The same call again is a
-- no-op; another call under the key is refused. Run by the service in the transaction that binds the call to its
-- speaker (media_tool_speaker), so a call that does not bind claims nothing. It reads the exchange without locking it.
CREATE FUNCTION sophia.media_claim_live_call(p_exchange uuid, p_input_epoch bigint, p_actor uuid, p_key text, p_tool text,
 p_call_sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM sophia.require_service();
 IF NOT EXISTS(SELECT 1 FROM sophia.room_exchanges WHERE id=p_exchange) THEN
  RAISE EXCEPTION 'Exchange not found' USING ERRCODE='22023'; END IF;
 IF p_key NOT LIKE 'live:'||p_exchange::text||':%' THEN RAISE EXCEPTION 'The key names another exchange' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.live_call_keys(idempotency_key,exchange_id,actor_id,input_epoch,tool,call_sha256)
 VALUES(p_key,p_exchange,p_actor,p_input_epoch,p_tool,p_call_sha256) ON CONFLICT (idempotency_key) DO NOTHING;
 IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM sophia.live_call_keys WHERE idempotency_key=p_key AND exchange_id=p_exchange
   AND actor_id=p_actor AND input_epoch=p_input_epoch AND tool=p_tool AND call_sha256=p_call_sha256) THEN
  RAISE EXCEPTION 'Idempotency key reused: another call holds this key' USING ERRCODE='23505'; END IF;
END $$;

-- A recorded voice call's answer, for a repeat of it (Codex P1 r4234171899): a recorded call once answered is terminal,
-- and the API answers its repeat from here, running nothing again. A refusal or a question that depended on the state
-- of the work stays the call's answer however that state moves; run again, the handler could admit a command that
-- live_call_admits would link to a call recorded as refused. Its outcome, the command it admitted and that command's
-- task, as exchange_calls reads them; null while it is unanswered (the attempt before stopped before answering it: the
-- repeat runs it, and answers it). The service reads it in the transaction that binds the call, after the recording
-- (0046, media_record_live_call), so only for a recorded call, never without 0046. It locks nothing.
CREATE FUNCTION sophia.media_live_call_answer(p_exchange uuid, p_actor uuid, p_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM sophia.require_service();
 RETURN (SELECT jsonb_build_object('outcome',lt.outcome,'commandId',lt.command_id,
   'taskId',(SELECT j.id FROM sophia.jobs j WHERE j.project_id=lt.project_id AND j.command_id=lt.command_id
     AND j.parent_job_id IS NULL ORDER BY j.created_at LIMIT 1))
  FROM sophia.live_tool_calls lt
  WHERE lt.exchange_id=p_exchange AND lt.actor_id=p_actor AND lt.idempotency_key=p_key AND lt.answered_at IS NOT NULL);
END $$;

-- The fence a recorded call is answered under (Codex P1 r4234782534 on PR #190). With voice qualification on, the API
-- makes each call under its key's fence: a session advisory lock on a database session of its own. That session can be
-- lost while its API process goes on (its connection dropped or terminated), and the fence is then free for another
-- attempt of the call. So the attempt that takes the fence takes the key's next generation here, on that same session,
-- once it holds the lock (media_fence_live_call), and a recorded call's answer is written only under the generation
-- its attempt took:
-- * in the transaction that writes what the call does, as its last statement and in the speaker's own transaction
--   (live_call_seal): what the call admitted or saved and its answer commit together, or neither does;
-- * on its own, for a call that writes nothing (a refusal, a question back, a read; media_mark_live_call).
-- Each locks the key's generation row to its commit and checks it first. An attempt whose fence passed to another
-- rolls back: it admits, saves and marks nothing (the API answers that the call could not be confirmed). One that
-- checked first commits its write and its answer together, and the next attempt's generation waits for that commit,
-- then its binding reads the answer and replays it. So no state holds an effect of the call without its answer.
-- The generation row is the key's own, as the claim's is: no foreign key, and no lock but its own row. Taking the next
-- generation runs alone, on the fence's session, holding no other lock; a seal takes the row last, after whatever its
-- write locked. Nothing that holds the row waits on a lock a binding holds (a binding waits for the row first), so it
-- adds no lock order. The row holds the key, its exchange and a counter: no speaker, no call, no time. It is deleted
-- with the key (live_call_keys_expire).
CREATE TABLE sophia.live_call_fences (
 idempotency_key text NOT NULL PRIMARY KEY
  CHECK(idempotency_key ~ '^live:[0-9a-f-]{36}:[0-9]{1,16}:[A-Za-z0-9._:-]{1,120}$'),
 exchange_id uuid NOT NULL,
 generation bigint NOT NULL CHECK(generation>0)
);
CREATE INDEX live_call_fences_exchange ON sophia.live_call_fences(exchange_id);
ALTER TABLE sophia.live_call_fences ENABLE ROW LEVEL SECURITY;

-- The next generation of a call key's fence, for the attempt that now holds it: run by the service on the fence's own
-- session, once its advisory lock is held, in a statement of its own. It waits for a seal still holding the row.
CREATE FUNCTION sophia.media_fence_live_call(p_exchange uuid, p_key text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g bigint;
BEGIN
 PERFORM sophia.require_service();
 IF p_key NOT LIKE 'live:'||p_exchange::text||':%' THEN RAISE EXCEPTION 'The key names another exchange' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.live_call_fences AS f(idempotency_key,exchange_id,generation) VALUES(p_key,p_exchange,1)
 ON CONFLICT (idempotency_key) DO UPDATE SET generation=f.generation+1
 RETURNING f.generation INTO g;
 RETURN g;
END $$;

-- Whether a call key's fence is still at the generation an attempt took; the key's row is locked to the caller's commit.
CREATE FUNCTION sophia.live_call_fence_holds(p_exchange uuid, p_key text, p_generation bigint) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce((SELECT f.generation=p_generation FROM sophia.live_call_fences f
  WHERE f.idempotency_key=p_key AND f.exchange_id=p_exchange FOR UPDATE), false) $$;

-- A recorded call's answer, sealed by its speaker's own transaction, the one that writes what the call does, as its last
-- statement: under the generation its attempt's fence holds, or nothing of the transaction commits ('Fence moved').
CREATE FUNCTION sophia.live_call_seal(p_exchange uuid, p_key text, p_generation bigint, p_outcome text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id();
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'A call is sealed by its speaker''s own write' USING ERRCODE='42501'; END IF;
 -- the seal's generation check
 IF NOT sophia.live_call_fence_holds(p_exchange, p_key, p_generation) THEN
  RAISE EXCEPTION 'Fence moved: another attempt holds this call' USING ERRCODE='40001'; END IF;
 UPDATE sophia.live_tool_calls SET answered_at=clock_timestamp(), outcome=p_outcome
  WHERE exchange_id=p_exchange AND actor_id=a AND idempotency_key=p_key AND answered_at IS NULL;
END $$;

-- A recorded call that wrote nothing, answered by the service: under the generation its attempt's fence holds, or not at
-- all ('Fence moved'). It reads no exchange state and takes no lock of the exchange, as 0046's mark did: a call
-- recorded before an End is still answered after it.
CREATE FUNCTION sophia.media_mark_live_call(p_exchange uuid, p_actor uuid, p_key text, p_generation bigint, p_outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM sophia.require_service();
 -- the mark's generation check
 IF NOT sophia.live_call_fence_holds(p_exchange, p_key, p_generation) THEN
  RAISE EXCEPTION 'Fence moved: another attempt holds this call' USING ERRCODE='40001'; END IF;
 UPDATE sophia.live_tool_calls SET answered_at=clock_timestamp(), outcome=p_outcome
  WHERE exchange_id=p_exchange AND actor_id=p_actor AND idempotency_key=p_key AND answered_at IS NULL;
END $$;

-- Delete the keys of exchanges that ended over an hour ago, and their fences' generations; returns how many keys. Run
-- by the worker's periodic pass (apps/worker dispatchOnce, on the sophia_worker login), never by a member. Its own
-- statements: they lock only the rows they delete. A fence's row whose exchange is gone goes too.
CREATE FUNCTION sophia.live_call_keys_expire() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE n integer;
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'Expiry is the service''s, never a member''s' USING ERRCODE='42501'; END IF;
 DELETE FROM sophia.live_call_keys k USING sophia.room_exchanges e
  WHERE e.id=k.exchange_id AND e.state='ended' AND e.ended_at<=now()-interval '1 hour';
 GET DIAGNOSTICS n = ROW_COUNT;
 DELETE FROM sophia.live_call_fences f WHERE NOT EXISTS(SELECT 1 FROM sophia.room_exchanges e
  WHERE e.id=f.exchange_id AND NOT (e.state='ended' AND e.ended_at<=now()-interval '1 hour'));
 RETURN n;
END $$;

REVOKE ALL ON FUNCTION sophia.media_claim_live_call(uuid,bigint,uuid,text,text,text), sophia.live_call_keys_expire(),
 sophia.media_live_call_answer(uuid,uuid,text), sophia.media_fence_live_call(uuid,text),
 sophia.live_call_fence_holds(uuid,text,bigint), sophia.live_call_seal(uuid,text,bigint,text),
 sophia.media_mark_live_call(uuid,uuid,text,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.media_claim_live_call(uuid,bigint,uuid,text,text,text),
 sophia.media_live_call_answer(uuid,uuid,text), sophia.media_fence_live_call(uuid,text),
 sophia.live_call_seal(uuid,text,bigint,text), sophia.media_mark_live_call(uuid,uuid,text,bigint,text) TO sophia_api;
GRANT EXECUTE ON FUNCTION sophia.live_call_keys_expire() TO sophia_worker;

COMMIT;
