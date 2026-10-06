// What the room shows to everyone (room-present checks): the snapshot's `sharedFocus`, and the proposed A14 writer
// (issue #105) answered as it proposes: idempotent per key, refused against a room that moved, its reply lost when the
// page asks for that. Every id is synthetic.
import type { FocusReceipt } from '../src/api/vision.ts'

export interface Showing {
  focus: { artifactVersionId: string; guideId: string } | null
  /** The focus's own revision: one more with each change. */
  revision: number
  /** Each receipt by its Idempotency-Key, with the request it answered: the same key again replays it. */
  receipts: Map<string, { request: string; receipt: FocusReceipt }>
  /** The next show lands, but its reply is lost on the way (`window.fixture.loseNextFocusReply`). */
  loseReply: boolean
}

export const noShowing = (): Showing => ({ focus: null, revision: 0, receipts: new Map(), loseReply: false })

interface FocusRequest {
  artifactVersionId: string | null
  expectedRoomRevision: number
}

const isFocusRequest = (value: unknown): value is FocusRequest =>
  typeof value === 'object' &&
  value !== null &&
  'artifactVersionId' in value &&
  (typeof value.artifactVersionId === 'string' || value.artifactVersionId === null) &&
  'expectedRoomRevision' in value &&
  typeof value.expectedRoomRevision === 'number'

/** A request to show or stop, read from its body; null for a body that is not one. */
export function focusRequest(body: unknown): FocusRequest | null {
  const request: unknown = typeof body === 'string' ? JSON.parse(body) : null
  return isFocusRequest(request) ? request : null
}

/** The focus committed by `guideId`, at the room's next revision; its receipt is kept under its key. */
export function focusSet(showing: Showing, request: FocusRequest, guideId: string, key: string, cursor: number) {
  showing.revision += 1
  showing.focus = request.artifactVersionId === null ? null : { artifactVersionId: request.artifactVersionId, guideId }
  const receipt: FocusReceipt = {
    revision: showing.revision,
    artifactVersionId: request.artifactVersionId,
    anchor: null,
    cursor: String(cursor),
  }
  showing.receipts.set(key, { request: JSON.stringify(request), receipt })
  return receipt
}
