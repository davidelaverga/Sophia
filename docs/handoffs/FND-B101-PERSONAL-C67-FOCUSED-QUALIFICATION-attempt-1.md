# Implementation-session handoff

Goal and attempt: FND-B101-PERSONAL-C67-FOCUSED-QUALIFICATION-01, attempt 1. This completes R2-C67's items 1–4 on C67
`4d9633a5`. Finding 4321368164 is not closed by this handoff.
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `c1970680…`. Only the
already-allocated `0080_personal_unusable_completion_fence.sql` and its reason `settled_without_answer` are used; no
new name.
Branch: `integration/personal-c67-20261020-b101`, created at `261be63f` and fast-forwarded to C67. Not pushed.

## What changed

- Comments only: 0080 now states the actual order (kept answer, then the fence, then the claim), and the readiness
  comment in `personal-usage.ts` says that 0080's marker is the one checked (0079's stays in the function). No SQL
  logic, readiness logic, migration, function, grant or contract change.
- `personal-live.db.test.ts`:
  - **F3:** asserts that 0079 classifies the legacy row `settled_before_fence`. It then restores 0080, asserts the
    reason is unchanged and `/ready` is 200, and only then checks the retry (no generation) and the new turn
    (answered). A `finally` restores 0079 then 0080. Item 1.
  - **C67:**
    - asserts the first cost (amount and token counts) is known, nonzero and unchanged by the fresh-key retry;
    - asserts the retried turn stays failed;
    - checks a retry through a fresh API instance and runner: nothing asked, reserved or paid;
    - checks that the same retry sent twice under one Idempotency-Key replays the receipt and asks nothing. Item 2.
  - **New tool-call case:** a completion with known usage is classified `settled_without_answer`, and its turn is not
    asked again.
  - **C65 barrier:** while the usable answer is kept, the cost's reason is NULL. After the final write it is still
    NULL, and the kept answer is gone.
  - **New 0080 backfill case:** on the live path's own rows, failed and pending bound turns whose settled costs have
    no reason are classified; the answered row and the held (`uncertain`) row are untouched. Amounts, counts and both
    timestamps are unchanged. Item 3.
  - **New mixed-version case:** with 0079's reservation alone, this API is not ready and reserves nothing. At function
    level, not as an older API process, 0080's reservation keeps 0079's marker, which 261's readiness looks for, and
    the same six-argument signature.

## Evidence (journal B101-logs)

- The whole file on fresh clusters, run serially: 30/30 after the F3 repair (14), 31/31 (22, 53), and on the final
  bytes 33/33 (62).
- Old 261 product against the final test bytes, with 0080 moved aside and 261's `personal-usage.ts` (64): C67 FAILS
  (2 provider requests, expected 1) and the tool-call case FAILS (reason null).
- Keyless rehearsal 28/28 and usage 6/6, each alone (40, 41). `test:sql`: 78 migrations (42). Prettier, typecheck and
  lint: 0, after a typecheck error in my first edit (44) was fixed.

## Limits

- Max-tokens remains unrun (source equivalence only).
- The compatibility check is function-level, not an old API process run.
- Unbound and other-epoch rows are excluded by 0080's predicate but not separately fixtured.
- No Linux, CI or real provider.
