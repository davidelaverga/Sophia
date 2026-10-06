// The meeting the room is in (room-recap checks), answered as A12 proposes (issue #105): its list, its recap built
// from the fixture's own records (the notes kept with Keep, the report a result notice brought, the fixture's decision,
// the people in the call) and its close, idempotent per key. Every word is synthetic.
import type { MeetingRecap, MeetingReceipt } from '../src/api/vision.ts'

export const MEETING = '00000000-0000-4000-8000-0000000000e1'

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
  /** The recap's records as the page holds them now (room.tsx). */
  records: () => Omit<MeetingRecap, 'meetingId' | 'startedAt' | 'endedAt' | 'minutes'>
}

export const newMeeting = (records: Meeting['records']): Meeting => ({
  startedAt: Date.now(),
  closedAt: null,
  made: false,
  loseReply: false,
  recaps: { held: null, fail: false },
  closes: new Map(),
  records,
})

export const meetingList = (m: Meeting) => ({
  meetings: [{ id: MEETING, startedAt: new Date(m.startedAt).toISOString(), endedAt: m.closedAt }],
})

export function recapOf(m: Meeting): MeetingRecap {
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
