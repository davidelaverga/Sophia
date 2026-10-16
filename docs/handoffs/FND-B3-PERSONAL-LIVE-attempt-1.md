# Implementation-session handoff

Goal and attempt: FND-B3-PERSONAL-LIVE-01 (minimal live Personal, continuation plan §B3), attempt 1.
Human owner / executor resource: Davide (product, spending and production decisions) / Claude Code session `local_cf492b49-c8d1-4ab7-b811-95eaefc2b61c` (Claude B) on Davide's Mac, coordinated by P.
Native session: none (a coding session, not a runtime attempt).
Starting worktree/commit: `sophia-personal-live`, branch `foundation/personal-companion-20261016`, from CON-01 B2's local integrated head `d6ed8241130355a01d3893c4483395575c6663d5`.
Ending commit/tree: sealed in B's private handback (a commit cannot name itself).
Writable scope: the live companion and its composition and configuration in `apps/api`, readiness in `app.ts`/`server.ts`, one call-identity argument in `companion.ts`, the personal usage module in `packages/persistence`, migration `0073_personal_companion_usage.sql` (the one number allocated), the API's dependencies on three already-pinned dsh packages with the lock and the recorded runtime identities, targeted tests and this record. No Studio, contract, amendment, runtime bundle or other migration change.
Runtime unit: none is run. The model service is composed in the API process from the installed packages; the tests point its one route at a local double.
Existing authority: P's source packet. D-REPLY approves the normal dsh service route for source only. No credential, payer, allowance, Personal-data or live grant exists: the companion stays off until they do.

## Outcome

- **One live answer, default off.** `SOPHIA_COMPANION=live` runs `liveCompanion`, an implementation of the existing `Companion` interface:
  - it sends the asked turn, the owner's recent turns (at most 20, newest 24,000 bytes) and their kept notes (newest 6,000 bytes) as one bounded user input under a fixed instruction, with no tools;
  - it returns the answer and at most one suggestion (a last `Note:` line of at most 90 characters), stored open as 0021 stores every suggestion. Nothing is kept until the person keeps it;
  - CompanionRunner's claim, renewal, 60-second limit, erasure stop, retry and greeting rules are unchanged. The welcome back stays the fixed one: no model call is made for it.
- **The supported dsh composition.** `companion-dsh.ts` mounts `@deepseek-ai/dsh-llm`'s `LlmRuntime` and the pinned `@deepseek-ai/dsh-llm-pi-ai` adapter in a Cordis context, with exactly the one configured route. It calls `prepareCall` and the prepared `stream`, as B2's reply service does: the pinned provider, model, effort and ceiling are checked against what the adapter resolved before any request. The credential is resolved by its reference when a call is made; nothing here reads its value.
- **Owner-private cost (0073).**
  - Every call is reserved before the provider is asked, from a bound on everything it can use: input bytes counted as tokens at the dearest input price, plus the full output ceiling at the output price.
  - It is settled from the usage of a response the provider completed. A call that errs or is stopped stays uncertain, even when the adapter reports counts: pi-ai yields its error's usage, which the provider never confirmed.
  - An uncertain call holds its payer: nothing more is asked until an operator reconciles it. A payer is admitted only by an operator, with a finite allowance; the API cannot admit one or raise one.
  - Rows are content-free and survive the erasure of the space.
- **Configuration refuses rather than guesses.** Live needs:
  - complete settings in `SOPHIA_PERSONAL_COMPANION`: route id, the pinned call, prices, the instruction's digest, payer and pi-ai profile;
  - its credential reference set (only that it is set is checked);
  - its payer admitted.
  - Anything missing stops the start. Production still refuses the rehearsal. `/ready` answers `companion` while the payer is not admitted.

## Evidence

Private PostgreSQL 17.11 on 55497 (fresh cluster, stopped after), Node 24.21.0, pnpm 11.7.0:

