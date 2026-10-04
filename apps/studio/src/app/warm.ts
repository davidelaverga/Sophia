// The opening's purpose (docs/plans/entry-opening.md): while it plays, the Studio gets the person's likeliest next
// places ready, so their first press opens at once from a warm cache: each likely project's snapshot and membership,
// read with the very keys its screen reads them by, and the code its room and invite sheet load later.
import type { QueryClient } from '@tanstack/react-query'
import { getMembership } from '../api/access.ts'
import { getSnapshot } from '../api/client.ts'
import { membershipKey } from '../features/access/useAccess.ts'
import { workOrder } from '../features/personal/places-view.ts'
import { snapshotKey } from '../features/studio/useProjectFeed.ts'
import type { ProjectSummary } from '@sophia/contracts'

/** How many projects it warms: the ones Work shows first. */
export const WARM_PROJECTS = 3

/** The projects the person is likeliest to open next: those Work lists first (a session about to start leads). */
export const likeliest = (projects: readonly ProjectSummary[], now: Date, count = WARM_PROJECTS): string[] =>
  workOrder(projects, now)
    .slice(0, count)
    .map((p) => p.projectId)

/** Each project's first reads, into the cache its screen reads from. A read that fails is simply not warm: no retry. */
export async function warmProjects(client: QueryClient, ids: readonly string[], viewer: string, token: string) {
  await Promise.allSettled(
    ids.flatMap((id) => [
      client.prefetchQuery({
        queryKey: snapshotKey(id, viewer),
        queryFn: ({ signal }) => getSnapshot(token, id, signal),
        retry: false,
      }),
      client.prefetchQuery({
        queryKey: membershipKey(id, viewer),
        queryFn: () => getMembership(token, id),
        retry: false,
      }),
    ]),
  )
}

/**
 * The code a project's room and its invite sheet load later, fetched now into the browser's cache. Never waited on,
 * and not on a connection that asks to save data.
 */
export function warmCode(): void {
  const saving = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
  if (saving) return
  void import('../features/voice/livekit-room.ts').catch(() => undefined)
  void import('../features/access/InviteSheet.tsx').catch(() => undefined)
}
