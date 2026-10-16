-- The project's activity names people right (docs/plans/activity-followups.md, Codex P2s on #355): nobody is their own
-- target (joining and leaving carry the member who acted as their entity); a guest is named by what they said at the
-- door, as their knock has no room name (0050); a decision on a guest names the guest as its target. project_activity
-- (0057) is replaced with the same signature; 0001–0060 are not edited.
BEGIN;

-- A person as the project names them: their name in the room (0050), else the name they gave at its door (0010).
CREATE FUNCTION sophia.activity_name(p_project uuid, p_actor uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT COALESCE(
  (SELECT n.name FROM sophia.room_names n WHERE n.project_id=p_project AND n.actor_id=p_actor),
  (SELECT l.display_name FROM sophia.room_lobby l WHERE l.project_id=p_project AND l.actor_id=p_actor
    ORDER BY l.requested_at DESC LIMIT 1))
$$;

CREATE OR REPLACE FUNCTION sophia.project_activity(p_project uuid, p_before bigint, p_limit integer)
RETURNS TABLE(sequence bigint, occurred_at timestamptz, type text, summary_code text, actor_id uuid, actor_name text,
 target_id uuid, target_name text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
#variable_conflict use_column
BEGIN
 IF sophia.actor_id() IS NULL OR NOT sophia.is_admin(p_project) THEN
  RAISE EXCEPTION 'Only an admin reads the project''s activity' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 51 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 RETURN QUERY
 SELECT e.sequence, e.occurred_at, e.type, e.summary_code, e.actor_id, sophia.activity_name(e.project_id, e.actor_id),
        t.id, sophia.activity_name(e.project_id, t.id)
   FROM sophia.project_events e
   LEFT JOIN sophia.room_lobby l ON e.entity_type='room_lobby' AND l.project_id=e.project_id AND l.id=e.entity_id
   -- The member or guest acted on, never the actor themself.
   CROSS JOIN LATERAL (SELECT NULLIF(CASE e.entity_type WHEN 'project_member' THEN e.entity_id
     WHEN 'room_lobby' THEN l.actor_id END, e.actor_id) AS id) t
  WHERE e.project_id=p_project AND e.actor_id IS NOT NULL
    AND (p_before IS NULL OR e.sequence<p_before)
    AND (e.type LIKE 'project.%' OR e.type LIKE 'room.invitation_%' OR e.type LIKE 'room.session_%'
      OR e.type LIKE 'room.host_%' OR e.type='room.lobby_changed' OR e.type LIKE 'goal.%' OR e.type LIKE 'mission.%'
      OR e.type LIKE 'personal.note_%' OR e.type IN ('command.admitted','decision.resolved','work.withdrawn'))
  ORDER BY e.sequence DESC LIMIT p_limit;
END $$;

REVOKE ALL ON FUNCTION sophia.activity_name(uuid,uuid) FROM PUBLIC;

COMMIT;
