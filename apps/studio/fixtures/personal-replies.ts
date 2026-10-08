// What the demo's Sophia answers in Personal (docs/plans/spaces-companion.md): she keeps what you told her before and
// answers with it, as the companion runtime would (its words are Davide's runtime's to write). Someone you work with,
// named again, brings back what you said about them; a weight you named before is asked about again; anything else,
// an open question about what you just said, whatever it carries. Every word is synthetic.

export interface Said {
  author: 'person' | 'sophia'
  text: string
}

/** The people she knows you work with: the demo project's members (a companion knows them; she never guesses names). */
const PEOPLE = ['Davide', 'Marco', 'Lucía'] as const

/** Weights she asks about again, each as she says it. */
const WEIGHTS: Readonly<Record<string, string>> = {
  deck: 'the deck',
  pitch: 'the pitch',
  numbers: 'the numbers',
  meeting: 'the meeting',
  launch: 'the launch',
}

/** The longest a quote of yours runs before it is cut. */
const QUOTE = 140

/** The sentences of what was said, each on its own. */
const sentencesOf = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean)

/** A sentence of yours as she quotes it: closed, and cut at a word past 140 characters. */
function quoted(sentence: string): string {
  const closed = /[.!?…]$/u.test(sentence) ? sentence : `${sentence}.`
  if (closed.length <= QUOTE) return `“${closed}”`
  return `“${closed.slice(0, closed.lastIndexOf(' ', QUOTE)).trimEnd()}…”`
}

/** Whether `name` is said in `text` as a word (possessives too: «Davide’s»), never inside another word. */
const names = (text: string, name: string) => new RegExp(`(^|[^\\p{L}])${name}(?![\\p{L}])`, 'u').test(text)

/**
 * «I should apologise to Davide»: you, apologising. Not «I won’t apologise», nor «I wish Davide would apologise» (someone
 * between your «I» and the apology is the one apologising).
 */
function yourApology(text: string): boolean {
  const at = text.search(/apologi[sz]e/iu)
  if (at < 0 || /\b(won’t|won't|will not|don’t|don't|wouldn’t|wouldn't|never)\b/iu.test(text)) return false
  const before = text.slice(0, at)
  const you = [...before.matchAll(/\bI\b/gu)].at(-1)
  if (you === undefined) return false
  const between = before.slice(you.index + 1)
  return !PEOPLE.some((name) => names(between, name)) && !/\b(he|she|they)\b/iu.test(between)
}

/** The words of a line, lower case. */
const wordsOf = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}]+/u))

function aboutSomeone(text: string, yours: readonly string[]): string | null {
  for (const name of PEOPLE) {
    if (!names(text, name)) continue
    const earlier = yours.findLast((s) => names(s, name))
    if (!earlier) continue
    if (yourApology(text)) {
      const what = /\b(promise|promised|date)\b/iu.test(earlier) ? 'the promise itself' : 'what happened'
      return `You told me ${quoted(earlier)} Starting with an apology can make it easier for ${name} to speak. What would you apologise for: ${what}, or how it landed on ${name}?`
    }
    return `You mentioned ${name} before: ${quoted(earlier)} What do you most want ${name} to understand?`
  }
  return null
}

function aboutAWeight(text: string, yours: readonly string[]): string | null {
  for (const [word, said] of Object.entries(WEIGHTS)) {
    if (!wordsOf(text).has(word)) continue
    // A thought of yours about it, not a fragment: five words or more.
    const earlier = yours.findLast((s) => wordsOf(s).has(word) && s.split(/\s+/u).length >= 5)
    if (earlier) {
      return `It comes back to ${said} again. Last time you said ${quoted(earlier)} Is it the same weight, or a new one?`
    }
  }
  return null
}

/** Her answer to `text`, after `before` (oldest first, `text` not among them). */
export function companionReply(text: string, before: readonly Said[]): string {
  const yours = before.filter((s) => s.author === 'person').flatMap((s) => sentencesOf(s.text))
  const answer = aboutSomeone(text, yours) ?? aboutAWeight(text, yours)
  if (answer) return answer
  const clause = (sentencesOf(text)[0] ?? text).replace(/[.!?]+$/u, '').trim()
  if (clause.split(/\s+/u).length < 3) return 'I’m here. What’s on your mind?'
  return `Tell me more about ${quoted(clause)} What stands out most, now?`
}
