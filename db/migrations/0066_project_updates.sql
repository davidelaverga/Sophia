-- What changed in a project since a member last looked (A34, docs/plans/project-updates.md, #365 section 2, #105
-- A13's «since»). Built from the project's own events and its current records, never from a model:
-- - project_seen keeps each member's seen sequence in each project. It only moves forward, and only through
--   markProjectSeen, to a sequence the member was shown: reading Updates, polling it, or opening a line acknowledges
--   nothing. A required decision (the work board's, A15's Needs) is never touched by it.
-- - project_updates reads a bounded window: the events after the member's mark, up to an upper bound the server pins
--   (toSequence: at most 500 events on). Events after it stay new. Each line is a current record an event in the
--   window names: a decision accepted, a note kept (still current, its text still readable), a proposal still open, a
--   report version made, a task that moved. What has since been withdrawn, superseded or made unreadable is not listed,
--   so it is in no count. An event private to someone else (visibility_owner) is never read. People are named by
--   actor_label (0062): their display name, never an address.
-- 0001–0065 are not edited.
BEGIN;

CREATE TABLE sophia.project_seen (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), actor_id uuid NOT NULL,
 sequence bigint NOT NULL CHECK(sequence>=0), seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,actor_id)
);
ALTER TABLE sophia.project_seen ENABLE ROW LEVEL SECURITY;

