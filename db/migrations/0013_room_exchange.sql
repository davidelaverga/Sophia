-- S1-05A (contract amendment A06): the room's exchange with Sophia, and what the media bridge may do.
-- * One exchange per room, opened by an explicit member action. Joining the room never opens it.
-- * Epochs only move forward: input (who may address Sophia; each epoch binds exactly one speaker, or none),
--   playback (Stop Speaking) and observation (Show Sophia this / Stop Looking). The bridge fences late audio,
--   frames and tool results of older epochs; a tool call acts for the speaker its input epoch binds.
-- * Viewers may hold the floor and open a read-only exchange (amendment A01 kept them listening). Work still needs
--   editor or admin at the tool call, exactly as over HTTP. transfer_input_floor is replaced for this.
-- * A guest in the room pauses the exchange. A guest's room token waits for the bridge to confirm it closed
--   Google input and cleared Sophia's output (a quiesce request); only explicit member action resumes her.
-- * The bridge reports presence (provider state and the trusted participant list). It is a service principal:
--   its functions refuse a transaction that carries a member identity.
-- 0001–0012 are not edited.
BEGIN;

CREATE TABLE sophia.room_exchanges (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES sophia.room_state(id),
 opened_by uuid NOT NULL, open_key text NOT NULL CHECK(length(open_key) BETWEEN 1 AND 160), receipt jsonb NOT NULL,
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','paused','ended')),
 pause_reason text CHECK(pause_reason IS NULL OR pause_reason IN ('guest','holder_left')),
 allow_vision boolean NOT NULL,
 input_epoch bigint NOT NULL DEFAULT 1 CHECK(input_epoch>0),
 playback_epoch bigint NOT NULL DEFAULT 1 CHECK(playback_epoch>0),
 observation_epoch bigint NOT NULL DEFAULT 1 CHECK(observation_epoch>0),
 look_identity text, look_source text CHECK(look_source IS NULL OR look_source IN ('screen','camera')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 opened_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz, ended_by uuid,
 PRIMARY KEY(project_id,id), UNIQUE(opened_by,open_key),
 CHECK((state='paused')=(pause_reason IS NOT NULL)), CHECK((look_identity IS NULL)=(look_source IS NULL))
);
CREATE UNIQUE INDEX one_live_exchange ON sophia.room_exchanges(room_id) WHERE state<>'ended';

-- Who each input epoch admits (NULL: nobody holds the floor). Tool calls are attributed by this row.
CREATE TABLE sophia.exchange_inputs (
 project_id uuid NOT NULL, exchange_id uuid NOT NULL REFERENCES sophia.room_exchanges(id),
 input_epoch bigint NOT NULL CHECK(input_epoch>0), actor_id uuid, started_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(exchange_id,input_epoch)
);

-- The media bridge's last report for a room: provider state and the trusted participant list.
CREATE TABLE sophia.room_ai_presence (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), room_id uuid PRIMARY KEY REFERENCES sophia.room_state(id),
 exchange_id uuid, bridge_instance text NOT NULL,
 voice text NOT NULL CHECK(voice IN ('connecting','ready','recovering','unavailable')), reason text,
 guests_present boolean NOT NULL DEFAULT false, participants jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(participants)='array'),
 reported_at timestamptz NOT NULL DEFAULT now()
);

-- A guest's admission waits for the bridge to confirm Sophia stopped listening and speaking.
CREATE TABLE sophia.room_quiesce_requests (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES sophia.room_state(id), exchange_id uuid NOT NULL REFERENCES sophia.room_exchanges(id),
 lobby_entry_id uuid REFERENCES sophia.room_lobby(id), requested_at timestamptz NOT NULL DEFAULT now(),
 acked_at timestamptz, acked_by text
);

-- Background results the bridge announced in an exchange: each at most once, across reconnects and restarts.
CREATE TABLE sophia.exchange_announcements (
 project_id uuid NOT NULL, exchange_id uuid NOT NULL REFERENCES sophia.room_exchanges(id), job_id uuid NOT NULL,
 result_revision integer NOT NULL CHECK(result_revision>0), announced_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(exchange_id,job_id,result_revision), FOREIGN KEY(project_id,job_id) REFERENCES sophia.jobs(project_id,id)
);
ALTER TABLE sophia.exchange_announcements ENABLE ROW LEVEL SECURITY;

