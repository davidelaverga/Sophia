// The mission ledger's read model (SMC-M01 binding §1, §4.4): one MissionContext compiled from canonical records under
// the reader's RLS, the same view for the Studio and for the voice guide's project_status. It is data, never
// instruction. `empty` needs a successful read that finds no accepted mission, proposal, note, discussion or work; an
// empty accepted frame alone is not that proof. Withdrawn notes keep their place in history without their text.
import { createHash } from 'node:crypto'
import type pg from 'pg'
import type { MissionContext, MissionDecision, MissionEntry, MissionFrame, MissionNotePolicy } from '@sophia/contracts'
import { safeInt } from './bigint.ts'

export const MISSION_CONTEXT_COMPILER = 'sophia.mission-context.v1'
/** No transcript is buffered or retained in this candidate: the declared bounds are zero (binding §4.4). */
export const TRANSCRIPT_BUFFER = { turns: 0, bytes: 0, seconds: 0 } as const

const ENTRY_LIMIT = 50
const HISTORY_LIMIT = 20
const DECIDED_LIMIT = 10
const WORK_LIMIT = 10

/** Who is reading and through what: the Studio (their own actions) or the voice guide (the speaker's turns). */
export interface MissionReader {
  actorId: string
  channel: 'studio' | 'voice'
}

type Role = 'admin' | 'editor' | 'viewer'

interface ProjectRow {
  id: string
  title: string
  mission_revision: string
  ledger_revision: string
  eligibility_revision: string
  frame: Record<string, unknown>
  accepted_by: string
  accepted_at: Date
  role: Role | null
}

interface DecisionRow {
  id: string
  revision: string
  kind: MissionDecision['kind']
  state: MissionDecision['state']
  proposal: { statement: string; purpose?: string; destination?: string; origin?: string }
  proposed_by: string
  origin: MissionDecision['proposedVia']
  created_at: Date
  base_mission_revision: string | null
  supersedes_decision_id: string | null
  supporting_entry_ids: string[]
  decided_by: string | null
  decided_at: Date | null
  decided_via: MissionDecision['decidedVia']
  body_source_id: string
  sha256: string
}

interface EntryRow {
  id: string
  kind: MissionEntry['kind']
  epistemic: MissionEntry['epistemic']
  state: MissionEntry['state']
  body: string | null
  authored_by: MissionEntry['authoredBy']
  actor_id: string
  origin: MissionEntry['origin']
  exchange_id: string | null
  input_epoch: string | null
  related_entry_id: string | null
  supersedes_entry_id: string | null
  superseded_by: string | null
  goal_id: string | null
  decision_id: string | null
  source_id: string
  sha256: string | null
  ledger_revision: string
  observed_at: Date
  recorded_at: Date
  changed_at: Date | null
}

const iso = (d: Date) => d.toISOString()
const text = (value: unknown) => (typeof value === 'string' ? value : null)
const revision = (value: string | null, field: string) => (value === null ? null : safeInt(value, field))

async function readProject(c: pg.PoolClient, projectId: string, actorId: string): Promise<ProjectRow | undefined> {
  const { rows } = await c.query<ProjectRow>(
    `SELECT p.id, p.title, p.mission_revision, p.ledger_revision, p.eligibility_revision, r.frame, r.accepted_by,
            r.created_at AS accepted_at,
            (SELECT m.role FROM sophia.project_members m WHERE m.project_id = p.id AND m.actor_id = $2 AND m.active) AS role
       FROM sophia.projects p
       JOIN sophia.project_revisions r ON r.project_id = p.id AND r.revision = p.mission_revision
      WHERE p.id = $1`,
    [projectId, actorId],
  )
  return rows[0]
}

/**
 * The accepted frame when it is one a mission decision produced; any other non-empty frame is legacy. A frame whose
 * mission was forgotten with a note it cited keeps only its decision id: there is no mission, and nothing legacy.
 */
function missionFrame(p: ProjectRow): { mission: MissionFrame | null; legacy: boolean } {
  const f = p.frame
  if (f.withdrawn === true) return { mission: null, legacy: false }
  const statement = text(f.statement)
  const decisionId = text(f.decisionId)
  const sourceId = text(f.sourceId)
  const sha256 = text(f.sha256)
  if (statement === null || decisionId === null || sourceId === null || sha256 === null) {
    return { mission: null, legacy: Object.keys(f).length > 0 }
  }
  return {
    mission: {
      revision: safeInt(p.mission_revision, 'missionRevision'),
      statement,
      purpose: text(f.purpose),
      destination: text(f.destination),
      origin: text(f.origin),
      decisionId,
      acceptedBy: p.accepted_by,
      acceptedAt: iso(p.accepted_at),
      sourceId,
      sha256,
    },
    legacy: false,
  }
}

