-- The bridge's presence reports, ordered per process, and each process's own guest assertion (item 7 C of the PR #190
-- review; root's option (b), refined). Its number is PROVISIONAL, pending owner/root confirmation on #198 (the census of
-- 0048-0050 and 0051). It needs only 0013 and 0017 (room_ai_presence, room_bridge_reports, media_report_presence), so any
-- later number works; 0001-0051 are not edited, and media_report_presence (0017) is replaced with the same signature.
--
-- Why: the bridge may now cut a presence report's request at its bound (POST_ATTEMPT_MS, 3 s) and send a newer one on the
-- next tick, but a cut request still reaches the API and commits later. 0017's report was last-writer-wins and stamped
-- now(), so an older report applied after a newer one undid it and even looked fresh: a guest's flag cleared, the voice
-- and the participants flapped, an empty-room count restarted or ran on a stale view. Across processes (a deploy's
-- overlap) one process's "no guest" cleared the guest another process still saw.
-- Now:
-- * Order. A report may carry reportSeq (1 to 9007199254740991; the presence-order amendment, provisional number), from one
--   counter per bridge process, shared by all its sessions. Under the project's lock, a report whose reportSeq is not
--   above its process's last_seq for the room is STALE and has NO PRESENCE EFFECT: no presence, no liveness
--   (room_bridge_reports' reported_at, which quiesce_settled reads), no guest assertion, no pause, no empty-room end, no
--   empty_since, no presence event, no last_seq. It is answered like any other (the API's 204). The independent
--   voice-qualification guard (0046), which the API runs in the same request's transaction when voice qualification is on,
--   may still run on that request: it acts on its grant's deadline and limits, may end an exchange for them, and emits its
--   own guard event. Those are the guard's effects, not the report's.
-- * Legacy, bounded. A report without reportSeq (a bridge built before this) is applied as 0017 applied it, within its own
--   process, only while that process has never sent a sequenced report for the room; once it has, a report of its without
--   one is stale. A bridge before this never has two presence reports in flight and never abandons one before undici's
--   300 s, so its reports reach the API in order.
-- * One clock reading. An accepted report takes clock_timestamp() ONCE, after the project's lock, and every stamp and
--   every comparison of this report is that reading: reported_at, its guest assertion's time, the 30 s guest horizon,
--   empty_since, the 5-minute empty end and ended_at. Never now(), its transaction's start. Assumed, not claimed: the
--   database's wall clock does not step backward between two holders of a project's lock (no monotonic clock is claimed;
--   nothing detects or corrects such a step).
-- * Each process's own guest assertion. room_bridge_reports keeps, per room and process, the guests_present that process's
--   last accepted report asserted (a 'guest' or 'unknown' participant) and guests_at, that report's reading. Only the
--   process's own accepted report writes it: another process never overwrites or refreshes it and never extends its 30 s
--   horizon; its own later report (higher reportSeq, or a legacy one) may clear it; and it counts only while it is under
--   30 s old at an accepted report's reading (the window control_exchange's resume uses).
-- * The room's guests are the aggregate: room_guests_asserted(room, reading), true while any process's own assertion is
--   fresh. room_ai_presence.guests_present, the guest pause and the presence event use it; and a room is empty for the
--   5-minute count only if the report lists nobody AND no process's guest assertion is fresh, so a process that sees
--   nobody cannot end the exchange while another one still sees a guest.
--   The aggregate is recomputed ONLY when an accepted presence report is applied, at its reading; nothing expires it on a
--   timer. room_ai_presence.guests_present is that cached room flag, and its reported_at its time. The unchanged start and
--   resume checks read the cached flag with that freshness, never room_guests_asserted: 0015's control_exchange resume
--   refuses while it is set or when reported_at is over 30 s old; start_exchange (0015's, as 0051 replaces it for T4)
--   refuses while it is set and reported_at is under 2 minutes old. So an assertion past 30 s stops holding the room at
--   the next accepted report from any process; until one comes, the cached flag stays, judged by those checks by its age.
-- * The rest of room_ai_presence (exchange, voice, reason, participants, the reporting process) is the last accepted
--   report's, from any process, as 0017 had it.
-- Rollout: this migration first (the API and bridges before it keep working: their reports carry no reportSeq), then the
-- API (its contract accepts reportSeq; its readiness requires this migration's columns and function), then the bridge
-- (it sends reportSeq and bounds presence at POST_ATTEMPT_MS). An API before this one refuses a report with reportSeq
-- (422), so the bridge is never deployed before the API.
-- At the migration: the tables are locked first, so a report in flight commits before the backfill reads it and none
-- starts until this commits. Each room's last reporting process gets its assertion as that report made it, at that
-- report's own time (never refreshed); other processes' assertions are unknown (null) and count as none until their next
-- report. A call already running 0017's body when this commits keeps no assertion; its process's next report does.
BEGIN;

LOCK TABLE sophia.room_ai_presence, sophia.room_bridge_reports IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE sophia.room_bridge_reports
 ADD COLUMN last_seq bigint CHECK(last_seq BETWEEN 1 AND 9007199254740991),
 ADD COLUMN guests_present boolean,
 ADD COLUMN guests_at timestamptz,
 ADD CONSTRAINT room_bridge_reports_guest_assertion CHECK((guests_present IS NULL)=(guests_at IS NULL));

UPDATE sophia.room_bridge_reports r SET guests_present=a.guests_present, guests_at=a.reported_at
 FROM sophia.room_ai_presence a WHERE a.room_id=r.room_id AND left(a.bridge_instance,64)=r.bridge_instance;

-- Whether any bridge process's own guest assertion for the room is fresh at p_at (made within the last 30 s).
CREATE FUNCTION sophia.room_guests_asserted(p_room uuid, p_at timestamptz) RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.room_bridge_reports
  WHERE room_id=p_room AND guests_present AND guests_at>p_at-interval '30 seconds') $$;
REVOKE ALL ON FUNCTION sophia.room_guests_asserted(uuid,timestamptz) FROM PUBLIC;

-- media_report_presence (0017_empty_room.sql lines 16-58), replaced: the same signature, definer and search path
-- (CREATE OR REPLACE keeps its owner and grants); 0017's body, ordered per process, with one clock reading and the
-- guest aggregate, as above.
CREATE OR REPLACE FUNCTION sophia.media_report_presence(p_report jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE room uuid:=(p_report->>'roomId')::uuid; exchange uuid:=(p_report->>'exchangeId')::uuid; p uuid;
 inst text:=left(p_report->>'bridgeInstanceId',64); v_seq bigint; mine sophia.room_bridge_reports; v_now timestamptz;
 prior sophia.room_ai_presence; own boolean; guests boolean; empty boolean; since timestamptz; paused sophia.room_exchanges;
 ended sophia.room_exchanges; rev bigint;
BEGIN
 PERFORM sophia.require_service();
 IF p_report ? 'reportSeq' THEN
  IF jsonb_typeof(p_report->'reportSeq')<>'number' OR (p_report->>'reportSeq')!~'^[1-9][0-9]{0,15}$'
    OR (p_report->>'reportSeq')::numeric>9007199254740991 THEN
   RAISE EXCEPTION 'A report''s sequence is an integer from 1 to 9007199254740991' USING ERRCODE='22023'; END IF;
  v_seq:=(p_report->>'reportSeq')::bigint;
 END IF;
 SELECT project_id, revision INTO p, rev FROM sophia.room_state WHERE id=room;
 IF p IS NULL THEN RAISE EXCEPTION 'Room not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 -- Stale: not above its process's last sequence for the room (or no sequence once it has one). No presence effect: it
 -- returns before any write (the API's guard, voice qualification on, runs after it in the request, on its own).
 SELECT * INTO mine FROM sophia.room_bridge_reports WHERE room_id=room AND bridge_instance=inst FOR UPDATE;
 IF mine.last_seq IS NOT NULL AND (v_seq IS NULL OR v_seq<=mine.last_seq) THEN RETURN; END IF;
 v_now:=clock_timestamp();
 own:=EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_report->'participants','[]')) x WHERE x->>'standing' IN ('guest','unknown'));
 INSERT INTO sophia.room_bridge_reports(project_id,room_id,bridge_instance,reported_at,last_seq,guests_present,guests_at)
 VALUES(p,room,inst,v_now,v_seq,own,v_now)
 ON CONFLICT (room_id,bridge_instance) DO UPDATE SET reported_at=EXCLUDED.reported_at, last_seq=EXCLUDED.last_seq,
  guests_present=EXCLUDED.guests_present, guests_at=EXCLUDED.guests_at;
 guests:=sophia.room_guests_asserted(room, v_now);
 empty:=jsonb_array_length(coalesce(p_report->'participants','[]'))=0 AND NOT guests;
 SELECT * INTO prior FROM sophia.room_ai_presence WHERE room_id=room FOR UPDATE;
 -- The count runs for one exchange: a report for another one starts it again.
 since:=CASE WHEN NOT empty THEN NULL
  WHEN prior.room_id IS NOT NULL AND prior.exchange_id IS NOT DISTINCT FROM exchange THEN coalesce(prior.empty_since, v_now)
  ELSE v_now END;
 INSERT INTO sophia.room_ai_presence(project_id,room_id,exchange_id,bridge_instance,voice,reason,guests_present,participants,reported_at,empty_since)
 VALUES(p,room,exchange,p_report->>'bridgeInstanceId',p_report->>'voice',left(p_report->>'reason',500),guests,
  coalesce(p_report->'participants','[]'),v_now,since)
 ON CONFLICT (room_id) DO UPDATE SET exchange_id=EXCLUDED.exchange_id, bridge_instance=EXCLUDED.bridge_instance, voice=EXCLUDED.voice,
  reason=EXCLUDED.reason, guests_present=EXCLUDED.guests_present, participants=EXCLUDED.participants,
  reported_at=EXCLUDED.reported_at, empty_since=EXCLUDED.empty_since;
 IF guests THEN
  UPDATE sophia.room_exchanges SET state='paused', pause_reason='guest', revision=revision+1
   WHERE room_id=room AND state<>'ended' AND (state='open' OR pause_reason<>'guest') RETURNING * INTO paused;
  IF paused.id IS NOT NULL THEN
   PERFORM sophia.emit_service_event(p,'room.exchange_changed','room_exchange',paused.id,paused.revision,'room.exchange_guest');
  END IF;
 END IF;
 IF empty AND since<=v_now-interval '5 minutes' THEN
  UPDATE sophia.room_exchanges SET state='ended', pause_reason=NULL, ended_at=v_now, revision=revision+1
   WHERE id=exchange AND room_id=room AND state<>'ended' RETURNING * INTO ended;
  IF ended.id IS NOT NULL THEN
   PERFORM sophia.emit_service_event(p,'room.exchange_changed','room_exchange',ended.id,ended.revision,'room.exchange_empty');
  END IF;
 END IF;
 IF prior.room_id IS NULL OR prior.voice<>(p_report->>'voice') OR prior.guests_present<>guests
  OR prior.exchange_id IS DISTINCT FROM exchange THEN
  PERFORM sophia.emit_service_event(p,'room.sophia_presence','room',room,rev,'room.sophia_'||(p_report->>'voice'));
 END IF;
END $$;

COMMIT;
