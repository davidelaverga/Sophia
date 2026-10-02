// A device change as LiveKit answers it (livekit-room.ts). Pure of LiveKit, so the rule is unit-tested.

/**
 * A change LiveKit rejected can still have left the device as asked: an off that waited on a publication still under
 * way, which then failed, leaves the microphone off. What counts is the device, not the rejection, so a note never says
 * a device stayed on when it is off.
 */
export async function deviceChange(change: Promise<unknown>, asAsked: () => boolean): Promise<void> {
  try {
    await change
  } catch (err: unknown) {
    if (!asAsked()) throw err
  }
}
