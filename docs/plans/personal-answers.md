# Personal Answer service, guarded wake and recovery (INC03-CC-003 A2)

This plan was written before any A2 code. It implements the A2 proposal (`9d83d756`) with the seven binding conditions
A2-P01 to A2-P07 of the independent proposal study (`43ced056`).

**Base.** The actual source composition `e864604b` (tree `c27d74c4`), whose ordered parents are parser `775e2271` and
A1r1 `8c4d3019`. It is a source-only base, not runtime or PRE accepted.

**Allocations, exclusive to this task.**
- Migration `0102` and amendment `A53`.
- The generator writer lease.

**Frozen:**
- migrations 0001 to 0101, and A01 to A52;
- `personal-admission.ts` and its tests, `personal-usage.ts`;
- `routes/personal-inputs.ts`, `companion-config.ts`, `server.ts`;
- every Studio path.

## What exists (read at `e864`)

- **One paid chokepoint.**
  - Every fresh model call goes `CompanionRunner.answerOne → ask → companion.answer → LiveCall.reserve`. That calls
    `reservePersonalAnswer` (`personal-usage.ts`), which calls 0080's `reserve_personal_answer`.
  - Under `personal_hold()` (space first), 0080 answers in this order:
    1. `kept`: a settled answer is kept for the owner, turn and current epoch.
    2. `lost`: an unfinished, uncertain or unusable completion is bound to that turn and epoch.
    3. `not_current`: the turn is not pending under this claim.
    4. Otherwise it delegates to 0073's payer reservation (`not_admitted`/`held`/`exhausted`/`reserved`, payer locked
       after the space).
- **Kept answers are never a fresh spend.** The runner reads `personal_settled_answer` before asking (live only) and
  writes it without a call.
- **Automatic origin.**
  - 0098 keeps every automatic_v1 input as one `personal_inputs` row, unique per (owner, turn). It is created only in the
    transaction that creates its turn, so a legacy turn can never gain one later.
  - A record-only input stays `recorded`, which no claim, reservation or retry reads.
  - 0101's Answer writers append immutable decisions. `admitted` moves the turn `recorded → pending`; `waiting` and
    `cancelled` leave it `recorded`.
  - A pending automatic turn can later be failed, then made pending again by the legacy `retry_personal_turn`. That is
    the "same-owner legacy retry of an automatic turn".
- **Wake.**
  - `routes/personal.ts` calls `companion.answer(actor, turn)` after commit on the legacy send and retry, replays
    included.
  - Nothing wakes at startup.
  - `run()` chains `next_personal_reply` (oldest pending, one at a time).
- **0101's profile bounds are narrower than `liveSettings`.**
  - The model must have 1 to 200 non-control characters.
  - The effort must be null or 1 to 64 non-control characters; an empty string is refused.
  - Prices are finite and at least 0, below the JavaScript overflow bound.

## Design

### 0102 (`db/migrations/0102_personal_answer_effect_guard.sql`)

- **`sophia.personal_answer_effect_refusals`** holds the effect refusals.
  - **Identity:** one row per (owner, input, decision seq, epoch). The turn is kept with it (one turn per input).
    Decision seq 0 is the explicit, bounded no-decision identity.
  - **Reason** is a finite enum: `no_decision`, `waiting`, `cancelled`, `decision_stale`, `profile_unsupported`,
    `profile_mismatch`.
  - **`fields`** is a bounded array, at most 15 entries, drawn from a fixed name set:
    - `owner`, `payer`, `routeId`, `roleDigest`, `provider`, `model`, `reasoningEffort`, `maxTokens`;
    - `prices.input`, `prices.cacheRead`, `prices.cacheWrite`, `prices.output`, `version`;
    - `payerArgument`, `routeArgument`.

    It is non-empty exactly for `profile_mismatch`.
  - **Other columns:** `attempts` (capped at 1000), `first_at` and `last_at`. Nothing holds a value: no body, profile,
    price, model, route, payer or credential.
  - **Writes** are an upsert on the identity: a replayed or repeated wake updates the same row and never adds one.
  - **Access:** owner-only RLS SELECT for `sophia_api`. No write grant to anyone. It cascades with the turn and the input
    (erasure).
