-- SMC-M03 S1 (contract amendment A11, read side): readers for research work and its reports, shipped before any
-- writer. Nothing here admits research, publishes a report or renders a PDF; it only lets the readers see such
-- records once a later release writes them (docs/progress/SMC-M03-contract-binding.md).
-- * A report is one artifacts row (format 'markdown', the authored source) with versions v1..vN. Its other
--   formats are renditions of a version (artifact_renditions), so a PDF is never a second artifact.
-- * "What it is" lives on the report and is revisioned, because members may edit it (U3). Each version carries what
--   changed and what was kept (notes written by the model), a deterministic change_facts record computed by the
--   server, and what triggered it. The notes and facts are written together at publication (S4).
-- * One task job per attempt. Render and repair jobs are children of a task job and carry no attempt or command, so
--   every existing single-row read by attempt or command (receipts, observations, capture, dispatch) still finds the
--   task job, and only it.
-- * The member task view and the bridge's result list allowlist the task kinds they can describe. A child job is
--   never a task.
-- * Usage gains the provider's cache counters. Null means not reported, never zero.
-- 0001–0020 are not edited. 0021 is reserved for #30.
BEGIN;

ALTER TABLE sophia.artifacts DROP CONSTRAINT artifacts_format_check,
 ADD CONSTRAINT artifacts_format_check CHECK(format IN ('html','pdf','pptx','ui','markdown')),
 ADD COLUMN summary text CHECK(summary IS NULL OR (length(summary) BETWEEN 1 AND 240)),
 -- Null while the description is the one the research worker wrote; a member's edit records the member.
 ADD COLUMN summary_author_id uuid,
 ADD COLUMN summary_revision bigint NOT NULL DEFAULT 1 CHECK(summary_revision>0),
 ADD COLUMN summary_updated_at timestamptz,
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE sophia.jobs ADD COLUMN parent_job_id uuid, ADD COLUMN artifact_id uuid,
 ADD CONSTRAINT jobs_parent_fk FOREIGN KEY(project_id,parent_job_id) REFERENCES sophia.jobs(project_id,id),
 ADD CONSTRAINT jobs_artifact_fk FOREIGN KEY(project_id,artifact_id) REFERENCES sophia.artifacts(project_id,id),
 ADD CONSTRAINT jobs_parent_not_self CHECK(parent_job_id IS NULL OR parent_job_id<>id),
 ADD CONSTRAINT jobs_child_has_no_attempt CHECK(parent_job_id IS NULL OR (attempt_id IS NULL AND command_id IS NULL));
CREATE UNIQUE INDEX one_task_job_per_attempt ON sophia.jobs(project_id,attempt_id) WHERE attempt_id IS NOT NULL;
CREATE INDEX jobs_children ON sophia.jobs(project_id,parent_job_id) WHERE parent_job_id IS NOT NULL;

ALTER TABLE sophia.artifact_versions
 ADD COLUMN version_number integer CHECK(version_number IS NULL OR version_number>0),
 ADD COLUMN change_note text CHECK(change_note IS NULL OR (length(change_note) BETWEEN 1 AND 200)),
 ADD COLUMN retained_note text CHECK(retained_note IS NULL OR (length(retained_note) BETWEEN 1 AND 200)),
 ADD COLUMN change_facts jsonb CHECK(change_facts IS NULL OR jsonb_typeof(change_facts)='object'),
 ADD COLUMN trigger jsonb CHECK(trigger IS NULL OR jsonb_typeof(trigger)='object'),
 ADD COLUMN job_id uuid,
 -- What the output says it could not do, in short sentences (e.g. a source that could not be read).
 ADD COLUMN limitations text[] NOT NULL DEFAULT '{}' CHECK(cardinality(limitations)<=8),
 ADD CONSTRAINT artifact_versions_job_fk FOREIGN KEY(project_id,job_id) REFERENCES sophia.jobs(project_id,id),
 ADD CONSTRAINT artifact_versions_number_once UNIQUE(project_id,artifact_id,version_number);

-- Another format of one version, e.g. the PDF of a report's Markdown. Its bytes, hash, size and type are the
-- source's (source_objects); a rendition never re-states them.
CREATE TABLE sophia.artifact_renditions (
 project_id uuid NOT NULL, artifact_version_id uuid NOT NULL,
 format text NOT NULL CHECK(format IN ('pdf')), source_id uuid NOT NULL,
 page_count integer CHECK(page_count IS NULL OR page_count>0), job_id uuid,
 limitations text[] NOT NULL DEFAULT '{}' CHECK(cardinality(limitations)<=8),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,artifact_version_id,format),
 FOREIGN KEY(project_id,artifact_version_id) REFERENCES sophia.artifact_versions(project_id,id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id),
 FOREIGN KEY(project_id,job_id) REFERENCES sophia.jobs(project_id,id)
);
ALTER TABLE sophia.artifact_renditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.artifact_renditions FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
GRANT SELECT ON sophia.artifact_renditions TO sophia_api;

