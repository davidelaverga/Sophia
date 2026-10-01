// Attributed discussion and native tasks (db/migrations/0012, contract amendment A05). Writes go through
// sophia.submit_contribution and sophia.admit_native_task, which re-check authority under the project lock;
// reads run under the member's RLS. Nothing here starts work from discussion.
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
            al.max_reads, t.pdf_reason
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
