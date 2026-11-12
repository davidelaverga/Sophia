# INC01-COHERENT-001: the coherent source composition (development, not accepted)

## What this commit is

One signed development commit on the published native parent `45564a5a8cc1644b13c17739a40a4723892d33f1` (tree
`ea62bdd0…`, Native14 r1).

- **What it composes:** the accepted owned slices.

| Slice | Head |
|---|---|
| UI | `f4240d71` |
| member read | `134eaf20` |
| API | `9587bd72` |
| custody | `7559e7af` |
| S01 | `37b1f47d` |
| resources | `b98603b9` |
| Personal P1 | `8775d925` |
| Personal P2 r1 | `858f957c` |
| S2 | `9c2c93cc` |

- **What it adds:** one bounded functional repair (0100) for a P1 that composition revealed. A second P1 found by the
  independent review is repaired in the same 0100 (WRITE-004).
- **Assignments:** WRITE-002 `0f6d2c6a…` (composition) and WRITE-003 `521491af…` (the repair, continuing WRITE-002),
  with two bounded WRITE-003 instructions:
  - NEWPAID-BOUNDARY-001 `34f1767a…`: a new paid search or read on an unbound lineage;
  - BROWSER-REPAIR-001 `d2ebf735…`: three leased test and fixture paths.
- **WRITE-004** `1970d278…` (rebuild capacity) answers CORE `b2c8968a…`. That review rejected `185146bb` for
  CW3-REBUILD-CAPACITY-F01 (P1).
- **The rejected candidate.** `185146bba8cb56c86999c325a49ba15de1ecfd22` (tree `1bc7af5e…`, parent `45564a5a`) is kept
  as branch `inc01-coherent-write-003-candidate-185146bb` and in bundles, outside this commit's ancestry.
  - Its ONE ordinary check exited 0: unit tests 4655 passed, 67 skipped and 0 failed; integration tests 185 passed, 2
    skipped and 0 failed. Its sealed raw archive is `737ea760…` and its early checkpoint `7bfc74ce…`.
  - **That run's binding is qualified.** An untracked `.mjs` listing script existed in `packages/persistence` during
    its typecheck phase. It was created at or after 14:15:34.080Z and removed before 14:15:46.814Z: a bound of 12.734
    seconds, not the under-a-second first caption (`52a`, corrected by `52b` and `55`).
    - That no phase could include it is an inference from the log tails, the sequential phase order and the actual
      include patterns. It is not a file-access trace.
    - A clean final git status is not proof that the worktree was clean throughout.
  - UI-01 at the phone project's settings: one targeted run on the unchanged `185146bb`, 1 out of 1 (`54`). This is a
    narrow simulated fixture run, not the whole phone suite.
  - **Cleanup record (`53`):** the pre-existing stale database `sophia_t_44d6e1b65a14` and the disposable cluster were
    still there, and still running. Its broad process match reported 1, which may be the match itself and is
    unresolved. It is not a claim that every process stopped.
  - Its exact tree was staged onto `45564a5a` (index tree equal to `1bc7af5e`) before the WRITE-004 edits.
- **An earlier superseded candidate.** `dbfa8171c93d69a6ca0fd9e1f35e1215575fa691` (tree `486fa5ce…`, parent
  `45564a5a`) was signed locally before those two instructions. It is kept as branch `inc01-coherent-write-003-superseded-dbfa8171`
  and is outside this commit's ancestry.
  - No ordinary check ever ran on it.
  - Its exact tree was staged onto `45564a5a` (`reset --soft`, index tree equal to `486fa5ce`), and the bounded
    repairs were made on top.
- **Plan:** `docs/plans/inc01-coherent-composition.md`, written before the edits, with its WRITE-003 section written
  before the functional edits.
- **Status.** Not published, merged or activated. Native post-push gates on `45564a5a`, the independent whole-diff gate,
  current automatic and CI, Luis and the RTA all remain.

## Composition (WRITE-002)

**The rows.** 195 owned rows, rebound with full SHA-256 against `45564`:

| Class | Rows | How |
|---|---|---|
| Kept | 93 | Byte-exact native, including the new `tests/unit/owner-host-cli.test.mjs` |
| Ledger annotations | 2 | CONTRACT_MAP and the progress ledger |
| Mechanical copies | 30 | Each slice-base blob equals the parent's |
| Proven errors copies | 2 | Native bytes plus 0094-only lines |
| New paths | 57 | Absent from the parent |
| Copy plus annotation | 3 | Personal N01 handoff, S01 route comment, S01 plan note |
| Joins | 5 | See below |
| Generated | 3 | See below |

