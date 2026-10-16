# The lens and the addressed records (Codex P2s on #238, #242, #245)

Luis, 2026-10-12: «atiende los P2 en PRs pequeñas». The last follow-up to the kit stack's open Codex P2s: what the
address carries (the Studio's lens, a record a need names) and who reads it.

## What changes

- **The lens through normalization** (#242, 4249593729): an accepted address that is normalized (a trailing slash, a
  legacy path) keeps its `lens` beside the report's parameters (`lensKept`).
- **Whose lens** (#242, 4250193187): the address a lens was written for is read by its path and lens alone
  (`lensAddress`), so a report opened over it since does not make another subject read the last one's lens.
- **A kept shell retaking the address** (#242, 4251428529): when a shell kept mounted for a call becomes the shown
  Studio again (Back or Forward), the lens its address names is read before the shell writes its own.
- **The work press** (#242, 4250193200): with no task named, the focus goes to the Tasks view's own nav item.
- **A record named for a mounted view** (#245, 4250201097): `openAt` tells mounted views once the fragment is in
  (`ADDRESS_NAMED`, followed by `useAddressed` beside `hashchange`).
- **A decision's hiding search** (#245, 4250201102): cleared as a task's is (`useClearHiding`, for both).
- **A bare request id with a slash** (#245, 4249614252): the address leads with the separator (an empty resource), so
  the id's own slashes are never one; old bare ids without a slash still read.
- **`/` on Tasks with no plans** (#238, 4250197229): the project's search keeps `/` unless a view's own search has
  taken it (`useOffered`: TaskSearch or ResourcePanel mounted).

## Checks (written first)

- `link.test.ts`: a bare id with a slash reads back whole. `viewer-state.test.ts`: `lensKept`; a lens stays the last
  subject's at its address with report parameters added since.
- The other four are wiring (effects and events) not reached by node's test runner; their browser checks are left to CI's
  existing suites (lens address, home-needs, work) — not run on this host: the machine guard refused Playwright (free
  RAM under 6 GB with AION2 open).
