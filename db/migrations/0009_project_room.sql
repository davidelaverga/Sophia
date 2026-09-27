-- S1-04 (contract amendment A01): every project has a room, and its input floor can be passed.
-- sophia.room_state (0001) had no row, no way to be created and no writer. The room carries who may
-- address Sophia (the input floor); permission to talk is not a resource-owner grant, and passing it
-- never touches goals, commands or the outbox.
BEGIN;
INSERT INTO sophia.room_state(project_id) SELECT id FROM sophia.projects ON CONFLICT (project_id) DO NOTHING;

CREATE FUNCTION sophia.create_project_room() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
BEGIN
 INSERT INTO sophia.room_state(project_id) VALUES(NEW.id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sophia.create_project_room() FROM PUBLIC;
CREATE TRIGGER project_room AFTER INSERT ON sophia.projects FOR EACH ROW EXECUTE FUNCTION sophia.create_project_room();

-- Per-actor keys for floor changes, like project_creations (0006): a retry returns the first receipt.
CREATE TABLE sophia.floor_changes (
 project_id uuid NOT NULL REFERENCES sophia.projects(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 semantic_request jsonb NOT NULL,
 receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id, actor_id, idempotency_key),
 UNIQUE(id)
);
-- No policy and no grant: only the definer function below reads or writes it.
ALTER TABLE sophia.floor_changes ENABLE ROW LEVEL SECURITY;

-- Who may pass: anyone while the floor is free, the current holder, or a project admin (reclaim).
-- Who may receive: an active admin or editor of the project. Viewers listen but never hold the floor.
CREATE FUNCTION sophia.transfer_input_floor(p_room uuid, p_next_actor uuid, p_expected_revision bigint, p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); p uuid; r sophia.room_state; semantic jsonb; prior sophia.floor_changes;
 change uuid:=gen_random_uuid(); cursor_value bigint; receipt_value jsonb;
BEGIN
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 SELECT project_id INTO p FROM sophia.room_state WHERE id=p_room;
 -- An unknown room and a room of another project look the same to the caller.
 IF p IS NULL OR NOT sophia.can_edit(p) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 -- Lock order: project, then room (as for commands, 0003).
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 IF NOT sophia.can_edit(p) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
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
 IF NOT EXISTS(SELECT 1 FROM sophia.project_members WHERE project_id=p AND actor_id=p_next_actor AND active AND role IN ('admin','editor')) THEN
  RAISE EXCEPTION 'The next input actor is not an editor of this project' USING ERRCODE='22023'; END IF;
 UPDATE sophia.room_state SET input_actor_id=p_next_actor, revision=revision+1 WHERE id=p_room RETURNING * INTO r;
 UPDATE sophia.projects SET event_sequence=event_sequence+1 WHERE id=p RETURNING event_sequence INTO cursor_value;
 INSERT INTO sophia.project_events(project_id,sequence,type,entity_type,entity_id,entity_revision,summary_code,actor_id)
 VALUES(p,cursor_value,'room.input_floor_changed','room',p_room,r.revision,'room.input_floor',a);
 -- ExchangeReceipt: until S1-05 opens exchanges, exchangeId identifies this floor change (amendment A01).
 receipt_value:=jsonb_build_object('exchangeId',change,'roomId',p_room,'revision',r.revision,'inputActorId',p_next_actor);
 INSERT INTO sophia.floor_changes(project_id,id,actor_id,idempotency_key,semantic_request,receipt) VALUES(p,change,a,p_key,semantic,receipt_value);
 RETURN receipt_value;
END $$;
REVOKE ALL ON FUNCTION sophia.transfer_input_floor(uuid,uuid,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.transfer_input_floor(uuid,uuid,bigint,text) TO sophia_api;
COMMIT;
