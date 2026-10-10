# A tab strip is one piece

> 2026-10-10 · Luis: «sigue con UIKIT-03: Tabs». The kit's fourth piece, after Button, Field/Search and Segmented. No
> API change.

## What was measured

- Three underline tab strips, each drawn by hand: the Invite sheet's (`.sheet-tabs`: **34** px tabs, a 1.5 px line in
  the first ink under the one on, a line under the strip), the room's side panel's (`.side-tabs`: **36**, the same
  line), the report viewer's (`.report-tablist` in `.report-tabs`: **38**, a 2 px halo border instead of the line).
  Three heights, two marks for «on», three copies of the arrows (`nextInRow`) and of the one Tab stop.
- The goals' rail (`GoalTabs`) is a row of cards (208 px wide, 10 px of padding), not a strip: it stays as it is.

## What changes

- **`Tabs` in `@sophia/ui`** (over the pure `tabs-class.ts` and the kit's `roving.ts`): a row of tabs that names
  itself, each tab naming the panel it controls (`controls`) and taking an id (`idFor`) for the panel that names it;
  the arrows, Home and End move the choice and the focus with it, and the row is one Tab stop.
- **The strip in `theme.css`** (`.tabs`): 36 px tabs, a 16 px gap, the third ink at rest, the second on hover, the
  first when on, with the 1.5 px line in the first ink under the one on; 44 px to a finger. The three strips keep only
  what is theirs: the Invite's line under the strip (`.sheet-tabs`), the report row's borders and its padding
  (`.report-tabs`), whose format switch moves from 3 to 2 px of margin so the row stays one line (36 + 2).
- **The three strips move onto `Tabs`**: the Invite sheet (34 → 36), the room's side panel (36), the report viewer
  (38 → 36; its halo border becomes the strip's line, as the other two).
- `e2e/tabs-scale.spec.ts`: on the three strips, once open, every tab is 36 px, the tab that is on wears the line and
  no other, the row has one Tab stop, and the arrows (Right, End) move the choice and the focus and show the panel;
  the report row holds its strip and its format switch on one line. `tabs-class.test.ts`: the class and the height.

## States

- A tab's states are unchanged: rest, hover, on (the line), focus-visible (the app's ring), the panel shown or hidden
  by `hidden`. The Invite sheet's three panels stay mounted (an address half typed survives switching), as before.
- The keyboard: Left and Right wrap, Home and End reach the ends, the choice follows the focus; `C` and `B` still
  open the room's panels from the dock (unchanged, outside the strip).
- On a phone the tabs are 44 px (`pointer: coarse`), as the side panel's were.
- A screen reader hears the same: a tab list by its name, each tab selected or not, each panel labelled by its tab.

## Checks (written first)

- The spec's measure before the change: the Invite's tabs 34, the viewer's 38; the viewer's «on» tab lined by a border,
  not an ::after. With the change, 36 everywhere, one line each.
- Mutant, with the control passing: `.tabs > button`'s height removed, the strips measure their words' line and the
  measure reports it; the line's `::after` removed, the measure reports no lined tab.
- `pnpm check` clean.

## Left

- The goals' rail keeps its own arrows (`nextInRow` from the kit); it is a rail of cards, not a strip.
- Next pieces: `Sheet`, `Menu`, `Card`, `Skeleton` (informe-30 §2.1).
