// «Show everyone» and «Stop showing» (docs/plans/room-present.md): the room's focus, set through the A14 writer proposed
// in issue #105, against the room's revision, with one Idempotency-Key per intent (useAdmission). The revision goes
// with the intent, so a retry resends the very same request. Offered only under the vision flag, where the fixture
// pages answer it. Committed, the room's feed carries the focus to every stage.
import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAdmission } from '../../api/useAdmission.ts'
import { setRoomFocus, type FocusReceipt } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'

/** Where a «Show everyone» goes: the version it shows, and what to do once it is committed (the pane closes…). */
export type ShowRender = (versionId: string, onShown: () => void) => ReactNode

export interface FocusTarget {
  projectId: string
  identity: Identity
  roomId: string
  /** The room's revision as the page read it: the writer refuses a room that moved since. */
  revision: number
}

interface Props extends FocusTarget {
  /** The version to show; null stops showing. */
  versionId: string | null
  label: string
  className?: string
  onShown?: () => void
}

/** One intent: what to show, against the room as it was read when it was pressed. */
interface FocusIntent {
  versionId: string | null
  revision: number
}

/** What the button says after its press, when it didn't simply go through. */
function focusWords(state: ReturnType<typeof useFocusWrite>['state']): string {
  if (state.status === 'unknown') return 'Not confirmed.'
  if (state.status !== 'rejected') return ''
  return state.error.code === 'stale_revision' ? 'The room changed. Show it again.' : state.error.message
}

function useFocusWrite({ projectId, identity, roomId }: Omit<FocusTarget, 'revision'>) {
  const queryClient = useQueryClient()
  return useAdmission<FocusIntent, FocusReceipt>(async (key, intent) => {
    try {
      return await setRoomFocus(identity.token, roomId, key, {
        artifactVersionId: intent.versionId,
        expectedRoomRevision: intent.revision,
      })
    } finally {
      // The snapshot carries the focus to this stage too, as the feed carries it to the others'.
      void queryClient.invalidateQueries({ queryKey: snapshotKey(projectId, identity.name) })
    }
  })
}

export function FocusButton({ versionId, label, className = 'pill', onShown, revision, ...target }: Props) {
  const write = useFocusWrite(target)
  // After no reply, a press is the open intent again, with its own request and key (pressFor), never a second one.
  const press = async () => {
    if (await write.send({ versionId, revision })) onShown?.()
  }
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={write.state.status === 'sending'}
        onClick={() => void press()}
      >
        {write.state.status === 'unknown' ? 'Try again' : label}
      </button>
      {/* Mounted all along, so what it says is announced. */}
      <span className="focus-said" role="status">
        {focusWords(write.state)}
      </span>
    </>
  )
}
