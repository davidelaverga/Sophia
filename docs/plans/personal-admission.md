# Personal Answer admission: the A1 foundation (INC03-CC-003, migration 0101)

**What this is.** A source-only foundation for versioned automatic Personal Answer admission, retry and cancel. It
follows pack v2 `modules/INC-03_NATURAL_COMPOSER_AND_CONTINUITY.md` (INC03-R02/R04/R06/R08/R12/R13) and
`contracts/03_INTAKE_ALLOCATION_AND_EVENTS.md` (C03-R01/R04/R08/R10).

**Unreachable.** Nothing calls it from a request. There is no route, contract, generated type, package export, runner
change, server configuration or Studio change. It starts no answer, provider call, assessment, enrollment or UI
effect.

**Lease.** `INC03-CC-003-A1-LOCAL-001`: migration `0101` and six new paths only:
- this plan;
- `docs/handoffs/INC03-CC-003.md`;
- `db/migrations/0101_personal_input_admission.sql` and `db/tests/0101_personal_input_admission.sql`;
- `packages/persistence/src/personal-admission.ts` and `personal-admission.db.test.ts`.

No existing file is edited and no existing function is replaced.

**Base.** Local development on `185146bb`, which is **not accepted**. The six paths are rebound to the accepted
repaired coherent parent that the root later names, before any ordinary check or publication.

**Design source.** The v2 plan `d09fbc84…` with its delta `a91b727b…`, and the five binding clauses V2-C01..C05 of the
independent delta study `bf6bf426…`. Where the two differ, the clauses decide.

## What already exists and stays byte-identical

- **0098 `send_personal_input`.** The record-only `automatic_v1` writer. It keeps a person turn with reply `recorded`
  and one metadata row in `personal_inputs`, and remembers the flat receipt
  `{operation:'send_input', …, input:'recorded', effect:'none'}` under the owner's single `personal_requests` key
  namespace.
- **0099.** Held (`recorded`) turns are out of the companion's context and out of the welcome-due rule.
- **0021.** Implements the queue and the authorized retry:
  - `next_personal_reply` / `claim_personal_reply` take only `pending` turns, lowest seq first.
  - A `pending` turn older than 2 minutes reads `failed`.
  - `retry_personal_turn` re-asks only a `failed` turn, under its own key.
- **0073/0078–0080.** The payer and the final paid effect:
  - `personal_companion_admitted(payer, owner)` is a STABLE row-existence read.
  - `reserve_personal_answer` takes the space, then the payer `FOR UPDATE`. It is the only financial authority.

## The new records (0101)

### `sophia.personal_input_decisions`: append-only, content-free

| Column | Type / rule |
|---|---|
| `owner_id` | uuid, the owner (`personal_owner()` of the writer, never an argument) |
| `input_id` | uuid. FK `(owner_id,input_id)` → `personal_inputs(owner_id,id)` ON DELETE CASCADE |
| `seq` | integer 1..100. PK `(owner_id,input_id,seq)` |
| `turn_id` | uuid. FK `(owner_id,turn_id)` → `personal_turns(owner_id,id)` ON DELETE CASCADE. Always the input's own turn. |
| `epoch` | bigint ≥ 0: the space's epoch when decided |
| `operation` | `send` (seq = 1 exactly), `retry` or `cancel` (seq > 1) |
| `outcome` | `admitted`, `waiting` or `cancelled` |
| `reason` | `admitted` → NULL; `waiting` → `payer_unavailable`; `cancelled` → `cancelled_by_owner` |
| `policy` / `policy_version` / `family` / `basis` | `personal-default-answer` / 1 / `answer` / `personal_default_addressee` |
| `late` | boolean NOT NULL: whether a newer person turn existed when decided (under the space and input locks) |
| `profile` | jsonb. The closed trusted answer profile (below) for `send`/`retry`; NULL for `cancel` |
| `admitted_at` | timestamptz, non-null iff `outcome='admitted'`. `clock_timestamp()` taken after every lock. |
| `created_at` | timestamptz `clock_timestamp()` |

**Integrity rules:**
- CHECK constraints tie operation, outcome, reason, profile and `admitted_at` together.
- A `BEFORE UPDATE` trigger refuses every update.
- A `BEFORE DELETE` trigger refuses a delete unless it is a foreign-key cascade (`pg_trigger_depth() ≥ 2`), so an
  erasure still cascades.

