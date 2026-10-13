# CON-01 source takeover 5 — Step1 boundary and proposed narrow amendment

Goal/attempt: CON-01, same takeover attempt and cumulative acceptance. Human owner: Davide. Sole source author: Codex, native session `01a1224a-32b4-7222-a017-50a277572d95`, worktree `sophia-con01-source-harness-review`, branch `codex/con01-takeover-source-20261013`. Independent reviewer: retained `takeover_diff_review`, source inspection only; author ran the tests below.

Starting published candidate: `8dcbf2683f4e03cfaae7b6b7f673cc52766cfb56`, tree `07dec213122d2436c79ad0daa3da21333821beb1`; main `32854caf01e7d5e493e096baead019506b1d1de3` unchanged. Its automatic review was actually checked: [bot6134763074](https://github.com/davidelaverga/Sophia/pull/273#issuecomment-6134763074), reviewed commit `8dcbf2683f`, no major issues, summary6134284110 completed 2026-10-12T23:44:11Z. This handoff/README/progress publication is documentation only; its exact final head/tree and automatic review belong to its publication receipt, not the earlier clear.

Ending-publication recovery: the exact receipt is `/Users/davidelaverga/.codex/operator-journal/CON-01/20261012-takeover/source-phaseb-step1-8dcbf268/publication.safe.json`. It is explicitly pending before this documentation push and is finalized after checking that head's automatic review. For shared recovery without that private filesystem, use [PR273's conversation](https://github.com/davidelaverga/Sophia/pull/273): find the comment beginning `CON-01 takeover5 publication`, then its exact-head review request and bot completion, matched by full head (or the bot's unique prefix), not by recency alone. The matching final mission comment on [issue198](https://github.com/davidelaverga/Sophia/issues/198) begins `CON-01 takeover5 ending`. No result is inferred while any of these records remains pending.

## Authority and actual work

The [source-only approval](CON-01-codex-source-takeover-2.md), #198/6133920949, expires 2026-10-13T08:00:00Z. It replaces missing owner-ACK/accepted-base prerequisites only for the approved local source and draft publication scope. It does not extend historical ACKs. Step1 began 2026-10-12T23:53:39Z after a fresh census of 482 published refs / 290 unique candidates: 0049/0050 absent; both 0053 candidates held the same approved dispatcher blob `669733650287beb2ae36bfd4e8c9606984a34f8d`. No newer overlapping writer notice was present. The source-start record and seven-function PostgreSQL baseline are retained privately.

Exact scope input: [r12 reservation](../coordination/CON-01/G2_SHARED_RESERVATION_REQUEST.md), SHA256 `c0d428a077fd7bdcadfec1c794861b0e784c43a41ab95a7c4067e15290f05307`; [research amendment](../coordination/CON-01/G2_RESEARCH_COMPATIBILITY_AMENDMENT.md), SHA256 `2a07104b1501fa7d33330e8dae2d9270df53314a2b09be2ceb738c1fdd27b114`. Those files remain unchanged. Their stop rule says: “Nothing outside these lists is written. An unlisted need stops the writer, and the list is amended and acknowledged again.”

An unfinished local 0049 promoted the four hash-verified frozen candidates from `7d8f415f`, excluding S3's old role preamble, membership and assembler grants, and removing the named absent-role REVOKE entries. It added the option-C ownership DDL and widened the binding/command CHECKs. A new focused test checked the catalog; the outbox type became nullable. No shared runtime function, cancellation writer, route, bridge, launcher or provider path was authored. This was a diagnostic working tree, never a complete Step1 pin.

The three author-owned unfinished files were copied byte-for-byte to the private operator journal, then returned to published source. No unfinished migration is left in the migration runner or pushed. Parked SHA256 values:

| Path | SHA256 |
|---|---|
| `db/migrations/0049_conversation_runtime.sql` | `c06cd55c89859b52f2529eb400fc97a0ca56bc8ee1dd221cc564f002f6a6becf` |
| `packages/persistence/src/conversation-runtime.db.test.ts` | `29c3865a5ba234b88bda888599c9277c389a0d9378109977e03abb0371c8d3fc` |
| `packages/persistence/src/outbox.ts` | `671c7e081ee8d8a5e87606f70e3fa2210f7054999e953ec5b24a8b9ee7bd2b92` |

## P1: publication privacy conflicts with required cancellation provenance

Expected under r12: a request cancelled during native execution has one immutable `conversation_cancellations` row with its real immediate cause; its attempt is fenced and a claimed execution gets one stop. Acknowledgement names that row as `terminalWriter`. No withdrawal, source or initiating human action is invented.

Observed in frozen S4 `conversation_publish_answer`: its privacy branch directly sets `cancelled`, reason and settled time. Actual tests reproduce both `asker_removed` and `audience_changed`. It publishes no answer, but the branch does not call the proposed cancellation writer. In the new runtime composition, retaining that body would omit the required cancellation row, epoch fence and stop. This is a source-contract incompatibility blocking Step1, not a deployed defect or an executed native failure.

R12 permits only withdrawal/source-out cancellation callers and four cause kinds, and permits only one S4 insertion in `conversation_source_out`. Its frozen publication function cannot honestly manufacture a withdrawal or source id for these two cases. Its refusal helper accepts only malformed-answer reasons; substituting failure would also change the agreed cancelled behavior. A pre-check in capture can withhold publication, but does not supply the missing terminal transition/provenance. Independent inspection confirmed this boundary.

## Proposed amendment for approval — publication privacy

This is an engineering correction to the source scope, not an implementation or product-policy change:

1. Permit one additional named S4 insertion in `conversation_publish_answer`, replacing only its direct privacy-cancellation UPDATE with `conversation_cancel`. Preserve the privacy verdict, reason, cancellation time, no-publication result and all other S4 code. The equality test restores the original UPDATE and compares the complete definition.
2. Add `publication_privacy` as a distinct typed cancellation cause and `conversation_publish_answer` as its exclusive caller. This means the publication transaction observed that its recorded context was no longer eligible. It does not assert who changed membership, what mutation caused an audience revision, or that a withdrawal/source-out writer ran.
3. Extend the new cancellation writer with a final optional assembly-attempt argument, NULL for the existing nine-argument call sites. For this cause, require the reply's recorded assembly attempt and the privacy verdict under publication's existing locks. Persist the cause's conversation, assembly-attempt key, reason, observation time, observed audience/erasure revisions and asker's observed membership presence/active/role. These are typed, text-free fields; message/source-cause fields stay NULL. Existing withdrawal/source-out causes keep their exact fields and callers. No model-supplied cause or actor is trusted.
4. Use the same first-cause, request/attempt/claim read-before-write, epoch/stop/retire precedence and accounting rules as the other cancellation paths. A later cause cannot replace the first. The acknowledgement accepts this row as the cancelled request's terminal writer; cleanup still needs every other predicate and process/host-copy proof.
5. Add real PostgreSQL tests for every existing S4 privacy reason, claimed and never-dispatched cases, repeated publication, crossed withdrawal/source-out/publication and first-cause retention. Verify no text publishes, no second execution/call/allowance is created, and mixed research intake commits without invented provenance or swallowed storage failures. Restore-only preservation checks cover both named S4 exceptions and the original seven shared functions.

Proactive grant-disable and member-removal hooks remain held activation prerequisites. This amendment does not wire those writers, change membership authority, broaden erasure, regenerate answers or enable Ask.

## Promotion test boundary and proposed single helper

Existing candidate suites call `createTestDatabase()` and then apply S1–S4. Adding 0049 would make that setup attempt duplicate CREATEs. Current S3 also contains separately qualified Q13 role/read-policy additions that r12 explicitly excludes from 0049. Changing or skipping those cases to hide the collision would lose their evidence.

Permit one new test-only helper, `packages/persistence/src/conversation-candidate-fixture.ts`, imported only by CON candidate/Q13 suites and not exported from persistence. It uses the existing `createTestDatabase(migrationsDir)` API; no shared test-support code changes. It materializes an owned temporary directory from a sealed 47-file name/hash list at `8dcbf268`, including 0053. It verifies each input before database creation, refuses drift/missing files and removes its temporary directory. Filtering numerically through 0048 is forbidden because that would lose 0053.

Explicitly include the existing Q13 admission suite's fixture adaptation in this source amendment. The listed assembly/fences candidate cases retain this pinned baseline and current isolated-role candidate; the role-independent promoted cases run against the complete migrated database as r12 requires. S1/S2 migrated cases, promotion equality and the new runtime cases use the complete migration set. Each receipt names its actual baseline and cases; retained candidate results never stand in for execution of promoted runtime changes. No test criterion is weakened and no old broad-role inheritance is restored.

The amendment changes only the new 0049 cancellation objects/call signature, the named S4 publication insertion and equality exception, the existing allowed CON tests, the one named test helper and Q13 admission-test setup. No applied migration, shared helper, dependency, role policy, grant authority, host or provider configuration is added to this delta. The original five-step order, complete gates, sole author, independent whole-diff review, exact-head automatic review and expiry remain binding.

## Actual diagnostics and cleanup

Author-run, exclusively owned loopback PostgreSQL 17.6, sanitized environment and finite 240-second outer limits:

- New ownership tests before implementation: two failures, zero skips. Missing reply columns / required goal columns and absent migrated assembly function are retained in `source-phaseb-step1-before/tests.log`.
- Partial working-tree DDL: two passes, zero failures/skips. This checks only ownership catalog/validated checks and no assembler/API grant; it is not the complete Step1 gate or runtime qualification.
- Existing frozen-S4 tests, filtered to `asker no longer a writer|the audience revision moved`: two passes, zero failures/skips. They show cancellation/no publication at the real SQL boundary. Their private staged directory contains the exact 47 pre-promotion migrations, including 0053, plus the suites' explicit candidates. No native process, runtime execution or model ran.
- All three owned PostgreSQL servers stopped; PIDs absent, ports closed and clusters removed. No client/session on a shared or hosted target was touched. Private evidence and parked source remain intentionally retained, with no unresolved running test process.

No ordinary complete gate was run for the partial migration, and no Step1 source readiness/review clearance is claimed. The previous clean executable `1d8ac750` still has its 181 real-PG passes, 47 migrations/five SQL files and ordinary gate; it is not evidence for this unfinished path. The publication is documentation only, so those executable source bytes remain unchanged.

## Operations, readiness and next bounded action

No operation request was approved or executed. OP0002r6 and OP0001r4 remain unapproved and not approval-ready. Serving app/API/runtime tuple remains unverified. No hosted migration/config/deploy, account creation, grants, credential read/copy, real provider/native Ask or subscription execution/spend occurred. Ask remains disabled. Earlier stopped-workflow resource deduction remains unknown.

Retained acceptance ledger remains 18 `partial_L1`, three `passed_L1`, 15 `not_run`, unchanged SHA256 `b25c7f8c8ceb002c8139e1ec3ee5d8a08842a06ac9bc0493bb23fb79d48c1c3f`. Local source review, authorization, deployed, app_verified and owner_accepted remain distinct. Other missions and the broader product remain open. Governed hosted data was untouched; future live rollback must preserve its compatible readers, accounting and cleanup state.

Next bounded action: obtain approval of the two precise source-scope additions above, then refresh the census/window and resume the complete Step1 implementation and real-PG tests from the parked diagnostic. This does not extend the existing expiry or authorize operations. Until then the affected writer is stopped. Luis retains integration/merge review; Davide retains product acceptance. No autonomous monitor or future-session execution is scheduled.