const DECISION_COLUMNS = `d.id, d.revision, d.kind, d.state, d.proposal, d.proposed_by, d.origin, d.created_at,
  d.base_mission_revision, d.supersedes_decision_id, d.supporting_entry_ids, d.decided_by, d.decided_at, d.decided_via,
  d.body_source_id, s.sha256`

async function readDecisions(c: pg.PoolClient, projectId: string, where: string, order: string, limit: number) {
  const { rows } = await c.query<DecisionRow>(
    `SELECT * FROM (SELECT ${DECISION_COLUMNS} FROM sophia.decisions d
        JOIN sophia.source_objects s ON s.project_id = d.project_id AND s.id = d.body_source_id
       WHERE d.project_id = $1 AND d.proposal IS NOT NULL AND ${where}
       ORDER BY ${order} DESC, d.id DESC LIMIT ${String(limit)}) latest
      ORDER BY ${order.replace('d.', '')}, id`,
    [projectId],
  )
  return rows
}

function toDecision(r: DecisionRow, missionRevision: number): MissionDecision {
  const base = revision(r.base_mission_revision, 'decision.baseMissionRevision')
  return {
    id: r.id,
    revision: safeInt(r.revision, 'decision.revision'),
    kind: r.kind,
    state: r.state,
    statement: r.proposal.statement,
    purpose: r.proposal.purpose ?? null,
    destination: r.proposal.destination ?? null,
    origin: r.proposal.origin ?? null,
    textKind: r.origin === 'studio' ? 'member_text' : 'sophia_paraphrase',
    proposedBy: r.proposed_by,
    proposedVia: r.origin,
    createdAt: iso(r.created_at),
    baseMissionRevision: base,
    stale: r.state === 'proposed' && base !== null && base !== missionRevision,
    supersedesDecisionId: r.supersedes_decision_id,
    supportingEntryIds: r.supporting_entry_ids,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at ? iso(r.decided_at) : null,
    decidedVia: r.decided_via,
    sourceId: r.body_source_id,
    sha256: r.sha256,
  }
}

const ENTRY_COLUMNS = `e.id, e.kind, e.epistemic, e.state, t.body, e.authored_by, e.actor_id, e.origin, e.exchange_id,
  e.input_epoch, e.related_entry_id, e.supersedes_entry_id,
  (SELECT n.id FROM sophia.mission_entries n WHERE n.project_id = e.project_id AND n.supersedes_entry_id = e.id LIMIT 1) AS superseded_by,
  e.goal_id, e.decision_id, e.source_id, s.sha256, e.ledger_revision, e.observed_at, e.recorded_at, e.changed_at`

/** The newest entries matching `states`, oldest first, and how many more there are. */
async function readEntries(c: pg.PoolClient, projectId: string, states: string[], limit: number) {
  const { rows } = await c.query<EntryRow>(
    // LEFT JOINs: a withdrawn note's source is deleted and hidden by RLS, and its tombstone still belongs in history.
    `SELECT * FROM (SELECT ${ENTRY_COLUMNS} FROM sophia.mission_entries e
        LEFT JOIN sophia.source_objects s ON s.project_id = e.project_id AND s.id = e.source_id
        LEFT JOIN sophia.source_texts t ON t.project_id = s.project_id AND t.source_id = s.id
       WHERE e.project_id = $1 AND e.state = ANY($2)
       ORDER BY e.recorded_at DESC, e.id DESC LIMIT ${String(limit)}) latest
      ORDER BY recorded_at, id`,
    [projectId, states],
  )
  const { rows: count } = await c.query<{ n: string }>(
    `SELECT count(*) AS n FROM sophia.mission_entries WHERE project_id = $1 AND state = ANY($2)`,
    [projectId, states],
  )
  return { rows, more: Math.max(0, safeInt(count[0]?.n ?? '0', 'entries') - rows.length) }
}

