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
- **Settle only completed responses.** The first run showed the adapter reporting counts for a refused and an aborted call. They are held instead. (The comparison first written here, that B2's reply service settles from any usage report, was wrong and is withdrawn: see Common source integration below.)
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

## Common source integration (FND-B3-COMMON-SOURCE-INTEGRATION-01)

One normal merge of the published CON-01 B2 `8c18b032` (C1 `2c60b408` with main `14e65afc`, service mode off) into this
branch at `5c4b1961`, with no conflict. Both sides' intents are kept: B2's and C1's API, SQL, packages, Studio and
scripts are byte-equal to `8c18b032`, and this branch's 16 Personal paths are its own. `server.ts` and `app.ts` carry
C1's conversation wiring and the companion's side by side. In `config/runtime-unit.json`, B2's bundle and this
branch's lock and darwin entries combine unchanged. 0073 is still the one migration added, with no amendment.

Every identity reproduces without recording: the Sophia bundle
`sha256:e516779f8608b9246ec76f877d8af5fbe54e473dc0a84f9ceb49b3a3c59428dd` (B2's, since dsh-bundle is unchanged), the
workspace lock `6614784d…` and the darwin-arm64 dsh tree `4f6f256b…` (28,427 entries). The linux-x64 entry still holds
`4552d08f…` and is unqualified until a Linux build measures it.

Checks on the merged head (Node 24.21.0, pnpm 11.7.0; private PostgreSQL 17.11, UTF8, fresh and removed after):
- toolchain, format, lint and typecheck pass; contract regeneration has no drift; `pnpm artifacts` reproduces.
- Unit: 3017 passed, 0 failed, 70 skipped.
- `test:sql`: 68 migrations, 5 files. `test:db`: 1004 passed, 0 failed, 0 skipped. The two exclusive Q13 groups are
  skipped suites with no tests, not counted; their PostgreSQL 16 qualification is still owed.
- Personal, focused: live companion, usage (0073), API and persistence personal suites 71/71, rehearsal 2/2. These
  run the real Cordis, dsh-llm and pi-ai composition against the local Responses double with a fake test key.
- B2 crossings: 17/17 (runtime service 5, conversation service 12). They authenticate with a synthetic Bearer
  test-actor verifier, not signed JWT verification.
- C1 served cases: 5/5, with VISION and the companion unset, including the outsider's 403 at the closed door.

Correction: this record first said that B2's service executor settles usage after an errored or aborted call. That
was wrong and is withdrawn. B2 settles only a completed response's usage, as this companion does, and pi-ai's
synthetic usage on an error or abort stays uncertain in both. No fix was needed or made.

Unchanged holds: the companion and B2's service mode stay off. The native reply supervisor's open review
(4300538470) still blocks native and BYO activation. Davide's Personal data and recipient approval, an admitted payer
and allowance, the API host's credential custody (D-OPS) and V's route check are still owed.

## Current reviewed B2 carried (FND-B3-CURRENT-REVIEWED-B2-CARRY-02)

One normal merge of #393's reviewed and published `2017330d` into `184c5063`, both parents kept. The merge base is
`8c18b032`, the B2 head the common integration above carried.
- What arrives: current C1 (`42f65b5e`: main `21516687`, the 20 s projection read bounds, the LiveKit test contract,
  failure-only partial stops, the byte-backup test contract), 0071's SET-without-ADMIN admission, and D-Q13's
  trusted-creator exception.
- **No conflict.** The one path both sides changed, `packages/persistence/src/index.ts`, combined automatically:
  Personal's exports plus C1's `ServiceControl` type. Every other path is one side's exactly: Personal's 16, B2's 55.
- `config/runtime-unit.json` is unchanged from Personal's: B2 changed no runtime input after `8c18b032`.
- Personal's 0073 and its live files are their reviewed bytes. No migration, contract name, SDK, route or flag was
  added; the companion and service mode stay off.

**Checks on the merged tree** (Node 24.21.0, pnpm 11.7.0; private PostgreSQL 17.11, two fresh clusters, removed).
- D-Q13 trusted-creator group: 7/7, on a cluster whose `postgres` is a plain installer. Its installation applied every
  migration, 0073 included, as that installer.
- On a superuser cluster:
  - the exclusive admission and install groups: 7/7, with the four hold stages;
  - `test:sql`: 68 migrations;
  - `test:db`: 1008/1008, including the live companion, its configuration, personal routes and a failing companion
    against the local Responses double. The three gated groups skip there and are not counted.
- The ordinary `pnpm check` on this head is in B's handback.
- Not run: the C1 served cases (no served ports for this packet), PostgreSQL 16, Supabase-local auth, any Linux build.
  The linux-x64 identity stays unqualified, and the two runner instances are still one Node process, not two processes.

**Paused, qualification INCOMPLETE (FND-B-B2-NEW-P1-TRIAGE-PAUSE-01).** The automatic review of `2017330d` raised two
new P1s, which this composition inherits unrepaired: `reply-service.ts:422`'s call timer can outlast the shared
delivery deadline (#393 discussion 4302482622), and 0071 chooses the newest ready runtime without matching its
execution provenance or artifact digest (4302482626). R triages them before any repair. This merge is sealed as a
local checkpoint; no further Personal check or change until a new scope.

## Reviewed B2 repair carried (FND-B3-CURRENT-D0C4-LOCAL-CARRY-03)

One normal merge of #393's reviewed and published `d0c46d5f` into the paused checkpoint `a617c6d6`, both parents
kept. The merge base is `2017330d`. This brings the repair of the two P1s above into Personal:
- one reply deadline, shared by the call, delivery and settlement;
- A40: a reply goes only to a runtime that advertises the grant's executor;
- the PostgreSQL 16 fixture.

**No conflict.** The one shared path, `config/runtime-unit.json`, merged automatically. Each side changed its own
fields: B2's bundle `3c2b1d43…` beside Personal's workspace lock `6614784d…` and darwin-arm64 dsh tree `4f6f256b…`.
- Every other path is one side's exactly: d0c4's 15 and Personal's 16.
- 0067 and 0070 are unchanged, 0071 is d0c4's, and Personal's 0073 is its reviewed bytes. 0073 names no 0071 object.
- No migration, amendment, endpoint, SDK, flag or dependency was added. The companion and service mode stay off.

**Every identity reproduces without recording:** the bundle, the workspace lock, the darwin tree, the release
integrity and the profile lock. The linux-x64 entry still holds `4552d08f…`, unqualified until a Linux build measures
it.

**Checks on the merged tree** (Node 24.21.0, pnpm 11.7.0; private PostgreSQL 17.11).
- **A first database run was invalid.** Its cluster was made with `--no-locale`, against this record's
  `--locale=en_US.UTF-8`.
  - `test:db` failed one case, 0036's section split, which neither side changed. A test heading's `é` was dropped
    from its anchor.
  - On that cluster, 0036's own anchor expression gives `b---aa` collated "C" and `b-é---aa` collated en_US.UTF-8.
    The test expects the second.
  - The run is kept, and the cluster was removed.
- **On an en_US.UTF-8 cluster:**
  - `test:sql`: 68 migrations and 5 files.
  - `test:db`: 1013/1013. This includes A40's selection, refusal, legacy, hello and no-retarget cases, and the
    Personal live companion, usage, routes, erasure, exhaustion and missing-configuration suites against the local
    Responses double with a fake key. The three gated Q13 groups skip there and are not counted.
- **C1 served cases: 5/5**, run with the normal App, the listening API, restricted PostgreSQL and synthetic HS256
  identities. VISION and the companion were unset, and the outsider got the project's real 403.
- **Q13 helpers not repeated.** Their tests, scripts and test support are byte-equal to the accepted d0c4 and `690aa2c9`
  runs, and so are 0070 and 0071's admission function. The migration set differs from `690aa2c9`'s only by 0071, which
  d0c4's own run installed as the same plain installer. Installing this exact set as that installer was not run.
- The ordinary `pnpm check` on this head is in B's handback. It runs the B2 service and runtime crossings.
- **Not run:** PostgreSQL 16, Supabase-local auth, any Linux build, the automatic review of this head, and any real
  provider or payer. The two runner instances are still one Node process, not two processes.

The two inherited P1s are closed at source level by R's acceptance of d0c4. Their CI on PostgreSQL 16 (both helper
phases) and on Auth is still owed. Personal's data and recipient approval, an admitted payer and allowance, the API
host's credential custody and V's route check are still owed.

**Paused, qualification INCOMPLETE (FND-B3-PAUSE-FOR-EXECUTOR-IDENTITY-P1-01).**
- **A new inherited P1.** The automatic review of `d0c46d5f` raised it (#393 discussion 4302689994, `index.ts:227`): the
  configured executor digest covers only the Sophia archive, not the installed dsh, profile and adapter closure. R
  triages it, and there is no repair scope yet.
- **The ordinary `pnpm check` on `7f6960e7` FAILED** (exit 1). Toolchain, format, lint, build, typecheck and contracts
  pass. Units: 3038 passed, 0 failed, 70 skipped. Artifacts: 7 reproduce.
- **The integration run** had 108 passed, 0 failed, 17 cancelled and 2 skipped. Both B2 crossings, the conversation
  service (12) and the runtime service (5), stopped while creating their database: 0070's guard refused
  `sophia_conversation_assembler`, which "exists with unexpected memberships" (42501).
  - The cluster still held the served cases' dev-db database. A census before its removal also found a login role,
    `sophia_assembler_t_becdb9862402`, a member of `sophia_conversation_assembler`.
  - This is an association, not a proof: the cause is UNKNOWN.
  - Neither crossing passed on this head, and nothing was run again.
- **This checkpoint commit** changes this record only. The product tree is `7f6960e7`'s.

## Published common 1e1c carried (FND-B3-CURRENT-1E1C-LOCAL-CARRY-04)

The executor-identity P1 above was repaired in B2, and R accepted the repair (`c7cbc3aa`). It was published with
current main and C's accepted completed-goal session retirement as `1e1c9e3a`. This is one normal merge of
`1e1c9e3a` into the paused checkpoint `549c4896`, both parents kept; the merge base is `d0c46d5f`.
- **What arrives:**
  - the verified installed executor closure, refused outside the reviewed composition: no home patch, config-only
    JSON overlays, no Node modifiers, and the canonical closed bundle;
  - current main;
  - C's 0075 and A41.
- **No conflict.** The one shared path, `config/runtime-unit.json`, merged automatically: B's bundle `a27cc50a…` beside
  Personal's workspace lock `6614784d…` and darwin tree `4f6f256b…`.
  - Every other path is one side's exactly: 1e1c's 29 and Personal's 15.
- **Unchanged.** Contracts regenerate with no drift, and every identity reproduces unrecorded. linux-x64 `4552d08f` is
  still unqualified.
  - Personal's 0073 is its reviewed bytes, with 0071, A40, 0075 and A41 as published. No migration, amendment,
    endpoint, dependency or flag was added.
  - The companion, service mode, Ask, native and BYO stay off.
- **The earlier failure stays as it was.** `7f6960e7`'s check failed, with 17 cancelled crossings, after a served
  fixture kept its roles on the same cluster. It is not rerun.
- **This head is checked in separate, sequential owned clusters:**
  1. the ordinary check and the database sweep, with no served fixture;
  2. the trusted-creator group;
  3. the served cases, last.

  Results are in B's handback.

**Paused, then resumed (FND-B3-PAUSE-AFTER-EPISODE1-FOR-393-P2-01).** The automatic review of `1e1c9e3a` found a
P2 (#393 4303630159). A retirement of more than 1,000 bindings on one goal committed, and then its 202 failed the
receipt contract.
- Only the first database episode had run: the ordinary check, `test:sql` and `test:db`, all passed.
- The trusted-creator group and the served cases were held.

## Published common 9df carried (FND-B3-CURRENT-9DF-FINAL-LOCAL-CARRY-05)

R accepted B's correction, `9df69813`, and it was published: only `Receipt.targets`'s `maxItems` is removed in A41,
with OpenAPI, the validators and the API test regenerated.
- One normal merge of `9df69813` into `980567c5`, both parents kept; the merge base is `1e1c9e3a`.
- No path is changed on both sides. The 5 carried paths are 9df's exact blobs, and Personal's are unchanged.
- No SQL changed. Contracts regenerate with no drift, and every identity reproduces unrecorded.
- **This head is checked in separate, sequential owned clusters:**
  1. the ordinary check and the affected API and Personal database suites, with no served fixture;
  2. the trusted-creator group;
  3. the served cases, last, with the whole cluster torn down after.

  Results are in B's handback.

## Four review findings on #435 (FND-B3-435-FOCUSED-FOUR-FINDING-REPAIR-01)

The automatic review of `82ab58f9` found four defects, and R confirmed all of them. 0073 is corrected in place: P
bound it as unmerged and unapplied, since the production ledger has no 0073. No new name or migration was added.
- **A reserved call that never settles (P1, 4303867348).** If a runner died after asking the provider, or its
  settlement failed, the call stayed reserved, and other calls kept being admitted on its payer.
  - Now any reserved or uncertain call holds its payer, whoever owns it: **one unresolved call per payer**.
  - An operator settles a reserved call from the provider's record, but only once its call is no longer registered.
    The full bound stays counted until then, and nothing unknown is released as zero.
  - The API role cannot reconcile, and cannot raise an allowance.
- **The payer lock (P1, 4303867352).** Only admission locked the payer. Now hold, settle, release and reconcile lock
  the payer's row first, then recheck the call's owner and state, so every transition is seen in one order.
- **The asked turn sent twice (P2, 4303867356).** History is read up to the asked turn, so it ended with it, and the
  turn was also sent again on its own.
  - Now that history tail is dropped by its position, not by its text, so an earlier identical message stays.
  - The reservation is measured on the prompt that is actually sent.
- **A Note with U+0000 (P2, 4303867360).** The note made the whole answer unstorable after its cost had settled. Now
  such a note is dropped and the answer is kept.

**Checks** (private PostgreSQL 17.11, en_US.UTF-8).
- **Before, on `82ab58f9` source:**
  - the first turn already listed itself as history;
  - the NUL-note turn never settled;
  - another owner was reserved on a payer whose call was abandoned;
  - an admission was granted while a call was unresolved.
- **After:** the four Personal suites pass 75/75, with the two-client ordering case observed through lock waits, not
  timers.
- **Two earlier expectations were updated to the new policy.** A second reservation is now held, and a test now
  releases its reserved call.
- **Mutation.** Without hold's payer lock, the two-client case fails ("the hold waits for the admission holding the
  payer").
- The ordinary check, `test:sql`, `test:db` and the trusted-creator group of this head are in B's handback.

**The Linux runtime identity (CI on #435).** The PostgreSQL 16 and runtime-unit jobs on `82ab58f9` both failed at the
artifact check.
- Two clean Ubuntu builds measured the linux-x64 runtime tree as `bff106c3…` (27,747 entries). The record still held
  B2's `4552d08f…`: Personal's lock changes that tree.
- No artifact input changes in this repair. The lock, the profile, the runtime package, the artifact scripts, the dsh
  pin, the toolchain and the reproduced bundle `a27cc50a…` are all those of `82ab58f9`.
- So, with P's permission, the linux-x64 entry and the primary alias record that measurement. The darwin entry
  `4f6f256b…` still reproduces.
- This records what CI observed. It is not a Linux pass for this head: the next CI run must reproduce it and complete
  the gated crossings, provenance and both PostgreSQL 16 helper phases.

## Three review findings on `216859f4` (FND-B-PERSONAL-THREE-FINDINGS-FOCUSED-CORRECTION-01)

R confirmed all three. P chose the initial scope: one verified owner per existing payer, pinned by the operator.
- **The note list's bound (4304097074).** Notes were measured before their `- ` and line breaks were added, so 1,200
  four-byte notes rendered 8,399 bytes against a 6,000-byte bound.
  - Now each line is rendered first, and the newest lines are kept within 6,000 bytes as sent, prefixes and breaks
    included.
  - The section's fixed label is outside that bound.
  - The reservation is still measured on the exact prompt sent.
- **The Note line (4304097082).** A `Note:` inside a sentence or a word cut the answer short. Now a Note is read only
  from the answer's last line, at its start or after a real line break, with indentation, CRLF and trailing spaces
  allowed. Anything else stays in the answer. The U+0000 and body checks are unchanged.
- **One owner per payer (4304103151).**
  - 0073, corrected in place (still unmerged and unapplied), gives each payer a required `owner_id`. Only the operator
    enrolls it; no API or worker role can.
  - Reservation checks the caller is that owner, under the payer's lock, and refuses anyone else as `not_admitted`
    before anything is reserved.
  - The companion's settings name the owner. Startup and `/ready` require the payer to be enrolled for exactly that
    owner, so a missing or mismatched owner never starts, and nothing is enrolled implicitly.
  - The turn and retry routes answer only the server-verified owner. Anyone else is refused before anything is kept,
    as where no companion runs.
  - The one-unresolved-call hold, payer-first transitions and operator-only reconciliation are unchanged. The owner's
    own erasure still holds its unknown usage.

**Checks** (private PostgreSQL 17.11, en_US.UTF-8).
- **The four Personal suites: 77/77.** The two new cases cover:
  - two API instances on one payer, where only the owner is answered and a stranger is refused, with nothing kept,
    reserved or sent, and cannot start an instance;
  - the note bound and the parser.
- **Earlier tests now enroll each payer for its test's owner.** The lock-order case uses two connections of the one
  owner, and a direct restricted-role reservation by a stranger is refused.
- **Mutation.** Without the owner check in reservation, three usage cases fail.
- **Not run:** a before run on `216859f4`. The new tests need the owner column; R's static traces are the before.
- The ordinary check, `test:sql`, `test:db` and the trusted-creator group are in B's handback.

## Next bounded action

B's private handback goes to P; R reviews this repair. No push.

## FND-B-PERSONAL-EPOCH-AND-AVAILABILITY-FOCUSED-01 (#435 4304290365, 4304290370)

- `reserve_personal_companion` (0073, unapplied) now takes the owner's space first (`personal_hold`, the lock erasure
  takes), then the payer. An erasure is therefore wholly before a reservation (`not_current`) or after it; the order is
  space, then payer, and nothing takes the payer and then the space. An admission that already won keeps the existing
  abort, drain and uncertainty semantics.
- Availability and a new resume use the same predicate as send and retry, `companion.serves(actor)`. Anyone the
  companion does not answer live reads `unavailable`, and a resume under a new key gets only the replay path (503
  without a receipt). Rehearsal serves everyone, as before.
- Tests: in `personal-usage.db.test.ts`, "takes the space before the payer" uses two independent connections in both
  orders while a third connection holds the payer, and waits on locks observed in `pg_stat_activity`. In
  `personal-live.db.test.ts`, the owner/stranger case checks the stranger's `unavailable`, a 503 resume and no welcome.
  Both fail on 2b0c7718's SQL and route and pass after.
- These lock-observing DB tests need a superuser server (as CI's), because a non-superuser owner cannot see others'
  lock waits.

## FND-B-PERSONAL-MINIMAL-COMMON-AND-CAUSAL-NEGATIVE-01

- The minimal accepted common union from attention: the reply-child rejection-observer test (`e584a6c6`); the
  conversation client's `protectedRead` 403 status before the body (`527d3b62`); and the list and transcript
  query-function fence with its semantic browser cases (`586327ce`). Each carried file is blob-equal to the donor;
  their Personal bases equalled the donor's. Readiness gains only the `goal_retirements` predicate (0075 is already
  here), and `readiness.db.test.ts` its 0075 step. Personal's `companionReady` and the health route are unchanged.
- `personal-usage.db.test.ts` settles every statement it sends, in lock order, before ending a connection. With the
  real fence removed, the case now fails with its own assertion ("the erasure waits for the admission holding the
  space") instead of "Connection terminated".

## FND-B-PERSONAL-FIXTURE-AND-REAL-SERVED-JOURNEY-01

- `personal-live.db.test.ts` gains the composed erasure-first case, run on the two-API restricted-role harness with
  the loopback double. The companion alone gets a pool on the restricted role whose reservation statement waits at a
  gate. `connect` keeps both of its forms, because pg-pool's own `query()` acquires with `connect(callback)`; the earlier
  adapter dropped that callback and hung. The owner's turn is kept and its call registered; the erasure commits, seen
  by the epoch moving in the database before the gate opens; then every reservation attempt answers `not_current`.
  Nothing is reserved, the provider is asked nothing, nothing of the erased words comes back, and the old epoch's
  resume is refused (409) with no new turn.

## FND-B-PERSONAL-SERVED-STARTUP-BINDING-01

- `personal-live.db.test.ts`, after an erasure, on the second API: the old request key gets 409 `request_erased`
  under the old epoch and the same under the new one; a retry of the erased turn gets 422 `not_found`. None brings
  back the erased words, keeps a turn, reserves or asks the provider.
- `apps/api/scripts/personal-served.ts` is the served Personal startup, selected in `playwright.served.config.ts` only
  by `SOPHIA_SERVED_PERSONAL=1` (the C1 served path is unchanged). It starts the loopback double first, then enrolls
  one ephemeral payer for Luis through the disposable database's owner connection, then the real API on its
  restricted role with the live companion and a fake key held in the process. That binding works: the double, the API
  and Vite start, health passes, and both dev identities load the App.
- `e2e-served/personal-served.spec.ts` (the normal journey) did not complete. On `/personal` the headless Chromium
  renderer crashes for Luis and for Davide alike, after WebGL "GPU stall due to ReadPixels" warnings, before the
  journey can type. Root cause (headless WebGL environment or a product render) not established; the journey is unrun.

## FND-B-PERSONAL-FIXTURE-GL-FOCUSED-CORRECTION-01

- R-PERSONAL-AD7-WITNESS-01: the erasure-first case reads exactly one epoch row as a nonnegative integer. It requires
  the epoch to move from before to exactly before + 1 while the reservation is held; it records both numbers (0, 1).
  The whole owned operation is under one `finally` that always opens the gate and joins the erasure, within bounds.
- R-PERSONAL-AD7-POOL-02: the same pooled pg client is wrapped once (a WeakSet), and each reservation statement is
  recorded once, with its ordinal. The case sees exactly one statement, answering `not_current`; the earlier two
  identical strings came from double wrapping, not two runner attempts. A fixture case shows that missing, null,
  malformed, doubled and unchanged epochs fail the witness, and that a reused client records one entry per statement.
- The served `/personal` crash: `SOPHIA_SERVED_GL=swiftshader` (Chromium `--use-angle=swiftshader`) crashes at the same
  point as default headless. The browser log names the cause: the browser terminates the renderer for a bad IPC
  message, "No binder found for interface media.mojom.OnDeviceSpeechRecognition", in Playwright's
  chrome-headless-shell, when the composer's dictation probes on-device speech recognition. The normal journey stays
  unrun under this headless build.

## FND-B-PERSONAL-SETTLEMENT-AND-NORMAL-UI-FOCUSED-01

- R-PERSONAL-AD7-WITNESS-01 (bounded failure settlement): `within` clears its timer. The erasure-first lifecycle is one
  owned function, `erasureFirst`: the gate always opens; the erasure, or else the turn's own reply, is joined within a
  bound; a drain timeout is reported as the failure it is (never swallowed or awaited again unbounded); witness reads
  are bounded. A composed control injects a never-answering witness read: it fails within its bound with the gate open
  and the turn's work joined.
- R-PERSONAL4AB-SERVED-SCOPE-01: with `SOPHIA_SERVED_BROWSER=chromium` (Playwright's full Chromium 1243, 153.0.8010.12,
  in its new headless mode), `/personal` no longer crashes. The normal journey covers ask, answer and refresh; a real
  provider refusal (the double's 503), where the payer is held and Ask again stays failed; then a SYNTHETIC FIXTURE
  operator settlement at 0 through the disposable owner connection (the double's refusal produced no stream and no
  usage); then Ask again answers. Delete everything with the confirm word gets 202, and after a refresh nothing is left.
  Another dev identity sees only its own space. chrome-headless-shell still crashes (no OnDeviceSpeechRecognition binder).
