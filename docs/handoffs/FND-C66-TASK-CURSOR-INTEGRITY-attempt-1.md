# Implementation-session handoff

Goal and attempt: FND-C66-TASK-CURSOR-INTEGRITY-FOCUSED-CORRECTION-01 (automatic CODE finding 4321265115), attempt 1
Human owner / executor resource: Davide (assignment relayed from P; packet sha256 `1795fe4f…`) / Claude Code lane C
(transcript `2ae2e877-b3cf-44a7-bccc-4db0d9846006`)
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-19/sophia-task-revalidation`, branch
`fix/task-cursor-integrity-20261020-c66`, from Task `ced72c922d07baf32d86e0091c0642eefc835aa7` (tree `202e568f…`)
Writable scope: `packages/persistence/src/human-tasks.ts`, `apps/api/src/human-tasks.db.test.ts`, this record. No
contract, schema, migration, name, Studio or secret change; the cursor format is unchanged.
Runtime unit: own PostgreSQL 17.11 on 127.0.0.1:55499 (fresh cluster); after B99's sealed STOP (P's gate 03:58:43Z).
Not pushed.

## Finding, shown

- C54 checked only that a cursor's task id is one of the project's. The cursor's done flag and its creation time
  (µs) were then used as the list's boundary as given.
- On ced72 (C66-logs 10-, 11-, 13-: the final test bytes): a genuine page-1 cursor of 55 open tasks, with its real
  task id kept, was accepted (200) in all three altered forms:
  - time 0: an empty page;
  - time at the maximum bigint: 50 tasks, page 1 served again;
  - done flipped to 1 while the task is open: an empty page.
  The A39 contract documents 422 for a cursor that is not one of this list's.

## Correction and the stale-boundary rule

- `projectCursor` reads the cursor's task and requires:
  - that it is one of the project's (as before);
  - that the cursor's time equals the task's creation time (it never changes);
  - that a done flag of 1 names a task that is done now.
  Otherwise: 422 `invalid_request` «Unknown cursor», before any page is read.
- **Stale rule:** a task only ever goes from open to done (0077). So a cursor issued while its task was open (done 0)
  stays good after the task is done. A done-1 cursor naming a task now done is a boundary the list could issue, so it
  is accepted.
- This is no proof of issuance beyond those fields: no signature, no snapshot.

## Evidence

- The new case, on the fixed tree:
  - all three altered cursors get 422 `invalid_request`;
  - the genuine cursor pages the other 5 (55 unique);
  - after the boundary task is done between pages, the same cursor is still 200 with the same open rest;
  - a done-1 cursor for it, now done, is 200.
- Tie order: 55 tasks at one creation time page 50 + 5 by id descending, each once (passes on old and fixed).
- `human-tasks.db.test.ts` 17/17 (21-), including the C54 cross-project, missing-id and malformed cases, roles,
  origins and 0077.
- oxlint 0, `tsc` for persistence and API 0, prettier ok.
- My own test errors are kept: 20- (a variable shadowed the `done()` helper) and two lint fixes.
- Not run: the full DB aggregate, `pnpm check`, browser. The UI is unchanged.
