# «You're muted» when talking with the microphone off

> 2026-10-15 · The deep gaps report's top call item (`evaluacion-2026-10-15/informe-brechas-a-fondo.md`, §2.5): in
> Meet, Zoom or Teams, talking with the microphone off says so. Here nothing did. Luis's queue, item 3.

## What was measured

- 0 hits for a muted-speech hint in the Studio.
- The device check already reads a microphone's level (`useDevicePreview.ts`, `levelOf`).
- With the microphone off, LiveKit keeps its track but disabled, so it hears silence.

## What changes

- **`muted-speech.ts`** decides, from level samples and their times, when to say it.
  - Loud means at least 0.25 on the meter's scale.
  - It speaks up after half a second of loud samples, where gaps under 200 ms still count as one stretch.
  - After that it stays quiet for 20 seconds.
  - It has no clock and no microphone of its own, so it is unit-tested.
- **`livekit-room.ts`:**
  - While the microphone is off in a call, the room opens its own stream on the chosen microphone, never sent, and
    feeds that detector ten times a second.
  - Turning the microphone on, leaving, or the call ending lets the stream go.
  - When the detector speaks up, `onSpeakingMuted` tells the room.
- **The dock** says «You're muted. Turn the microphone on to be heard.» for five seconds, as a status, next to the
  microphone.
- Nothing about the sound leaves the browser.

## Checks

- `muted-speech.test.ts`:
  - a blip says nothing, and half a second of speech says it;
  - short gaps don't break a stretch;
  - it stays quiet for 20 seconds after saying it.
- `muted-speech.spec.ts`:
  - with the microphone off, speech is said in the dock, and it goes once the microphone is on;
  - with the microphone on, nothing is said.
