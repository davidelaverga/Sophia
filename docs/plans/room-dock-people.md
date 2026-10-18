# Leave, People and names over video

> 2026-10-17 · informe-25 (`evaluacion-2026-10-17/informe-25.md`), R1, R3 and R14, from Luis's «Sigue con la cola … y el
> nuevo informe-25». Studio only, no API. R12 (one dock row with the panel open on a computer) waits on Luis.

## What was measured

- **R1, Leave.** Its icon drew the door on the right with the arrow walking into it: the log-in glyph. At rest it was
  ink on the faint plane, like Camera and Screen; the rose came only under a pointer, which a phone never has (the
  seventh square of the phone's dock looked like the other six). It was already last everywhere.
- **R3, People.** The names stood 8 px off the panel's gutter (1069 against the tabs' 1077 at 1440 px). Each menu was a
  36 px square in a 32 px column: it reached the window's edge (and x = 390 on a phone), past its row and past Close's
  end (1428). «Mute everyone» was a ghost with no box at x = 1069, so it read as a heading.
- **R14, names over video.** On paper the chips were the paper at 0.62 over a black video: grey chips with dark words,
  near gone on a tile with no camera. The screen's caption, paper at 0.66 over black, carried «Show Marco’s screen» at
  2.85:1, below 4.5.

## What changes

- **Leave's icon** (`Icon.tsx`) is the way out: the door behind on the left, the arrow leaving it. One icon serves the
  dock, the header's dock, the places bar and the sheets' rows.
- **Leave at rest** (`theme.css`) wears the kit's danger tint, rose ink on rose at 0.08 with an edge at 0.4; under the
  pointer one step deeper (0.16, edge 0.6). The places bar keeps its squares bare at rest, so there the rose ink alone
  says it, and its plane (0.12) answers the pointer (`personal.css`).
- **People** stands on the gutter: the list is padded `--panel-pad − 8 px`, so each row's own 8 px frames its name in
  its hover plane and the names land on the tabs' line. The menu is the kit's 32 px square (`Button kind="icon"
  size="md"`), which fills its column and ends where Close's box does; on touch it is 40 px and its column follows, so
  it stays inside its row. «Mute everyone» is the kit's small pill (28 px) on the gutter.
- **Names over video** (`.tile-name`, `.screen-main figcaption`) are one chip in either theme: black at 0.62 with the
  room's inks copied from `:root` (`#ecebf1`, the warm `#f1dcc7`, the offer's `#b9a8ff`). The video under them is black
  on paper too. Over a paper tile with no camera the words read about 5.7:1 and the floor's warm 5.1:1; the offer reads
  about 10:1 over the black caption.

## Checks, written first

- `room-dock.spec.ts`: Leave's path is stroked at (4.5, 9) and not at (19.5, 9), at 1280 and 390; rose at rest at 1280,
  390 and in light (ink, plane at 0.08, edge at 0.4, not Camera's ink), 0.16 under the pointer, last in the dock; rose
  and last in the header's group on Tasks.
- `app-auth.spec.ts`: in the places bar's call Leave is rose with a bare plane at rest, and its plane changes under the
  pointer.
- `host-controls.spec.ts`: at 1440 px every name and «Mute everyone» on the tabs' line, the name 8 px inside its row,
  «Mute everyone» 28 px tall, each menu 32×32 ending at Close's end, 12 px or more from the window's edge and inside
  its row; on a phone, names at 16 px and each menu 40 px or more inside its row.
- `light-stage.spec.ts`: in light and dark, every tile's chip and the screen's caption black at 0.62 with the room's
  ink, the floor's warm, «Show Marco’s screen» in `#b9a8ff`, and nothing under 4.5:1 in the gallery or the caption.

## Limits, and for Luis

- The chips copy the dark room's inks: if the dark palette moves, they follow by hand (the rule says so).
- A black chip on paper bends light-mode.md's «no dark plane»; it is the video's black, not a plane of the page.
- `lowContrast` measures a chip over its tile's plane, not over live video: the worst case is the paper tile.
- The rose shows at rest in every view during a call (the header's 28 px Leave, the sheets' rows): worth a look in the
  captures.
- Open #425 (people volume) and #430 (`.tile-muted-corner`) touch the same rules: whichever lands second takes the
  gutter padding, the 32/40 px columns and the shared chip rule.
