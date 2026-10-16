-- A16 (docs/plans/pending-invitations-api.md): the member invitations waiting for the calling person, so the Studio
-- can say «Luis invited you to …» where they are and let them accept it there.
-- * The invited person cannot read their own invitation: room_invitations is readable by the project's editors only
--   (editors_read, 0010). This function reads, for the address the API passes from the caller's token, the member
--   invitations still open and usable in projects the caller is not already in.
-- * It never returns the token's hash. It returns the link's version, from which the API rebuilds the token it derives
--   (HMAC over the id and version) to accept through accept_room_invitation, unchanged: the address match, closed,
--   used up, already a member, the locks and the event all hold.
-- * Only the API calls it (sophia_api). 0001–0045 are not edited. Additive: nothing that exists calls it.
BEGIN;

CREATE FUNCTION sophia.pending_member_invitations(p_email text)
RETURNS TABLE(id uuid, project_id uuid, project_title text, inviter_name text, member_role text, expires_at timestamptz,
  token_version integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT i.id, i.project_id, p.title, i.inviter_name, i.member_role, i.expires_at, i.token_version
 FROM sophia.room_invitations i JOIN sophia.projects p ON p.id=i.project_id
 WHERE sophia.actor_id() IS NOT NULL AND p_email IS NOT NULL AND i.kind='member' AND i.email=lower(p_email)
  AND i.revoked_at IS NULL AND i.expires_at>now() AND i.uses<i.max_uses
  AND NOT EXISTS (SELECT 1 FROM sophia.project_members m
   WHERE m.project_id=i.project_id AND m.actor_id=sophia.actor_id() AND m.active)
 ORDER BY i.created_at DESC, i.id
 LIMIT 50
$$;

-- The member invitation for this address by its id, whatever its state, so the API rebuilds its token and accepts it
-- through accept_room_invitation, which answers each state as the link's accept does: already a member (a retry after a
-- lost reply) returns the project; closed or used up is said so. Never the token's hash; never another address's.
CREATE FUNCTION sophia.member_invitation_for(p_email text, p_invitation uuid)
RETURNS TABLE(id uuid, project_id uuid, token_version integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT i.id, i.project_id, i.token_version FROM sophia.room_invitations i
 WHERE sophia.actor_id() IS NOT NULL AND p_email IS NOT NULL AND i.kind='member' AND i.id=p_invitation
  AND i.email=lower(p_email)
$$;

REVOKE ALL ON FUNCTION sophia.pending_member_invitations(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.pending_member_invitations(text) TO sophia_api;
REVOKE ALL ON FUNCTION sophia.member_invitation_for(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.member_invitation_for(text,uuid) TO sophia_api;

COMMIT;
