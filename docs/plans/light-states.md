# On paper the chosen piece rises

> 2026-10-17 · Luis: «Sí, empieza con las ramas 1 a 9», after the light-mode evaluation (informe-claro §6, row 8: D20).
> Studio only, CSS only; the room renders as before.

## What was measured

- informe-claro D20: on paper the lens thumb stands 1.18:1 _darker_ than its track (1.15:1 lighter in the room), the
  dock's squares at rest 1.06:1 under the dock, and the open conversation on a phone is a slab (#e3e0db) under its list.
  Each is the ink at an alpha: lighter than the void in the room, darker than the paper on paper.
- On main 65 declarations paint the ink by hand as a background. 25 are fields, controls at rest and states at five
  alphas: a field 0.03 (0.05 focused), the pill 0.04, the square 0.03, a thumb or a pressed segment 0.08, a hover 0.06
  (13 rules), a chosen row 0.06. Conversations' open row and its pressed «Open»/«Mine» read its own `--raise-2`, 0.075.
- The hovers alone use eight alphas (0.04, 0.045, 0.05, 0.06, 0.07, 0.075, 0.08, 0.14). No press paints an ink layer:
  the kit's presses sink half a pixel (`press-answers.md`), and a live card's `:active` mixes the text into its plane.
- No `--field`, `--control`, `--state-*` or `--focus-ring` token; the focus ring is the halo's ink at 0.7, written
  twice.

## What changes

- **Tokens (theme.css), eleven:** `--field`, `--field-focus`, `--control`, `--control-quiet`, `--control-selected`,
  `--control-selected-quiet`, `--control-selected-shadow`, `--control-track`, `--state-hover`, `--state-selected`,
  `--focus-ring`.
  - In the room each is the expression its rules wrote: the ink at 0.03, 0.05, 0.04, 0.03, 0.08, 0.075; the shadow `0 0
    transparent` (no room rule reads it); the track the glass; the ink at 0.06 twice; the halo's ink at 0.7. A quiet
    step is the room's second alpha for one role: the square's under the pill's, Conversations' quiet page under the
    thumb's.
  - On paper a field, a control at rest and the one chosen are the raised white (`--plane-2`), over the page and over a
    well; the one chosen rests on the first level (`--elev-1`, light-shadows.md), and its track (`--control-track`, the
    room's glass) sinks on paper, the ink at 0.04, so a white thumb never sits on white. Hover, selection and the focus
    ring stay the ink, as informe-claro's fourth principle says: their channels carry the theme.
- **Rules (29 declarations):** the 13 hovers at 0.06, the palette's and a PDF page's chosen row, a field at rest and
  focused, the select, a device's choice and a step's guide field, the pill and the decision pill, the square, the lens
  track and thumb, Conversations' open row and pressed toggle, and the two focus rings. Knowledge's pressed filter
  paints nothing of its own since informe-25 V4 (#459): the group's thumb shows it.
  Selectors and order stay. On paper three rules of its own, as light as theirs, add `--control-selected-shadow` after
  the thumb's and the open row's edge (at rest and hovered).
- **The room, pixel for pixel:** each rule reads the same colour through its token: the tokens resolve at the root,
  nothing redefines `--ink-rgb` or `--halo-text-rgb` below it, and `--raise-2` was the same 0.075 of the same ink. A
  shadow is paper's rules alone, so the room computes each `box-shadow` as main did.

## Checks, written first

- `states.test.ts` (unit, on the Studio's CSS): the eleven tokens hold in the room the exact expressions above; on paper
  the six fills are opaque white over the page and a well, hover and selection sink the paper as they lift the void, the
  shadow is the first level, the track sinks under a white thumb; the 17 rules read their tokens (the track's background
  said once); the room's edges are main's and paper's three rules add the level; no hover at 0.06, no chosen state in the
  ink and no focus ring is written by hand (18 were).
- `light-states.spec.ts` (e2e, fixtures): on paper the lens thumb stands lighter than its track, a call's dock presses
  at rest lighter than the dock, the open conversation lighter than its list, and the title filter is white. In the room
  (the control) the thumb keeps the ink at 0.08, the presses 0.03 or 0.04, the open row 0.075 and the field 0.03.

## Limits

- The row asked for three state tokens over the ten alphas: that moves the room. The 14 hovers at other alphas and the
  menu's checked choice (0.08 in a white menu) keep theirs; on paper their ink sinks as `--state-hover`'s does, so paper
  waits on nothing there. Folding them is a decision about the room's look, not this row's.
- `--state-press` is not added: nothing would read it.
- 25 more keep the ink as insets and marks (keys, tags, code, tracks, meters, dots, a skeleton's light, the scrollbar, a
  finished tile, a box of steps, a goal chip and a task's link at rest): a well sinks on paper, as the third principle
  has it.
- The white reads `--plane-2`, the same white as row 5's `--surface-raised`. On row 5's well (#fdfbf8) the open row
  stands 1.03:1 over its list, the contact shadow carrying the rest.
