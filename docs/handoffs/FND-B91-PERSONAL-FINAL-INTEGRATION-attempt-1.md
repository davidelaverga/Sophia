# Implementation-session handoff

Goal and attempt: FND-B91-PERSONAL-FINAL-INTEGRATION-01, attempt 1. PARTIAL.
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `8e2c34bf…`.
Branch: `integration/personal-final-20261020-b91` in `/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-personal-live`.
Not pushed.

## Composition

Normal merge of accepted Search C63 `7e4c9529` (Main 9a6) into accepted Personal C62 `58430e29`; the merge-base is
b583 and there were no conflicts. The 27 Personal paths are byte-identical to C62 and the 88 Search/Main paths to
7e4c; no path was composed. Personal's API, persistence and SQL (0078, 0079) equal C62. The only backend paths that
differ from C62 are Search's own: `packages/persistence/src/search.ts` and `apps/api/src/search.db.test.ts`, as in
7e4c. There is no Task API, no 0077 and nothing from C6fb2 or A05.

## Checks

- Lint, format, root typecheck and Studio build: 0. Studio and API units: 2188/2188.
- `test:sql`: 77 migrations, 5 files. Full `test:db` on a fresh cluster: 1103/1103, including personal-live (C62's
  three gap cases, the B85 fence, the B84 transient retry), usage, keyless and search.
- Browser, in a condition that breaks the packet: these two runs went at the same time as `test:db`.
  - Personal specs plus press: 144 pass, 1 FAIL (the press Personal row lists Copy ×2 as mute).
  - `app-auth` «session ·»: 5/5 FAIL. Three stopped at 0 of 3 conversation rows and two at the missing connection pill,
    the same as B87.
  - All 6 failure contexts and traces are kept. Load is not proved to be the cause.
- One measured focused retry, alone, after `test:db`: the press Personal row 1/1 (7 s) and the 5 session cases 5/5
  (13 s). The original failures stay on record.

## Open: the served Personal journey fails, a crossing of accepted C62 and an existing spec

`e2e-served/personal-served.spec.ts:83`, on a fresh cluster with the real API and the loopback double. The provider's
503 holds the call `uncertain`. The spec's fixture reconciles it at cost 0 and presses Ask again. The spec expects an
answer; the turn stays failed. That is C62's accepted 0079: a call held `uncertain` (`usage_unknown`) is fenced even
after a cost-only reconcile (0079:14-15, 60). The spec predates C62. The steps after line 83 (the erasure, Davide's own
view) were not reached.

Proposed narrow update, for P and R2 to decide (not applied): after `reconcileHeld()` and Ask again, expect the turn
to stay failed, no second `ok`, and no new provider request. Or keep the old expectation if the owner wants a
reconciled provider failure to be askable again, which would reopen C62's gap.
