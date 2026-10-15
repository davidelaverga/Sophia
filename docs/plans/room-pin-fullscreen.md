# A shared screen goes full screen, and a person can be pinned

> 2026-10-15 · Point 5 of the gaps report (`evaluacion-2026-10-15/informe-brechas-funcionales.md`): a shared screen
> couldn't go full screen and no tile could be pinned; the layout was automatic. Luis: «Sí, hazlos en ese orden».

## What was measured

- `VideoStage.tsx` lays the room out on its own: a shared screen takes the stage with the tiles beside it, and cameras
  alone make a gallery. There's no `requestFullscreen`, no pin, no spotlight. Who keeps a tile is `tile-view.ts`'s
  rule.

## What changes

- **Full screen**, from a press on the stage's main view: a shared screen, a report shown or a person pinned.
  - The button shows under the pointer or the focus: «Full screen», then «Exit full screen».
  - Esc leaves full screen, as the browser's own does.
  - Where the browser has no full screen (`document.fullscreenEnabled`), it isn't offered.
- **Pin**, on each person's tile in the gallery, under the pointer or the focus.
  - The person pinned takes the stage, as a shared screen does: their camera, or their initial, with their name, and
    the others in the strip beside.
  - It is this viewer's alone: nothing is sent, and nobody else's room changes. «Unpin» gives the gallery back.
  - A shared screen still takes the stage over a pin, as on Meet.
  - Whoever is pinned keeps a tile before anyone else (`tile-view.ts`).
  - A person pinned who leaves gives the stage back.

## Checks

- `tile-view.test.ts`: the person pinned keeps a tile first, before the floor and the screen.
- `room-pin-fullscreen.spec.ts`:
  - a shared screen goes full screen and back;
  - a person pinned takes the stage with the others beside, nothing sent, and Unpin gives the gallery back;
  - a pinned person who leaves gives it back.
