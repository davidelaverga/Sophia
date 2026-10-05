// What a member reads of an HTML design (SDD-01, amendment A12): a design task's progress (the version it designs, its
// state, each candidate and how its review went, its mode, an edit's scope, and its page's sections), and what became
// of the HTML a research task was asked for. Read under the member's own policies (0038 members_read), inside
// withActor(..., 'read').
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
  mode: NonNullable<DesignProgress['mode']>
  scope: NonNullable<DesignProgress['scope']> | null
  sections: string[] | null
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
               FROM sophia.design_candidates c WHERE c.project_id = t.project_id AND c.design_job_id = t.job_id) AS candidates,
            t.mode, CASE WHEN t.mode = 'edit' THEN t.scope END AS scope,
            (SELECT jsonb_agg(s->>'id' ORDER BY n) FROM sophia.design_sources d, jsonb_array_elements(d.sections) WITH ORDINALITY q(s, n)
              WHERE d.project_id = t.project_id AND d.design_job_id = t.job_id
                AND d.seq = (SELECT max(seq) FROM sophia.design_sources d2 WHERE d2.project_id = t.project_id AND d2.design_job_id = t.job_id)) AS sections
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
    mode: r.mode,
    ...(r.scope === null ? {} : { scope: r.scope }),
    ...(r.sections === null ? {} : { sections: r.sections }),
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

/** The designed page of the current version of the report a task wrote or designed (guide v1.3, revise_html_page). */
export interface HtmlPage {
  readonly taskId: string
  readonly versionId: string
  readonly versionNumber: number
  readonly reviewState: 'reviewed' | 'self_review_only' | 'review_unresolved'
  /** The page's section ids in page order: what an edit can name. */
  readonly sections: readonly string[]
  /** A design of the current version is under way (a page cannot be edited twice at once). */
  readonly designing: boolean
}

interface PageRow {
  task_id: string
  version_id: string
  version_number: number
  review_state: HtmlPage['reviewState']
  sections: string[] | null
  designing: boolean
}

/** For each task that wrote or designed a report whose current version has a designed page, that page. */
export async function readHtmlPages(
  c: pg.PoolClient,
  projectId: string,
  taskIds: readonly string[],
): Promise<HtmlPage[]> {
  if (taskIds.length === 0) return []
  const { rows } = await c.query<PageRow>(
    `SELECT j.id AS task_id, v.id AS version_id, v.version_number, r.review_state,
            (SELECT jsonb_agg(s->>'id' ORDER BY n) FROM jsonb_array_elements(d.sections) WITH ORDINALITY q(s, n)) AS sections,
            EXISTS(SELECT 1 FROM sophia.design_tasks t WHERE t.project_id = v.project_id AND t.base_version_id = v.id
                     AND t.state IN ('designing', 'reviewing')) AS designing
       FROM sophia.jobs j
       JOIN sophia.artifacts a ON a.project_id = j.project_id AND a.id = j.artifact_id
       JOIN sophia.artifact_versions v ON v.project_id = a.project_id AND v.id = a.stable_version_id
       JOIN sophia.artifact_renditions r ON r.project_id = v.project_id AND r.artifact_version_id = v.id AND r.format = 'html'
       JOIN sophia.design_candidates c ON c.project_id = r.project_id AND c.id = r.candidate_id
       JOIN sophia.design_sources d ON d.project_id = c.project_id AND d.id = c.source_id
      WHERE j.project_id = $1 AND j.id = ANY($2::uuid[]) AND j.kind IN ('research', 'design')`,
    [projectId, taskIds],
  )
  return rows.map((r) => ({
    taskId: r.task_id,
    versionId: r.version_id,
    versionNumber: r.version_number,
    reviewState: r.review_state,
    sections: r.sections ?? [],
    designing: r.designing,
  }))
}
