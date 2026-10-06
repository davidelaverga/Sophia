// The project's meetings (room-recap and room-updates checks), answered as A12 and A13 propose (issue #105): two earlier
// meetings, closed; the one the room is in, its recap built from the fixture's own records (the notes kept with Keep,
// the report a result notice brought, the fixture's decision, the people in the call); its close, once; and what
// changed since the viewer last looked, from the same records. Every word is synthetic.
import type { Digest, MeetingRecap, MeetingReceipt } from '../src/api/vision.ts'
import { membership } from './data.ts'
import { personId } from './fake-people.ts'

export const MEETING = '00000000-0000-4000-8000-0000000000e1'

type Records = Omit<MeetingRecap, 'meetingId' | 'startedAt' | 'endedAt' | 'minutes'>

export interface Meeting {
  startedAt: number
  closedAt: string | null
  /** A result notice reached the room: its report is what the meeting made. */
  made: boolean
  /** The next close lands, but its reply is lost on the way (`window.fixture.loseNextCloseReply`). */
  loseReply: boolean
  /** The recap's reads wait until released (`window.fixture.holdRecaps`), or fail (`failRecaps`). */
  recaps: { held: (() => void)[] | null; fail: boolean }
  /** The close's receipt by its Idempotency-Key: any close after it replays it. */
  closes: Map<string, MeetingReceipt>
  /**
   * What the viewer has seen (A13's attention): the sequence last written, and the records shown up to it, so what is
   * kept afterwards is new. `loseReply`: the next write lands, but its reply is lost.
   */
  seen: { sequence: string | null; records: Set<string>; loseReply: boolean }
  /** The recap's records as the page holds them now (room.tsx). */
  records: () => Records
  /** Someone joined the call on this page: until then there is no running meeting. */
  begun: () => boolean
}

export const newMeeting = (records: Meeting['records'], begun: Meeting['begun'], startedAt = Date.now()): Meeting => ({
  startedAt,
  closedAt: null,
  made: false,
  loseReply: false,
  recaps: { held: null, fail: false },
  closes: new Map(),
  seen: { sequence: null, records: new Set(), loseReply: false },
  records,
  begun,
})

const ME = membership.actorId

/** The two meetings before this one, closed, as the API keeps them. */
const PAST: readonly MeetingRecap[] = [
  {
    meetingId: '00000000-0000-4000-8000-0000000000e2',
    startedAt: '2026-10-04T15:00:00.000Z',
    endedAt: '2026-10-04T15:38:00.000Z',
    minutes: 38,
    people: [{ actorId: ME }, { actorId: personId(2) }],
    guests: 1,
    decided: [
      {
        decisionId: '00000000-0000-4000-8000-0000000000d2',
        statement: 'Keep the room checks on fixtures',
        proposedBy: personId(2),
        decidedBy: ME,
        at: '2026-10-04T15:21:00.000Z',
        undoable: false,
      },
    ],
    made: [],
    noted: [],
    open: [{ proposalId: '00000000-0000-4000-8000-0000000000f2', statement: 'Record a short demo of the room' }],
    work: [],
    names: { [ME]: 'Fixture viewer', [personId(2)]: 'Lucía' },
  },
  {
    meetingId: '00000000-0000-4000-8000-0000000000e3',
    startedAt: '2026-10-02T09:30:00.000Z',
    endedAt: '2026-10-02T09:55:00.000Z',
    minutes: 25,
    people: [{ actorId: ME }, { actorId: personId(3) }],
    guests: 0,
    decided: [],
    made: [],
    noted: [],
    open: [],
    work: [],
    names: { [ME]: 'Fixture viewer', [personId(3)]: 'Noor' },
  },
]

/** The meetings, newest first: the one the room is in, once someone joined, then the earlier ones. */
export const meetingList = (m: Meeting) => ({
  meetings: [
    ...(m.begun() ? [{ id: MEETING, startedAt: new Date(m.startedAt).toISOString(), endedAt: m.closedAt }] : []),
    ...PAST.map((p) => ({ id: p.meetingId, startedAt: p.startedAt, endedAt: p.endedAt })),
  ],
})

