# The dock never takes a second row: its extras fold behind More controls

> 2026-11-23 · Luis: «No me gusta cuando esa barra se convierte en 2 stacks por el espacio. Sería mejor ocultar iconos y
> que salgan como con una flechita que si le das te los muestra». Stacked on `visual-fit.md` (#548), whose words give way
> to icons first. Studio only; no API change.

## Measured

On the fixture room, with Sophia speaking (Stop speaking, End) and the chat open beside the stage:

- At 880 × 800 the stage is 510 px. Before this change, even the icons (490 px) don't fit what the dock is given
  (458 px), so it takes two rows and is 87 px tall.
- On `main`, without #548, this happens from about 990 px of stage, as in Luis's capture at 1100: the words wrap.
- At 360 × 780 (a phone) with Sophia speaking, seven 42 px squares don't fit, and the dock takes two rows.

## What changes

The dock tries three layouts in order and keeps the first one that stands on one row (`firstFit` in `dock-fit.ts`):

1. its words;
2. its icons (`data-tight`, #548);
3. its extras folded (`data-fold`).

The extras are Share your screen, React, Raise hand and Keep the call in view. They already stand together in the row.
Folded, they wait behind one square, **More controls** (the kit's `more` glyph, ⋯). Pressing it opens them in a small
tray above it, dressed as a menu, with the same controls, states and keys.

How the tray behaves:

- **Focus:** opening it moves the focus to its first control, as the kit's popovers do.
- **Closing:** Escape or a press outside closes it. React's own menu inside closes on its own Escape first.
- **While open:** a press inside (raising the hand) keeps it open.
- **Closed:** while something inside is on (the screen shared, the hand raised), More controls carries a small dot.
- **When room comes back:** the extras return to the row, More controls goes, and an open tray closes.

This works at every width, a phone included. At 390 the seven squares still fit, so nothing folds. At 360 with Sophia
speaking, the extras fold and the row stays one.

The dock's height contract (`--dock-h`) is unchanged: one row is 47–48 px.

| Measure                                  | Before          | After                         |
| ---------------------------------------- | --------------- | ----------------------------- |
| 880 × 800, chat open, Sophia speaking    | 2 rows, 87 px   | 1 row, 47 px, ⋯ with 4 inside |
| 1280 × 800, chat closed                  | 1 row, words    | same                          |
| 1280 × 800, chat open                    | 1 row, icons    | same                          |
| 390 × 844, people = 2                    | 7 squares       | same, nothing folded          |
| 360 × 780, Sophia speaking               | 2 rows          | 1 row, ⋯ with 2 inside        |

The results are the same in dark and light. The tray uses the menu's plane and line in both.

## New words, pending Luis

- «More controls», the square's name and tip and the tray's label. The alternative is «More options».
- The glyph is ⋯, the kit's «more» as on a person's row and a tile. The alternative is an up chevron, as Luis put it
  («una flechita»). It is not used here because the dock already has two small up chevrons (Audio and Video settings)
  that open other things.

## Checks

- **`dock-fit.test.ts`:** `firstFit` keeps the words when they fit and tries nothing else; it takes icons when only they
  fit; it folds when the icons wrap, without reading the fold.
- **`e2e/dock-fold.spec.ts`:**
  - at 880 with the chat open, one row, ⋯ shown, the four extras out of the row;
  - the tray opens above the dock with the focus on its first control, and Escape closes it with the focus back;
  - React's menu closes before the tray;
  - a hand raised keeps the tray open, and closed, the ⋯ carries the dot;
  - widened to 1280, the extras are back and ⋯ goes;
  - at 1280 nothing folds;
  - @phone: nothing folds at 390, and at 360 one row with ⋯.
