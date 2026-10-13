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
    // A comma between thousands only: a point is a decimal («1.234» seconds is not 1234: Codex on #274).
    .replace(/(\p{N}),(?=\p{N}{3}(?!\p{N}))/gu, '$1')
    // A number's sign stays on it: «-5» is not «5» (Codex on #274).
    .replace(/(^|[^\p{L}\p{N}])[-\u2212](?=\p{N})/gu, '$1minus')
    // A contracted negation is a «not» of its own, so its scope is read as one (Codex on #274).
    .replace(/n['\u2019]t\b/gu, ' not')
    .split(/[^\p{L}\p{N}]+/u)

/**
 * A title's own words: folded, accents off, three letters or more, common words left out, an action as its plain form,
 * a final «s» dropped.
 */
function ownWords(title: string): Set<string> {
  return new Set(
    wordsOf(title)
      .filter((w) => w.length >= 3 && !COMMON.has(w))
      .map(plainWord),
  )
}

/**
 * A word as it is compared: an action in any of its forms is one word («enabled» shares «enable»), a final «s»
 * dropped; the same for the scoring and for the thing a turning word keeps (Codex on #274).
 */
function plainWord(w: string): string {
  const word = ACTIONS.get(w) ?? w
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word
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

/** Forms no suffix makes: «shown», «hid», «hidden» (Codex on #274). */
const IRREGULAR: Readonly<Record<string, readonly string[]>> = { show: ['shown'], hide: ['hid', 'hidden'] }

/**
 * An action's plain forms: «enable», «enables», «enabled», «enabling»; a final consonant doubled: «stopped»,
 * «stopping»; and the irregular ones (Codex on #274).
 */
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

/** Every action of a pair by its plain form, for reading a word as one. */
const ACTIONS = new Map(OPPOSITES.flat().flatMap((base) => formsOf(base).map((form) => [form, base] as const)))

/**
 * A title's turning words of one kind, in the order they come: its orders («before», «after»), its actions (of a pair,
 * by their plain form) or its numbers (any word with a digit: «2025», «q4»). Read in order, not as a bag, so the same
 * words in other places part two titles: «tier 1 … 2» from «tier 2 … 1», «enable … disable» from «disable … enable»;
 * and a passive voice or «before or after» reads as its active, its spelled-out twin (Codex on #266 and #274).
 */
const turnsOf = {
  orders: (words: readonly string[]) => words.filter((w) => w === 'before' || w === 'after'),
  actions: (words: readonly string[]) => words.flatMap((w) => ACTIONS.get(w) ?? []),
  numbers: (words: readonly string[]) => words.filter((w) => /\p{N}/u.test(w)),
}

/** A word that says what a question is about, as `ownWords` keeps it: an action excluded. */
const isThing = (w: string) => w.length >= 3 && !COMMON.has(w) && !ACTIONS.has(w) && !/\p{N}/u.test(w)

/**
 * Each turning word of a kind a title says, with the thing it is said of: the word after it («enable email», «before
 * review», «q1 revenue»), or for a participle («enabled», «hidden») the word before it, as a passive puts it. A thing
 * of more than one word across a change of voice is read as another question: the form errs to silence.
 */
function aimsOf(words: readonly string[], of: (w: string) => string | undefined): string {
  return words
    .flatMap((w, i) => {
      const said = of(w)
      if (said === undefined) return []
      // A negation reaches past a verb to its thing: «not use blue» is read as «not use blue», not «not use» (Codex on
      // #274).
      if (said === 'not')
        return [
          `not ${words
            .slice(i + 1)
            .filter(isThing)
            .slice(0, 2)
            .map(plainWord)
            .join(' ')}`,
        ]
      const after = words.slice(i + 1).find(isThing)
      const before = words.slice(0, i).findLast(isThing)
      const base = ACTIONS.get(w)
      // A passive: a participle after a form of «be» («be enabled», «was hidden»); a past tense alone is active
      // («admins enabled dark mode»; Codex on #274).
      const participle =
        base !== undefined &&
        w !== base &&
        (w.endsWith('d') || (IRREGULAR[base] ?? []).includes(w)) &&
        words.slice(Math.max(0, i - 2), i).some((p) => BE.has(p))
      const thing = participle ? (before ?? after) : (after ?? before)
      return [`${said} ${thing === undefined ? '' : plainWord(thing)}`]
    })
    .toSorted()
    .join('|')
}

/** The forms of «be» a passive is made with. */
const BE = new Set(['be', 'been', 'being', 'is', 'are', 'was', 'were'])

/** How each kind's turning word is read, for its thing: an action by its plain form; an order or a number as it is. */
const READ = {
  negations: (w: string) => (NEGATIONS.has(w) ? 'not' : undefined),
  orders: (w: string) => (w === 'before' || w === 'after' ? w : undefined),
  actions: (w: string) => ACTIONS.get(w),
  numbers: (w: string) => (/\p{N}/u.test(w) ? w : undefined),
}

/** Whether a title negates: a negating word, or a «n't». */
const negates = (words: readonly string[], title: string) =>
  words.some((s) => NEGATIONS.has(s)) || /n['\u2019]t\b/u.test(fold(title))

/**
 * Whether two titles' turns agree: the same negation; and of each kind, the same words in the same order, or none said
 * on one side (a number on one side only does not part them). Where they don't, nothing is named: saying nothing beats
 * pointing to the inverse question.
 */
function turnsAgree(a: string, b: string): boolean {
  const x = wordsOf(a)
  const y = wordsOf(b)
  if (negates(x, a) !== negates(y, b)) return false
  const alike = Object.values(turnsOf).every((of) => {
    const [p, q] = [of(x), of(y)]
    return p.length === 0 || q.length === 0 || p.join(' ') === q.join(' ')
  })
  // A negation, an order or an action said on each side keeps its thing, once said too: «not red» against «not blue»,
  // «before approval» against «before review», «enable SMS and disable email» against «enable email and disable SMS».
  // Numbers, two or more on each side («Q1 costs … Q2 revenue»): one number has no other to swap with (Codex on #274).
  const kept = (['negations', 'orders', 'actions', 'numbers'] as const).every((kind) => {
    const least = kind === 'numbers' ? 2 : 1
    const said = (words: readonly string[]) => words.filter((w) => READ[kind](w) !== undefined).length >= least
    return !(said(x) && said(y)) || aimsOf(x, READ[kind]) === aimsOf(y, READ[kind])
  })
  return alike && kept
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
