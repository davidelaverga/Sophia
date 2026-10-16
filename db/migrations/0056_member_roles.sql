-- An admin changes a member's role, and can hand the admin role over (docs/plans/member-roles.md): until now a role was
-- set when a member joined and never after, and since a member can leave (0052) the last admin could never go. Admins
-- only; the target an active member; a project keeps at least one admin, so demoting its last one, oneself included,
-- is refused. A role already held changes nothing. A change holds the project's row, bumps the membership's revision
-- and the audience's, and emits project.member_role_changed. 0001–0055 are not edited.
BEGIN;

CREATE FUNCTION sophia.change_member_role(p_project uuid, p_actor uuid, p_role text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); m sophia.project_members; revision_value bigint; cursor_value bigint;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('admin','editor','viewer') THEN RAISE EXCEPTION 'Unknown role' USING ERRCODE='22023'; END IF;
 -- Held first: the last-admin check and the change are one step in the project's sequence.
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.is_admin(p_project) THEN RAISE EXCEPTION 'Only an admin changes roles' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM sophia.project_members WHERE project_id=p_project AND actor_id=p_actor AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not a member of the project' USING ERRCODE='22023'; END IF;
 IF m.role=p_role THEN
  RETURN jsonb_build_object('actorId',p_actor,'role',p_role,'revision',m.revision,
   'cursor',(SELECT event_sequence FROM sophia.projects WHERE id=p_project)::text);
 END IF;
 IF m.role='admin' AND NOT EXISTS(SELECT 1 FROM sophia.project_members
   WHERE project_id=p_project AND actor_id<>p_actor AND active AND role='admin') THEN
  RAISE EXCEPTION 'A project needs an admin: make another member an admin first' USING ERRCODE='40001'; END IF;
 UPDATE sophia.project_members SET role=p_role, revision=revision+1 WHERE project_id=p_project AND actor_id=p_actor
  RETURNING revision INTO revision_value;
 UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=p_project;
 cursor_value:=sophia.emit_project_event(p_project,'project.member_role_changed','project_member',p_actor,revision_value,
  'project.member_role');
 RETURN jsonb_build_object('actorId',p_actor,'role',p_role,'revision',revision_value,'cursor',cursor_value::text);
END $$;
REVOKE ALL ON FUNCTION sophia.change_member_role(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.change_member_role(uuid,uuid,text) TO sophia_api;

COMMIT;
