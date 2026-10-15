-- A member leaves a project (docs/plans/project-leave.md): someone invited could never step out; the project stayed on
-- their Work list for good. Any active member may leave, except the last active admin, who would leave the project with
-- no one to invite or rename. Idempotent per actor and key: a retry after a lost reply answers the same receipt, though
-- the person is no longer a member. The membership goes inactive (its revision bumped), as accepting an invitation sets
-- it active again (0010); the audience's revision moves, and project.member_left is emitted. 0001–0051 are not edited.
BEGIN;

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
 cursor_value:=sophia.emit_project_event(p_project,'project.member_left','project_member',a,m.revision+1,'project.member');
 receipt_value:=jsonb_build_object('projectId',p_project,'cursor',cursor_value::text);
 INSERT INTO sophia.project_departures(actor_id,idempotency_key,project_id,receipt) VALUES(a,p_key,p_project,receipt_value);
 RETURN receipt_value;
END $$;
REVOKE ALL ON FUNCTION sophia.leave_project(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.leave_project(uuid,text) TO sophia_api;

COMMIT;
