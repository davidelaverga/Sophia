# Implementation-session handoff

Goal and attempt: FND-C56-SEARCH-AUTH-QUALIFICATION-01 (the app-auth first-load precondition, test only), attempt 1
Human owner / executor resource: Davide (assignment relayed from P; packet sha256 `a77195eb…`) / Claude Code lane C
(transcript `2ae2e877-b3cf-44a7-bccc-4db0d9846006`)
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-19/sophia-task-revalidation`, branch
`test/search-auth-readiness-20261019-c56`, from B78 `86458f4e1f57369045a409ebd569d62a96d86a71` (tree `b41fd5d7…`)
Writable scope: `apps/studio/e2e/app-auth.spec.ts` and this record. No product, fixture, config or dependency change.
Runtime unit: Davide's macOS host; Node 24.21.0, pnpm 11.7.0; headless Chromium; fixture servers on 5198/5199. No
PostgreSQL, GUI, hosted Auth or provider.
Ending commit/tree: the commit this record is in. Not pushed.

## Change

- New `initiallyReady(page, url)`: the app's FIRST load to its signed-in Account is an explicit, bounded precondition of
  the six affected cases. The `lostOnTasks` helper uses it too, so case 343 (codex 1581b4f0) also gets it.
- It replaces only those first `page.goto` lines. Every existing assertion stays byte-identical and still runs after it:
  account switch, cache and proposal isolation, sign-out, privacy, and the reload checks at their 5 s default.
- Bound `INITIAL_READY_MS = 10_000`: a chosen qualification bound, not a product SLO.
  - No source documents a bootstrap budget.
  - B78 failed here at the default 5 s expect budget, and B79's passing cold loads read 4.2–5.1 s.
  - 10 s is twice that default and well inside the 30 s per-test budget.
- If not ready in time, the case FAILS, carrying its witnesses: the goto time, the screens the page showed
  (`appWatch`), console errors and warnings, page errors and failed requests. Each is truncated, with paths only: no
  bodies or tokens.
- The measured time is kept as a test annotation (`c56-initial-ready`). There is no warm-up, retry, mock or wider
  timeout on the later checks.

## Evidence (P's journal, `C56-artifacts/`)

- One cold run: fresh fixture servers (nothing listening before), five workers, a fresh context per test, traces on.
  The Vite dependency cache dir already existed from earlier runs in this checkout; it was recorded, not altered.
  Result: 6/6 PASS in 17.0 s.
- First-load Account readiness after goto, from the traces:
  - 4,725, 4,773, 4,782, 5,307 and 5,788 ms (the five cold cases in parallel);
  - 113 ms (a sixth case later on a warm worker).
  - Two of the five exceed the old 5 s default. Goto took 1.2–2.0 s.
  - After a reload: Account in 100 and 508 ms (each reload took 2.9–3.7 s).
- Static: oxlint (type-aware) 0, prettier ok, `tsc` for studio 0.

## Limits

- The root cause of the slow first load (cold Vite transform, parallel bootstrap, or the product) is NOT proved. This
  run measures it and bounds it; it does not explain it.
- One run is not a reliability statistic. CI, other platforms and B78's original failure traces (overwritten) are not
  covered.
