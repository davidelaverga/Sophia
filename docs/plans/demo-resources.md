# The demo's Resources: the real panel, not «Coming»

> 2026-10-13 · Luis: «Procede con las mejoras», after `informe-vistas-20.md` finding 2.

## What was measured

- The demo (`room.html?demo=1`) holds every view with fixture data, but its Resources tab says «COMING · The tools
  your team connects to this project will live here.»: `ProjectShell` takes the view's content as `resources`, and the
  room's fixture passes none. The panel itself (`ResourcePanel`: the tiles, sessions, capacity, requests) is built and
  checked on its own page (`resources.html`, `resources-data.ts`).
- Production no longer shows the tab (#299, the served views).

## What changes

- **The demo's Resources tab shows the real `ResourcePanel`** over the resources' labelled fixture data
  (`resources-data.ts`: the accounts, their sessions and capacity, a request waiting on its owner), read-only: no
  effort, act or task link is wired, so nothing in it offers a press that does nothing. The room's fixture without
  `demo=1` keeps «Coming», as the checks that read it expect.

## Checks

- `e2e/demo-resources.spec.ts`: with `demo=1`, Resources shows the resources' tiles and no «Coming»; without it, the
  «Coming» page stays.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; CI for the
  browser suites.
