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
