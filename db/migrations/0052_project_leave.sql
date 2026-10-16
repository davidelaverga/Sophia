-- A member leaves a project (docs/plans/project-leave.md): someone invited could never step out; the project stayed on
-- their Work list for good. Any active member may leave, except the last active admin, who would leave the project with
-- no one to invite or rename. Idempotent per actor and key: a retry after a lost reply answers the same receipt, though
-- the person is no longer a member. The membership goes inactive (its revision bumped), as accepting an invitation sets
-- it active again (0010); the audience's revision moves, and project.member_left is emitted, said as a departure.
-- Leaving takes them out of the call too (Codex P1 on #349): a removal as A07 records for a guest (0014), which the
-- worker settles on the room server's evidence and keeps on watch while a token issued before could bring them back;
-- coming back by a new invitation cancels it. accept_room_invitation (0010) is replaced for that, and to emit the
-- membership's own revision. settle_room_removal (0014) is replaced: a member's removal has no lobby entry to touch.
-- 0001–0051 are not edited.
BEGIN;

-- A member who left is removed as a guest is: the same obligation, with no lobby entry.
ALTER TABLE sophia.room_removals ALTER COLUMN lobby_entry_id DROP NOT NULL;
ALTER TABLE sophia.room_removals DROP CONSTRAINT room_removals_reason_check;
ALTER TABLE sophia.room_removals ADD CONSTRAINT room_removals_reason_check CHECK(reason IN ('denied','blocked','left'));
ALTER TABLE sophia.room_removals ADD CONSTRAINT room_removals_left_has_no_entry CHECK((reason='left')=(lobby_entry_id IS NULL));
CREATE UNIQUE INDEX room_removals_one_open_member ON sophia.room_removals(room_id,identity)
 WHERE lobby_entry_id IS NULL AND state<>'cancelled' AND settled_at IS NULL;

CREATE TABLE sophia.project_departures (
 actor_id uuid NOT NULL, idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 project_id uuid NOT NULL REFERENCES sophia.projects(id), receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,idempotency_key)
);
ALTER TABLE sophia.project_departures ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION sophia.leave_project(p_project uuid, p_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); prior sophia.project_departures; m sophia.project_members; cursor_value bigint;
 receipt_value jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 -- Held first: the departure, the last-admin check and the event are one step in the project's sequence.
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO prior FROM sophia.project_departures WHERE actor_id=a AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.project_id<>p_project THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 SELECT * INTO m FROM sophia.project_members WHERE project_id=p_project AND actor_id=a AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not a member of the project' USING ERRCODE='42501'; END IF;
 IF m.role='admin' AND NOT EXISTS(SELECT 1 FROM sophia.project_members
   WHERE project_id=p_project AND actor_id<>a AND active AND role='admin') THEN
  RAISE EXCEPTION 'You''re the project''s only admin, so you can''t leave it yet' USING ERRCODE='40001'; END IF;
 UPDATE sophia.project_members SET active=false, revision=revision+1 WHERE project_id=p_project AND actor_id=a;
 UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=p_project;
 -- Out of the call: a token they hold lives at most 630 s (the guest fence's span), so the watch lasts that long.
 INSERT INTO sophia.room_removals(project_id,room_id,lobby_entry_id,identity,reason,guard_until)
  SELECT p_project, r.id, NULL, a::text, 'left', now()+interval '630 seconds' FROM sophia.room_state r WHERE r.project_id=p_project
  ON CONFLICT (room_id,identity) WHERE lobby_entry_id IS NULL AND state<>'cancelled' AND settled_at IS NULL
  DO UPDATE SET guard_until=greatest(sophia.room_removals.guard_until,EXCLUDED.guard_until);
 cursor_value:=sophia.emit_project_event(p_project,'project.member_left','project_member',a,m.revision+1,'project.member_left');
 receipt_value:=jsonb_build_object('projectId',p_project,'cursor',cursor_value::text);
 INSERT INTO sophia.project_departures(actor_id,idempotency_key,project_id,receipt) VALUES(a,p_key,p_project,receipt_value);
 RETURN receipt_value;
END $$;
-- The caller's own open removal after leaving, for the API's immediate attempt: they are no longer a member, so RLS
-- would hide it; only their own identity's is read.
CREATE FUNCTION sophia.own_departure_removal(p_project uuid)
RETURNS TABLE(id uuid, room_id uuid, identity text, state text, attempts integer) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT r.id, r.room_id, r.identity, r.state, r.attempts FROM sophia.room_removals r
  WHERE r.project_id=p_project AND r.identity=sophia.actor_id()::text AND r.reason='left' AND r.state='pending' $$;
REVOKE ALL ON FUNCTION sophia.leave_project(uuid,text), sophia.own_departure_removal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.leave_project(uuid,text), sophia.own_departure_removal(uuid) TO sophia_api;

-- accept_room_invitation (0010), replaced: the same rules; coming back cancels the removal leaving left, and the join
-- event carries the membership's revision.
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
 INSERT INTO sophia.project_members AS pm(project_id,actor_id,role) VALUES(i.project_id,a,i.member_role)
  ON CONFLICT (project_id,actor_id) DO UPDATE SET active=true, role=EXCLUDED.role, revision=pm.revision+1
  RETURNING revision INTO revision_value;
 UPDATE sophia.room_removals SET state='cancelled', lease_owner=NULL, lease_until=NULL
  WHERE project_id=i.project_id AND identity=a::text AND reason='left' AND state<>'cancelled';
 UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=i.project_id;
 UPDATE sophia.room_invitations SET uses=uses+1 WHERE id=i.id;
 PERFORM sophia.emit_project_event(i.project_id,'project.member_joined','project_member',a,revision_value,'project.member');
 RETURN jsonb_build_object('projectId',i.project_id);
END $$;

-- settle_room_removal (0014), replaced: the same rules; only a guest's removal moves its lobby entry.
CREATE OR REPLACE FUNCTION sophia.settle_room_removal(p_id uuid, p_worker text, p_outcome text, p_error text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.room_removals; l sophia.room_lobby; backoff integer; was text;
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'A removal settlement cannot carry a member identity' USING ERRCODE='42501'; END IF;
 IF p_outcome NOT IN ('removed','absent','failed') THEN RAISE EXCEPTION 'Invalid outcome' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM sophia.room_removals WHERE id=p_id;
 IF NOT FOUND THEN RETURN 'stale'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=r.project_id FOR UPDATE;
 SELECT * INTO r FROM sophia.room_removals WHERE id=p_id FOR UPDATE;
 IF r.state='cancelled' OR (r.lease_owner IS NOT NULL AND r.lease_owner<>p_worker AND r.lease_until>now()) THEN RETURN 'stale'; END IF;
 was:=r.state;
 IF p_outcome='failed' THEN
  backoff:=least(60, 2^least(r.attempts,6))::integer;
  UPDATE sophia.room_removals SET state='pending', settled_at=NULL, attempts=attempts+1, last_error=left(coalesce(p_error,'failed'),500),
   next_attempt_at=now()+make_interval(secs=>backoff), lease_owner=NULL, lease_until=NULL WHERE id=r.id RETURNING * INTO r;
 ELSE
  UPDATE sophia.room_removals SET state=CASE WHEN was='removed' AND p_outcome='absent' THEN 'removed' ELSE p_outcome END,
   settled_at=coalesce(settled_at,now()), attempts=attempts+CASE WHEN p_outcome='removed' THEN 1 ELSE 0 END,
   last_error=CASE WHEN p_outcome='removed' OR was='pending' THEN NULL ELSE last_error END,
   next_attempt_at=now()+interval '15 seconds', lease_owner=NULL, lease_until=NULL WHERE id=r.id RETURNING * INTO r;
 END IF;
 IF r.lobby_entry_id IS NOT NULL AND (r.state<>was OR p_outcome<>'absent') THEN
  UPDATE sophia.room_lobby SET revision=revision+1 WHERE id=r.lobby_entry_id RETURNING * INTO l;
  PERFORM sophia.emit_service_event(r.project_id,'room.lobby_changed','room_lobby',l.id,l.revision,'room.lobby_removal_'||r.state);
 END IF;
 RETURN r.state;
END $$;

COMMIT;
