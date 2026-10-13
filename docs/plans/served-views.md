# A project's nav shows the views that are served

> 2026-10-13 · Luis: «Sí, empieza con la PR 1», after `informe-vistas-20.md` (¿Vale $20? · the project views), finding 1.

## What was measured

- Without the vision flag (production), Conversations, Updates and Resources open `PendingView` («COMING · … will live
  here»): three of the seven tabs, 43 % of the bar, lead nowhere. Conversations was already left out of the nav
  (`viewsShown`); Updates and Resources were not.
- A shared address to one of them (`/p/<id>/updates`) opens the same «Coming» page.

## What changes

- **Without the vision flag the nav shows Studio, Goals, Tasks and Knowledge**: `viewsShown(false)` leaves out
  Conversations, Updates and Resources. Their commands («Go to Updates») go with them. Each comes back when its view is
  served (A18 for Conversations, A12/A13 for Updates, the resources' API for Resources), or under the flag (the demo and
  the fixtures), as now.
- **An address to a view not shown opens the project's Studio** (`shownView`), not a «Coming» page.
- Under the flag nothing changes (Resources keeps its «Coming» page until it is mounted: the next PR).

## Checks

- `route.test.ts`: `viewsShown(false)` is Studio, Goals, Tasks, Knowledge; `viewsShown(true)` all seven; `shownView`
  keeps a shown view and turns a hidden one into Studio.
- The fixtures run under the flag, so the browser suites see no change. `pnpm exec prettier --check .`,
  `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`.
