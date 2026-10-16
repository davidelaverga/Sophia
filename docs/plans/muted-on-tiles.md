# A muted microphone shows on the video tile

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §4, the room). Without video, a muted person shows a
> crossed microphone beside their name (`Presences`). With video on the stage, their tile said nothing, while Meet,
> Zoom and Teams show it on the tile. Studio only.

## What changes

- **The rule moves to `room-view.ts`** as `mutedMic`, so the list and the tiles read one rule: off, and not a listener,
  who has no microphone to mute.
- **The tile's name chip** shows the crossed microphone first, as Meet's does, and is never cut with the name.
  - A screen reader hears «muted» after the name and its marks.
  - It shows for your own tile, and for another's when they or the host muted it.

## Checks

- **`room-view.test.ts`:** `mutedMic` is true for a muted member or guest, and false for an open microphone or a
  listener.
- **`room-tiles.spec.ts`:**
  - with cameras on, your tile shows it once you mute, and goes when you unmute;
  - Marco's tile shows it once the host mutes him.
