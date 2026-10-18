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

## Follow-ups (Codex P2s on #411)

- **A viewer's microphone off is muted too:** every person's token publishes a microphone (viewers since A06), so the
  standing no longer decides it.
- **On a phone's strip, the mute is the tile's corner mark:** a fifth of the screen (51 to 65 px) has no room for it
  in the chip, where it took a guest's whole name at 390 px and cut «guest» at 320 px. The chip keeps «muted» for a
  screen reader, and the mark sits at the top-left, clear of the initial's circle.

## Checks

- **`room-view.test.ts`:** `mutedMic` is true for a muted member or guest, and false for an open microphone or a
  listener.
- **`room-tiles.spec.ts`:**
  - with cameras on, your tile shows it once you mute, and goes when you unmute;
  - Marco's tile shows it once the host mutes him.