- **`sophia.reserve_personal_answer_guarded(call, payer, route, micros, turn, claim, profile jsonb)`** is the effect
  guard: SECURITY DEFINER, fixed search path, EXECUTE for `sophia_api` only. Its name contains `reserve_personal_answer`,
  so the existing live tests' reservation gates still see the reservation statement.
  1. `personal_hold()` takes the space, the same lock order as 0080 (space, then payer, only inside 0073).
  2. It reproduces 0080's no-effect prefix verbatim, in the same order: `kept`, `lost`, `not_current`. No comparison, no
     row, no reservation. A kept answer is recovered even when the fresh profile is unusable (NULL).
  3. **Origin**, positively:
     - No `personal_inputs` row for (owner, turn): a legacy turn. It delegates to `reserve_personal_answer` unchanged,
       which repeats its own prefix under the same held locks, then 0073.
  4. **Automatic:** the input's latest decision is read under the held space, which serializes 0101's writers and
     erasure.
     - None: refusal `no_decision` (seq 0), returns `not_admitted`.
     - `waiting`: returns `not_admitted`.
     - `cancelled`: returns `not_admitted`.
     - Admitted but for another turn or epoch (`decision_stale`): returns `not_admitted`.
  5. **Profile shape:** 0101's own `personal_answer_profile`, run in a subtransaction.
     - Malformed or NULL (22023): refusal `profile_unsupported`, returns `profile_unsupported`.
     - Another owner (42501): the shape is good, so it is compared.
  6. **Full comparison**, per field, stored decision profile against the given one (jsonb value equality, no
     normalization): the thirteen profile fields, plus `p_payer = profile.payer` and `p_route = profile.routeId`. Any
     difference gives refusal `profile_mismatch` with the field names, and returns `profile_mismatch`.
  7. **Match:** it delegates to `reserve_personal_answer` unchanged. The financial authority, the ledger and the binding
     are 0080's and 0073's.
- **The guard returns refusals; it never raises them.** The refusal row commits with the caller's transaction, and the
  API throws only after the transaction ends. It never appends a 0101 decision or rewrites a stored profile.

### Persistence (`personal-answer-effects.ts`, exported with the A1 module from the index)

- **`reserveGuardedPersonalAnswer(c, call, payer, route, micros, profile | null)`**, in the caller's transaction:
  - **0102 installed** (checked by `to_regprocedure`, with the name joined so it is never taken for a reservation
    statement): it calls the guard.
  - **0102 absent:** it reads the origin positively.
    - Automatic gives `not_installed`.
    - Legacy calls 0080 as before.
  - Any failed or uncertain query throws: fail closed, never catch-and-fallback.
- **`readPersonalAnswerOrigin(c, turn)`:**
  - `legacy` only when 0098's table is absent or there is no row;
  - `automatic` otherwise;
  - errors propagate.
- **`readPersonalAnswerRefusals(c)`:** the owner's own bounded diagnostics.

### API

- **`companion-live.ts`:**
  - `answerProfile(settings)` builds the exact closed A1 profile from the live settings every time, or returns null when
    0101 would refuse it. It reuses the A1 TypeScript validator; there is no duplicate.
  - `LiveCall.reserve` goes through `reserveGuardedPersonalAnswer` with that fresh profile.
  - New refusal codes: `profile_mismatch`, `profile_unsupported`, `not_installed`.
  - The live companion exposes `answerProfile()`, so the Answer routes use the server's profile, never a client's.
- **`companion.ts`:**
  - **`CompanionRunner.resume(owner)`:**
    - only for an owner it `serves`, and only while not `closing`;
    - reads `next_personal_reply` as the owner, then calls the same `answer()`, so the same claims, `inFlight`,
      `running`, `closing` and ordering apply;
    - tracked in `running`, so `close()` waits for it and nothing starts after shutdown;
    - errors go to `onError`. There is no timer, loop, claim reset or `asked_at` write.
  - **A companion that is not live** (the rehearsal) never answers an automatic turn. Its origin is read first, and an
    automatic or uncertain origin fails the turn without asking.
- **`routes/personal.ts` (R2):** the legacy send and retry call `companion.resume(actor)` instead of
  `answer(actor, turn)`, after their write commits, replays included. A failed or unknown commit throws before it. The
  receipt is unchanged.
