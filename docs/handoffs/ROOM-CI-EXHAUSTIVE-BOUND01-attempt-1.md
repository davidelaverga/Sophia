# The room's browser suite as three bounded parts

Goal and attempt: FND-A-ROOM-CI-EXHAUSTIVE-BOUND01, attempt 1. Human owner / executor resource: Davide / Claude A. Native
session: Claude Code `local_775c886b-f077-43c7-a07c-74868ab14b5c`.  
Starting commit: main `e395d63eae25fd7000b1e8f7295debc9b213d970` (tree `cbfda5d9`), branch
`foundation/room-ci-exhaustive-bound-20261019-a01`. Changed files: `.github/workflows/ci.yml` and this record.

## Outcome

`studio-browser` ran every Studio browser case in one job bounded at 90 minutes. Heads whose suite takes longer (Search
5d40, Personal 30d) were cancelled at that bound while still passing; the deeper cause of the slower runs is unknown.
Now `studio-browser-part` runs the same `test:browser` as three matrix parts (`--shard=N/3`, `fail-fast: false`), each
on the same `ubuntu-24.04` runner under the same 90-minute bound. Workers (Playwright's default, half the runner's CPUs),
per-test bounds, retries, projects, fixtures, assertions and the browser are unchanged; no test, config or dependency is
touched. The required check keeps its job and name, `studio-browser` / "The room in Chromium, on its fixture page": it
needs the parts, runs `always()`, and passes only when the parts' result is `success`. A failed, cancelled, timed-out or
skipped part fails it.

## Evidence

Local, Playwright 1.63.0 as installed (lock unchanged since f76f5776), Node 24.21.0, `CI=1`, listing only (`--list`, no
browser run): the whole list is 2 209 cases (1 995 desktop, 214 phone) in 221 files. Parts 1, 2 and 3 list 737, 736 and
736. Their union equals the whole list as a sorted multiset, with no duplicates and none missing or extra. Listing
through the workflow's own command (`pnpm --filter @sophia/studio test:browser --list --shard=N/3`) gives the same
parts, and a second listing of part 2 is identical. The gate step, run with the parts' result set to `success`,
`failure`, `cancelled`, `skipped` and empty, exits 0 only for `success`. The workflow parses, and Prettier passes.

## Limits

A list proves which cases each part runs, not hosted timing or completion: a third of the cases per part is expected
(not shown) to take about a third of the time, plus each part's own install, Chromium install and two fixture servers
(three setups instead of one, and a short gate job). Runner minutes and concurrent jobs per run rise accordingly; the
account's runner eligibility and cost for that are unknown here. Whether branch protection requires the check by name is
not in the source; the name is kept so an existing rule would still bind. No CI ran.

## Next bounded action

R reviews; B integrates; P decides any publication.
