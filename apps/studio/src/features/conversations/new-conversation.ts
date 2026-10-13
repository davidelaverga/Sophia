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

/**
 * A title folded for comparing: accents off, lower case the same on every device (not the device's locale, where a
 * Turkish «I» folds to a dotless «ı»; Codex on #266).
 */
const fold = (title: string) => title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * A folded title's words, split at anything not a letter or a digit; a number's thousands separators dropped first, so
 * «1,000» and «1000» are one number (Codex on #274).
 */
const wordsOf = (title: string) =>
  fold(title)
    .replace(/(\p{N})[,.](?=\p{N}{3}(?!\p{N}))/gu, '$1')
    .split(/[^\p{L}\p{N}]+/u)

/** A title's own words: folded, accents off, three letters or more, common words left out, a final «s» dropped. */
function ownWords(title: string): Set<string> {
  const words = wordsOf(title)
    .filter((w) => w.length >= 3 && !COMMON.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
  return new Set(words)
}

/**
 * Words that turn a question's meaning: a negation («not», «never», «cannot»; a «n't» counts as «not»), an order
 * («before» against «after»), an action against its opposite («enable» against «disable») and a number. Two titles
 * alike in all else ask different things when one negates and the other does not, one says before where the other says
 * after, one acts where the other undoes, or each names a different number (Codex on #266).
 */
const NEGATIONS = new Set(['not', 'no', 'never', 'without', 'except', 'unless', 'cannot'])

/** Actions and their opposites, by their plain form. */
const OPPOSITES: readonly (readonly [string, string])[] = [
  ['enable', 'disable'],
  ['include', 'exclude'],
  ['add', 'remove'],
  ['allow', 'block'],
  ['accept', 'reject'],
  ['open', 'close'],
  ['start', 'stop'],
  ['show', 'hide'],
  ['increase', 'decrease'],
  ['raise', 'lower'],
  ['import', 'export'],
  ['hire', 'fire'],
]

/**
 * Whether the words hold this action in a plain form: «enable», «enables», «enabled», «enabling»; a final consonant
 * doubled too: «stopped», «stopping» (Codex on #274).
 */
function acts(words: readonly string[], base: string): boolean {
  return words.some((w) => formsOf(base).includes(w))
}

/** Forms no suffix makes: «shown», «hid», «hidden» (Codex on #274). */
const IRREGULAR: Readonly<Record<string, readonly string[]>> = { show: ['shown'], hide: ['hid', 'hidden'] }

/** An action's plain forms: its suffixed ones, a final consonant doubled, and the irregular ones. */
function formsOf(base: string): string[] {
  const stem = base.replace(/e$/u, '')
  const doubled = `${base}${base.at(-1) ?? ''}`
  return [
    base,
    `${base}s`,
    `${base}d`,
    `${base}ed`,
    `${stem}ing`,
    `${doubled}ed`,
    `${doubled}ing`,
    ...(IRREGULAR[base] ?? []),
  ]
}

/** Each action of a pair a title says, with the thing it is said of: «enable email», «disable sms». */
function aimsOf(words: readonly string[], pair: readonly string[]): string {
  return words
    .flatMap((w, i) => {
      const base = pair.find((b) => formsOf(b).includes(w))
      if (base === undefined) return []
      return [`${base} ${words.slice(i + 1).find((next) => next !== '' && !COMMON.has(next)) ?? ''}`]
    })
    .toSorted()
    .join('|')
}

/**
 * Whether two titles say an action against its opposite: of a pair, what one says is not what the other says. Both of
 * a pair said on each side is the same only when each is said of the same thing: «enable email and disable SMS» meets
 * itself, not «disable email and enable SMS» (Codex on #274).
 */
function opposed(x: readonly string[], y: readonly string[]): boolean {
  return OPPOSITES.some((pair) => {
    const said = (words: readonly string[]) => pair.filter((base) => acts(words, base)).join(' ')
    if (said(x) === '' || said(y) === '') return false
    if (said(x) !== said(y)) return true
    return said(x) === pair.join(' ') && aimsOf(x, pair) !== aimsOf(y, pair)
  })
}

/** The orders a title names, each with the word it is said of: «before review», «after approval». */
function ordersOf(words: readonly string[]): string[] {
  return words.flatMap((w, i) => {
    if (w !== 'before' && w !== 'after') return []
    const of = words.slice(i + 1).find((next) => next !== '' && !COMMON.has(next)) ?? ''
    return [`${w} ${of}`]
  })
}

/** The kinds of order a title names: before, after, both or neither. */
const kindsOf = (orders: readonly string[]) => new Set(orders.map((s) => s.split(' ')[0]))

/** A title's numbers, in one order, those inside a label too: «2025», «q4» (Codex on #274). */
const numbersOf = (words: readonly string[]) =>
  words
    .filter((s) => /\p{N}/u.test(s))
    .toSorted()
    .join(' ')

/** Whether a title negates: a negating word, or a «n't». */
const negates = (words: readonly string[], title: string) =>
  words.some((s) => NEGATIONS.has(s)) || /n['\u2019]t\b/u.test(fold(title))

/** Whether two titles name orders that disagree: one before where the other says after, or the two said in turn otherwise. */
function ordersDisagree(x: readonly string[], y: readonly string[]): boolean {
  // Both words said on either side: the same orders of the same things, or another question (Codex on #266).
  if (kindsOf(x).size > 1 || kindsOf(y).size > 1) return x.toSorted().join('|') !== y.toSorted().join('|')
  const [a] = kindsOf(x)
  const [b] = kindsOf(y)
  return a !== undefined && b !== undefined && a !== b
}

/** Whether two titles' turns agree: the same negation, no order, action or number said one way here and another there. */
function turnsAgree(a: string, b: string): boolean {
  const x = wordsOf(a)
  const y = wordsOf(b)
  if (negates(x, a) !== negates(y, b)) return false
  if (ordersDisagree(ordersOf(x), ordersOf(y))) return false
  if (opposed(x, y)) return false
  return numbersOf(x) === '' || numbersOf(y) === '' || numbersOf(x) === numbersOf(y)
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
  // Whole characters up to the limit (the field's, counted in UTF-16 units), never half of one: an emoji or a joined
  // sequence crossing the cut is left out whole (Codex on #267).
  let cut = ''
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    if (cut.length + segment.length > QUESTION_LIMIT - 1) break
    cut += segment
  }
  const at = cut.lastIndexOf(' ')
  return `${(at > 0 ? cut.slice(0, at) : cut).trimEnd()}…`
}
