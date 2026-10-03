// Attributed discussion and native tasks (db/migrations/0012, contract amendment A05). Writes go through
// sophia.submit_contribution and sophia.admit_native_task, which re-check authority under the project lock;
// reads run under the member's RLS. Nothing here starts work from discussion. Where a task stands and what its report
// holds (CX-0026, CX-0027) are read from the stored records only: never from a version's notes, which the worker wrote.
import type pg from 'pg'
import type {
  Contribution,
  ContributionReceipt,
  DiscussionEntry,
  NativeTask,
  NativeTaskDetail,
  NativeTaskReceipt,
  NativeTaskRequest,
  ResearchProgress,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { onlyRow } from './rows.ts'

const iso = (value: Date | string) => new Date(value).toISOString()

/** Where a contribution came from: the composer, or an admitted utterance relayed by the media bridge. */
export type ContributionOrigin = DiscussionEntry['origin']

/** Record one contribution. Call inside withActor(..., "write"). */
export async function submitContribution(
  c: pg.PoolClient,
  projectId: string,
  idempotencyKey: string,
  body: Contribution,
  origin: ContributionOrigin = 'composer',
): Promise<ContributionReceipt> {
  const { rows } = await c.query<{ receipt: ContributionReceipt }>(
    `SELECT sophia.submit_contribution($1, $2, $3, $4) AS receipt`,
    [projectId, idempotencyKey, JSON.stringify(body), origin],
  )
  return onlyRow(rows, 'submit_contribution').receipt
}

/** Admit one native task. Call inside withActor(..., "write"). No provider I/O happens in this transaction. */
export async function admitNativeTask(
  c: pg.PoolClient,
  projectId: string,
  idempotencyKey: string,
  request: NativeTaskRequest,
): Promise<NativeTaskReceipt> {
  const { rows } = await c.query<{ receipt: NativeTaskReceipt }>(
    `SELECT sophia.admit_native_task($1, $2, $3) AS receipt`,
    [projectId, idempotencyKey, JSON.stringify(request)],
  )
  return onlyRow(rows, 'admit_native_task').receipt
}

interface DiscussionRow {
  id: string
  actor_id: string
  intent: DiscussionEntry['intent']
  origin: DiscussionEntry['origin']
  body: string
  source_id: string
  sha256: string
  created_at: Date
}

/** The latest discussion, oldest first (at most 50). Call inside withActor(..., "read"). */
export async function readDiscussion(c: pg.PoolClient, projectId: string): Promise<DiscussionEntry[]> {
  const { rows } = await c.query<DiscussionRow>(
    `SELECT * FROM (
       SELECT ct.id, ct.actor_id, ct.intent, ct.origin, t.body, s.id AS source_id, s.sha256, ct.created_at
         FROM sophia.contributions ct
         JOIN sophia.source_objects s ON s.project_id = ct.project_id AND s.id = ct.source_id
         JOIN sophia.source_texts t ON t.project_id = s.project_id AND t.source_id = s.id
        WHERE ct.project_id = $1
        ORDER BY ct.created_at DESC, ct.id DESC LIMIT 50) latest
      ORDER BY created_at, id`,
    [projectId],
  )
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    intent: r.intent,
    origin: r.origin,
    text: r.body,
    sourceId: r.source_id,
    sha256: r.sha256,
    createdAt: iso(r.created_at),
  }))
}

interface TaskRow {
  id: string
  kind: NativeTask['kind']
  goal_id: string
  attempt_id: string
  command_id: string
  actor_id: string
  state: NativeTask['state']
  phase: NativeTask['phase']
  created_at: Date
  input_source_id: string
  input_source_ids: string[]
  result_source_id: string | null
  reason: string | null
  instruction_source_id: string
  /** The report the task writes into (0022); null until it has one, and always for a brief. */
  artifact_id: string | null
}

const TASK_COLUMNS = `id, kind, goal_id, attempt_id, command_id, actor_id, state, phase, created_at, input_source_id,
  input_source_ids, result_source_id, reason, instruction_source_id, artifact_id`

