# Switch camera on a phone, in a call

> 2026-10-17 · a follow-up of #412 (phone devices). On a phone the dock keeps one row of squares, so its device menus
> aren't there in a call: once in, the front camera couldn't become the back one without leaving. Studio only.

## What changes

- **Your own tile in the gallery gets «Switch camera» on a phone,** at its top-left corner: Hide my tile keeps the right.
  It moves to the next camera, round: a phone's front, then its back.
- **It's there only when it can do something:** your camera is on, the device lists two cameras or more, and the screen
  is a phone's (600 px or less, where the dock's device menus are hidden). On a computer, Video settings chooses.
- **The choice is kept,** as a camera picked in the menu is: the next call starts on it.
- **`camera-flip.ts`** (pure) says which camera comes next. `useCameraFlip` lists the cameras while yours is on.
- **The kit gains a `flip` icon:** a camera with a turn inside it.

## Checks

- **`camera-flip.test.ts`:**
  - the camera after the one in use, round;
  - none with fewer than two cameras.
- **`camera-flip.spec.ts`:**
  - on a phone with the camera on, «Switch camera» on your tile switches to the next camera, then back;
  - with the camera off there's none;
  - on a computer there's none.

## Follow-ups (Codex P2s on #422)

In `phone-tiles-follow-ups.md`: the switch follows the call's own camera, is 40 px wide on a touch screen, and «In the
call» has it while your tile is in «+N». On a phone's strip your tile holds one press: «Your tile», a menu of Switch
camera and Hide my tile (Luis, 2026-10-18).

In `camera-flip-resync.md` (Codex P2 on #464): a camera chosen in Video settings, which a phone turned sideways shows,
is where your tile's next press goes on from.
