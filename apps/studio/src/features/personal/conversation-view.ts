// The personal conversation as the screen lays it out (direction C): one continuous conversation divided by day, turns
// from the same side grouped, Sophia's turn opening with her dot, her suggested note after the reply it belongs to,
// and the wait for her reply at the end. Pure: the component renders these rows and owns nothing but the scroll.
import type { PersonalSuggestion, PersonalTurn } from '@sophia/contracts'

/** Three quiet ways into a first conversation, gone after the first message. */
export const STARTERS = ['Something’s on my mind', 'Help me get ready for something', 'Just talk'] as const

/** A message the person sent that the server has not answered for yet (shown at once, then replaced). */
export interface Sending {
  text: string
  at: Date
}

export type SuggestionShown = 'open' | 'folded' | 'kept'

export type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'intro'; key: string; text: string }
  | { kind: 'starters'; key: string }
  | {
      kind: 'turn'
      key: string
      turn: PersonalTurn | null
      author: 'person' | 'sophia'
      text: string
      at: string
      first: boolean
    }
  | { kind: 'typing'; key: string; first: boolean }
  | { kind: 'failed'; key: string; turnId: string }
  | {
      kind: 'suggestion'
      key: string
      suggestion: PersonalSuggestion
      shown: SuggestionShown
      askedTurnId: string | null
    }

const DAY_MS = 86_400_000

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** "Today", "Yesterday", a weekday within the week, then the date ("Sep 21", with the year when it isn't this one). */
export function dayLabel(date: Date, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'long' })
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** A time the way the conversation shows it: 22:40. */
export const clockOf = (date: Date) =>
  date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

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

export function topicOf(text: string): string {
  const lower = text.toLowerCase()
  const hit = TOPICS.find(([re]) => re.test(lower))
  if (hit) return hit[1]
  const words = text
    .replace(/[.,;:?!]+/g, '')
    .split(/\s+/)
    .filter(Boolean)
  return words.slice(0, 3).join(' ').toLowerCase() + (words.length > 3 ? '…' : '')
}

/** Sophia's first words in a new conversation. Not a stored turn: the space's own introduction. */
export function introText(name: string | null): string {
  return `Hi${name ? ` ${name}` : ''}, I’m Sophia. This space is just for you: nothing here reaches your projects unless you carry it. What’s on your mind?`
}

interface Layout {
  rows: Row[]
  lastDay: number | null
  /** The side of the last turn row, or null when something else came between (a day, a suggestion). */
  lastSide: 'person' | 'sophia' | null
}

function addDay(layout: Layout, date: Date, now: Date): void {
  const day = startOfDay(date)
  if (layout.lastDay === day) return
  layout.rows.push({ kind: 'day', key: `day-${day}`, label: dayLabel(date, now) })
  layout.lastDay = day
  layout.lastSide = null
}