- **`routes/personal-answers.ts`** is mounted only with `AppDeps.personalAnswers === true` (default off, so 404). Each
  write keeps 0101's receipt and replay semantics.

  | Route | Behaviour |
  |---|---|
  | `POST /api/v1/personal/answers` (`PersonalAnswerSend`) | The owner's message under `personal_answer_v1`, decided at once with the companion's fresh server profile. Wakes with R2 `resume` after commit. |
  | `POST /api/v1/personal/answers/{inputId}/retry` (`PersonalAnswerRetry`) | An explicit, separately keyed retry naming the expected seq. Wakes with R2 after commit. |
  | `POST /api/v1/personal/answers/{inputId}/cancel` (`PersonalAnswerCancel`) | Terminal. No wake. |
  | `GET /api/v1/personal/answers/{inputId}/decisions` | `PersonalAnswerDecisionList`, the decisions in seq order without the profile. Effect-free and owner-only. |

  - Send and retry need the companion to serve the actor. Otherwise they answer 503 and nothing is kept.
  - Cancel and the read are open to any owner over their own inputs only.
  - SQL `55000`/`54000` refusals answer `invalid_state` (409), never a database message.
  - An input without decisions (foreign, unknown or record-only) reads `not_found`.
- **`app.ts`:**
  - **Flag rule:** `personalAnswers` requires a live companion whose `answerProfile()` is supported. Anything else is a
    `buildApp` error. `server.ts` never sets it.
  - **R1:** one `onReady` hook calls `resume(owner)` for a live companion's single enrolled owner, independent of the
    flag.
  - **`/ready`** requires 0101's writers and 0102's guard only when the flag is on.
  - **Not flag-gated:** the guard and the drain.

### Contract (A53, canonical generation)

- **New closed schemas:**
  - `PersonalAnswerSend` (`answerContract: personal_answer_v1`, `text`);
  - `PersonalAnswerRetry` and `PersonalAnswerCancel` (`expectedSeq` 1 to 100);
  - `PersonalAnswerDecision`, `PersonalAnswerReceipt`;
  - `PersonalAnswerDecisionEntry`: the decision fields plus `turnId` and `createdAt`; no profile;
  - `PersonalAnswerDecisionList`: `inputId`, then at most 100 entries in seq order.
- **Four operations** on the paths above.
- **Unchanged:** A52's `/personal/inputs`, its body and its flat receipt.
- **Generated outputs:** `PersonalAnswerReceipt` and `PersonalAnswerDecisionList` are added to the generator's `EXPORTS`
  and to `validate.ts` as tolerant readers. `ProjectNativeResourcePage` is preserved.

## Checks

- **SQL (`db/tests/0102`):**
  - kept-first with a NULL profile; `lost`/`not_current` unchanged;
  - legacy delegation;
  - the no-decision, waiting, cancelled and stale-decision refusals;
  - each field mismatch and both argument mismatches, with zero usage and binding rows;
  - the match reserves and binds;
  - upsert identity and attempts;
  - RLS, grants and cascade.
- **Persistence DB test:** the guard through the typed caller; the guard-absent fallback (automatic `not_installed`,
  legacy 0080); query failure fails closed.
- **API DB test** (real `CompanionRunner` and real `liveCompanion`, a counting fake `PersonalLlm`, real PostgreSQL and
  API roles):
  - matched automatic and legacy positives;
  - changed supported configurations: R1 restart, R2 replay, legacy retry of a failed automatic turn, queue chaining,
    flag off. Each is refused before `prepareCall`, with bounded refusals;
  - kept recovery with zero calls under a changed or unsupported profile;
  - rehearsal refusal;
  - claim and erase concurrency;
  - HTTP: default off 404, closed schemas, foreign owner, nondisclosure, A52 byte-identical in both flag states, GET
    effect-free, R2 after commit, nothing after shutdown.
- **Honest fail-before at `e864`** with supported changed live configurations (E2). An absent module or function
  (`42883`/import) is E0 only.
- **Narrow guard mutants** with assertion failures, and the restored SHA.
- **Contract:** `generate:check`, plus the DTO parser test.
- **ONE ordinary `pnpm check`** on the final signed head, with the UID 65534 CLI crossing reached.

## Not here

- the waiting-input UI;
- the AC03-12 admitted-before-paid correction;
- assessment, Explore, Build and voice;
- real enrollment, provider, release and app proof;
- activation.

This guard pins the declared profile fields. It does not prove vendor account, key ownership, endpoints or quotas.
