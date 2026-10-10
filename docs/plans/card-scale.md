# A card is one piece

> 2026-10-10 · Luis: «sigue con UIKIT-06: Card». The kit's seventh piece, after Button, Field/Search, Segmented, Tabs,
> SheetFrame and Menu. No API change.

## What was measured

- Four raised surfaces, each drawn by hand: the board's research card (`.task.work-card`: `--glass` at 0.74 over the
  page, **no edge**, `--r-3`, 12 × 14 of padding, no answer), the board's tiles (`.task-tile`: a gradient over
  `--plane-2`, an **inset** edge of its own (`--edge`, 0.06 white), `--r-3`, 10 × 12, a 2 px lift and a deeper shadow
  on hover, `scale(0.99)` pressed, the halo ring), the resource tiles (`.resource-tile`: `--plane-2`, a 1 px `--line`
  edge, `--r-4`, 14, the edge to `--line-2` and the plane 3 % up on hover in 140 ms, no press, the ring) and the
  Knowledge cards (`.report-card`: `--plane-2`, the 1 px edge, `--r-4`, 8 · 8 · 14 around a cover of their own
  (`--plane`, the edge, `--r-3`), the edge to **`--line-3`** on hover, no press, no ring of their own).
- Four paddings, two radii, three planes, two kinds of edge, three hovers and two presses, for one idea: a thing on
  a raised plane. The informe's §2.3: «hover y pressed iguales en todas».
- Not cards: the goals (a list with rules between), home's rows, a conversation's or a meeting's row (rows, no
  plane), the stage's `.tile` (a person's video).

## What changes

- **`Card` and `CardCover` in `@sophia/ui`** (over the pure `card-class.ts`): a card is whatever element its place
  needs (`as`: `li`, `button`, `div`…), of a kind (`base`, or `tile` for the board), and `live` when it answers (a
  button or a link is, unless told otherwise). It names its own layout; the kit gives it its surface.
- **The surface in `theme.css`** (`.card`): `--plane-2`, a 1 px `--line` edge, `--r-4`, 14 px of padding; `.card-tile`
  `--r-3` and 10 × 12. **One answer** (`.card.live`): the edge to `--line-2` and the plane 3 % up under the pointer,
  in 140 ms; pressed, the plane 6 % up and the card down half a pixel; the halo ring 2 px outside for the keyboard.
  `.card-cover`: `--plane`, the edge, `--r-3`, nothing past its edge.
- **The four move onto it.** The research card gains the edge and the base padding (12 × 14 → 14) and leaves `--glass`
  for the plane; the tile keeps its gradient, its lift and its state edges (`--edge` now colours the border, and a
  tile with a state keeps it under the pointer: `--card-edge-hover`), loses its own inset edge and its `scale(0.99)`;
  the resource tile keeps its rim and its waiting edge, and loses its own hover and ring; the Knowledge card keeps its
  8 around the cover (`.card.report-card`, named with the card so it outweighs the 14 whatever the sheets' order),
  its hover goes from `--line-3` to the kit's `--line-2`, and it gains the press.
- `e2e/card-scale.spec.ts`: on the board, Knowledge and Resources, every `.card` on screen has the radius of its kind,
  a 1 px solid edge (in `--line` unless the card wears a state), the plane and the padding of its kind, and every
  cover the cover's; one live card per page lights to `--line-2` under the pointer, sinks half a pixel pressed, and
  rests again; a resource tile reached from the keyboard wears the 2 px halo ring. `card-class.test.ts`: the class and
  the scale.

## States

- Rest, hover (edge and plane), pressed (plane and the sink), focus-visible (the ring); a tile's own states on top
  (waiting, working, changes, changed, lit: their edge colour, their glow), a resource's waiting edge, a card's
  `data-state` for its words. Reduced motion is unchanged (the transitions are 140 ms, no movement but the half pixel).
- A static card (the research card) has no answer and no pointer cursor; its controls inside answer on their own.
- A screen reader hears the same: the same elements, roles and names as before (the kit adds no role).

## Checks (written first)

- The spec's measure before the change: the research card `0px none` of edge, `--glass`, 12 × 14; the tile `0px`
  of border (its edge an inset shadow); the Knowledge card lighting to `--line-3`. With the change, the one surface.
- Mutant, with the control passing: `.card`'s radius set to `--r-3`, every base card measures 8 and the measure
  reports it; `.card.live:hover` removed, the live checks find the edge still in `--line`.
- `pnpm check` clean.

## Left

- The goals' list, home's rows and the conversation rows keep their rules: rows, not cards. The stage's `.tile` is
  a person's video, not a card.
- Next piece: `Skeleton` (informe-30 §2.1), with the empty states.