function toEntry(r: EntryRow): MissionEntry {
  const withdrawn = r.state === 'withdrawn'
  return {
    id: r.id,
    kind: r.kind,
    epistemic: r.epistemic,
    state: r.state,
    text: withdrawn ? null : r.body,
    textKind: r.authored_by === 'sophia' ? 'sophia_paraphrase' : 'member_text',
    authoredBy: r.authored_by,
    actorId: r.actor_id,
    origin: r.origin,
    exchangeId: r.exchange_id,
    inputEpoch: revision(r.input_epoch, 'entry.inputEpoch'),
    relatedEntryId: r.related_entry_id,
    supersedesEntryId: r.supersedes_entry_id,
    supersededById: r.superseded_by,
    goalId: r.goal_id,
    decisionId: r.decision_id,
    sourceId: r.source_id,
    sha256: withdrawn ? null : r.sha256,
    ledgerRevision: safeInt(r.ledger_revision, 'entry.ledgerRevision'),
    observedAt: iso(r.observed_at),
    recordedAt: iso(r.recorded_at),
    changedAt: r.changed_at ? iso(r.changed_at) : null,
  }
}

async function readWork(c: pg.PoolClient, projectId: string): Promise<MissionContext['work']> {
  const { rows } = await c.query<{
    goal_id: string
    title: string
    status: string
    task_id: string | null
    phase: string | null
  }>(
    `SELECT * FROM (SELECT g.id AS goal_id, g.title, g.status, t.id AS task_id, t.phase, g.created_at
        FROM sophia.goals g LEFT JOIN sophia.native_task_view t ON t.project_id = g.project_id AND t.goal_id = g.id
       WHERE g.project_id = $1 ORDER BY g.created_at DESC, g.id DESC LIMIT ${String(WORK_LIMIT)}) latest
      ORDER BY created_at, goal_id`,
    [projectId],
  )
  return rows.map((r) => ({ goalId: r.goal_id, title: r.title, status: r.status, taskId: r.task_id, phase: r.phase }))
}

interface PolicyRow {
  capture: MissionNotePolicy['capture'] | null
  revision: string | null
  consent: 'accepted' | 'declined' | null
  consent_revision: string | null
  accepted: string
}

const NO_POLICY: PolicyRow = { capture: null, revision: null, consent: null, consent_revision: null, accepted: '0' }

/** SQL supplies the team default. An unavailable row stays conservative; individual consent is never inferred. */
function policyOf(row: PolicyRow | undefined) {
  const r = row ?? NO_POLICY
  const capture: MissionNotePolicy['capture'] = r.capture ?? 'off'
  const consent: MissionNotePolicy['consent'] = r.consent ?? 'unset'
  return {
    capture,
    revision: revision(r.revision, 'notePolicy.revision') ?? 0,
    consent,
    consentRevision: revision(r.consent_revision, 'notePolicy.consentRevision') ?? 0,
    acceptedMembers: safeInt(r.accepted, 'notePolicy.acceptedMembers'),
  }
}

async function readNotePolicy(c: pg.PoolClient, projectId: string, actorId: string) {
  const { rows } = await c.query<PolicyRow>(
    `SELECT coalesce(p.capture,sophia.mission_capture_default()) AS capture, p.revision, c.state AS consent, c.revision AS consent_revision,
            (SELECT count(*) FROM sophia.mission_note_consents a JOIN sophia.project_members m
               ON m.project_id = a.project_id AND m.actor_id = a.actor_id AND m.active
              WHERE a.project_id = $1 AND a.state = 'accepted') AS accepted
       FROM (SELECT 1) one
       LEFT JOIN sophia.mission_note_policies p ON p.project_id = $1
       LEFT JOIN sophia.mission_note_consents c ON c.project_id = $1 AND c.actor_id = $2`,
    [projectId, actorId],
  )
  return policyOf(rows[0])
}

function notePolicy(p: Awaited<ReturnType<typeof readNotePolicy>>): MissionNotePolicy {
  const automatic = p.capture === 'automatic' && p.consent === 'accepted'
  return {
    ...p,
    automaticNotes: automatic,
    // This candidate has no separate confirmation-backed save while capture is off (binding §4.4).
    explicitSelectedNoteSave: automatic,
    explicitProposals: p.consent === 'accepted',
    exactTextRetention: false,
    transientBuffer: TRANSCRIPT_BUFFER,
  }
}

