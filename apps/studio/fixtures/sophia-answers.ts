// What the fixture's Sophia answers in a conversation (docs/plans/conversations-answers.md, C6): the three presses under
// the field answered with what the conversation and the project hold, in her light text (sophia-text.ts), as A18's
// runtime would. She reads what members said, never the presses nor her own answers. Anything else asked gets an honest
// line, never a promise. Every word is synthetic.
import type { ConversationMessage } from '../src/api/vision.ts'
import { conversationMission } from './conversation-data.ts'
import { membership } from './data.ts'

/** The presses under the field (ConversationComposer's QUICK_ASKS): asked of her, never a point anyone made. */
const PRESSES: ReadonlySet<string> = new Set(['Sum it up', 'What’s still open?', 'What did we decide?'])

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const dayOf = (iso: string) => DAY.format(new Date(iso))

/** Words too common to tie a conversation to a decision. */
const COMMON: ReadonlySet<string> = new Set([
  'with',
  'then',
  'when',
  'that',
  'this',
  'what',
  'have',
  'from',
  'they',
  'there',
  'their',
  'every',
  'open',
  'still',
  'into',
  'just',
  'only',
])

/** The words of a line worth matching: four letters or more, a plural's «s» dropped, the common ones left out. */
const wordsOf = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 4)
      .map((w) => w.replace(/s$/, ''))
      .filter((w) => !COMMON.has(w)),
  )

/** What members said: their messages, not the presses asked of her, not her answers. */
const saidBy = (messages: readonly ConversationMessage[]) =>
  messages.filter((m) => m.author === 'member' && !PRESSES.has(m.text.trim()))

/** Who said it, to her: the one asking is «You», as the thread says it. */
const who = (m: ConversationMessage) => (m.actorId === membership.actorId ? 'You' : (m.name ?? 'A member'))

/** Each member's latest point, in the order they last spoke. */
function points(said: readonly ConversationMessage[]): ConversationMessage[] {
  const last = new Map<string, ConversationMessage>()
  for (const m of said) {
    last.delete(m.actorId ?? m.name ?? '')
    last.set(m.actorId ?? m.name ?? '', m)
  }
  return [...last.values()]
}

/** The project's accepted decisions what members said touches, decided before the conversation started. */
function touched(said: readonly ConversationMessage[], started: string) {
  const words = wordsOf(said.map((m) => m.text).join(' '))
  return conversationMission().constraints.filter(
    (d) => d.decidedAt !== null && d.decidedAt < started && [...wordsOf(d.statement)].some((w) => words.has(w)),
  )
}

/** The last question in a message: its sentence ending in «?». */
const questionIn = (text: string) => /[^.!?]*\?$/.exec(text.trim())?.[0].trim() ?? null

/** One line of a list: a member's words on one line, never shaped as her own list. */
const oneLine = (text: string) => text.replace(/\s+/gu, ' ').trim()

function sumUp(messages: readonly ConversationMessage[]): string {
  const said = saidBy(messages)
  if (said.length === 0) return 'Nobody has said anything here yet: there is nothing to sum up.'
  const lines = points(said).map((m) => `- ${who(m)}: ${oneLine(m.text)}`)
  const before = touched(said, messages[0]?.at ?? '').map(
    (d) => `Already decided on ${dayOf(d.decidedAt ?? '')}: “${d.statement}”.`,
  )
  return ['Where it stands:', ...lines, '', ...before, 'Nothing in this conversation is decided yet.'].join('\n')
}

/** Questions members asked that nobody has answered since: no later message from anyone else. */
function unanswered(messages: readonly ConversationMessage[]): string[] {
  return saidBy(messages).flatMap((m) => {
    const at = messages.indexOf(m)
    const replied = messages.slice(at + 1).some((later) => later.actorId !== m.actorId || later.author !== m.author)
    const question = questionIn(m.text)
    return question && !replied ? [question] : []
  })
}

function stillOpen(messages: readonly ConversationMessage[]): string {
  const waiting = conversationMission().pending.map((d) => `${d.statement} · proposed, not decided`)
  const open = [...unanswered(messages), ...waiting]
  if (open.length === 0) return 'Nothing is waiting for an answer or a decision here.'
  return ['Still open:', ...open.map((o) => `- ${oneLine(o)}`)].join('\n')
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

/** Sophia's answer to `asked` in a conversation of `messages` (oldest first, the press last among them). */
export function answerFor(asked: string, messages: readonly ConversationMessage[]): string {
  // What came before the press is read: the press itself is no point and no open question.
  const before = messages.slice(
    0,
    messages.findLastIndex((m) => m.text === asked),
  )
  if (asked === 'Sum it up') return sumUp(before)
  if (asked === 'What’s still open?') return stillOpen(before)
  if (asked === 'What did we decide?') return decided()
  return 'I’ve read it with the rest of the conversation. Ask me to sum it up, or what’s still open, when you want it in one read.'
}
