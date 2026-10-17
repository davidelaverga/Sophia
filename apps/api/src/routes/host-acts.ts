// A host act's evidence (docs/plans/activity-followups.md): written only when the room server did something, as its
// own result says. A microphone already off, a camera or a screen not on, no one to mute: nothing happened, nothing
// is recorded (Codex P2 on #355).
import { PartialMute } from '../livekit.ts'

/**
 * Records the act once the room server says it did something: true, or a count above zero. A batch that failed after
 * changing some (PartialMute) records what it did through `partly` (by default the act itself, for an act on one
 * person), never as the whole act done, and its failure still answers the request (Codex P2s on #385).
 */
export async function recordedIfDone(
  done: Promise<boolean | number>,
  record: () => Promise<unknown>,
  partly: (partial: PartialMute) => Promise<unknown> = record,
): Promise<void> {
  let result: boolean | number
  try {
    result = await done
  } catch (err: unknown) {
    if (err instanceof PartialMute && err.muted > 0) await partly(err)
    throw err
  }
  if (result === true || (typeof result === 'number' && result > 0)) await record()
}

/**
 * A camera or screen stop's evidence (A31). A screen share is its video and its sound: a stop that muted one and then
 * failed leaves the other live, which neither "Screen sharing stopped" (0060's room.host_screen_off) nor any other act
 * the project's activity knows can say truthfully. So a partial screen stop records nothing, and its failure still
 * answers the request (Codex P2 on #385, r4302170752). A camera stop keeps recordedIfDone's default.
 */
export function recordedStop(
  act: 'camera' | 'screen',
  done: Promise<boolean | number>,
  record: () => Promise<unknown>,
): Promise<void> {
  return recordedIfDone(done, record, act === 'screen' ? nothingRecorded : record)
}

/** A partial effect no existing act names: nothing is written. */
const nothingRecorded = (): Promise<void> => Promise.resolve()
