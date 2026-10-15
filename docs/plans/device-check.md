# A person checks their camera and microphone before joining

> 2026-10-15 · The second of three pieces after Luis's «Procede» (call-devices.md first, backgrounds third): Meet's
> waiting screen, where a person sees their picture, watches their voice move a meter and chooses their devices
> before they enter.

## What was measured

- Before this, a person met their camera and microphone only inside the call. Nothing showed their picture or their
  voice's level beforehand.
- After #340, the opener beside Join lists the devices but shows neither the picture nor the level.

## What changes

- **Beside Join, «Check audio and video»** opens a sheet in place of #340's menu. It holds:
  - the camera's picture;
  - a meter that moves with the voice (`role="meter"`, «Microphone level»), read from the microphone's samples in
    steps, so it redraws only when it moves;
  - a row per device kind (Microphone, Speaker where the browser can choose one, Camera), each naming the device in
    use and opening the kit's menu to choose another;
  - **Join the room**, which enters the call with them.
- **The sheet asks the browser for the chosen camera and microphone,** as wanted and not required, and again when one
  is chosen. It lets both go when it closes or joins, so the call opens its own.
- **With access refused,** the picture's place says how to give it, and Join still enters.
- **Join in the dock stays one press**, as call-devices.md says; the check is there for whoever wants it first.
- A choice in the sheet is kept for the next call, as a choice in the dock's menus is (`room.switchDevice`).

## Checks

- `device-check.test.ts`: the level from the samples (silence, a voice, loud, steps); the constraints asked for.
- `device-check.spec.ts`, with the camera and microphone stood in for (a painted canvas, a steady tone), and every
  request recorded:
  - the picture plays, the meter moves, and the rows name the devices;
  - a microphone chosen is the one asked for next;
  - Join enters with it after letting both go;
  - closing lets both go and joins nothing;
  - with access refused, the sheet says how to give it and Join still enters.
- `call-devices.spec.ts`: the camera chosen before joining is now chosen in the check.

## Left

- A test sound for the speaker.
