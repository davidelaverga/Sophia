-- S1-04A (contract amendment A03): at the room's door, declining is for now and blocking is for good.
-- * Declining ('denied') no longer shuts a guest out: after a minute they may ask again, and an editor can
--   still let them in meanwhile, so a mistaken click costs a minute, not a guest.
-- * Blocking ('blocked') is the door shut: the guest cannot ask again from that identity until someone
--   unblocks them (which leaves the entry 'left', so their next knock waits like a first one). A blocked
--   entry takes no other decision until it is unblocked, so a stray click never undoes a block.
-- * Each entry counts its knocks, so the room can tell a first knock from someone who keeps asking.
-- Every decision still re-checks authority and emits one project event.
BEGIN;

ALTER TABLE sophia.room_lobby DROP CONSTRAINT room_lobby_status_check;
ALTER TABLE sophia.room_lobby ADD CONSTRAINT room_lobby_status_check
 CHECK(status IN ('waiting','admitted','denied','left','blocked'));
ALTER TABLE sophia.room_lobby ADD COLUMN knocks integer NOT NULL DEFAULT 1 CHECK(knocks>0);

-- The entry as the API returns it now carries when it was last decided and how often its guest asked.
CREATE OR REPLACE FUNCTION sophia.lobby_entry_json(e sophia.room_lobby) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('id',e.id,'displayName',e.display_name,'status',e.status,'requestedAt',e.requested_at,
  'decidedAt',e.decided_at,'knocks',e.knocks,'actorId',e.actor_id,'roomId',e.room_id,'projectId',e.project_id) $$;

-- A declined guest may ask again once a minute has passed since the decision.
CREATE FUNCTION sophia.lobby_may_knock_again(e sophia.room_lobby) RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT e.status='left' OR (e.status='denied' AND coalesce(e.decided_at,'-infinity')<=now()-interval '1 minute') $$;
REVOKE ALL ON FUNCTION sophia.lobby_may_knock_again(sophia.room_lobby) FROM PUBLIC;

CREATE OR REPLACE FUNCTION sophia.knock_room(p_token_sha256 bytea, p_display_name text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); i sophia.room_invitations; e sophia.room_lobby; nm text:=btrim(p_display_name);
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF nm IS NULL OR length(nm) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Invalid name' USING ERRCODE='22023'; END IF;
 SELECT * INTO i FROM sophia.room_invitations WHERE token_sha256=p_token_sha256;
 IF NOT FOUND OR i.kind<>'guest' THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=i.project_id FOR UPDATE;
 SELECT * INTO i FROM sophia.room_invitations WHERE id=i.id FOR UPDATE;
 IF i.revoked_at IS NOT NULL OR i.expires_at<=now() THEN RAISE EXCEPTION 'The invitation is closed' USING ERRCODE='40001'; END IF;
 SELECT * INTO e FROM sophia.room_lobby WHERE room_id=i.room_id AND actor_id=a FOR UPDATE;
 IF FOUND THEN
  -- Waiting, let in or blocked: asking again changes nothing, and a blocked guest learns they are blocked.
  IF e.status IN ('waiting','admitted','blocked') THEN RETURN sophia.lobby_entry_json(e); END IF;
  IF NOT sophia.lobby_may_knock_again(e) THEN
   RAISE EXCEPTION 'Declined a moment ago: ask again in a minute' USING ERRCODE='40001';
  END IF;
  UPDATE sophia.room_lobby SET status='waiting', display_name=nm, requested_at=now(), decided_by=NULL, decided_at=NULL,
   knocks=knocks+1, revision=revision+1 WHERE id=e.id RETURNING * INTO e;
 ELSE
  IF i.uses>=i.max_uses THEN RAISE EXCEPTION 'The invitation has been used up' USING ERRCODE='40001'; END IF;
  INSERT INTO sophia.room_lobby(project_id,room_id,invitation_id,actor_id,display_name,status,decided_by,decided_at)
  SELECT i.project_id,i.room_id,i.id,a,nm,
   CASE WHEN m THEN 'admitted' ELSE 'waiting' END, CASE WHEN m THEN a END, CASE WHEN m THEN now() END
   FROM (SELECT EXISTS(SELECT 1 FROM sophia.project_members WHERE project_id=i.project_id AND actor_id=a AND active) AS m) x
  RETURNING * INTO e;
  UPDATE sophia.room_invitations SET uses=uses+1 WHERE id=i.id;
 END IF;
 PERFORM sophia.emit_project_event(i.project_id,'room.lobby_changed','room_lobby',e.id,e.revision,'room.lobby_knock');
 RETURN sophia.lobby_entry_json(e);
END $$;

-- Editors and admins let in, decline, block or unblock. Declining or blocking someone let in takes them out
-- of the call (the API removes them from LiveKit).
CREATE OR REPLACE FUNCTION sophia.decide_lobby_entry(p_entry uuid, p_decision text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE p uuid; e sophia.room_lobby; next_status text;
BEGIN
 SELECT project_id INTO p FROM sophia.room_lobby WHERE id=p_entry;
 IF p IS NULL OR NOT sophia.can_edit(p) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 next_status:=CASE p_decision WHEN 'admit' THEN 'admitted' WHEN 'deny' THEN 'denied' WHEN 'block' THEN 'blocked'
  WHEN 'unblock' THEN 'left' END;
 IF next_status IS NULL THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 SELECT * INTO e FROM sophia.room_lobby WHERE id=p_entry FOR UPDATE;
 IF e.status=next_status THEN RETURN sophia.lobby_entry_json(e); END IF;
 -- Unblocking lifts a block and nothing else; a blocked entry takes no other decision until it is unblocked.
 IF p_decision='unblock' AND e.status<>'blocked' THEN RETURN sophia.lobby_entry_json(e); END IF;
 IF e.status='blocked' AND p_decision<>'unblock' THEN
  RAISE EXCEPTION 'Blocked: unblock them first' USING ERRCODE='40001';
 END IF;
 UPDATE sophia.room_lobby SET status=next_status, decided_by=sophia.actor_id(), decided_at=now(), revision=revision+1
  WHERE id=p_entry RETURNING * INTO e;
 PERFORM sophia.emit_project_event(p,'room.lobby_changed','room_lobby',e.id,e.revision,
  CASE next_status WHEN 'admitted' THEN 'room.lobby_admit' WHEN 'denied' THEN 'room.lobby_deny'
   WHEN 'blocked' THEN 'room.lobby_block' ELSE 'room.lobby_unblock' END);
 RETURN sophia.lobby_entry_json(e);
END $$;
COMMIT;