const VIEWER_REASON = 'Viewers can talk with Sophia and read the mission; only editors and admins can change it.'
const allow = (available: boolean, reason: string) => ({ available, reason: available ? null : reason })

function capabilities(role: Role | null, policy: MissionNotePolicy, reader: MissionReader) {
  const editor = role === 'admin' || role === 'editor'
  const voice = reader.channel === 'voice'
  const who = voice ? 'The speaker has' : 'You have'
  const captureReason =
    policy.capture === 'off'
      ? 'Note capture is off for this project; an admin can turn it on.'
      : `${who} not agreed to Sophia keeping notes from ${voice ? 'their' : 'your'} turns.`
  return {
    recordNote: editor ? allow(!voice || policy.automaticNotes, captureReason) : allow(false, VIEWER_REASON),
    propose: editor
      ? allow(!voice || policy.explicitProposals, `${who} not agreed to Sophia keeping proposals from these turns.`)
      : allow(false, VIEWER_REASON),
    decide: allow(editor, VIEWER_REASON),
    correct: allow(editor, VIEWER_REASON),
    withdrawOwnNote: allow(role !== null, 'Only members can withdraw notes.'),
    setNotePolicy: allow(role === 'admin', 'Only a project admin can change note capture.'),
    controlWork: allow(editor, 'Only editors and admins can hold, resume or stop work.'),
  }
}

