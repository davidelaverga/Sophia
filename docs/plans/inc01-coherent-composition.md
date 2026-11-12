# INC01 coherent composition (INC01-COHERENT-WRITE-002): plan

This plan was written before any other edit in this worktree. It composes the accepted owned slices onto the published
native parent as **one signed development commit**. It publishes nothing and activates nothing.

## Identities

- **Parent.** `45564a5a8cc1644b13c17739a40a4723892d33f1`, tree `ea62bdd08f71f84a1bb22835c9caf9ae4623a8fe` (Native14 r1),
  sole parent `f615b602…`. This is the published native head; its source PRE-PUSH was accepted.
  - Its current automatic review, the 15th introduced-commit completion and the source FINAL are pending. Nothing here
    claims them.
  - Since `f615` it changed only `scripts/owner-host.ts`, `tests/unit/owner-host-cli.test.mjs` (new),
    `docs/plans/owner-host-transport.md` and `docs/handoffs/INC01-CC-003.md`.
- **Assignment and reference.**
  - Assignment `0f6d2c6a9f700f1277f21e3f0a13dd8ee5ab4a56f0c81d3dbc62f01c572d4fe8`.
  - Reference archive `bd04c3231ef498d75220746e8df4325a79b75da3d7aaa8ea5cd4f76ef77421dc`, with INVENTORY `b65e51c5…`
    and ROOT_DECISIONS `1c79ff75…`.
  - The earlier v2 plan and the v3 addendum (`6c1ccb03…`) are the planning basis. ROOT_DECISIONS takes precedence where
    they differ.
- **Donor slices.** Each is copied as its owned paths only, never as an inherited tree or a cherry-pick.

| Slice | Head | Immediate parent | Merge-base with `45564` |
|---|---|---|---|
| UI | `f4240d71…` | `18a7320b…` | `953e5dc3…` |
| memberRead | `134eaf20…` | `f4240d71…` (owned-slice start) | `953e5dc3…` (root linkage) |
| API | `9587bd72…` | `409d4f75…` | `33c020af…` |
| custody | `7559e7af…` | `c626549e…` | `33c020af…` |
| S01 | `37b1f47d…` | `a528ab84…` | `a528ab84…` |
| resource | `b98603b9…` | `13c9096e…` (owned-slice start, not held here) | `a528ab84…` |
| P1 | `8775d925…` | `37b1f47d…` | `a528ab84…` |
| P2r1 | `858f957c…` | `4d90427a…` | `a528ab84…` |
| S2 | `9c2c93cc…` | `f15dad08…` | `f15dad08…` |

  Full values are in the composition handoff's proof table.

## The 195 owned paths

| Class | Rows | Rule |
|---|---|---|
| KEEP | 93 | Byte-exact `45564`, including the new `tests/unit/owner-host-cli.test.mjs` |
| KEEP + annotation | 2 | `CONTRACT_MAP.md` and the programme progress ledger: one truthful composition row each, annotation-only diff |
| Mechanical copy | 30 | Exact donor blob. The merge-base blob equals the `45564` blob (verified with full SHA-256) |
| Proven copy | 2 | `packages/domain/src/errors.ts` and `packages/persistence/src/errors.ts`, taken from API. Each is `45564`'s bytes plus 0094-only lines (diff-verified) |
| Absent → add | 57 | Exact donor blob; the path does not exist in `45564` |
| Copy + annotation | 3 | P2r1 `INC03-CC-002-PERSONAL.md` (Personal N01 note); S01 `routes/conversation-inputs.ts` (one comment line); S01 `docs/plans/conversation-inputs.md` (appended note) |
| Join | 5 | `apps/api/src/app.ts`, `packages/persistence/src/index.ts`, `docs/SOURCE_MAP.md`, and the two S2 docs |
| Generated | 3 | `openapi.json`, `generated-types.ts`, `generated/validators.js`; plus `validators.d.ts` only if the generator changes it |

**Precedence.**

- custody over API for `scripts/register-contribution-runtime.ts`, `docs/plans/api-contributions.md` and
  `docs/handoffs/INC01-CC-004.md` (custody is a byte-prefix extension of API);
