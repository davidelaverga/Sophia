# CON-01 takeover9 — approved capture privacy implementation

Same mission/attempt and sole author: Codex session
01a1224a-32b4-7222-a017-50a277572d95, owned worktree
sophia-con01-source-harness-review, branch codex/con01-takeover-source-20261013.
Davide owns product acceptance; Luis integration; retained takeover_diff_review
provides independent review and does not author fixes. Claude remains stopped.

## Exact authority and recovered state

Davide approved [handoff6](CON-01-codex-source-takeover-6.md), unchanged SHA256
c6c211886d56b45016093f4709aa2fedf149cfb9d45b2ce2538d91e2544c82a8,
by direct “approved” after its named blocker. Recorded at
[#198/6142583117](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6142583117).
The earlier08:00Z source window had expired; no feature write occurred until
his separate structured reply call_2f0eb1db8b734c30926d6fcb6e90e995 item0:
“Renew source-only until20:00 (Recommended)”. The exact expiry-only request
CON-01-SOURCE-WINDOW-20261013-R1 has SHA256
ab8ad37f78d5b1eea3a8c96bd284e405780019f8f6cf9efdd2a2f1a78f51a6e5.
Renewal recorded at
[#198/6142958242](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6142958242).

Source scope is the original r12 plus approved handoffs5/6, through
**2026-10-13T18:00:00Z,20:00 Europe/Rome today**. Historical owner ACKs retain
actual pins; replacement applies only to listed local source/draft publication.
No added path, exception, deployment, hosted migration/configuration, account,
member/grant, privilege/connection effect, credential read/copy/transfer,
provider/native Ask or subscription spend. No PAYG, credits, route switching,
rotation/reset, new harness, runtime upgrade or monitor. Askoff. Active writer,
number collision, unlisted need or expiry stops affected writes. Independent
whole-diff review before every push and actual exact-head automatic review after
every push remain required. Step2 waits for completed Step1/pin/gates/review.

Fresh09:53Z census:522 refs/316 unique candidates, all objects fetched/inspected;
0049/0050 absent, four0053 candidates only approved blob
669733650287beb2ae36bfd4e8c9606984a34f8d. No new198 owner overlap notice.
Published273 remains07d296ff3c2b58d597b31a2d15de0d48241c2dba,
tree69592cb3b988c14a282c623821b3b930960f5d4b, actual automatic review previously
checked clear. No new commit/push. Authoring base32854caf retained, not reset.
Main is9d9023f9c63a09a6426a0acf74f6e76bb22923d3,
tree15ae352ef1e09fd11de209b20946294438a0e61a. Since97eae14c it changed Studio,
UI and docs only; SQL/persistence/runtime/contracts/config/worker unchanged.
Eight Studio conflicts/14 actual conflict blocks remain unmodified, with
exact preservation requirements at
[#198/6142703180](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6142703180).
Earlier clean projection/local rehearsal is old-main evidence only. No actual
merge or UI conflict-resolution write; unlisted/active-owner scope not waived.

## Implementation and exact code pins

| Path | SHA256 |
|---|---|
| db/migrations/0049_conversation_runtime.sql |636f0b34d970e36e2efd9db002fdb85252627ebad3af7ae8b135b05993fca9ae|
| packages/persistence/src/conversation-runtime.db.test.ts |0ea133987ba3ddce99e18c3f7877e767bef08c78c7cfa7a6e689b3dc31af6aff|
| packages/persistence/src/conversation-candidate-fixture.ts |565b310c8ab4a1b2ec4bf8390e7bec138f4fd9fca0d845e0ade26081654f3c16|

Other code pins remain handoff8's. The new closed cancellation writer has an
optional eleventh turn-end UUID; existing nine/ten-argument callers defaultNULL.
Only capture_privacy accepts it; other causes requireNULL. Typed cancellation
fields store actual observation UUID/sequence with project-scoped FK, actual
recorded assembly/privacy/membership/revisions, without source/message fiction.
Validation correlates project/reply/attempt/binding/create/outbox/execution and
the real post-go turn/end before changing state/epoch/effects. Only the capture
cause names capture_native_result; publication_privacy remains publisher-only.

Within approved C1, real recorded privacy precedes empty/malformed/oversized or
failed output classification. Ineligible output produces no saved Sophia answer;
cancellation retains first-cause immutability, epoch2, one stop for claimed
execution, existing stop-before-retire and cumulative accounting. Actual capture
receipt remains separate from cancellation terminalWriter. No frozen validation
exception or original goal-path change; restoration/equality checks retained.

## Verification so far and independent hold

Private journal root: CON-01/20261012-takeover under the existing operator-journal.
Owned PG17.6 C.UTF-8 loopback clusters only; no native/provider process here.

| Child / actual command | Result |
|---|---|
| source-phaseb-capture-privacy-before; node --test --test-concurrency=1 --test-timeout=120000 --test-name-pattern='capture privacy\|privacy cancellation' packages/persistence/src/conversation-runtime.db.test.ts |21 expected failures on original2080728b SQL, zero passes/skips/cancellations; exit1|
| source-phaseb-capture-privacy-after; same command |21/21 pass, zero failures/skips/cancellations; exit0,636f SQL; test0f117c before static narrowing|
| source-phaseb-capture-privacy-full; same command without name filter |103/103 pass, zero failures/skips/cancellations; exit0,current three pins|
| pnpm exec prettier --write packages/persistence/src/conversation-runtime.db.test.ts |formatted, later unchanged|
| pnpm exec oxlint --type-aware packages/persistence/src/conversation-runtime.db.test.ts |exit0 after replacing optional checks with explicit row assertions and renaming a shadowed test variable|

Sixteen new cases cover two actual privacy reasons across empty/invalid/oversize/
failed output; missing/absent/foreign project/foreign binding/non-end/pre-go/
wrong-verdict evidence refusal; and first cause surviving actual later withdrawal
and another end. The original five failing criteria remain and now pass; two
native-path cases correctly expect the approved capture caller/cause, while
publisher-only cases retain publication_privacy. No criterion skipped/relaxed.
Full runtime retains seven shared-function/frozen45 equality and mixed goal tests.
PG41286/41441/41640 stopped/absent, ports52478/52570/52648 closed, clusters removed;
all receipts sourceStillMatches true. Logs/runners retained privately, not Git.

Retained independent reviewer has the current code pins and whole unfinished
Step1 delta against07d296ff. Code is held; documentation records may update.
No full review/push clearance inferred. Current ordinary, SQL and normal parallel
DB gates are next; their terminal receipts must be recorded before Step1 pin.

## Readiness, operations, recovery and next bounded action

Capture privacy is locally verified at L1; Step1 as a whole still requires
ordinary/SQL/parallel gates and independent whole-diff review/pin. No source_ready,
merged/deployed/app_verified/owner_accepted promotion for the mission. Current G3/G4
needs newer-main UI reconciliation under valid scoped ownership. Subscription
adapter/topology/credential/quota/bounds gap, Q13 target admission and full host-copy
process cleanup remain unqualified. Retained36-case ledger stays unchanged until
case-specific stronger evidence; other missions remain open.

OP0002r6 setup/human chat and OP0001r4 Ask remain unapproved/not approval-ready;
no operational effect. Actual IAB tab5/browser3 was read-only observed signed out
after resumption; no login click/auth send, account switch/reload or write. Serving
Studio/API/runtime tuple, two authorized immutable account subjects and useful real
provider-backed reply are not established. No new provider/subscription spend;
earlier stopped-workflow deductions remain unknown. No hidden reset.

No hosted data changed and no hosted rollback is needed. Original owned source and
private receipts are preserved; dispose only owned local test resources. Future
rollback must preserve governed conversations, accounting and unresolved cleanup.
Next bounded action: finish exact-current Step1 gates and independent whole-diff
review, correct any concrete finding within scope, then pin/publish reviewed Step1
and actually check its automatic review before Step2. Current Studio conflict and
separate live operation gates remain explicit; no autonomous future work promised.


## 10:10Z gate/review completion before publication

Current source pins remain636f0b34/0ea13398/565b310c. No feature edit after
independent review. All checks below ran with the complete dirty manifest
unchanged; documentation after this checkpoint records results only.

| Private child / actual command | Terminal result |
|---|---|
| source-phaseb-capture-ordinary-gate; pnpm check |exit0,10:05:19–10:09:18Z; format/lint/build/types/contracts/artifacts pass;2353unit pass/70explicit platform/environment skips;86integration pass/two explicit compatibility skips, no cancellations|
| source-phaseb-capture-db-gate; pnpm test:db |877/877 pass, zero skip/cancel/fail, exit0,45.42s|
| source-phaseb-capture-sql-gate; node scripts/db-test.ts |48migrations/five SQL files pass, exit0|
| source-phaseb-capture-goal-service-mock; node --test --test-concurrency=1 --test-timeout=180000 tests/integration/runtime-service.test.mjs |five/five pass, zero skip/cancel/fail, exit0; real local API/PG/worker/pinned dsh, local mock model only|
| independent-phaseb-capture-approved-full-runtime-20261013; node --test --test-concurrency=1 --test-timeout=120000 packages/persistence/src/conversation-runtime.db.test.ts |independent103/103 pass, zero skip/cancel/fail; exact code pins above|

Ordinary no-DB environment skips runtime-service; its actual PG/native/mock
crossing is explicitly covered by the separate five-test row. CON native reply
wire/path remains later work; no provider-backed answer is claimed. Independent
reviewer inspected the entire unfinished Step1 delta against07d, all tracked
changes, new0049/helper/tests, r12 and approved5/6, plus current records. No
actionable finding; code hold released. Final immutable publication confirmation
remains due before push. G3/current-main integration/app acceptance not cleared.

Owned PG42627/42626/48659/42141 absent; ports53399/53400/57659/53036 closed;
clusters removed, independently rechecked. Ordinary42588 absent; no new crossing
homes remain. Private renewed-20261013-0953/current-gates.safe.json proves the
complete dirty-file set and hashes equal the tested manifest before this docs
addendum. Earlier fail-before/after receipts remain intact. Runtime unit/profile
artifacts reproduce unchanged; no bundle/host/config/lock edit at Step1.

This supplies complete local Step1 gates and whole-delta source review, without
claiming an immutable publication pin until actually committed/reconfirmed or
automatic review until actually returned. Step2 waits for that pin/review. Current
publication identity and subsequent automatic verdict belong in the shared
mission receipt, not inferred from these local checks. Source-only20:00Rome
expiry and all operation limits remain. No new rollback/hosted effect.


## Exact publication recovery locator (pending until actually populated)

Authoritative private receipt:
`/Users/davidelaverga/.codex/operator-journal/CON-01/20261012-takeover/renewed-20261013-0953/publication.safe.json`.
It records actual final commit/tree, remote verification, push result, immutable
independent clearance, automatic request/result IDs and readiness separately.
At preparation it is pending, with no push or automatic verdict. No selfhash is
invented. The stable shared publication marker is **CON-01-TAKEOVER9-STEP1-PUBLICATION**
in [mission198](https://github.com/davidelaverga/Sophia/issues/198) and
[PR273](https://github.com/davidelaverga/Sophia/pull/273); use that marker and exact
head, rather than an older handoff5 publication. Subsequent actual result IDs are
populated in the private receipt/shared follow-up without another source commit.

Final independent publication check found two documentation P2 gaps: canonical
Next action retained the old pending amendment/08:00Z expiry, and current recovery
pointed to handoff8. Both now identify approved capture, passed local gates,
Step1 final publication→actual automatic review→Step2,18:00Z expiry, held Studio
conflicts and this exact locator. No executable code changed or check weakened.
Unpublished20c41bfb was superseded only for these documentation corrections;
actual final immutable identity belongs to the receipt and final independent
confirmation before any push. Prior executable tests/review stay at matching
code hashes, not extended to broader integration/live acceptance.
