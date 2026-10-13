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
  spelledNumbers(
    fold(title)
      // A comma between thousands only: a point is a decimal («1.234» seconds is not 1234: Codex on #274).
      .replace(/(\p{N}),(?=\p{N}{3}(?!\p{N}))/gu, '$1')
      // A decimal is one number: «1.2» is not «1 and 2» (Codex on #274).
      .replace(/(\p{N})\.(?=\p{N})/gu, '$1point')
      // A number's sign stays on it: «-5» is not «5» (Codex on #274).
      .replace(/(^|[^\p{L}\p{N}])[-\u2212](?=\p{N})/gu, '$1minus')
      // «cannot», «can't» and «won't» are a «can» or a «will» and a «not», as any «n't» is (Codex on #274).
      .replace(/\b(?:can['\u2019]t|cannot)\b/gu, 'can not')
      .replace(/\bwon['\u2019]t\b/gu, 'will not')
      // A contracted negation is a «not» of its own, so its scope is read as one (Codex on #274).
      .replace(/n['\u2019]t\b/gu, ' not')
      .split(/[^\p{L}\p{N}]+/u),
  )

/** Spelled units and teens, tens, and scales, by their value. */
const UNITS = new Map(
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'
    .split(' ')
    .map((w, i) => [w, i] as const),
)
const TENS = new Map(
  'twenty thirty forty fifty sixty seventy eighty ninety'.split(' ').map((w, i) => [w, (i + 2) * 10] as const),
)
const SCALES = new Map([
  ['hundred', 100],
  ['thousand', 1000],
  ['million', 1000000],
])

/** Ordinals said by a word of their own; the rest are the cardinal with «th» («fourteenth», «twentieth»). */
const ORDINAL_WORDS = new Map([
  ['first', 'one'],
  ['second', 'two'],
  ['third', 'three'],
  ['fifth', 'five'],
  ['eighth', 'eight'],
  ['ninth', 'nine'],
  ['twelfth', 'twelve'],
])

/** The cardinal an ordinal word is made of («fourteenth» fourteen, «twentieth» twenty), or undefined. */
function cardinalOf(w: string): string | undefined {
  const own = ORDINAL_WORDS.get(w)
  if (own !== undefined) return own
  if (!w.endsWith('th')) return undefined
  const base = w.endsWith('ieth') ? `${w.slice(0, -4)}y` : w.slice(0, -2)
  return UNITS.has(base) || TENS.has(base) || SCALES.has(base) ? base : undefined
}

/** An ordinal's figure, as a figure is written: «1st», «2nd», «3rd», «4th», «11th», «12th». */
function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th')
  return `${String(n)}${suffix}`
}

/**
 * Whether a number word goes on the run before it, as a number is said: a unit after a ten («twenty one»), a ten or a
 * unit after a scale («one hundred twenty»), a scale after any of them («five hundred»). «one two» is two numbers.
 */
function continues(prev: string | undefined, w: string): boolean {
  if (prev === undefined || SCALES.has(w)) return true
  if (SCALES.has(prev)) return true
  return TENS.has(prev) && (UNITS.get(w) ?? 10) < 10
}

/** A run of spelled number words read as one value: «one thousand five hundred twenty one» is 1521. */
function valueOfRun(run: readonly string[]): number {
  let total = 0
  let group = 0
  let last = Number.POSITIVE_INFINITY
  for (const w of run) {
    const scale = SCALES.get(w)
    if (scale === undefined) group += UNITS.get(w) ?? TENS.get(w) ?? 0
    else if (scale === 100) group = Math.max(group, 1) * 100
    else {
      // A larger scale after a smaller one takes in all said so far: «one thousand million» is 10⁹ (Codex on #274).
      // A scale said again multiplies too: «one thousand thousand» is a million (Codex on #274).
      total = scale >= last ? (total + group) * scale : total + Math.max(group, 1) * scale
      group = 0
      last = scale
    }
  }
  return total + group
}

/**
 * Whether an «and» after a scale joins what follows to it, as in «one hundred and five»: only when the words after it
 * name less than that scale; «one thousand and two thousand» is two quantities (Codex on #274).
 */
function remainderFollows(prev: string | undefined, after: readonly string[]): boolean {
  const scale = SCALES.get(prev ?? '')
  if (scale === undefined) return false
  const next: string[] = []
  for (const w of after) {
    // An ordinal ends the number it finishes: «one hundred and first» is the 101st (Codex on #274).
    const cardinal = cardinalOf(w)
    if (cardinal !== undefined) {
      next.push(cardinal)
      break
    }
    if (!UNITS.has(w) && !TENS.has(w) && !SCALES.has(w)) break
    next.push(w)
  }
  // Less than the scale (a remainder), or a larger scale ahead that takes in all before it: «one hundred and twenty
  // thousand» is 120000 (Codex on #274).
  return next.length > 0 && (valueOfRun(next) < scale || next.some((w) => (SCALES.get(w) ?? 0) > scale))
}

/**
 * Spelled numbers read as figures, each run of number words as one value, so the words meet the figures: «one thousand
 * five hundred» is 1500, «twenty first» 21st, «fourteenth» 14th (Codex on #274). An «and» after a scale («one hundred
 * and five») is part of the run; figures are never composed, «20-1» stays two numbers.
 */
function spelledNumbers(words: readonly string[]): string[] {
  const out: string[] = []
  let run: string[] = []
  const flush = () => {
    if (run.length > 0) out.push(String(valueOfRun(run)))
    run = []
  }
  for (const [i, w] of words.entries()) {
    const cardinal = cardinalOf(w)
    if (cardinal !== undefined) {
      if (!continues(run.at(-1), cardinal)) flush()
      out.push(ordinal(valueOfRun([...run, cardinal])))
      run = []
    } else if (UNITS.has(w) || TENS.has(w) || SCALES.has(w)) {
      if (!continues(run.at(-1), w)) flush()
      run.push(w)
    } else if (!(w === 'and' && remainderFollows(run.at(-1), words.slice(i + 1)))) {
      flush()
      out.push(w)
    }
  }
  flush()
  return out
}

/**
 * A title's own words: folded, accents off, three letters or more, common words left out, an action as its plain form,
 * a final «s» dropped.
 */
function ownWords(title: string): Set<string> {
  return new Set(
    wordsOf(title)
      // A figure counts whatever its length: «one» read as «1» is still a word of the question (Codex on #274).
      .filter((w) => /\p{N}/u.test(w) || (w.length >= 3 && !COMMON.has(w)))
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
 * words in other places part two titles: «tier 1 … 2» from «tier 2 … 1», «enable … disable» from «disable … enable»
 * (Codex on #266 and #274).
 */
const turnsOf = {
  orders: (words: readonly string[]) => words.filter((w) => w === 'before' || w === 'after'),
  actions: (words: readonly string[]) => words.flatMap((w) => ACTIONS.get(w) ?? []),
  numbers: (words: readonly string[]) => words.filter((w) => /\p{N}/u.test(w)),
}

/**
 * A title's own words in the order they come, numbers kept (a digit is a word here): what two titles with turning words
 * on both sides must share, word for word, to be the same question.
 */
const ownOrder = (words: readonly string[]) =>
  words
    // Every word keeps its place but the filler: a negation, a pronoun, a demonstrative, a quantifier («all» against
    // «some»), each binds what it is said of (Codex on #274).
    .filter((w) => w !== '' && !FILLER.has(w))
    .map(plainWord)
    // A word said twice running is said once («before review or after review»); a word said again later keeps that
    // later place, which binds it to what is said there («enable SMS and disable email»: Codex on #274).
    // A «not» twice is kept twice: «not not enable» is not «not enable» (Codex on #274).
    .filter((w, i, all) => w !== all[i - 1] || NEGATIONS.has(w))
    .join(' ')

/**
 * The words that only hold a sentence together, left out of the ordered words: articles, auxiliaries, prepositions and
 * conjunctions, and «before»/«after», whose order is read on its own (`turnsOf.orders`).
 */
const FILLER = new Set(
  (
    'a an the and or but of to for in on at by with from into as than then so if ' +
    'should would could can do does did be is are was were been being will shall may might must ' +
    'we our i please before after'
  ).split(' '),
)

/** Whether a title says a turning word of any kind: a negation, an order, an action of a pair, a number. */
const turns = (words: readonly string[]) =>
  words.some((w) => NEGATIONS.has(w)) || Object.values(turnsOf).some((of) => of(words).length > 0)

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
  // Turning words on both sides: only the same own words, in the same order, are the same question. Binding each turn
  // to a word near it was read eleven ways by the review, each an inverse it let through (a number moved between
  // subjects, a negation's scope, a passive's thing: Codex on #274); word for word, none passes. A paraphrase with
  // turning words (a passive, another order) is read as another question: the form errs to silence, Start always there.
  return alike && (!(turns(x) && turns(y)) || ownOrder(x) === ownOrder(y))
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
