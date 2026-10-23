# The room's basics: how long, your own tile, your mirror

> 2026-10-16 · Luis's QoL queue, item 1 (from informe-brechas-a-fondo.md §3). Meet, Zoom and Teams all show how long
> the call has run, let you hide your own tile, and let you choose whether your camera is mirrored. The Studio does
> none of these. Your own camera is always mirrored (`VideoStage.tsx:29`), and nothing says how long you've been in.
> Studio only.

## What changes

- **How long:** a quiet clock in the dock, before Leave. It counts from when this person's call went live
  (`room.liveSince`), as «12:04», or «1:02:05» past an hour. It has `role="timer"`, and its name says it in words
  («In the call for 12 minutes»). `call-clock.ts` (pure) does the words. The phone's dock, a single row of squares,
  leaves it out, as Meet's phone dock does.
- **Mirror my video:** a checkbox item in the dock's «Video settings», under the background. Unchecked, your camera
  shows as others see it. It is kept on this device (`mirror-preference.ts`, on by default, one store that the dock and
  the stage both read).
  - Not in a menu on the tile: a tile clips what overflows it (`overflow: hidden`), and a small tile would cut a menu.
- **Hide my tile:** a press on your own tile, where other people's tiles have Pin. Your tile leaves your own gallery,
  for this call only, and the others still see you. In its place, a small item at the end of the tiles says «Your tile
  is hidden» with «Show», and it takes the focus the press had.
- **The kit's `MenuItem`** gains `toggle`. With it, an item that turns one thing on or off is a `menuitemcheckbox`,
  where a `checked` item without it stays one of a set (`menuitemradio`).
- **The fixture:** the viewer's camera, once turned on, gives a local feed (`fake-people.ts`), as LiveKit's local
  track does.

## Follow-ups (Codex P2 on #380)

- **Hiding your tile never adds one:** «Your tile is hidden» takes one of the tiles people get (`peopleTiles` in
  tile-view.ts), so the gallery stays at nine and a phone's strip at five, on one row.
- **In a fifth of a phone** (65 px) its words give way to an eye struck through over Show; a screen reader still hears
  them. Three lines of words didn't fit there.

## Checks

- **`call-clock.test.ts`:** 0:00, 1:05, 1:02:05, and the words for each.
- **`room-basics.spec.ts`:**
  - in a call, the dock's clock reads 0:00, then 1:05 after 65 s (clock installed);
  - «Hide my tile» takes your tile away and «Show» brings it back;
  - with the camera on, your video is mirrored. «Mirror my video» unchecked unmirrors it, and after a reload it is
    still unmirrored.
