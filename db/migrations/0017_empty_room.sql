-- S1-05A, CX-0062: Sophia leaves a room nobody is in.
--
-- When everyone leaves without pressing End, the holder's departure pauses the exchange and then releases the floor,
-- which reopens it with nobody holding the floor. Nothing ended it after that: in production an exchange stayed open
-- in an empty room for hours, with the bridge keeping its provider session and its seat in the room.
--
-- The bridge reports the room's participants every few seconds while it is in the room and its link is up. Once it
-- has reported nobody for five minutes, the exchange it reported for ends as End would: the service ends it
-- (ended_by stays null), and the work carries on. Anyone present, a guest included, starts the count again.
-- 0001–0016 are not edited; media_report_presence (0013) is replaced with the same signature.

BEGIN;

ALTER TABLE sophia.room_ai_presence ADD COLUMN empty_since timestamptz;

CREATE OR REPLACE FUNCTION sophia.media_report_presence(p_report jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE room uuid:=(p_report->>'roomId')::uuid; exchange uuid:=(p_report->>'exchangeId')::uuid; p uuid;
 prior sophia.room_ai_presence; guests boolean; empty boolean; since timestamptz; paused sophia.room_exchanges;
 ended sophia.room_exchanges; rev bigint;
BEGIN
 PERFORM sophia.require_service();
 SELECT project_id, revision INTO p, rev FROM sophia.room_state WHERE id=room;
 IF p IS NULL THEN RAISE EXCEPTION 'Room not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 guests:=EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_report->'participants','[]')) x WHERE x->>'standing' IN ('guest','unknown'));
 empty:=jsonb_array_length(coalesce(p_report->'participants','[]'))=0;
 SELECT * INTO prior FROM sophia.room_ai_presence WHERE room_id=room FOR UPDATE;
 -- The count runs for one exchange: a report for another one starts it again.
 since:=CASE WHEN NOT empty THEN NULL
  WHEN prior.room_id IS NOT NULL AND prior.exchange_id IS NOT DISTINCT FROM exchange THEN coalesce(prior.empty_since, now())
  ELSE now() END;
 INSERT INTO sophia.room_ai_presence(project_id,room_id,exchange_id,bridge_instance,voice,reason,guests_present,participants,reported_at,empty_since)
 VALUES(p,room,exchange,p_report->>'bridgeInstanceId',p_report->>'voice',left(p_report->>'reason',500),guests,
  coalesce(p_report->'participants','[]'),now(),since)
 ON CONFLICT (room_id) DO UPDATE SET exchange_id=EXCLUDED.exchange_id, bridge_instance=EXCLUDED.bridge_instance, voice=EXCLUDED.voice,
  reason=EXCLUDED.reason, guests_present=EXCLUDED.guests_present, participants=EXCLUDED.participants, reported_at=now(),
  empty_since=EXCLUDED.empty_since;
 INSERT INTO sophia.room_bridge_reports(project_id,room_id,bridge_instance) VALUES(p,room,left(p_report->>'bridgeInstanceId',64))
 ON CONFLICT (room_id,bridge_instance) DO UPDATE SET reported_at=now();
 IF guests THEN
  UPDATE sophia.room_exchanges SET state='paused', pause_reason='guest', revision=revision+1
   WHERE room_id=room AND state<>'ended' AND (state='open' OR pause_reason<>'guest') RETURNING * INTO paused;
  IF paused.id IS NOT NULL THEN
   PERFORM sophia.emit_service_event(p,'room.exchange_changed','room_exchange',paused.id,paused.revision,'room.exchange_guest');
  END IF;
 END IF;
 IF empty AND since<=now()-interval '5 minutes' THEN
  UPDATE sophia.room_exchanges SET state='ended', pause_reason=NULL, ended_at=now(), revision=revision+1
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
