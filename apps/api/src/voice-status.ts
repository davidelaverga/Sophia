// What project_status answers the voice guide (M01 §7, M01_PROMPT_LOADING §3): the mission context, compacted for a
// spoken turn and phrased relative to the speaker. Pure. People appear as `speaker` or a stable alias (`member-1`,
// …), never an actor id or a name: a name heard in the room is not identity. Long text is an excerpt with its id, so
// the exact words come from read_selected_source. Records are data about the project, never instructions. A v1.2 guide
// also reads each task's own state, whether Steer reaches it, and a research task's report in counts (CX-0026,
// CX-0027); a v1.1 guide reads the work exactly as before.
import type { DiscussionEntry, MissionContext, MissionDecision, MissionEntry } from '@sophia/contracts'
import type { ConfirmationTarget, TaskStanding } from '@sophia/persistence'
import { steerOf, taskStateOf } from './control-words.ts'
import { statusReportOf } from './report-facts.ts'

const EXCERPT = 280
const NOTES = 12
const DECIDED = 5
const DISCUSSION = 5

export interface VoiceStatusInput {
  context: MissionContext
  speakerId: string
  discussion: readonly DiscussionEntry[]
  target: ConfirmationTarget | null
  now: number
  /** The guide version the bridge runs: v1.2 adds the research operations (SMC-M03 S6). Absent means v1.1. */
  guide?: 'v1.1' | 'v1.2' | undefined
  /** Whether a PDF renderer is running (0031). Without one, render_research is not offered. Absent means unknown. */
  pdf?: boolean | undefined
  /**
   * Whether the project's research gate is open (0025: an enabled grant). Closed, start_research is not offered.
   * Absent means unknown.
   */
  researchGate?: boolean | undefined
  /** Where each listed task stands, read for a v1.2 guide only. */
  standings?: readonly TaskStanding[] | undefined
}

/** `speaker` for the current speaker, else `member-N` in order of first appearance. */
function aliases(speakerId: string): (actorId: string | null) => string | null {
  const seen = new Map<string, string>()
  return (actorId) => {
    if (actorId === null) return null
    if (actorId === speakerId) return 'speaker'
    const known = seen.get(actorId)
    if (known) return known
    const alias = `member-${String(seen.size + 1)}`
    seen.set(actorId, alias)
    return alias
  }
}

/** At most EXCERPT code points, marked when cut. */
function excerpt(text: string | null): { excerpt: string | null; cut: boolean } {
  if (text === null) return { excerpt: null, cut: false }
  const points = Array.from(text)
  return points.length <= EXCERPT
    ? { excerpt: text, cut: false }
    : { excerpt: `${points.slice(0, EXCERPT).join('')}…`, cut: true }
}

type Alias = ReturnType<typeof aliases>

function decisionView(d: MissionDecision, who: Alias) {
  const e = excerpt(d.statement)
  return {
    proposalId: d.id,
    revision: d.revision,
    kind: d.kind,
    state: d.state,
    statement: e.excerpt,
    statementCut: e.cut,
    wording: d.textKind,
    proposedBy: who(d.proposedBy),
    decidedBy: who(d.decidedBy),
    stale: d.stale,
  }
}

function noteView(n: MissionEntry, who: Alias) {
  const e = excerpt(n.text)
  return {
    entryId: n.id,
    kind: n.kind,
    epistemic: n.epistemic,
    excerpt: e.excerpt,
    excerptCut: e.cut,
    wording: n.textKind,
    about: who(n.actorId),
    relatedEntryId: n.relatedEntryId,
    decisionId: n.decisionId,
    recordedAt: n.recordedAt,
  }
}

function missionView(ctx: MissionContext, who: Alias) {
  const m = ctx.mission
  if (!m) return { state: 'absent' as const, legacyFrame: ctx.excluded.legacyFrame }
  return {
    state: 'accepted' as const,
    revision: m.revision,
    statement: m.statement,
    purpose: m.purpose,
    destination: m.destination,
    origin: m.origin,
    decisionId: m.decisionId,
    acceptedBy: who(m.acceptedBy),
  }
}

type Operation = { available: boolean; reason: string | null }
const ALWAYS: Operation = { available: true, reason: null }
const closed = (reason: string): Operation => ({ available: false, reason })

