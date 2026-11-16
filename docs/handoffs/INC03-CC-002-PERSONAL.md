# Implementation-session handoff — INC03-CC-002 P1 (Personal held inputs)

Assignment SHA-256 `2f8cc765a87b14c45e3a18185811af02851c079e6a56a25a475a510eaea43ca3`; proposal study
`8396d88cfeafed66014c13a7e24341c716845e7b6c0f66fbff91c159dd9f3303` (PERS-P01..P04); preflight `fae03d43…`.

| Field | Value |
|---|---|
| Native session | Claude Code `session_01FGXfrGsUA6jNm3sxRoSro2` (same observer/S01 author) |
| Base | a separate worktree, branch `inc03-cc-002-p1-personal-dev`, at S01b DEV `37b1f47de1417565f206327a580037b4513876d3` (tree `46c34f97`) |
| Prefix | native repair4 `a528ab84` and API `409d4f75` are held and unaccepted; nothing here accepts them |
| Ending commit | one signed local DEV child of `37b1f47d`; identity in the export manifest |
| Lease | migration `0098` (root-assigned) and seven new files: the plan `docs/plans/personal-inputs.md`, this handoff, `db/migrations/0098_personal_inputs.sql`, `db/tests/0098_personal_inputs.sql`, `packages/persistence/src/personal-inputs.ts`, `personal-inputs.db.test.ts`, `personal-legacy.db.test.ts` |
| Not changed | every existing file: A10, A49, the shared generated outputs, routes, `server.ts`, the companion, the package index, the Studio |

## P2 r1 — bounded causal-race tests (PERS-P2-F01)

Assignment SHA-256 `06cf7dc75ba94e3c8971965e9d462d74ddfc8879fce7cc26aa8b501400a9ee77`; owned-24 study
`f658302f40170ee68ec8fdc9d3e082eb253e2e23ecbf4f037e9da894243bb8b9` (one P2: test cleanup and sentinel correctness, no
production retention or privacy failure).

| Field | Value |
|---|---|
| Base | separate worktree, branch `inc03-cc-002-p2r1-dev`, at exact P2 DEV `4d90427ae97f555aa48a65c943d5882b0cfeaf19` (tree `ad85b8ff`); one signed local DEV child, identity in the export manifest |
| Changed | four paths only: `packages/persistence/src/personal-inputs.db.test.ts`, `packages/persistence/src/personal.db.test.ts`, the plan and this handoff |
| Unchanged | every production, SQL, API, contract, amendment, generated, UI, fixture, spec and CONTRIBUTING byte (exactly `4d90427a`); A52, 0099 and the generator stay frozen; no new file in the repository |
| Database | a fresh disposable PG16 cluster of this session on 127.0.0.1:55496 (the R24 check ran on 55495 at the same time and was not touched) |

### Outcome

A test-local `race()` runs each causal race, with these guarantees:
- every release gate opens in `finally`, and every operation drains within a bound;
- `within` puts an asserted bound on every announcement, observation, commit and the drain;
- `announced` fails at once with an assertion naming the boundary when its transaction ends without announcing;
- `observed` turns a failed lock-observation query into an assertion naming it;
- the body's own failure is the one reported.

`endWithin` ends the pools within the bound, then drops the database. If a pool cannot end, it drops the database all
the same and fails saying so. A probe showed that a pool with a never-released client does not end even after its
backend is gone, so `endWithin` does not wait for it.

The same rule applies to the four new races and to the two older sibling races in `personal.db.test.ts` (a retry
racing its first attempt, a claim waiting on a retry). The older `untilSomeoneWaits` now fails with an assertion. Real
named-lock and PID observation stays, with no sleep replacing an observation and no global timeout. The older claim
test's existing 300 ms hold is kept as it was.

Seven lifecycle self-tests were added, on actual PG:
- an observation failure in a race releases and drains its held transaction (in both files);
- a setup failure is an assertion naming its boundary at once (both files);
- `within` rejects at its bound, checked against an independent timer (both files);
- `observed` reports a failed observation as an assertion (both files);
- `endWithin` ends the run, dropping the database, with an assertion when a pool cannot end (both files).

The files moved from 63 to 72 tests (counting both files together).

### Evidence (synthetic data only)

