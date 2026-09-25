-- S1-04A (contract amendment A02): who can come into a project's room, and when.
-- * An invitation is a secret link; a QR code shows the same link. The API derives each link from a
--   server secret, the invitation id and its token version, so only a SHA-256 of the link's token is
--   stored here, and the link can be shown again (or reissued, which retires the old one).
-- * A guest invitation lets people in without an account. They wait in the lobby until an editor or
--   admin admits them, and they reach only the call: guests are never project members.
-- * A member invitation is bound to one email and makes its accepter an editor or viewer.
-- * A session puts a start and an end on the room's calendar.
-- Every write re-checks authority and emits one project event, so members see changes live.
BEGIN;

CREATE TABLE sophia.room_sessions (
 project_id uuid NOT NULL REFERENCES sophia.projects(id),
 id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES sophia.room_state(id),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 time_zone text NOT NULL CHECK(length(time_zone) BETWEEN 1 AND 64),
 created_by uuid NOT NULL,
 creation_key text NOT NULL CHECK(length(creation_key) BETWEEN 1 AND 160),
 created_at timestamptz NOT NULL DEFAULT now(),
 canceled_at timestamptz,
 PRIMARY KEY(project_id, id),
 UNIQUE(created_by, creation_key),
 CHECK(ends_at > starts_at AND ends_at <= starts_at + interval '24 hours')
);

CREATE TABLE sophia.room_invitations (
 project_id uuid NOT NULL REFERENCES sophia.projects(id),
 id uuid NOT NULL UNIQUE,
 room_id uuid NOT NULL REFERENCES sophia.room_state(id),
 session_id uuid REFERENCES sophia.room_sessions(id),
 kind text NOT NULL CHECK(kind IN ('guest','member')),
 member_role text CHECK((kind='member' AND member_role IN ('editor','viewer')) OR (kind='guest' AND member_role IS NULL)),
 email text CHECK(email IS NULL OR length(email) BETWEEN 3 AND 320),
 inviter_name text CHECK(inviter_name IS NULL OR length(inviter_name) BETWEEN 1 AND 320),
 token_sha256 bytea NOT NULL UNIQUE CHECK(length(token_sha256)=32),
 token_version integer NOT NULL DEFAULT 1 CHECK(token_version>0),
 max_uses integer NOT NULL CHECK(max_uses BETWEEN 1 AND 500),
 uses integer NOT NULL DEFAULT 0 CHECK(uses>=0),
 expires_at timestamptz NOT NULL,
 email_status text NOT NULL DEFAULT 'none' CHECK(email_status IN ('none','sent','failed','not_configured')),
 created_by uuid NOT NULL,
 creation_key text NOT NULL CHECK(length(creation_key) BETWEEN 1 AND 160),
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 PRIMARY KEY(project_id, id),
 UNIQUE(created_by, creation_key),
 CHECK(kind='guest' OR email IS NOT NULL)
);

-- One entry per guest and room: waiting until an editor or admin admits or denies them.
CREATE TABLE sophia.room_lobby (
 project_id uuid NOT NULL REFERENCES sophia.projects(id),
 id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES sophia.room_state(id),
 invitation_id uuid NOT NULL REFERENCES sophia.room_invitations(id),
 actor_id uuid NOT NULL,
 display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 60),
 status text NOT NULL CHECK(status IN ('waiting','admitted','denied','left')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 requested_at timestamptz NOT NULL DEFAULT now(),
 decided_by uuid,
 decided_at timestamptz,
 PRIMARY KEY(project_id, id),
 UNIQUE(room_id, actor_id)
);

ALTER TABLE sophia.room_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.room_sessions FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
-- Invitation rows (who was invited, how often used) are for the people who can invite.
ALTER TABLE sophia.room_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY editors_read ON sophia.room_invitations FOR SELECT TO sophia_api USING(sophia.can_edit(project_id));
ALTER TABLE sophia.room_lobby ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.room_lobby FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
GRANT SELECT ON sophia.room_sessions, sophia.room_invitations, sophia.room_lobby TO sophia_api;

