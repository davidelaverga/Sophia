// The personal conversation as the screen lays it out (direction C): one continuous conversation divided by day, turns
// from the same side grouped, Sophia's turn opening with her dot, her suggested note after the reply it belongs to,
// and the wait for her reply at the end. Pure: the component renders these rows and owns nothing but the scroll.
//
// A controlled space's turns (A54, INC03-DES-001) are shown as they are read: a message of yours whose answer was held,
// withdrawn or cancelled says so under it, in words taken only from its control and its view, and offers what was kept
// aside of an answer to read (its owner's only). Nothing says when an answer came, or that a withdrawn one never did.
import type { PersonalAnswerControlView, PersonalControlledTurn, PersonalSuggestion } from '@sophia/contracts'
import type { ShownTurn } from '../../api/personal.ts'
import { ARRIVALS, arriving, type Way } from './arrive.ts'
import { clip, lengthOf } from './characters.ts'
import { clock, dayLabel as dayLabelWords } from '../../app/time-words.ts'

/** Three quiet ways into a first conversation, gone after the first message. */
export const STARTERS = ['Something’s on my mind', 'Help me get ready for something', 'Just talk'] as const
const STARTER_WAYS: readonly Way[] = STARTERS.map((words) => ({ label: words, note: null, words }))

/** A message the person sent that the server has not answered for yet (shown at once, then replaced). */
export interface Sending {
  text: string
  at: Date
  /** The epoch of the space it was sent from: over a space of another (an erasure since), it isn't shown. */
  epoch: number
}

export type SuggestionShown = 'open' | 'folded' | 'kept'

export type Row =
  | {
      kind: 'day'
      key: string
      label: string
      /** A moment the day carries: where you began, time together, or how long since the day before. */
      note: string | null
    }
  | { kind: 'intro'; key: string; text: string }
  /** Ways into a first conversation; the session to get ready for leads them, when there is one (arrive.ts). */
  | { kind: 'starters'; key: string; ways: readonly Way[] }
  /** How you arrive, under her first line of a new day; the session to get ready for leads them too. */
  | { kind: 'arrive'; key: string; ways: readonly Way[] }
  | {
      kind: 'turn'
      key: string
      turn: ShownTurn | null
      author: 'person' | 'sophia'
      text: string
      at: string
      first: boolean
    }
  | { kind: 'typing'; key: string; first: boolean }
  | { kind: 'failed'; key: string; turnId: string }
  /** Under a message of yours kept without asking her (A52's `recorded`): said quietly, nothing to press, no wait. */
  | { kind: 'recorded'; key: string; turnId: string }
  /**
   * Under a message of yours in a controlled space: how its answer stands (held, withdrawn, cancelled), when its control
   * says so, and what was kept aside of an answer to it, to read (A54's withheld results, its owner's only).
   */
  | { kind: 'control'; key: string; turnId: string; line: string | null; kept: readonly KeptAnswer[] }
  /** A controlled space whose latest read failed: what is shown is as of its last whole read, said so, to read again. */
  | { kind: 'stale'; key: string; asOf: string }
  | {
      kind: 'suggestion'
      key: string
      suggestion: PersonalSuggestion
      shown: SuggestionShown
      askedTurnId: string | null
    }

/**
 * An answer kept aside, not part of the conversation: the call it came from, its words, the note it suggested, and when
 * it was kept aside (A54's withheld `at`: when it was retained, never when it was written).
 */
export interface KeptAnswer {
  callId: string
  text: string
  suggestion: string | null
  at: string
}

const DAY_MS = 86_400_000

/** What a message kept without asking Sophia says under it: kept, and that she was not asked (nor is she writing). */
export const RECORDED = 'Kept — not asked yet'

/** A turn of a controlled space (A54's, with its input), told apart by its shape, never cast from A10's. */
const controlledTurn = (turn: ShownTurn): turn is PersonalControlledTurn => 'input' in turn

/** A message of yours kept without asking her (A52): it waits for nothing, and nothing is written from it. */
export const held = (turn: ShownTurn): boolean => turn.author === 'person' && turn.reply === 'recorded'

