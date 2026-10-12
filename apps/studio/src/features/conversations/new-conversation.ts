// Starting a conversation as writing (docs/plans/conversations-start.md, C8): the question is what matters; the first
// message is optional and, left empty, is the question; the project's proposals waiting are offered to start from.
import type { MissionDecision } from '@sophia/contracts'
import type { ConversationAsk } from '../../api/vision.ts'

/** What A18's start sends: the words trimmed, an empty first message being the question itself. */
export function askOf(fields: ConversationAsk): ConversationAsk {
  const title = fields.title.trim()
  const text = fields.text.trim()
  return { title, text: text || title, askSophia: fields.askSophia }
}

/** A question is enough to start. */
export const startable = (fields: ConversationAsk): boolean => fields.title.trim() !== ''

/** How many of the proposals waiting are offered to start from. */
const STARTERS = 3

/**
 * The proposals waiting to start a conversation from, newest first, three at most: only those that fit a question
 * (`most` characters, A18's limit), leaving out the one already the question.
 */
export function startersOf(pending: readonly MissionDecision[] | undefined, question: string, most: number): string[] {
  const asked = question.trim()
  return (pending ?? [])
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((d) => d.statement)
    .filter((s) => s !== asked && s.length <= most)
    .slice(0, STARTERS)
}

/** Words that say nothing of what a question is about. */
const COMMON = new Set(
  (
    'what who whom whose when where why how which the and for are was were been should would could can does did our ' +
    'you your they them this that these those with from into about after before not any all but there here then than ' +
    'have has had will shall may might must its his her out get got just also very much more most some such'
  ).split(' '),
)

/** A title's own words: folded, accents off, three letters or more, common words left out, a final «s» dropped. */
function ownWords(title: string): Set<string> {
  const words = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !COMMON.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
  return new Set(words)
}

/**
 * Words that turn a question's meaning: a negation («not», «never», «without»; a «n't» counts as «not») and an order
 * («before» against «after»). Two titles alike in all else ask different things when one negates and the other does
 * not, or one says before where the other says after (Codex on #266).
 */
const NEGATIONS = new Set(['not', 'no', 'never', 'without', 'except', 'unless'])

/** What turns a title: whether it negates, and the order it names (before, after, or neither). */
function turnsOf(title: string): { negates: boolean; order: 'before' | 'after' | null } {
  const folded = title.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
  const words = folded.split(/[^\p{L}\p{N}]+/u)
  const negates = words.some((w) => NEGATIONS.has(w)) || /n['\u2019]t\b/u.test(folded)
  const before = words.includes('before')
  const after = words.includes('after')
  return { negates, order: before === after ? null : before ? 'before' : 'after' }
}

/** Whether two titles' turns agree: the same negation, and no order said one way in one and the other way in the other. */
function turnsAgree(a: string, b: string): boolean {
  const x = turnsOf(a)
  const y = turnsOf(b)
  return x.negates === y.negates && (x.order === null || y.order === null || x.order === y.order)
}

/** The least that says «about the same thing»: two shared words, and this share of the question's. */
const SHARED_LEAST = 2
const SHARE_LEAST = 0.6

/**
 * The conversation here that already asks what the question asks (docs/plans/same-question.md): the one sharing the
 * most of the question's own words, at least two and 60 % of them; the newest on a tie; null when none does.
 */
export function sameQuestion<C extends { id: string; title: string; lastAt: string }>(
  question: string,
  conversations: readonly C[],
): C | null {
  const asked = ownWords(question)
  if (asked.size < SHARED_LEAST) return null
  const scored = conversations
    .filter((c) => turnsAgree(question, c.title))
    .map((c) => {
      const own = ownWords(c.title)
      return { c, shared: [...asked].filter((w) => own.has(w)).length }
    })
    .filter((s) => s.shared >= SHARED_LEAST && s.shared / asked.size >= SHARE_LEAST)
    .toSorted((a, b) => b.shared - a.shared || Date.parse(b.c.lastAt) - Date.parse(a.c.lastAt))
  return scored[0]?.c ?? null
}

/** How long a question may be (A18's limit, the form's `maxLength`). */
export const QUESTION_LIMIT = 120

/** Words given as a question, fitted to its limit: cut at a word with an ellipsis when longer (docs/plans/ask-instead.md). */
export function fitQuestion(words: string): string {
  const text = words.trim()
  if (text.length <= QUESTION_LIMIT) return text
  const cut = text.slice(0, QUESTION_LIMIT - 1)
  const at = cut.lastIndexOf(' ')
  return `${(at > 0 ? cut.slice(0, at) : cut).trimEnd()}…`
}