1. `apps/api/src/personal-live.db.test.ts`, the real API on its restricted role, over HTTP, with the composed dsh service and the local OpenAI Responses double (`tests/support/mock-responses.mjs`): 5/5.
   - **One answer.** The answer and an open suggestion. Exactly one request on the pinned model, carrying the fake test credential by its reference, the owner's turn and note, the fixed instruction and no tools. Another person's note and the project's title were absent. Settled at the reported usage (120 and 30 tokens, 27 micro-USD), under the reservation. The welcome made no request.
   - **Provider refusal (500).** The turn failed after one request (no hidden retry), and its cost was held uncertain. The retry asked nothing while the payer was held. After an operator reconciled the call, the retry answered under a new call.
   - **Exhausted allowance.** No request, nothing reserved.
   - **Erasure mid-answer.** The call stopped and no answer appeared, before or after the provider would have finished. Its cost row stayed, uncertain and without content.
   - **Configuration.** Unset gives no companion and composes nothing; missing settings, a wrong instruction digest, missing prices, an unset credential reference and an unadmitted payer all refuse the start; production refuses the rehearsal.
2. `packages/persistence/src/personal-usage.db.test.ts` (0073 directly): 3/3.
   - One reservation per registered call of the current epoch; not admitted, exhausted and stale calls ask nothing.
   - Another person settles, holds or releases none of an owner's calls. The API role reads neither table, cannot change an allowance and cannot reconcile. A settlement keeps token counts only.
   - Uncertain holds the payer until reconciled; erasure keeps the row.
3. Existing personal suites, unchanged behavior: API `personal.db.test.ts`, persistence `personal.db.test.ts` and `companion-rehearsal.test.ts`, 65/65 (73/73 with the two files above).
4. `pnpm check`: unit 2973 pass, 0 fail, 70 skipped; integration 125 pass, 2 skipped; artifacts reproduced after `pnpm artifacts:record` (below). Format, lint, typecheck and contracts pass.

The full `test:db` and `test:sql` results are recorded in B's private handback.

## Decisions and changes

- **In-process composition, not a project runtime.** dsh offers no standalone or remote model client (`./remote` exposes only discovery), and B2's executor is built per project. The supported path is the documented composition, in the API, with Sophia owning admission, pricing and settlement. Placing the route's credential in the API process is new custody: a D-OPS decision, not made here.
- **Settle only completed responses.** The first run showed the adapter reporting counts for a refused and an aborted call. They are held instead, which is stricter than B2's reply service (its `finish` settles from any single usage report); that difference is reported for B2's owner, not changed in B2's sealed source.
- **Dependencies and identities.** `apps/api` depends on `@deepseek-ai/cordis` 4.0.4, `@deepseek-ai/dsh-llm` and `@deepseek-ai/dsh-llm-pi-ai` 0.2.0-rc.2, all already in the lock; their peers resolve as they do for the runtime.
  - Adding any of them re-keys the profile's `@deepseek-ai/dsh` and `dsh-base` peer hashes in the lock, with identical dependencies.
  - That changes the recorded `workspace_lock_sha256` and the darwin-arm64 dsh tree digest, recorded with `pnpm artifacts:record`.
  - The Sophia bundle is unchanged (`sha256:5c1a0196…`). The linux-x64 tree digest could not be built on this Mac and still holds its old value: CI will report it, to be recorded from that run.
- **`companion.ts`.** `answer` now receives the registered call (`actorId`, `callId`), which the rehearsal ignores. `Companion.ready()` is optional.

## Remaining obligations

- Before live: Davide's permission for Personal data on the chosen route and recipient, a payer and finite allowance admitted by an operator, the credential's custody in the API host (D-OPS), and V's check of adapter, recipient, auth and cap. None is assumed.
- The linux-x64 dsh tree digest, from CI.
- Integration into the common branch with Luis's later Personal changes (main's #394 changed `fixtures/personal.tsx`, which C1's barrier also changes).
- Independent review of this candidate.

## Next bounded action

B's private handback goes to P; R reviews this head. No push until P sequences it with the common integration.
