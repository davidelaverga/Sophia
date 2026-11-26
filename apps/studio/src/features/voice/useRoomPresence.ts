// The room's presence as the server gives it (room-presence.ts), read while this person is out of the call. It is
// Home's own query (`projectsQuery`: one key, read again every 20 s), so the two never say different things. Leaving
// the call reads it again at once, and until that read answers nothing is claimed: a read from while they were in still
// lists them. A guest (the lobby's token, no project list) reads nothing.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Identity } from '../../app/dev-identity.ts'
import { projectsQuery } from '../personal/usePersonal.ts'
import { presenceIn, READING, UNKNOWN, type RoomPresence } from './room-presence.ts'

export function useRoomPresence(
  projectId: string,
  identity: Pick<Identity, 'name' | 'token' | 'role'>,
  out: boolean,
): RoomPresence {
  const member = identity.role !== 'guest' && projectId !== ''
  const query = useQuery({ ...projectsQuery(identity), enabled: out && member })
  // When this person last came out of the call: set as the render sees it, so no frame shows the older read.
  const [was, setWas] = useState(out)
  const [leftAt, setLeftAt] = useState(0)
  if (was !== out) {
    setWas(out)
    if (out) setLeftAt(Date.now())
  }
  const { refetch } = query
  useEffect(() => {
    if (leftAt > 0 && member) void refetch()
  }, [leftAt, member, refetch])
  if (!member) return UNKNOWN
  if (query.dataUpdatedAt < leftAt || query.data === undefined) return query.isError ? UNKNOWN : READING
  return presenceIn(query.data, projectId)
}
