-- Invite people from your other projects (docs/plans/invite-from-projects.md): an admin is offered everyone they
-- already share another project with, known by the address the room keeps for them (their verified account name,
-- 0050), so choosing them sends the same member invitation a typed email does. Left out: the admin, the project's
-- members, anyone an open member invitation to this project already reaches, and anyone whose address isn't known.
-- 0001–0053 are not edited.
BEGIN;

CREATE FUNCTION sophia.invitable_people(p_project uuid)
RETURNS TABLE(actor_id uuid, email text) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
#variable_conflict use_column
DECLARE a uuid:=sophia.actor_id();
BEGIN
 IF a IS NULL OR NOT sophia.is_admin(p_project) THEN RAISE EXCEPTION 'Only an admin invites members' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 WITH mine AS (
   SELECT m.project_id FROM sophia.project_members m WHERE m.actor_id=a AND m.active AND m.project_id<>p_project
 ), people AS (
   SELECT DISTINCT m.actor_id FROM sophia.project_members m JOIN mine ON mine.project_id=m.project_id
    WHERE m.active AND m.actor_id<>a
 ), named AS (
   SELECT DISTINCT ON (n.actor_id) n.actor_id, lower(n.name) AS email FROM sophia.room_names n
     JOIN mine ON mine.project_id=n.project_id
    WHERE n.name ~ '^[^@[:space:]]+@[^@[:space:]]+$' ORDER BY n.actor_id, n.named_at DESC
 )
 SELECT p.actor_id, nm.email FROM people p JOIN named nm ON nm.actor_id=p.actor_id
  WHERE NOT EXISTS(SELECT 1 FROM sophia.project_members x WHERE x.project_id=p_project AND x.actor_id=p.actor_id AND x.active)
    AND NOT EXISTS(SELECT 1 FROM sophia.room_invitations i WHERE i.project_id=p_project AND i.kind='member'
      AND i.email=nm.email AND i.revoked_at IS NULL AND i.expires_at>now() AND i.uses<i.max_uses)
  ORDER BY nm.email LIMIT 500;
END $$;
REVOKE ALL ON FUNCTION sophia.invitable_people(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.invitable_people(uuid) TO sophia_api;

COMMIT;
