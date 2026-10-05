// What a member reads of an HTML design (SDD-01, amendment A12): a design task's progress (the version it designs, its
// state, each candidate and how its review went), and what became of the HTML a research task was asked for. Read
// under the member's own policies (0038 members_read), inside withActor(..., 'read').
import type pg from 'pg'
import type { DesignProgress, ResearchProgress } from '@sophia/contracts'

interface DesignRow {
  research_job_id: string
  artifact_id: string
  base_version_id: string
  base_version_number: number | null
  state: DesignProgress['state']
  reason: string | null
  targets: Array<DesignProgress['targets'][number]>
  max_repairs: number
  published_version_id: string | null
  revisions: string
  renders: string
  candidates: DesignProgress['candidates'] | null
}

/** A design task's progress; null when the task is not a design. */
export async function readDesignProgress(
  c: pg.PoolClient,
  projectId: string,
  taskId: string,
): Promise<DesignProgress | null> {
  const { rows } = await c.query<DesignRow>(
    `SELECT t.research_job_id, t.artifact_id, t.base_version_id, v.version_number AS base_version_number, t.state, t.reason,
            t.targets, t.max_repairs, t.published_version_id,
            (SELECT count(*) FROM sophia.design_sources d WHERE d.project_id = t.project_id AND d.design_job_id = t.job_id) AS revisions,
            (SELECT count(*) FROM sophia.render_jobs r WHERE r.project_id = t.project_id AND r.parent_job_id = t.job_id) AS renders,
            (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('candidateId', c.id, 'round', c.round, 'state', c.state,
                'reviewState', c.review_state)) ORDER BY c.round)
               FROM sophia.design_candidates c WHERE c.project_id = t.project_id AND c.design_job_id = t.job_id) AS candidates
       FROM sophia.design_tasks t
       LEFT JOIN sophia.artifact_versions v ON v.project_id = t.project_id AND v.id = t.base_version_id
      WHERE t.project_id = $1 AND t.job_id = $2`,
    [projectId, taskId],
  )
  const r = rows[0]
  if (!r) return null
  return {
    researchTaskId: r.research_job_id,
    artifactId: r.artifact_id,
    baseVersionId: r.base_version_id,
    ...(r.base_version_number === null ? {} : { baseVersionNumber: r.base_version_number }),
    state: r.state,
    ...(r.reason === null ? {} : { reason: r.reason }),
    targets: r.targets,
    revisions: Number(r.revisions),
    renders: Number(r.renders),
    candidates: r.candidates ?? [],
    maxRepairs: r.max_repairs,
    ...(r.published_version_id === null ? {} : { publishedVersionId: r.published_version_id }),
  }
}

interface HtmlRow {
  design_state: NonNullable<ResearchProgress['html']>['state'] | null
  design_reason: string | null
  design_job_id: string | null
}

/** What became of the HTML a research task was asked for; null when none was. */
export async function readResearchHtml(
  c: pg.PoolClient,
  projectId: string,
  taskId: string,
): Promise<NonNullable<ResearchProgress['html']> | null> {
  const { rows } = await c.query<HtmlRow>(
    `SELECT coalesce(t.design_state, 'requested') AS design_state, t.design_reason, t.design_job_id
       FROM sophia.research_tasks t WHERE t.project_id = $1 AND t.job_id = $2 AND t.design_request IS NOT NULL`,
    [projectId, taskId],
  )
  const r = rows[0]
  if (!r?.design_state) return null
  return {
    state: r.design_state,
    ...(r.design_reason === null ? {} : { reason: r.design_reason }),
    ...(r.design_job_id === null ? {} : { designTaskId: r.design_job_id }),
  }
}
