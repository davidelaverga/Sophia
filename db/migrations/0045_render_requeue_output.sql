-- SDD-01 (Codex's automatic review of 1acb1efa, P1): a render queued again after its lease ran out starts with no
-- recorded output. renderer_record_output records a PDF's output under the job's lease; a runner that lost the
-- upload's answer could not settle it, and render_sweep queued the job again keeping output_source_id, so every later
-- claim's renderer_output_slot refused its upload ("The render already has its output") until the job failed as
-- renderer_lost, its render done.
-- * render_sweep, replaced: a running render whose lease ran out and is queued again (claims below 3) forgets what its
--   lost lease recorded: a PDF's output, as a Hold's requeue does (renderer_settle, 0039), and a capture job's
--   captures, which capture_outputs_match counts all of (a later run naming its tiles otherwise could never settle).
--   The next claim renders and records afresh, under new keys. A render that fails as renderer_lost keeps what it
--   had; a settled one is never touched.
-- * The forgotten output's source object stays as recorded. Every reader of a source object looks it up by an id a job,
--   version or citation holds, and none holds this one, so nothing presents it; its bytes are never rewritten (0044).
-- * Unchanged: the Stop and newer-version cancellations above it, the three-claim limit, the claim's lease, and every
--   check of settlement (the recorded output's hash, the package, Hold and Stop).
-- 0001-0044 are not edited. Additive: the same signature and grants; the previous API and worker call it unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION sophia.render_sweep() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE v_projects uuid[]; v_jobs uuid[];
BEGIN
 UPDATE sophia.jobs j SET state='cancelled', lease_until=NULL,
  reason=CASE WHEN g.status IN ('stopping','stopped') THEN 'stopped: the work was stopped' ELSE 'cancelled: the research task ended without it' END
  FROM sophia.render_jobs r, sophia.goals g, sophia.jobs p
  WHERE j.kind='render' AND j.state IN ('pending','running') AND r.project_id=j.project_id AND r.job_id=j.id
   AND g.project_id=r.project_id AND g.id=r.goal_id AND p.project_id=r.project_id AND p.id=r.parent_job_id
   AND (g.status IN ('stopping','stopped') OR p.state IN ('failed','cancelled'));
 UPDATE sophia.jobs j SET state='cancelled', lease_until=NULL, reason='cancelled: a newer version of the report was published'
  FROM sophia.render_jobs r, sophia.artifact_versions v, sophia.artifacts a
  WHERE j.kind='render' AND j.state IN ('pending','running') AND r.project_id=j.project_id AND r.job_id=j.id AND r.kind='rendition'
   AND v.project_id=r.project_id AND v.id=r.base_version_id AND a.project_id=v.project_id AND a.id=v.artifact_id
   AND a.stable_version_id IS DISTINCT FROM v.id;
 -- The jobs queued again are taken first; what their lost leases recorded is forgotten in the statements after, each
 -- reading afresh: a capture or output that a transaction this one waited on for the job's row recorded is seen and
 -- goes too (one statement reads as it began, so it would miss it, the lease still queued again).
 WITH lost AS (
  UPDATE sophia.jobs j SET lease_until=NULL,
   state=CASE WHEN r.claims<3 THEN 'pending' ELSE 'failed' END,
   reason=CASE WHEN r.claims<3 THEN j.reason ELSE 'renderer_lost: the render runner stopped answering' END
   FROM sophia.render_jobs r WHERE j.kind='render' AND j.state='running' AND j.lease_until<now()
    AND r.project_id=j.project_id AND r.job_id=j.id
   RETURNING j.project_id, j.id, j.state)
 SELECT coalesce(array_agg(lost.project_id),'{}'), coalesce(array_agg(lost.id),'{}') INTO v_projects, v_jobs
  FROM lost WHERE lost.state='pending';
 DELETE FROM sophia.render_job_outputs o USING unnest(v_projects,v_jobs) AS q(project_id,job_id)
  WHERE o.project_id=q.project_id AND o.job_id=q.job_id;
 -- Only a row holding an output is written (and locked): a Stop's deferred trigger (research_rendition_stopped, 0032)
 -- locks a rendition's render_jobs row before its job, the opposite order to this, so the sweep takes no render_jobs row
 -- it need not change.
 UPDATE sophia.render_jobs r SET output_source_id=NULL FROM unnest(v_projects,v_jobs) AS q(project_id,job_id)
  WHERE r.project_id=q.project_id AND r.job_id=q.job_id AND r.receipt IS NULL AND r.output_source_id IS NOT NULL;
END $$;

COMMIT;
