// The next ask (docs/plans/next-ask.md): once Sophia has answered, the one ask that most plausibly comes next, from what
// the Studio already reads (the thread, the conversation's open questions, the brief): a proposal waiting, what is still
// open, what was decided, a summary, in that order, the first not asked lately nor put away. Nothing fits, nothing is
// suggested: saying nothing beats guessing. The quick asks under the field drop what was asked lately and the
// suggestion. Pure, so a node test holds the order; never presented as Sophia's words.
import type { MissionContext } from '@sophia/contracts'
import type { ConversationMessage } from '../../api/conversations.ts'
import { acceptedOf, pendingOf } from './conversation-list.ts'

/** What everyone asks: Sophia, in one press. */
export const QUICK_ASKS = ['Sum it up', 'What’s still open?', 'What did we decide?'] as const
const [SUM, OPEN, DECIDED] = QUICK_ASKS

/** How many of the viewer's messages count as «lately». */
export const LATELY = 6

/** A proposal's words inside the ask, at most this long (cut at a word, with an ellipsis). */
const QUOTED = 44

export interface AskContext {
  /** Whose the newest message is: hers (she has answered), the viewer's, someone else's; null with none. */
  newest: 'sophia' | 'mine' | 'theirs' | null
  /** The viewer's messages in this conversation, oldest first. */
  asked: readonly string[]
  /** The conversation's open questions. */
  openQuestions: number
  /** The newest proposal waiting in the brief, by its words; null with none (or the brief not read). */
  pending: string | null
  /** How many decisions the brief has accepted. */
  decided: number
  /** Suggestions put away in this conversation. */
  putAway: readonly string[]
}

export interface Suggestion {
  words: string
  /** Why, in words, for the key cap's tip. */
  why: string
}

const folded = (s: string) =>
  s
    .trim()
    .replace(/[\s.?!…]+$/u, '')
    .toLocaleLowerCase()

/** The same ask, whatever its case, its spaces at the ends or its end's punctuation. */
export const sameAsk = (a: string, b: string): boolean => folded(a) === folded(b)

/** What the viewer asked lately; a summary says what was decided, so it counts as that asked too. */
function askedLately(asked: readonly string[]): string[] {
  const lately = asked.slice(-LATELY)
  return lately.some((a) => sameAsk(a, SUM)) ? [...lately, DECIDED] : lately
}

/** A proposal's words cut at a word, with an ellipsis, when long. */
function quoted(statement: string): string {
  const words = statement.trim()
  if (words.length <= QUOTED) return words
  const cut = words.slice(0, QUOTED - 1)
  const at = cut.lastIndexOf(' ')
  return `${(at > 0 ? cut.slice(0, at) : cut).trimEnd()}…`
}

const count = (n: number, one: string, many: string) => (n === 1 ? one : many.replace('#', String(n)))

/** The asks that fit what is read, in order. */
function candidates(ctx: AskContext): Suggestion[] {
  const all: Suggestion[] = []
  if (ctx.pending)
    all.push({ words: `Should we go with “${quoted(ctx.pending)}”?`, why: 'Because it is proposed and not decided' })
  if (ctx.openQuestions > 0)
    all.push({
      words: OPEN,
      why: count(ctx.openQuestions, 'Because 1 question is open here', 'Because # questions are open here'),
    })
  if (ctx.decided > 0)
    all.push({
      words: DECIDED,
      why: count(ctx.decided, 'Because the brief has 1 decision', 'Because the brief has # decisions'),
    })
  all.push({ words: SUM, why: 'To have where it stands in one answer' })
  return all
}

/** The next ask, once Sophia has answered; null when nothing fits. */
export function nextAsk(ctx: AskContext): Suggestion | null {
  if (ctx.newest !== 'sophia') return null
  const gone = [...askedLately(ctx.asked), ...ctx.putAway]
  return candidates(ctx).find((c) => !gone.some((g) => sameAsk(g, c.words))) ?? null
}

/**
 * The quick asks less those asked lately, less the suggestion, and less what was put away here (an ask put away does
 * not come back as a press below the field: Codex on #262), in their order.
 */
export function quickAsks(
  asked: readonly string[],
  suggestion: Suggestion | null,
  putAway: readonly string[] = [],
): string[] {
  const gone = [...askedLately(asked), ...(suggestion ? [suggestion.words] : []), ...putAway]
  return QUICK_ASKS.filter((q) => !gone.some((g) => sameAsk(g, q)))
}

