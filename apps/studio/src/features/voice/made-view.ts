// What Sophia made, as the room shows it when it arrives (docs/plans/room-made-object.md). Pure, so the rules are
// unit-tested: which notice the stage shows, and the facts read from the report's record. The words around them
// stay Studio's; the title and the description are the report's own, shown as Knowledge shows them.
import type { ArtifactVersion } from '@sophia/contracts'
import type { ChatNoticeItem } from '../conversation/chat-view.ts'

/** Reading speed for the minutes a report takes, in words a minute. */
const WORDS_A_MINUTE = 230

export interface MadeFacts {
  minutes: number
  sections: number
  /** Sources the version cites, when its record says. */
  sources: number | null
  /** Limits noted for its files or its version, each once. */
  limits: number
}

/** The facts a report's record gives: its Markdown, its delivered files' limits, and its version's. */
export function madeFacts(
  markdown: string,
  outputs: readonly { limitations: readonly string[] }[],
  version: Pick<ArtifactVersion, 'limitations' | 'changeFacts'> | undefined,
): MadeFacts {
  const words = markdown.match(/\S+/g)?.length ?? 0
  const sections = markdown.split('\n').filter((l) => /^##\s+\S/.test(l)).length
  const limits = new Set([...outputs.flatMap((o) => o.limitations), ...(version?.limitations ?? [])])
  return {
    minutes: Math.max(1, Math.round(words / WORDS_A_MINUTE)),
    sections,
    sources: version?.changeFacts?.cited ?? null,
    limits: limits.size,
  }
}

/** Each fact as the object says it, the limits last; a fact the record doesn't give, or that is none, is left out. */
export function factWords(facts: MadeFacts): Array<{ text: string; limit: boolean }> {
  const out = [{ text: `${String(facts.minutes)} min read`, limit: false }]
  if (facts.sections > 0) out.push({ text: plural(facts.sections, 'section'), limit: false })
  if (facts.sources !== null && facts.sources > 0) out.push({ text: plural(facts.sources, 'source'), limit: false })
  if (facts.limits > 0) out.push({ text: plural(facts.limits, 'limit'), limit: true })
  return out
}

const plural = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? '' : 's'}`

/**
 * The object's heading: the report's title (its version's, else its card's), else the Studio's words for the task's
 * kind until the record is read; and "Report", with its version when known.
 */
export function madeHeading(
  version: { title?: string; versionNumber?: number } | undefined,
  cardTitle: string | undefined,
  studioWords: string,
): { title: string; meta: string } {
  const n = version?.versionNumber
  return { title: version?.title ?? cardTitle ?? studioWords, meta: n ? `Report · v${String(n)}` : 'Report' }
}

/** The notice the stage shows: the newest, unless this person put it away (opened or closed it). */
export function madeOnStage(notices: readonly ChatNoticeItem[], away: ReadonlySet<string>): ChatNoticeItem | null {
  const newest = notices.toSorted((a, b) => b.at - a.at)[0]
  return newest && !away.has(madeKey(newest)) ? newest : null
}

/** One revision of one result: a revision put away doesn't keep its next one away. */
export const madeKey = (n: Pick<ChatNoticeItem, 'taskId' | 'resultRevision'>) =>
  `${n.taskId}:${String(n.resultRevision)}`