ALTER TABLE sophia.usage_records ADD COLUMN cache_read_tokens bigint CHECK(cache_read_tokens IS NULL OR cache_read_tokens>=0),
 ADD COLUMN cache_write_tokens bigint CHECK(cache_write_tokens IS NULL OR cache_write_tokens>=0);

-- The task kinds a member's reader can describe. Each later kind is added here and in A11's enum together.
CREATE FUNCTION sophia.is_task_kind(p_kind text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT p_kind IN ('draft_brief','research') $$;
REVOKE ALL ON FUNCTION sophia.is_task_kind(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.is_task_kind(text) TO sophia_api, sophia_worker;

-- native_task_view (0012) for every task kind, never a child job, with the report a task writes into appended last
-- (a replaced view keeps its columns in order). Otherwise 0012's text.
CREATE OR REPLACE VIEW sophia.native_task_view WITH (security_barrier, security_invoker) AS
 SELECT j.project_id, j.id, j.kind, a.goal_id, j.attempt_id, j.command_id, c.actor_id, j.state, j.created_at, j.input_source_id,
  j.result_source_id, j.reason, c.body_source_id AS instruction_source_id,
  CASE WHEN c.state='denied' AND j.state IN ('pending','cancelled') THEN 'denied'
   WHEN g.status='holding' THEN 'holding' WHEN g.status='held' THEN 'held'
   WHEN g.status='stopping' THEN 'stopping' WHEN g.status='stopped' THEN 'stopped'
   WHEN j.state='succeeded' THEN 'result_ready' WHEN j.state='failed' THEN 'failed' WHEN j.state='outcome_unknown' THEN 'outcome_unknown'
   WHEN b.state='created' THEN 'queued' WHEN b.state='launching' THEN 'dispatched' ELSE 'running' END AS phase,
  (SELECT coalesce(array_agg(d.source_id ORDER BY d.source_id),'{}') FROM sophia.source_dependencies d JOIN sophia.contributions ct
    ON ct.project_id=d.project_id AND ct.source_id=d.source_id WHERE d.project_id=j.project_id AND d.derived_source_id=j.input_source_id) AS input_source_ids,
  j.artifact_id
 FROM sophia.jobs j JOIN sophia.work_attempts a ON a.project_id=j.project_id AND a.id=j.attempt_id
 JOIN sophia.goals g ON g.project_id=a.project_id AND g.id=a.goal_id
 JOIN sophia.commands c ON c.project_id=j.project_id AND c.id=j.command_id
 LEFT JOIN sophia.execution_bindings b ON b.project_id=a.project_id AND b.attempt_id=a.id
 WHERE sophia.is_task_kind(j.kind) AND j.parent_job_id IS NULL;

-- media_assignments (0018) listing every task kind's result with its real kind. Otherwise 0018's text. A bridge older
-- than A11 accepts only draft_brief; no research result exists until the release after the A11 bridge (plan §5).
CREATE OR REPLACE FUNCTION sophia.media_assignments() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM sophia.require_service();
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('exchangeId',e.id,'projectId',e.project_id,'roomId',e.room_id,'state',e.state,
   'pauseReason',e.pause_reason,'inputEpoch',e.input_epoch,'inputActorId',i.actor_id,'playbackEpoch',e.playback_epoch,
   'observationEpoch',e.observation_epoch,'allowVision',e.allow_vision,
   'looking',CASE WHEN e.look_identity IS NULL THEN NULL ELSE jsonb_build_object('participantIdentity',e.look_identity,'source',e.look_source) END,
   'roomRevision',r.revision,'quiesceRequestId',q.id,
   'missionRevision',pr.mission_revision,'ledgerRevision',pr.ledger_revision,'eligibilityRevision',pr.eligibility_revision,
   'results',(SELECT coalesce(jsonb_agg(jsonb_build_object('taskId',j.id,'resultRevision',j.result_revision,'kind',j.kind)
      ORDER BY src.created_at),'[]')
     FROM sophia.jobs j JOIN sophia.source_objects src ON src.project_id=j.project_id AND src.id=j.result_source_id
     WHERE j.project_id=e.project_id AND sophia.is_task_kind(j.kind) AND j.parent_job_id IS NULL AND j.state='succeeded'
      AND src.created_at>=e.opened_at
      AND NOT EXISTS(SELECT 1 FROM sophia.exchange_announcements x WHERE x.exchange_id=e.id AND x.job_id=j.id
       AND x.result_revision=j.result_revision))) ORDER BY e.room_id),'[]')
  FROM sophia.room_exchanges e JOIN sophia.room_state r ON r.id=e.room_id JOIN sophia.projects pr ON pr.id=e.project_id
  LEFT JOIN sophia.exchange_inputs i ON i.exchange_id=e.id AND i.input_epoch=e.input_epoch
  LEFT JOIN LATERAL (SELECT id FROM sophia.room_quiesce_requests q WHERE q.exchange_id=e.id AND q.acked_at IS NULL
   ORDER BY q.requested_at DESC LIMIT 1) q ON true
  WHERE e.state<>'ended');
END $$;

COMMIT;
