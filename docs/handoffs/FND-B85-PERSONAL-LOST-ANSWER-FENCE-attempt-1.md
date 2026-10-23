# Implementation-session handoff

Goal and attempt: FND-B85-PERSONAL-LOST-ANSWER-FENCE-01, attempt 1. This works on CODE 4320198389: the boundary B84
left open.
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `4fc612dd…`. P
allocated the names: `0079_personal_completed_call_fence.sql` (P-LIVE-NAMESPACE-ALLOCATION-0079.json) and A42
(P-LIVE-CONTRACT-A42-B85-BINDING.json).
Start: `/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-personal-live`, private branch
`fix/personal-lost-answer-fence-20261020-b85` from B84 `4f6601ef`. Not pushed. No Search, Task or Main carry.

## The boundary (B84's executed witness)

Every try of a completed call's settlement was rolled back, and its cost stayed `reserved`. Its registration ended,
and an operator reconciled the cost (cost only). A normal retry then asked the provider again and settled a second
cost.

## The fence (0079)

- `reconcile_personal_companion` (0073, replaced with the same signature and grants): a call settled from `reserved`
  is marked `unfinished_call`, because the runtime never settled, held or released it. A held call
  (`usage_unknown` and the like) keeps its reason.
- `reserve_personal_answer` (0078 after B80, replaced with the same signature and grants): after the kept-answer
  check, it returns `lost` when the turn, in the current epoch, has a bound call that is still `reserved` with no
  registration left, or that was settled as `unfinished_call`. Nothing is reserved or asked.
- Runtime: `reservePersonalAnswer` accepts `lost`. `LiveCall.reserve` refuses `CompanionRefused('lost')`, and the
  runner fails the turn as it fails any refusal. No answer is made up; its cost is settled once and not refunded.

Not fenced: a call released before the provider was asked; a call held because the provider failed (the existing
held, reconcile, retry case still answers); a call still registered (the payer hold applies); a new turn; another
epoch (an erasure deletes turns and bindings). 0073 and 0078 are unchanged as files.

## Evidence (journal B85-logs)

- Old FAIL with the final test bytes and 0079 absent (30): the lost turn's retry was answered (`answered`, expected
  `failed`), a second generation. The first version of the test also failed on 4f6601 (13).
- Fixed (27): `personal-live.db.test.ts` passes 24/24. The new case shows all 4 settlement tries rolled back, no
  registration left, the owner reconcile succeeding, and then the retry: the turn stays failed, no Sophia answer,
  provider requests stay at 1, and the cost is `[settled]` once. A new turn after that is answered (2 requests). The
  existing provider-refusal, held, reconcile, retry case still answers with 2 requests. B84's transient case, C55's
  cases, B80's stale-runner case, erasure and the other-owner cases all pass.
- `test:sql`: 77 migrations, 5 files (40). `personal-usage.db.test` plus the keyless rehearsal `personal.db.test`:
  34/34 (41). API and persistence typecheck, oxlint and prettier: 0.

## Limits

- An adverse first run (23): my test scripted a second answer before the fenced retry. The fence correctly left it
  unused, and the leftover script leaked into the new turn and two later tests (3 failures). The script was removed;
  a request would now be counted by the double's default answer.
- The honest disposition is the existing `failed` turn, and the runner logs the `lost` code. A42 is bound, but no
  contract field or Studio wording for «her answer was lost» is added here. The Studio still offers Ask again, which
  is now refused without a cost. A distinct lost-answer state for the reader is the follow-up that would use A42.
- A call whose process died mid-stream (no answer made) is also fenced: it may have run. Only an owner's explicit new
  paid attempt can ask again.
- No real provider, billing, browser, Linux or CI.