- **Ordinary runs** of both files on the final bytes: 72 of 72, 0 cancelled.
- **Fault harness** (external, scratch, not committed). A Node `--import` preload changes only one of three things:
  the observer query (to report no lock, or to fail), or one exact setup statement. Production functions and SQL are
  untouched. Each scenario runs one named test in a child with a 60 s outer deadline, then lists the cluster's
  leftover databases, logins and backends. Scenarios:
  - A1, A2, A3: the held-write and erasure race in no-lock, rejection and setup modes;
  - B1, B2: held words during a claimed welcome, no-lock and rejection;
  - B3b: an erasure during a claimed welcome, setup;
  - B4: the sibling retry race, no-lock;
  - B5b: the sibling claim race, setup.

  On the final bytes all 8 end in an ordinary `AssertionError` naming the boundary: 1 test, 1 fail, 0 cancelled, with
  a terminal summary, no kill, in 1.8 to 10.0 s, and nothing left.

  On exact `4d90427a` test bytes, run read-only in the frozen P2 worktree:
  - A1, A2, B1, B2 and B4 hang until the 60 s deadline kill, with no terminal summary, each leaving a test database and
    its 3 logins (recorded, then dropped).
  - A3, B3b and B5b end quickly, but with a raw `DomainError`, not an assertion naming the boundary.
- **Mutants:** six, each applied to both helper copies at once, each caught by in-repo assertions, 0 cancelled,
  restored byte-identical:
  - the gate release taken out of `finally` (4 fail, including both files' `after()`);
  - `within` never rejecting (4);
  - `announced` not racing its operation (2);
  - the pool end unbounded (2);
  - observer errors rethrown raw (2; harness A2 and B2 also show the raw error);
  - the drain skipped (2).
- **Disclosed attempts:**
  - My first setup-fault targets for B3 and B5 matched the function names inside migration text in `before()`. That
    failed the fixture and cancelled the file's tests, which is a harness error, kept and rerun as B3b and B5b with the
    exact call statements.
  - The first round of mutants left "observer errors raw" caught only by the harness. I added the in-repo `observed`
    self-test and reran the fault scenarios and all six mutants on the final bytes. Round 1 is kept.
- **Not rerun:** the 2233 Studio tests, the 188 browser tests and the contracts (their bytes are unchanged), and no
  DEV full `pnpm check`, by assignment.

## P2 — compatible recorded readers and the default-off route (A52, 0099)

Assignment SHA-256 `21e9446eeee6cb17411af0be49f783b9007f1f855af0218aa1972bad88c1808c`; proposal study
`e5910a1cdbf7cc462306018e09ac37cab8470118d3f97534858da22991f6e1f4` (P2-P01: an additive migration is needed); my
proposal `05099a39…`. The designer's fixture note `f55965fb…8167` is advisory.

| Field | Value |
|---|---|
| Base | separate worktree, branch `inc03-cc-002-p2-personal-dev`, at exact P1 DEV `8775d925911d6c1a36ce890417190e50fe25a26d` (tree `8d3cc854`); one signed local DEV child, identity in the export manifest |
| Lease | 26 paths at most. 24 are changed. `validators.d.ts` was regenerated byte-identical. `apps/studio/src/api/personal.test.ts` exists, so it was not edited. No other path changed. |
| Shared outputs | A52 and its regeneration: `openapi.json`, `generated-types.ts` and `validators.js` changed; `validators.d.ts`, runtime-wire and specialists are byte-identical. No A51 on this base: a later coherent composition must regenerate with every accepted amendment. |
| Not changed | `routes/personal.ts`, `server.ts`, the companion, CSS, the composer, PR501-owned files (DataSheet, copy, notice-view, fixture-api, room), PR499, 0021 and 0098 |
| Interruption | P2 paused at checkpoint A (fixture crash open) while R23 ran in its own worktree, then resumed |

### Outcome

- **Route.** `POST /api/v1/personal/inputs` (A52) takes the closed `{interactionContract: automatic_v1, text}`, the
  `Idempotency-Key` and the current epoch.
  - The owner is the verified actor only.
  - It calls 0098's writer and reads the exact turn through the owner's input row, in the same transaction.
  - The receipt is `PersonalInputRecorded {revision, turn, input{…, state recorded, effect none}}`.
  - It is mounted only with `AppDeps.personalInputs === true`; `server.ts` never sets it. With it off, the path is 404
    and nothing is written. Turned off again, the kept turns are still read.
  - There is no companion dependency, wake, claim, reservation, outbox, notification or work. `PersonalReceipt` and the
    legacy `/turns` are unchanged.
- **Readers.** A10's `PersonalTurn.reply` gains `recorded`, through one schema for the space, page, earlier and
  export. `TurnRow` follows. The canonical generated parsers accept it, and DataSheet's unchanged
  `exportPersonalSpace` plus `exportText` copy the words.
- **Held words are not context** (the root's conservative policy):
  - HISTORY and the welcome's context exclude held person turns before their limit.
  - TypeScript `WELCOME_DUE` and SQL `personal_welcome_due()` (0099, used by both begin and record) choose the last
    activity without them.
  - An empty or held-only space has no welcome due.
  - 0099 replaces only that function; owner, security, search path and grants are kept.
- **Metadata read.** `readPersonalInputs(c, {before, limit})`: owner-only, cursor by the turn's `seq` (unique per
  owner), limit 1 to 100, a closed typed projection with no words.
- **Studio.** A held turn shows the person's words, then "Kept — not asked yet" in the existing quiet status line.
  There is no spinner, Ask again, arrival or answer of hers, and nothing to press. `welcomeDue` follows 0099.

### Evidence (synthetic data only; disposable PG16; Node 24.21.0 and pnpm 11.7.0; own frozen offline install)

Focused checks on the final working tree before commit; the post-commit reruns are in the export manifest.
- Format, lint, typecheck and `contracts:check` exit 0. `test:sql`: 98 migrations, 11 test files pass.
- Database suites, 157 of 157 pass, 0 cancelled: persistence `personal-inputs` and `personal`; API `personal-inputs`,
  `personal`, `personal-live`, `readiness` and `conversation-inputs`.
- Studio unit tests 2233 of 2233. Playwright: the new `personal-recorded` passes 4 of 4 (desktop and `@phone`), and all
  Personal specs pass 188 of 188.
- **Fail-before** on exact `8775d925`, final test bytes, scratch worktree:
  - the 0099 SQL test fails;
  - persistence `personal`: 6 of 42 fail on assertions. The seventh new test, a failed legacy retry, is a control;
  - API `personal-inputs`: 10 of 11 fail on assertions. The off-by-default test is a control;
  - Studio `data-view`: 2 of 3 fail, because the old parser refuses the whole page;
  - Studio view, with a fail-before-only local stand-in for the missing wording export: 3 of 37 fail on assertions;
  - e2e: 4 of 4 fail on assertions, because the page can't be parsed;
  - persistence `personal-inputs` and the Studio view file as written can't load on `8775` (their new exports don't
    exist). That is the honest result, not an assertion count.
