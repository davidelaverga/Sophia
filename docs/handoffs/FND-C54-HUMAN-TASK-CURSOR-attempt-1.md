# Implementation-session handoff

Goal and attempt: FND-C54-HUMAN-TASK-CURSOR-01 (automatic CODE finding 4319532308, «Bind pagination cursors to their
project»), attempt 1
Human owner / executor resource: Davide (assignment relayed from P; packet sha256 `e10d190b…`) / Claude Code lane C
(transcript `2ae2e877-b3cf-44a7-bccc-4db0d9846006`)
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-19/sophia-task-revalidation`, branch
`fix/human-task-project-cursor-20261019-c54`, from `1422d67159e7446e3b6db369df9d5af69a7c5b47` (tree `3b4d7b2b…`)
Writable scope: `packages/persistence/src/human-tasks.ts`, `apps/api/src/human-tasks.db.test.ts`, this record.
Runtime unit: Davide's macOS host; Node 24.21.0, pnpm 11.7.0; own PostgreSQL 17.11 on 127.0.0.1:55499 (fresh, stopped
after). No GUI, provider or network.
Ending commit/tree: the commit this record is in. Not pushed.

## Finding and cause

- A task page's cursor encodes only the last task's state, creation time (µs) and id. `readProjectTasks` checked its
  format, never its project, so a reader of two projects could send A's cursor to B's list. It was then used as B's
  keyset boundary: B's tasks newer than A's cursor were skipped.
- Shown on 1422 (the same new test, product unchanged): the admin of both projects, with A's real `next` cursor, got
  **200 `{"tasks":[],"next":null}`** from B, which had three newer tasks; 422 was expected. A 200 rules out an
  authentication or setup refusal.

## Correction

- `projectCursor` decodes the cursor as before, then requires its task to be one of this project's
  (`sophia.project_tasks`, read as the member under row security). Otherwise it is the existing documented refusal:
  422 `invalid_request` «Unknown cursor», before any page is read. Nothing is returned for the other project.
- The cursor format is unchanged, so cursors already handed out for the same project stay valid. No fallback accepts an
  unbound cursor. Tasks are never deleted (0074 has no delete), so a page's last task stays the project's.
- Unchanged: ordering, page size, filters, membership, origins, Done rules, SQL, contracts, names and every other file.

## Evidence (raw logs in P's journal, `C54-logs/`)

- New case «a task page cursor belongs to its project»: on 1422 FAIL (200, empty); fixed PASS.
  - A's cursor on B: 422 `invalid_request`.
  - B's own list is whole (its 3 tasks).
  - A's cursor still pages A: 50 + 1, each task once, newest first, `next` null.
  - A well-formed cursor naming no task of the project, and a malformed one: 422.
- `human-tasks.db.test.ts` 15/15 on the fixed tree, including the existing paging, permission, origin and 0077
  revalidation cases.
- Lint (type-aware), prettier and `tsc` for persistence and API on the changed files: pass.
- Not run: the whole `pnpm check`, `test:db` and browser checks (out of scope: one persistence function).