- P2r1 over P1 for 4 shared paths;
- P1-only: 0098, its SQL test and `personal-legacy.db.test.ts`;
- UI, then memberRead.

**Scope.** 195 + up to 4 new paths (this plan, `docs/handoffs/INC01-COHERENT-001.md`,
`apps/api/src/inc01-coherent.db.test.ts`, `packages/persistence/src/inc01-coherent.db.test.ts`) + `validators.d.ts` if
it changes: at most 200. The parent diff is at most 107 paths. Any other path is a STOP.

## Joins

- **`app.ts`.** Every donor's base equals `45564` (`a88fd5bf…`). Merge resource `bc4566a7…` with P2r1 `9d93d37b…` over
  S01 `5494f63f…`. The expected result is `45564` plus:
  - API: the `apiContributions?` flag, import and mount;
  - S01: `conversationInputs?`, `inputsOn` (throws without `conversations`), `registerConversationWrites`,
    `Health.conversationInputs` and its readiness part;
  - resource: `registerNativeRunner`, which mounts the member catalog read beside runner operations. There is no flag,
    and it is independent of `ownerRunnerAdmissions`;
  - P2r1: the `personalInputs?` flag, import and mount.

  The bearer-success refusal and the `runner-operations.ts` 0096 readiness stay byte-exact. `server.ts` is untouched.
- **`persistence/src/index.ts`.** `45564` plus four additive export blocks (API, S01, resource, P2r1); nothing replaced.
- **S2 docs (v3).** Prove `donor == f15 base ‖ D_S2` byte-exactly, with the end-of-file deltas `c9997709…` (plan) and
  `5fe2f810…` (handoff). The result is the exact `45564` document, then `D_S2`, then a current provenance note. The proof
  is that the `45564` bytes form an exact prefix and the diff contains only end-of-file additions.
  - **STOP** on deleted prerequisite lines, a heading or anchor collision, or an altered quoted dependency.
- **SOURCE_MAP.** A three-way merge with base `f15`, ours `45564` and theirs S2.
  - The clean §2k replacement is kept.
  - The one insertion conflict with an empty base resolves as: the native §2n "Pagination sources" subsection first,
    then S2's §2o, then the provenance note.
  - Every native row is kept. The patch `295a7da1…d554` is carried byte-exact.
- **The provenance note** (all three S2 paths) states:
  - the original startup diagnostic was the independent reviewer's, routed by root;
  - the later external Mac patch, build and probe were root's: artifact `89fdba95…cf8`, profile `5db1`, pin
    `ade47301`;
  - an initial 503, then a fake anonymous MCP 401 and cleanup, which is not tool, native or profile qualification;
  - M3: four caught and one survivor, not shown equivalent.

  Earlier notes and receipts stay as they were.
- **Personal N01 note:** 9 added lifecycle test functions (4 + 5), 63 → 72 in total. Round 1's raw output was
  overwritten; only its summary, including the PM5 survivor, remains.
- **S01 note:** `server.ts` wires `conversations` from `SOPHIA_CONVERSATIONS` and never sets `conversationInputs`.

## Generation (the only generator writer)

- **Amendment set.** The sorted existing amendments: 46 from `45564` plus A48 `7335bb3e…`, A49 `cb37e6b0…`, A51
  `0a5fc40a…` and A52 `3c2a7ddf…`, giving 50. A19 and A20 do not exist.
- **Command.** `pnpm --filter @sophia/contracts generate` once, then `generate:check`. Every attempt is kept.
- **No order-independence claim.** A50 adds properties under schemas that A47 creates.
- **Invariant.** Every `45564` OpenAPI path and schema is unchanged except the four amendments' operations. The one
  existing-schema extension is A52's `PersonalTurn.reply` enum gaining `recorded`, with prior values kept.
  Runtime-wire, specialist and unrelated generated files stay byte-exact.

## Crossings proven on a disposable PostgreSQL 16 (migrations 0001–0099, real API, worker and assembler grants)

