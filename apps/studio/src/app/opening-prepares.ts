// The opening's last step, inside the signed-in Studio (docs/plans/entry-opening.md): Home's own reads settled, the
// person's likeliest projects warmed, then it hands off. Its own module, in the signed-in Studio's chunk: it reads the
// API, which a sign-in page never downloads (docs/plans/signed-in-later.md).
import { useIsFetching, useQueryClient, type Query, type QueryClient } from '@tanstack/react-query'
import type { ProjectList } from '@sophia/contracts'
import { useEffect, useRef } from 'react'
import type { Identity } from './dev-identity.ts'
import { WARM_AT_MOST_MS } from './entry-progress.ts'
import { open, reach, showing } from './entry.ts'
import { nextFrames, wait } from './useOpening.ts'
import { likeliest, warmCode, warmProjects } from './warm.ts'

/** Home's own first reads, for this person: their space and their projects (usePersonal.ts). */
const homeRead = (name: string) => (q: Query) =>
  q.queryKey.length === 2 && (q.queryKey[0] === 'personal' || q.queryKey[0] === 'projects') && q.queryKey[1] === name

/** With Home ready: the likeliest projects warmed, and the code that comes later fetched, then all is ready. */
async function prepare(client: QueryClient, identity: Identity): Promise<void> {
  const list = client.getQueryData<ProjectList>(['projects', identity.name])
  const ids = list ? likeliest(list.projects, new Date()) : []
  warmCode()
  if (ids.length > 0) {
    reach('space')
    await Promise.race([warmProjects(client, ids, identity.name, identity.token), wait(WARM_AT_MOST_MS)])
  }
  reach('warm')
}

/**
 * Inside the signed-in Studio, while the opening is up: once Home's own reads have settled for two frames running,
 * its likeliest next places are made ready, and the opening hands off.
 */
export function OpeningPrepares({ identity }: { identity: Identity }): null {
  const client = useQueryClient()
  const reading = useIsFetching({ predicate: homeRead(identity.name) })
  const started = useRef(false)
  useEffect(() => {
    if (reading > 0 || started.current || !showing()) return undefined
    return nextFrames(() => {
      started.current = true
      void prepare(client, identity)
        .catch(() => undefined)
        .finally(() => void open())
    })
  }, [reading, client, identity])
  return null
}