/** Why a held message waits, as its control says (A54's heldReason). */
const HELD_BECAUSE: Record<NonNullable<PersonalAnswerControlView['control']['heldReason']>, string> = {
  prior_in_progress: 'waits for the earlier answer',
  prior_cost_unresolved: 'waits until the earlier cost is settled',
  admission_off: 'answers are off',
  profile_unavailable: 'Sophia can’t answer here now',
  payer_unavailable: 'no one can pay for it now',
}

/**
 * When a message's answer was withdrawn, as its control says (A54's withdrawnPhase); never whether one came, or when.
 * after_launch is recorded once a launch was begun, before anything was prepared or asked (0103's begin_launch): work
 * may have started, not that Sophia was asked. after_publication: her answer to it was already published.
 */
const WITHDRAWN_WHEN: Record<NonNullable<PersonalAnswerControlView['control']['withdrawnPhase']>, string> = {
  before_admission: 'Cancelled before it was sent to Sophia',
  before_reservation: 'Withdrawn before Sophia was asked',
  before_launch: 'Withdrawn before Sophia was asked',
  after_launch: 'Withdrawn; work may already have started',
  after_publication: 'Withdrawn after her answer was published',
}

/**
 * What is said under a held message (its control's state is held: only then): held, to replace an earlier one if it
 * does, and why it waits. A replacement that became active keeps its link, and says nothing of being held.
 */
function heldLine(view: PersonalAnswerControlView | undefined): string {
  const head = view?.control.replaces ? 'Held to replace an earlier message — not asked yet' : 'Held — not asked yet'
  const reason = view?.control.heldReason
  return reason ? `${head} · ${HELD_BECAUSE[reason]}` : head
}

/**
 * What a controlled message of yours says under it: null while its control is active (the conversation shows how it
 * stands, as for any message); held or withdrawn in its control's own terms, and a cost not settled yet, said so.
 */
export function controlLine(turn: PersonalControlledTurn, view: PersonalAnswerControlView | undefined): string | null {
  const state = view?.control.state ?? turn.input?.control
  if (!turn.input || state === undefined || state === 'active') return null
  const phase = view?.control.withdrawnPhase
  const line = state === 'held' ? heldLine(view) : phase ? WITHDRAWN_WHEN[phase] : 'Withdrawn'
  return view?.prior.financial === 'unresolved' ? `${line} · cost not settled yet` : line
}

/** What was kept aside of answers to an input (A54's withheld), in the order kept. */
export const keptOf = (view: PersonalAnswerControlView | undefined): readonly KeptAnswer[] =>
  (view?.withheld ?? []).map((w) => ({ callId: w.callId, text: w.text, suggestion: w.suggestion, at: w.at }))

/** A turn with its input's control not active: it can't be asked again the old way (only a failed one can). */
const controlledAway = (turn: ShownTurn): boolean =>
  controlledTurn(turn) && turn.input !== null && turn.input.control !== 'active'

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** "Today", "Yesterday", a weekday within the week, then the date (app/time-words.ts); never ahead. */
export const dayLabel = (date: Date, now: Date): string => dayLabelWords(date, now.getTime(), { past: true })

/** A time the way the conversation shows it: 22:40. */
export const clockOf = (date: Date) => clock(date)

/** What a message is about, in two or three words, the way Sophia would name it back. */
const TOPICS: ReadonlyArray<readonly [RegExp, string]> = [
  [/on my mind/, 'what’s on your mind'],
  [/get ready|prepare/, 'getting ready'],
  [/just talk/, 'a chat'],
  [/story|narrative/, 'the story'],
  [/number|metric|revenue/, 'the numbers'],
  [/pitch|deck|slide|present|investor|demo/, 'the pitch'],
  [/sleep|tired|exhaust|insomnia/, 'sleep'],
  [/writ|journal|diary/, 'writing it down'],
  [/sister|brother|mom|mum|dad|friend|partner|family/, 'someone close'],
  [/anx|nervous|worr|scared|afraid|stress/, 'nerves'],
]

/**
 * A topic Sophia names stays as she names it; otherwise your own words are quoted as you wrote them, names and «I»
 * keeping their capitals, up to the first sentence's end (docs/plans/personal-day-menu.md).
 */