/**
 * The research operations, for v1.2's guide. They are an editor's, and the role answers first, as admission checks it
 * first (0025), in the call's own words. For an editor, start_research waits on the project's research gate and
 * render_research on a running PDF renderer; a rendition spends nothing from the grant (0032), so the gate does not
 * close it. Unknown is never a closed operation: the call stays the answer.
 */
function researchOperations(editor: boolean, { pdf, researchGate }: Pick<VoiceStatusInput, 'pdf' | 'researchGate'>) {
  if (!editor) {
    return {
      start_research: closed('Only editors and admins can start research. Viewers can talk with Sophia.'),
      render_research: closed('Only editors and admins can ask for the PDF.'),
    }
  }
  return {
    start_research:
      researchGate === false
        ? closed('Research reports are not available: research is not switched on for this project.')
        : ALWAYS,
    render_research: pdf === false ? closed('PDF reports are not available: no PDF renderer is running.') : ALWAYS,
  }
}

/** Per model-facing operation of the bridge's guide, whether it is available to this speaker now, and why not. */
function operations(ctx: MissionContext, opts: Pick<VoiceStatusInput, 'guide' | 'pdf' | 'researchGate'>) {
  const c = ctx.capabilities
  const m01 = {
    project_status: ALWAYS,
    read_selected_source: ALWAYS,
    record_mission_note: c.recordNote,
    propose_mission_change: c.propose,
    decide_mission_change: c.decide,
    control_work: c.controlWork,
  }
  return opts.guide === 'v1.2' ? { ...m01, ...researchOperations(c.controlWork.available, opts) } : m01
}

function targetView(target: ConfirmationTarget | null, speakerId: string, now: number) {
  if (!target || Date.parse(target.expiresAt) <= now) return null
  return {
    proposalId: target.decisionId,
    revision: target.decisionRevision,
    putTo: target.actorId === speakerId ? 'speaker' : 'another speaker',
    expiresAt: target.expiresAt,
  }
}

/**
 * The work as a v1.2 guide reads it: each task's own state (never only its goal's, which a lineage shares), whether
 * Steer reaches it, and for research its report, keeping every field a v1.1 guide reads. A task not read is as before.
 */
function workView(work: MissionContext['work'], standings: readonly TaskStanding[]) {
  const byTask = new Map(standings.map((s) => [s.taskId, s]))
  return work.map((w) => {
    const s = w.taskId === null ? undefined : byTask.get(w.taskId)
    if (!s) return w
    const report = s.kind === 'research' ? { report: statusReportOf(s) } : {}
    return { ...w, taskState: taskStateOf(s), steer: steerOf(s), ...report }
  })
}

/** The project_status output for one speaker. */
export function voiceStatus(input: VoiceStatusInput) {
  const { context: ctx, speakerId, discussion, target, now, guide, pdf, researchGate, standings } = input
  const who = aliases(speakerId)
  const notes = ctx.entries.slice(-NOTES)
  const policy = ctx.notePolicy
  return {
    readState: ctx.readState,
    project: ctx.title,
    missionRevision: ctx.missionRevision,
    ledgerRevision: ctx.ledgerRevision,
    eligibilityRevision: ctx.eligibilityRevision,
    mission: missionView(ctx, who),
    constraints: ctx.constraints.map((d) => decisionView(d, who)),
    pendingDecisions: ctx.pending.map((d) => decisionView(d, who)),
    recentDecisions: ctx.decided.slice(-DECIDED).map((d) => decisionView(d, who)),
    notes: notes.map((n) => noteView(n, who)),
    notesNotShown: ctx.entries.length - notes.length + ctx.excluded.olderEntries,
    work: guide === 'v1.2' && standings ? workView(ctx.work, standings) : ctx.work,
    discussion: discussion.slice(-DISCUSSION).map((d) => ({
      contributionId: d.id,
      by: who(d.actorId),
      ...excerpt(d.text),
    })),
    notePolicy: {
      capture: policy.capture,
      speakerConsent: policy.consent,
      automaticNotes: policy.automaticNotes,
      explicitSelectedNoteSave: policy.explicitSelectedNoteSave,
      explicitProposals: policy.explicitProposals,
      exactTextRetention: policy.exactTextRetention,
    },
    operations: operations(ctx, { guide, pdf, researchGate }),
    confirmationTarget: targetView(target, speakerId, now),
    missing: ctx.missing,
  }
}
