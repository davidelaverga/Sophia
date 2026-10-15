-- A goal has an owner and a target date (docs/plans/goal-owner-date.md), kept beside it: the goal, its revision and its
-- authority don't move, so the mission's commands and the runtime see nothing new. Editors and admins set them,
-- compare-and-set on their own revision; the owner is an active member; the date a calendar date in 2000–2100. Each
-- change emits goal.target_set. A project's members can read who its members are, with the name the room keeps for
-- each (0050): 0050 kept a name for its member's own voice writes only; a member's name now shows to the project's other
-- members, as a message's author name already does (A17). 0001–0052 are not edited.
BEGIN;

CREATE TABLE sophia.goal_targets (
 project_id uuid NOT NULL, goal_id uuid NOT NULL, owner_id uuid,
 target_date date CHECK(target_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
 revision bigint NOT NULL CHECK(revision>0), set_by uuid NOT NULL, set_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,goal_id), FOREIGN KEY(project_id,goal_id) REFERENCES sophia.goals(project_id,id)
);
ALTER TABLE sophia.goal_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.goal_targets FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
GRANT SELECT ON sophia.goal_targets TO sophia_api;

CREATE FUNCTION sophia.set_goal_target(p_project uuid, p_goal uuid, p_owner uuid, p_date date, p_expected bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); prior sophia.goal_targets; revision_value bigint; cursor_value bigint;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 -- Held first: the change and its event are one step in the project's sequence.
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Only editors and admins set a goal''s owner and date' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.goals WHERE project_id=p_project AND id=p_goal) THEN
  RAISE EXCEPTION 'Goal not found' USING ERRCODE='22023'; END IF;
 IF p_owner IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.project_members WHERE project_id=p_project AND actor_id=p_owner AND active) THEN
  RAISE EXCEPTION 'The owner must be a member of the project' USING ERRCODE='22023'; END IF;
 IF p_date IS NOT NULL AND p_date NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' THEN
  RAISE EXCEPTION 'A target date between 2000 and 2100' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM sophia.goal_targets WHERE project_id=p_project AND goal_id=p_goal FOR UPDATE;
 IF coalesce(prior.revision,0)<>p_expected THEN RAISE EXCEPTION 'Stale goal target' USING ERRCODE='40001'; END IF;
 revision_value:=p_expected+1;
 INSERT INTO sophia.goal_targets(project_id,goal_id,owner_id,target_date,revision,set_by) VALUES(p_project,p_goal,p_owner,p_date,revision_value,a)
  ON CONFLICT (project_id,goal_id) DO UPDATE SET owner_id=EXCLUDED.owner_id, target_date=EXCLUDED.target_date,
   revision=EXCLUDED.revision, set_by=EXCLUDED.set_by, set_at=now();
 cursor_value:=sophia.emit_project_event(p_project,'goal.target_set','goal',p_goal,revision_value,'goal.target');
 RETURN jsonb_build_object('goalId',p_goal,'ownerId',p_owner,'targetDate',p_date::text,'revision',revision_value,
  'cursor',cursor_value::text);
END $$;

-- Who a project's members are, for its members: each active member's role, and the name the room keeps for them.
CREATE FUNCTION sophia.project_members_named(p_project uuid)
RETURNS TABLE(actor_id uuid, role text, name text) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT m.actor_id, m.role, n.name FROM sophia.project_members m
   LEFT JOIN sophia.room_names n ON n.project_id=m.project_id AND n.actor_id=m.actor_id
  WHERE m.project_id=p_project AND m.active AND sophia.is_member(p_project)
  ORDER BY CASE m.role WHEN 'admin' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, n.name NULLS LAST, m.actor_id $$;

REVOKE ALL ON FUNCTION sophia.set_goal_target(uuid,uuid,uuid,date,bigint), sophia.project_members_named(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.set_goal_target(uuid,uuid,uuid,date,bigint), sophia.project_members_named(uuid) TO sophia_api;

COMMIT;
