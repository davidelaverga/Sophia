# A menu is one piece

> 2026-10-10 · Luis: «sigue con UIKIT-05: Menu». The kit's sixth piece, after Button, Field/Search, Segmented, Tabs and
> SheetFrame. No API change.

## What was measured

- Four menus, each drawn by hand on the same plane (`--plane-2`, a 1 px `--line-2` edge, `--r-3`, a 6 px padding,
  the 18/50 shadow): the account's (`.account-menu`: **8** px under its avatar, rows of 32 in the **small** type,
  230 wide), the resources' sort (`.resource-sort-menu`: **6** px under its button, rows of 32 in the small type,
  the order in use marked with its own dot), the personal space's days (`.popover.menu-list` under `.c3-daybar`:
  rows of 32 in the **body** type, the topics in `.muted` at 10.5), and the dock's «Pass to…» (`.pass-list`: **10**
  px over its button, a **4** px padding, a 12/32 shadow, no arrival, rows of 32 in the body type at 500, the warm).
  Four offsets, two paddings, two types, two shadows; three copies of the rows' rule and a fourth of the arrows (the
  pass list kept its own `focusStep`).
- `usePopover` (the press outside, Escape back to the control, the arrows, Tab out) was the Studio's; three of the
  four menus used it, the pass list did not.
- The privacy chip's answer (`.popover.chip-pop`, a dialog with a paragraph and two presses) is a popover, not a
  menu: it stays as it is.

## What changes

- **`Menu`, `MenuItem`, `MenuHead`, `MenuSep` in `@sophia/ui`** (over the pure `menu-class.ts`): the panel of a
  `usePopover`, which now lives in the kit too (`Popover` is its type). `Menu` takes the popover, its name, its side
  (`bottom`, or `top` over the dock) and its alignment (`end`, `start`, `center`); a `MenuItem` acts, or, given
  `checked`, is one of a set (`menuitemradio`) and wears the mark when it is the one on; `disabled` is a press that
  waits (`aria-disabled`, focusable, silent); `detail` is a word or two beside the item's own, in the label type.
- **The plane in `theme.css`** (`.menu`): 6 px from its control, 6 px of padding, 2 px between rows, 160 wide at
  least, the arrival; `.menu-top`, `.menu-start`, `.menu-center` (centred with `translate`, which the arrival's
  `transform` leaves alone). Its rows: 32 px, the body type, the lavender `.menu-mark`, the `.menu-detail`; 44 px to
  a finger (`pointer: coarse`, where they were 40). Each menu keeps only what is its own: the account's 230, the
  sort's width (its field's), the days' place under the pill, the pass list's 140 and its warm; each width named with
  the menu (`.menu.pass-list`, `.menu.resource-sort-menu`) so it outweighs the plane's 160 whatever the order the
  sheets load in (Codex on #227: the sort's measured 160 where its field's 128 had lost to the plane's).
- **The four menus move onto `Menu`**: the account's (8 → 6 px, 12 → 13 px), the sort's (12 → 13 px), the days'
  (`.muted` → `detail`), the pass list (10 → 6 px, 4 → 6 of padding, the kit's shadow and arrival, 500 → 400, its
  own arrows and blur-out gone: it closes like the others, on a press outside, Escape or Tab).
- `e2e/menu-scale.spec.ts`: on the four menus, once open and arrived, the plane (padding, radius, edge), 6 px from
  the control on its side and aligned to it, rows of 32 in 13 px, every row out of the Tab order, the first (or the
  checked) focused; the arrows move, Escape closes and gives the focus back, Tab closes, Enter passes the floor; on
  a phone the rows are 44. `menu-class.test.ts`: the class, the roles, the scale.

## States

- A row's states are unchanged: rest, hover and focus-visible (the same light), checked (the mark), waiting
  (`aria-disabled`: the third ink, no light).
- The keyboard is `usePopover`'s, now for the pass list too: Down and Up wrap, Escape closes and returns to the
  control, Tab closes a menu of items only and moves on from the control (a menu with a field, the development
  account selector, keeps Tab for it).
- A screen reader hears the same: a menu by its name, items or radio items (checked or not), one that waits.

## Checks (written first)

- The spec's measure before the change: the account's 8 px under in 12 px, the sort's 12 px, the pass list's 10 px
  over with a 4 px padding. With the change, 6 px and 13 px everywhere, the one padding.
- Mutant, with the control passing: `.menu`'s `top` offset set to 8, the account's and the sort's measure 8 and the
  spec reports it; `.menu-center`'s `translate` removed, the pass list and the days measure «off».
- `pnpm check` clean.

## Left

- The privacy chip's answer keeps `.places .popover` (a dialog, not a menu).
- Next pieces: `Card`, `Skeleton` (informe-30 §2.1).