The precedence is custody over API, P2 r1 over P1, then UI, then member read. Every copied blob was re-hashed equal to
the inventory. The 45 rows whose donors are not held here are 100644 with no shebang.

**The joins:**

- **`app.ts`:** a merge-file of the API, S01, resource and P2 r1 hunks with 0 conflicts, plus one pure block move that
  sets `registerNativeRunner` above `registerPersonal`'s doc comment. That placement was already wrong in the resource
  donor. WRITE-003 adds one readiness part (below).
- **The persistence index:** four additive export blocks.
- **Both S2 docs:** the exact `45564` document, then S2's end-of-file block (`c9997709…` and `5fe2f810…`), then a current
  provenance note.
- **SOURCE_MAP:** a three-way merge keeping the §2k replacement. The one empty-base conflict resolves to the native §2n
  pagination subsection, then S2's §2o, then the provenance note.

**Generation.** 50 amendments (A19 and A20 do not exist), sorted, equal to root's verified list: 46 from the parent plus
A48, A49, A51 and A52.

- One `generate` run changed exactly `openapi.json`, `generated-types.ts` and `validators.js`. The validators equal
  P2 r1's `744c7c4c…`.
- `validators.d.ts`, runtime-wire, specialists and every other contracts file are byte-unchanged.
- **OpenAPI against the parent:** 52 new dictionary members, all at A48/A49/A51/A52 pointers, plus one enum extension
  of an existing schema: A52's `PersonalTurn.reply` gains `recorded`. An earlier wording said "53 additions" for the
  same comparison. The generated sources have not changed since, and no regeneration is needed.

## The repair (WRITE-003): CW2-REBUILD-F01, P1

**Found.** The combined test found that a contributed research task, revoked by a source withdrawal, was rebuilt by
`research_rebuild` (0033, unreplaced by 0094) with no funding binding. Its paid calls on the owner's runtime escaped every
contribution check, and it read as project-funded.

- The behaviour is inherited from the API slice: it reproduced identically on `7559e7af` alone.
- The independent receipt `40acb2e0…` confirmed it.

**The repair** is append-only `db/migrations/0100_api_contribution_rebuild_funding.sql`. 0001–0099 are unedited.

- **The producer binds.** `research_rebuild` is the 0033 body plus one call, `contribution_rebuild_bind`, which copies the
  original task's frozen binding exactly: allowance, grant and its revision, connection and credential revision,
  account, owner, requester, resource and requested settings.
- **No authority is decided inside the erasure,** so the erasure, the revocation and the Stop always commit.
- **Existing 0094 gates decide new work:** dispatch, and each paid call with its locks and wall clock. The task cap is
  per allowance, so cumulative across the lineage.
- **Orphans from before 0100** (`contribution_lineage_unbound`) are fenced at five points:
  - dispatch is denied: "its contributed lineage has no funding binding";
  - a new paid model call is refused: `lineage_unbound` (`contribution_model_reserve`);
  - a new paid search or read is refused: `lineage_unbound`. `runtime_research_reserve` is the 0094 body plus 4 lines,
    because 0094 calls `contribution_model_reserve` for model calls only;
  - publication is withheld;
  - the funding read is refused instead of claiming `project`.

  Nothing is backfilled or relinked. A replay of an existing reservation returns it with the same identity.
  Settlement and `uncertain` reconciliation are untouched.
