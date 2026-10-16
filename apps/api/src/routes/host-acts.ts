// A host act's evidence (docs/plans/activity-followups.md): written only when the room server did something, as its
// own result says. A microphone already off, a camera or a screen not on, no one to mute: nothing happened, nothing
// is recorded (Codex P2 on #355).

/** Records the act once the room server says it did something: true, or a count above zero. */
export async function recordedIfDone(done: Promise<boolean | number>, record: () => Promise<unknown>): Promise<void> {
  const result = await done
  if (result === true || (typeof result === 'number' && result > 0)) await record()
}
