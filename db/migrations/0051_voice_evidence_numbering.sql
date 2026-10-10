-- The service numbers the bridge's voice qualification receipts (Codex P1 r4232908444 on PR #190; root's design review).
-- Its number is PROVISIONAL, pending owner/root confirmation on #198: CON-01's #199 holds 0048, and #198 records its
-- proposed 0048-0050. It needs only 0046 and 0047, so any later number works.
-- 0046 kept a receipt once per sequence number the bridge chose, and the bridge numbered from memory: a restarted
-- process began again at 1, so every receipt it sent collided with one already kept (23505) and was lost, and two
-- processes serving one exchange at once (a deploy's overlap) collided the same way. Now:
-- * each write carries the bridge's own identity for it (a random UUID, the same on every resend of that write);
-- * under the project's and the exchange's locks (0003's order, as every receipt and reservation takes them), a new
--   write takes the exchange's next number from a durable high-water counter, kept per exchange and grant and never
--   lowered, whatever expires: a number is never given twice, even after every receipt it named has expired;
-- * the same write again (the same identity and the same receipt) is answered with its own number, and the guard's
--   answer as 0046 gives a repeat; the same identity with another receipt is refused (23505) and spends no number;
-- * a write 0046 refuses (another grant, an unreserved connection, free text) rolls back with its number: none is
--   spent, so the numbers stay dense from 1, in the order the service accepted the writes;
-- * past 99,999 a write is refused and nothing changes.
-- The idempotency horizon: an identity is kept exactly as long as the receipt it numbered (its row goes with 0046's
-- 24 h expiry), and the exchange accepts writes, new or repeated, only until 24 h less one minute after its first: by
-- then no identity has expired yet. After it, every write is refused (22023), never numbered again.
-- 0046 is frozen and untouched: its media_record_evidence still keeps each receipt (it is called here with the number
-- given); the 'service' source (the guard's receipt, seq 0) is not counted.
-- The bridge-numbered path is closed (root's C2 option (c)): EXECUTE on 0046's media_record_evidence is revoked from
-- sophia_api and PUBLIC (below), so no login numbers a receipt itself; media_record_evidence_write, SECURITY DEFINER,
-- calls it as its owner. And this migration starts from the pre-activation state: if any bridge receipt is already
-- kept (numbered by the bridge through 0046, with no counter here), it refuses to apply (55000) rather than number
-- beside it sparsely or collide with it; such receipts expire in 24 h (voice_evidence_expire), or are migrated by an
-- explicit, reviewed step.
-- It also replaces 0046's voice_room_qualification (below): a room token names a grant only while the room's open
-- exchange, if any, is under it (Codex P1 r4232975804). And it stamps coverage times after the project's lock (T4,
-- below): 0015's start_exchange and 0046's voice_qualification_grant and voice_qualification_revoke are replaced.
BEGIN;

-- The pre-activation state: no bridge receipt kept yet (C2). Checked first, so a refusal changes nothing.
DO $$
DECLARE n bigint;
BEGIN
 SELECT count(*) INTO n FROM sophia.voice_qualification_evidence WHERE source='bridge';
 IF n>0 THEN
  RAISE EXCEPTION '0051 refused: % bridge receipt(s) numbered by the bridge (0046) are kept, with no service counter; apply it once they have expired (24 h, voice_evidence_expire) or after an explicit migration of them, never beside them', n
   USING ERRCODE='55000';
 END IF;
END $$;

CREATE TABLE sophia.voice_evidence_high_water (
 exchange_id uuid NOT NULL REFERENCES sophia.room_exchanges(id) ON DELETE CASCADE,
 grant_id uuid NOT NULL REFERENCES sophia.voice_qualification_grants(id) ON DELETE CASCADE,
 high_water integer NOT NULL CHECK(high_water BETWEEN 1 AND 99999),
 first_at timestamptz NOT NULL,
 PRIMARY KEY(exchange_id,grant_id)
);

CREATE TABLE sophia.voice_evidence_writes (
 exchange_id uuid NOT NULL, grant_id uuid NOT NULL, write_id uuid NOT NULL,
 source text NOT NULL DEFAULT 'bridge' CHECK(source='bridge'),
 seq integer NOT NULL CHECK(seq BETWEEN 1 AND 99999),
 receipt_sha256 text NOT NULL CHECK(receipt_sha256 ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(exchange_id,grant_id,write_id),
 UNIQUE(exchange_id,grant_id,seq),
 FOREIGN KEY(exchange_id,grant_id,source,seq)
  REFERENCES sophia.voice_qualification_evidence(exchange_id,grant_id,source,seq) ON DELETE CASCADE
);

ALTER TABLE sophia.voice_evidence_high_water ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.voice_evidence_writes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.voice_evidence_high_water, sophia.voice_evidence_writes FROM PUBLIC;

-- A bridge receipt for an exchange under a grant, numbered here: its number and the guard's answer.
CREATE FUNCTION sophia.media_record_evidence_write(p_exchange uuid, p_grant uuid, p_write uuid, p_kind text,
  p_receipt jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE p uuid; e sophia.room_exchanges; g sophia.voice_qualification_grants; h sophia.voice_evidence_high_water;
 w sophia.voice_evidence_writes; v_seq integer; ack jsonb;
 v_sha text:=encode(sha256(convert_to(p_receipt::text,'UTF8')),'hex');
BEGIN
 PERFORM sophia.require_service();
 IF p_write IS NULL THEN RAISE EXCEPTION 'A write names its identity' USING ERRCODE='22023'; END IF;
 SELECT project_id INTO p FROM sophia.room_exchanges WHERE id=p_exchange;
 IF p IS NULL THEN RAISE EXCEPTION 'Exchange not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 SELECT * INTO e FROM sophia.room_exchanges WHERE id=p_exchange FOR UPDATE;
 g:=sophia.voice_grant_of(e.project_id, e.opened_at);
 IF g.id IS NULL OR g.id<>p_grant THEN RAISE EXCEPTION 'The exchange is not under this grant' USING ERRCODE='42501'; END IF;
 SELECT * INTO h FROM sophia.voice_evidence_high_water WHERE exchange_id=e.id AND grant_id=g.id;
 IF h.exchange_id IS NOT NULL AND clock_timestamp()>=h.first_at+interval '24 hours'-interval '1 minute' THEN
  RAISE EXCEPTION 'Past the exchange''s evidence horizon: no write is numbered or answered again' USING ERRCODE='22023';
 END IF;
 SELECT * INTO w FROM sophia.voice_evidence_writes WHERE exchange_id=e.id AND grant_id=g.id AND write_id=p_write;
 IF w.write_id IS NOT NULL THEN
  IF w.receipt_sha256<>v_sha THEN
   RAISE EXCEPTION 'Idempotency key reused: this write identity holds another receipt' USING ERRCODE='23505'; END IF;
  -- The same write again: its own number, and 0046's answer to a repeat (the guard's state now).
  ack:=sophia.media_record_evidence(e.id, g.id, w.seq, p_kind, p_receipt);
  RETURN ack||jsonb_build_object('seq',w.seq,'replayed',true);
 END IF;
 v_seq:=coalesce(h.high_water,0)+1;
 IF v_seq>99999 THEN RAISE EXCEPTION 'The exchange''s receipt numbers are spent' USING ERRCODE='22023'; END IF;
 -- 0046 keeps it (or refuses it: then this transaction, and the number, roll back).
 ack:=sophia.media_record_evidence(e.id, g.id, v_seq, p_kind, p_receipt);
 INSERT INTO sophia.voice_evidence_high_water(exchange_id,grant_id,high_water,first_at) VALUES(e.id,g.id,v_seq,now())
 ON CONFLICT (exchange_id,grant_id) DO UPDATE SET high_water=excluded.high_water;
 INSERT INTO sophia.voice_evidence_writes(exchange_id,grant_id,write_id,seq,receipt_sha256)
 VALUES(e.id,g.id,p_write,v_seq,v_sha);
 RETURN ack||jsonb_build_object('seq',v_seq,'replayed',false);
END $$;

REVOKE ALL ON FUNCTION sophia.media_record_evidence_write(uuid,uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.media_record_evidence_write(uuid,uuid,uuid,text,jsonb) TO sophia_api;
-- No login numbers a receipt itself any more (C2): only the wrapper above, as the owner, calls 0046's function.
REVOKE EXECUTE ON FUNCTION sophia.media_record_evidence(uuid,uuid,integer,text,jsonb) FROM sophia_api, PUBLIC;

-- What a room token names of the grant (Codex P1 r4232975804; root's decision (b)). 0046 named the principal's active
-- grant whatever the room was doing, so a token minted while the room's open exchange was under no grant, or under an
-- earlier one, named a grant that exchange is not under: the Studio's page receipts then claimed a run the bridge was not
-- recording. Now the grant is named only while the room has no exchange that is not ended, or while that exchange is
-- under this very grant (voice_grant_of(project, opened_at), as the bridge's assignment names it). The same signature,
-- language, volatility, definer and search path as 0046's: CREATE OR REPLACE keeps its owner and its grants (EXECUTE
-- to sophia_api alone). One statement, so one snapshot: the token path's own read transaction. The inversion of an
-- exchange whose opened_at was its transaction's start (T4) is closed below, where the stamps are taken.
CREATE OR REPLACE FUNCTION sophia.voice_room_qualification(p_room uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('grantId',g.id,'runBindingSha256',g.run_binding_sha256)
 FROM sophia.room_state r JOIN sophia.voice_qualification_grants g ON g.project_id=r.project_id
 WHERE r.id=p_room AND g.revoked_at IS NULL AND g.expires_at>now() AND g.principal_actor_id=sophia.actor_id()
  AND sophia.is_member(r.project_id)
  AND NOT EXISTS(SELECT 1 FROM sophia.room_exchanges e WHERE e.room_id=r.id AND e.state<>'ended'
   AND (sophia.voice_grant_of(e.project_id,e.opened_at)).id IS DISTINCT FROM g.id) $$;

-- T4 (root's GO): an exchange's opened_at, a grant's created_at and expires_at, and a superseded or revoked grant's
-- revoked_at were their transaction's start (now()), so two writers that waited on each other could stamp in the reverse
-- of the order they ran: an exchange opened after a grant could fall outside it, a grant could cover an exchange opened
-- before it, and a revocation could end an exchange opened after it or spare one opened before. Each writer now takes
-- ONE clock reading, clock_timestamp(), immediately after it holds the project's lock, and stamps from it explicitly;
-- voice_qualification_revoke now takes that lock too (it took none). Every one of them holds the lock to its commit, so
-- the stamps follow the lock order. ASSUMPTION, not a claim of a monotonic clock: the database's wall clock does not
-- step backward between two holders of a project's lock; nothing here detects or corrects such a step. The bodies are
-- 0015's start_exchange and 0046's grant and revoke functions, changed only as marked; CREATE OR REPLACE keeps their
-- owners and grants. Non-voice readers of opened_at (results announced since the exchange opened) now use the moment
-- the opening was serialized, not the transaction's start.
-- start_exchange (0015_guest_joining.sql lines 61-95), the same body; v_now after the project lock; opened_at explicit.
CREATE OR REPLACE FUNCTION sophia.start_exchange(p_room uuid, p_expected_revision bigint, p_allow_vision boolean, p_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); p uuid; r sophia.room_state; e sophia.room_exchanges; pres sophia.room_ai_presence; receipt_value jsonb;
 v_now timestamptz;
BEGIN
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 SELECT project_id INTO p FROM sophia.room_state WHERE id=p_room;
 IF p IS NULL OR a IS NULL OR NOT sophia.is_member(p) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 v_now:=clock_timestamp();
 IF NOT sophia.is_member(p) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM sophia.room_exchanges WHERE opened_by=a AND open_key=p_key;
 IF FOUND THEN
  IF e.room_id<>p_room OR e.allow_vision<>p_allow_vision THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN e.receipt;
 END IF;
 SELECT * INTO r FROM sophia.room_state WHERE id=p_room FOR UPDATE;
 IF p_expected_revision IS NULL OR r.revision<>p_expected_revision THEN RAISE EXCEPTION 'Stale room revision' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.room_exchanges WHERE room_id=p_room AND state<>'ended') THEN
  RAISE EXCEPTION 'Sophia is already in this conversation' USING ERRCODE='40001'; END IF;
 SELECT * INTO pres FROM sophia.room_ai_presence WHERE room_id=p_room;
 IF FOUND AND pres.guests_present AND pres.reported_at>now()-interval '2 minutes' THEN
  RAISE EXCEPTION 'A guest is in the room: Sophia joins when the room is member-only' USING ERRCODE='40001'; END IF;
 IF sophia.guest_joining(p_room) THEN
  RAISE EXCEPTION 'A guest may still be joining: Sophia joins when the room is member-only' USING ERRCODE='40001'; END IF;
 IF r.input_actor_id IS NULL THEN
  UPDATE sophia.room_state SET input_actor_id=a, revision=revision+1 WHERE id=p_room RETURNING * INTO r;
  PERFORM sophia.emit_project_event(p,'room.input_floor_changed','room',p_room,r.revision,'room.input_floor');
 END IF;
 receipt_value:=jsonb_build_object('exchangeId',gen_random_uuid(),'roomId',p_room,'revision',r.revision,'inputActorId',r.input_actor_id);
 INSERT INTO sophia.room_exchanges(project_id,id,room_id,opened_by,open_key,receipt,allow_vision,opened_at)
 VALUES(p,(receipt_value->>'exchangeId')::uuid,p_room,a,p_key,receipt_value,p_allow_vision,v_now) RETURNING * INTO e;
 INSERT INTO sophia.exchange_inputs(project_id,exchange_id,input_epoch,actor_id) VALUES(p,e.id,1,r.input_actor_id);
 PERFORM sophia.emit_project_event(p,'room.exchange_opened','room_exchange',e.id,e.revision,'room.exchange_opened');
 RETURN receipt_value;
END $$;

-- voice_qualification_grant (0046 lines 155-178): v_now after the project lock; the superseded grant's revoked_at, the new
-- grant's created_at and expires_at all from it.
CREATE OR REPLACE FUNCTION sophia.voice_qualification_grant(p_project uuid, p_principal uuid, p_run_binding_sha256 text,
  p_approval_ref text, p_max_exchange_seconds integer, p_max_provider_connections integer, p_max_turns integer,
  p_max_output_tokens_per_turn integer, p_max_usage_tokens bigint, p_ttl_seconds integer)
RETURNS sophia.voice_qualification_grants
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.voice_qualification_grants; v_now timestamptz;
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'A grant is the operator''s, never a member''s' USING ERRCODE='42501'; END IF;
 IF p_ttl_seconds IS NULL OR p_ttl_seconds NOT BETWEEN 60 AND 7200 THEN
  RAISE EXCEPTION 'A grant lasts 1 minute to 2 hours' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 v_now:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM sophia.project_members WHERE project_id=p_project AND actor_id=p_principal AND active
   AND role IN ('admin','editor')) THEN
  RAISE EXCEPTION 'The principal must be an active editor or admin of the project' USING ERRCODE='22023'; END IF;
 UPDATE sophia.voice_qualification_grants SET revoked_at=v_now, revoke_reason='superseded'
  WHERE project_id=p_project AND revoked_at IS NULL;
 INSERT INTO sophia.voice_qualification_grants(project_id,principal_actor_id,run_binding_sha256,approval_ref,
  max_exchange_seconds,max_provider_connections,max_turns,max_output_tokens_per_turn,max_usage_tokens,created_at,expires_at)
 VALUES(p_project,p_principal,p_run_binding_sha256,p_approval_ref,p_max_exchange_seconds,p_max_provider_connections,
  p_max_turns,p_max_output_tokens_per_turn,p_max_usage_tokens,v_now,v_now+make_interval(secs=>p_ttl_seconds))
 RETURNING * INTO g;
 RETURN g;
END $$;

-- voice_qualification_revoke (0046 lines 180-190): now takes the project's lock first (it took none), and stamps after it.
CREATE OR REPLACE FUNCTION sophia.voice_qualification_revoke(p_project uuid, p_grant uuid, p_reason text)
RETURNS sophia.voice_qualification_grants LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.voice_qualification_grants; v_now timestamptz;
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'A grant is the operator''s, never a member''s' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 v_now:=clock_timestamp();
 UPDATE sophia.voice_qualification_grants SET revoked_at=v_now, revoke_reason=p_reason
  WHERE project_id=p_project AND id=p_grant AND revoked_at IS NULL RETURNING * INTO g;
 IF g.id IS NULL THEN RAISE EXCEPTION 'No open grant' USING ERRCODE='P0002'; END IF;
 RETURN g;
END $$;

COMMIT;
