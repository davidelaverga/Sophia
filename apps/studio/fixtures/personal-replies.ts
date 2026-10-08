// What the demo's Sophia answers in Personal (docs/plans/spaces-companion.md): she keeps what you told her before and
// answers with it, as the companion runtime would (its words are Davide's runtime's to write). A name you said before
// brings back what you said about them; a weight you named before is asked about again; anything else, an open
// question about what you just said, whatever it carries. Every word is synthetic.

export interface Said {
  author: 'person' | 'sophia'
  text: string
}

/** The sentences of what was said, each on its own. */
const sentencesOf = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean)

/** Capitalised words that are not people: days, months, «I». */
const NOT_NAMES: ReadonlySet<string> = new Set([
  'I',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
])

/** A person's name: a capitalised word that doesn't start its sentence, and isn't a day, a month or «I». */
const namesIn = (text: string) =>
  sentencesOf(text).flatMap((sentence) =>
    sentence
      .split(/\s+/u)
      .slice(1)
      .map((w) => w.replace(/[^\p{L}’']/gu, ''))
      .filter((w) => /^\p{Lu}\p{Ll}/u.test(w) && !NOT_NAMES.has(w)),
  )

/** Words that carry a weight, four letters or more, a plural's «s» dropped. */
const WEIGHTS = ['deck', 'pitch', 'numbers', 'meeting', 'launch', 'date', 'team', 'deadline', 'friday']

const weightsIn = (text: string) => {
  const words = new Set(text.toLowerCase().split(/[^\p{L}]+/u))
  return WEIGHTS.filter((w) => words.has(w) || words.has(`${w}s`))
}

/** The first clause of what was just said, for a question about it. */
const clauseOf = (text: string) => (sentencesOf(text)[0] ?? text).replace(/[.!?]+$/u, '').trim()

/** Her answer to `text`, after `before` (oldest first, `text` not among them). */
export function companionReply(text: string, before: readonly Said[]): string {
  const yours = before.filter((s) => s.author === 'person').flatMap((s) => sentencesOf(s.text))
  for (const name of namesIn(text)) {
    const earlier = yours.findLast((s) => s.includes(name))
    if (!earlier) continue
    if (/apolog/iu.test(text)) {
      return `You told me “${earlier}” Starting with an apology can make it easier for ${name} to speak. What would you apologise for: the promise itself, or how it landed on ${name}?`
    }
    return `You mentioned ${name} before: “${earlier}” What do you most want ${name} to understand?`
  }
  for (const weight of weightsIn(text)) {
    const earlier = yours.findLast((s) => weightsIn(s).includes(weight))
    if (earlier)
      return `This is the ${weight} again. Last time you said “${earlier}” Is it the same weight, or a new one?`
  }
  return `Tell me more about “${clauseOf(text)}”. What stands out most, now?`
}
