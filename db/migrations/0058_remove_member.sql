-- An admin removes a member from the project (docs/plans/remove-member.md). Admins only; never oneself (leaving is
-- that, 0052); the target an active member (removing an admin leaves the remover, an admin). Idempotent per actor and
-- key. The membership goes inactive and the audience moves, as a leave does; the member is taken out of the call by the
-- same obligation (room_removals, reason 'removed'), which a new invitation cancels; project.member_removed is emitted
-- with the member as its entity, so the project's activity says who removed whom. An invitation issued before an admin
-- last removed someone neither brings them back nor waits for them in the app (Codex P1 on #356): only a new one does.
-- 0001–0057 are not edited.
BEGIN;

ALTER TABLE sophia.room_removals DROP CONSTRAINT room_removals_reason_check;
ALTER TABLE sophia.room_removals ADD CONSTRAINT room_removals_reason_check CHECK(reason IN ('denied','blocked','left','removed'));
ALTER TABLE sophia.room_removals DROP CONSTRAINT room_removals_left_has_no_entry;
ALTER TABLE sophia.room_removals ADD CONSTRAINT room_removals_left_has_no_entry
 CHECK((reason IN ('left','removed'))=(lobby_entry_id IS NULL));

CREATE TABLE sophia.member_removals (
 actor_id uuid NOT NULL, idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 project_id uuid NOT NULL REFERENCES sophia.projects(id), target_id uuid NOT NULL, receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,idempotency_key)
);
ALTER TABLE sophia.member_removals ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION sophia.remove_member(p_project uuid, p_target uuid, p_key text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); prior sophia.member_removals; m sophia.project_members; cursor_value bigint;
 receipt_value jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 -- Held first: the removal, its obligation and its event are one step in the project's sequence.
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO prior FROM sophia.member_removals WHERE actor_id=a AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.project_id<>p_project OR prior.target_id<>p_target THEN
   RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 IF NOT sophia.is_admin(p_project) THEN RAISE EXCEPTION 'Only an admin removes members' USING ERRCODE='42501'; END IF;
 IF p_target=a THEN RAISE EXCEPTION 'Leave the project instead of removing yourself' USING ERRCODE='22023'; END IF;
 SELECT * INTO m FROM sophia.project_members WHERE project_id=p_project AND actor_id=p_target AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not a member of the project' USING ERRCODE='22023'; END IF;
 UPDATE sophia.project_members SET active=false, revision=revision+1 WHERE project_id=p_project AND actor_id=p_target;
 UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=p_project;
 -- Out of the call, as a leave is (0052): watched while a token they hold could bring them back.
 INSERT INTO sophia.room_removals(project_id,room_id,lobby_entry_id,identity,reason,guard_until)
  SELECT p_project, r.id, NULL, p_target::text, 'removed', now()+interval '630 seconds' FROM sophia.room_state r
   WHERE r.project_id=p_project
  ON CONFLICT (room_id,identity) WHERE lobby_entry_id IS NULL AND state<>'cancelled' AND settled_at IS NULL
  DO UPDATE SET guard_until=greatest(sophia.room_removals.guard_until,EXCLUDED.guard_until);
 cursor_value:=sophia.emit_project_event(p_project,'project.member_removed','project_member',p_target,m.revision+1,
  'project.member_removed');
 receipt_value:=jsonb_build_object('actorId',p_target,'cursor',cursor_value::text);
 INSERT INTO sophia.member_removals(actor_id,idempotency_key,project_id,target_id,receipt)
  VALUES(a,p_key,p_project,p_target,receipt_value);
 RETURN receipt_value;
END $$;

-- The open removal of a member an admin removed, for the API's immediate attempt; admins only.
CREATE FUNCTION sophia.pending_member_removal(p_project uuid, p_target uuid)
RETURNS TABLE(id uuid, room_id uuid, identity text, state text, attempts integer) LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
#variable_conflict use_column
BEGIN
 IF NOT sophia.is_admin(p_project) THEN RETURN; END IF;
 RETURN QUERY SELECT r.id, r.room_id, r.identity, r.state, r.attempts FROM sophia.room_removals r
  WHERE r.project_id=p_project AND r.identity=p_target::text AND r.reason='removed' AND r.state='pending';
