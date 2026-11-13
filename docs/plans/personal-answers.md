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

## Repair A2-F01: the declared UUID language on the three input routes

Written before this repair's code. Task `INC03-CC-003-A2-UUID-REPAIR-001` (`81fbe0ee…`), from the independent whole226
review `0979fc57…`. Base `c529286b` (tree `8eb17a26`). The repair is one signed child of `c529`, and it writes four
paths only: `routes/personal-answers.ts`, `personal-answers.db.test.ts`, this plan and the A2 handoff.

**The finding.**
- A53 declares `inputId` as `type: string, format: uuid` on `GET …/decisions`, `POST …/retry` and `POST …/cancel`.
- The pinned validators accept that format's whole language: lowercase, uppercase, and `urn:uuid:`-prefixed hex.
- The route validated the path with the shared lowercase-only `UUID_PATTERN` instead, so a valid uppercase or URN
  spelling of an existing input answered 422 before the handler ran.

**The repair, route-local, as A51's project-resources boundary already does** (inspected, not edited):
- Validate `inputId` with the declared `{ type: 'string', format: 'uuid' }`.
- Then read it in one spelling: the last 36 characters, lowercased. This is applied only to a value the format already
  accepted, so it parses nothing coercively and accepts nothing new.
- The canonical id is what the A1 writers and the decision read receive. Their idempotency semantic is
  `{inputId, expectedSeq}` with that canonical id, so:
  - the same key and expected seq under any accepted spelling replays the original immutable receipt, with no second
    decision, reservation or paid call;
  - a different input under the same key is still a conflict.
- Unchanged:
  - the shared `UUID_PATTERN` and every legacy route;
  - A53 and the generated files;
  - SQL, 0102 and the persistence helpers;
  - validator options;
  - the owner, epoch, closed body, server actor, readiness, default-off and paid-effect rules;
  - R2 after a committed retry, and no wake on cancel or GET.
- Malformed values still fail validation (422). Another owner's or an unknown input still reads `not_found`, the same
  as an unknown id.

**Checks.**
- Lowercase, uppercase and URN spellings of fresh inputs, on all three routes:
  - a GET that reads the same list;
  - a retry, admitted under the current seq;
  - a cancel of a fresh waiting input at its correct current seq that actually succeeds.
- Same-key alias replays that return the identical receipt, with unchanged decision and effect counts and the
  canonical `inputId`.
- Malformed ids, and the other-owner/unknown, epoch, closed-body and zero-effect-GET/cancel controls, kept.
- Fail-before of the new cases on exact `c529`.
- One reached mutant that restores the lowercase-only validation, with its bytes restored afterwards.
- The changed API DB file, plus the affected static and type checks.
- ONE ordinary on the new signed head.

## Repair A2-F02: keep a waiting original pending while its answer's prerequisites are unavailable

Written before this repair's code. Task `INC03-CC-003-A2-F02-READINESS-REPAIR-001` (`f1acfee9…`), from the independent
`INC03-CC-003-A2-F01-PR510-SOURCE-FINAL-001` (`1354631d…`), finding A2-F02 (P1). That finding confirmed the automatic
review comment 4556204505. The repair is one signed child of `4a152826`, writing at most these paths: `companion.ts`,
`app.ts`, the API DB test, this plan and the A2 handoff.

**Cause (confirmed).**
- 0101's writer, granted to `sophia_api`, can leave an admitted automatic turn pending before 0102 is installed.
- The runner claims that turn whatever its prerequisites are. The reservation then refuses it:
  - with no guard, `not_installed`;
  - with a payer no longer admitted, `not_admitted`.
- The runner's generic failure path marks the turn `failed`. `next_personal_reply` reads pending turns only, so a later
  install and restart never resume it.
- R1 (startup), R2 (a committed send or retry) and the chained queue all reach this one place, `CompanionRunner`, so a
  check on startup alone would not close it.

**Repair, in the shared runner (`companion.ts`); `app.ts` is not needed.**
- Before a turn is claimed, a live companion decides whether the turn may be answered now:
  - **Legacy turns** (no 0098 input row) may, exactly as before. No 0102 or Answer-switch gate is added to them.
  - **Automatic turns** may when 0102's guard is installed and the companion is ready. Ready means 0078 is installed and
    the payer is admitted for the owner (`Companion.ready`).
  - **Otherwise**, an automatic turn may still go ahead when an answer is already kept for it: it is written with no new
    call. If none is kept, it is deferred.