- **A project-funded lineage is unchanged.**
- **Capacity (WRITE-004).** A rebuilt task never passes admission, so its concurrency slot was never checked. Its
  original's reserved or uncertain call keeps a slot (0094's counting), and the rebuilt pending task is a second. With
  account and grant concurrency 1, the rebuilt create was still delivered and its paid call reserved.
  - **Repair:** for a rebuilt task (`research_tasks.rebuilt_from_job_id`), dispatch (`contribution_delivery_ineligible`)
    and each new paid model call (`contribution_model_reserve`) count every other held task. The count covers its
    account (every project and alias) and its grant, exactly as `contribution_slots_held` counts, without the task
    itself.
  - **At dispatch,** a write takes the grant (share), connection (share) and account (update) rows in admission's
    order, under the project lock dispatch holds. Every check, the capacity included, reads after that wait. A
    read-only transaction only reads.
  - **Over a limit,** the delivery is denied through the existing path ("not dispatched: its contribution's account
    capacity is held by earlier work", or the grant one): the rebuilt job is cancelled. The paid call is refused
    `account_busy`, 0094's code.
  - **Limit:** this is a bounded denial. Nothing waits or retries, and a cancelled rebuild is not recovered when
    capacity frees. Any new attempt goes through ordinary admission.
  - **Unchanged:** the erasure, which commits whatever the capacity; nothing is released, refunded or relabelled.
    Ordinary admitted tasks are also unchanged: admission decided their slot under the account lock, and admissions
    count a pending rebuilt task.
- **Readiness.** `app.ts` gains one readiness part: with `apiContributions` on, `/ready` requires 0094's write entry and
  0100's helper.
- **Not changed:** `api-contributions.ts`, its test and `research.ts`. A refusal code is free text that the existing
  regex parses.

## Test-only functional exceptions (BROWSER-REPAIR-001)

These three copied donor paths are changed and are no longer exact copies:

- `apps/studio/fixtures/personal-recorded.tsx` (P2 r1 `858f957c`): a comment only.
- `apps/studio/e2e/personal-recorded.spec.ts` (P2 r1 `858f957c`): the page clock is fixed at noon today, the moment
  the fixture's turns describe, and one welcome-boundary case is added. Every existing assertion is kept.
- `apps/studio/e2e/work.spec.ts` (UI `f4240d71`): UI-01's two lane reads wait for the expected titles
  (`toHaveText`, `useInnerText`). The expected titles and their order are the same.

No production UI, CSS, component, contract, generated or configuration path changed.

## Evidence (raw logs in the handback)

These checks ran on the final uncommitted working tree, before the commit. One ordinary `pnpm check` runs afterwards,
on the committed head. Counts from earlier bytes are stated with their bytes, and none is restamped.

- **SQL.** On the final 0100: 100 migrations and 13 SQL files pass. The 0100 SQL test also checks that
  `runtime_research_reserve` stays the API's and fences an unbound lineage. Earlier, 99 migrations and 12 files passed
  at the `f21` snapshot.
- **The two combined tests, on the final bytes: 19 out of 19** (15 persistence, 4 API). For `185146bb` the figure was
  13 out of 13.
  - **Persistence** (`packages/persistence/src/inc01-coherent.db.test.ts`): 15 tests.
    - **6 regression tests for the finding:**
      - the frozen binding, with the rebuilt task's calls contribution-accounted (ledger link to the original grant,
        revision, account and credential) and a replay giving one row;
      - the task cap cumulative across the lineage;
      - pause, grant revision, requester and credential barriers (dispatch denied, paid calls refused), with the erasure
        always committed;
      - a pause committed while the rebuilt call waits on the grant lock (the wait observed in `pg_stat_activity`);
      - **existing orphans.** Dispatch is denied and the funding read is refused. On a delivered lineage, the cited
        search source is captured while still bound, alongside one model call left reserved and one left `uncertain`.
        Then the fixture removes the binding and its links, as before 0100.
        - A new model call, search and read are each refused `lineage_unbound`, and no reservation row is added.
        - Replays of the earlier search and model call return the same reservations.
        - The reserved call settles and the `uncertain` one reconciles.
        - No ledger link is invented, and publication is withheld.
      - **a project-funded positive:** its new model call and new search both reserve.
    - **6 capacity tests (WRITE-004).** Each erasure commits (words gone, one Stop, the original revoked).
      - The original's call reserved, and uncertain, at account and grant limit 1: the rebuilt create is denied before
        anything reaches the runtime. The original commitment stays as it was, and the denied task holds no slot.
      - Grant limit alone (account 2, grant 1): denied for the grant.
      - Account limit alone (account 2, grant 2): the original's call plus a task admitted through another project's
        grant on the same account and connection (an alias). Denied for the account.
      - At dispatch: a holder transaction holds the account row and lowers the limit from 2 to 1 while the dispatch
        waits, the wait observed in `pg_stat_activity`. The create is denied after the wait.
      - At the paid call: the same lowering while the delivered rebuilt task's paid call waits. The call is refused
        `account_busy`, and nothing new is reserved.
      - Positive: a settled original at limit 1 leaves the slot to the rebuilt task, which is delivered, reserves, and
        replays as the same reservation.
    - **Positives updated from 185.** The two 185 tests that left the original's call reserved now run at limit 2,
      which is the reserved-original/limit-2 positive: the frozen binding, ledger link and replay, and the cumulative
      task cap. At limit 1 that configuration is the defect above.
    - **3 crossings:** the 0097 read over 0096 rows in UTC, Personal against conversation erasure, and the 0092–0100
      role matrix, with the three new helpers internal.
  - **API** (`apps/api/src/inc01-coherent.db.test.ts`): 4 tests.
    - The per-feature switch rules: the writers are off by default (404, nothing written), native reads stay, the
      resource read is always mounted, and `conversationInputs` requires `conversations`.
    - Per-feature readiness including 0100.
    - Serializers through the regenerated contract: A48, plus an uppercase path id; A49; A51 equal to persistence
      except its own clock; and A52's `recorded` through the canonical Personal parser.