**Access:**
- RLS: an owner-only SELECT policy for `sophia_api`.
- No INSERT, UPDATE or DELETE grant to any role. The three writers below are the only writers.

### The trusted answer profile (closed, internal)

Exactly these keys:

| Key | Type |
|---|---|
| `version` | `1` |
| `owner` | Lowercase canonical UUID (the established UUID language of the live settings, which are lowercased) |
| `payer`, `routeId`, `provider` | The live settings' name language `^[a-z][a-z0-9-]{0,62}[a-z0-9]$` |
| `roleDigest` | `^sha256:[0-9a-f]{64}$` |
| `model` | 1..200 characters, no control characters |
| `reasoningEffort` | null, or 1..64 characters with no control characters |
| `maxTokens` | Integer 1..4096 |
| `prices` | Exactly `input`, `cacheRead`, `cacheWrite`, `output`, each a number ≥ 0 |

- It mirrors `LiveCompanionSettings` without `credentialRef` or the provider `profile`. Those name a credential and are
  never stored.
- A missing, extra or mistyped field, a non-object, or NULL is `22023`, with nothing written.
- `profile.owner` is compared with the server-derived `personal_owner()`. A different owner is `42501`. The actor never
  comes from the profile.
- The caller (A2, later) passes the live companion's own frozen settings. A1's tests pass synthetic profiles only.

## Operations: the NEW versioned Answer operation (V2-C04)

Three new functions are granted EXECUTE to `sophia_api` only. Each:
- is SECURITY DEFINER with `search_path=pg_catalog,sophia,pg_temp`;
- takes the owner from `personal_owner()`;
- fences to the caller's epoch (`personal_fence`: the space locked, another epoch `40001`) before anything under its key
  is read.