/** The view lists only the kinds a reader can describe (0022 sophia.is_task_kind). Absent values are omitted (A11). */
const toTask = (r: TaskRow): NativeTask => ({
  id: r.id,
  kind: r.kind,
  goalId: r.goal_id,
  attemptId: r.attempt_id,
  commandId: r.command_id,
  actorId: r.actor_id,
  state: r.state,
  phase: r.phase,
  createdAt: iso(r.created_at),
  contextSourceId: r.input_source_id,
  inputSourceIds: r.input_source_ids,
  resultSourceId: r.result_source_id,
  reason: r.reason,
  ...(r.artifact_id === null ? {} : { artifactId: r.artifact_id }),
})

/** The latest native tasks, oldest first (at most 50). Call inside withActor(..., "read"). */
export async function readNativeTasks(c: pg.PoolClient, projectId: string): Promise<NativeTask[]> {
  const { rows } = await c.query<TaskRow>(
    `SELECT * FROM (SELECT ${TASK_COLUMNS} FROM sophia.native_task_view WHERE project_id = $1
       ORDER BY created_at DESC, id DESC LIMIT 50) latest ORDER BY created_at, id`,
    [projectId],
  )
  return rows.map(toTask)
}

interface ResultRow {
  source_id: string
  sha256: string
  body: string
  created_at: Date
  provider: string | null
  model: string | null
  input_tokens: string | null
  output_tokens: string | null
  cache_read_tokens: string | null
  cache_write_tokens: string | null
}

const tokens = (value: string | null) => (value === null ? null : Number(value))

type Result = NonNullable<NativeTaskDetail['result']>
type Output = NonNullable<Result['outputs']>[number]

interface OutputRow {
  artifact_version_id: string
  format: Output['format']
  source_id: string
  sha256: string
  byte_length: string
  limitations: string[]
}

/**
 * What a task published: every stored format of the newest published report version written by the task or one of
 * its child jobs (a rendition). The Markdown first, then the renditions by format. A newer version that is not
 * published (a draft, a repair, a rejection) never replaces it (M03-RF-0001). Empty for a brief.
 */
async function readOutputs(c: pg.PoolClient, projectId: string, taskId: string): Promise<Output[]> {
  const { rows } = await c.query<OutputRow>(
    `WITH latest AS (
       SELECT v.id, v.source_id, v.limitations FROM sophia.artifact_versions v
        WHERE v.project_id = $1 AND v.state IN ('stable', 'superseded') AND v.job_id IN (
          SELECT j.id FROM sophia.jobs j WHERE j.project_id = $1 AND (j.id = $2 OR j.parent_job_id = $2))
        ORDER BY v.version_number DESC NULLS LAST, v.created_at DESC, v.id DESC LIMIT 1)
     SELECT l.id AS artifact_version_id, 'markdown' AS format, s.id AS source_id, s.sha256, s.byte_length, l.limitations, '' AS k
       FROM latest l JOIN sophia.source_objects s ON s.project_id = $1 AND s.id = l.source_id
     UNION ALL
     SELECT l.id, r.format, s.id, s.sha256, s.byte_length, r.limitations, r.format
       FROM latest l JOIN sophia.artifact_renditions r ON r.project_id = $1 AND r.artifact_version_id = l.id
       JOIN sophia.source_objects s ON s.project_id = r.project_id AND s.id = r.source_id
     ORDER BY k`,
    [projectId, taskId],
  )
  return rows.map((r) => ({
    artifactVersionId: r.artifact_version_id,
    format: r.format,
    sourceId: r.source_id,
    sha256: r.sha256,
    byteLength: Number(r.byte_length),
    limitations: r.limitations,
  }))
}

/** The result's source and the model identity and usage of the step that produced it (a turn's call, never compaction's). */
async function readResult(c: pg.PoolClient, projectId: string, task: TaskRow): Promise<NativeTaskDetail['result']> {
  if (!task.result_source_id) return null
  const { rows } = await c.query<ResultRow>(
    `SELECT s.id AS source_id, s.sha256, t.body, s.created_at, u.provider, u.model, u.input_tokens, u.output_tokens,
            u.cache_read_tokens, u.cache_write_tokens
       FROM sophia.source_objects s JOIN sophia.source_texts t ON t.project_id = s.project_id AND t.source_id = s.id
       LEFT JOIN LATERAL (SELECT provider, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
          FROM sophia.usage_records
          WHERE project_id = s.project_id AND attempt_id = $3 AND purpose = 'turn'
          ORDER BY recorded_at DESC, id DESC LIMIT 1) u ON true
      WHERE s.project_id = $1 AND s.id = $2`,
    [projectId, task.result_source_id, task.attempt_id],
  )
  const r = rows[0]
  if (!r) return null
  const outputs = task.kind === 'draft_brief' ? [] : await readOutputs(c, projectId, task.id)
  return {
    sourceId: r.source_id,
    sha256: r.sha256,
    markdown: r.body,
    provider: r.provider,
    model: r.model,
    inputTokens: tokens(r.input_tokens),
    outputTokens: tokens(r.output_tokens),
    capturedAt: iso(r.created_at),
    ...(r.cache_read_tokens === null ? {} : { cacheReadTokens: Number(r.cache_read_tokens) }),
    ...(r.cache_write_tokens === null ? {} : { cacheWriteTokens: Number(r.cache_write_tokens) }),
    ...(outputs.length === 0 ? {} : { outputs }),
  }
}

