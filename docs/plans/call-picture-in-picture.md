# Keep the call in view: picture in picture

> 2026-11-16 · Lote 18, point 11 (`evaluacion-2026-11-16/textos-lote-18.md`, «Imagen en imagen»): a dock button «Keep
> the call in view», help «Picture in picture». Luis approved the lines that day, word for word.

## What was measured

- Nothing in the Studio asks for picture in picture: no `documentPictureInPicture`, no `requestPictureInPicture`
  (searched on main `9495c87fc`). A person who switches to another tab or app loses the call from sight.
- The dock's live controls are `LiveControls` in `RoomDock.tsx`; they unmount when the call is no longer live, which
  is where a call's own things end.
- The stage's videos are `VideoView`s in `VideoStage.tsx`: the shared screen in `figure.screen-main`, a person pinned in
  `figure.spotlight-main`, the people in `.tile[data-actor]`.

## What changes

- **«Keep the call in view»** in the dock, after React: a round button whose tip is «Picture in picture». Pressed, it
  reads as on (`aria-pressed`); pressed again, the small window closes.
- **Where the browser has Document Picture-in-Picture (Chromium),** the small window shows the stage's one view, chosen
  by `pipShows` (`pip-view.ts`, pure):
  - a shared screen (the newest), captioned as the stage captions it («Marco’s screen»);
  - else the one speaking, another before you; else another with a camera; else another; else you;
  - their camera, or their initial, with their name (« · you» for your own).
  It follows the call as it moves: the window is a portal of the dock's own render. The page's styles go with it.
- **Elsewhere, where only video picture in picture exists,** the stage's main video goes into it
  (`requestPictureInPicture`): the shared screen, else the tile of whoever `pipShows` picks, else any video on the
  stage. Without a video on the stage there is nothing to show, and the button isn't offered.
- **Neither (Firefox, an old Safari):** no button.
- **On a phone (≤ 600 px)** it isn't offered either: phones have no Document Picture-in-Picture, leaving the app is
  the phone's own picture in picture, and the dock keeps its one row of seven (`phone-dock.md`).
- **Ending it** from the small window (its close, or the browser's back to the tab) gives the page back as it was, and
  the button reads as off. **Leaving the call** closes it: the button's unmount closes the window or leaves video
  picture in picture.

No new words beyond the two approved lines: the window's caption uses the stage's own («Marco’s screen», «Ana · you»).

## Checks (written first)

- `pip-view.test.ts`: the screen before anyone; the one speaking, another before you; another with a camera; you last;
  and the way: document, else video only with a video, else none.
- `call-pip.spec.ts`, over the fake LiveKit with the browser's API stubbed:
  - with Document PiP, the press asks for a window, which shows the one speaking; the button reads as on; the window
    closed gives it back as off; pressed again and then Leave, the window is closed;
  - with video PiP only and cameras on, the press puts a stage video into it; without a video, no button;
  - with neither, no button.

## Not here

- PiP survives only while the dock is mounted: a person who goes to another project's page (where the mini dock takes
  over) closes it. Switching tabs or apps, its use, keeps it.
- No controls inside the small window (mute, leave): Chromium's own back-to-tab is the way back.
