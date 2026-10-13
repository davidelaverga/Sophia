# Home on a phone: what needs you, right after the greeting

> 2026-10-13 · Luis: «Sí, empieza con la PR 2», after `informe-espacios-20.md` (¿Vale $20? · Los dos espacios),
> finding 5 (open since informe-ui-premium §3.11).

## What was measured

- `home.html?needs=some` at 390×844: «Needs you» starts at y 868, past the 844 px screen, after the greeting, «You
  and Sophia» and four projects. On a wide screen the list is the right column; under 861 px the page is one column
  and the side (`.hw-side`, her light and the list) comes after all the words, so the most urgent thing is the last.
- The list is behind the vision flag (`needs`); without it Home is unchanged here.

## What changes

- **Under 861 px, the list is mounted right after the greeting**, inside the column: date, greeting, the line of the
  day, then «Needs you», then «You and Sophia» and the projects. Moved in the document, not only drawn there, so a
  keyboard and a screen reader meet it in the same order the eye does (a CSS `order` would part them). It keeps its
  landmark («What needs you»).
- **Her light keeps the phone's place**: on one column it is the same light as Home without the list (top right, the
  48 px mark on the greeting's line), mounted outside the column as it is there.
- From 861 px nothing moves: the side column (1101 px and up) or the side under the words (861–1100).

## Checks

- `e2e/home-phone-needs.spec.ts` (390×844): the list's heading inside the screen and above «You and Sophia»; first in
  the document, so Tab reaches a need before your conversation; the mark at 48 px, clear of the greeting; nothing
  wider than the screen. At 1440 the list is still the right column.
- `home-needs.spec` «her mark keeps the phone's 48 px» reads the light wherever it is mounted.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`, the Home specs
  through the guard.
