// What Sophia made, as the room shows it when it arrives (docs/plans/room-made-object.md, made-fits.md). Pure, so the
// rules are unit-tested: which notice the stage shows, and its heading. The words around it stay Studio's; the title is
// the report's own, as Knowledge shows it.
import type { ChatNoticeItem } from '../conversation/chat-view.ts'

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

/** The kinds whose result is a report someone can open: a drafted brief delivers no file, so it stays in the chat. */
const OPENS: ReadonlySet<string> = new Set(['research'])

/**
 * The notice the stage shows: the newest of a kind that delivers a report, unless this person put it away (opened or
 * closed it).
 */
export function madeOnStage(notices: readonly ChatNoticeItem[], away: ReadonlySet<string>): ChatNoticeItem | null {
  const newest = notices.filter((n) => OPENS.has(n.taskKind)).toSorted((a, b) => b.at - a.at)[0]
  return newest && !away.has(madeKey(newest)) ? newest : null
}

/** One revision of one result: a revision put away doesn't keep its next one away. */
export const madeKey = (n: Pick<ChatNoticeItem, 'taskId' | 'resultRevision'>) =>
  `${n.taskId}:${String(n.resultRevision)}`