async function hasHistory(c: pg.PoolClient, projectId: string): Promise<boolean> {
  const { rows } = await c.query<{ found: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM sophia.contributions WHERE project_id = $1)
         OR EXISTS (SELECT 1 FROM sophia.goals WHERE project_id = $1)
         OR EXISTS (SELECT 1 FROM sophia.decisions WHERE project_id = $1 AND proposal IS NOT NULL)
         OR EXISTS (SELECT 1 FROM sophia.mission_entries WHERE project_id = $1 AND state <> 'withdrawn') AS found`,
    [projectId],
  )
  return rows[0]?.found === true
}

function missing(ctx: Pick<MissionContext, 'mission' | 'constraints' | 'entries' | 'work'>): MissionContext['missing'] {
  const gaps: Array<MissionContext['missing'][number]> = []
  if (!ctx.mission) gaps.push('accepted_mission')
  if (ctx.constraints.length === 0) gaps.push('constraints')
  if (ctx.entries.length === 0) gaps.push('notes')
  if (ctx.work.length === 0) gaps.push('work')
  return gaps
}

/** The digest of everything but itself: the same records give the same digest. */
function withDigest(body: Omit<MissionContext, 'digest'>): MissionContext {
  return { ...body, digest: createHash('sha256').update(JSON.stringify(body)).digest('hex') }
}

async function readLedger(c: pg.PoolClient, projectId: string, missionRevision: number) {
  const decisions = (where: string, order: string, limit: number) =>
    readDecisions(c, projectId, where, order, limit).then((rows) => rows.map((r) => toDecision(r, missionRevision)))
  // Sequential on purpose: one connection, one REPEATABLE READ snapshot.
  const constraints = await decisions(`d.state = 'accepted' AND d.kind IN ('constraint', 'lesson')`, 'd.created_at', 50)
  const pending = await decisions(`d.state = 'proposed'`, 'd.created_at', 50)
  const decided = await decisions(`d.state IN ('rejected', 'superseded', 'accepted')`, 'd.decided_at', DECIDED_LIMIT)
  const current = await readEntries(c, projectId, ['current'], ENTRY_LIMIT)
  const past = await readEntries(c, projectId, ['superseded', 'withdrawn'], HISTORY_LIMIT)
  return { constraints, pending, decided, current, past }
}

/**
 * The mission context for one reader. Call inside withActor(..., "read"): RLS limits every table to the reader's
 * projects, so a non-member gets `null`.
 */
export async function readMissionContext(
  c: pg.PoolClient,
  projectId: string,
  reader: MissionReader,
): Promise<MissionContext | null> {
  const project = await readProject(c, projectId, reader.actorId)
  if (!project) return null
  const missionRevision = safeInt(project.mission_revision, 'missionRevision')
  const { mission, legacy } = missionFrame(project)
  const ledger = await readLedger(c, projectId, missionRevision)
  const work = await readWork(c, projectId)
  const policy = notePolicy(await readNotePolicy(c, projectId, reader.actorId))
  const entries = ledger.current.rows.map(toEntry)
  const present = mission !== null || legacy || (await hasHistory(c, projectId))
  return withDigest({
    projectId,
    title: project.title,
    readState: present ? 'present' : 'empty',
    missionRevision,
    ledgerRevision: safeInt(project.ledger_revision, 'ledgerRevision'),
    eligibilityRevision: safeInt(project.eligibility_revision, 'eligibilityRevision'),
    mission,
    constraints: ledger.constraints,
    pending: ledger.pending,
    decided: ledger.decided,
    entries,
    history: ledger.past.rows.map(toEntry),
    excluded: { olderEntries: ledger.current.more, olderHistory: ledger.past.more, legacyFrame: legacy },
    missing: missing({ mission, constraints: ledger.constraints, entries, work }),
    work,
    notePolicy: policy,
    capabilities: capabilities(project.role, policy, reader),
    compiler: MISSION_CONTEXT_COMPILER,
  })
}

/** One note's or proposal's text as a source. `text` is null once a note is withdrawn: its text is gone. */
export interface MissionSource {
  kind: 'entry' | 'decision'
  id: string
  state: MissionEntry['state'] | MissionDecision['state']
  revision: number | null
  sourceId: string
  sha256: string | null
  text: string | null
  textKind: MissionEntry['textKind']
}

interface SourceRow {
  id: string
  state: MissionSource['state']
  revision: string | null
  paraphrase: boolean
  source_id: string
  sha256: string | null
  body: string | null
}

const SOURCE_SQL = {
  entry: `SELECT e.id, e.state, NULL AS revision, e.authored_by = 'sophia' AS paraphrase, e.source_id, s.sha256, t.body
            FROM sophia.mission_entries e`,
  decision: `SELECT e.id, e.state, e.revision, e.origin IN ('voice','text') AS paraphrase, e.body_source_id AS source_id, s.sha256, t.body
               FROM sophia.decisions e`,
}

/** A note (`entry`) or a proposal (`decision`) of this project, or null. Call inside withActor(..., "read"). */
export async function readMissionSource(
  c: pg.PoolClient,
  projectId: string,
  kind: MissionSource['kind'],
  id: string,
): Promise<MissionSource | null> {
  const sourceColumn = kind === 'entry' ? 'e.source_id' : 'e.body_source_id'
  const { rows } = await c.query<SourceRow>(
    `${SOURCE_SQL[kind]}
       LEFT JOIN sophia.source_objects s ON s.project_id = e.project_id AND s.id = ${sourceColumn}
       LEFT JOIN sophia.source_texts t ON t.project_id = s.project_id AND t.source_id = s.id
      WHERE e.project_id = $1 AND e.id = $2`,
    [projectId, id],
  )
  const r = rows[0]
  if (!r) return null
  const withdrawn = r.state === 'withdrawn'
  return {
    kind,
    id: r.id,
    state: r.state,
    revision: revision(r.revision, 'source.revision'),
    sourceId: r.source_id,
    sha256: withdrawn ? null : r.sha256,
    text: withdrawn ? null : r.body,
    textKind: r.paraphrase ? 'sophia_paraphrase' : 'member_text',
  }
}

/** The proposal an exchange may currently confirm by voice, and to whom it was put (binding §4.3). */
export interface ConfirmationTarget {
  decisionId: string
  decisionRevision: number
  actorId: string
  inputEpoch: number
  expiresAt: string
}

/** Call inside withActor(..., "read") as a member of the exchange's project. */
export async function readConfirmationTarget(c: pg.PoolClient, exchangeId: string): Promise<ConfirmationTarget | null> {
  const { rows } = await c.query<{
    decision_id: string
    decision_revision: string
    actor_id: string
    input_epoch: string
    expires_at: Date
  }>(
    `SELECT decision_id, decision_revision, actor_id, input_epoch, expires_at
       FROM sophia.mission_confirmation_targets WHERE exchange_id = $1 AND expires_at > now()`,
    [exchangeId],
  )
  const r = rows[0]
  if (!r) return null
  return {
    decisionId: r.decision_id,
    decisionRevision: safeInt(r.decision_revision, 'target.decisionRevision'),
    actorId: r.actor_id,
    inputEpoch: safeInt(r.input_epoch, 'target.inputEpoch'),
    expiresAt: iso(r.expires_at),
  }
}