- **What deferral does and does not do.**
  - It writes nothing: no claim, failure, reservation, preparation or decision, and no change to `asked_at`, the epoch or
    the profile.
  - It ends that run of the queue. The runner does not chain to the next turn, which would be the same pending head, so
    it never selects the same turn again or waits on its own in-flight promise, and it adds no timer or polling.
- **Errors.** A read that fails (the origin, the guard's presence, readiness or a kept answer) is reported through
  `onError` and defers. It is never taken as legacy and never fails the turn.
- **Rehearsal, and the guard's own refusals.**
  - A companion that is not live keeps its explicit refusal of automatic turns (`AutomaticNotLive`).
  - With the guard installed and the companion ready, the guard's refusals (`not_admitted`, `profile_mismatch`,
    `profile_unsupported`, `lost`) still fail the turn explicitly, as before.
- **Resuming.** A later wake (a restart's R1, or a committed send or retry) on an eligible database resumes the same
  still-pending original once, under its frozen admission: same decision, same key, nothing re-admitted.
- **What deferral cannot change.**
  - The existing two-minute rule. A pending turn whose `asked_at` is older than two minutes reads as failed. That holds
    for a deferred turn too; it is not held indefinitely.
  - Turn order. Turns are answered one at a time, in order (`claim_personal_reply`, SQL that is frozen here), so a
    deferred automatic turn ahead of a legacy turn holds that legacy turn behind it until it is answered or lapses.
    A legacy turn with no automatic turn ahead of it is answered as before.

**Checks.**
- On a genuine 0001–0101 database (0102 not installed), in the API DB test:
  - R1 with the switch on and off defers, with zero claims, failures or preparations;
  - R2, from a legacy send, defers and stops without selecting the turn again;
  - legacy before 0102 is answered;
  - installing 0102, then a restart or a legitimate wake, answers the original once;
  - kept-first: a kept answer is written with zero calls while 0102 is absent.
- With 0102 installed and the payer no longer admitted (the companion not ready), the turn is deferred.
- Fail-before on exact `4a15`.
- A few cause-reaching mutants (the missing-guard check, the readiness check, kept-first), each restored.
- The changed API DB file and the static checks.
- ONE ordinary on the new head.

## Repair A2-F03 and A2-T01: kept recovery before fresh-effect readiness; wait for the legacy answer

Written before this repair's code. Task `INC03-CC-003-A2-F03-KEPT-AND-TEST-REPAIR-001` (`b2ea7714…`), from the
independent `INC03-CC-003-A2-F02-03d9-SOURCE-CORE-001` (`48f0a20f…`, inside evidence ZIP `99388c24…`). The repair is
one signed sole child of `03d9a0dc`, writing at most `companion.ts`, the two API DB test files (`personal-inputs` only
for A2-T01), this plan and the A2 handoff. `app.ts` is frozen.

### A2-F03 (P2)
**Cause.** In `03d9`, `CompanionRunner.eligible` reads the origin, the guard's presence and `Companion.ready` before
it looks for a kept answer. The live companion's `ready()` runs real queries that can reject. A rejection made the
catch defer the turn, so an answer already kept for it, readable from a healthy ledger, was not written.

**Repair (`companion.ts` only).**
- For a live companion, `eligible` first reads the owner's kept answer (`readPersonalSettledAnswer`, under the owner).
  A known kept answer is eligible at once. It is written with no new effect, and none of the origin, guard or
  readiness reads are made for it.
- If the kept read itself fails, it is reported and defers: no claim, no failure, no fabricated answer.
- Only without a kept answer do the F02 checks follow, unchanged:
  - legacy: eligible;
  - automatic: guard installed and companion ready;
  - otherwise deferred;
  - any failed read reports and defers, and is never read as legacy.
- Unchanged:
  - the claim, epoch, erasure, shutdown, lost and current-profile fences and frozen admissions (the reservation
    guard);
  - the FIFO drain stop;
  - the installed guard's explicit refusals;
  - the rehearsal's refusal;
  - UUID aliases and the default-off switch.
- A kept answer is never permission for a new effect; `answerOne` still writes it under the claim without asking.

### A2-T01 (P2, the test only)
**Cause.** `personal-inputs.db.test.ts:255` counts 4 turns right after a legacy send answered 202 and a 409. The 202
commits the person's turn and starts the runner's answer asynchronously, so 3 turns is a valid intermediate state.

**Repair.**
- A bounded public completion observer. It polls `GET /api/v1/personal/turns?after=0` until that legacy receipt's turn
  reads `answered`, with a finite deadline that fails by `assert.fail`.
- It runs before the unchanged final exact count (4 turns, 2 inputs). Every replay, conflict and privacy assertion is
  kept. No sleep, no lowered count.
- Two observer tests on a barrier companion (a rehearsal whose answers wait for an explicit release):
  - **Delayed answer:** the observer is still waiting, with 1 turn, before release; after release it resolves and
    there are 2 turns.
  - **Never-completing negative:** an unreleased answer makes the observer fail by assertion. The barrier is released
    afterwards so nothing is left running.
- The cause of past failed runs is not rewritten: their exact scheduling stays untraced.

### Checks
- **A2-F03** (API DB test, on the A2-F02 suite's database, 0102 installed):
  - a live companion whose real readiness query (`personal_companion_admitted`) rejects (08006, selectively) while
    the ledger stays healthy writes the kept answer: 0 prepares, the usage unchanged (one settled row);
  - control, no kept answer with the same rejection: deferred, pending and unclaimed;
  - control, kept-ledger read error (EXECUTE on `personal_settled_answer` revoked, then restored): deferred, pending
    and unclaimed, 0 prepares.
- **Fail-before** on exact `03d9`.
- **Two mutants:** kept read after readiness; a kept-read error read as no kept.
- **The five-file DB set** (the API DB file, `personal`, `personal-inputs`, `readiness`, `personal-live`), plus the
  static and type checks.
- **ONE ordinary** on the new head.

## A3: Personal answer control (INC03-CC-003 A3, migration 0103, amendment A54)

Lease `INC03-CC-003-A3-CONTROLS-IMPLEMENTATION-001` (`342f10e2…`). Built on `b760b04a`, the sole parent. Written
before any product code. It is PLAN003 (`cee89f74…`) as corrected by all seven binding corrigenda (C1–C7) of the
independent review `ca420d02…`. It is a backend slice: no Studio or UI, no activation, not AC03-12 app acceptance.

### State: four separate axes

| Axis | Kept in | Values |
|---|---|---|
| Control (desired state of one automatic input) | `personal_answer_controls` | no row = `active` revision 0; `held`, `active`, `withdrawn` |
| Admission history (unchanged, 0101) | `personal_input_decisions` | `admitted`, `waiting`, `cancelled` (A53 waiting-cancel only); never appended to by A3 |
| Financial (per bound call, unchanged, 0073) | usage + `personal_companion_calls` | `reserved_active`, `reserved_orphan`, `uncertain`, `settled`, `released` (+ its reason) |
| Launch (per call reserved by the new entry) | `personal_answer_launches` | `tagged`, `launching`, `denied`, `refused` (no row = `untagged`: an old or pre-0103 caller) |

The answer of a call is derived, never stored twice:

| `answer` | Meaning |
|---|---|
| `published` | Its reply was written. |
| `kept_unpublished` | 0078 holds it for a still-authorized turn. |
| `withheld` | `personal_withheld_results` holds it. |
| `no_answer` | Settled with `settled_without_answer`. |
| `unknown` | Orphan, uncertain, or settled with `unfinished_call`, `usage_unknown`, `stopped_usage_unknown`, `settled_before_fence`, `prepare_unknown` or `stopped_after_launch`. |
| `in_progress` | Reserved and still registered. |
| `none` | Released, denied or refused. |

**Possible external effect** means:
- the launch is `launching`;
- or the call is untagged and not released;
- or the call is `uncertain` or `settled`.

A launch intent is not "sent", "received" or "accepted". A missing intent or tag is not "never sent".

### Closed control transitions

All transitions run under `personal_hold`, in the lock order below. The revision is an int from 0 to 1000, independent of 0101's 100-decision cap, so an input whose latest admitted decision is seq 100 is fully controllable.

| # | From | Operation (own key, expected revision r) | To | Turn |
|---|---|---|---|---|
| C1 | active r, latest decision `admitted` | `cancel` | withdrawn r+1 | `pending`/`failed` → `withdrawn`; `answered` stays (historical) |
| C2 | active r, latest `admitted` | `replace(text)` | X as C1; new Y: `active` 1 with 0101 seq 1 `send` admitted, or `held` 1 with a reason | Y: new person turn, `pending` if admitted, else `recorded` |
| C3 | held r (Y) | `admit(controlId)`, eligible now | active r+1; 0101 seq 1 `send` admitted | `recorded` → `pending` |
| C3′ | held r | `admit(controlId)`, not eligible | unchanged (the refusal is remembered) | none |
| C4 | held r | `cancel` | withdrawn r+1 | **stays `recorded`** (never admitted: not activity, not prompt) |

**Refusals** (no state change, nothing remembered except C3′):

| Case | Response |
|---|---|
| Stale revision | 409 `stale_revision` |
| Withdrawn, any operation | 409 `invalid_state` |
| Active with latest `waiting` (A53's) | 409 `invalid_state` |
| No decision and not a Y (A52 record-only) | 409 `invalid_state` |
| `replace` on held | 409 `invalid_state` |
| Unknown or foreign input; a control id that is not this owner's `replace` creating this Y | 422 `not_found` (A53's nondisclosure) |

**Replacement eligibility,** at C2 and re-read at C3. The first failing check is the held reason:

| Order | Held reason | When |
|---|---|---|
| 1 | `prior_in_progress` | Any original binding is `reserved_active`. |
| 2 | `prior_cost_unresolved` | Any is `reserved_orphan` or `uncertain`: authentic settlement or operator reconciliation must come first. Nothing is forgiven or reset. |
| 3 | `admission_off` | `personalAnswers` AND `personalAnswerReplacementAdmission` are not both on (server-passed). |
| 4 | `profile_unavailable` | No live `answerProfile()`, or 0101 refuses it. |
| 5 | `payer_unavailable` | `personal_companion_admitted(profile.payer, owner)` is false. No 0101 `waiting` decision is written: held is not waiting. |

Otherwise the replacement is admitted under the current profile. Its spend later goes through the 0102 guard and 0073's cumulative allowance and one-unresolved-per-payer rule.

**Residual unknown (C7).** After authentic settlement, an `unknown` original answer stays reported as `unknown`. Admission of the distinct Y is allowed only because X is no longer:
- queueable or reservable: its turn is not `pending`, and the legacy retry needs `failed`;
- current-publishable: plain and kept writers need `pending`, and late bodies are withheld;
- prompt-eligible.

This is not a retry of X and does not prove an already-authorized provider call stopped. A fresh old intent ACK may still run its one call; a cooperative abort is a request. GET, replay, reconnect, reconciliation and flag changes never admit Y.

### Launch protocol (C1, C2)

| From | Event | To |
|---|---|---|
| — | `reserve_personal_answer_controlled` commits `reserved` | `tagged`, with the frozen execution snapshot and its digest, call/turn/epoch/input, and the control revision |
| tagged | `begin_personal_answer_launch(call, claim, digest)` with every recheck passing, payer row held FOR UPDATE through COMMIT | `launching` → `granted` (the only permission to prepare) |
| tagged | a recheck fails (digest, epoch, claim/turn, control revision/state, latest admission, frozen profile vs execution, payer enrolment, usage `reserved` with the same payer/route) | `refused` → that reason; the usage is released (`refused_before_launch`) |
| tagged | a control on the turn wins first | `denied`; usage released (`withdrawn_before_launch`) in the control transaction |
| launching/denied/refused | `begin_…` again | unchanged; `already_launched`/`withdrawn`/`refused`: never permission |
| absent row | `begin_…` | `not_tagged`: no release, no resurrection (absence is not no-effect proof) |

**Client side** (`companion-live.ts`):
- The protocol is remembered from the reservation that returned `reserved`. Only a positively absent 0103 (marker function missing) takes the exact b760 path.
- A read error is an error, never "absent".
- A `controlled` call prepares only after its own fresh `granted` (a one-shot flag).
- A thrown `begin_…` (unknown acknowledgement) never prepares; the call stays `reserved`, then `reserved_orphan`, so it is fenced `lost` until reconciled.

**After `granted`** (C2):
- A throw from `prepareCall`, a resolved-route mismatch, or an abort is held `uncertain` under the original call (`prepare_unknown`, or `stopped_after_launch` for an abort), never released.
- Only an abort seen *before* `prepareCall` is invoked is released (`stopped_before_asking`).
- Positively pre-0103 calls keep b760's releases unchanged.

### Late results (C3)

Withdrawal and settlement are keyed on control plus the original call's binding (owner, epoch), not on the reply value.
- **On C1/C2:** a kept 0078 answer for X's turn is moved atomically to `personal_withheld_results` (`kept_transfer`).
- **`settle_personal_companion_answer`** is replaced with the same signature, grants and old outcome meanings. For a call bound to a `withdrawn`-controlled turn in the current epoch:
  - the body and suggestion are retained in the withheld store (`late_settlement`), whether the turn is `withdrawn` or still `answered`, and even when the cost was already settled or reconciled;
  - financial settlement follows its own rule (`settle_personal_companion`; `not_settled` stays `not_settled`);
  - the 0080 `settled_without_answer` mark is cleared only when this call settled in this same transaction, as 0080 does for kept answers;
  - an identical retained body replays idempotently; a different one raises `23505` and is never overwritten.
- **Lost acknowledgement:** recognized by the exact own-call withheld result (`personal_withheld_answer(call)`) as well as `keptAs`.
- No plain, kept, fallback or suggestion path writes a reply for a withdrawn turn: both writers need `pending` and the claim. An answered X's existing receipt replay is history, not a new insertion.

### Activity and prompt (C4)

| Predicate | Definition | Used by |
|---|---|---|
| `ACTIVITY` | The b760 `NOT_HELD`: excludes person `recorded`. | `WELCOME_DUE`; identical to 0099, which `begin`/`record_personal_greeting` call. 0099 is unchanged. A withdrawn X counts. A never-admitted Y, held or cancelled, stays `recorded` and does not count. An admitted Y counts. |
| `PROMPT_ELIGIBLE` | `ACTIVITY AND NOT EXISTS (control withdrawn on coalesce(t.reply_to, t.id))`, inside WHERE, before LIMIT | `HISTORY`'s `recent` CTE and `readWelcomeContext`'s history. Only when 0103 is positively installed; b760's query otherwise. |

Owner-adopted notes and every old fact stay.

### Owner projection (C5): A54, new route family only

A10, A52 and A53 are byte-unchanged.

**Routes:**

| Route | Purpose |
|---|---|
| `POST /api/v1/personal/answers/{inputId}/control` | C1/C2/C4; body `PersonalAnswerControlRequest` |
| `POST /api/v1/personal/answers/{inputId}/control/admit` | C3/C3′; body `PersonalAnswerAdmitRequest` |
| `GET /api/v1/personal/answers/{inputId}/control` | `PersonalAnswerControlView`, the current view |
| `GET /api/v1/personal/answer-controls/log?after=<seq>` | `PersonalAnswerControlLog`: ops `seq > after`, ≤ 100, `next` |
| `GET /api/v1/personal/answer-controls/turns?after=<seq>` or `?before=<seq>` or none | `PersonalControlledTurnPage`: ≤ 100 turns, revision, epoch, `pending`, `earlier` |
| `GET /api/v1/personal/answer-controls/export?after=<seq>` (epoch header) | `PersonalControlledExport`: ≤ 100 turns with `next`, every input view for those turns (decisions, control, calls, withheld bodies), notes, releases |

**`PersonalAnswerControlView`** contains:
- the input and its turn;
- the immutable admission history: every 0101 decision, ≤ 100, ordered;
- `route`: `{routeId, profileDigest}` from the latest admitted frozen profile. This is the only allowed non-secret reference; the full profile, payer and credentials are never exposed;
- the control state, revision, held reason, withdrawal phase, `replaces` and `replacedBy`;
- per bound call: `{callId, financial, reason, launch, answer}`, with no amounts;
- every withheld `{callId, text, suggestion, source, at}`.

**Controlled turn:** the A10 turn fields plus:
- the physical `reply`, which may be `withdrawn`;
- `input: {inputId, control, revision}` or null;
- `prompt: eligible|excluded`;
- `activity: true|false`.

**Cursor and snapshot semantics:**
- Turn cursors are turn `seq`.
- The op log cursor is a global sequence allocated only after `personal_hold` and held through COMMIT, so one owner's page never later gains a lower seq.
- Every page is one read transaction. No cross-stream immutable snapshot is claimed.
- Export reads against the epoch header: another epoch is `request_erased`.
- Receipts are immutable mutation snapshots. A GET is a current observation and never rewrites one.

**Old unversioned reads** (`routes/personal.ts` space, poll, earlier, export):
- When 0103 is installed and the owner has any control row, they answer **503 `projection_unavailable`**. This holds even for an answered X and while another, unrelated turn is pending.
- They never return a turn they cannot represent.
- Positively absent 0103 keeps b760.

**Rollout:**
- Readers ship first, with the producer off: there is no Studio caller.
- Installing 0103 is a release action, and routine activation is held for a capable reader and a reviewed Personal UI.
- An old cached Studio client is not refreshed by its next poll; the server-side failure is its boundary.

### Availability and replay (C6)

- **Installation is the boundary:** a positively complete 0103 (marker `sophia.personal_answer_controls_protocol()`).
  - Absent → 503 `projection_unavailable`.
  - A read error → 503 `unavailable`, never empty or legacy.
- **No controls flag.** Cancel, held-replace retention, the GETs and replay work regardless of `personalAnswers`, `personalAnswerReplacementAdmission` and the live profile.
- **Paid gate:** fresh replacement admission needs both flags (default off; `server.ts` unchanged) and current authority. Record-only `personalInputs` is not a paid flag.
- **Writer order:** `personal_fence(epoch)`, then semantic identity, then the remembered receipt. The receipt returns before any profile, flag or state read, with no wake.
  - **Semantic identity:** `{inputId (canonical), action, expectedRevision, text digest}`, or `{inputId, controlId, expectedRevision}`.
  - Current profile and flags are never part of replay identity.
- **Status codes:** control and admit answer 202 with a receipt, as A53's writes do. A refused admit is a remembered `outcome: refused` receipt, so its first answer and every replay are the same 202 body.
- **Wake:** `resume(owner)` only after the first commit of an applied C1, C2 or C3.

### SQL (0103, append-only; 0001–0102 byte-identical)

**Turn reply CHECK:** gains `withdrawn` (the 0098 precedent).

**New tables:**

| Table | Access |
|---|---|
| `personal_answer_controls` | RLS owner SELECT |
| `personal_answer_control_ops` | append-only; RLS owner SELECT |
| `personal_answer_launches` | function-only |
| `personal_withheld_results` | function-only |

All cascade from the input or turn (erasure). Usage stays as it is.

**Functions** (SECURITY DEFINER, `search_path=pg_catalog,sophia,pg_temp`, PUBLIC revoked):

| Function | Grant | Notes |
|---|---|---|
| `personal_answer_controls_protocol() → integer` | sophia_api | the marker |
| `reserve_personal_answer_controlled(uuid,text,text,bigint,uuid,uuid,jsonb,jsonb) → jsonb` | sophia_api | |
| `begin_personal_answer_launch(uuid,uuid,text) → text` | sophia_api | |
| `control_personal_answer_input(text,uuid,text,integer,bigint,text,jsonb,boolean) → jsonb` | sophia_api | |
| `admit_personal_answer_input(text,uuid,uuid,integer,bigint,jsonb,boolean) → jsonb` | sophia_api | |
| `personal_answer_control_view(uuid) → jsonb` | sophia_api | |
| `personal_answer_control_log(bigint,integer) → jsonb` | sophia_api | |
| `personal_withheld_answer(uuid) → jsonb` | sophia_api | |
| `personal_answer_call_effects(uuid,bigint)` | internal | |
| `personal_answer_replacement_hold(uuid,bigint,jsonb,boolean)` | internal | |

**Replaced** (same signature and grants): `settle_personal_companion_answer(uuid,bigint,jsonb,text,text)`, as above.

**Unchanged:** every other function, including:
- `reserve_personal_answer_guarded`, `reserve_personal_answer(_companion)`;
- `record_personal_reply`, `record_personal_settled_reply`;
- claim, next, renew, fail, `retry_personal_turn`;
- 0099;
- every 0101 writer;
- release, hold, settle, reconcile.

**Lock order** (one order everywhere):
1. space (`personal_fence`/`personal_hold`);
2. request key;
3. control, input, turn, decisions;
4. launch rows;
5. payer FOR UPDATE, then the usage row.
Settlement keeps 0080's space → payer → usage → binding, then control/turn, then kept or withheld.

### TS callers and paths

| Path | Change |
|---|---|
| `packages/persistence/src/personal-answer-controls.ts` (new, exported by `index.ts`) | typed callers, controlled page and export reads, old-read boundary check |
| `apps/api/src/companion-live.ts` | protocol, launch, prepare uncertainty, withheld lost-ACK |
| `packages/persistence/src/personal.ts` | ACTIVITY / PROMPT_ELIGIBLE |
| `apps/api/src/routes/personal-answer-controls.ts` (new) | the A54 routes |
| `apps/api/src/routes/personal.ts` | the old-read boundary |
| `apps/api/src/app.ts` | `personalAnswerReplacementAdmission`; mount always; misconfiguration refusal; `/ready` unchanged (installation is per request) |

`companion.ts` is unchanged: `CompanionRefused('withdrawn')` reaches its existing failure path, whose `fail_personal_reply` needs `pending` + claim and so is a no-op.

GEN (sole writer): `openapi.json`, `generated-types.ts`, `generated/validators.{js,d.ts}`, `generate-validators.ts`, `validate.ts`.

### Checks

**SQL tests:** 0103.

**Persistence DB tests:**
- callers;
- positive pre-0103 absence;
- a read error.

**API DB tests** (real runner, live companion, counting fake provider; barriers placed before the correction's first statement or before the reservation/intent COMMIT, never after `personal_fence`):
- before reservation;
- bound before intent;
- intent first (0 or 1 asks per real grant/abort);
- fresh, repeated and lost ACK;
- claim, epoch, payer and control races;
- entered-prepare throw, mismatch and abort held;
- late results on pending and answered X, after reconciliation, and after a withheld lost ACK;
- authorized kept with 0 spend;
- cancelled never-admitted Y vs admitted activity (TS = SQL);
- HISTORY linked replies;
- seq 100;
- held admit/cancel races, path/control/foreign ownership;
- flags/profile off: applied and refused receipt replay, erasure;
- the new reads and export, and the old-read boundary with another pending turn;
- owner cursor serialization.

**Then:**
- a few reached mutants;
- one genuine `pnpm check`.

New capability absence at b760 is E0.

## Repair A3-R1: keep a whole late answer of withdrawn work, its cost left unknown (A3-CC87-F01)

**The finding** (independent CORE on cc87, P2): the runner's watch stops a call once its input is withdrawn; a provider
adapter may still finish and return a whole, valid answer after that stop. In cc87 three places drop it:
- `collect()` replaces the stream's own `stop` with `aborted`;
- `ask()` then holds the call uncertain, with no usage;
- `answer()` parses no reply once stopped and settles only with a usage.

So the answer never reaches 0103's withheld store. The same loss happens without a stop when the usage is missing or
ambiguous. 0103's settlement cannot take such an answer: it calls 0073's settler first, which requires a used amount
and its counts.

**The repair** (separate the answer from the money):
- **0103 gains `retain_personal_withheld_answer(call, body, suggestion)`** (SECURITY DEFINER, `search_path` pinned,
  EXECUTE for `sophia_api` only).
  - It keeps the answer withheld exactly as the settlement keeps one: `late_settlement`, once; an identical replay
    changes nothing; a different answer is refused (23505).
  - It does so only for the caller's own call, granted (`launching`) for the input whose control is `withdrawn`, at the
    current epoch, with its usage row. Anything else answers `not_withdrawn` and writes nothing: another owner, a call
    never launched, an input not withdrawn, an erased or older epoch.
  - It never reads or writes money: the call stays as held (`uncertain`, no amount) until it is reconciled, and the
    replacement stays held on `prior_cost_unresolved` (C7).
  - Every other 0103 definition and every earlier migration is unchanged.
- **The live companion:**
  - It records what the stream itself reported (`reported`) beside the existing `finish`. The stop still overrides
    `finish`, so cost and publication rules are unchanged.
  - When no usage settles the call, and the stream itself finished (`stop`, no tool call, no failure) with an answer
    that can be stored, it asks 0103 to keep that answer. The attempt is bounded, uses the same answer and never asks
    again.
  - An answer kept this way is never returned for writing: when not stopped, the call is refused as `withdrawn`.
  - A cut-off, failing, max-token, tool-call or unstorable stream is never kept.
- **Unchanged:**
  - no new ask, preparation, key or operation;
  - no settlement, release or reconciliation from a stop or from keeping an answer;
  - known complete answers with usage still settle through 0103's settlement;
  - answered and kept cases keep their history.

**Checks:**
- **API (real runner, 100 ms watch, a counting fake that ignores the stop):** the stream's own signal must report
  the stop before the stream is released.
  - A whole answer with usage, and one without usage: both withheld, cost uncertain with no amount, nothing written,
    the replacement refused admission on the unresolved cost.
  - A cut-off and a failing stream: nothing withheld.
  - No stop, usage missing: withheld, cost `usage_unknown`.
- **SQL (0103):**
  - binding refusals: never launched, not withdrawn, another owner;
  - money unchanged after keeping;
  - replay and conflict;
  - no resurrection after erasure;
  - grants.
- **Fail-before / pass-after:** the tests fail on cc87's production, then pass on the repair.

## Repair A3-R2: a durable private handoff for the original call's answer (A3-R1-934D-F01)

**The finding** (independent CORE on 934d, P2): a whole answer whose usage is missing or ambiguous completes while
its input is still active, so R1's retention answers "not withdrawn" and keeps nothing. If the owner's withdrawal
commits after that retention transaction and before the runner's final write, the writer correctly refuses to publish,
and the body is lost. Another precheck cannot close that gap.

**The repair** (root-selected: durable, private, separate from money):
- **0103 gains `personal_answer_staged_results`**: private, function-only (RLS, no grants), keyed by the call, bound to
  the owner, turn, epoch and input, and erased with the turns.
- **`retain_personal_withheld_answer`** now has three outcomes, under the owner's lock, for the caller's own granted
  original call at the current epoch (with its usage row):
  - `'retained'`: the input is withdrawn; the answer is kept withheld (`late_settlement`) and an identical staged copy is
    moved;
  - `'staged'`: the input is still active; the answer is kept privately;
  - `'not_bound'`: nothing is written.
  - Once per call: an identical replay changes nothing; a different answer is refused (23505), never overwritten.
  - Money is never read or written.
- **`control_personal_answer_input`**, in the transaction that withdraws an admitted input (in every phase, published
  first included), moves the turn's staged original-call answers to the withheld store. A staged answer that conflicts
  with a different withheld one stays staged: never overwritten, and it never fails the owner's control.
- **The live companion** stages or keeps the answer through the same bounded retention. A lost acknowledgement is
  recovered by the identical replay, and a conflict is recognized also when `withActor` reports it as a domain error.
  A staged answer is still returned to the unchanged Runner and final writer: it is published if its input is still
  pending, and refused if withdrawn, where it is already safe.
- **Unchanged:** the Runner, the old writer, personal.ts, A54, GEN, 0001–0102, money (no settle, release or reconcile;
  the replacement stays held on the unresolved cost), and the wire.

**Checks:**
- **API (real runner, live companion, counting fake, F01 latches):** the retention COMMIT completes on the server and
  its acknowledgement is held at that boundary; the owner's control commits; then the acknowledgement is released and
  the final writer runs.
  - Missing usage with a cancel, and ambiguous usage with a replacement: the body and suggestion are withheld, 0 staged,
    0 public replies, cost uncertain with no amount, one prepare and one stream, and the replacement is refused
    admission on the unresolved cost.
  - Published first, then withdrawn: withheld, with no added reply.
  - A lost retention acknowledgement: recovered once.
  - An erasure between the retention and the final write: nothing staged, withheld or resurrected.
  - R1's and A3's earlier cases are unchanged.
- **SQL:** staging while active, replay and conflict; the control's move after launch and after publication; withdrawn
  first, kept directly; erasure of a staged body; not_bound; grants.