- **Focused existing suites (19 files):**
  - the 0094 persistence and API suites;
  - research, which crosses the replaced `research_rebuild`;
  - media;
  - conversation fences, runtime, inputs and legacy-ask;
  - project resources, persistence and API;
  - Personal inputs, legacy and personal, and the Personal API;
  - runner operations, persistence and API;
  - owner-host enrollment;
  - worker runner dispatch.

  On the WRITE-004 0100 (`e02b87a1…`): 751 out of 751 (0 failed, cancelled or skipped). They do not include the combined tests. Earlier, on the same 19 files:
  - 751 out of 751 (0 failed, cancelled or skipped) on the first WRITE-003 0100 (`b98bbfb2…`);
  - 751 out of 751 on the `185146bb` 0100 (`85479cc7…`).
- **Custody.** Unit 12 out of 12, supervisor and crossing 20 out of 20. Member-read client and renewal: 61 out of 61.
  The SQL and test changes after these runs touch none of their sources.
- **Studio browser** (fixtures, desktop 1280×800 and phone 390×844; simulated, not qualification).
  - **The original episode stays failed:** 366 passed and 5 failed, in a run started at 13:28 UTC on the donor-exact
    bytes. The 5 failures were 4 Personal recorded cases (desktop and phone) and Work UI-01.
  - **Personal recorded: cause, shown on the unchanged pages** (a scratch probe, desktop and phone).
    - The fixture stamps its turns before noon today, and the page's welcome-back reads the real clock.
    - With the real clock (13:54 UTC), and with a fixed 12:22, the page asks for `resume`.
    - With a fixed noon, or 12:20, it asks for nothing.
    - At 12:22 the last turn that asked her is 61 minutes old, with the held turns set aside as in 0099.
    - Earlier: the same 4 failed again at 13:45 UTC, and all 5 passed with the browser at local 11:45.
  - **Work UI-01: cause.** The deep plan arrives by fetch after `load`, and the spec read the lane titles once.
    - In a probe mirroring the test (40 fresh contexts), 3 immediate reads were `[]` with the board present. Every
      settled read was the two expected titles.
    - Earlier, `--repeat-each 30` gave 26 passed and 4 failed. Every failure received `[]`.
    - A product defect is ruled out: every settled read holds the expected tiles.
  - **On the repaired bytes:**
    - Personal recorded, desktop and phone, at the real 14:0x UTC clock: 6 out of 6 (the 5 cases plus the new
      boundary case).
    - The 5 Personal recorded cases (3 desktop, 2 phone) in three zones (`Pacific/Kiritimati`, `Etc/GMT+12`,
      `Asia/Kolkata`): 5 out of 5 each.
    - Work UI-01 with `--repeat-each 40`: 40 out of 40.
    - UI-01 has no `@phone` tag, and the phone project selects only `@phone` cases, so it runs on desktop only.
  - **Browser mutant W1** (`welcomeDue` counting held turns), temporary and restored by SHA-256: the new boundary case
    fails on an assertion, and the other 4 cases pass. It is one distinct browser mutant, separate from the database
    and readiness mutants.
  - **The other 366 passes** are kept from the original run with their exact source identity. They are not rerun or
    restamped. Since that run, only the three leased test paths changed in the Studio.
- **Static, on the WRITE-004 bytes** (Node 24.21.0, pnpm 11.7.0): toolchain, build, `contracts:check` and artifacts
  exit 0.
  - Lint first failed on one `no-shadow` in the new test (a local `before`), which was renamed. That raw is kept.
  - Format, lint and typecheck pass on the final bytes.
- **Static, on the `185146bb` bytes** with the pinned Node 24.21.0 and pnpm 11.7.0: toolchain, format, lint, build,
  typecheck, `contracts:check` and artifacts all exit 0.
  - A first attempt from a shell without the pinned toolchain failed the engines check (Node 22). It is kept.
  - Discovery is unchanged from the earlier run: the same files, with 100 migrations and 13 SQL files.
