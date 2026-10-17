# CON-01 takeover51 — retained-lock checker composition

Same mission/session and worktree, Codex sole implementer; Claude stopped. Previous turn recovered handoff50 but added no implementation evidence; this checkpoint makes new verified source progress. Source approval handoff24 remains valid through 2026-10-14T10:00Z/noon Rome. Before-write record198/6160343670. Only r12 section3.4 launcher/tests changed. Pending27/36, Q8/profile, owner handbacks and shared integration remain separate and unapplied.

## Exact candidate and behavior

Published PR273 remains457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c. Unpublished launcher SHA2564589eddf238505021b78648c09a204e653c7d8dff683c24c6ab0d4d776f393e3; tests9608129323a98e6d0800f61943dff221cf63f484c6857bb957c7c090c937e946; wrapperf513bedcf811dbf912e515e0e4205c7e41c07f9f3218eb88d0173aa90b8001e9. Child/bridge/SQL/contracts/profile/artifacts unchanged from handoff50.

`check_attempt` composes every-root inventory, exclusive admission drains, lease life locks and process observations. It requires a named current gen root present in the inventory. Older unsealed gen roots remain unresolved. Duplicate homes, changed root/home identities or names, unknown entries and invalid scope refuse. All acquired drains, home descriptors and life locks stay held through final validation. One absolute deadline covers the complete observation and context unwinding; a late result raises rather than returning partial success. A stuck OS call cannot be preempted by this clock.

Empty homes are distinguished from lease-less nonempty homes and zero/torn leases. Empty descriptors are checked again during unwind. A whole launcher without a whole fork remains unresolved before any process inspection. Whole fork with missing/partial child needs the launcher gone; valid child needs both processes gone. Any unresolved process dominates live; live remains unsettled. Held admission/life locks do not produce gone. Public observations contain fixed reasons and identities, no raw content or error objects. Structural/namespace failures can raise, producing no report tuple.

Current-root absent/empty is only a filesystem observation and still requires the bridge's separate spawn fence. Sealed results depend on the installed one-way seal and writer protocol. Those are not installed yet. The returned tuple is not a reusable physical proof or deletion authority. Every CLI invocation still exits69, empty stdout; no installed serving caller, sweep, containment, fork or cleanup is enabled.

## Actual verification and review

Commands: `python3 -I -m unittest discover -s apps/execution-host/reply -p 'test_*.py'`, `node --test tests/unit/reply-launch.test.mjs`, `pnpm test`, Python AST function-size/arity audit, `git diff --check`. This stdlib launcher is outside the legacy Python backend; no backend test ran with system Python.

Initial67 Python and wrapper passed; ordinary46166 terminal0:2604passed/70existing skips/zero failures or cancellations. Isolated-copy mutation testing found two coverage gaps: accepting an incomplete fork survived because Darwin refused process inspection anyway, and skipping the home snapshot survived a test which only changed root names. These were test gaps, not source corrections. Independent reviewer released only the test file after the ordinary runner terminated. Added injected-gone incomplete-fork refusal with zero inspector calls, and unchanged-root-name duplicate-home creation during process observation. Initial testsb02c9a31 are superseded.

Final69 Python, wrapper and ordinary64621 terminal0:2604passed/70existing skips/zero failures or cancellations. Three isolated-copy mutants now assertion-fail exit1: ignore live process, accept incomplete fork, omit final home snapshot. Production source was never temporarily mutated. Function-size/arity and diff check pass; this is not a claim of the full structural gate.

Independent exact-pin review reports no actionable finding:69 Python, wrapper and seven independently constructed adversarial groups pass, covering both mutation gaps, all-root/life-lock retention, late empty fill, original deadline after late final validation, and descriptor/lock cleanup plus valid reentry. Holds released. All process observations synthetic; no actual proc/environment/pidfd/signal access. Owned test lock holders settled, temporary trees and mutation copies removed; all author/reviewer handles terminal.

Private evidence: checker-20261014-0545/author.safe.json, focused/wrapper/ordinary and final-wrapper/final-ordinary logs, mutations-initial.safe.json and mutations-final.safe.json. Independent receipt: independent-step4-checker-20261014/review.safe.json, read in full. This supports locally_verified and reviewed for this L1 component only, not whole-Step4, pre-push, Linux or physical-settlement qualification.

## Main, review and app checkpoint

Actual fetch advanced main to764137645bbfde737f0c033cfc7b18ccff1ad979/tree7cb7ffefd019d8f523252647aed5809d7c55a088, merged #308 UIKIT-73. Read its handoff and actual JoinFlow/ProjectShell diff. Preserve its member-invitation welcome scoped to joined project/tab, inviter/role/purpose/goals, dismissal/expiry and existing loading/blocked note, alongside #306 and earlier #287/#299–301/#304. Preservation posted199/6160423623. Current199 refresh showed no new owner handback before this post; no acknowledgement inferred.

Read-only merge-tree of published HEAD against main exits1, diagnostic tree3f28447da350f8578193ea4edc16d0419a9ec3a9, same11 conflicts: fixture-api, room, route, ConversationsView, OpenConversation, next-ask.test/next-ask/useNextAsk, ProjectShell, profile lock, runtime-unit. It excludes dirty Step3/4 and is not an integration candidate. No merge/reset/rebase/conflict/artifact writes. Actual refreshed automatic review273/6144338846 clears published457053b3 only. No push; every future push still requires actual automatic review.

CUA read the existing signed-in Sophia project Resources tab directly: Resources COMING, Account/Invite and Studio/Goals/Tasks/Knowledge/Updates/Resources navigation, no Conversations entry. No form, invitation, account, Join or Ask action submitted. Browser access exists; this is not CON app verification or a serving app/API/runtime tuple. Existing tab retained for the next bounded browser checkpoint.

## Operations, acceptance and handback

No hosted migration/configuration/deployment, account/member creation, grant/connection effect, credential access or provider/subscription execution. Product provider use0; assistant/reviewer compute unknown. No deployment request approved here. OP0002r6 setup/human-chat and OP0001r4 Ask remain unapproved/not ready. Ask stays disabled. Existing privacy, withdrawal, per-reply home and cumulative/uncertain-accounting limits unchanged.

Acceptance ledger unchanged:36 cases,18partial_L1/3passed_L1/15not_run; A30not_run. No whole-source_ready, combined reviewed, operational authorized, deployed, app_verified or owner_accepted promotion. Real PostgreSQL/provider/app gates retain prior evidence and outstanding obligations; this filesystem component does not replace them. Other missions and broader product stay open.

No unresolved author/reviewer process or test-resource effect remains. Published HEAD and earlier source pins are recovery references; no live rollback is needed. Future rollback must preserve governed records, withdrawal and cumulative/uncertain accounting. Next bounded action: implement the canonical launcher argv and pre-fork admission/durable lease writer under the same approved file scope, with synthetic/local lifecycle tests and independent review, before any containment or installed execution qualification. No autonomous monitor or promise of work outside this session.