- **Erasure against a contribution-funded research task.** These are the contracts as written:
  - 0096 `mission_erase_source` redacts the source, then calls `research_revoke_source`, `design_revoke_source` and
    `owner_runner_source_withdrawn`.
  - A consuming research job's attempt is revoked and the job failed. Each unsent created binding settles; otherwise
    one stop command is issued and the binding goes to `stopping`.
  - Under 0094, existing reservations stay accounted (no release by erasure). A possible output that read the source is
    withheld at publication.
- **The 0097 member read over rows that 0096 changed**, under UTC and pathological times.
- **0098/0099 Personal held context and erasure, against 0095 conversation erasure:** the two stores stay independent.
- **Role privileges** of the new functions and tables, for the API, worker and assembler.
- **HTTP feature matrix (actual rules):**
  - the contribution, automatic-conversation and Personal writers are off by default, and off means 404 with no write;
  - `conversationInputs` without `conversations` throws when the app is built;
  - native admissions `off` keeps reads, controls and settlement and refuses new admission;
  - the resource member read is mounted under `off` and `admit`;
  - readiness is per feature;
  - serializers agree with the generated validators: A48 UUIDs, A49, A51, and A52 including `recorded`.

## Checks

1. Own Node 24.21.0 / pnpm 11.7.0 frozen install, and own disposable PostgreSQL.
2. Static checks: format, lint, build, typecheck, contracts, discovery, artifacts.
3. SQL tests 0001–0099.
4. Focused existing suites that cross shared code, plus the two new combined tests.
5. Studio resources, work and Personal browser checks on desktop and narrow, on fixtures (simulated, not
   qualification).
6. One signed development commit, an early checkpoint, then one ordinary `pnpm check` on that commit, then the sealed
   final raw evidence.

**Not done here:** no push, merge, deploy, config, credentials, producer activation, Studio READ, `server.ts` change,
real native or provider effect, or INC02.

## WRITE-003: rebuilt contributed research keeps its funding binding (CW2-REBUILD-F01, P1)

Written before the functional edits. The independent finding `40acb2e0…` (confirmed P1) and the assignment `521491af…`
govern it. The STOP snapshot `f21b4161…` (104 paths) is the functional baseline. Its earlier results stay as scoped
history: 99 migrations and 12 SQL files passed, and the combined test passed 4/4, after one field-name attempt and one
probe harness error.

### Cause, in the actual source

Source withdrawal or erasure (`withdraw_contribution` or `correct_contribution` → `contribution_erase`, or mission
erasure) → `mission_erase_source` (0096) → `research_revoke_source` (0028) → `research_rebuild` (0033, never replaced).

- `research_rebuild` copies the old binding's `resource_id` and `runtime_unit_id`, and the task's `allowance_id`,
  `root_job_id` and `actor_id`, into a new job, attempt, binding and command. It never writes
  `api_contribution_tasks` for the new job.
- Every 0094 consumer then reads "no row" as "not contributed":
  - `contribution_delivery_ineligible` (dispatch);
  - `contribution_model_reserve` (new paid calls: grant, credential, member and route checks, and the task, grant and
    account caps);
  - `contribution_link_reservation` (the ledger);
  - `contribution_withhold` (publication);
  - `research_task_funding` (the funding read).
- Meanwhile `reserve_research` still sees the allowance as contributed (`contribution_allowance`), so the project
  grant does not bound the call either.

### Repair: append-only `0100_api_contribution_rebuild_funding.sql` (no edit to 0001–0099)

1. **Bind at the producer.** `research_rebuild` is replaced with the 0033 body unchanged, plus one call after the new
   `research_tasks` row: `contribution_rebuild_bind(project, old job, new job)`.
   - When the old job has an `api_contribution_tasks` row, it inserts the new job's row with the old row's frozen
     provenance, unchanged: the same `allowance_id`, `grant_id`, `grant_revision`, `connection_id`,
     `credential_revision`, `account_id`, `owner_id`, `requester_id`, `resource_id` and requested
     route/model/effort.
   - No current pin, grant, account or runtime is selected, and no revision is rebased.
   - A project-funded old job (no row) binds nothing and stays project-funded.
   - The insert is idempotent on the new job's key, and the rebuild itself stays once-only (`rebuild:<job>` command).