-- readProjectUpdates: the window after the member's mark, up to toSequence, as current records; 42501 for anyone who
-- isn't an active member. `more` says events lie after toSequence (the next window, once this one is seen).
CREATE FUNCTION sophia.project_updates(p_project uuid, p_limit integer DEFAULT 500) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); seen_value bigint; latest bigint; from_value bigint; to_value bigint; out jsonb;
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid window' USING ERRCODE='22023'; END IF;
 SELECT s.sequence INTO seen_value FROM sophia.project_seen s WHERE s.project_id=p_project AND s.actor_id=a;
 SELECT p.event_sequence INTO latest FROM sophia.projects p WHERE p.id=p_project;
 from_value:=coalesce(seen_value,0);
 to_value:=greatest(from_value, least(latest, from_value+p_limit));
 WITH win AS (
   SELECT e.* FROM sophia.project_events e
    WHERE e.project_id=p_project AND e.sequence>from_value AND e.sequence<=to_value
      AND (e.visibility_owner IS NULL OR e.visibility_owner=a)
 ), decided AS (
   SELECT DISTINCT ON (d.id) d.id, d.proposal->>'statement' AS statement, d.proposed_by, d.decided_by, d.decided_at
     FROM win JOIN sophia.decisions d ON d.project_id=p_project AND d.id=win.entity_id
    WHERE win.type='mission.decision_accepted' AND d.state='accepted' AND d.proposal ? 'statement'
 ), noted AS (
   SELECT DISTINCT ON (m.id) m.id, m.kind, t.body, m.authored_by, m.actor_id, m.recorded_at
     FROM win JOIN sophia.mission_entries m ON m.project_id=p_project AND m.id=win.entity_id
     JOIN sophia.source_objects s ON s.project_id=m.project_id AND s.id=m.source_id AND s.state='ready' AND s.eligible
     JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=s.id
    WHERE win.type IN ('mission.entry_recorded','mission.entry_corrected') AND m.state='current'
 ), opened AS (
   SELECT DISTINCT ON (d.id) d.id, d.proposal->>'statement' AS statement
     FROM win JOIN sophia.decisions d ON d.project_id=p_project AND d.id=win.entity_id
    WHERE win.type='mission.proposal_created' AND d.state='proposed' AND d.proposal ? 'statement'
 ), worked AS (
   SELECT DISTINCT ON (j.id) j.id, j.kind, j.state
     FROM win JOIN sophia.jobs j ON j.project_id=p_project AND j.id=win.entity_id
    WHERE win.entity_type='job' AND win.type LIKE 'native_task.%'
 ), made AS (
   SELECT DISTINCT ON (v.id) v.id, v.artifact_id, ar.title, v.version_number, v.created_at,
          (SELECT x.actor_id FROM sophia.project_events x WHERE x.project_id=p_project AND x.entity_type='job'
             AND x.entity_id=v.job_id AND x.type='native_task.admitted' ORDER BY x.sequence LIMIT 1) AS asked_by
     FROM win JOIN sophia.artifact_versions v ON v.project_id=p_project AND v.job_id=win.entity_id
     JOIN sophia.artifacts ar ON ar.project_id=v.project_id AND ar.id=v.artifact_id
     JOIN sophia.source_objects s ON s.project_id=v.project_id AND s.id=v.source_id AND s.state='ready' AND s.eligible
    WHERE win.type='native_task.result_ready' AND v.version_number IS NOT NULL
 ), people AS (
   SELECT DISTINCT x.actor FROM (
     SELECT proposed_by AS actor FROM decided UNION ALL SELECT decided_by FROM decided
     UNION ALL SELECT actor_id FROM noted UNION ALL SELECT asked_by FROM made) x
    WHERE x.actor IS NOT NULL
 )
 SELECT jsonb_build_object(
   'fromSequence', CASE WHEN seen_value IS NULL THEN NULL ELSE seen_value::text END,
   'toSequence', to_value::text,
   'more', latest>to_value,
   'decided', coalesce((SELECT jsonb_agg(jsonb_build_object('decisionId',d.id,'statement',d.statement,
       'proposedBy',d.proposed_by,'decidedBy',d.decided_by,'at',d.decided_at,'undoable',false)
       ORDER BY d.decided_at, d.id) FROM decided d),'[]'),
   'made', coalesce((SELECT jsonb_agg(jsonb_build_object('artifactId',m.artifact_id,'artifactVersionId',m.id,
       'title',m.title,'versionNumber',m.version_number,'askedBy',m.asked_by) ORDER BY m.created_at, m.id) FROM made m),'[]'),
   'noted', coalesce((SELECT jsonb_agg(jsonb_build_object('entryId',n.id,'kind',n.kind,'text',n.body,
       'authoredBy',n.authored_by,'actorId',n.actor_id,'at',n.recorded_at) ORDER BY n.recorded_at, n.id) FROM noted n),'[]'),
   'open', coalesce((SELECT jsonb_agg(jsonb_build_object('proposalId',o.id,'statement',o.statement) ORDER BY o.id)
       FROM opened o),'[]'),
   'work', coalesce((SELECT jsonb_agg(jsonb_build_object('taskId',w.id,'kind',w.kind,'state',w.state) ORDER BY w.id)
       FROM worked w),'[]'),
   'names', coalesce((SELECT jsonb_object_agg(p.actor, l.label) FROM people p
       CROSS JOIN LATERAL (SELECT sophia.actor_label(p_project, p.actor, NULL) AS label) l WHERE l.label IS NOT NULL),'{}'))
   INTO out;
 RETURN out;
END $$;
REVOKE ALL ON FUNCTION sophia.project_updates(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.project_updates(uuid,integer) TO sophia_api;

-- markProjectSeen: the member has seen the project up to p_sequence, a window's toSequence. Never past the project's
-- newest event (a mark ahead of what exists would swallow what comes next: 22023), never back: a mark already past it
-- stays. Idempotent; 42501 for anyone who isn't an active member.
CREATE FUNCTION sophia.mark_project_seen(p_project uuid, p_sequence bigint) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); latest bigint;
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT p.event_sequence INTO latest FROM sophia.projects p WHERE p.id=p_project;
 IF p_sequence IS NULL OR p_sequence<0 OR p_sequence>latest THEN
  RAISE EXCEPTION 'A seen sequence the project has reached' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.project_seen(project_id,actor_id,sequence) VALUES(p_project,a,p_sequence)
 ON CONFLICT (project_id,actor_id) DO UPDATE SET sequence=EXCLUDED.sequence, seen_at=now()
  WHERE sophia.project_seen.sequence<EXCLUDED.sequence;
END $$;
REVOKE ALL ON FUNCTION sophia.mark_project_seen(uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.mark_project_seen(uuid,bigint) TO sophia_api;

COMMIT;