export function topicOf(text: string): string {
  const lower = text.toLowerCase()
  const hit = TOPICS.find(([re]) => re.test(lower))
  if (hit) return hit[1]
  const words = (text.split(/[.?!]/)[0] ?? '').replace(/[,;:]/g, '').split(/\s+/).filter(Boolean)
  return words.slice(0, 3).join(' ') + (words.length > 3 ? '…' : '')
}

/** What Find asks Sophia when nothing matches: the words looked for, as typed (docs/plans/find-ask-sophia.md). */
export const askAbout = (query: string): string => `What did I tell you about ${query.trim()}?`

/**
 * Sophia's first words in a new conversation. Not a stored turn: the space's own introduction. Where she can't answer
 * it asks nothing (docs/plans/home-no-companion.md).
 */
export function introText(name: string | null, answers = true): string {
  const intro = `Hi${name ? ` ${name}` : ''}, I’m Sophia. This space is just for you: nothing here reaches your projects unless you carry it.`
  return answers ? `${intro} What’s on your mind?` : intro
}

interface Layout {
  rows: Row[]
  lastDay: number | null
  /** The conversation's first day, when it is read from its first turn (whole). */
  began: number | null
  now: Date
  /** The side of the last turn row, or null when something else came between (a day, a suggestion). */
  lastSide: 'person' | 'sophia' | null
}

/** Milestones short of a year, by months together; then every year. */
const MONTHS_TOGETHER = new Map([
  [1, 'a month together'],
  [3, 'three months together'],
  [6, 'six months together'],
])
const YEARS = ['a year', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'].map((n, i) =>
  i ? `${n} years` : n,
)

/** How many months on from `began` the day is, when it is that day of the month (the month's last, if shorter). */
function monthsOn(began: Date, day: Date): number | null {
  const months = (day.getFullYear() - began.getFullYear()) * 12 + day.getMonth() - began.getMonth()
  const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate()
  return months > 0 && day.getDate() === Math.min(began.getDate(), last) ? months : null
}

function together(months: number): string | null {
  if (months % 12 !== 0) return MONTHS_TOGETHER.get(months) ?? null
  const years = months / 12
  return `${YEARS[years - 1] ?? `${String(years)} years`} together`
}

/**
 * The moment a day carries, if any (personal-moments.md §2): the first day, once known, is where you began; today, a
 * month, three, six months or a year on from it, the time together; else a day a week or more after the one before
 * says how long it was.
 */
function dayNote(day: number, before: number | null, layout: Layout): string | null {
  const today = startOfDay(layout.now)
  // Before today only: a first turn stamped a little ahead (a skewed clock) is not yet where you began.
  if (layout.began !== null && day === layout.began && day < today) return 'Where you began'
  const months = layout.began !== null && day === today ? monthsOn(new Date(layout.began), new Date(day)) : null
  const milestone = months === null ? null : together(months)
  if (milestone) return milestone
  const away = before === null ? 0 : Math.round((day - before) / DAY_MS)
  return away >= 7 ? `${String(away)} days later` : null
}

function addDay(layout: Layout, date: Date, now: Date): void {
  const day = startOfDay(date)
  if (layout.lastDay === day) return
  layout.rows.push({
    kind: 'day',
    key: `day-${day}`,
    label: dayLabel(date, now),
    note: dayNote(day, layout.lastDay, layout),
  })
  layout.lastDay = day
  layout.lastSide = null
}

function addTurn(layout: Layout, turn: ShownTurn, now: Date): void {
  const at = new Date(turn.createdAt)
  addDay(layout, at, now)
  const first = layout.lastSide !== turn.author
  layout.rows.push({ kind: 'turn', key: turn.id, turn, author: turn.author, text: turn.text, at: clockOf(at), first })
  layout.lastSide = turn.author
}

/**
 * A suggestion is open until the person moves on: then it folds into a quiet line they can still act on. One they let
 * go is deleted (it never comes back to show).
 */
function suggestionShown(state: PersonalSuggestion['state'], movedOn: boolean): SuggestionShown {
  if (state === 'kept') return 'kept'
  return movedOn ? 'folded' : 'open'
}