interface ProgressRow {
  question: string
  role: string
  outputs: ResearchProgress['outputs'] | null
  root_job_id: string
  amends_job_id: string | null
  cap_usd: string
  committed_usd: string
  spent_usd: string
  searches: string
  max_searches: number
  reads: string
  max_reads: number
  pdf_reason: string | null
  pdf_rendering: boolean
}

/**
 * A research task's question, specialist and outputs, and how far its allowance has gone (M03 S4): money committed
 * (reserved, spent or uncertain) and spent, and the searches and reads used, a released call not counted. The allowance
 * is the lineage's, so an amendment shows what the whole report has used.
 */
async function readResearchProgress(
  c: pg.PoolClient,
  projectId: string,
  taskId: string,
): Promise<ResearchProgress | null> {
  const { rows } = await c.query<ProgressRow>(
    `SELECT q.body AS question, t.role, (m.body::jsonb)->'outputs' AS outputs, t.root_job_id, t.amends_job_id,
            al.cap_usd, al.reserved_usd + al.spent_usd + al.uncertain_usd AS committed_usd, al.spent_usd,
            (SELECT count(*) FROM sophia.research_reservations r WHERE r.project_id = al.project_id
                AND r.allowance_id = al.id AND r.kind = 'search' AND r.state <> 'released') AS searches,
            al.max_searches,
            (SELECT count(*) FROM sophia.research_reservations r WHERE r.project_id = al.project_id
                AND r.allowance_id = al.id AND r.kind = 'read' AND r.state <> 'released') AS reads,
            al.max_reads, t.pdf_reason,
            EXISTS(SELECT 1 FROM sophia.render_jobs r JOIN sophia.jobs rj ON rj.project_id = r.project_id AND rj.id = r.job_id
                    WHERE r.project_id = t.project_id AND r.parent_job_id = t.job_id AND r.kind = 'rendition'
                      AND rj.state IN ('pending', 'running')) AS pdf_rendering
       FROM sophia.research_tasks t
       JOIN sophia.jobs j ON j.project_id = t.project_id AND j.id = t.job_id
       JOIN sophia.research_allowances al ON al.project_id = t.project_id AND al.id = t.allowance_id
       JOIN sophia.source_texts q ON q.project_id = t.project_id AND q.source_id = t.question_source_id
       LEFT JOIN sophia.source_texts m ON m.project_id = t.project_id AND m.source_id = j.input_source_id
      WHERE t.project_id = $1 AND t.job_id = $2`,
    [projectId, taskId],
  )
  const r = rows[0]
  if (!r) return null
  return {
    question: r.question,
    specialist: r.role,
    outputs: r.outputs ?? ['markdown'],
    rootTaskId: r.root_job_id,
    ...(r.amends_job_id === null ? {} : { amendsTaskId: r.amends_job_id }),
    capUsd: Number(r.cap_usd),
    committedUsd: Number(r.committed_usd),
    spentUsd: Number(r.spent_usd),
    searches: { used: Number(r.searches), max: r.max_searches },
    reads: { used: Number(r.reads), max: r.max_reads },
    ...(r.pdf_reason === null ? {} : { pdfReason: r.pdf_reason }),
    ...(r.pdf_rendering ? { pdfRendering: true } : {}),
  }
}

