-- S1-05A (Codex review of fa97a1a): a guest on their way in counts as a guest in the room.
-- * A guest's room token is minted after the quiesce check, and they connect to LiveKit seconds later. Until LiveKit
--   lists them, neither the API's presence check nor the bridge's report can see them, so an exchange opened, or a
--   pause resumed, in that gap was never quiesced for them: only the bridge's own pause on their arrival guarded it.
-- * A guest's token is stamped twice, each time under the project lock that opening and resuming also take:
--   - when they ask for it, in the transaction that quiesces any live exchange (request_guest_quiesce), which covers
--     the seconds the API may wait before minting;
--   - just before the API mints it, when their admission is checked again (guest_token_minting), so the fence lasts
--     as long as the token does, however long that wait was (Codex, CX-0047).
-- * For GUEST_FENCE (630 s) after the latest stamp, opening and resuming refuse, as they do for a guest who is present:
--   until the token expires, its holder may connect at any moment. That is the token's 600 s from its mint
--   (ROOM_TOKEN_TTL_SECONDS in the API), plus 30 s for the step from the stamp to the mint and for clock differences
--   between the database, the API and LiveKit.
-- * The contract is unchanged: the refusal is the same invalid_state a present guest gets.
-- 0001–0014 are not edited; request_guest_quiesce, start_exchange and control_exchange (0013) are replaced.
BEGIN;

-- When this guest last asked for a room token, or was about to be given one.
ALTER TABLE sophia.room_lobby ADD COLUMN guest_token_at timestamptz;

-- A guest of this room may still hold a live token: one was stamped within GUEST_FENCE (630 s).
CREATE FUNCTION sophia.guest_joining(p_room uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.room_lobby WHERE room_id=p_room AND guest_token_at>now()-interval '630 seconds') $$;
REVOKE ALL ON FUNCTION sophia.guest_joining(uuid) FROM PUBLIC;

