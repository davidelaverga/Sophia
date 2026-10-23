# On paper a shadow is a level

> 2026-10-17 · Luis approved branches 1 to 9 of the light-mode plan (`evaluacion-2026-10-17/informe-claro.md` §6,
> row 6, `light/elevacion`, finding D7). Studio only, CSS only. The room does not change by a pixel.

## What was measured

- 26 cast shadows read `rgb(var(--shadow-rgb) / calc(a * var(--shadow-k)))` in six sheets (theme 11, artifacts 4,
  conversations 4, personal 3, board 3, resources 1), and `.welcome-band` wrote its own black at 0.32: 27 in all, 15
  geometries, 19 with their strengths. One layer each; paper kept the room's geometry at 0.35 of its strength
  (`shadow.md`): no contact, no levels.
- The evaluation (D7): on a phone in a call they left blotches of ~1.4:1 under the panel toggles and the dock; the
  welcome band, the first thing a guest sees, cast black at 0.32 on paper, 1.8 times the toast's shadow.
- Modelled (a Gaussian of σ = blur / 2 over the box, composited on `#fbf8f3`): the dock's `0 16px 48px` at 0.175
  darkens the paper 1.26:1 four pixels under it.
- The Knowledge cards, the research card and the resource tiles cast nothing in either theme: on paper a white card
  stands out from the page by its 1 px line alone.

## What changes

- **Roles (theme.css, both token blocks):** 21 `--elev-*` tokens, one per kind of piece. The room's value is the black
  layer the piece had, its alpha written as it computed (`calc(0.55 * 1)` is `0.55`); paper points the role at a
  level. A card (`--elev-card`) is flat in the room: `0 0 transparent`, a shadow of nothing a piece's own list can
  still carry.
- **Paper's levels**, each two layers in the paper's ink, a contact (1 px down, 2 to 3 px of blur, 0.1) and an ambient
  (kept under the piece by a negative spread from the second level up):
  - `--elev-1`, resting on the page (ambient 0.04): the cards, the board's tile, the effort knob, a page's thumbnail;
  - `--elev-2`, at hand over it (0.08): the dock, the panel toggles, the mini dock, the made card, the composer, the
    passage bar, the rail's arrows, the day pill, a hovered tile;
  - `--elev-3`, over everything (0.14): menus, popovers, the palette, tips, toasts, the new version's note, the lobby,
    the welcome band;
  - `--elev-side`, a sheet in from the right (0.12): the sheet, the report pane, Conversations' context, Personal's
    notes. A page rising from a cover's foot casts the first level turned up.
- **The pieces** read their role. `--shadow-k` is gone; `--shadow-rgb` is read inside the two token blocks only.
- **A card rests on paper:** `:where(:root[data-theme='light'] .card)` reads `--elev-card` with no weight, so the
  board's tile and the resource tile, which cast lists of their own, win whatever the sheets' order; on paper the
  resource tile adds it after its rim, in a rule as light as its own. In the room neither rule exists.

## The room stays

- Every role's room value is what its rule computed: the geometry, the black, the alpha. `elevation.test.ts` resolves
  each piece's shadow with the room's tokens and compares it with the 27 values pinned from main (f37006560).
- The room computes what it did: the card's rest and the resource tile's added contact are paper's rules alone, so a
  card still reads `none` and a resource tile its rim (the computed paint of 14 fixture pages, diffed against main).

## Checks, written first

- `elevation.test.ts`: no piece casts a shadow of its own (a layer off its box, blurred, with a colour, outside the
  two token blocks, local tokens included); no `--shadow-k` anywhere, no `--shadow-rgb` outside the blocks; every role
  a piece reads has a room value and a paper one, on paper two layers, a contact (3 px of blur or less) then a wider
  ambient; the room's 27 values. On main the first three fail and the fourth passes.
- `light-shadows.spec.ts`: on a phone in a call on paper, the dock and the panel toggles alone over the bare page,
  1.15:1 or less four pixels out (modelled 1.26 on main, 1.08 now) and their contact at 1.06:1 or more; on paper a
  task tile, a resource tile and a Knowledge card on a contact edge of 1.06:1 or more in the two rows under it
  (modelled 1.21 now; the resource tile and the card 1.00 on main, the tile 1.15); in the room the tile's
  `0 1px 2px` at 0.3, the dock's `0 16px 48px` at 0.5 and a flat Knowledge card.
- `light-mode.spec.ts`: the account menu on paper casts the third level.
- Run here: the unit test, Prettier, oxlint and tsc. The specs and the paired captures are the session's.

## Limits

- 21 roles, not 3: three tokens cannot tell the room's 19 strengths apart without moving its pixels. The roles are
  the inventory both themes share; paper gives them five values.
- Glows (no offset: the live dots, the rings, the drop-shadows) are `light/estado-vivo`'s; the insets and the bevel
  `light/material`'s. A resource tile's flash still starts from its glow list.
- Paper's alphas come from the model and the evaluation's numbers; the paired captures may tune the ambients.