/** One task with its instruction and result. Call inside withActor(..., "read"); not visible → not_found. */
export async function readNativeTask(c: pg.PoolClient, projectId: string, taskId: string): Promise<NativeTaskDetail> {
  const { rows } = await c.query<TaskRow>(
    `SELECT ${TASK_COLUMNS} FROM sophia.native_task_view WHERE project_id = $1 AND id = $2`,
    [projectId, taskId],
  )
  const task = rows[0]
  if (!task) throw new DomainError('not_found', 'Task not found')
  const instruction = await c.query<{ body: string }>(
    `SELECT body FROM sophia.source_texts WHERE project_id = $1 AND source_id = $2`,
    [projectId, task.instruction_source_id],
  )
  const research = task.kind === 'research' ? await readResearchProgress(c, projectId, task.id) : null
  return {
    task: toTask(task),
    instruction: instruction.rows[0]?.body ?? '',
    result: await readResult(c, projectId, task),
    ...(research === null ? {} : { research }),
  }
}

/** A version's section counts against the version before it, as publication stored them (0027, 0036). */
export interface SectionCounts {
  added: number
  revised: number
  removed: number
  unchanged: number
}

/**
 * One published version of a research report, as the guide's readers compare them (CX-0026, CX-0027). Counts are what
 * publication stored, citations less the report's own versions; nothing here is the worker's notes.
 */
export interface ReportVersion {
  id: string
  versionNumber: number
  parentId: string | null
  sourceId: string
  /** The research task that wrote its text: for a rendition-only version, the task of the version it prints. */
  taskId: string | null
  /** A version that only adds the PDF of the one before (0032, 0034): the same text, so never a content version. */
  renditionOnly: boolean
  /** Whether a PDF of this text exists: on the version itself, or on a rendition-only version made of it. */
  pdf: boolean
  /**
   * Sources cited, and added and dropped against the version before; null where publication stored none. Added and
   * dropped leave out the report's own versions: a follow-up that lists its base (the pilot's v2 did, CX-0026, and 0037
   * keeps the base citable) changed no source, and the next version, which does not list it again, dropped none.
   */
  cited: number | null
  added: number | null
  dropped: number | null
  sections: SectionCounts | null
}

/** Where one task stands, read under the member's RLS (CX-0026 STEER, CX-0027 RET). */
export interface TaskStanding {
  taskId: string
  kind: NativeTask['kind']
  goalId: string
  /** The goal's status: the whole lineage shares it, so it says nothing of one finished task alone. */
  goalStatus: string
  /** The task's own job state and phase. */
  state: NativeTask['state']
  phase: NativeTask['phase']
  /** The version this task published; null for a brief, or a task that published none (blocked, failed, running). */
  published: ReportVersion | null
  /** The version that one replaced. */
  previous: ReportVersion | null
  /** The report's current content version: its newest published version that is not rendition-only. */
  current: ReportVersion | null
  /** The newest task of its research lineage, the one nothing amends or rebuilds yet; null for a brief. */
  latestTaskId: string | null
  /** The tasks of its goal still under way (pending, running or unconfirmed), newest first. */
  inFlight: Array<{ taskId: string; state: NativeTask['state']; phase: NativeTask['phase'] }>
}

/** At most this many tasks in one read of standings: project_status lists ten. */
const STANDINGS = 10

interface StandingRow {
  id: string
  kind: NativeTask['kind']
  goal_id: string
  goal_status: string
  state: NativeTask['state']
  phase: NativeTask['phase']
  artifact_id: string | null
  latest_task_id: string | null
  in_flight: TaskStanding['inFlight']
}

/**
 * The tasks with the goal each works under, the report it writes into (its own, or its lineage's while it has none
 * yet), the newest task of its lineage (0033: the one no task amends or was rebuilt from) and the goal's tasks under way.
 */
