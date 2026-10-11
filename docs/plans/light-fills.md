# Accents as tints on paper, and the primary in the brand's violet

> 2026-10-11 · Luis: «Procede con los arreglos», after informe-ui-premium §8: on paper the accents that were darkened
> for text are painted as fills, so a pastel tile in the room becomes a dark block on the page, and the primary press
> is a navy (`#2f2566`) where the brand's violet should be. No API change.

## What was measured (headless, 1440×900, the 13 fixture pages in both themes: `light-mode/fills.json`)

- Accent fills that carry words on the light pages: the primary press (`.pill.primary`, `--core`, on sign-in, the
  room and Tasks), the microphone when live (`.round[aria-pressed]`, `--core`), the report tiles (`.report-tile`,
  40×40, «MD» · «HTML» · «PDF» in the void's ink on teal, amber and rose), the cover's format tag
  (`.report-cover-tag`, amber) and the cover's mark (`.report-cover-mark`, the same family). Every other accent fill is
  a dot or a 3 px bar: a solid accent is right for those on paper too.
- The chips already do it right (`.chip.teal`: the accent at 0.1 as the fill, the accent as the ink): the pattern
  exists; the tiles predate it.
- The light core `#2f2566` was chosen for 12.6:1 with the mark in mind; the mark has its own inks since UIKIT-27, so
  the core is free to be the brand's violet: `#5546b8` (the light theme's `--halo-text`) reads 7.0:1 under the paper's
  ink `#fbf8f3`.

## What changes

- **Fill tokens for the three accents that paint boxes with words**: `--teal-fill` / `--on-teal`, `--amber-fill` /
  `--on-amber`, `--rose-fill` / `--on-rose`. In the room: the accent and the void, as today. On paper: the accent at
  0.14 over the paper, and the accent as the ink (teal 6.1:1, amber 5.6, rose 5.9 on paper: the same inks the chips
  use). `.report-tile`, `.report-cover-mark` and `.report-cover-tag` take them.
- **The paper's core is the brand's violet**: `--core: #5546b8`, `--core-hover: #4a3ca6`, `--core-rgb: 85 70 184`;
  `--on-core` stays the paper. Every primary press, the live microphone and the ready send on paper turn from navy to
  the brand's violet. In the room nothing changes.
- Dots and bars keep the solid accent.

## Checks

- `e2e/light-fills.spec.ts`: on Tasks and Knowledge in light the tiles and the tag are the opaque paper tints (no
  alpha; the mixed values `#dae4de`, `#ece1d4`, `#efddde`, pinned) with the accent as ink, at 4.5:1 or more; on sign-in in light the primary press is `rgb(85, 70, 184)` and
  hovers to `rgb(74, 60, 166)`, its ink at 4.5:1 or more; in the room the tile keeps the pastel fill and the void's ink.
- `light-mode.spec` pins the new hover; `pnpm format`, `lint`, `typecheck`; measured in the pane before the push.

## After the review (Codex on #250)

- An alpha tint takes the colour of whatever is under it: the cover's format tag sits over the card's plane while a
  report loads (4.3:1 there) and over the page's own first screen after. The tints are now mixed with the paper
  (the accent at 14 % over `#fbf8f3`, mixed once: `#dae4de`, `#ece1d4`, `#efddde`), opaque, so the tag carries its own backing wherever it sits and
  the spec measures the fill it has, not a paper it assumes.
