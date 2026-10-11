// Updates' words (docs/plans/room-updates.md): the digest's lead, and a meeting's row. Pure, so they are unit-tested;
// the dates' own formats come from the page (Intl), as the reader's locale says them.
import type { Digest, MeetingSummary } from '../../api/vision.ts'
import { lasted } from '../../app/time-words.ts'
import type { Records } from '../voice/recap-view.ts'

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

/**
 * How long each closed meeting lasted against the longest of them (0–1], for the row's bar; the running one has none.
 */
export function lengthShares(
  meetings: readonly Pick<MeetingSummary, 'id' | 'startedAt' | 'endedAt'>[],
): ReadonlyMap<string, number> {
  const lengths = meetings.flatMap((m) =>
    m.endedAt === null ? [] : [[m.id, Math.max(0, Date.parse(m.endedAt) - Date.parse(m.startedAt))] as const],
  )
  const longest = Math.max(1, ...lengths.map(([, ms]) => ms))
  return new Map(lengths.map(([id, ms]) => [id, Math.max(0.04, ms / longest)]))
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

// The digest narrowed (docs/plans/updates-narrow.md): by kind, by person, both.
export type Kind = 'all' | 'decided' | 'made' | 'kept' | 'open' | 'work'

/** The presses over the digest, in the sections' order. */
export const KINDS: readonly { id: Kind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'decided', label: 'Decided' },
  { id: 'made', label: 'Made' },
  { id: 'kept', label: 'Kept' },
  { id: 'open', label: 'Still open' },
  { id: 'work', label: 'Work' },
]

export interface Narrowing {
  kind: Kind
  /** An actor id, or null for everyone. */
  person: string | null
}

/**
 * The records narrowed: a line stays when its kind is asked and the person proposed, decided, asked or kept it; what
 * names nobody (an open proposal, work) stays only for everyone.
 */
export function narrowRecords(r: Records, by: Narrowing): Records {
  const of = (kind: Kind) => by.kind === 'all' || by.kind === kind
  const named = (...ids: string[]) => by.person === null || ids.includes(by.person)
  return {
    decided: of('decided') ? r.decided.filter((d) => named(d.proposedBy, d.decidedBy)) : [],
    made: of('made') ? r.made.filter((m) => named(m.askedBy)) : [],
    noted: of('kept') ? r.noted.filter((n) => named(n.actorId)) : [],
    open: of('open') && by.person === null ? [...r.open] : [],
    work: of('work') && by.person === null ? [...r.work] : [],
  }
}

/** How many lines each kind holds, for the presses. */
export const kindCounts = (r: Records): Record<Exclude<Kind, 'all'>, number> => ({
  decided: r.decided.length,
  made: r.made.length,
  kept: r.noted.length,
  open: r.open.length,
  work: r.work.length,
})

/** Who appears in the records, in the order they first do, once each, by the digest's names; the viewer as You. */
export function peopleOf(
  r: Records,
  names: Readonly<Record<string, string>>,
  me: string,
): { id: string; name: string }[] {
  const ids = [
    ...r.decided.flatMap((d) => [d.proposedBy, d.decidedBy]),
    ...r.made.map((m) => m.askedBy),
    ...r.noted.map((n) => n.actorId),
  ]
  return [...new Set(ids)].map((id) => ({ id, name: id === me ? 'You' : (names[id] ?? 'Someone') }))
}