async function readStandingRows(c: pg.PoolClient, projectId: string, taskIds: string[]): Promise<StandingRow[]> {
  const { rows } = await c.query<StandingRow>(
    `SELECT t.id, t.kind, t.goal_id, g.status AS goal_status, t.state, t.phase,
            coalesce(t.artifact_id, lineage.artifact_id) AS artifact_id, latest.job_id AS latest_task_id,
            (SELECT coalesce(jsonb_agg(jsonb_build_object('taskId', f.id, 'state', f.state, 'phase', f.phase)
                       ORDER BY f.created_at DESC, f.id DESC), '[]')
               FROM sophia.native_task_view f
              WHERE f.project_id = t.project_id AND f.goal_id = t.goal_id
                AND f.state IN ('pending', 'running', 'outcome_unknown')) AS in_flight
       FROM sophia.native_task_view t
       JOIN sophia.goals g ON g.project_id = t.project_id AND g.id = t.goal_id
       LEFT JOIN sophia.research_tasks rt ON rt.project_id = t.project_id AND rt.job_id = t.id
       LEFT JOIN LATERAL (SELECT jj.artifact_id FROM sophia.research_tasks x
            JOIN sophia.jobs jj ON jj.project_id = x.project_id AND jj.id = x.job_id
           WHERE x.project_id = rt.project_id AND x.root_job_id = rt.root_job_id AND jj.artifact_id IS NOT NULL
           ORDER BY x.created_at, x.job_id LIMIT 1) lineage ON true
       LEFT JOIN LATERAL (SELECT x.job_id FROM sophia.research_tasks x
           WHERE x.project_id = rt.project_id AND x.root_job_id = rt.root_job_id
             AND NOT EXISTS (SELECT 1 FROM sophia.research_tasks y WHERE y.project_id = x.project_id
                   AND y.job_id <> x.job_id AND (y.amends_job_id = x.job_id OR y.rebuilt_from_job_id = x.job_id))
           ORDER BY x.created_at DESC, x.job_id DESC LIMIT 1) latest ON true
      WHERE t.project_id = $1 AND t.id = ANY($2::uuid[])`,
    [projectId, taskIds],
  )
  return rows
}

interface VersionRow {
  id: string
  artifact_id: string
  version_number: number
  parent_id: string | null
  source_id: string
  job_id: string | null
  task_id: string | null
  rendition_only: boolean
  pdf: boolean
  cited: number | null
  added: number | null
  dropped: number | null
  sections: SectionCounts | null
}

/** The length of a stored facts array; null when publication stored none. */
const stored = (path: string) => `CASE WHEN jsonb_typeof(${path}) = 'array' THEN jsonb_array_length(${path}) END`

/**
 * How many sources of a stored facts array are not a version of the same report (any of its versions, as 0037's
 * research_citable lets a follow-up cite one); null when publication stored none.
 */
const movedSources = (path: string) =>
  `CASE WHEN jsonb_typeof(${path}) = 'array' THEN (SELECT count(*)::integer FROM jsonb_array_elements_text(${path}) s(id)
     WHERE NOT EXISTS(SELECT 1 FROM sophia.artifact_versions o
                       WHERE o.project_id = v.project_id AND o.artifact_id = v.artifact_id AND o.source_id::text = s.id)) END`

/** Every published, numbered version of these reports, newest first. */
async function readReportVersions(c: pg.PoolClient, projectId: string, artifactIds: string[]): Promise<VersionRow[]> {
  if (artifactIds.length === 0) return []
  const sections = (k: string) => stored(`v.change_facts->'sections'->'${k}'`)
  const { rows } = await c.query<VersionRow>(
    `SELECT v.id, v.artifact_id, v.version_number, v.parent_id, v.source_id, v.job_id,
            coalesce(j.parent_job_id, j.id) AS task_id,
            coalesce((v.change_facts->>'renditionOnly')::boolean, false) AS rendition_only,
            EXISTS(SELECT 1 FROM sophia.artifact_renditions r
                    WHERE r.project_id = v.project_id AND r.artifact_version_id = v.id AND r.format = 'pdf') AS pdf,
            CASE WHEN jsonb_typeof(v.change_facts->'cited') = 'number' THEN (v.change_facts->>'cited')::integer END AS cited,
            ${movedSources(`v.change_facts->'added'`)} AS added, ${movedSources(`v.change_facts->'dropped'`)} AS dropped,
            CASE WHEN jsonb_typeof(v.change_facts->'sections') = 'object' THEN jsonb_build_object(
              'added', ${sections('added')}, 'revised', ${sections('revised')},
              'removed', ${sections('removed')}, 'unchanged', ${sections('unchanged')}) END AS sections
       FROM sophia.artifact_versions v LEFT JOIN sophia.jobs j ON j.project_id = v.project_id AND j.id = v.job_id
      WHERE v.project_id = $1 AND v.artifact_id = ANY($2::uuid[]) AND v.state IN ('stable', 'superseded')
        AND v.version_number IS NOT NULL
      ORDER BY v.version_number DESC, v.created_at DESC, v.id DESC LIMIT 500`,
    [projectId, artifactIds],
  )
  return rows
}