-- The API is about to mint a guest's room token: their admission is checked again under the project lock (a decline
-- is either seen here or comes after the stamp, where the removal watch takes over), and the fence is stamped now.
CREATE FUNCTION sophia.guest_token_minting(p_entry uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.room_lobby;
BEGIN
 SELECT * INTO e FROM sophia.room_lobby WHERE id=p_entry AND actor_id=sophia.actor_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'Lobby entry not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=e.project_id FOR UPDATE;
 UPDATE sophia.room_lobby SET guest_token_at=now() WHERE id=e.id RETURNING * INTO e;
 IF e.status<>'admitted' THEN RAISE EXCEPTION 'Not admitted to the room' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('roomId',e.room_id,'displayName',e.display_name);
END $$;
REVOKE ALL ON FUNCTION sophia.guest_token_minting(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.guest_token_minting(uuid) TO sophia_api;

-- request_guest_quiesce (0013), replaced: the same, and the request is stamped.
CREATE OR REPLACE FUNCTION sophia.request_guest_quiesce(p_entry uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE entry sophia.room_lobby; e sophia.room_exchanges; req uuid;
BEGIN
 SELECT * INTO entry FROM sophia.room_lobby WHERE id=p_entry AND actor_id=sophia.actor_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'Lobby entry not found' USING ERRCODE='22023'; END IF;
 IF entry.status<>'admitted' THEN RAISE EXCEPTION 'Not admitted to the room' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=entry.project_id FOR UPDATE;
 UPDATE sophia.room_lobby SET guest_token_at=now() WHERE id=entry.id;
 SELECT * INTO e FROM sophia.room_exchanges WHERE room_id=entry.room_id AND state<>'ended' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('requestId',NULL); END IF;
 IF e.state='open' OR e.pause_reason<>'guest' THEN
  UPDATE sophia.room_exchanges SET state='paused', pause_reason='guest', revision=revision+1 WHERE id=e.id RETURNING * INTO e;
  PERFORM sophia.emit_project_event(entry.project_id,'room.exchange_changed','room_exchange',e.id,e.revision,'room.exchange_guest');
 END IF;
 INSERT INTO sophia.room_quiesce_requests(project_id,room_id,exchange_id,lobby_entry_id) VALUES(entry.project_id,entry.room_id,e.id,entry.id)
  RETURNING id INTO req;
 RETURN jsonb_build_object('requestId',req,'roomId',entry.room_id);
END $$;

-- start_exchange (0013), replaced: the same, and it refuses while a guest is joining.
CREATE OR REPLACE FUNCTION sophia.start_exchange(p_room uuid, p_expected_revision bigint, p_allow_vision boolean, p_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); p uuid; r sophia.room_state; e sophia.room_exchanges; pres sophia.room_ai_presence; receipt_value jsonb;
BEGIN
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 SELECT project_id INTO p FROM sophia.room_state WHERE id=p_room;
 IF p IS NULL OR a IS NULL OR NOT sophia.is_member(p) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
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
 INSERT INTO sophia.room_exchanges(project_id,id,room_id,opened_by,open_key,receipt,allow_vision)
 VALUES(p,(receipt_value->>'exchangeId')::uuid,p_room,a,p_key,receipt_value,p_allow_vision) RETURNING * INTO e;
 INSERT INTO sophia.exchange_inputs(project_id,exchange_id,input_epoch,actor_id) VALUES(p,e.id,1,r.input_actor_id);
 PERFORM sophia.emit_project_event(p,'room.exchange_opened','room_exchange',e.id,e.revision,'room.exchange_opened');
 RETURN receipt_value;
END $$;

-- control_exchange (0013), replaced: the same, and resume refuses while a guest is joining.
CREATE OR REPLACE FUNCTION sophia.control_exchange(p_exchange uuid, p_action text, p_source text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); p uuid; e sophia.room_exchanges; pres sophia.room_ai_presence; holder uuid;
BEGIN
 SELECT project_id INTO p FROM sophia.room_exchanges WHERE id=p_exchange;
 IF p IS NULL OR a IS NULL OR NOT sophia.is_member(p) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('end','stop_speaking','look','stop_looking','resume') THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 SELECT * INTO e FROM sophia.room_exchanges WHERE id=p_exchange FOR UPDATE;
 IF e.state='ended' THEN
  IF p_action='end' THEN RETURN sophia.exchange_json(e); END IF;
  RAISE EXCEPTION 'The exchange has ended' USING ERRCODE='40001';
 END IF;
 IF p_action='end' THEN
  UPDATE sophia.room_exchanges SET state='ended', pause_reason=NULL, ended_at=now(), ended_by=a, revision=revision+1 WHERE id=e.id RETURNING * INTO e;
 ELSIF p_action='stop_speaking' THEN
  UPDATE sophia.room_exchanges SET playback_epoch=playback_epoch+1, revision=revision+1 WHERE id=e.id RETURNING * INTO e;
 ELSIF p_action='look' THEN
  IF NOT e.allow_vision THEN RAISE EXCEPTION 'Vision is off for this exchange' USING ERRCODE='40001'; END IF;
  IF p_source IS NULL OR p_source NOT IN ('screen','camera') THEN RAISE EXCEPTION 'Invalid source' USING ERRCODE='22023'; END IF;
  IF e.state<>'open' THEN RAISE EXCEPTION 'The exchange is paused' USING ERRCODE='40001'; END IF;
  UPDATE sophia.room_exchanges SET look_identity=a::text, look_source=p_source, observation_epoch=observation_epoch+1, revision=revision+1
   WHERE id=e.id RETURNING * INTO e;
 ELSIF p_action='stop_looking' THEN
  UPDATE sophia.room_exchanges SET look_identity=NULL, look_source=NULL, observation_epoch=observation_epoch+1, revision=revision+1
   WHERE id=e.id RETURNING * INTO e;
 ELSE -- resume
  IF e.state<>'paused' THEN RETURN sophia.exchange_json(e); END IF;
  IF sophia.guest_joining(e.room_id) THEN
   RAISE EXCEPTION 'A guest may still be joining: Sophia resumes when the room is member-only again' USING ERRCODE='40001'; END IF;
  IF e.pause_reason='guest' THEN
   SELECT * INTO pres FROM sophia.room_ai_presence WHERE room_id=e.room_id;
   IF NOT FOUND OR pres.guests_present OR pres.reported_at<now()-interval '30 seconds' THEN
    RAISE EXCEPTION 'Sophia resumes only when the room is member-only again' USING ERRCODE='40001'; END IF;
  END IF;
  SELECT input_actor_id INTO holder FROM sophia.room_state WHERE id=e.room_id;
  UPDATE sophia.room_exchanges SET state='open', pause_reason=NULL WHERE id=e.id RETURNING * INTO e;
  e:=sophia.next_input_epoch(e,holder);
 END IF;
 PERFORM sophia.emit_project_event(p,'room.exchange_changed','room_exchange',e.id,e.revision,'room.exchange_'||p_action);
 RETURN sophia.exchange_json(e);
END $$;

COMMIT;
