# On paper a live piece is ringed

> 2026-10-17 · Luis approved branches 1 to 9 of the light-mode plan (`evaluacion-2026-10-17/informe-claro.md` §6,
> row 9, `light/estado-vivo`, finding D21). Studio only, CSS only. The room does not change by a pixel.

## What was measured

- 33 glows of colour, blurred and on their box, in five sheets: 21 box-shadows, 11 drop-shadows and 1 text-shadow. One
  had a paper rule (the bar's live mark, `drop-shadow(0 0 3px)` of halo-deep at 0.5, `light-paper-mark.md`); the other
  32 took paper's darker accents at the room's strength.
- On paper a halo of colour only darkens: modelled (a Gaussian of σ = blur / 2, composited on `#fbf8f3`), Home's
  Continue dot (`0 0 10px 2px` of the halo at 0.55) leaves the paper 1.23:1 darker 2 px out, 1.15 at 4 px, 1.04 at 8.
- The turn's border on camera (`.tile[data-speaking]`: a 1 px ring of the warm at 0.6 and a 28 px glow at 0.16) reads
  2.5:1 against the stage 6 px out, modelled; the evaluation measured 2.08 on paper and 4.3 to 4.5 in the room.
- No rule kept a hand-written colour out of the effects: 16 shadows, filters and gradients outside the token blocks
  wrote one, so a light drawn for the dark room alone could land with no paper answer.

## What changes

- **Roles (theme.css, both token blocks):** 27 `--glow-*` tokens, one per kind of piece, for 32 of the 33 glows. The
  room's value is the layers the piece had, as written; paper names its own.
- **Paper's two answers**, which the roles point at:
  - `--glow-sm`, a small light is its own opaque fill and casts nothing: the mini dock's live dot, the panel toggles'
    dot, Home's Continue, Personal's two dots, the corner sparks (an ask, a resource or a task that changed), the
    running and mine dots and the guide's progress, the full meter, the goal rail's bar, the report's section dot,
    Sophia's worker, the ticked notes and the focused composer's haze;
  - `--glow-lg`, a large live piece is ringed: two solid pixels of the accent its role names after it. Who speaks on
    camera and their presence, in the warm (5.56:1 on paper); the task a hovered tile waits on, in the halo.
- **Where a filter drew it**, paper draws none: the ask toggle's mark, Sophia's mark beside her lines, the board's
  thread and its spark, the QR's haze.
- **Her mark keeps its soft light** (the bar's mark live, the threshold's breath and its still halo): paper restates
  the values `light-paper-mark.md` gave it. It is her light, and D3 asks paper for more of it, not less.
- The bar's live mark reads its token in its paper rule, which still has to outrank the rule at rest.

## The room stays

- Every room value is the text of the declaration it replaced, and it reads only the accents' tokens (`--halo`,
  `--halo-rgb`, `--halo-text-rgb`, `--warm-rgb`, `--teal-rgb`, `--amber-rgb`, `--rose`), which are set on the root and
  nowhere else (no sheet, no inline style): resolved at the root, they are what each piece resolved itself.
- `glow.test.ts` resolves each piece's shadow or filter with the room's tokens and compares it, every layer, with the 32
  values pinned from main (8222aa4b8: 33 glows, one of them a paper rule's); the keyframes (`threshold-breathe`,
  `ask-light`) included.

## Checks, written first

- `glow.test.ts`: no piece writes a glow of its own (a layer on its box, blurred, in a colour, outside the two token
  blocks, local tokens included); every role a piece reads has a room value and a paper one, on paper no blurred
  colour and only solid rings, but her mark's; the three large pieces ringed with two solid pixels; the room's 32
  values; and no rule outside the token blocks writes a colour (hex, a colour function on numbers, black or white) into
  a shadow, a filter or a gradient but the 7 listed (her paper halo, GPT's two, Personal's three hours, a report's
  cover), each of which must still write one. On main the room's values pass and the other four fail.
- `light-live.spec.ts`: on paper, on camera, the speaking tile's ring 3:1 or more against the stage at each side and
  `rgb(150, 83, 40) 0px 0px 0px 2px`; the paper 2 to 8 px around Home's Continue dot the same with the dot and without
  it (1.03:1 at most); in the room both keep their glow, to the value.

## Limits

- The flash of a resource tile that changed (`@keyframes tile-changed`) glows in its tool's own colour, set on the tile:
  no root token can carry it, so it stays as it was and the check names it.
- The list of hand-written colours is exact: an entry whose colour moves to a token has to leave it, and a stale or
  missing one fails the check (the room's literals left with row 2 and row 6).
- A local token holding a bare colour (`--tool-accent: #d97757`) is not an effect, and the check does not follow it.
- The opening (`public/entry.css`) paints before the theme loads and keeps its own colours (row 19, `light/apertura`).
