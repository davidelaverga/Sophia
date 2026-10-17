# Reconnecting, said over video too

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §2, fault 5). With video on the stage, a call whose link
> dropped showed frozen tiles and no word. Studio only.

## Cause

- «Reconnecting…» lives in Sophia's line (`roomLine`), which the stage draws only without video (`RoomStage.tsx`, the
  light branch).
- The header's pill is the project feed's, not the call's: «The project feed, not the call» (`ProjectShell.tsx`).
- The dock treats `reconnecting` as live, so nothing else said it.

## What changes

- **Over video,** while the call reconnects, the stage says «Reconnecting…» at its top (`role="status"`), with the
  header's amber dot. It goes when the link is back.
- **It joins the column the stage already keeps over video** (`.stage-over-video`), above a card shown to everyone, so
  the two never overlap.
- **Without video,** nothing changes: Sophia's line already says it.

## Checks

- **The fixture:** the call's link can be lost and come back (`window.fixture.linkLost(true|false)`), as LiveKit's
  `Reconnecting` and `Reconnected` events tell `onStatus`.
- **`reconnecting-on-video.spec.ts`:**
  - with cameras on, the link lost says «Reconnecting…» over the tiles, and the word goes when it is back;
  - without video, Sophia's line says it, as before.
