# Phone fits: Home's rows and line, segmented boxes, Knowledge's filters, the resource sheet's head

> 2026-10-17 · informe-25 (`evaluacion-2026-10-17/informe-25.md`), E5, E6, P-01, V4 and H3, from Luis's «Sigue con la
> cola … y el nuevo informe-25». Studio only, CSS only.

## What was measured, and what changes

- **E5, Home's rows on a phone:** the row that joins or takes you back kept its four desktop columns (28 px, a 1fr, two
  `auto`) because its rule (0,3,0) outweighed the phone's two-line row (0,2,0). Its title sat 4 px in from the others'
  and its arrow ended 14 px short (the empty fourth track and its gap). The rule now carries no weight of its own
  (`:where`), so the phone's three columns apply to it too.
- **E6, Home's line:** a suggestion longer than the line («Help me get ready for Standup in Product launch») was cut
  through a letter. The line now ends it in an ellipsis. A shorter phone sentence was left out on purpose: titles have
  any length, so no fixed sentence fits.
- **P-01, a segmented box on touch:** the box holds its 36 px presses at 44, stated. Left to its content, a box in a
  grid that overflows (Personal's notes, eight deep) was shrunk to its own 32 px and its thumb hung 8 px out. The root
  cause is that grid's `auto` rows; the stated height also covers the boxes in other grids.
- **V4, Knowledge's filters:** the pressed choice painted its own plane over the group's thumb: two boxes, which parted
  while the thumb slid. The thumb is now the only plane.
- **H3, the resource sheet's head on a phone:** its phone rule named `.resource-sheet-actions`, which nothing renders
  since the kit's frame (it draws `.sheet-acts`), so the presses fell to a second line at the left, over the body. The
  rule names the kit's class, and the head's own class with the frame's, so it wins whichever sheet loads last.

## Checks, written first

- `phone-fits.spec.ts` (phone): Home's titles start within 0.5 px and the arrows shown end within 0.5 px at the row's
  edge, on `/home.html`, `?projects=live` and `?call=`; the suggestion is longer than the line at 390 and 320 and the
  line ends it in an ellipsis; every visible segmented box is ≥ 44 with its thumb inside, on Personal's overflowing
  notes (fails on main) and, as guards, Settings, Knowledge and Resources; Knowledge's two filters paint one plane each;
  the resource sheet's presses stay in its head, Close at its edge, the body under them, at 390 and 360.
- `resource-sheet-css.test.ts`: every sheet class resources.css names is one the sheet, its frame or the kit renders.
- `knowledge-filters.spec.ts`: no press paints a plane; the thumb lies under the pressed one.

## Left

- On a desktop the resource sheet's head height still depends on which sheet loads last (36 on the fixture pages, about
  54 in the app): which one is meant is a follow-up.
- The report's other shapes (a shorter phone sentence on Home, the notes' order as an icon menu) are product changes,
  not fits.
