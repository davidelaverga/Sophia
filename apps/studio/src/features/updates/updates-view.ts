// Updates' words (docs/plans/room-updates.md): the digest's lead, and a meeting's row. Pure, so they are unit-tested;
// the dates' own formats come from the page (Intl), as the reader's locale says them.
import type { Digest, MeetingSummary } from '../../api/vision.ts'

/** The lead over the digest's sections: never looked, or nothing new; null when the sections say it all. */
export function digestLead(digest: Digest): string | null {
  if (digest.fromSequence === null) return 'You haven’t looked before: this is everything so far.'
  const lists = [digest.decided, digest.made, digest.noted, digest.open, digest.work]
  return lists.every((l) => l.length === 0) ? 'Nothing new since you last looked.' : null
}

/** How a date is said: its day ("Oct 4", with the year when it isn't this one), its time ("15:00"), and if it's today. */
export interface DateWords {
  day: (at: Date) => string
  time: (at: Date) => string
  today: (at: Date) => boolean
}

const lasted = (ms: number) => {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'under a minute'
  return minutes === 1 ? '1 minute' : `${String(minutes)} minutes`
}

/** A meeting's row: the running one is now; a closed one is when it was, and how long it lasted. */
export function meetingRow(meeting: Pick<MeetingSummary, 'startedAt' | 'endedAt'>, words: DateWords): string {
  const start = new Date(meeting.startedAt)
  if (meeting.endedAt === null) {
    const when = words.today(start) ? words.time(start) : `${words.day(start)}, ${words.time(start)}`
    return `Now · started ${when}`
  }
  const length = lasted(Date.parse(meeting.endedAt) - start.getTime())
  return `${words.day(start)}, ${words.time(start)} · ${length}`
}
