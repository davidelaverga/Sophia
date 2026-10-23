-- A project's activity, for its admins (docs/plans/project-activity.md): who did what, on whom, and when, read from
-- the project's events, which keep their actor (0001). Two gaps are closed first: creating a project now emits
-- project.created (create_project, 0047, replaced: the receipt's cursor is that event's), and an admin's act on a member
-- in the call (A24) is recorded as room.host_muted or room.host_removed (record_host_act), where before nothing was.
-- The activity lists people's acts only, never a chat message's content or Sophia's work, with codes and names, never
-- text. 0001–0056 are not edited.
BEGIN;

CREATE OR REPLACE FUNCTION sophia.create_project(p_title text, p_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); p uuid:=gen_random_uuid(); semantic jsonb; prior sophia.project_creations; receipt_value jsonb;
 cursor_value bigint;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF p_title IS NULL OR length(p_title) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Invalid title' USING ERRCODE='22023'; END IF;
 semantic:=jsonb_build_object('title',p_title);
 -- Claim the key. A concurrent duplicate blocks on the primary key until the first transaction
 -- ends: after a commit it finds the receipt, after a rollback it claims the key itself.
 INSERT INTO sophia.project_creations(actor_id,idempotency_key,semantic_request) VALUES(a,p_key,semantic)
  ON CONFLICT (actor_id,idempotency_key) DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO prior FROM sophia.project_creations WHERE actor_id=a AND idempotency_key=p_key;
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 -- A new creation only: a replay above answered what was admitted then (the claim rolls back with the refusal).
 IF btrim(p_title)='' THEN RAISE EXCEPTION 'A project needs a title' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.projects(id,title,created_by) VALUES(p,p_title,a);
 INSERT INTO sophia.project_members(project_id,actor_id,role) VALUES(p,a,'admin');
 INSERT INTO sophia.project_revisions(project_id,revision,frame,accepted_by) VALUES(p,1,'{}',a);
 -- Its first event: who made it, and when.
 cursor_value:=sophia.emit_project_event(p,'project.created','project',p,1,'project.created');
 receipt_value:=jsonb_build_object('projectId',p,'cursor',cursor_value::text);
 UPDATE sophia.project_creations SET project_id=p, receipt=receipt_value WHERE actor_id=a AND idempotency_key=p_key;
 RETURN receipt_value;
END $$;

-- An admin's act on a member in the call, recorded once the room server has done it (A24): mute or remove.
CREATE FUNCTION sophia.record_host_act(p_project uuid, p_target uuid, p_act text) RETURNS bigint LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); m sophia.project_members;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 IF p_act IS NULL OR p_act NOT IN ('mute','remove') THEN RAISE EXCEPTION 'Unknown act' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.is_admin(p_project) THEN RAISE EXCEPTION 'Only an admin acts on someone in the call' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM sophia.project_members WHERE project_id=p_project AND actor_id=p_target AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not a member of the project' USING ERRCODE='22023'; END IF;
 RETURN sophia.emit_project_event(p_project, CASE p_act WHEN 'mute' THEN 'room.host_muted' ELSE 'room.host_removed' END,
  'project_member', p_target, m.revision, CASE p_act WHEN 'mute' THEN 'room.host_muted' ELSE 'room.host_removed' END);
END $$;

-- Who did what, for the project's admins: people's acts, newest first, a page before a sequence, each with its
-- actor's name and, for an act on a member, that member's, as the room keeps them (0050).
CREATE FUNCTION sophia.project_activity(p_project uuid, p_before bigint, p_limit integer)
RETURNS TABLE(sequence bigint, occurred_at timestamptz, type text, summary_code text, actor_id uuid, actor_name text,
 target_id uuid, target_name text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
#variable_conflict use_column
BEGIN
 IF sophia.actor_id() IS NULL OR NOT sophia.is_admin(p_project) THEN
  RAISE EXCEPTION 'Only an admin reads the project''s activity' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 51 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 RETURN QUERY
 SELECT e.sequence, e.occurred_at, e.type, e.summary_code, e.actor_id, an.name,
        CASE WHEN e.entity_type='project_member' THEN e.entity_id END, tn.name
   FROM sophia.project_events e
   LEFT JOIN sophia.room_names an ON an.project_id=e.project_id AND an.actor_id=e.actor_id
   LEFT JOIN sophia.room_names tn ON e.entity_type='project_member' AND tn.project_id=e.project_id AND tn.actor_id=e.entity_id
  WHERE e.project_id=p_project AND e.actor_id IS NOT NULL
    AND (p_before IS NULL OR e.sequence<p_before)
    AND (e.type LIKE 'project.%' OR e.type LIKE 'room.invitation_%' OR e.type LIKE 'room.session_%'
      OR e.type LIKE 'room.host_%' OR e.type='room.lobby_changed' OR e.type LIKE 'goal.%' OR e.type LIKE 'mission.%'
      OR e.type LIKE 'personal.note_%' OR e.type IN ('command.admitted','decision.resolved','work.withdrawn'))
  ORDER BY e.sequence DESC LIMIT p_limit;
END $$;

REVOKE ALL ON FUNCTION sophia.record_host_act(uuid,uuid,text), sophia.project_activity(uuid,bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.record_host_act(uuid,uuid,text), sophia.project_activity(uuid,bigint,integer) TO sophia_api;

COMMIT;