2. **Authority is not decided inside the erasure transaction.** The bind reads only the old row, which the project lock
   the caller already holds guards. It raises nothing for authority reasons, so source erasure, the old job's
   revocation, its one Stop and cleanup always commit.
3. **New work meets the existing 0094 gates, under their own locks and wall-clock checks:**
   - **at dispatch,** `contribution_delivery_ineligible` checks the frozen grant revision, grant state and expiry,
     requester and owner membership, the connection's credential revision, the current runtime and the route
     qualification. The create is denied, never sent, with a truthful reason;
   - **at each paid call,** `contribution_model_reserve` locks the members, the grant (FOR SHARE), the connection and
     the account (FOR UPDATE), checks again at the wall clock, and enforces the task cap per `allowance_id`.

   The allowance is shared, so the task cap is cumulative across the old and new attempts, as are the grant and
   account totals. The old reserved or uncertain commitments stay counted: no release, refund, resend or reset.
4. **Fail closed for orphans that already exist** (rebuilt before 0100). `contribution_lineage_unbound(project, job)`
   is true when a research job has no row but its allowance belongs to a contributed task. 0100 replaces four 0094
   functions, keeping their bodies and adding only this guard:
   - `contribution_delivery_ineligible` denies the delivery ("its contributed lineage has no funding binding");
   - `contribution_model_reserve` refuses with `Contribution unavailable: lineage_unbound` (55000);
   - `contribution_withhold` withholds publication with the same reason;
   - `research_task_funding` refuses (`lineage_unbound`) instead of claiming `project`.

   Nothing is backfilled, guessed or relinked to existing charges. Genuine project-funded lineages, whose allowance
   no contributed task holds, are unaffected.
5. **Grants.** The new helpers are definers with a fixed `search_path` and no PUBLIC or application-role execute.
   Replaced functions keep their ACLs (`CREATE OR REPLACE`).
6. **A missing 0100 is not served.** With `apiContributions` on, `/ready` additionally requires 0100's helper
   (`app.ts`, a per-feature readiness part). The route file and its per-request 0094 check are not leased and are
   unchanged. The migration is one transaction, so it cannot be half-installed. Writers stay off by default; native
   reads, controls and settlement are unaffected.

### Tests

- **`db/tests/0100_…`:** definer, `search_path` and ACL facts; the guard logic on owner fixtures.
- **`packages/persistence/src/inc01-coherent.db.test.ts`.** The finding becomes real assertions on actual API and
  worker paths (dispatch, poll, delivered, reserve, funding):
  - the original's revocation, one Stop, the source deleted and the reservation kept;
  - the rebuilt row's frozen provenance;
  - contribution accounting of the rebuilt call;
  - cumulative task, grant and account caps across the lineage;
  - the paused, revision, member and credential barriers at dispatch and reservation;
  - erasure succeeding while continuation is blocked;
  - existing-orphan fences (an owner fixture deletes the rebuilt row to stand in for pre-0100 state);
  - reservation replay;
  - a genuine project-funded positive;
  - one bounded lock race.
- **`apps/api/src/inc01-coherent.db.test.ts`:** the flag matrix, serializers and readiness, including the 0100 part.
- **Fail-before** on the exact `f21` functional baseline, then new-class mutants (bind removed, each orphan guard
  removed) with failure types and exact restoration.
- **Scope ceiling.** 110 parent paths and 203 whole paths. Expected: 108 and 201 (0100 migration and test added;
  `research.ts`, `api-contributions.ts`, its test and `validators.d.ts` unchanged).

### WRITE-003 boundary note: new paid search and read on an unbound lineage (NEWPAID-BOUNDARY-001, `34f1767a…`)

Written before the change. Same cause and same fail-closed clause, not new scope.

- **Gap, in the actual source.** 0094's `runtime_research_reserve` calls `contribution_model_reserve` only for a new
  `model` call. `contribution_link_reservation` returns for every other kind. So 0100's `lineage_unbound` refusal
  fenced new model calls only. On an already-delivered contributed lineage without its binding, a new paid search or
  read was still reserved, on the project's account. The first B4 fixture relied on exactly that to capture a citation
  after orphaning.
