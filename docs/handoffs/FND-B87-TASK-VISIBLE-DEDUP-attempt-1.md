# Implementation-session handoff

Goal and attempt: FND-B87-TASK-VISIBLE-DEDUP-01 v2, attempt 1. This addresses CODE 4320180800 in the Studio, and
carries the accepted Search `3274560c` (with Main 9a6).
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `a67479b5…`.
Branch: `fix/task-visible-dedup-20261020-b87` from public Task `9653c0f3`, in
`/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-human-tasks`. Not pushed. No Personal carry, and none of
C59's cursor or C60's TODO test.

## Correction

`task-cache.ts` `onePerTask`: the project's rows hold one copy per task across its pages. It keeps the newest revision
at that copy's place, and at the same revision the later read. Its origin (`from`) always comes from the last read, so
an older copy never brings back an origin a later read redacted. `ProjectTasks.tsx` lists `onePerTask(...)` in place
of the flat pages. The API, persistence and SQL are unchanged: each page is still its own read.

## Merge

Normal merge of Search 3274560c; the merge-base is b583. The 49 Task paths and 83 Search paths are byte-identical to
their side, except `fixtures/fixture-api.ts` and `fixtures/room.tsx`, which merged on their own. No 0078 or 0079.

## Checks and the open boundary

- Units: `task-cache.test.ts` 10/10. On 965, the same file fails to import `onePerTask` (an import-level failure, not
  a behavioral one). Studio units 2071/2071. Lint, prettier, Studio typecheck and build: 0.
- Browser: Task specs and the merged press spec, 243 pass and 2 fail (`work.spec` 602 and 3180, which pass alone).
  The voice-meters case at line 78 passes once.
- OPEN: the five `app-auth` «session ·» renewal cases FAIL on this composition, though they pass on Search 3274560c.
  They fail before any token expires: `readingOpen` sees 0 conversation rows (3 expected). Cause unknown. The Task
  fixture's changes to `fixture-api.ts`, `room.tsx` and `task-data.ts` are where to look next.
- Not run: the local real-API served Task episode (PG 55501).
