// The meeting so far, for whoever joins late (docs/plans/room-so-far.md): joining a meeting that began more than two
// minutes before, the stage offers «Catch up», which opens A13's `so-far` digest in a sheet, built as the recap is.
// Kept where the room lives (ProjectBody), so it outlasts a visit to another view: read once per join, measured from
// the moment the call went live, and put away for good once the person caught up or said not now. Rejoining a meeting
// they were in offers nothing. Only under the vision flag, where the fixture pages answer.
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getSoFar, listMeetings, type Digest } from '../../api/vision.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Sheet } from '../../app/Sheet.tsx'
import { VISION } from '../../app/vision.ts'
import { callAnchor, RecapPart } from './MeetingRecap.tsx'
import { namers, recapSections } from './recap-view.ts'
import { joinedIn, joinedWords } from './so-far-view.ts'
import type { ProjectRoom } from './useProjectRoom.ts'

interface Target {
  projectId: string
  identity: Identity
  me: string
  names: ReadonlyMap<string, string>
}

interface SoFar {
  minutes: number
  digest: Digest
}

/**
 * The meetings this person was in on this page, by account and project: on time, late, caught up or not. Rejoining one (a dropped
 * call, Leave and Join again, a visit home between) offers nothing: they were there.
 */
const inMeetings = new Map<string, Set<string>>()
function meetingsOf(account: string, projectId: string): Set<string> {
  const key = `${account} ${projectId}`
  const known = inMeetings.get(key) ?? new Set<string>()
  inMeetings.set(key, known)
  return known
}

/** The running meeting, if this join came late into one this person wasn't in, and what it holds so far. */
function useSoFar(target: Target, liveSince: number | null) {
  const { projectId, identity } = target
  return useQuery({
    queryKey: ['vision', 'so-far', projectId, liveSince],
    queryFn: async ({ signal }): Promise<SoFar | null> => {
      const running = (await listMeetings(identity.token, projectId, 1, signal)).meetings.find((m) => !m.endedAt)
      const known = meetingsOf(accountOf(identity), projectId)
      if (!running || liveSince === null || known.has(running.id)) return null
      known.add(running.id)
      const minutes = joinedIn(running.startedAt, liveSince)
      if (minutes === null) return null
      const digest = await getSoFar(identity.token, projectId, running.id, signal)
      return recapSections(digest, () => '').length > 0 ? { minutes, digest } : null
    },
    enabled: VISION && liveSince !== null,
    staleTime: Infinity,
    retry: false,
  })
}

/** The card for the stage and the sheet for the page, while this join has something to catch up on. */
export function useCatchUp(room: ProjectRoom, target: Target) {
  const { liveSince } = room
  const soFar = useSoFar(target, liveSince)
  const [put, setPut] = useState<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const inCall = room.status === 'live' || room.status === 'reconnecting'
  const data = inCall && liveSince !== put ? soFar.data : null
  if (!data) return { card: null, sheet: null }
  const finish = () => {
    setPut(liveSince)
    setOpen(null)
  }
  const card = (
    <div className="stage-showing" role="group" aria-label="The meeting so far">
      <span className="showing-words">{joinedWords(data.minutes)}</span>
      <button type="button" className="pill" onClick={() => setOpen(liveSince)}>
        Catch up
      </button>
      <button
        type="button"
        className="text-button"
        onClick={() => {
          callAnchor()?.focus() // the card goes with the press: the focus goes to the call's own controls
          finish()
        }}
      >
        Not now
      </button>
    </div>
  )
  const sheet = open === liveSince ? <SoFarSheet digest={data.digest} target={target} onClose={finish} /> : null
  return { card, sheet }
}

function SoFarSheet({ digest, target, onClose }: { digest: Digest; target: Target; onClose: () => void }) {
  const sections = recapSections(digest, namers(target.me, target.names, digest.names).shown)
  return (
    <Sheet id="so-far-title" title="The meeting so far" onClose={onClose} returnTo={callAnchor}>
      <div className="recap">
        {sections.map((s) => (
          <RecapPart key={s.title} section={s} records={digest} onOpen={onClose} />
        ))}
      </div>
    </Sheet>
  )
}
