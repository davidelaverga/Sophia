# One sheet

> 2026-10-10 · Luis: «sigue con UIKIT-04: Sheet». The kit's fifth piece, after Button, Field/Search, Segmented and
> Tabs. No API change.

## What was measured

- Six sheets on the fixture pages (Invite, Search, a task, a resource, the meeting's recap, Your data), each read in the
  browser pane: all six already wear one frame, 420 px beside the page, 12 · 20 · 28 of padding, a head of 36 with
  the title at 15/600, Close a 28 px square 20 px from the edge, a veil at half, the same slide. The look was one; the
  code was three: `app/Sheet.tsx` (nine sheets), and the Invite and the resource sheets each building the veil, the
  panel, the sticky top, the head and Close by hand (`useDialog` and `SheetCall` wired three times).
- The report viewer is a reading pane beside the page, not a sheet (resizable, not modal, 560 by default); its head's
  presses were a size of their own: Enlarge and Close 36 px squares with an edge, Close 16 from the edge.

## What changes

- **`SheetFrame` in `@sophia/ui`** (over the pure `sheet-class.ts`, which also states the frame's numbers, `SHEET`):
  the veil, the panel (role dialog, modal, named by its title's id or a name given), its sticky top (the head: the
  title or a `head` of the sheet's own, the `actions` before Close, Close itself as the kit's icon press; then `top`,
  whatever sits under the head) and its body. It knows nothing of focus or keys.
- **`app/Sheet.tsx` wires the Studio around the frame**: `useDialog` (the focus in and back, Tab inside, Escape) and
  the call's switches (`SheetCall`) under the head; it takes a `panelRef` from a sheet that moves focus or takes keys
  of its own, `onKeyDown`, `data`, `className` and `headClassName`. Its nine sheets keep their call unchanged.
- **The Invite and the resource sheets move onto `Sheet`**: the Invite gives its tabs as `top`; the resource its logo,
  name and owner as `head`, its name as `label`, its steps and Copy link as `actions`, its page turns through
  `panelRef` and `onKeyDown`, its tool as `data`. Two hand-built shells gone.
- **The head's presses in `theme.css`**: `.sheet-acts`, a row of 28 px squares without the edge, 2 px apart (the
  resource's `.resource-sheet-actions` was this). The report viewer's head presses take the same: 28 px squares without
  the edge, Close 20 from the edge, as a sheet's.
- The resource sheet's body keeps its own flow (`.resource-sheet .sheet-body`: block, no top padding, no arrival of its
  own), and its sections still arrive one after another, now by their place in the body.
- `e2e/sheet-frame.spec.ts`: Invite, Search, a task, a resource and the meeting's recap each open as one dialog with
  the frame (role, modal, named, 420, the padding, the head, the title, Close, the veil, the focus inside); Invite
  closes on Escape with the focus back on its opener and closes on the veil; the resource's actions end with Close
  and the sheet is named for the resource; the report viewer's head presses measure 28 with Close 20 from the edge.
  `sheet-class.test.ts`: the classes and the numbers.

## States

- A sheet's states are unchanged: open with the focus on the panel, Tab inside, Escape or Close or the veil closes,
  the focus back on the opener (or where `returnTo` says); a live call's switches under the head; on a phone the
  sheet rises from the bottom with its top radius; reduced motion stills the slide. The resource sheet's J and K and
  its arrival per section as before; the Invite's three panels stay mounted as before.
- A screen reader hears the same: a dialog named by its title (or its name), modal; Close named.
- After Codex on #224: the Invite's panels are sections of the body (`.sheet-tab-body`: the column and the gap, not
  the body's padding and arrival a second time); the resource sheet's Copy link is keyed by the resource, as its
  body is, so a copy half done does not carry over a page turn; the viewer's head presses keep 40 px of width to
  a finger (`pointer: coarse`), as a sheet head's do.

## Checks (written first)

- The spec's measure before the change: the same frame on the six sheets (the look was already one); the report
  viewer's presses 36 with an edge, Close 16 from the edge.
- Mutant, with the control passing: `.sheet-head .round`'s width removed, Close measures 36 and the measure reports
  it; the frame's `aria-modal` removed, the measure reports it.
- `pnpm check` clean; the Invite's and the resources' own specs unchanged (`resource-sheet`, `resource-sheet-title`,
  `.sheet-top`, `.sheet-backdrop` keep their names).

## Left

- `useDialog` stays in the Studio (it speaks to the shortcuts' scope); a kit that owned the dialog contract would own
  that scope too, a later step.
- The report viewer keeps its own pane (resizable, side by side with the page); only its head's presses took the
  sheet's.
- Next pieces: `Menu`, `Card`, `Skeleton` (informe-30 §2.1).