function addSuggestion(layout: Layout, turn: ShownTurn, movedOn: boolean): void {
  if (!turn.suggestion) return
  const shown = suggestionShown(turn.suggestion.state, movedOn)
  layout.rows.push({
    kind: 'suggestion',
    key: `sg-${turn.suggestion.id}`,
    suggestion: turn.suggestion,
    shown,
    askedTurnId: turn.replyTo,
  })
  layout.lastSide = null
}

export interface ConversationInput {
  turns: readonly ShownTurn[]
  sending: Sending | null
  /** Sophia is writing her welcome back. */
  welcoming?: boolean
  now: Date
  name: string | null
  /** The first turn ever is loaded (or there is none): the introduction leads the conversation. */
  fromTheStart: boolean
  /** Sophia can answer here (a companion is set up): only then are there ways to start. */
  answers?: boolean
  /** A session in your projects to get ready for with her (readyFor), or none. */
  ready?: Way | null
  /** The conversation is read from its very first turn (no earlier days left to read): its first day is known. */
  whole?: boolean
  /** A controlled space's input views (A54), by input id: what its messages' status lines are taken from. */
  views?: ReadonlyMap<string, PersonalAnswerControlView> | undefined
  /** When the controlled read shown was made, if the latest one failed (its rows are as of then); else null. */
  stale?: string | null
}

/**
 * What is said under a turn after it: a failed reply to ask again (only where its control allows it, A3-R3 seam §7),
 * a message kept without asking her, or, in a controlled space, how its answer stands and what was kept aside.
 */
function addStatus(layout: Layout, turn: ShownTurn, views: ConversationInput['views']): void {
  if (turn.author !== 'person') return
  if (turn.reply === 'failed' && !controlledAway(turn)) {
    layout.rows.push({ kind: 'failed', key: `failed-${turn.id}`, turnId: turn.id })
    layout.lastSide = null
  }
  if (controlledTurn(turn) && turn.input) {
    const view = views?.get(turn.input.inputId)
    const line = controlLine(turn, view)
    const kept = keptOf(view)
    if (line !== null || kept.length > 0) {
      layout.rows.push({ kind: 'control', key: `control-${turn.id}`, turnId: turn.id, line, kept })
      layout.lastSide = null
      return
    }
  }
  if (held(turn)) {
    layout.rows.push({ kind: 'recorded', key: `recorded-${turn.id}`, turnId: turn.id })
    layout.lastSide = null
  }
}

/**
 * The introduction leads a conversation from its start; ways to start follow while nothing has been said, where Sophia
 * can answer.
 */
function introduce(layout: Layout, { turns, sending, now, name, answers = true, ready = null }: ConversationInput) {
  addDay(layout, turns[0] ? new Date(turns[0].createdAt) : now, now)
  layout.rows.push({ kind: 'intro', key: 'intro', text: introText(name, answers) })
  layout.lastSide = 'sophia'
  const first = !sending && !turns.some((t) => t.author === 'person')
  if (answers && first) {
    layout.rows.push({ kind: 'starters', key: 'starters', ways: ready ? [ready, ...STARTER_WAYS] : STARTER_WAYS })
  }
}

/**
 * Today's divider before anything is said, when today carries a moment (time together, time away). Not after a turn
 * stamped today or later (a skewed clock): today's divider is there already, or would come twice.
 */
function addTodaysMoment(layout: Layout): void {
  const today = startOfDay(layout.now)
  if (layout.lastDay === null || layout.lastDay >= today) return
  if (dayNote(today, layout.lastDay, layout)) addDay(layout, layout.now, layout.now)
}

/** A layout to fill, knowing the conversation's first day when it is read whole. */
function layoutFor({ turns, whole, now }: ConversationInput): Layout {
  const opening = turns[0]
  const began = whole && opening ? startOfDay(new Date(opening.createdAt)) : null
  return { rows: [], lastDay: null, began, now, lastSide: null }
}

/** What was just sent, at once, under its day. */
function addSending(layout: Layout, sending: Sending, now: Date): void {
  addDay(layout, sending.at, now)
  const first = layout.lastSide !== 'person'
  layout.rows.push({
    kind: 'turn',
    key: 'sending',
    turn: null,
    author: 'person',
    text: sending.text,
    at: clockOf(sending.at),
    first,
  })
  layout.lastSide = 'person'
}

