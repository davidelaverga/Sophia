# Two screens shared at once

> 2026-10-15 · The deep gaps report (`evaluacion-2026-10-15/informe-brechas-a-fondo.md` §2.6): the stage took the first
> shared screen only (`VideoStage.tsx`, `feeds.find(...)`), so a second share was invisible, with no word and no way to
> it. In Meet the newest presenter takes the stage and the others stay a press away. Luis's queue, item 3.

## What changes

- **`VideoStage`:**
  - The stage shows the screen shared most recently, as this browser saw them begin.
  - With more than one, under the screen's caption, «Also sharing» offers each other screen, «Show Marco's screen».
    Pressing it puts that screen on the stage for this viewer.
  - A choice that stops sharing gives way to the newest that remains.
  - Nothing is sent, so each viewer chooses for themselves, as a pin is theirs (room-pin-fullscreen.md).
- **The tiles** keep whoever is sharing the screen on the stage.
- **The fixture's room** gains `video=screens`: the first two people share at once.

## Checks

- `two-screens.spec.ts`:
  - with two screens shared, the newest is on the stage and the other is offered;
  - pressing it shows that one, and offers the first back;
  - with one screen shared, nothing is offered.
