# Implementation-session handoff

Goal and attempt: FND-C51-TASK-ADMISSION-REPAIR-AND-FINAL-QUALIFICATION (R-C50 hold C50-R1), attempt 1
Human owner / executor resource: Davide (assignment relayed from P; packet sha256 `3166f9d9…`) / Claude Code lane C
(transcript `2ae2e877-b3cf-44a7-bccc-4db0d9846006`)
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-19/sophia-task-revalidation`, branch
`foundation/task-revalidation-20261019`, from C50 `55b3d290501d5884f21837927849d927555f15a6` (tree `a3802c56…`)
Writable scope: the Task write admission guard, focused tests, this record. 0077's bodies, 0074, 0076, A39 and the
contracts are unchanged.
Ending commit/tree: the commit this record is in. Not pushed. Qualification results: P's journal, `C51-result.txt`.

## C50-R1: Task writes fail closed until 0077 is installed

- R showed the new API on the old SQL (0077 absent) answered `/ready` 503 while an authenticated Task create still
  answered 201: readiness detected the gap but nothing refused the request.
- `routes/human-tasks.ts` now owns `TASK_WRITES`, the 0077 check (each of the three Task writes carries 0077's
  lock-first marker, and the create its Markdown join). `/ready` requires it as before (REQUIRED_SCHEMA interpolates the
  same text), and a `preHandler` on create, assign and Done runs it before any database write: until it holds, they
  answer 503 `unavailable`. Once it holds it is remembered for the process (a migration is not rolled back).
- Reads are not gated. No other route, flag, default, CON behavior, policy, wire or schema object changes.
- The check is a source-marker presence test: it detects that the expected migration is installed. It is not a proof of
  semantic equivalence and not a security verifier.

## Evidence (raw logs in P's journal, `C51-logs/`)

- `human-tasks.db.test.ts`: 14/14 on the fixed tree (8 A39 cases, 5 C50 cases, 1 new):
  - new: on the same database the owner puts 0074's three bodies back; a FRESH app answers `/ready` 503 and create,
    Done and assign 503, with the full task-row JSON and the Task event/request counts unchanged, and reads still 200.
    0077's bodies are put back: the same app answers `/ready` 200 and the same three writes 201/200/200.
  - the C50 race cases now create their task through the application role's SQL too, so they need no API admission.
- New API with migrations only through 0076 (0077 moved aside): `/ready` 503; every HTTP Task write 503 (C50 had create
  201); the direct application-role race still COMMITS for both leave and removal (the SQL finding, unchanged).
- The task snapshot compares full task-row JSON plus COUNTS of Task events and requests, not every event/receipt byte.
- The HTTP read-back rollback is source-traced only: no HTTP race was run, and it is never claimed old-failing.
