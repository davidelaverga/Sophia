# What production offers, measured: one lens

> 2026-10-17 · informe-25 (`evaluacion-2026-10-17/informe-25.md`), H1, from Luis's «Sigue con la cola … y el nuevo
> informe-25». Studio only. The rest of the report's production pass goes in its own small branches: Request review and
> Ask Sophia with no one to answer (DL-06, `prod-asks.md`), Home's line with no companion (PJ-02,
> `home-no-companion.md`) and ids in the words (V3, `version-names.md`). The projection's «in this slice» reasons are
> Davide's (WBC-02): proposed to him, not changed here.

## What was measured

- The Studio offered three lenses everywhere: the bar's three tabs, three palette rows and the keys 1, 2 and 3. Outside
  the vision flag, two of them only said what is coming («An idea taking shape…»). A stored lens or a `?lens=explore`
  link opened that card too, so hiding the bar alone would have left a person in it.
- No browser check could measure production: every fixture page builds with the vision flag on.

## What changes

- **`vision.ts`:** `visionOn(flag, search)`: on where the build sets it, unless the address says `vision=off`. The
  address can only turn the flag off, so production is untouched; a fixture page with `?vision=off` shows what
  production offers.
- **`viewer-state.ts`:** `lensesShown(vision)` (Converse alone outside the flag, all three under it) and
  `shownLens(lens, vision)`, as `route.ts` does for views.
- **`useViewerState`:** a stored or linked lens not offered opens as Converse, and the address says Converse; the stored
  choice stays the viewer's.
- **`StudioShell`:** one lens is no choice, so no lens bar, no palette or index row and no key; the lens body is no
  tab's panel then. Under the flag nothing changes (the same ids, words and keys).

## Checks, written first

- `vision.test.ts`: on where the build sets it; off where it doesn't, whatever the address says; off for one page with
  `vision=off` (and not for `vision=offline`).
- `viewer-state.test.ts`: the lenses shown with and without the flag; a lens not shown opens as Converse.
- `prod-lenses.spec.ts`: at `room.html?vision=off` no lens bar or tablist, no palette or index row naming a lens, keys 2
  and 3 show nothing, and the body has no tabpanel role; `?vision=off&lens=explore` opens Converse and the address
  says `lens=converse`; under the flag the three tabs, the «coming» card on 2 and the tabpanel stay.

## Limits

- The stored Explore or Build stays in this device's storage, shown as Converse while it isn't offered.
- `?vision=off` turns off everything under the flag on that page, saved conversations too unless the build serves them,
  as production does.
