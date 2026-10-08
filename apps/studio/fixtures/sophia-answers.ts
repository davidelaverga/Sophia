// What the fixture's Sophia answers in a conversation (docs/plans/conversations-answers.md, C6): the three presses under
// the field answered with what the conversation and the project hold, in her light text (sophia-text.ts), as A18's
// runtime would. Anything else asked gets an honest line, never a promise. Every word is synthetic.
import type { ConversationMessage } from '../src/api/vision.ts'
import { conversationMission } from './conversation-data.ts'
import { membership } from './data.ts'

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const dayOf = (iso: string) => DAY.format(new Date(iso))

/** The words of a line worth matching: four letters or more, a plural's «s» dropped. */
const wordsOf = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 4)
      .map((w) => w.replace(/s$/, '')),
  )

/** Each member's latest point, in the order they last spoke; the press itself left out. */
function points(messages: readonly ConversationMessage[], asked: string): ConversationMessage[] {
  const said = messages.filter((m) => m.author === 'member' && m.text !== asked)
  const last = new Map<string, ConversationMessage>()
  for (const m of said) {
    last.delete(m.actorId ?? m.name ?? '')
    last.set(m.actorId ?? m.name ?? '', m)
  }
  return [...last.values()]
}

/** The project's accepted decisions this conversation's words touch, decided before it started. */
function touched(messages: readonly ConversationMessage[]) {
  const said = wordsOf(messages.map((m) => m.text).join(' '))
  const started = messages[0]?.at ?? ''
  return conversationMission().constraints.filter(
    (d) => d.decidedAt !== null && d.decidedAt < started && [...wordsOf(d.statement)].some((w) => said.has(w)),
  )
}

/** Who said it, to her: the one asking is «You», as the thread says it. */
const who = (m: ConversationMessage) => (m.actorId === membership.actorId ? 'You' : (m.name ?? 'A member'))

/** The last question in a message: its sentence ending in «?». */
const questionIn = (text: string) => /[^.!?]*\?$/.exec(text.trim())?.[0].trim() ?? null

function sumUp(messages: readonly ConversationMessage[], asked: string): string {
  const lines = points(messages, asked).map((m) => `- ${who(m)}: ${m.text}`)
  const before = touched(messages).map((d) => `Already decided on ${dayOf(d.decidedAt ?? '')}: “${d.statement}”.`)
  return ['Where it stands:', ...lines, '', ...before, 'Nothing in this conversation is decided yet.'].join('\n')
}

function stillOpen(messages: readonly ConversationMessage[], asked: string): string {
  const asks = messages
    .filter((m) => m.author === 'member' && m.text !== asked)
    .map((m) => questionIn(m.text))
    .filter((q): q is string => q !== null)
  const waiting = conversationMission().pending.map((d) => `${d.statement} · proposed, not decided`)
  const open = [...asks, ...waiting]
  if (open.length === 0) return 'Nothing is waiting for an answer or a decision here.'
  return ['Still open:', ...open.map((o) => `- ${o}`)].join('\n')
}

function decided(): string {
  const all = conversationMission().constraints.filter((d) => d.decidedAt !== null)
  return [
    'Decided in this project:',
    ...all.map((d) => `- ${d.statement} · ${dayOf(d.decidedAt ?? '')}`),
    '',
    'Nothing was decided in this conversation itself.',
  ].join('\n')
}

/** Sophia's answer to `asked` in a conversation of `messages` (oldest first). */
export function answerFor(asked: string, messages: readonly ConversationMessage[]): string {
  if (asked === 'Sum it up') return sumUp(messages, asked)
  if (asked === 'What’s still open?') return stillOpen(messages, asked)
  if (asked === 'What did we decide?') return decided()
  return 'I’ve read it with the rest of the conversation. Ask me to sum it up, or what’s still open, when you want it in one read.'
}
