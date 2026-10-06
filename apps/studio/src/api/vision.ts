// Requests to APIs proposed in issue #105 and not built yet: each shape is the proposal's, checked at runtime as the
// contract's parsers check theirs, so a different answer is an error, never a cast. Called only under the vision flag
// (app/vision.ts); the fixture pages answer them.
import { ApiError, callApi } from './client.ts'

/** A14: what showing (or stopping) answers once the room's focus is committed. */
export interface FocusReceipt {
  revision: number
  artifactVersionId: string | null
  anchor: string | null
  cursor: string
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function parseFocusReceipt(value: unknown): FocusReceipt {
  if (
    isObject(value) &&
    typeof value.revision === 'number' &&
    (typeof value.artifactVersionId === 'string' || value.artifactVersionId === null) &&
    (typeof value.anchor === 'string' || value.anchor === null) &&
    typeof value.cursor === 'string'
  ) {
    return {
      revision: value.revision,
      artifactVersionId: value.artifactVersionId,
      anchor: value.anchor,
      cursor: value.cursor,
    }
  }
  throw new ApiError(200, 'contract_violation', 'The focus receipt is not one', 'same_admission_key')
}

/** A14: show a report version to the room, or stop showing (null), against the room's revision. */
export const setRoomFocus = (
  token: string,
  roomId: string,
  key: string,
  body: { artifactVersionId: string | null; expectedRoomRevision: number },
): Promise<FocusReceipt> =>
  callApi(`/api/v1/rooms/${roomId}/focus`, { token, method: 'PUT', body, key }, parseFocusReceipt)