- **Fail-before on the exact `f21` baseline: 6 pass, 7 fail (5 semantic, 2 structural), 0 cancelled.**
  - It ran the earlier test bytes, persistence `cf3cc07c…` (the `dbfa8171` test) and API `f1dcc6ba…`, not the `185146bb`
    persistence test `571b8c22…`.
  - All five finding tests fail on assertions:
    - the binding is `[]`;
    - the over-cap call resolves;
    - the paused create stays `pending`;
    - the rebuilt call never waits on the grant;
    - the orphan create stays `pending`.
  - Two failures are structural only: 0100's helpers are absent, which fails the role test and makes the readiness
    test's fixture rename fail with `does not exist`.
  - The positive control, the other crossings and the switch and serializer tests pass on both trees.
- **New-paid fail-before on the superseded `dbfa8171` 0100, with the `185146bb` persistence test (`35`): 8 pass,
  1 fail.**
  - The orphan test fails on an assertion: a new paid search on a delivered unbound lineage resolves.
  - The first attempt raised a fixture foreign-key error instead, because the binding was deleted while links
    remained. It is kept. The fixture now removes the links too, which is the actual pre-0100 state.
- **WRITE-004 fail-before:** the final test bytes run against the `185146bb` 0100 (swapped in, then restored by SHA-256):
  9 pass, 6 fail, 0 cancelled.
  - **Five semantic assertion failures:**
    - the reserved/uncertain, grant-only and account-only cases each find the rebuilt job `pending` (created), not
      `cancelled`;
    - the dispatch boundary never waits on the account row;
    - the paid-call boundary resolves instead of `account_busy`.
  - **One structural failure:** the role test names the three new helpers, which `185146bb` lacks.
  - Positives and the other tests pass.
  - **Earlier attempts, kept:** one before the boundary test was split stopped at the dispatch half (4 failures), and
    one before the helper names and a lint rename had 10 pass and 5 fail.

- **WRITE-004 reached-guard mutants on the final bytes: 7 distinct,** each caught by an assertion with 0 cancelled and
  restored by SHA-256:
  - C1: the dispatch capacity check removed (4 failures);
  - C2: the paid-call capacity check removed (1);
  - C3: the rebuilt task counted against itself (8, the positives included);
  - C4: dispatch's account-row lock removed (1, the dispatch boundary);
  - C5: the account limit ignored (4);
  - C6: the grant limit ignored (1);
  - C7: an uncertain call no longer counted (1).

  A first round, before the lint rename, gave the same result. It is kept and not counted again.
- **WRITE-003 mutants (`185146bb` bytes): seven distinct database and readiness mutants,** each caught by an assertion with 0 cancelled and restored by SHA-256:
  - B1: the bind removed (5 failures);
  - B2–B5: each orphan guard removed (dispatch, paid model call, publication, funding read);
  - B6: the new search and read guard removed;
  - A1: the 0100 readiness part removed, which gives 200 instead of 503.

  Earlier runs of B1–B5 and A1 on earlier bytes are kept, and are not counted again. In the first, B4 failed on a citation-count error, not an
  assertion. That was a weak discriminator, fixed then.
  - Later, the B4 fixture still obtained its citation through a new paid search after orphaning, which the 0100 of
    that time allowed.
  - It now captures the citation while bound.
- **Kept and scoped as history, not hidden:**
  - WRITE-002: a field-name test error; a probe query error (missing column); a reviewer-side probe column error and a
    corrected paused control (independent receipt).
  - WRITE-003: an import mistake; settings that 0094 rejects (a grant total below its task cap, a grant above its
    account); the weak publication discriminator; a read-clock (`observedAt`) comparison; lint and package-typecheck
    findings in the new tests.
  - New paid: the foreign-key fixture attempt.
  - Browser: two probe attempts. One used a wrong board locator. The other reused one page across many navigations
    until the browser ran out of resources.

## Limits

- **Simulated only:** fixtures, synthetic grants, tokens and qualifications. No real key, provider, model call, native
  host, account or charge.
- **Activation:** no producer activation, Studio READ flag, `server.ts`, config or environment change. Contribution,
  Personal and automatic-conversation writers stay default-off.
- **INC02 and the RTA:** INC02's start gate and the RTA hold are unchanged.
- **Grant and account totals:** they are not exercised as a separate binding limit within one lineage, because 0094
  keeps a task cap within its grant and a grant within its account. They count the rebuilt reservation, whose link
  carries the original grant and account.
