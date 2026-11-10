// A work's control state, derived once for both Resources and Tasks (INC01-DES-001 r3, repair 1): from every control
// sent for it and its receipts (command-store.ts, receipts.ts), and from what its view observes (held or stopped).
// Never a flag of its own, and never only the latest control: a Stop not yet settled fences new guidance whatever came
// after it, for a Resume is no Stop's settlement. An empty store is not evidence that the work runs: a view observed
// held or stopped fences as a settled Hold or Stop would, after a reload or a navigation too. A command fences the
// work when its project, work, assignment and generation are the same, and its attempt and session the same or
// unnamed: a missing attempt is ambiguity, not proof of another execution. Trying a command again stays exact
// (receipts.ts `retryableNow`): an old operation is never rebound to a named attempt. A refused command changed
// nothing. Pure: the words and rules are unit-tested.
import { unresolved, uncertain, type CommandKind, type CommandTarget, type Known, type Offer } from './receipts.ts'

type Control = Exclude<CommandKind, 'guidance'>
export type Phase = 'requested' | 'unconfirmed' | 'settled'

/** What the work's view observes of its control, apart from any command sent here: held, stopped, or neither. */
export type Observed = 'held' | 'stopped' | null

/** How the work's status reads while a control is in play: its tag, its tone and one sentence. */
export interface ControlSaid {
  status: string
  tone: 'amber' | 'muted'
  sentence: string
}

/** The work's control state now, for one execution. */
export interface WorkState {
  /** What its status says; null when nothing is in play and its view's own state stands. */
  said: ControlSaid | null
  /** The commands withheld now. */
  fenced: ReadonlySet<CommandKind>
  /** Controls in play whose own operation may be tried again (never a guidance past a fence). */
  reconcilable: ReadonlySet<Control>
  /** Why guidance is withheld, when it is. */
  guidanceWhy: string | null
  /**
   * Its settled control as structure, not words: held (as its view reports, or by a Hold its runtime confirmed, no
   * Resume settled since), stopped, or neither. A Hold or Stop still under way is neither.
   */
  settled: 'held' | 'stopped' | null
}

const named = (a: string | null, b: string | null) => a === null || b === null || a === b

/**
 * Whether a command sent for `sent` fences the work shown as `shown`: the same project, work, assignment and generation,
 * and an attempt and session that are the same or unnamed on either side.
 */
export const covers = (shown: CommandTarget, sent: CommandTarget) =>
  shown.project_id === sent.project_id &&
  shown.work_id === sent.work_id &&
  shown.assignment_id === sent.assignment_id &&
  shown.assignment_generation === sent.assignment_generation &&
  named(shown.attempt_id, sent.attempt_id) &&
  named(shown.session_id, sent.session_id)

const phaseOf = (k: Known): Phase => {
  if (!unresolved(k)) return 'settled' // a control is resolved only once its effect is settled with evidence
  return uncertain(k) ? 'unconfirmed' : 'requested'
}

interface Sent {
  kind: Control
  phase: Phase
}

/** Every control sent for the work that covers it, oldest first, refused ones aside. */
function controlsFor(known: readonly Known[], target: CommandTarget): Sent[] {
  return known.flatMap((k): Sent[] => {
    const { kind } = k.command
    if (kind === 'guidance' || k.receipt?.admission === 'rejected' || !covers(target, k.command.target)) return []
    return [{ kind, phase: phaseOf(k) }]
  })
}

const WAITING = 'Waiting for the runtime to confirm.'
const FOLLOWED = 'The existing request is still followed.'

const SAID: Readonly<Record<Control, Readonly<Record<Phase, ControlSaid | null>>>> = {
  hold: {
    requested: { status: 'Hold requested', tone: 'amber', sentence: WAITING },
    unconfirmed: { status: 'Hold not confirmed', tone: 'amber', sentence: FOLLOWED },
    settled: { status: 'Held', tone: 'muted', sentence: 'Its runtime confirmed the hold.' },
  },
  resume: {
    requested: { status: 'Resume requested', tone: 'amber', sentence: WAITING },
    unconfirmed: { status: 'Resume not confirmed', tone: 'amber', sentence: FOLLOWED },
    settled: null, // running again: the work's view says so
  },
  stop: {
    requested: { status: 'Stop requested', tone: 'amber', sentence: WAITING },
    unconfirmed: { status: 'Stop not confirmed', tone: 'amber', sentence: FOLLOWED },
    settled: { status: 'Stopped', tone: 'muted', sentence: 'Its runtime confirmed the stop.' },
  },
}

/** Its view's own word, when no receipt here proves it: held or stopped, as its runtime reports. */
const OBSERVED_SAID: Readonly<Record<'held' | 'stopped', ControlSaid>> = {
  held: { status: 'Held', tone: 'muted', sentence: 'Its runtime reports it held.' },
  stopped: { status: 'Stopped', tone: 'muted', sentence: 'Its runtime reports it stopped.' },
}

const HELD_WHY = 'No guidance to held work: it would start a new turn.'
const UNDER_WAY: Readonly<Record<Control, string>> = {
  hold: 'No guidance while its Hold is under way.',
  resume: 'No guidance while its Resume is under way.',
  stop: 'No guidance while its Stop is under way.',
}
const ALL: readonly CommandKind[] = ['guidance', 'hold', 'resume', 'stop']

