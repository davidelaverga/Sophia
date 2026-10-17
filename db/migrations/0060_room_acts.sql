-- More for the host (docs/plans/host-more.md, A31): an admin's camera stop, screen stop or everyone muted, recorded
-- once the room server has done it, as A24's acts are (0057). A camera or a screen is an act on a member; everyone
-- muted is an act on the project, with no member named. 0057's record_host_act is untouched. 0001–0059 are not edited.
BEGIN;

CREATE FUNCTION sophia.record_room_act(p_project uuid, p_target uuid, p_act text) RETURNS bigint LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); m sophia.project_members; kind text;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 kind:=CASE p_act WHEN 'camera' THEN 'room.host_camera_off' WHEN 'screen' THEN 'room.host_screen_off'
  WHEN 'mute_all' THEN 'room.host_muted_all' END;
 IF kind IS NULL THEN RAISE EXCEPTION 'Unknown act' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.is_admin(p_project) THEN RAISE EXCEPTION 'Only an admin acts on the call' USING ERRCODE='42501'; END IF;
 IF p_act='mute_all' THEN
  RETURN sophia.emit_project_event(p_project, kind, 'project', p_project,
   (SELECT title_revision FROM sophia.projects WHERE id=p_project), kind);
 END IF;
 SELECT * INTO m FROM sophia.project_members WHERE project_id=p_project AND actor_id=p_target AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not a member of the project' USING ERRCODE='22023'; END IF;
 RETURN sophia.emit_project_event(p_project, kind, 'project_member', p_target, m.revision, kind);
END $$;
REVOKE ALL ON FUNCTION sophia.record_room_act(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.record_room_act(uuid,uuid,text) TO sophia_api;

COMMIT;