/** A meeting's recap: this one's from the page's records; an earlier one's as it was kept. Undefined: no such one. */
export const recapOf = (m: Meeting, id: string): MeetingRecap | undefined =>
  id === MEETING ? current(m) : PAST.find((p) => p.meetingId === id)

function current(m: Meeting): MeetingRecap {
  const ended = m.closedAt ? Date.parse(m.closedAt) : Date.now()
  return {
    meetingId: MEETING,
    startedAt: new Date(m.startedAt).toISOString(),
    endedAt: m.closedAt,
    minutes: Math.floor((ended - m.startedAt) / 60_000),
    ...m.records(),
  }
}

/** The meeting closed for everyone, once: a later close, with its key or another, is the same close. */
export function closed(m: Meeting, key: string, cursor: number): MeetingReceipt {
  const first = m.closes.values().next().value
  if (first) return first
  m.closedAt = new Date().toISOString()
  const receipt: MeetingReceipt = { meetingId: MEETING, revision: 2, cursor: String(cursor) }
  m.closes.set(key, receipt)
  return receipt
}

/** The meetings' recaps, newest first: the running one once someone joined, then the earlier ones. */
export const allRecaps = (m: Meeting): MeetingRecap[] => [...(m.begun() ? [current(m)] : []), ...PAST]

/**
 * Every record so far, the earlier meetings' first: what «since» picks the new ones from. The notes kept and the report
 * made are the project's whether or not a meeting runs; the fixture's decision is the running meeting's.
 */
function everything(m: Meeting) {
  const now = current(m)
  const all = [...PAST.toReversed(), m.begun() ? now : { ...now, decided: [] }]
  return {
    decided: all.flatMap((r) => r.decided),
    made: all.flatMap((r) => r.made),
    noted: all.flatMap((r) => r.noted),
    open: all.flatMap((r) => r.open),
    work: all.flatMap((r) => r.work),
    names: Object.fromEntries(all.flatMap((r) => Object.entries(r.names))),
  }
}

const keysOf = (r: ReturnType<typeof everything>) => [
  ...r.decided.map((d) => d.decisionId),
  ...r.made.map((d) => d.artifactVersionId),
  ...r.noted.map((d) => d.entryId),
  ...r.open.map((d) => d.proposalId),
  ...r.work.map((d) => d.taskId),
]

/** What changed since the viewer last looked: the records not shown when they last marked them seen. */
export function digestOf(m: Meeting, cursor: number): Digest {
  const all = everything(m)
  const fresh = (key: string) => !m.seen.records.has(key)
  return {
    fromSequence: m.seen.sequence,
    toSequence: String(cursor),
    decided: all.decided.filter((d) => fresh(d.decisionId)),
    made: all.made.filter((d) => fresh(d.artifactVersionId)),
    noted: all.noted.filter((d) => fresh(d.entryId)),
    open: all.open.filter((d) => fresh(d.proposalId)),
    work: all.work.filter((d) => fresh(d.taskId)),
    names: all.names,
  }
}

/** The running meeting until now (A13's `so-far`): built as its recap is, for whoever joins late. */
export function soFarOf(m: Meeting, cursor: number): Digest {
  const { decided, made, noted, open, work, names } = current(m)
  return { fromSequence: null, toSequence: String(cursor), decided, made, noted, open, work, names }
}

/**
 * The viewer saw up to `sequence`: never lowered. The fixture marks the records shown when it was written, not the
 * records up to that sequence, which is close enough for one page, whose digest is always read just before.
 */
export function markSeen(m: Meeting, sequence: string): void {
  if (m.seen.sequence !== null && Number(sequence) < Number(m.seen.sequence)) return
  m.seen.sequence = sequence
  for (const key of keysOf(everything(m))) m.seen.records.add(key)
}