/** After the turns of a controlled space whose latest read failed: it is as of its last whole read, said so. */
function addStale(layout: Layout, { stale }: ConversationInput): void {
  if (!stale) return
  layout.rows.push({ kind: 'stale', key: 'stale', asOf: stale })
  layout.lastSide = null
}

/** The rows of the conversation, in order. */
export function conversationRows(input: ConversationInput): Row[] {
  const { turns, sending, welcoming, now, fromTheStart } = input
  const layout = layoutFor(input)
  if (fromTheStart) introduce(layout, input)
  // Whether the person said something after a turn, without a pass over the rest for every turn.
  const lastAsked = turns.findLastIndex((t) => t.author === 'person')
  turns.forEach((turn, i) => {
    addTurn(layout, turn, now)
    addStatus(layout, turn, input.views)
    const movedOn = !!sending || i < lastAsked
    addSuggestion(layout, turn, movedOn)
  })
  addStale(layout, input)
  addTodaysMoment(layout)
  if ((input.answers ?? true) && arriving(turns, now, !!sending)) {
    const { ready } = input
    layout.rows.push({ kind: 'arrive', key: 'arrive', ways: ready ? [ready, ...ARRIVALS] : ARRIVALS })
  }
  if (sending) addSending(layout, sending, now)
  if (welcoming && !sending) addDay(layout, now, now)
  if (sending || welcoming || turns.some((t) => t.reply === 'pending')) {
    layout.rows.push({ kind: 'typing', key: 'typing', first: layout.lastSide !== 'sophia' })
  }
  return layout.rows
}

/**
 * Sophia's introduction leads a new conversation: none yet, or one that began today with its very first turn. Someone
 * returning to an older conversation is welcomed back instead (resume), never introduced again.
 */
/**
 * The conversation opens here: its rows offer the ways to start (nothing said yet, a new space or one erased), so it
 * starts at the page's optical centre rather than resting on the field (docs/plans/personal-first-talk.md).
 */
export const opensHere = (rows: readonly Row[]): boolean => rows.some((r) => r.kind === 'starters')

export function opensWithIntro(turns: readonly ShownTurn[], earlier: boolean, now: Date): boolean {
  const first = turns[0]
  if (!first) return !earlier
  return !earlier && startOfDay(new Date(first.createdAt)) === startOfDay(now)
}

/**
 * A turn that counts as being together (the welcome's activity): in a controlled space, as its read says (A54's
 * `activity`: a cancelled, never sent message doesn't; a withdrawn one that was sent does); else not one kept without
 * asking her (0099).
 */
const isActivity = (turn: ShownTurn): boolean => (controlledTurn(turn) ? turn.activity : !held(turn))

/**
 * A welcome back is due: the last turn, messages kept without asking her aside (as the server, 0099; a controlled
 * space's own activity), is more than an hour old and is not already one (the server decides too).
 */
export function welcomeDue(turns: readonly ShownTurn[], now: Date): boolean {
  const last = turns.findLast(isActivity)
  if (!last) return false
  const greeting = last.author === 'sophia' && last.replyTo === null
  return !greeting && now.getTime() - new Date(last.createdAt).getTime() > 3_600_000
}

/** The conversation shown: what was read back (only what comes before the window the space lists), then the window. */
export function withReadBack(older: readonly ShownTurn[], listed: readonly ShownTurn[]): readonly ShownTurn[] {
  const first = listed[0]?.seq ?? Number.POSITIVE_INFINITY
  const before = older.filter((t) => t.seq < first)
  return before.length === 0 ? listed : [...before, ...listed]
}

/**
 * Once the person has read back, turns that leave the window as new ones come stay with what was read, in order and
 * once, so nothing read goes missing between the two. The same array when none left.
 */
export function keptOnReadBack(
  read: readonly ShownTurn[],
  before: readonly ShownTurn[],
  after: readonly ShownTurn[],
): readonly ShownTurn[] {
  const first = after[0]?.seq ?? Number.POSITIVE_INFINITY
  const have = new Set(read.map((t) => t.seq))
  const left = before.filter((t) => t.seq < first && !have.has(t.seq))
  return left.length === 0 ? read : [...read, ...left].toSorted((a, b) => a.seq - b.seq)
}

