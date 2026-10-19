# Your tile's camera switch, in step with a camera chosen elsewhere

> 2026-10-18 · Codex P2 on #464 (`camera-flip.ts:82`), not a P1; #464 merged under the no-P1 rule, this closes it.
> Luis, the same day: «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en
> un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando». One small PR, Studio only: two
> source files and one CSS rule (the review's P1 below), no API, no kit change.

## The gap, read in the code

- **The presses keep their own camera** (`cameraPresses`, `camera-flip.ts`): from the camera kept for calls at the
  call's first press, then the one each press asked for (back where it was if refused). They are the tab's, one call at
  a time (`liveSince`), so they outlive the video view.
- **Nothing else moves it.** A camera chosen in Video settings goes through the room's `switchDevice`
  (`RoomDock.tsx` → `deviceSwitch`, `useProjectRoom.ts`), which keeps the choice for the next call and switches this
  one, but the presses never hear of it, and after their first press they don't read the kept choice again (#422's fix:
  it can part from the call's).
- **A phone shows Video settings turned sideways:** at 600 px or less the dock's device menus are hidden and your tile
  has Switch camera; wider, as a phone on its side (844 × 390), the dock is a computer's and has them. But not within
  reach, until this branch (the review's P1, below): on a touch screen the menu's rows are 44 px, Video settings is
  576 px tall, and it opened upward from 348 px down a stage 460 px tall that hides what runs past it, so its two
  cameras sat at −180 and −134 px, above the stage's top, where no scroll goes (measured in the fixture at 844 × 390).
- **So:** switch camera in portrait (front to back), turn the phone, choose the front in Video settings, turn it back:
  the next press goes on from the back and asks for the front, the camera already on. The press seems to do nothing;
  with three cameras it skips one. Where storage can't be written the same happens without a first press: the call's
  first press starts from nothing kept, so after the back was chosen in Video settings it asks for the back again.
- **A refusal is kept too** (found while reading `deviceSwitch`): a camera Video settings couldn't switch to is kept
  for the next call all the same, while this call stays on its own, and the call's first press, reading the kept
  choice, goes on from the camera refused.

## What changes

1. **The presses hear every switch of the call's camera that took** (`cameraPresses(...).took`): the call is on that
   camera now, and the next press goes on from it, whichever control made the switch.
2. **The room asks every camera switch through one place** (`switchCamera(liveSince, id, …)`, from the room's
   `switchDevice` in `useProjectRoom.ts`), whichever control made it: Video settings, your tile, «In the call». The
   call's presses begin there before the switch, from the camera kept for calls, which the switch is about to replace
   even if refused; once it took they are told. A refused one tells nothing: the call stays where it was. So a choice
   made before any press counts where nothing can be kept, and a refused one never becomes the first press's camera.
3. **A press waiting for its answer still leads** (`cameraPresses`): the next press goes on from the camera the latest
   waiting press asked for, else from the camera the call is on. The call's own switches come back through the room
   too, so a first press answered while a second waits must not pull the third back: three quick presses go round.
   A refused press leaves the call's camera as it was, so the next press asks for the same camera again.
4. **The dock's device menus scroll inside the room above the dock** (`.device-menu > .menu`, `theme.css`): at most
   the stage's height, or the screen's where the stage runs past it (a phone on its side), less the floor, the dock
   (`--dock-h`, its notes included), the 6 px between and a margin. A menu that fits, as on a computer, is unchanged.
   Without it the path this note fixes can't be taken on a phone. At 844 × 390 the dock wraps to two rows (96 px, the
   corner beside it) and Video settings sits on the first: the menu is 260 px, from 88 px down the stage to the opener,
   and scrolls; with the page at its end its top is 18 px from the screen's.

What #464 proved stays: with nothing kept the presses go round; a refused switch is asked again; two quick presses go
round; turning your camera off and on keeps the presses; each call starts again.

## The review's findings (2026-10-19)

- **P1, verified:** the three browser checks below couldn't press a camera in Video settings at 844 × 390, so they
  would have failed on that press at every commit, the RED as well as the GREEN. Read in `theme.css`: `.room-stage` is
  460 px (`min-height`) with `overflow: hidden`; `.menu-top` opens 6 px over the opener with no height limit; touch
  rows are 44 px (`pointer: coarse`, which the `@phone` project has). Seen in the browser too: at `82fd261d8` the three
  checks timed out on the camera row, «element is outside of the viewport». Fixed by item 4, its own check written
  first.
- **P2, the same cause in the product:** a person can't choose a camera there either; the note's line above said the
  dock had them. Fixed by item 4 rather than a taller viewport in the checks: the checks keep the phone's own size.
- **P2, the seam had no check that ran:** two unit checks now press through `switchCamera` and `callPresses` (exported
  for them), each shown red against a control (below).

## Checks (written first)

- **Unit** (`camera-flip.test.ts`): a switch made elsewhere moves the next press on from that camera (with two cameras,
  the next is the other one, not the one already on; with three, round from it); the call's own switches, told back as
  any switch is, don't hold three quick presses back.
- **Unit, the seam** (`camera-flip.test.ts`, after the review): a switch that took through `switchCamera` is where the
  call's next press goes on from; a camera Video settings couldn't switch to, kept all the same (the room keeps a
  choice before it switches), is asked again by the call's first press. Written after the fix they cover, so shown red
  against controls: the taken switch left untold, and the presses begun after the switch (as at `93d43ae69`).
- **Browser, `@phone`** (`e2e/call-devices.spec.ts`, after the review): turned sideways in a call, every row of Video
  settings, brought into view as a finger would scroll to it, is what a press at its middle reaches.
- **Browser, `@phone`** (`e2e/camera-flip.spec.ts`), the person's own path in the fixture: Switch camera on your tile
  at 390 × 844, the viewport turned to 844 × 390 where the dock's Video settings shows, a camera chosen there (the same
  menu and choice the dock uses, `menuitemradio`), the viewport back to 390 × 844, Switch camera again:
  - after a switch on your tile, the camera chosen in Video settings is where the next press goes on from;
  - where storage can't be written, a camera chosen in Video settings before any press is where the first press goes
    on from;
  - where every switch is refused (`refuse=switch`), after Video settings couldn't switch the camera, the first press
    goes on from the call's own camera, not the one refused (written first in its own commit, after the reading above).

  Those three were committed before the menu could be reached, so their RED at those commits would be the press on the
  camera row. Their RED is shown instead on controls built on the branch's head, menu fix included, and kept off the
  branch: `camera-flip.ts` and `useProjectRoom.ts` as on `main` (no resync), and as at `93d43ae69` (the presses begun
  after the switch).

## Limits

- The presses hear of a switch once it has taken. A switch made elsewhere while a press of your tile still waits
  for its answer (two controls at once, which a phone's two layouts never show together) is counted, but the waiting
  press still leads the next one.
- The presses follow the switches this page made. A camera the system changed under the call (unplugged, taken by
  another app) isn't told. LiveKit's own record of the active camera (`getActiveDevice`, livekit-client 2.22.3) starts
  as `'default'` and is set on publish and when a track restarts, from the track's own report, which it awaits apart
  from the switch; reading it would need the fixture to fake it too, so it was left out of this change.