function addTurn(layout: Layout, turn: PersonalTurn, now: Date): void {
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

function addSuggestion(layout: Layout, turn: PersonalTurn, movedOn: boolean): void {
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
  turns: readonly PersonalTurn[]
  sending: Sending | null
  /** Sophia is writing her welcome back. */
  welcoming?: boolean
  now: Date
  name: string | null
  /** The first turn ever is loaded (or there is none): the introduction leads the conversation. */
  fromTheStart: boolean
  /** Sophia can answer here (a companion is set up): only then are there ways to start. */
  answers?: boolean
}

/**
 * The introduction leads a conversation from its start; ways to start follow while nothing has been said, where Sophia
 * can answer.
 */
function introduce(layout: Layout, { turns, sending, now, name, answers = true }: ConversationInput) {
  addDay(layout, turns[0] ? new Date(turns[0].createdAt) : now, now)
  layout.rows.push({ kind: 'intro', key: 'intro', text: introText(name) })
  layout.lastSide = 'sophia'
  const first = !sending && !turns.some((t) => t.author === 'person')
  if (answers && first) layout.rows.push({ kind: 'starters', key: 'starters' })
}

/** The rows of the conversation, in order. */
export function conversationRows(input: ConversationInput): Row[] {
  const { turns, sending, welcoming, now, fromTheStart } = input
  const layout: Layout = { rows: [], lastDay: null, lastSide: null }
  if (fromTheStart) introduce(layout, input)
  // Whether the person said something after a turn, without a pass over the rest for every turn.
  const lastAsked = turns.findLastIndex((t) => t.author === 'person')
  turns.forEach((turn, i) => {
    addTurn(layout, turn, now)
    if (turn.author === 'person' && turn.reply === 'failed') {
      layout.rows.push({ kind: 'failed', key: `failed-${turn.id}`, turnId: turn.id })
      layout.lastSide = null
    }
    const movedOn = !!sending || i < lastAsked
    addSuggestion(layout, turn, movedOn)
  })
  if (sending) {
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
export function opensWithIntro(turns: readonly PersonalTurn[], earlier: boolean, now: Date): boolean {
  const first = turns[0]
  if (!first) return !earlier
  return !earlier && startOfDay(new Date(first.createdAt)) === startOfDay(now)
}

/** A welcome back is due: the last turn is more than an hour old and is not already one (the server decides too). */
export function welcomeDue(turns: readonly PersonalTurn[], now: Date): boolean {
  const last = turns.at(-1)
  if (!last) return false
  const greeting = last.author === 'sophia' && last.replyTo === null
  return !greeting && now.getTime() - new Date(last.createdAt).getTime() > 3_600_000
}

/** The conversation shown: what was read back (only what comes before the window the space lists), then the window. */
export function withReadBack(older: readonly PersonalTurn[], listed: readonly PersonalTurn[]): readonly PersonalTurn[] {
  const first = listed[0]?.seq ?? Number.POSITIVE_INFINITY
  const before = older.filter((t) => t.seq < first)
  return before.length === 0 ? listed : [...before, ...listed]
}

/**
 * Once the person has read back, turns that leave the window as new ones come stay with what was read, in order and
 * once, so nothing read goes missing between the two. The same array when none left.
 */
export function keptOnReadBack(
  read: readonly PersonalTurn[],
  before: readonly PersonalTurn[],
  after: readonly PersonalTurn[],
): readonly PersonalTurn[] {
  const first = after[0]?.seq ?? Number.POSITIVE_INFINITY
  const have = new Set(read.map((t) => t.seq))
  const left = before.filter((t) => t.seq < first && !have.has(t.seq))
  return left.length === 0 ? read : [...read, ...left].toSorted((a, b) => a.seq - b.seq)
}

/** What was read back of a long conversation: in which epoch of the space, its turns (oldest first), and if more exist. */
export interface ReadBackState {
  epoch: number
  turns: readonly PersonalTurn[]
  more: boolean
}

/**
 * What was read back, as the space is read again: in the same epoch, kept, with the turns that left the window
 * (keptOnReadBack); in another (an erasure), let go.
 */
export function backOnSpaceRead(
  now: ReadBackState | null,
  before: readonly PersonalTurn[],
  space: { epoch: number; turns: readonly PersonalTurn[] },
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
  page: { turns: readonly PersonalTurn[]; earlier: boolean },
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
      if (!current.topics.includes(topic)) current.topics.push(topic)
    }
  }
  return days.map((d) => ({ key: d.key, label: d.label, topics: d.topics.slice(0, 2).join(' · ') || 'Just started' }))
}

/** What "Note this" starts from: Sophia's suggestion for that turn when it isn't kept yet, else the words, cut short. */
export function notePrefill(text: string, suggestion: PersonalSuggestion | null): string {
  if (suggestion && suggestion.state !== 'kept') return suggestion.text
  return text.length > 72 ? `${text.slice(0, 70).trimEnd()}…` : text
}

/** The suggestion Sophia made in her reply to `turnId`, if any. */
export function suggestionFor(turns: readonly PersonalTurn[], turnId: string): PersonalSuggestion | null {
  return turns.find((t) => t.replyTo === turnId)?.suggestion ?? null
}

/**
 * What a screen reader hears when the conversation is read again: Sophia's new turns, all of them in order; a reply that
 * failed (also while a later message waits, and again after Ask again); or Sophia beginning to write. `previous` is null
 * at a load (the first read after opening or unlocking), so nothing already there is read out. Null: nothing to say.
 */
export function heard(
  previous: readonly PersonalTurn[] | null,
  next: readonly PersonalTurn[],
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
