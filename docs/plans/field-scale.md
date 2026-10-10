# A field stands on two heights

> 2026-10-10 · Luis: «sigue con UIKIT-02: Input/Search y Segmented». The kit's second piece, the fields; the segmented
> and the tab strips are the next PR, with their own measure. No API change.

## What was measured

- The fixture pages at 1280×800 and 1440×900, every visible input, select and field group (a probe in the browser pane):
  - a field group (`.field`: the sign-in address and code, the door's name, a guest's email with Send, a member's email
    with role and Add, Tasks' and Resources' search, the personal find, the data sheet's confirmation) is **42 px**
    (a border, 4 of padding, a 32 input or press, 4, a border); an input on its own is 36; Home's line 46.
  - so a toolbar holds three heights: on Tasks the search is 42 beside a segmented of 36; on Resources the search is
    42, the segmented 36 and the sort was 38 (28 since the press scale).
  - four searches, three looks: Tasks and Resources in a quiet group (42, no magnifier), Knowledge a bare input (36,
    radius 6, no magnifier), Conversations' filter a raised input (36, radius 8, a magnifier at 32 px, no edge).
- `packages/ui` had no field and no search; each place drew its own.

## What changes

- **`Field` and `Search` in `@sophia/ui`** (over the pure `field-class.ts`). `Field` is the group (`div`, or `form`
  when it is one) at `size` md (36) or lg (44), `quiet` or not. `Search` is one look for every search: a box
  (`.search`) that places the magnifier in the glass and carries the tip, an input of 36 inset past it; its width is
  its place's (`className`).
- **The scale in `theme.css`**: `.field` 36 (a floor of 36, padding 3, its input 28, its select 28, its press 28 by
  the field's rule, `.field > .pill`); `.field.lg` 44 (a floor of 44, its input 36, its press 36). The press's size comes from the field, never from the
  press: no consumer sets `size` on a button inside a field.
- **Moved onto the kit**: the sign-in address and code and the door's name (`Field as="form" size="lg"`: 42 → 44, the
  press 32 → 36); Tasks', Resources', Knowledge's and Conversations' searches (`Search`: 42 → 36 the first two, the
  magnifier on all four, one radius). The other groups (Invite, the find, the data sheet) keep `.field` and take 36
  by the rule, their press 28.
- `e2e/field-scale.spec.ts`: on nine pages, every visible input or select, read as its group when in one, is 36 or
  44; the sign-in's code step too; the Invite sheet's guests and members fields; and on Tasks and Resources the search
  and the segmented beside it share one height (36). `field-class.test.ts`: the classes and the scale.

## States

- A field's states are unchanged: hover (`--line-3`), focus-within (the ring on the group), invalid (`aria-invalid`
  on the input, the group's edge rose), read-only while an outcome is unknown, a disabled press inside (a primary
  waits as an outline). A search clears with Escape and blurs on the second (TaskSearch, ResourcePanel), as before.
- On a phone the press inside a field keeps its 40 (`pointer: coarse`), and the group's input grows with it (`height:
  auto`), as before.
- The keyboard: `/` reaches a search (its tip says so), the find's keys are unchanged; Conversations' return to the list
  focuses the filter's input (the selector follows the box).
- A screen reader hears nothing new: the inputs keep their names; the box is a span with no role; the tip is decorative.

## Checks (written first)

- The spec's measure on the pages before the change: 42 px on sign-in, the door, Tasks, Resources, personal (the find
  is a fixture state) and the Invite sheet; with the change, none off the scale.
- Mutants, with the control passing: `.field`'s padding back to 4 fails every page with a group; `.field.lg > .pill`
  removed fails sign-in and the door (a 32 press in a 44 field: the group stays 44, so the press's size is checked by
  eye in the pane, not by the spec: left below).
- `pnpm check` clean.

## Left

- Home's line (`.hw-say`, 46) is a line, not a box; its height goes with Home's type-scale work (#213), not here.
- Textareas (composers, the brief's note, a conversation's context) grow with their words; a floor for them (36 at
  rest) is measured by eye today and gets its spec with `Sheet`/`Composer`.
- The press inside a hero field is 36 by the field's rule; the spec reads the group, not the press.
- Next: `Segmented` (36 with 28 presses; a small one 32 with 24: the report viewer's format) and the underline tab
  strips (34 · 36 · 38 today → 36).