- **Mutants:** ten, each alone, each killed on assertions, 0 cancelled, restored byte-identical, worktree identical
  before and after:
  - 0099 without the exclusion: the SQL test, plus persistence 4;
  - HISTORY including held words: 1;
  - welcome context including them: 2;
  - `WELCOME_DUE` counting them: 2;
  - a timestamp cursor: 1;
  - an unbounded limit: 1;
  - the route on by default: 2;
  - a receipt turn that is not the exact one: persistence 1, API 8;
  - no Studio recorded row: view 2, e2e 2;
  - Studio `welcomeDue` counting held turns: 1.
- **Races** use named lock waits, not sleeps. A second backend PID is observed waiting on a lock before the deadline,
  for:
  - an erasure racing a held write, in both orders (replacing P1's sleep-based test);
  - held words written while a welcome is claimed;
  - an erasure while a welcome is claimed.

### Fixture crash (disclosed)

The first recorded fixture crashed the headless renderer in all four e2e tests, with no page error.
- **Bisection** (checkpoint A) narrowed it to the module's top level.
- **Discriminator:** the designer's note named a source hypothesis. One spec-only line that sets `SpeechRecognition`
  to undefined, run on one desktop case with no retries, removed the crash. The spec was restored byte-identical
  afterwards.
- **Cause:** the composer's dictation asks the browser's speech recognizer at mount, and the headless shell ends the
  renderer when asked (`fixtures/app.tsx` already says so).
- **Fix:** fixture-only, the same line in `fixtures/personal-recorded.tsx`. Product code is unchanged, and the original
  crash logs are kept.
- **A test error of mine, found by the same run:** her introduction leads a conversation begun today and is not a turn.
  The spec counts her turns (`[data-turn]`), not every Sophia line.

### Limits and remaining

- Not pushed, not published and not on an accepted parent. A later coherent composition (native, API, S01b, resource
  A51, P1, P2) must regenerate with all accepted amendments and run the full ordinary `pnpm check`. No standalone full
  DEV check ran, by assignment.
- **Not done:** no composer or producer, no activation, no `/ready` requirement for the flag, no admission (S02/S03),
  and no UI materiality decision. The new UI is reviewed on this candidate.
- Studio validators strip unknown properties rather than refuse them (existing behaviour); the data-view test's
  control uses an out-of-enum reply instead.

## P1 — Outcome

`sophia.send_personal_input(key, contract, epoch, text)` keeps a Personal message once, as a person turn whose reply
is the new state `recorded`, with a metadata-only `personal_inputs` row. Nothing asks for a reply. How each correction
from the proposal study is met:

- **PERS-P01:** the epoch is required, and the writer fences to it itself, in its own transaction, before the key. The
  contract is required and exact. The owner comes only from the actor.
- **PERS-P03:** a composite owner FK with cascade, per-owner uniqueness, owner-only RLS, one granted writer, an internal
  append with no grant, and a fixed search path.
- **PERS-P04:** truthful tests of claim, reply, retry and the runner, described below.
- **PERS-P02:** the slice is **not** invisible. The current reads, the export and the companion history include the
  recorded turn; the plan's "Integration" names what must be decided before exposure.

## Evidence

All runs on a disposable local PostgreSQL 16.15, with Node 24.21.0, pnpm 11.7.0 and this worktree's own frozen offline
install (`node_modules` a real directory).

- **`personal-inputs.db.test.ts`, 16 tests:**
  - the body is kept once; the metadata keys and the receipt are exact;
  - an exact retry after later turns returns the same receipt;
  - another person and a project admin read nothing;
  - other words, or legacy↔automatic under one key in either order, conflict (23505);
  - NULL, empty or other contracts are refused in SQL (22023) and by the caller;
  - concurrent same-key requests give one turn, and different words give one write and one 23505;
  - another epoch is refused (40001);
  - erasure cascades the turn and input; an old key is refused (40001), a new key with an old epoch is refused
    (40001), and a new key with the current epoch writes;
  - erasure races in both orders leave nothing behind;
  - `next_personal_reply` is null and `claim_personal_reply` null for a recorded turn, `record_personal_reply` writes
    nothing, and retry is refused (40001);
  - a real `CompanionRunner` with a stub makes zero calls for a recorded turn alone. Beside a pending legacy turn, only
    the legacy turn is asked and answered, and the recorded turn stays `recorded`;
  - characterization: reads, poll and export list `recorded`, the companion history includes the recorded words, and
    needs are unchanged;
  - grants: the API cannot write the table or call the internal append; the worker and assembler can neither call the
    writer nor read the table; PUBLIC executes neither new function.
- **`personal-legacy.db.test.ts`:** the legacy flow (send, claim, answer, fail, retry, replay, conflict, erasure
  tombstones) and the definitions, ACLs, settings and security mode of 19 legacy Personal functions are identical on a
  database without 0098 and one with it. Only the reply CHECK widens, by `recorded`.
- **`db/tests/0098_personal_inputs.sql`** passes with every earlier SQL test (`node scripts/db-test.ts`).
- Fail-before, mutants, the focused regressions and lint, typecheck and `contracts:check` are listed in the export
  manifest with their logs.

## Decisions and disclosed limits

- The writer calls `personal_fence` itself, so a caller cannot forget the fence. The legacy route's separate fence call
  stays as it is.
- The operation is `send_input`, not `send_turn`, so a legacy key and an automatic key never replay each other; both
  share one namespace.
- `asked_at` is the retention time, as described in the plan.
- **Exposure is not solved here:** A10, the read type, the Studio, companion context, and the CONTRIBUTING rule "never
  store a message nobody will answer" are dependencies for the owners (plan, "Integration").
- The CompanionRunner test imports `apps/api/src/companion.ts` from the persistence package's test, by relative path,
  because the runner is the API's. No package dependency or export was added.
- One run could not reach the disposable cluster (it was not running); it is logged as an environment attempt, and the
  cluster was restarted.

## Remaining obligations

- Not pushed or published, and not on an accepted parent. A coherent retarget onto accepted native, API (`9587`), S01b
  and resource-producer parents is needed before publication, with the full ordinary `pnpm check` there.
- The release-trust hold is unchanged: nothing here migrates, configures or deploys anything real.

## Next bounded action

The same independent bounded study of these seven paths. Then, under root leases: the integration decisions above and
an HTTP producer.

## Current annotation (INC01 coherent composition)

The P2 r1 entry above was accepted as written. Two precisions from its independent study (P2r1-N01), recorded here
without editing it:

- **Lifecycle tests.** The final delta adds nine test functions (four in `personal-inputs.db.test.ts`, five in
  `personal.db.test.ts`; setup and `within` share one inputs case), which matches the 63 → 72 total. "Seven" describes
  the round before the observed self-tests.
- **Round 1 mutants.** Round 1's raw output was overwritten; only its summary remains, including the PM5 survivor
  before the final self-test. No raw output from that round is retained or claimed.
