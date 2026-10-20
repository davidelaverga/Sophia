# Implementation-session handoff

Goal and attempt: FND-B84-PERSONAL-PRECOMMIT-01, attempt 1. This works on CODE 4320198389, which R2 supports at
`860c8eeb`.
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `96834d49…`.
Start: `/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-personal-live`, private branch
`fix/personal-precommit-20261020-b84` from `860c8eeb`. Not pushed. No Search/Task carry. 0073 and 0078 are unchanged.

## Done here: the same answer's settlement is tried again (R2 choice 1)

`LiveCall.settle` (apps/api/src/companion-live.ts) tries the settlement up to 4 times, with pauses of 200, 400 and
800 ms between them. Each try uses the same collected answer and usage; the provider is never asked again. A stop
(time up, or an erasure) ends the retries. A later try that finds the call already settled (`not_settled`) counts as
success only when the same answer is found kept for the turn. Otherwise the outcome is not known, and the call fails
as before. This recovers a database that is away for a moment. It does not recover an answer once every try has
failed or the process has died.

## Not closed: the fence after every try failed (needs a P allocation)

Witnessed on this source with a journal-only probe (B84-logs/31, not committed). Every settlement try was rolled back.
The turn failed with 1 provider request, and its cost was `reserved`. The registration ended, an operator reconciled
the cost, and a normal retry then asked the provider again: 2 requests, costs `[settled, settled]`.

Closing it needs a new forward SQL object, because published 0073 and 0078 can't change. Its purpose: a
reservation for a turn is refused (a new `lost` outcome) when that turn, in the current epoch, already has a bound
call (`personal_answer_calls`) whose usage was reserved, uncertain or settled, and no kept answer. A release with
`not_prepared` (never asked) must not fence. The runtime then fails the turn with an honest lost-answer state, and
only an explicit new spend decision could ask again. That state probably needs a contract addition (the reply's
failure reason, and the Studio's words). The migration number and the contract identifier are for P's census.

## Erratum to C55 (its receipts are unchanged)

C55's `fail_before_commit` fixture threw while the transaction was still open on the client; no ROLLBACK was sent
(R2's precision correction). The fixture now sends `ROLLBACK` before it throws, and it can fault a set number of
times. C55's case keeps its assertions: one request, not settled, no used cost, nothing kept, no answer. It now also
asserts that the settlement was tried again.

## Evidence (journal B84-logs)

- Old 860 (13): the new case «fails once before COMMIT … the answer shown» FAILS, with no answer shown. C55's case
  fails at the new assertion that the settlement was tried again.
- Fixed (23): `personal-live.db.test.ts` passes 23/23, including the new transient case (1 request, settled once, the
  answer shown, the kept row let go), C55's all-fail case and lost-ACK case, and every earlier case.
- Keyless rehearsal 28/28 (40); API units 139/139 (41); API typecheck, oxlint and prettier all 0.
