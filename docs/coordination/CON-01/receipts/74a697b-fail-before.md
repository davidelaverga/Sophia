# Receipt · fail-before for CON-01-CC-0024 and CC-0025, and their source at `74a697b`

These are development runs, in the development worktree (`/home/user/sophia-dev`), not gates. The gate of `74a697b` runs separately in `/home/user/sophia-g3-erase`, and its result is its own receipt.

| Item | Value |
|---|---|
| Specs and fixture | `74a697b717ca48aa41511f3c3fd3276676e6bc17` (tree `f82d631e9b67d78484e2b8ddbd4f0a44b9ee8dbf`) |
| Driver | `cc25-failbefore-browser.sh`, 2026-10-10 02:24:19 to 02:26:41 UTC. Each exit was written by the shell. |
| Method | For each source, the driver put that commit's `apps/studio/src` under `74a697b`'s specs and fixture (`git checkout <src> -- apps/studio/src`), ran the cases, and put `74a697b`'s back. |
| Cases | Desktop only: `-g 'list read under way\|may be out of date\|withdrawn elsewhere\|same millisecond\|says no order\|receipt is on its way' e2e/conversations-removal.spec.ts` (7 cases) |
| Recorded counts | `changed=3, 4, 5, 1`, then `clean=1` after. The `1` after is `docs/coordination/CON-01/receipts/715d2b1-browser-gate.md`, which I wrote into the worktree while this ran: a document no case reads. No source or spec was edited during the run. |

## Exits

| Source | Exit | Passed | Failed |
|---|---|---|---|
| `715d2b1a` (source = `1f49c4f`) | 1 | 2 | 5 |
| `f12786aa` (`Opening.seq` alone) | 1 | 3 | 4 |
| `7969d40a` (CC-0024: `messageSeq`) | 1 | 5 | 2 |
| `74a697b7` (CC-0025) | **0** | **7** | 0 |

## Case by case

| Case | `715d2b1` | `f12786a` | `7969d40` | `74a697b` | Why each failure failed |
|---|---|---|---|---|---|
| Withdrawn while its send's receipt is on its way, every read failing (CX-0022, a control) | pass | pass | pass | pass | — |
| Withdrawn elsewhere after a late send, the list read since (CX-0027) | fail | fail | pass | pass | the withdrawn words on the row (`:502`) |
| Withdrawn elsewhere while the list's reads fail: the thread's read takes the words off (CX-0027 recovery) | fail | fail | pass | pass | the words on the row (`:522`) |
| **A list read under way across a withdrawal, answering after the thread's (CX-0028 P1, r4235976251)** | fail | fail | **fail** | pass | at `7969d40`: after the held list answer, the row said `SYNTHETIC-LATE-LIST-GET-WITHDRAWN` again (`:559`). Earlier: the words were never taken off (`:555`) |
| **The thread read again while the list's reads still fail: the list still says it may be out of date (CX-0028 P2, r4235976256)** | fail | fail | **fail** | pass | at `7969d40`: «This may be out of date» was gone from the list (`:581`). Earlier: the words were on the row (`:582`) |
| Same millisecond, the list's reads failing: its place puts it on the row at once (a useful positive) | fail | pass | pass | pass | at `715d2b1`: the row still said the older message (it lags) |
| The same from an API that says no order: lags, then catches up (the fallback's control) | pass | pass | pass | pass | — |

## Units

- **Fallback ordering (CX-0028 P2, r4235976261).**
  - The case: a row without `messageSeq`, receipts 3 then 2.
  - With `7969d40`'s `conversation-list.ts`: fails, `actual: 'Seq 2.'`.
  - With `74a697b`'s: passes.
  - The ordered control (`messageSeq` 1 → 3, keeps 3) passes on both.
- **`withdrawn-purge.test.ts`, 6 cases on a real `QueryClient`:**
  - a list answer landing after the thread's read is purged as it lands;
  - a thread read after the list's purges it;
  - a failing list read keeps `status: 'error'`, its error, `dataUpdatedAt`, `dataUpdateCount` and `errorUpdateCount`;
  - a reverting cancel is purged again;
  - left as they were: a visible opening (place 3, with place 2 withdrawn), another conversation's row at the same place, and another reader's list;
  - installed once per cache.
  - This module did not exist before `74a697b`, so these cases have no fail-before.
- **Revert, without the listener** (a probe, `revert-probe.mts`, query-core 5.103.2): a list read purged in place, then `cancelQueries`, comes back with the words. With the listener (the unit above), they are purged again.

## What the purge rests on (stated as preconditions, not proved here)

See binding map §11.1:
- a thread read stays cached until 5 minutes unread, its conversation's erasure, or the whole cache's teardown on any identity change or sign-out;
- a list read is given up after 30 s, and aborted once nothing observes it.

Only this Studio's query cache is claimed. That excludes the browser's HTTP cache, memory not yet collected, and any API, library or provider copy.

## Not claimed

- No gate of `74a697b` from these runs.
- No phone run.
- No `pnpm check`.
- No real API.

## Raw logs

They are in the implementer's container only:
- `cc25-fb.exit`
- `cc25-fb-715d2b1a.log`, `cc25-fb-f12786aa.log`, `cc25-fb-7969d40a.log`, `cc25-fb-74a697b7.log`
- `cc25-checks.exit`