- **Repair, in 0100 only.** `runtime_research_reserve` is replaced with its exact 0094 body plus one 0100 line. When
  no reservation exists for the key yet (`r.id IS NULL`), and after the task, grant and allowance locks the body
  already takes, a new non-model call on `contribution_lineage_unbound` refuses `lineage_unbound` before
  `reserve_research`. Model calls keep the `contribution_model_reserve` refusal.
- **Unchanged:**
  - A replay of an existing reservation returns it with the same identity, and nothing is newly reserved.
  - Settlement, release and `uncertain` reconciliation (`end_research_reservation`) are untouched.
  - A bound contributed search or read stays project-paid as in 0094.
  - Project-funded lineages are unchanged.
  - No other function, contract, API, UI or configuration changes.
- **Test.** The orphan case captures its cited source while the lineage is still bound, then removes the binding,
  then shows:
  - a new model call, search and read each refused, with no new reservation row;
  - the replay of the pre-orphan search and model call returning the same reservations;
  - a reserved call settling, and an `uncertain` one reconciling, with the ledger links kept;
  - publication withheld.

  The earlier B4 fixture is kept in the raw logs and classified as having depended on the gap. A new-class mutant
  removes the new line.

### WRITE-003 browser repair (BROWSER-REPAIR-001, `d2ebf735…`): fixture chronology and test synchronization

Written before the edits. The original episode stays failed: 366 passed and 5 failed at 13:28 UTC (raw kept). Only
three test paths are leased as functional exceptions:

- `apps/studio/fixtures/personal-recorded.tsx`
- `apps/studio/e2e/personal-recorded.spec.ts`
- `apps/studio/e2e/work.spec.ts`

No production UI, CSS, component, contract, generated, configuration or helper path changes.

- **Personal recorded: cause, shown on the exact bytes.** The fixture stamps its turns relative to noon today, while
  the page's welcome-back (`welcomeDue`) reads the browser's real clock. A scratch probe on the unchanged pages fixed
  only the page clock, desktop and phone:
  - real clock (13:54 UTC) and 12:22 each ask for `resume`;
  - noon and 12:20 ask for nothing.

  At 12:22 the last turn that asked her is 61 minutes old, and the held turns, 27 and 2 minutes old, are set aside, as
  0099 does.
- **Personal recorded: repair.** Each case fixes the page clock at noon today before navigation
  (`page.clock.setFixedTime`; timers still run). That is the moment the fixture's chronology describes. Every existing
  assertion stays. One case is added at the welcome boundary:
  - at 12:20 nothing is written;
  - at 12:22 exactly one `resume` is asked, which the fixture refuses.

  This keeps the held-turn exclusion under test. The fixture changes only its comment, which promised a determinism
  the page clock did not give.
- **Work UI-01: cause, shown on the exact bytes.** The deep case's board arrives by fetch after `load`. The spec reads
  the lane titles once (`allInnerTexts`, no retry). In a scratch probe mirroring the test (40 fresh contexts), 3
  immediate reads were `[]` while the board was present. Every settled read was the two expected titles.
- **Work UI-01: repair.** The two lane checks use the waiting `toHaveText([...], { useInnerText: true })` already used
  elsewhere in the file, with the same expected titles and order. There is no sleep, retry, skip or weakened assertion.
- **Reruns on the final bytes:**
  - Personal recorded on desktop and phone, at the real afternoon clock;
  - Work UI-01 on desktop, repeated. UI-01 has no `@phone` tag, so the phone project never selects it.

  Unrelated cases keep their original 366 passes with exact source identity. They are not restamped.

## WRITE-004: a rebuilt contributed task is held to its account's and grant's concurrency (CW3-REBUILD-CAPACITY-F01, P1)

