# Paper has its own material

> 2026-10-17 · Luis: «Sí, empieza con las ramas 1 a 9», after the light-mode evaluation (informe-claro §6, row 7: D8).
> Studio only, CSS only; the room renders as before.

## What was measured

- **The primary's bevel** (`.pill.primary`) was the void at 0.16 under its face. In the room that line sits 1.43:1
  darker than the face; on paper the void is the paper, and the line sat 1.43:1 _lighter_, as if lit from below
  (informe-claro: 1.42 on sign-in).
- **The lift** (13 rules: every pill, fields, providers, the segmented track, the dock and the floating bars) is white
  over the face: at 0.04 in the room, 1.07–1.09:1 over its glass, a pill and a raised plane; at 0.7 on paper, 1.00:1
  over a white sheet.
- **The sheen** (`--sheen-rgb`, five sheens on a board's task tile) had no paper value: white over a white tile, 1.00.
- **The glass** on paper was the paper at 0.8, so over the page it composed the page's own colour: the sign-in's field
  stood 1.00:1 apart from the page around it. It backs 28 rules; 8 float over the stage, over her orb and the tiles'
  video.

## What changes

- **Tokens (theme.css):** `--bevel`, a filled press's lower edge, and `--glass-stage`, glass over the stage. In the
  room they are what the rules wrote: the void at 0.16 one pixel under the face, and `var(--glass)`.
- **On paper:**
  - the bevel is the ink at 0.36, 1.42:1 darker than the violet face: the room's step, the right way up;
  - the lift is the ink at 0.04, one pixel _under_ the face: 1.08:1 on white and on a pill, the room's sheen
    mirrored;
  - the sheen is declared white: over a white sheet, the lit plane already, it paints nothing, decided here rather
    than inherited;
  - the glass is the raised white (1.059:1 over the page): the other 20 are opaque sheets (fields, providers, the
    identity buttons, the segmented track, an avatar's backing, the chat's bar, messages and notices, the brief's
    request and tasks, the mission, the task form, the mini dock, the lobby, the wait note, the report's note, the
    passage bar, Personal's day pill);
  - the stage's glass keeps paper at 0.8 for the dock and its notes, the looking pill, the panel toggles, what she
    made, who shows what, a reconnect over the tiles and the reactions.
- **Rules:** `.pill.primary` reads `--bevel`; those eight backgrounds read `--glass-stage`. Selectors and order stay.
- **The room, pixel for pixel:** `--bevel` is the declaration `.pill.primary` had, word for word, and resolves to
  `rgb(5 4 8 / 0.16)`; `--glass-stage` is `var(--glass)`, `rgba(12, 11, 17, 0.74)`; `--lift`, `--sheen-rgb` and
  `--glass` keep their room values. Nothing redefines `--glass`, `--void-rgb` or `--sheen-rgb` in a subtree, so each
  rule reads what it read before.

## Checks, written first

- `material.test.ts` (unit, on theme.css): the room's five values as above; paper declares all five itself; on paper
  the lift is an ink line under the face within 0.03 of the room's step; the primary reads `--bevel`, darker below in
  both themes by the same step (1.43 and 1.42); paper's glass is opaque and 1.04:1 or more over the page, its stage
  glass translucent, and the eight stage rules read it.
- `light-material.spec.ts` (e2e, fixtures): on sign-in, in both themes, the primary's last rows are 1.15:1 or more
  darker than its face; on paper the field stands 1.04:1 or more apart from the page beside it, white, its lift the ink
  under it; in a call the dock and the panel toggles keep their glass (the room's in the dark), and the chat's bar is
  opaque white on paper and the room's glass in the dark.

## Limits

- The task tile's sheens stay written in white: a paper sheen would need its own gradient (shade below, not light
  above), and the tile's depth on paper is its shadow, row 6's.
- `--glass` on paper names the raised white here; row 5's `--surface-raised` is the same white once merged, and row 8's
  `--field` and `--control` may take the field and the segmented track from it.
- The glass that stays is today's paper glass over the stage; its look there (a white frame round the video, or the
  room's dark call inside the paper) is row 15's decision.
- Five rules lay the void at an alpha instead of the glass (the top bar at 0.78, the orbit, a tile's name, a figure's
  caption, the sheet's backdrop): not `--glass`, so left as they are; the backdrop is row 16's veil, the tile's name
  row 15's.