END $$;

-- accept_room_invitation (0052), replaced: coming back cancels a removal an admin's removing left, as a leave's.
CREATE OR REPLACE FUNCTION sophia.accept_room_invitation(p_token_sha256 bytea, p_email text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); i sophia.room_invitations; revision_value bigint;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM sophia.room_invitations WHERE token_sha256=p_token_sha256;
 IF NOT FOUND OR i.kind<>'member' THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE='22023'; END IF;
 IF p_email IS NULL OR lower(p_email)<>i.email THEN
  RAISE EXCEPTION 'This invitation is for another email address' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=i.project_id FOR UPDATE;
 SELECT * INTO i FROM sophia.room_invitations WHERE id=i.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM sophia.project_members WHERE project_id=i.project_id AND actor_id=a AND active) THEN
  RETURN jsonb_build_object('projectId',i.project_id); END IF;
 IF i.revoked_at IS NOT NULL OR i.expires_at<=now() THEN RAISE EXCEPTION 'The invitation is closed' USING ERRCODE='40001'; END IF;
 IF i.uses>=i.max_uses THEN RAISE EXCEPTION 'The invitation has been used up' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.member_removals r WHERE r.project_id=i.project_id AND r.target_id=a
   AND r.created_at>i.created_at) THEN
  RAISE EXCEPTION 'The invitation is closed' USING ERRCODE='40001'; END IF;
 INSERT INTO sophia.project_members AS pm(project_id,actor_id,role) VALUES(i.project_id,a,i.member_role)
  ON CONFLICT (project_id,actor_id) DO UPDATE SET active=true, role=EXCLUDED.role, revision=pm.revision+1
  RETURNING revision INTO revision_value;
 UPDATE sophia.room_removals SET state='cancelled', lease_owner=NULL, lease_until=NULL
  WHERE project_id=i.project_id AND identity=a::text AND reason IN ('left','removed') AND state<>'cancelled';
 UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=i.project_id;
 UPDATE sophia.room_invitations SET uses=uses+1 WHERE id=i.id;
 PERFORM sophia.emit_project_event(i.project_id,'project.member_joined','project_member',a,revision_value,'project.member');
 RETURN jsonb_build_object('projectId',i.project_id);
END $$;

-- pending_member_invitations (0046), replaced: an invitation issued before this person's latest removal from its
-- project no longer waits for them (Codex P1 on #356).
CREATE OR REPLACE FUNCTION sophia.pending_member_invitations(p_email text)
RETURNS TABLE(id uuid, project_id uuid, project_title text, inviter_name text, member_role text, expires_at timestamptz,
  token_version integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT i.id, i.project_id, p.title, i.inviter_name, i.member_role, i.expires_at, i.token_version
 FROM sophia.room_invitations i JOIN sophia.projects p ON p.id=i.project_id
 WHERE sophia.actor_id() IS NOT NULL AND p_email IS NOT NULL AND i.kind='member' AND i.email=lower(p_email)
  AND i.revoked_at IS NULL AND i.expires_at>now() AND i.uses<i.max_uses
  AND NOT EXISTS (SELECT 1 FROM sophia.project_members m
   WHERE m.project_id=i.project_id AND m.actor_id=sophia.actor_id() AND m.active)
  AND NOT EXISTS (SELECT 1 FROM sophia.member_removals r
   WHERE r.project_id=i.project_id AND r.target_id=sophia.actor_id() AND r.created_at>i.created_at)
 ORDER BY i.created_at DESC, i.id
 LIMIT 50
$$;

REVOKE ALL ON FUNCTION sophia.remove_member(uuid,uuid,text), sophia.pending_member_removal(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.remove_member(uuid,uuid,text), sophia.pending_member_removal(uuid,uuid) TO sophia_api;

COMMIT;