/** The thread as the next ask reads it: whose the newest message is, and the viewer's words, oldest first. */
export function threadOf(
  read: { pages: readonly { messages: readonly ConversationMessage[] }[] } | undefined,
  me: string,
): Pick<AskContext, 'newest' | 'asked'> {
  // The first page is the newest; each page is oldest first.
  const all = read?.pages.toReversed().flatMap((p) => p.messages) ?? []
  const last = all.at(-1)
  const newest = !last ? null : last.author === 'sophia' ? 'sophia' : last.actorId === me ? 'mine' : 'theirs'
  // A withdrawn message has no words (A18 on CON-01): it asked nothing.
  const asked = all.flatMap((m) => (m.author === 'member' && m.actorId === me && m.text !== null ? [m.text] : []))
  return { newest, asked }
}

/** A page of the thread as the API gives it: oldest first, and the page before it. */
interface ThreadPage {
  messages: readonly ConversationMessage[]
  before: string | null
}

/**
 * The viewer's words before the pages the thread has loaded, oldest first, read a page at a time until `need` of them
 * are in or the thread begins: the loaded page holds six messages in all, not six of the viewer's, so what they asked
 * four turns ago may be a page back (Codex on #262). At most `pages` pages are read; stopped there with asks still
 * wanted and pages left, the answer is not `complete`, and nothing is proposed on it (Codex P2 on #262).
 */
export async function olderAsks(
  read: (before: string) => Promise<ThreadPage>,
  before: string | null,
  me: string,
  need: number,
  pages = 8,
): Promise<{ asks: string[]; complete: boolean }> {
  if (before === null || need <= 0) return { asks: [], complete: true }
  if (pages <= 0) return { asks: [], complete: false }
  const page = await read(before)
  // A withdrawn message has no words: nothing it asked counts.
  const mine = page.messages.flatMap((m) =>
    m.author === 'member' && m.actorId === me && m.text !== null ? [m.text] : [],
  )
  const earlier = await olderAsks(read, page.before, me, need - mine.length, pages - 1)
  return { asks: [...earlier.asks, ...mine], complete: earlier.complete }
}

/** What the brief gives the next ask: its newest proposal waiting, and how many decisions it has accepted. */
export function briefAsks(brief: MissionContext | undefined, failed: boolean): Pick<AskContext, 'pending' | 'decided'> {
  // A brief whose last read failed may hold a proposal decided since: nothing is taken from it (Codex P2 on #262).
  if (!brief || failed) return { pending: null, decided: 0 }
  const accepted = acceptedOf(brief.constraints)
  return {
    pending: pendingOf(brief.pending).shown[0]?.statement ?? null,
    decided: accepted.shown.length + accepted.more,
  }
}

/** What the next ask may stand on now: the thread read and not being read again; the viewer's older asks read. */
/**
 * A read is settled only when idle: one paused offline keeps its old data with `isFetching` false, yet it is still on
 * its way, and a newer read started meanwhile would cancel it (Codex on #275).
 */
export const settled = (read: { fetchStatus: 'fetching' | 'paused' | 'idle' }): boolean => read.fetchStatus === 'idle'

export interface AskReadings {
  /** The transcript read, not being read again, its last read not failed: its newest message is the newest. */
  fresh: boolean
  /** What the viewer asked before the loaded pages is read (or not needed). */
  recencyKnown: boolean
  /** A message on its way, a refusal standing, nothing read: no suggestion in the field. */
  quiet: boolean
  /** Put away under her newest answer: no suggestion until her next. */
  hushed: boolean
}

/**
 * The field's suggestion and the quick asks, from what is known now: with the thread or what was asked before it not
 * known (being read again, or its read failed), neither, so nothing asked lately is offered again and nothing stands on
 * a newest message that may no longer be hers (Codex P2s on #262).
 */
export function asksNow(ctx: AskContext, r: AskReadings): { suggestion: Suggestion | null; quick: string[] } {
  if (!r.fresh || !r.recencyKnown) return { suggestion: null, quick: [] }
  const suggestion = r.quiet || r.hushed ? null : nextAsk(ctx)
  return { suggestion, quick: quickAsks(ctx.asked, suggestion, ctx.putAway) }
}
