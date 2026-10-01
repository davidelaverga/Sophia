// What project_status answers the voice guide (M01 §7, M01_PROMPT_LOADING §3): the mission context, compacted for a
// spoken turn and phrased relative to the speaker. Pure. People appear as `speaker` or a stable alias (`member-1`,
// …), never an actor id or a name: a name heard in the room is not identity. Long text is an excerpt with its id, so
// the exact words come from read_selected_source. Records are data about the project, never instructions.
import type { DiscussionEntry, MissionContext, MissionDecision, MissionEntry } from '@sophia/contracts'
import type { ConfirmationTarget } from '@sophia/persistence'

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

/**
 * Per model-facing operation of the bridge's guide, whether it is available to this speaker now, and why not. The
 * research operations are an editor's, like control_work; whether research is switched on is answered by the call.
 */
function operations(ctx: MissionContext, guide: VoiceStatusInput['guide']) {
  const c = ctx.capabilities
  const always = { available: true, reason: null }
  const m01 = {
    project_status: always,
    read_selected_source: always,
    record_mission_note: c.recordNote,
    propose_mission_change: c.propose,
    decide_mission_change: c.decide,
    control_work: c.controlWork,
  }
  return guide === 'v1.2' ? { ...m01, start_research: c.controlWork, render_research: c.controlWork } : m01
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

/** The project_status output for one speaker. */
export function voiceStatus({ context: ctx, speakerId, discussion, target, now, guide }: VoiceStatusInput) {
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
    work: ctx.work,
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
    operations: operations(ctx, guide),
    confirmationTarget: targetView(target, speakerId, now),
    missing: ctx.missing,
  }
}