ALTER TABLE sophia.room_exchanges ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.room_exchanges FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.exchange_inputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.exchange_inputs FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.room_ai_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.room_ai_presence FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.room_quiesce_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON sophia.room_exchanges, sophia.exchange_inputs, sophia.room_ai_presence TO sophia_api;

-- Wake the bridge's assignment poll when an exchange or a quiesce request changes (payload: the room id).
CREATE FUNCTION sophia.notify_media() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN PERFORM pg_notify('sophia_media', NEW.room_id::text); RETURN NULL; END $$;
REVOKE ALL ON FUNCTION sophia.notify_media() FROM PUBLIC;
CREATE TRIGGER room_exchanges_notify AFTER INSERT OR UPDATE ON sophia.room_exchanges FOR EACH ROW EXECUTE FUNCTION sophia.notify_media();
CREATE TRIGGER room_quiesce_notify AFTER INSERT ON sophia.room_quiesce_requests FOR EACH ROW EXECUTE FUNCTION sophia.notify_media();

CREATE FUNCTION sophia.exchange_json(e sophia.room_exchanges) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('exchangeId',e.id,'roomId',e.room_id,'state',e.state,'pauseReason',e.pause_reason,'inputEpoch',e.input_epoch,
  'playbackEpoch',e.playback_epoch,'observationEpoch',e.observation_epoch,'revision',e.revision) $$;
REVOKE ALL ON FUNCTION sophia.exchange_json(sophia.room_exchanges) FROM PUBLIC;

-- A new input epoch for the exchange, bound to its speaker (or nobody).
CREATE FUNCTION sophia.next_input_epoch(e sophia.room_exchanges, p_actor uuid) RETURNS sophia.room_exchanges LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE n sophia.room_exchanges;
BEGIN
 UPDATE sophia.room_exchanges SET input_epoch=input_epoch+1, revision=revision+1 WHERE id=e.id RETURNING * INTO n;
 INSERT INTO sophia.exchange_inputs(project_id,exchange_id,input_epoch,actor_id) VALUES(n.project_id,n.id,n.input_epoch,p_actor);
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION sophia.next_input_epoch(sophia.room_exchanges,uuid) FROM PUBLIC;

-- The bridge's functions are for the service principal only (amendment A06).
CREATE FUNCTION sophia.require_service() RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'A media-bridge call cannot carry a member identity' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.require_service() FROM PUBLIC;

-- startExchange: any member. The floor goes to the caller when free; a guest in the room refuses it.
CREATE FUNCTION sophia.start_exchange(p_room uuid, p_expected_revision bigint, p_allow_vision boolean, p_key text) RETURNS jsonb
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

-- End, Stop Speaking, Show Sophia this, Stop Looking, Resume: any member, each moving its own epoch.
CREATE FUNCTION sophia.control_exchange(p_exchange uuid, p_action text, p_source text DEFAULT NULL) RETURNS jsonb
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

-- transfer_input_floor (0009), replaced: any active member may pass, take or receive the floor (viewers too:
-- talking with Sophia is not a work grant), and with an exchange live the new holder gets a new input epoch.
-- A pause because the holder left is lifted by an explicit transfer; a guest pause is not.
CREATE OR REPLACE FUNCTION sophia.transfer_input_floor(p_room uuid, p_next_actor uuid, p_expected_revision bigint, p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); p uuid; r sophia.room_state; semantic jsonb; prior sophia.floor_changes;
 change uuid:=gen_random_uuid(); cursor_value bigint; receipt_value jsonb; e sophia.room_exchanges;
