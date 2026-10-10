# A segmented control is one piece

> 2026-10-10 · Luis: «sigue con UIKIT-02: Input/Search y Segmented». The kit's third piece; the second half of
> UIKIT-02 (the fields are PR #221). No API change.

## What was measured

- Six segmented boxes on the fixture pages, each drawn by hand over the same `.segmented` classes: the room's lenses
  (tabs with tips and keys), the board's lenses (radios with counts), Resources' filters (tabs with counts), Knowledge's
  format and project filters (pressed buttons), the places' switch in the bar (pressed buttons with tips, a badge, a
  lock). All measure 36 px with 28 px presses: the look was one already; the code was six (six thumbs, three roving
  key handlers, three ways to say a press is on).
- A seventh, the report viewer's format switch (`.report-format`), drawn apart: 32 px with **26** px presses, off the
  scale.
- `nextInRow` (the arrows across a row) lived in the Studio (`app/roving.ts`), reached by eight components.

## What changes

- **`Segmented` in `@sophia/ui`** (over the pure `segmented-class.ts` and `roving.ts`, moved into the kit; the
  Studio's `app/roving.ts` re-exports it). One box of presses of which one is on: `role` says what they are (`tablist`:
  tabs, `radiogroup`: radios, `group`: pressed buttons), `items` what each says (its words, a count, a tip, the panel
  it controls, a class and data of its own), `value`/`onChange` which is on. It owns the thumb (`useSlidingThumb`),
  the arrows and the one Tab stop for tabs and radios, and the attribute that says a press is on.
- **The scale in `theme.css`**: `.segmented` 36 with 28 presses as before, now with a floor of 36 (the board's box
  measured 35 by a subpixel of its row); `.segmented.sz-sm` 32 with 24 (the small type), a floor of 32. A pressed
  button reads as the first ink the way a selected tab does.
- **The thumb follows the option** (`useSlidingThumb`): it is placed again when the active option changes size and
  when the web font arrives, not only when the box does. Measured before: the room's thumb 3 px short and 2 px narrow
  of its option, Knowledge's 2 px narrow, once Geist had loaded without widening the box.
- **Seven boxes move onto `Segmented`**, their look unchanged: the room's lenses, the board's lenses, Resources'
  filters, Knowledge's two filters, the places' switch, and the report viewer's format switch (`size="sm"`, 26 → 24).
- `e2e/segmented-scale.spec.ts`: on six pages, every visible box is 36 with 28 presses (32 with 24 when small) and its
  thumb lies under the press that is on; the report viewer's switch is the small one; on Resources the arrows move the
  choice and the focus, and the row has one Tab stop. `segmented-class.test.ts`: the classes, the roles, the states,
  the scale, the arrows.

## States

- A box's states are unchanged: hover (the second ink), on (the first ink, the thumb under it), the thumb's glide once
  placed (`data-thumb-ready`), reduced motion (no glide). The places' switch keeps its lock and its badge (`data-*`
  and a class of the press's own); the room's lenses keep their ids, the panel they control and the note that
  describes them.
- The keyboard: as tabs or radios, Left and Right wrap, Home and End reach the ends, and the choice follows the focus
  (automatic activation); as a group, each press is its own stop and Space or Enter presses it. As before.
- On a phone the presses keep their 36 (`pointer: coarse`), and the small ones 36 too.
- A screen reader hears the same roles, names and states: tab/selected, radio/checked, button/pressed.

## Checks (written first)

- The spec's measure before the change: the report viewer's switch 32 / 26 (off); the six others 36 / 28.
- Mutant, with the control passing: `.segmented.sz-sm button`'s height removed, the viewer's switch measures 26 and the
  measure reports it; the thumb's `data-thumb` removed from a press, the measure reports the thumb astray.
- The spec's measure before the thumb change: the room's and Knowledge's thumbs astray by 2–3 px; after, under their
  option within a pixel on every page.
- `pnpm check` clean; the room's, Resources' and the board's own specs (lenses, filters) unchanged.

## Left

- The underline tab strips (`.sheet-tabs` 34, `.side-tabs` 36, `.report-tablist` 38) are not segmented boxes; they
  take one `Tabs` piece next (36, their line under the one that is on).
- `GoalTabs`, `SidePanel`, `InviteSheet` and `DocumentPane` still move their rows with `nextInRow` by hand; they move
  onto `Tabs` with it.
