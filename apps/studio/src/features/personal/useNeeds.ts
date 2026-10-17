// What needs the person, read for Home (docs/plans/needs-api.md): the read (A15), under the vision or the attention
// flag, every 20 s as the projects are; and the way to each need, where it lives. Undefined while both flags are off,
// the padlock is shut (the read carries Sophia's replies: nothing personal is read or kept while it is), the read is on
// its way or failed: Home is then as it was, her light alone.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Need as WireNeed } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import { tokenSubject } from '../../app/auth-callback.ts'
import { clockSkew, listNeeds, markNeedSeen, needsOf, whereOf, type NeedAt } from '../../api/needs.ts'
import type { View } from '../../app/route.ts'
import { ATTENTION } from '../../app/attention.ts'
import { VISION } from '../../app/vision.ts'
import type { Need } from './needs-you.ts'
import { READ_FAILED, readState } from './places-view.ts'
import type { Read } from './ReadNotes.tsx'

export interface NeedsGo {
  /** A project's view, at the record the need names when the Studio has an address for it. */
  project: (projectId: string, view: View, at: NeedAt) => void
  /**
   * The personal space, at the turn named (Sophia's reply): resolves true once that turn is shown there, false when it
   * is not (the space failed to read, or the turn is not in it), so a reply is marked seen only when it was seen.
   */
  personal: (turnId: string | null) => Promise<boolean>
}

/** Home's needs, their opener, and the service's clock against the browser's (ms to add to now). */
export type NeedsSeen = { items: readonly Need[]; open: (need: Need) => void; skew: number }

export interface NeedsOptions {
  /** The vision or attention flag by default; the fixture decides for itself. */
  enabled?: boolean
  /** The personal padlock: shut, nothing is read and nothing read is shown. */
  locked?: boolean
}

/** A read the service refused for who is asking (401, 403), not one that failed on the way. */
export const refusedBy = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 401 || error.status === 403)

/** Opens a need where it lives; for a reply, resolves once its turn is shown (or false when it is not). */
export function openNeed(wire: readonly WireNeed[], go: NeedsGo, need: Need): Promise<boolean> {
  const found = wire.find((w) => w.id === need.id)
  const where = found ? whereOf(found) : { place: 'personal' as const }
  if ('place' in where) return go.personal(found?.ref.kind === 'personal_turn' ? found.ref.id : null)
  go.project(where.projectId, where.view, where.at)
  return Promise.resolve(true)
}

/** What Home gets: the needs when read, and the read itself for its notes (a failed read says so, with Try again). */
export interface NeedsRead {
  seen: NeedsSeen | undefined
  /** Null while nothing is read (no flag, the padlock shut): nothing to report. */
  read: Read | null
}

/** Home reads what needs the person under either flag: the vision flag's fixtures, or A15 served (attention). */
const NEEDS_SHOWN = VISION || ATTENTION

export function useNeeds(token: string, go: NeedsGo, options: NeedsOptions = {}): NeedsRead {
  const { enabled = NEEDS_SHOWN, locked = false } = options
  const client = useQueryClient()
  // Keyed by the account, not the token: a refreshed token is the same person, and their rows stay while it reads
  // again (Codex on #245).
  const queryKey = ['vision', 'needs', tokenSubject(token) ?? token]
  const read = useQuery({
    queryKey,
    // When the answer arrived, beside it: `readAt` is the service's clock and this is the browser's, at the same moment.
    queryFn: async ({ signal }) => ({ list: await listNeeds(token, signal), receivedAt: Date.now() }),
    enabled: enabled && !locked,
    refetchInterval: 20_000,
    retry: false,
  })
  const got = read.data
  // The rows read last are kept through a poll that fails (the list stays actionable), and the note says the read
  // failed beside them: `isError` is read apart from the cached rows (Codex on #245).
  const note: Read | null =
    enabled && !locked
      ? {
          state: read.isError ? 'failed' : readState(read),
          failed: READ_FAILED.needs,
          retry: () => void read.refetch(),
        }
      : null
  // A refusal (401, 403: A15's «Not permitted») is not a passing failure: what was read before is no longer the person's
  // to see, so the cached rows go with it; only a transient failure keeps them (Codex on #245).
  if (!got || locked || refusedBy(read.error)) return { seen: undefined, read: note }
  const wire = got.list.needs
  // A reply has no answer of its own: opening it is its seen mark (A15), and the list is read again once it is kept.
  // A write that fails is read again too: the row stays where it was, which is the truth, and the next press writes
  // again (nothing that failed may look done: Codex on #245).
  const seen = (need: Need) => {
    if (need.kind !== 'reply') return
    const again = () => client.invalidateQueries({ queryKey })
    void markNeedSeen(token, need.id).then(again, again)
  }
  return {
    seen: {
      items: needsOf(got.list),
      // A reply is marked seen once its turn is shown (Codex on #245, round 8): a personal space that failed to read
      // or shows an older conversation marks nothing, and the need stays.
      open: (need) => {
        void openNeed(wire, go, need).then((shown) => {
          if (shown) seen(need)
        })
      },
      skew: clockSkew(got.list.readAt, got.receivedAt),
    },
    read: note,
  }
}