/** What was read back of a long conversation: in which epoch of the space, its turns (oldest first), and if more exist. */
export interface ReadBackState {
  epoch: number
  turns: readonly ShownTurn[]
  more: boolean
}

/**
 * What was read back, as the space is read again: in the same epoch, kept, with the turns that left the window
 * (keptOnReadBack); in another (an erasure), let go.
 */
export function backOnSpaceRead(
  now: ReadBackState | null,
  before: readonly ShownTurn[],
  space: { epoch: number; turns: readonly ShownTurn[] },
): ReadBackState | null {
  if (now?.epoch !== space.epoch) return null
  const turns = keptOnReadBack(now.turns, before, space.turns)
  return turns === now.turns ? now : { ...now, turns }
}

/**
 * A page read back in `epoch`, joined to what was read back by the time it arrived (in the same epoch; turns may have
 * left the window into it meanwhile): in order, each turn once.
 */
export function withEarlierPage(
  now: ReadBackState | null,
  epoch: number,
  page: { turns: readonly ShownTurn[]; earlier: boolean },
): ReadBackState {
  const kept = now?.epoch === epoch ? now.turns : []
  const have = new Set(kept.map((t) => t.seq))
  const turns = [...page.turns.filter((t) => !have.has(t.seq)), ...kept].toSorted((a, b) => a.seq - b.seq)
  return { epoch, turns, more: page.earlier }
}

/** The days of the conversation for the "earlier" menu: each day and what the person talked about in it. */
export function daysOf(rows: readonly Row[]): Array<{ key: string; label: string; topics: string }> {
  const days: Array<{ key: string; label: string; topics: string[] }> = []
  for (const row of rows) {
    if (row.kind === 'day') days.push({ key: row.key, label: row.label, topics: [] })
    const current = days.at(-1)
    if (current && row.kind === 'turn' && row.author === 'person') {
      const topic = topicOf(row.text)
      // Listed once whatever its case: quoted words keep theirs (Codex on #291).
      if (!current.topics.some((t) => t.toLowerCase() === topic.toLowerCase())) current.topics.push(topic)
    }
  }
  return days.map((d) => ({ key: d.key, label: d.label, topics: d.topics.slice(0, 2).join(' · ') || 'Just started' }))
}

/** What "Note this" starts from: Sophia's suggestion for that turn when it isn't kept yet, else the words, cut short. */
export function notePrefill(text: string, suggestion: PersonalSuggestion | null): string {
  if (suggestion && suggestion.state !== 'kept') return suggestion.text
  return lengthOf(text) > 72 ? `${clip(text, 70).trimEnd()}…` : text
}

/** The suggestion Sophia made in her reply to `turnId`, if any. */
export function suggestionFor(turns: readonly ShownTurn[], turnId: string): PersonalSuggestion | null {
  return turns.find((t) => t.replyTo === turnId)?.suggestion ?? null
}

/**
 * What a screen reader hears when the conversation is read again: Sophia's new turns, all of them in order; a reply that
 * failed (also while a later message waits, and again after Ask again); or Sophia beginning to write. `previous` is null
 * at a load (the first read after opening or unlocking), so nothing already there is read out. Null: nothing to say.
 */
export function heard(
  previous: readonly ShownTurn[] | null,
  next: readonly ShownTurn[],
  writing: boolean,
  wasWriting: boolean,
): string | null {
  if (previous === null) return null
  const before = new Map(previous.map((t) => [t.id, t]))
  // Only what came after the newest turn shown: earlier days read back are not news.
  const newest = previous.reduce((most, t) => Math.max(most, t.seq), 0)
  const replies = next.filter((t) => t.author === 'sophia' && !before.has(t.id) && t.seq > newest)
  if (replies.length > 0) return replies.map((t) => `Sophia: ${t.text}`).join(' ')
  const failed = next.some((t) => t.author === 'person' && t.reply === 'failed' && before.get(t.id)?.reply !== 'failed')
  if (failed) return 'Sophia couldn’t answer this one.'
  return writing && !wasWriting ? 'Sophia is writing…' : null
}
