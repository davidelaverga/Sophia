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

/** Where `name` is said in `text` as a word (possessives too: «Davide’s»; any case), never inside another word; -1. */
const whereNamed = (text: string, name: string) => text.search(new RegExp(`(?<![\\p{L}])${name}(?![\\p{L}])`, 'iu'))
const names = (text: string, name: string) => whereNamed(text, name) >= 0

/** «I», then at most a modal and a softener, then the apology: «I should apologise», «I’ll really apologise». */
const YOU_APOLOGISE =
  /\bI(?:\s+(?:should|will|must|could|might|want to|need to|have to|ought to|am going to)|['’](?:ll|d|m going to))?(?:\s+(?:really|maybe|probably|just))?\s+apologi[sz]e/iu

/**
 * «I should apologise to Davide»: you, apologising. Not «I’m not going to apologise», «Why should I apologise», nor
 * «I wish Davide would apologise» (someone else is the one apologising). In doubt, it is no apology of yours.
 */
const yourApology = (text: string) => YOU_APOLOGISE.test(text) && !/\b(?:not|never|why|refuse)\b|n['’]t\b/iu.test(text)

const wordCount = (s: string) => s.split(/\s+/u).filter(Boolean).length

/** The words of a line, lower case. */
const wordsOf = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}]+/u))

/**
 * Whom she answers about, with words of yours about them: with an apology, only the one it is made to (the first named
 * after it, or the first named), never someone else in their place; otherwise the first named she has words about.
 */
function whoIsMeant(text: string, yours: readonly string[], apology: boolean) {
  const named = PEOPLE.map((name) => ({
    name,
    at: whereNamed(text, name),
    earlier: yours.findLast((s) => names(s, name)),
  }))
    .filter((p) => p.at >= 0)
    .toSorted((a, b) => a.at - b.at)
  if (!apology) return named.find((p) => p.earlier !== undefined)
  const apologisedAt = text.search(/apologi[sz]e/iu)
  return named.find((p) => p.at > apologisedAt) ?? named[0]
}

function aboutSomeone(text: string, yours: readonly string[]): string | null {
  const apology = yourApology(text)
  const who = whoIsMeant(text, yours, apology)
  if (who?.earlier === undefined) return null
  const { name, earlier } = who
  if (apology) {
    const what = /\b(promise|promised|date)\b/iu.test(earlier) ? 'the promise itself' : 'what happened'
    return `You told me ${quoted(earlier)} Starting with an apology can make it easier for ${name} to speak. What would you apologise for: ${what}, or how it landed on ${name}?`
  }
  return `You mentioned ${name} before: ${quoted(earlier)} What do you most want ${name} to understand?`
}

function aboutAWeight(text: string, yours: readonly string[]): string | null {
  for (const [word, said] of Object.entries(WEIGHTS)) {
    if (!wordsOf(text).has(word)) continue
    // A thought of yours about it, not a fragment: five words or more.
    const earlier = yours.findLast((s) => wordsOf(s).has(word) && wordCount(s) >= 5)
    if (earlier) {
      return `It comes back to ${said} again. Last time you said ${quoted(earlier)} Is it the same weight, or a new one?`
    }
  }
  return null
}

/** Her answer to `text`, after `before` (oldest first, `text` not among them). */
export function companionReply(text: string, before: readonly Said[]): string {
  const said = text.normalize('NFC').trim()
  const yours = before.filter((s) => s.author === 'person').flatMap((s) => sentencesOf(s.text.normalize('NFC')))
  const answer = aboutSomeone(said, yours) ?? aboutAWeight(said, yours)
  if (answer) return answer
  // The first thought of three words or more («Honestly?» is no thought), as you put it, a question kept a question.
  const thought = sentencesOf(said).find((s) => wordCount(s) >= 3)
  if (thought === undefined) return 'I’m here. What’s on your mind?'
  return `Tell me more about ${quoted(thought)} What stands out most, now?`
}