const toReportVersion = (r: VersionRow, all: readonly VersionRow[]): ReportVersion => ({
  id: r.id,
  versionNumber: r.version_number,
  parentId: r.parent_id,
  sourceId: r.source_id,
  taskId: r.task_id,
  renditionOnly: r.rendition_only,
  pdf: r.pdf || all.some((x) => x.rendition_only && x.parent_id === r.id && x.pdf),
  cited: r.cited,
  added: r.added,
  dropped: r.dropped,
  sections: r.sections,
})

/** The versions a task's readers name: its own, the one it replaced, the report's current content version and v1. */
function versionsOf(task: StandingRow, all: readonly VersionRow[]) {
  const mine = all.filter((v) => v.artifact_id === task.artifact_id)
  const own = mine.find((v) => v.job_id === task.id)
  const previous = own?.parent_id ? mine.find((v) => v.id === own.parent_id) : undefined
  const current = mine.find((v) => !v.rendition_only)
  const first = mine.find((v) => v.version_number === 1)
  const of = (v: VersionRow | undefined) => (v ? toReportVersion(v, mine) : null)
  return { own: of(own), previous: of(previous), current: of(current), first: of(first) }
}

const standingOf = (r: StandingRow, versions: ReturnType<typeof versionsOf>): TaskStanding => ({
  taskId: r.id,
  kind: r.kind,
  goalId: r.goal_id,
  goalStatus: r.goal_status,
  state: r.state,
  phase: r.phase,
  published: versions.own,
  previous: versions.previous,
  current: versions.current,
  latestTaskId: r.latest_task_id,
  inFlight: r.in_flight,
})

/**
 * Where each of these tasks stands (at most ten; a task not visible is left out): its own state, never only its goal's
 * (0022's phase lets a goal's Hold hide a finished task), what it published and where its report is now. Call inside
 * withActor; it reads nothing a member could not.
 */
export async function readTaskStandings(
  c: pg.PoolClient,
  projectId: string,
  taskIds: readonly string[],
): Promise<TaskStanding[]> {
  const ids = [...new Set(taskIds)].slice(0, STANDINGS)
  if (ids.length === 0) return []
  const tasks = await readStandingRows(c, projectId, ids)
  const artifacts = [...new Set(tasks.flatMap((t) => (t.artifact_id === null ? [] : [t.artifact_id])))]
  const versions = await readReportVersions(c, projectId, artifacts)
  return tasks.map((t) => standingOf(t, versionsOf(t, versions)))
}

/** A version with its Markdown; null text when it can no longer be read (its source was withdrawn). */
export type ReportVersionText = ReportVersion & { text: string | null }

/** What read_selected_source compares for a research task: the versions its facts are computed from (CX-0027). */
export interface ResearchVersions {
  standing: TaskStanding
  own: ReportVersionText | null
  previous: ReportVersionText | null
  current: ReportVersionText | null
  first: ReportVersionText | null
}

/**
 * A research task's own version, the one it replaced, the report's current content version (never a rendition-only
 * one, which keeps the text before it) and version 1, with their texts. A task that published nothing (blocked,
 * running) still gets the report's current version. Null when the task is not visible. Call inside withActor.
 */
export async function readResearchVersion(
  c: pg.PoolClient,
  projectId: string,
  taskId: string,
): Promise<ResearchVersions | null> {
  const [task] = await readStandingRows(c, projectId, [taskId])
  if (!task) return null
  const versions = versionsOf(task, await readReportVersions(c, projectId, task.artifact_id ? [task.artifact_id] : []))
  const named = [versions.own, versions.previous, versions.current, versions.first]
  const sources = [...new Set(named.flatMap((v) => (v ? [v.sourceId] : [])))]
  const { rows } = await c.query<{ source_id: string; body: string }>(
    `SELECT source_id, body FROM sophia.source_texts WHERE project_id = $1 AND source_id = ANY($2::uuid[])`,
    [projectId, sources],
  )
  const texts = new Map(rows.map((r) => [r.source_id, r.body]))
  const withText = (v: ReportVersion | null) => (v ? { ...v, text: texts.get(v.sourceId) ?? null } : null)
  return {
    standing: standingOf(task, versions),
    own: withText(versions.own),
    previous: withText(versions.previous),
    current: withText(versions.current),
    first: withText(versions.first),
  }
}