BEGIN
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 SELECT project_id INTO p FROM sophia.room_state WHERE id=p_room;
 IF p IS NULL OR NOT sophia.is_member(p) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 IF NOT sophia.is_member(p) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM sophia.room_state WHERE id=p_room FOR UPDATE;
 semantic:=jsonb_build_object('roomId',p_room,'nextActorId',p_next_actor,'expectedRoomRevision',p_expected_revision);
 SELECT * INTO prior FROM sophia.floor_changes WHERE project_id=p AND actor_id=a AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 IF p_expected_revision IS NULL OR r.revision<>p_expected_revision THEN RAISE EXCEPTION 'Stale room revision' USING ERRCODE='40001'; END IF;
 IF r.input_actor_id IS NOT NULL AND r.input_actor_id<>a AND NOT EXISTS(
  SELECT 1 FROM sophia.project_members WHERE project_id=p AND actor_id=a AND active AND role='admin') THEN
  RAISE EXCEPTION 'The input floor is held by another participant' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.project_members WHERE project_id=p AND actor_id=p_next_actor AND active) THEN
  RAISE EXCEPTION 'The next input actor is not a member of this project' USING ERRCODE='22023'; END IF;
 UPDATE sophia.room_state SET input_actor_id=p_next_actor, revision=revision+1 WHERE id=p_room RETURNING * INTO r;
 UPDATE sophia.projects SET event_sequence=event_sequence+1 WHERE id=p RETURNING event_sequence INTO cursor_value;
 INSERT INTO sophia.project_events(project_id,sequence,type,entity_type,entity_id,entity_revision,summary_code,actor_id)
 VALUES(p,cursor_value,'room.input_floor_changed','room',p_room,r.revision,'room.input_floor',a);
 SELECT * INTO e FROM sophia.room_exchanges WHERE room_id=p_room AND state<>'ended' FOR UPDATE;
 IF FOUND THEN
  IF e.state='paused' AND e.pause_reason='holder_left' THEN
   UPDATE sophia.room_exchanges SET state='open', pause_reason=NULL WHERE id=e.id RETURNING * INTO e;
  END IF;
  e:=sophia.next_input_epoch(e,p_next_actor);
 END IF;
 receipt_value:=jsonb_build_object('exchangeId',CASE WHEN e.id IS NULL THEN change ELSE e.id END,'roomId',p_room,'revision',r.revision,'inputActorId',p_next_actor);
 INSERT INTO sophia.floor_changes(project_id,id,actor_id,idempotency_key,semantic_request,receipt) VALUES(p,change,a,p_key,semantic,receipt_value);
 RETURN receipt_value;
END $$;

-- The bridge: every exchange it must serve, with its current holder and any unacknowledged quiesce request.
CREATE FUNCTION sophia.media_assignments() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM sophia.require_service();
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('exchangeId',e.id,'projectId',e.project_id,'roomId',e.room_id,'state',e.state,
   'pauseReason',e.pause_reason,'inputEpoch',e.input_epoch,'inputActorId',i.actor_id,'playbackEpoch',e.playback_epoch,
   'observationEpoch',e.observation_epoch,'allowVision',e.allow_vision,
   'looking',CASE WHEN e.look_identity IS NULL THEN NULL ELSE jsonb_build_object('participantIdentity',e.look_identity,'source',e.look_source) END,
   'roomRevision',r.revision,'quiesceRequestId',q.id,
   'results',(SELECT coalesce(jsonb_agg(jsonb_build_object('taskId',j.id,'resultRevision',j.result_revision,'kind','draft_brief')
      ORDER BY src.created_at),'[]')
     FROM sophia.jobs j JOIN sophia.source_objects src ON src.project_id=j.project_id AND src.id=j.result_source_id
     WHERE j.project_id=e.project_id AND j.kind='draft_brief' AND j.state='succeeded' AND src.created_at>=e.opened_at
      AND NOT EXISTS(SELECT 1 FROM sophia.exchange_announcements x WHERE x.exchange_id=e.id AND x.job_id=j.id
       AND x.result_revision=j.result_revision))) ORDER BY e.room_id),'[]')
  FROM sophia.room_exchanges e JOIN sophia.room_state r ON r.id=e.room_id
  LEFT JOIN sophia.exchange_inputs i ON i.exchange_id=e.id AND i.input_epoch=e.input_epoch
  LEFT JOIN LATERAL (SELECT id FROM sophia.room_quiesce_requests q WHERE q.exchange_id=e.id AND q.acked_at IS NULL
   ORDER BY q.requested_at DESC LIMIT 1) q ON true
  WHERE e.state<>'ended');
END $$;