-- Internal: the next project event, under the caller's actor. Callers hold the project row lock.
CREATE FUNCTION sophia.emit_project_event(p uuid, p_type text, p_entity_type text, p_entity uuid, p_revision bigint, p_summary text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE cursor_value bigint;
BEGIN
 UPDATE sophia.projects SET event_sequence=event_sequence+1 WHERE id=p RETURNING event_sequence INTO cursor_value;
 INSERT INTO sophia.project_events(project_id,sequence,type,entity_type,entity_id,entity_revision,summary_code,actor_id)
 VALUES(p,cursor_value,p_type,p_entity_type,p_entity,p_revision,p_summary,sophia.actor_id());
 RETURN cursor_value;
END $$;
REVOKE ALL ON FUNCTION sophia.emit_project_event(uuid,text,text,uuid,bigint,text) FROM PUBLIC;

CREATE FUNCTION sophia.is_admin(p_project uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$ SELECT EXISTS(SELECT 1 FROM sophia.project_members WHERE project_id=p_project AND actor_id=sophia.actor_id() AND active AND role='admin') $$;
REVOKE ALL ON FUNCTION sophia.is_admin(uuid) FROM PUBLIC;

CREATE FUNCTION sophia.lobby_entry_json(e sophia.room_lobby) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('id',e.id,'displayName',e.display_name,'status',e.status,'requestedAt',e.requested_at,
  'actorId',e.actor_id,'roomId',e.room_id,'projectId',e.project_id) $$;
REVOKE ALL ON FUNCTION sophia.lobby_entry_json(sophia.room_lobby) FROM PUBLIC;

-- Sessions: editors and admins put a start on the room's calendar, idempotent per creator and key.
CREATE FUNCTION sophia.schedule_room_session(p_project uuid, p_title text, p_starts timestamptz, p_ends timestamptz, p_tz text, p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); s uuid:=gen_random_uuid(); prior sophia.room_sessions;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Invalid title' USING ERRCODE='22023'; END IF;
 IF p_ends <= p_starts OR p_ends > p_starts + interval '24 hours' OR p_ends <= now() THEN
  RAISE EXCEPTION 'A session ends after it starts, within a day, and in the future' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO prior FROM sophia.room_sessions WHERE created_by=a AND creation_key=p_key;
 IF FOUND THEN
  IF prior.project_id<>p_project OR prior.title<>btrim(p_title) OR prior.starts_at<>p_starts OR prior.ends_at<>p_ends THEN
   RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.id;
 END IF;
 INSERT INTO sophia.room_sessions(project_id,id,room_id,title,starts_at,ends_at,time_zone,created_by,creation_key)
 SELECT p_project,s,r.id,btrim(p_title),p_starts,p_ends,p_tz,a,p_key FROM sophia.room_state r WHERE r.project_id=p_project;
 PERFORM sophia.emit_project_event(p_project,'room.session_scheduled','room_session',s,1,'room.session');
 RETURN s;
END $$;

CREATE FUNCTION sophia.cancel_room_session(p_session uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE p uuid;
BEGIN
 SELECT project_id INTO p FROM sophia.room_sessions WHERE id=p_session;
 IF p IS NULL OR NOT sophia.can_edit(p) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 UPDATE sophia.room_sessions SET canceled_at=now() WHERE id=p_session AND canceled_at IS NULL;
 IF FOUND THEN PERFORM sophia.emit_project_event(p,'room.session_canceled','room_session',p_session,2,'room.session_canceled'); END IF;
END $$;

-- Invitations. Guests: editors and admins. Members: admins only. Idempotent per creator and key: a
-- retry returns the first invitation (its link is derived again by the API).
CREATE FUNCTION sophia.check_invitation_request(p_kind text, p_role text, p_email text, p_expires timestamptz, p_max_uses integer)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
BEGIN
 IF p_kind NOT IN ('guest','member') OR (p_kind='guest' AND p_role IS NOT NULL)
  OR (p_kind='member' AND (p_role IS NULL OR p_role NOT IN ('editor','viewer') OR p_email IS NULL)) THEN
  RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='22023'; END IF;
 IF p_email IS NOT NULL AND (length(p_email) NOT BETWEEN 3 AND 320 OR position('@' IN p_email)<2) THEN
  RAISE EXCEPTION 'Invalid email' USING ERRCODE='22023'; END IF;
 IF p_expires IS NULL OR p_expires <= now() OR p_expires > now() + interval '30 days' THEN
  RAISE EXCEPTION 'An invitation expires within 30 days' USING ERRCODE='22023'; END IF;
 IF p_max_uses IS NULL OR p_max_uses NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid use limit' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.check_invitation_request(text,text,text,timestamptz,integer) FROM PUBLIC;

CREATE FUNCTION sophia.create_room_invitation(p_project uuid, p_id uuid, p_request jsonb, p_token_sha256 bytea, p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); prior sophia.room_invitations;
 k text:=p_request->>'kind'; rl text:=p_request->>'role'; em text:=lower(p_request->>'email');
 ses uuid:=(p_request->>'sessionId')::uuid; exp timestamptz:=(p_request->>'expiresAt')::timestamptz;
 uses_max integer:=(p_request->>'maxUses')::integer;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF k='member' AND NOT sophia.is_admin(p_project) THEN RAISE EXCEPTION 'Only a project admin can invite members' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 PERFORM sophia.check_invitation_request(k,rl,em,exp,uses_max);
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO prior FROM sophia.room_invitations WHERE created_by=a AND creation_key=p_key;
 IF FOUND THEN
  IF prior.project_id<>p_project OR prior.kind<>k OR prior.member_role IS DISTINCT FROM rl OR prior.email IS DISTINCT FROM em
   OR prior.session_id IS DISTINCT FROM ses OR prior.max_uses<>uses_max THEN
   RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.id;
 END IF;
 IF ses IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.room_sessions WHERE id=ses AND project_id=p_project AND canceled_at IS NULL) THEN
  RAISE EXCEPTION 'Session not found' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.room_invitations(project_id,id,room_id,session_id,kind,member_role,email,inviter_name,token_sha256,max_uses,expires_at,created_by,creation_key)
 SELECT p_project,p_id,r.id,ses,k,rl,em,left(p_request->>'inviterName',320),p_token_sha256,uses_max,exp,a,p_key
   FROM sophia.room_state r WHERE r.project_id=p_project;
 PERFORM sophia.emit_project_event(p_project,'room.invitation_created','room_invitation',p_id,1,'room.invitation');
 RETURN p_id;
END $$;

-- Who may manage an invitation: editors for guest invitations, admins for member invitations.
CREATE FUNCTION sophia.lock_managed_invitation(p_invitation uuid) RETURNS sophia.room_invitations LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.room_invitations;
BEGIN
 SELECT * INTO i FROM sophia.room_invitations WHERE id=p_invitation;
 IF NOT FOUND OR NOT sophia.can_edit(i.project_id) OR (i.kind='member' AND NOT sophia.is_admin(i.project_id)) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=i.project_id FOR UPDATE;
 SELECT * INTO i FROM sophia.room_invitations WHERE id=p_invitation FOR UPDATE;
 RETURN i;
END $$;
REVOKE ALL ON FUNCTION sophia.lock_managed_invitation(uuid) FROM PUBLIC;

-- A new link for the same invitation: the old link stops working. Compare-and-set on the version.
CREATE FUNCTION sophia.reissue_room_invitation(p_invitation uuid, p_expected_version integer, p_token_sha256 bytea)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.room_invitations:=sophia.lock_managed_invitation(p_invitation);
BEGIN
 IF i.token_version<>p_expected_version THEN RAISE EXCEPTION 'Stale invitation version' USING ERRCODE='40001'; END IF;
 IF i.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'The invitation was revoked' USING ERRCODE='40001'; END IF;
 UPDATE sophia.room_invitations SET token_sha256=p_token_sha256, token_version=token_version+1, email_status='none'
  WHERE id=p_invitation;
 PERFORM sophia.emit_project_event(i.project_id,'room.invitation_reissued','room_invitation',p_invitation,i.token_version+1,'room.invitation');
 RETURN i.token_version+1;
END $$;

CREATE FUNCTION sophia.revoke_room_invitation(p_invitation uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.room_invitations:=sophia.lock_managed_invitation(p_invitation);
BEGIN
 IF i.revoked_at IS NOT NULL THEN RETURN; END IF;
 UPDATE sophia.room_invitations SET revoked_at=now() WHERE id=p_invitation;
 PERFORM sophia.emit_project_event(i.project_id,'room.invitation_revoked','room_invitation',p_invitation,i.token_version,'room.invitation_revoked');
END $$;

-- What the API recorded after trying to email the current link.
CREATE FUNCTION sophia.record_invitation_email(p_invitation uuid, p_version integer, p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.room_invitations:=sophia.lock_managed_invitation(p_invitation);
BEGIN
 IF p_status NOT IN ('sent','failed','not_configured') THEN RAISE EXCEPTION 'Invalid email status' USING ERRCODE='22023'; END IF;
 UPDATE sophia.room_invitations SET email_status=p_status WHERE id=i.id AND token_version=p_version;
END $$;

-- Anyone holding the link may see where it leads and whether it is still open (no actor needed).
CREATE FUNCTION sophia.preview_room_invitation(p_token_sha256 bytea) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.room_invitations; t text; s sophia.room_sessions;
BEGIN
 SELECT * INTO i FROM sophia.room_invitations WHERE token_sha256=p_token_sha256;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE='22023'; END IF;
 SELECT title INTO t FROM sophia.projects WHERE id=i.project_id;
 SELECT * INTO s FROM sophia.room_sessions WHERE id=i.session_id AND canceled_at IS NULL;
 RETURN jsonb_build_object('projectTitle',t,'inviterName',i.inviter_name,'kind',i.kind,'role',i.member_role,'email',i.email,
  'expiresAt',i.expires_at,
  'session',CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id',s.id,'title',s.title,'startsAt',s.starts_at,
   'endsAt',s.ends_at,'timeZone',s.time_zone) END,
  'state',CASE WHEN i.revoked_at IS NOT NULL THEN 'revoked' WHEN i.expires_at<=now() THEN 'expired'
   WHEN i.uses>=i.max_uses THEN 'used_up' ELSE 'open' END);
END $$;

-- A guest asks to come in. A member who knocks is admitted at once; a denied guest stays denied.
CREATE FUNCTION sophia.knock_room(p_token_sha256 bytea, p_display_name text) RETURNS jsonb LANGUAGE plpgsql
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
  IF e.status IN ('denied','waiting','admitted') THEN RETURN sophia.lobby_entry_json(e); END IF;
  UPDATE sophia.room_lobby SET status='waiting', display_name=nm, requested_at=now(), decided_by=NULL, decided_at=NULL,
   revision=revision+1 WHERE id=e.id RETURNING * INTO e;
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

-- The guest's own entry, for the waiting screen.
CREATE FUNCTION sophia.read_lobby_entry(p_entry uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.room_lobby;
BEGIN
 SELECT * INTO e FROM sophia.room_lobby WHERE id=p_entry AND actor_id=sophia.actor_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'Lobby entry not found' USING ERRCODE='22023'; END IF;
 RETURN sophia.lobby_entry_json(e);
END $$;

-- Editors and admins admit or deny. Denying someone already admitted takes them out of the room.
CREATE FUNCTION sophia.decide_lobby_entry(p_entry uuid, p_decision text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE p uuid; e sophia.room_lobby; next_status text;
BEGIN
 SELECT project_id INTO p FROM sophia.room_lobby WHERE id=p_entry;
 IF p IS NULL OR NOT sophia.can_edit(p) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 next_status:=CASE p_decision WHEN 'admit' THEN 'admitted' WHEN 'deny' THEN 'denied' END;
 IF next_status IS NULL THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 SELECT * INTO e FROM sophia.room_lobby WHERE id=p_entry FOR UPDATE;
 IF e.status=next_status THEN RETURN sophia.lobby_entry_json(e); END IF;
 UPDATE sophia.room_lobby SET status=next_status, decided_by=sophia.actor_id(), decided_at=now(), revision=revision+1
  WHERE id=p_entry RETURNING * INTO e;
 PERFORM sophia.emit_project_event(p,'room.lobby_changed','room_lobby',e.id,e.revision,
  CASE next_status WHEN 'admitted' THEN 'room.lobby_admit' ELSE 'room.lobby_deny' END);
 RETURN sophia.lobby_entry_json(e);
END $$;

-- An admitted guest may join the room's call: the room and the name to show.
CREATE FUNCTION sophia.authorize_guest_join(p_entry uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.room_lobby;
BEGIN
 SELECT * INTO e FROM sophia.room_lobby WHERE id=p_entry AND actor_id=sophia.actor_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'Lobby entry not found' USING ERRCODE='22023'; END IF;
 IF e.status<>'admitted' THEN RAISE EXCEPTION 'Not admitted to the room' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('roomId',e.room_id,'displayName',e.display_name);
END $$;

-- A member invitation, accepted by the person it was sent to, adds them to the project (the audience
-- changes, so the audience revision moves). Accepting again as a member changes nothing.
CREATE FUNCTION sophia.accept_room_invitation(p_token_sha256 bytea, p_email text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); i sophia.room_invitations;
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
  ON CONFLICT (project_id,actor_id) DO UPDATE SET active=true, role=EXCLUDED.role, revision=pm.revision+1;
 UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=i.project_id;
 UPDATE sophia.room_invitations SET uses=uses+1 WHERE id=i.id;
 PERFORM sophia.emit_project_event(i.project_id,'project.member_joined','project_member',a,1,'project.member');
 RETURN jsonb_build_object('projectId',i.project_id);
END $$;

REVOKE ALL ON FUNCTION
 sophia.schedule_room_session(uuid,text,timestamptz,timestamptz,text,text), sophia.cancel_room_session(uuid),
 sophia.create_room_invitation(uuid,uuid,jsonb,bytea,text), sophia.reissue_room_invitation(uuid,integer,bytea),
 sophia.revoke_room_invitation(uuid), sophia.record_invitation_email(uuid,integer,text),
 sophia.preview_room_invitation(bytea), sophia.knock_room(bytea,text), sophia.read_lobby_entry(uuid),
 sophia.decide_lobby_entry(uuid,text), sophia.authorize_guest_join(uuid), sophia.accept_room_invitation(bytea,text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
 sophia.schedule_room_session(uuid,text,timestamptz,timestamptz,text,text), sophia.cancel_room_session(uuid),
 sophia.create_room_invitation(uuid,uuid,jsonb,bytea,text), sophia.reissue_room_invitation(uuid,integer,bytea),
 sophia.revoke_room_invitation(uuid), sophia.record_invitation_email(uuid,integer,text),
 sophia.preview_room_invitation(bytea), sophia.knock_room(bytea,text), sophia.read_lobby_entry(uuid),
 sophia.decide_lobby_entry(uuid,text), sophia.authorize_guest_join(uuid), sophia.accept_room_invitation(bytea,text)
TO sophia_api;
COMMIT;