/**
 * The work's control state: what its status says, what is withheld, what may be tried again and why guidance isn't
 * offered. Its stopped state (a Stop settled, or its view's) withholds everything; any Stop not yet settled withholds
 * guidance; the latest of Hold and Resume, or its view's held state, decides the hold's fence.
 */
export function workState(known: readonly Known[], target: CommandTarget | null, observed: Observed): WorkState {
  const sent = target ? controlsFor(known, target) : []
  const stopped = sent.find((c) => c.kind === 'stop' && c.phase === 'settled')
  if (stopped || observed === 'stopped') return stoppedState(Boolean(stopped))
  const pause = pauseOf(sent, observed)
  const stop = sent.findLast((c) => c.kind === 'stop') // not settled, since none is
  return {
    said: (stop && SAID.stop[stop.phase]) ?? pause.said,
    fenced: fencesOf(Boolean(stop), pause),
    reconcilable: new Set(sent.filter((c) => c.phase !== 'settled').map((c) => c.kind)),
    guidanceWhy: stop ? UNDER_WAY.stop : pause.why,
    settled: pause.settled ? 'held' : null,
  }
}

/** Stopped, by a Stop settled here or as its view reports: nothing more is sent, nor tried again. */
const stoppedState = (byReceipt: boolean): WorkState => ({
  said: byReceipt ? SAID.stop.settled : OBSERVED_SAID.stopped,
  fenced: new Set(ALL),
  reconcilable: new Set(),
  guidanceWhy: 'No guidance to stopped work.',
  settled: 'stopped',
})

interface Pause {
  /** Held, or a Hold in play: no second Hold, no guidance. */
  held: boolean
  /** A Resume not yet settled: no Resume, Hold or guidance either. */
  resuming: boolean
  said: ControlSaid | null
  why: string | null
  /** Held as settled: by its view, or by a Hold its runtime confirmed; not a Hold still under way. */
  settled: boolean
}

/** The hold's part, from the latest Hold or Resume sent and from its view: held, resuming, or neither. */
function pauseOf(sent: readonly Sent[], observed: Observed): Pause {
  const last = sent.findLast((c) => c.kind === 'hold' || c.kind === 'resume')
  const unsettled = last !== undefined && last.phase !== 'settled'
  // Held by its own Hold, or by its view, unless a Resume here settled since (its view may lag behind the receipt).
  const held = last?.kind === 'hold' || (observed === 'held' && last?.phase !== 'settled')
  const resuming = last?.kind === 'resume' && unsettled
  const said = (last && SAID[last.kind][last.phase]) ?? (held ? OBSERVED_SAID.held : null)
  return {
    held,
    resuming,
    said,
    why: pauseWhy(held, resuming, unsettled ? last : undefined),
    settled: heldSettled(last, observed),
  }
}

/** Held as settled: its view says held and no Resume settled here since, or its own Hold here settled. */
function heldSettled(last: Sent | undefined, observed: Observed): boolean {
  if (observed === 'held') return !(last?.kind === 'resume' && last.phase === 'settled')
  return last?.kind === 'hold' && last.phase === 'settled'
}

/** Why guidance is withheld for the hold's part: a Hold or Resume under way, held work, or nothing. */
function pauseWhy(held: boolean, resuming: boolean, underWay: Sent | undefined): string | null {
  if (underWay && (held || resuming)) return UNDER_WAY[underWay.kind]
  return held ? HELD_WHY : null
}

/** What is withheld: guidance while any Stop is unsettled or the work is held or resuming; Hold and Resume as above. */
function fencesOf(stopUnsettled: boolean, { held, resuming }: Pause): Set<CommandKind> {
  const fenced = new Set<CommandKind>()
  if (stopUnsettled || held || resuming) fenced.add('guidance')
  if (held || resuming) fenced.add('hold')
  if (resuming) fenced.add('resume')
  return fenced
}

/** What may still be offered: everything its view offers that the work's control state doesn't withhold. */
export const stillOffered = (offer: readonly Offer[], state: WorkState): Offer[] =>
  offer.filter((o) => !state.fenced.has(o.kind))

/**
 * What may be tried again from here, always with its own operation: what is still offered, and the controls in play
 * (where they were offered at all), so an unconfirmed Hold or Stop is reconciled. A guidance whose reply was lost isn't
 * sent again past a fence: it would deliver new input after it.
 */
export function retryKinds(offer: readonly Offer[], state: WorkState): Set<CommandKind> {
  const kinds = new Set(stillOffered(offer, state).map((o) => o.kind))
  for (const o of offer) if (o.kind !== 'guidance' && state.reconcilable.has(o.kind)) kinds.add(o.kind)
  return kinds
}

/**
 * Why guidance its view offers isn't offered now, and that a draft is only kept on this page, nothing more sent from
 * it: neither queued nor sent later (a draft can also hold the words of a guidance already sent whose reply was lost,
 * so it never claims they weren't sent); null when guidance isn't withheld.
 */
export function guidanceWithheld(offer: readonly Offer[], state: WorkState, draft: string): string | null {
  if (!state.guidanceWhy || !state.fenced.has('guidance') || !offer.some((o) => o.kind === 'guidance')) return null
  return draft.trim()
    ? `${state.guidanceWhy} What you wrote is kept on this page; nothing more is sent from it.`
    : state.guidanceWhy
}

/** The work's observed control, from a Tasks lifecycle: held or stopped, else nothing. */
export const observedOf = (lifecycle: string | null | undefined): Observed =>
  lifecycle === 'held' || lifecycle === 'stopped' ? lifecycle : null
