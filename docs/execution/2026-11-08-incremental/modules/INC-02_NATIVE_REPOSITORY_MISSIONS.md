# INC-02 — One real repository mission through a verified release

**Outcome:** a bounded repository task runs through Sophia's project manager and agents, produces a reviewed change, merges under existing repository authority, deploys, and passes independent in-app verification.  
**Start gate:** one owner's Codex and Claude Code routes, immutable binding, native recovery/control and minimum admitted workspace profile have passed INC-01 qualification. Do not wait for the other owner's enrollment or API sharing.  
**Later founder gate:** each founder must also initiate or continue actual bounded repository work using their own qualified bindings before overall INC-05 release closure. AC-02-17 records this without delaying the first useful release.  
**Contracts:** [C01](../contracts/01_DOMAIN_AUTHORITY_AND_FUNDING.md), [C02](../contracts/02_RUNNER_AND_SESSION_PROTOCOL.md), [C03](../contracts/03_INTAKE_ALLOCATION_AND_EVENTS.md).

## 1. Product and delivery teams

This module implements the product's coding mission, not another coordinator for the delivery programme. Sophia's product project manager receives the accepted task, proposes bounded assignments and reconciles their results. Sophia enforces who may act, with which resources and on which sources.

The first product mission uses explicit qualified defaults: Codex project manager, one active Claude Code implementation worker, independent Codex source-review and deployment/test obligations, and automatic Codex PR review. Additional workers are admitted only for independent writable scopes and available reserved capacity. Automatic new-assignment composition is INC-04; no active resource migration is required here.

For **the team implementing this pack**, the user's exact roster is fixed: one Codex programme coordinator, Claude Code workers, a Claude Code design specialist, automatic Codex review on every PR push, and **one independent Codex thread performing both source review and in-app testing**. The latter performs two sequential stages, with separate `reviewer_run_id` and `tester_run_id`/evidence. It does not author the code it accepts. Do not create a required extra tester thread.

Product role obligations likewise retain distinct source-review and deployed-app evidence. A qualified independent thread may serve those stages sequentially where its capabilities permit; changing an author's role label never makes it independent. Runtime provider choices do not alter the delivery roster.

## 2. Existing seams and new work

Extend `packages/coordination`, `packages/paperclip-adapters/src/sophia-dsh`, the Paperclip plugin, worker coordination/dispatch, existing persistence/API and Studio's real work projections. The inspected integration supports a bounded dsh source-review attempt. It does not yet implement the native coding team. See the [refreshed source map](../references/BASELINE_AND_SOURCES.md).

Use the preferred T3/native boundary defined in C02 for provider sessions. Reuse Sophia's durable admission/outbox/receipts and existing operational commission/observation pattern. Do not introduce another scheduler, SQLite mission authority, complete superagent application or a second top-level manager. DSH Super Agent's durable input and existing-work correlation are design references, not a mandate to upgrade the runtime.

## 3. Requirements

| ID | Required behavior |
|---|---|
| INC02-R01 | One current project-manager authority/generation owns substantive coding coordination for a project. Concurrent start, retry and follow-up cannot create competing managers. |
| INC02-R02 | Freeze the accepted mission, target repository/base, allowed effects, source/criteria revisions, cumulative allowance and initial explicit role bindings. |
| INC02-R03 | Paperclip owns enrolled issue dependencies and one continuation path. Sophia retains admission and accepted meaning; native completion is evidence, not a second wake or acceptance authority. |
| INC02-R04 | Persist assignment, binding, commitment and idempotent dispatch before native execution; reconcile any possible prior send before replacement or replay. |
| INC02-R05 | Revalidate current member/source/grant/hold/profile/workspace authority at actual sends, resumes and consequential effects. |
| INC02-R06 | Separate writer worktrees/effect scopes. Enforce reviewer independence and explicit tester permissions; parallel authors never share uncontrolled writable state. |
| INC02-R07 | Ordinary human follow-up is queued once to the existing project manager, preserving prior work, generation, source context and cumulative allowance. |
| INC02-R08 | Hold/Stop, grant/source withdrawal and native permission waits have truthful request/settlement states; no hidden resume, new inquiry turn or replacement while unsettled. |
| INC02-R09 | Preserve exact candidate, source/assets, requested/accepted/observed settings, known/uncertain usage and unresolved effects in handback. |
| INC02-R10 | Review binds to the exact candidate; deployment/testing binds to the actual release. Changes stale affected coverage and cannot inherit unrelated green checks. |
| INC02-R11 | Follow whole-diff independent review before each delivery PR push, automatic Codex review on every push with every newly introduced commit covered, and current-head review/CI before merge. |
| INC02-R12 | A mission completes only after required change is merged into main, deployed and independently tested successfully in the app. Failed/unknown verification keeps it open. |
| INC02-R13 | Show real phase, project-manager status, blocker/decision, resource summary and evidence; agents and technical details are expandable. |
| INC02-R14 | Significant changes to Sophia's own Build/work UI enter the durable Davide design hold before dependent advancement, merge or activation. |
| INC02-R15 | Constrain native background inference/delegation; all admitted child/title/compaction/etc. operations are disabled or accounted under the approved policy and one wake owner. |
| INC02-R16 | Promote one exact accepted Explore source through the same repository mission path, preserving assets, decisions, mocks-to-replace and acceptance criteria. |
| INC02-R17 | Overall founder rollout includes actual repository output initiated/continued by each founder using their own qualified native bindings, with correct account attribution. |
| INC02-R18 | Release/rollback preserves legacy behavior, active mappings, receipts and unresolved effects; no schema rollback strands a native execution. |