Assignment `1970d278…`, finding `b2c8968a…` against `185146bb`. Written before the edits. `185146bb` (tree `1bc7af5e`)
and `dbfa8171` are preserved as refs and bundles outside this candidate's ancestry. The exact `185146bb` tree was staged
onto `45564a5a` (`reset --soft`; index tree equal to `1bc7af5e`) before any edit. Five paths may change:

- `db/migrations/0100_api_contribution_rebuild_funding.sql` and `db/tests/0100_…`;
- the persistence combined test;
- this plan;
- the handoff.

### Cause, in the actual source

- **Two slots.** `contribution_slots_held(account[, grant])` (0094) counts every bound task whose job is pending,
  running or `outcome_unknown`, or which still has a reserved or uncertain model reservation. A rebuilt task R
  (0100's copied binding) is pending. Its original O, revoked by the erasure, still holds its slot while its
  reservation is reserved or uncertain. That is two slots against a limit of 1.
- **Never tested.** Ordinary admission (`contribution_admission`) tests capacity under the account row lock. R never
  passes admission. Dispatch (`contribution_delivery_ineligible` through `runtime_unavailable` and
  `defer_native_delivery`) and paid reservation (`contribution_model_reserve`) check authority and dollar caps, but
  not slots. So R's create is delivered, and its first paid model call is reserved.

### Repair (in 0100 only)

- **A capacity check for R.** It applies to rebuilt contributed tasks: those whose research task has
  `rebuilt_from_job_id`. It counts the slots held by other tasks of the same account and of the same grant, exactly
  as `contribution_slots_held` counts them, but excluding R itself. R already holds its own slot, so the ordinary
  pre-insert `slots >= limit` would wrongly refuse settled-old with limit 1, and reserved-old with limit 2.
  - R may proceed only while that count is below the account's `concurrency_limit` and the grant's `concurrency`.
  - O's reserved or uncertain reservation keeps counting, as 0094 defines. Nothing is released, refunded or
    relabelled.
- **At dispatch** (`contribution_delivery_ineligible`), the decision point for create, resume and steer, under the
  project lock that dispatch holds:
  - In a writable transaction, for R only, it takes R's grant FOR SHARE, then its connection FOR SHARE, then the
    account FOR UPDATE. That is admission's order after the project lock, so there is no account-before-project or
    account-before-grant inversion.
  - After that wait it reads the current limits and counts, then the wall-clock grant usability and route
    qualification.
  - Over capacity, it returns a reason ("its contribution's account capacity is held by earlier work", or the grant
    one). The existing path then denies the delivery: `contribution_runtime_unusable` flags the runtime, and
    `defer_native_delivery` calls `deny_native_delivery`, which cancels the rebuilt job with "not dispatched: …".
  - This is a bounded denial, not a wait. Nothing retries R later or recovers it automatically: a person asks
    again, through ordinary admission.
  - Read-only transactions (Studio and API reads run `READ ONLY`) only read and take no lock.
  - Ordinary admitted tasks are unchanged: their capacity was decided at admission under the account lock, and
    admissions count R while it is pending.
- **At the paid model reservation** (`contribution_model_reserve`), for R only, the same count runs after the
  account row lock it already takes, beside its existing wall-clock checks. Over capacity it refuses `account_busy`,
  0094's code for both limits. Search, read, settlement and reconciliation are unchanged.
- **Erasure is untouched.** No capacity decision is made inside it, so the source removal, O's revocation, the one
  Stop and cleanup commit whatever the capacity. Nothing is backfilled, no payer falls back, and no scheduler is
  added.
- **Kept:** the frozen provenance copy, idempotency, the orphan fences and the readiness part.

### Tests (persistence combined test, real worker and API roles)

- **Negatives, failing on `185146bb`:** O reserved, and O uncertain, each at account and grant limit 1. R's create is
  denied before any new effect, and R makes no paid reservation. The erased words are gone, O's commitment is
  retained, and there is exactly one Stop.
- **Independent classes:**
  - Grant only: account limit 2, grant 1, O reserved.
  - Account only: account limit 2, grant 2, O reserved, plus a held task admitted through another project's grant
    on the same account (an alias).
- **Post-wait boundaries:** a holder transaction holds the account row and lowers the limit from 2 to 1 while R's
  dispatch waits, and again while R's paid reservation waits. The wait is observed in `pg_stat_activity`. R is
  refused after the wait, where a read before the wait would have allowed it.
- **Positives:** settled-old at limit 1 and reserved-old at limit 2 deliver and reserve, with replay giving the same
  reservation. The project-funded rebuild is unchanged.
- **Mutants:** reached-guard mutants for the dispatch check, the reservation check, the self-exclusion, and the lock
  before the read. Each must fail on an assertion, and each is restored by SHA-256.
- **Then:** the SQL test, focused suites on the final bytes, static checks, one signed commit, an early checkpoint,
  and ONE ordinary check.

## CI-REPAIR-001: the structural foreign-owner custody test on any runner's ownership layout

Assignment `7a0b22ee…`. CI raw `6eb40047…` (PR 507, run 43247849955, runtime-unit job 131285369901). Written before the
edit. This is a child of the published `da48d25a` (tree `99e02d30`). Three paths change:
`tests/unit/contribution-custody.test.mjs`, this plan and the handoff. Production custody, 0100, the combined tests,
generated sources, the Studio and CI are unchanged.

### Cause, in the actual source and raw

- **What the test does.** `tests/unit/contribution-custody.test.mjs:184` asks for a private directory under the scratch
  root, which is `mkdtemp(tmpdir())` and owned by whoever runs the test. It asks with an artificial EXPECTED uid,
  `getuid() + 4242`, and expects `directory_unsafe`.
- **What production checks.** `assertPrivateDirectory` (`scripts/lib/contribution-custody.mjs`) checks every ancestor
  first. An ancestor must be owned by root or by the expected uid; otherwise the refusal is `ancestor_unsafe`. Only
  then is the directory's own owner checked (`directory_unsafe`).
- **As root** (this host): every ancestor is root-owned, so the directory is the first refusal.
- **As a non-root runner** (GitHub Actions): the scratch root is owned by the runner, which is neither root nor the
  artificial uid, so the ancestor is the first refusal. Production rightly gives `ancestor_unsafe`.
- Both answers refuse. The test's fixed expectation encoded the root layout only.

### Repair (the test only)

- **The expected code comes from the fixture's actual ownership,** read with `lstat`. The first ancestor of the
  directory (root first) owned by neither root nor the expected uid gives `ancestor_unsafe`. Failing that, the
  directory, which is owned by this process and not by the expected uid, gives `directory_unsafe`. That is exactly the
  order production checks.
- **Positive control:** the same directory and file read the invented key under this process's own uid. So every
  check except ownership passes, and the expected refusal is an ownership one.
- **Two layouts per run:**
  - a directory under the scratch root: `ancestor_unsafe` as non-root, `directory_unsafe` as root;
  - a directory created directly in `tmpdir()`: `directory_unsafe` wherever `tmpdir()`'s ancestry is root-owned, as
    for `/tmp`.

  The test records which boundary each case reached.
- **Unchanged:** the fixed safe `CustodyError` message, the no-key assertion and the file-read form (`readPrivateFile`
  with the expected uid). The file's own `foreign_owner` check is not reached, because the directory or an ancestor
  refuses first. The test says so; it is not claimed.
- **Scope:** this remains structural, with no real second user. No user is created, nothing is chowned and no
  privilege is changed. On this root host only the root layout runs. The non-root layout is the CI runner's, whose
  actual refusal (`ancestor_unsafe`) is the code this derivation predicts for it.

### Verification

- **The custody unit file and the launcher crossing** (`tests/integration/contribution-runtime-host.test.mjs`), on the
  final bytes.
- **Fail-before:** the `da48d25a` test as root passes, and its fixed expectation is the defect for a non-root layout,
  as the CI raw shows.
- **Temporary production mutants,** each restored by SHA-256: the directory owner check removed (the file's own
  `foreign_owner` is then reached), and ancestor ownership treated as always safe.
- **Then:** static checks, one signed commit with `da48d25a` as its sole parent, an early checkpoint, ONE ordinary
  check with diagnostics outside the worktree, and the sealed raw.
