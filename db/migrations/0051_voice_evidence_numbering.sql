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
BEGIN;

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

COMMIT;