## 4. Accepted mission and operational mapping

An accepted mission needs a concrete desired outcome, repository and allowed branch/worktree scope, accepted source/brief, success criteria, non-goals, current authority, resource policy and allowance. If an explicit user request already supplies these within a standing mandate, admit it without a ritual confirmation. If a material target or authority is missing, ask one focused question or show the exact prerequisite.

Create logical records for `work_mission`, `work_assignment`, `execution_binding`, native mapping, candidate, review evidence and release verification using existing persistence wherever possible. Each assignment records role, manager generation, source/criteria revisions, writable scope, dependencies and required handback. The manager can recommend assignments and settings; it cannot enlarge a grant, waive review, approve native permission requests or spend outside the bound policy.

Keep the project's existing Paperclip company boundary. Use one mapped issue per bounded assignment with actual dependencies, not just parent labels: candidate review waits for a candidate; repair depends on findings; deployed testing waits for the identified release. Safe operational summaries and pointers go to Paperclip; source bodies stay within the permitted disclosure boundary.

Commission through supported Paperclip services/APIs and record the upstream identity. Recover lost commission responses before creating another issue. Paperclip issue completion cannot directly mark the mission verified or cause a native child to wake the manager independently. Deduplicate both the result notification and the eligible manager continuation.

## 5. End-to-end execution

### 5.1 First bounded task

Choose a small real task in an approved repository with a deployable application and observable app outcome. The delivery programme first installs the necessary integration; the new product route then proves itself with that task. Do not use the programme coordinator's manually run CLI as evidence that Sophia initiated a native mission.

Start repository-first if waiting for Explore promotion would delay native qualification. After that path works, exercise one accepted Explore source through the same mission mechanism. The selected first task must be small enough for meaningful repair/review/test without exhausting either owner's allowance.

### 5.2 Runtime sequence

1. Persist accepted mission and one project-manager generation; validate its explicit native binding and reserve responsive manager/review/test capacity.
2. Enroll the operational commission, then create/attach the manager through C02 on its eligible wake.
3. The manager proposes the bounded worker assignment, dependencies and exact source package. Sophia validates and commits it before dispatch.
4. A Claude Code worker operates in its isolated worktree, returns the actual candidate/source manifest and checks, and identifies any unresolved effects. Its self-report cannot accept its own result.
5. The independent Codex review stage examines the relevant complete diff against the accepted criteria and exact candidate. Findings return to the manager; ordinary repairs are reassigned within the mission.
6. Every authorized PR push follows independent pre-push review and triggers automatic Codex review. Cover every newly introduced commit, and require exact-current-head independent review and normal repository gates before merge.
7. Merge under the repository's existing authority. Deploy the exact merged artifact/configuration/migration tuple through the permitted operator path.
8. The independent Codex thread executes the in-app testing stage against that actual release, including the changed ordinary user journey and the focused adverse/recovery case.
9. Record verified evidence and return a useful outcome to the originating conversation. If any necessary gate fails, retain the open mission and route its next bounded action.

The delivery reviewer can review successive worker candidates and later test the release in one thread. It may perform authorized deployment/test setup and fixture cleanup, but it returns product-code defects to the coordinator for a worker repair. That preserves independence without adding an extra thread.

## 6. Follow-up, control and failure behavior

Resolve a follow-up to the existing mission and current manager mapping before proposing new work. Preserve stable input/request identity, exact target/source references, audience, scope and admission result. Explicit queue delivery means a later manager turn; it is not silent active steering. Receipt states distinguish recorded, delivered/received, accepted into work, applied to a candidate and verified by evidence.

The manager may reject a follow-up as out of scope or return a material decision. Store that result without losing the user's message. An explicit within-scope instruction can proceed under current authority; ordinary feedback such as “this feels crowded” does not independently authorize a large implementation.