The operation contract is `personal_answer_v1`, required and exact (NULL or anything else, `automatic_v1` included:
`22023`). The record each operation keeps is still an `automatic_v1` input row (0098's table). The old record-only
operation is untouched in every state.

| Function | Request operation (key namespace) | Semantic (the request's identity) |
|---|---|---|
| `send_personal_answer_input(key, contract, epoch, text, profile)` | `send_answer_input` | `{text digest, answerContract, contractVersion:1}` |
| `retry_personal_answer_input(key, input, expectedSeq, epoch, profile)` | `retry_answer_input` | `{inputId, expectedSeq}` |
| `cancel_personal_answer_input(key, input, expectedSeq, epoch)` | `cancel_answer_input` | `{inputId, expectedSeq}` |

The profile is **not** in any semantic.

**Steps** (the one lock order: the space and epoch fence, then the request key, then the input, then the turn, then the
decisions under those):

1. **send:**
   1. Fence.
   2. Check the contract and the profile (shape, then owner).
   3. Check the text (0021's `personal_text`, 1..4000).
   4. `personal_prior` (a replay returns here).
   5. `personal_touch`.
   6. A recorded person turn (0098's internal `personal_append_recorded`).
   7. The input row (0098's table, its own key).
   8. Decision seq 1.
   9. If admitted, the turn goes `recorded → pending` with `asked_at = admitted_at`.
   10. Remember the receipt.
2. **retry:**
   1. Fence.
   2. Profile.
   3. `expectedSeq` 1..100.
   4. `personal_prior`.
   5. The caller's own input `FOR UPDATE` (another owner's id, or none: `22023`).
   6. Its turn `FOR UPDATE`.
   7. Its decisions `FOR UPDATE` and the latest of them:
      - none (an input from the record-only writer): `55000` not eligible;
      - latest seq ≠ expected: `40001` stale;
      - latest not `waiting`: `55000` (admitted or cancelled).
   8. `late`.
   9. Eligibility.
   10. Append seq + 1 (`admitted` or `waiting`).
   11. Transition if admitted.
   12. `personal_touch`.
   13. Remember.
3. **cancel:** the same checks with no profile. It appends `cancelled / cancelled_by_owner`. The turn stays `recorded`:
   its words stay the owner's, still held out of every context (0099).

**Eligibility:**
- A plain `personal_companion_admitted(profile.payer, owner)` read. True gives `admitted`; false gives
  `waiting / payer_unavailable`.
- No payer lock is taken and no financial reservation is promised.
- There is no fallback to any other payer, route or profile.
- The final `reserve_personal_answer` (space → payer) stays the only authority before a paid call. Its order is
  compatible: admission never locks the payer, so no path takes the payer before the space.

### Receipts and replay (V2-C01)

Each receipt is `personal_receipt(operation, revision, {turnId, seq})` plus:
- `inputId`;
- `answerContract: 'personal_answer_v1'`;
- `interactionContract: 'automatic_v1'`;
- `contractVersion: 1`;
- `decision: {seq, operation, outcome, reason, late, epoch, admittedAt, policy, policyVersion, family, basis}`.

`admittedAt` is UTC ISO with microseconds, or null. The profile is never in a receipt.

A receipt is remembered under its key once. **A replay of any mutation returns that stored receipt verbatim:**
- a send replay gives its seq-1 decision;
- a retry or cancel replay gives the decision it appended;
- never the latest decision;
- never a refreshed timestamp or profile;
- never a second admission.

The **current decision** is a separate, owner-scoped read (`readPersonalAnswerDecisions`). An input written by the
record-only 0098 writer has no decision. Its own replay is 0098's flat receipt, its null decision stays null, and it can
never be retried into a paid backlog (`55000`).

### Request-key conflicts across operations (one owner namespace)

| Case | Result |
|---|---|
| A key used by any of `send_turn`, `retry_turn`, `send_input`, `send_answer_input`, `retry_answer_input`, `cancel_answer_input`, then reused by a different operation | `23505` |
| Same operation and key, different semantic (other words, another input, another expected seq) | `23505` |
| After an erasure, every older key | `40001` |

### Cancellation and correction (V2-C05)

- Only a **waiting** decision can be cancelled, under its expected seq.
- Retry and cancel of one input serialize on the input row and the seq check: of an old retry and a cancel racing at
  the same expected seq, exactly one commits and the other is `40001`.
- **Cancelled is terminal:** retry and cancel are `55000`.
- **A correction is a new input,** sent only after a confirmed cancel receipt or a same-key replay confirming
  cancellation. Nothing here sends it, and no atomic cancel-and-send is claimed.
- An unknown or failed cancel stays unresolved and authorizes nothing.
- **Admitted-but-not-yet-paid correction is not covered** (cancel and retry after admission are `55000`). It is a named
  AC-03-12 remainder.

### Timestamps and provenance

- The turn's `created_at`, `seq` and body, and the input row (id, key, `created_at`, contract fields, `state='recorded'`)
  are never changed.
- `admitted_at` is the decision's.
- `asked_at` changes **once**, on an authorized `recorded → pending` transition (send or retry admitted), to that same
  `admitted_at`. Never on a replay, a waiting outcome or a cancel.
- An old input admitted late keeps its seq. The existing HISTORY reads its own prefix, and `next_personal_reply` serves
  pending turns lowest seq first. Its `late` is recorded.
- Every new decision calls `personal_touch`, so the space revision moves as it does for `retry_personal_turn`.

### Erasure

- Turns are deleted (0021), so inputs (0098) and decisions cascade.
- Requests become tombstones, so the old keys of all three operations are `40001`.
- Usage rows of 0073 are not touched. Nothing is refunded and no retry is invented.
- There is no wake table, queue, scheduler, timer or loop. The admitted `pending` turn is the durable intent.

## What A1 does not do (the A2 boundary)

- **Wake and recovery.** Nothing wakes the companion. The pending turn is durable intent data only.
- **The A2 effect guard** is required and is **not implemented here**. Before **any** fresh paid reservation or provider
  call for an automatically admitted turn, A2 must compare the decision's stored `profile` with the live call's
  profile, field by field: owner, payer, route, role digest, provider, model, effort, ceiling, prices and version.
  - This covers the startup drain, a replay wake, queue chaining, the flag-off drain, and a same-owner legacy
    `retry_personal_turn` of an automatic turn.
  - A mismatch fails closed with a truthful reason. There is no payer, model, route or revision rebase and no fallback.
  - A kept settled answer (0078), authorized reads and cost reconciliation need no new paid call and are preserved.
  - Legacy turns without a decision stay legacy.
- **HTTP.** A new versioned endpoint, its canonical amendment and generated validator, the persistence index export,
  `app.ts` and readiness: none here. The record-only `/personal/inputs` route, its body and its flat receipts stay
  identical in both flag states.
- **UI:** none, including a waiting reason or retry/cancel controls.
- **Not qualified here:** wake/recovery, a paid route, app use, the full AC-03-12, or the programme.

## Evidence plan (recorded separately)

| Class | What | Where |
|---|---|---|
| E0 | Absence on `185146bb`: the new module does not import and the SQL functions are `42883`. Installation absence only, never a semantic fail-before. | A detached copy of the final tests on the untouched base |
| E1 | Installation: grants (`sophia_api` only; worker and assembler none), SECURITY DEFINER with fixed search path, PUBLIC none, RLS, the append-only triggers, no `CREATE OR REPLACE` in 0101, no write grant on the table | SQL test + db test |
| E2 | Semantics, positive and adverse, with real concurrency observed through `pg_stat_activity`, on the candidate with synthetic profiles and a synthetic payer row on a disposable database | db test + SQL test |
| E3 | Legacy unchanged: the existing Personal, held-input and legacy suites, and the 0098/0099 SQL tests, pass with 0101 installed | Existing suites |
| E4 | Narrow mutants of the new guards, each applied alone, killed by an assertion, source restored byte-identical | Mutation log |

No wake, bootstrap or provider mutant (A2 does not exist). No full ordinary check on this rejected parent: one runs on
the accepted parent after rebinding.

## Repair 1: SQL prices agree with the JavaScript number language (A1-LOCAL-F01)

The independent owned-six study `ed921f03…` (task `02163611…`) confirmed this P2.

**Before (`7569632d`).** `personal_answer_profile` checked each price only as "a JSON number ≥ 0".
- The typed profile guard (`isPrice`: `Number.isFinite(v) && v >= 0`) and the live settings parser apply the same rule
  to the parsed JavaScript number.
- So a direct SQL send with `prices.input = 1e400` committed a waiting decision. Its stored profile parses to
  `Infinity`, and the owner's typed read then failed ("holds an unexpected profile").
- No public route, paid call or payer was involved.

**Rule now.** The existing rule stays: a JSON number, and every negative refused. One bound is added. A price is also
refused when JavaScript (IEEE-754 binary64, round-to-nearest-even) would read it as `Infinity`. On the JSON number's
exact value `x`, that is `x >= 2^1024 - 2^970` (`179769313486231580793…`, 309 digits).

| Value | JavaScript reads | SQL now |
|---|---|---|
| `1.7976931348623159e308`, `2^1024 - 2^970`, `1e400` | `Infinity` | Refused (`22023`) |
| `1.7976931348623158e308`, `2^1024 - 2^970 - 1` | `Number.MAX_VALUE` | Accepted |
| `0`, ordinary values, `1e308`, `1e-400` (reads `0`) | Finite | Accepted, as before |

**One recorded representation difference, kept deliberately.** A negative decimal of magnitude at most `2^-1075`, such
as `-1e-400`, reads `-0` in JavaScript, so the typed guard accepts it. SQL keeps refusing every negative, as before.
- This is not a new negative-price policy.
- No valid producer emits such a value: `JSON.stringify(-0)` is `"0"`.
- SQL is stricter there, never looser. So nothing SQL stores can fail the typed read.

- The bound is an exact numeric literal in 0101, checked against Node's own `JSON.parse` by the tests at and beside
  the edge.
- No clamping, rounding, coercion or normalization: the stored profile keeps the caller's exact JSON number.
- No new spending cap or price policy: ordinary, large finite and near-boundary positive values stay accepted as the
  typed and live languages accept them.
- A refusal raises `22023` and its transaction persists nothing: no turn, input, decision, request, revision or seq
  change.
- Numbers beyond PostgreSQL's numeric range never reach the function: `jsonb` input refuses them first.
- Every other rule is unchanged:
  - all four price keys share one loop;
  - types are checked before values;
  - the owner comparison;
  - the closed keys;
  - replay, late, timestamps, the expected seq, cancel, races and erasure.
- The typed helper `personal-admission.ts` is byte-identical: it was already correct.
- **Evidence:**
  - send **and** retry regressions for all four keys, with numeric JSON text built as text (never
    `JSON.stringify(Infinity)`, which would become `null`);
  - valid large finite controls read back through the typed projection;
  - one new guard mutant (the upper bound removed);
  - fail-before of the final tests on the exact `7569632d` sources.