-- The bridge's view of a room. A guest present pauses a live exchange at once (case A12), and so does a participant whose
-- standing the API did not sign ('unknown'): fail closed. Presence changes are events.
CREATE FUNCTION sophia.media_report_presence(p_report jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE room uuid:=(p_report->>'roomId')::uuid; p uuid; prior sophia.room_ai_presence; guests boolean; paused sophia.room_exchanges; rev bigint;
BEGIN
 PERFORM sophia.require_service();
 SELECT project_id, revision INTO p, rev FROM sophia.room_state WHERE id=room;
 IF p IS NULL THEN RAISE EXCEPTION 'Room not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 guests:=EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_report->'participants','[]')) x WHERE x->>'standing' IN ('guest','unknown'));
 SELECT * INTO prior FROM sophia.room_ai_presence WHERE room_id=room FOR UPDATE;
 INSERT INTO sophia.room_ai_presence(project_id,room_id,exchange_id,bridge_instance,voice,reason,guests_present,participants,reported_at)
 VALUES(p,room,(p_report->>'exchangeId')::uuid,p_report->>'bridgeInstanceId',p_report->>'voice',left(p_report->>'reason',500),guests,
  coalesce(p_report->'participants','[]'),now())
 ON CONFLICT (room_id) DO UPDATE SET exchange_id=EXCLUDED.exchange_id, bridge_instance=EXCLUDED.bridge_instance, voice=EXCLUDED.voice,
  reason=EXCLUDED.reason, guests_present=EXCLUDED.guests_present, participants=EXCLUDED.participants, reported_at=now();
 IF guests THEN
  UPDATE sophia.room_exchanges SET state='paused', pause_reason='guest', revision=revision+1
   WHERE room_id=room AND state<>'ended' AND (state='open' OR pause_reason<>'guest') RETURNING * INTO paused;
  IF paused.id IS NOT NULL THEN
   PERFORM sophia.emit_service_event(p,'room.exchange_changed','room_exchange',paused.id,paused.revision,'room.exchange_guest');
  END IF;
 END IF;
 IF prior.room_id IS NULL OR prior.voice<>(p_report->>'voice') OR prior.guests_present<>guests
  OR prior.exchange_id IS DISTINCT FROM (p_report->>'exchangeId')::uuid THEN
  PERFORM sophia.emit_service_event(p,'room.sophia_presence','room',room,rev,'room.sophia_'||(p_report->>'voice'));
 END IF;
END $$;

-- A guest asks for their room token: a live exchange is paused and the bridge must confirm quiescence first.
CREATE FUNCTION sophia.request_guest_quiesce(p_entry uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE entry sophia.room_lobby; e sophia.room_exchanges; req uuid;
BEGIN
 SELECT * INTO entry FROM sophia.room_lobby WHERE id=p_entry AND actor_id=sophia.actor_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'Lobby entry not found' USING ERRCODE='22023'; END IF;
 IF entry.status<>'admitted' THEN RAISE EXCEPTION 'Not admitted to the room' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=entry.project_id FOR UPDATE;
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

CREATE FUNCTION sophia.quiesce_acked(p_request uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT acked_at IS NOT NULL FROM sophia.room_quiesce_requests WHERE id=p_request $$;

CREATE FUNCTION sophia.media_ack_quiesce(p_request uuid, p_bridge text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM sophia.require_service();
 UPDATE sophia.room_quiesce_requests SET acked_at=now(), acked_by=left(p_bridge,64) WHERE id=p_request AND acked_at IS NULL;
END $$;

-- The holder left the room (pause input now) or stayed gone past the grace (clear the floor by compare-and-set
-- against that holder and epoch). A stale report — the floor or epoch moved on — changes nothing.
CREATE FUNCTION sophia.media_holder_event(p_exchange uuid, p_actor uuid, p_epoch bigint, p_event text) RETURNS text LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE p uuid; e sophia.room_exchanges; holder uuid; r sophia.room_state;
BEGIN
 PERFORM sophia.require_service();
 IF p_event NOT IN ('left','gone') THEN RAISE EXCEPTION 'Invalid holder event' USING ERRCODE='22023'; END IF;
 SELECT project_id INTO p FROM sophia.room_exchanges WHERE id=p_exchange;
 IF p IS NULL THEN RETURN 'stale'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 SELECT * INTO e FROM sophia.room_exchanges WHERE id=p_exchange FOR UPDATE;
 IF e.state='ended' OR e.input_epoch<>p_epoch THEN RETURN 'stale'; END IF;
 SELECT actor_id INTO holder FROM sophia.exchange_inputs WHERE exchange_id=e.id AND input_epoch=e.input_epoch;
 IF holder IS DISTINCT FROM p_actor THEN RETURN 'stale'; END IF;
 IF p_event='left' THEN
  IF e.state='open' THEN
   UPDATE sophia.room_exchanges SET state='paused', pause_reason='holder_left', revision=revision+1 WHERE id=e.id RETURNING * INTO e;
   PERFORM sophia.emit_service_event(p,'room.exchange_changed','room_exchange',e.id,e.revision,'room.exchange_holder_left');
  END IF;
  RETURN 'paused';
 END IF;
 UPDATE sophia.room_state SET input_actor_id=NULL, revision=revision+1 WHERE id=e.room_id AND input_actor_id=p_actor RETURNING * INTO r;
 IF r.id IS NULL THEN RETURN 'stale'; END IF;
 IF e.pause_reason='holder_left' THEN
  UPDATE sophia.room_exchanges SET state='open', pause_reason=NULL WHERE id=e.id RETURNING * INTO e;
 END IF;
 e:=sophia.next_input_epoch(e,NULL);
 PERFORM sophia.emit_service_event(p,'room.input_floor_changed','room',r.id,r.revision,'room.input_floor_released');
 RETURN 'cleared';
END $$;

-- The bridge announced a finished result in this exchange: record it once (a repeat changes nothing).
CREATE FUNCTION sophia.media_record_announced(p_exchange uuid, p_job uuid, p_revision integer) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.room_exchanges;
BEGIN
 PERFORM sophia.require_service();
 SELECT * INTO e FROM sophia.room_exchanges WHERE id=p_exchange;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM sophia.jobs WHERE project_id=e.project_id AND id=p_job) THEN
  RAISE EXCEPTION 'Announcement names work outside this exchange''s project' USING ERRCODE='42501'; END IF;
 INSERT INTO sophia.exchange_announcements(project_id,exchange_id,job_id,result_revision) VALUES(e.project_id,e.id,p_job,p_revision)
  ON CONFLICT DO NOTHING;
END $$;

-- A tool call acts for the speaker its input epoch binds: never for a name the model produced.
CREATE FUNCTION sophia.media_tool_speaker(p_exchange uuid, p_epoch bigint, p_actor uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.room_exchanges;
BEGIN
 PERFORM sophia.require_service();
 SELECT * INTO e FROM sophia.room_exchanges WHERE id=p_exchange;
 IF NOT FOUND OR e.state='ended' THEN RAISE EXCEPTION 'The exchange has ended' USING ERRCODE='40001'; END IF;
 IF e.state='paused' THEN RAISE EXCEPTION 'The exchange is paused' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.exchange_inputs WHERE exchange_id=e.id AND input_epoch=p_epoch AND actor_id=p_actor) THEN
  RAISE EXCEPTION 'The speaker is not bound to that input epoch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.project_members WHERE project_id=e.project_id AND actor_id=p_actor AND active) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('projectId',e.project_id,'roomId',e.room_id,'currentEpoch',e.input_epoch);
END $$;

REVOKE ALL ON FUNCTION sophia.start_exchange(uuid,bigint,boolean,text), sophia.control_exchange(uuid,text,text),
 sophia.media_assignments(), sophia.media_report_presence(jsonb), sophia.request_guest_quiesce(uuid), sophia.quiesce_acked(uuid),
 sophia.media_ack_quiesce(uuid,text), sophia.media_holder_event(uuid,uuid,bigint,text), sophia.media_tool_speaker(uuid,bigint,uuid),
 sophia.media_record_announced(uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.start_exchange(uuid,bigint,boolean,text), sophia.control_exchange(uuid,text,text),
 sophia.media_assignments(), sophia.media_report_presence(jsonb), sophia.request_guest_quiesce(uuid), sophia.quiesce_acked(uuid),
 sophia.media_ack_quiesce(uuid,text), sophia.media_holder_event(uuid,uuid,bigint,text), sophia.media_tool_speaker(uuid,bigint,uuid),
 sophia.media_record_announced(uuid,uuid,integer) TO sophia_api;
COMMIT;