| Failure or wait | Required response |
|---|---|
| Possible start, response missing | Reconcile the prior command/session; do not create a fresh native attempt |
| Manager/worker observer restart | Recover durable mappings and outstanding effects before any wake |
| Provider at usage limit while process remains alive | Show resource wait and active/settled state separately; no competing writer |
| Missing permission or disallowed tool | Route to the actual authorized owner; do not change accounts to bypass refusal |
| Hold/Stop or source withdrawal | Fence future effects, request supported settlement, retain uncertainty and evidence |
| Inquiry during Hold/Stop | Read permitted retained evidence; otherwise retain a waiting question without a new native turn |
| Stale-generation result | Retain for reconciliation; do not advance current dependencies or publish a candidate |
| Review finds a defect | Complete review evidence with adverse verdict; candidate remains unaccepted and repair is assigned |
| Test environment unavailable or deployed app fails | Keep release verification open; name next owner/action, never mark the mission complete |

A writer lease or process monitor only supplies its actual evidence. Losing a lease does not physically revoke an already-running process. Require confirmed settlement or effective isolation from the shared workspace/tools/effects before replacement. Cumulative mission consumption and unresolved commitments survive retries, repair, resource exhaustion and window resets.

## 7. Exact source, candidate and release evidence

An Explore promotion package contains the accepted brief/decisions, exact artifact/version/assets and hashes, repository/base, allowed writes, preservation constraints, mock behavior that must become real, success criteria, open decisions and remaining allowance. Keep the source design distinct from the resulting implementation preview. Clicking a lens or merely viewing an artifact creates no mission.

Worker handback includes base/head/tree identities, changed paths, allowed untracked asset inventory and hashes, actual commands/results, native run/binding/settings, output artifacts and unresolved external effects. Reject missing critical assets or mismatched preview identity instead of pretending a screenshot is complete source.

Each source review names candidate, criteria, reviewer execution, tools actually used, findings, verdict and limitations. The same independent delivery thread's later test evidence names a different verification execution/stage, deployed build/release/environment, browser/app journey and observed result. A native reviewer lacking browser access cannot claim in-app testing. A successful test on a different deployment does not accept the candidate.

Changing a candidate invalidates the affected coverage. Unchanged evidence may be retained by explicit scope/identity mapping; do not blindly retest unrelated historical features or accept an old green result for changed behavior. Final closure requires the release tuple and all current relevant evidence specified in [deployment/verification](../operations/DEPLOYMENT_AND_VERIFICATION.md).

## 8. Build UI and design gate

The active Build view prioritizes the mission outcome, current phase and next meaningful status or blocker. Show “Sophia's project manager” and “Sophia's agents.” The expandable agent/resource view covers all active role assignments, owners, models and efforts; do not show only the manager's settings.

Keep one selected-work page and a focused toolbar/optional panel within the current production system. Surface decisions beside the blocked work and in Inbox. Preserve conversation continuity, exact source versions and clear source-design versus implementation-preview labels. Avoid replacing useful work status with a decorative preview or a stream of raw agent events.

The designer implements concrete production improvements and presents the significant candidate under [design approval](../operations/DESIGN_APPROVAL.md). `awaiting_design_approval` blocks dependent UI work, merge and activation until Davide explicitly approves that scope. It survives restart and cannot be lifted by reviewer/CI success. Unrelated authorized backend work can continue.

This Davide gate applies to Sophia's own UI changes in this programme. It is not a new global requirement for every future user's repository mission; those use their project's own approval authority.

## 9. Implementation slices

| Slice | Work | Exit/dependency |
|---|---|---|
| INC02-S1 | Mission/assignment/manager generation and safe read projections | C01/C03 and first owner native pair; atomic manager/writer ownership tests |
| INC02-S2 | Bounded T3 qualification and Paperclip native commission/observer mapping | C02 create/attach/read/input/control/reconcile proven at selected profile |
| INC02-S3 | Real manager + single worker task with durable candidate handback | Bounded native output initiated through Sophia; no manually substituted route |
| INC02-S4 | Independent review, repair, every-push automatic review and exact source gates | Current candidate evidence with one independent delivery reviewer thread |
| INC02-S5 | Merge/deploy/in-app test and active Build projection | Exact verified release; significant UI has Davide approval |
| INC02-S6 | Accepted Explore promotion and founder coverage | One exact Explore-to-repo case; second founder's own-binding episode completed by INC-05 |

The coder and designer can work in parallel on disjoint scopes after contract ownership is frozen. Use separate worktrees and coordinate shared UI files, migrations and generated contracts. Scope native read/write qualification by operation; a successful read-only INC-01 test alone cannot enable push/deploy tools.

