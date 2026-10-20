# Implementation-session handoff

Goal and attempt: FND-C62-PERSONAL-FENCE-GAPS-01 (R2-B85's three P1 gaps in the completed-call fence), attempt 1
Human owner / executor resource: Davide (assignment relayed from P; packet sha256 `73be79f4…`; handover
`P-B85-to-C62-API-source-handover.json`) / Claude Code lane C (transcript `2ae2e877-b3cf-44a7-bccc-4db0d9846006`)
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-19/sophia-task-revalidation`, branch
`fix/personal-fence-gaps-20261020-c62`, from B85 `f22d4f5bff7e938df3890aeebafbd9f95302a1d8` (tree `df11da4f…`)
Writable scope: the unpublished `0079_personal_completed_call_fence.sql` (P's allocation, continued),
`packages/persistence/src/personal-usage.ts`, `apps/api/src/personal-live.db.test.ts`, this record. 0073 and 0078 are
unchanged; no new name, contract, Studio or dependency change.
Runtime unit: own PostgreSQL 17.11 on 127.0.0.1:55499 (fresh, stopped after); the local provider double; fake key.
Ending commit/tree: the commit this record is in. Not pushed.

## Corrections

- **F1, schema.** The live API's installation check (`personalSettledAnswersInstalled`, used by `/ready` and before
  every reservation) requires 0079 too: 0078's table and 0079's reservation, found by a marker in its body.
  - Without 0079: not ready, and nothing is reserved or asked.
  - The function's name is joined in the SQL so the live tests' pool gates never take this read for a reservation.
- **F2, uncertain.** 0079's fence also covers a bound call held `uncertain`, and one settled later from it keeping its
  reason (`usage_unknown`, `stopped_usage_unknown`).
  - Both are set only after the provider was asked, so an unknown usage is not proof that nothing was made.
  - A cost-only reconciliation is no consent to pay again: a retry of that turn is refused (`lost`), asking nothing.
  - `released` (proved never asked) stays unfenced. Known kept answers, new turns, other epochs, claims and the payer
    hold are unchanged.
- **F3, prior rows.** 0079 marks a bound call settled before it with no reason, no answer kept and its turn not
  answered as `settled_before_fence`, and fences it.
  - Nothing is deleted or made up: cost, usage and history are kept.
  - Such a row cannot be told from an unfinished one, so the classification is conservative.

## Policy changed (named)

- The existing case «a provider refusal … until an operator reconciles» expected the reconciled turn's retry to answer
  under a new paid call. It now expects that retry fenced (no second request, the turn failed), and a NEW turn answered.
- The UI still shows the generic failure with «Ask again». Any lost/unavailable wording is B's (A42 unused).

## Evidence (P's journal, `C62-logs/`)

- Old FAIL (10-: the final test bytes; 0079 and `personal-usage.ts` at f22): 3 of 3 fail.
  - The reconciled turn was answered again.
  - Ready without 0079.
  - A second generation for the pre-0079 row (its reason stayed null).
- Fixed: those 3 PASS (21-). An earlier fixed run failed on my own reason value `pre79_unclassified`, which breaks the
  reason CHECK; it was renamed (20-…FAIL kept).
- Personal DB files, serial (31-): 54/54 PASS. An earlier run failed 4 cases because the pool gates matched the new
  installation read's text; corrected as above (30-…FAIL kept).
- `pnpm test:sql` (32-): 77 migrations including 0079, 5 SQL test files passed.
- oxlint 0, prettier ok, `tsc` for persistence and API 0.
- Not run: the full DB aggregate, `pnpm check`, browser.
  - No separate completed-but-usage-missing case: it takes the same `usage_unknown` hold, so the same predicate fences
    it, but that is not executed here.
  - No production row census: existence of pre-0079 rows is UNKNOWN.