Rollout begins with one qualified owner, repository and role set. Preserve the existing bounded dsh/source-review route. Capability flags turn off new native admission without disabling observation, controls, candidate reads or settlement. Do not downgrade beneath active records or delete mappings when rolling back a runtime.

## 10. Acceptance cases

All results start `not_run`. Fault tests establish protocol boundaries; bounded live tests establish real integration. AC-02-17 is explicitly a required **overall founder-release gate**, executable during INC-05 rather than a prerequisite for the first INC-02 release.

| ID | Procedure and required observation | Covers |
|---|---|---|
| AC-02-01 | Run one actual bounded repository task through Sophia with fixed native roles; inspect actual Paperclip/native identities, candidate, main merge, deployment and independent successful app interaction | R01–R04, R09–R12 |
| AC-02-02 | Race/replay two distinct coding starts in one project and manager/assignment transitions; one active coding mission/manager authority, unrelated request durably waits, and one writer owns overlapping effects; independent projects can run in parallel | R01, R04, R06 |
| AC-02-03 | Lose start responses before/after native acceptance and restart observer/runner; exactly the prior execution is found, or uncertainty blocks replacement | R04, R08 |
| AC-02-04 | Duplicate native completion/Paperclip dependency notices; one result reconciliation and one eligible manager continuation, with no second wake owner | R03, R15 |
| AC-02-05 | Hold/Stop before send, during run and during a lost control response; fence future effects, preserve honest settlement and read-only retained inquiries. Qualify explicit Resume from held/settled state if exposed; unknown/stopped/unsupported Resume cannot attach/restart into execution or reset binding/allowance | R05, R08 |
| AC-02-06 | Revoke grant/withdraw source/change membership between commission and dispatch and during execution; new sends stop and actual active settlement is retained | R05, R08 |
| AC-02-07 | Simulate provider limit while native process remains active; no stopped claim, replacement writer, erased commitment or reset mission allowance | R08, R09 |
| AC-02-08 | Deliver duplicate ordinary follow-up while manager is active; one explicit queued message reaches that manager, prior work/source/generation survives, and receipt never overstates application | R01, R07 |
| AC-02-09 | Attempt foreign project/company/native IDs, out-of-scope tool calls and general MCP access; refuse without transcript/existence leak or alternate-account bypass | R05, R06 |
| AC-02-10 | Parallel writer scopes use isolated worktrees; reviewer cannot author accepted code, tester's allowed fixture writes do not confer implementation authority | R06 |
| AC-02-11 | Change candidate after review and change deployment after testing; stale evidence cannot accept the new candidate/release | R09, R10 |
| AC-02-12 | Audit every delivery PR push for whole-diff pre-push independent review and automatic Codex coverage of newly pushed commits; exact latest head has required independent review/CI before merge | R11 |
| AC-02-13 | Significant Sophia UI candidate waits for Davide; restart, automated review, technical signoff and merge request cannot bypass the hold; material UI revisions require renewed approval | R14 |
| AC-02-14 | Trigger native title/child/compaction/automatic retry behavior; disabled or explicitly admitted/accounted under policy, without T3/Paperclip double continuation | R03, R15 |
| AC-02-15 | Hand back changed/untracked assets and exact source; missing asset/hash/candidate mismatch is detected, not silently omitted from review/deployment | R02, R09 |
| AC-02-16 | Promote one accepted Explore version/assets into a real repository task; same source/criteria retained, mocks-to-replace tracked, source design and implementation preview distinguished | R16 |
| AC-02-17 | By INC-05 closure, Davide and Luis each initiate/continue bounded repository work under their own qualified native bindings and produce actual candidate output with correct attribution; no unqualified delegated subscription use | R17 |
| AC-02-18 | Force adverse review and failed/unavailable deployed-app verification; ordinary repair returns through manager, mission remains open until the actual release passes | R10, R12, R13 |
| AC-02-19 | Disable new native admission during active work, reload Studio and recover observer; legacy route and observation/control/evidence survive without a fresh unadmitted run | R18 |

## 11. Handback and release gate

The worker handback includes new/changed contract and migration IDs, actual source/version/profile pins, qualification gaps, role/session/mapping evidence, exact candidate manifests, commands/checks, review coverage, design hold/approval where applicable and unresolved effects. The independent Codex thread supplies its own source-review and actual deployment/app-test records.

The first INC-02 release can close once the real mission, exact Explore promotion and all applicable first-release cases pass. AC-02-17 remains visible and mandatory in the overall acceptance ledger until both founders' native work is proven; it cannot be marked passed, waived or complete merely because the first owner succeeded. Overall [mission completion](../MISSION.md) additionally requires INC-01's four connections and real cross-member API use, natural routing, allocation and qualified voice/release outcomes.
