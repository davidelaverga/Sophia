# Mission 1 — WBC-01
## Finish the Tasks experience for real work state

**Owner:** Luis. **Product/contract decision owner:** Davide. **Implementation:** Luis's chosen coding agent. **Independent reviewer:** Codex.  
**Delivery:** one new follow-up PR from current main, `lfe-07/workboard-readiness`.  
**Parent scope:** LFE-07.1, the shared LFE-06 controls and the interface portions of SCM-03/04.  
**Status:** ready as implementation instructions; no new application acceptance has been executed.

## 1. Outcome

Luis can demonstrate his existing Tasks view with accurate completion, current assignment, required-person, command, decision and result behavior. The same validated view shape can then be supplied by a real backend without rebuilding the layout or changing what the controls mean.

**This is UI readiness, not live coordination.** Production remains on its existing path until WBC-02 supplies a qualified real view. The PR does not close the complete frontend track, technical lead, quota allocation or external-engineer goals.

## 2. Read first and retain

Read [current ledger](../01_CURRENT_LEDGER.md), [binding contract](../contracts/01_WORKBOARD_BINDING.md), the current v2.0 LFE-07/SCM-03/SCM-04 specifications and the current source listed in [the register](../sources/REGISTER.md).

At `c8dd5aa…`, #63 and later work are already merged. Retain recursive rows, decision revision/expiry, named-assignment lookup, request-derived waiting owner, Sending-before-Recorded, the shared SessionActs component, task-keyed actions, late-answer protection and the unified work type scale. Reproduce their tests before modifying their seams. Do not mechanically reapply the prior review against `df4b6f00…`.

Preserve the goal rail, next checkpoint, compact tiles, sheets, dependency threads, source references, local views, drafts, mobile/call controls, reduced motion and the occasional local icon greeting. No extra models, telemetry events or peer messages for decorative motion.

## 3. Exact changes in this PR

### G1 — Bind the view; do not turn activity into plan revisions

Adopt the proposed `sophia.work.board.v1` view from this packet through one feature-local adapter. It contains current/proposed plan definitions plus live item projections; it is not a database schema. Preserve the plan's existing deliverable, criteria, source-scope, recipe and review-policy references when producing its v2 definition.

Each plan names the goal and goal revision **as well as** mission revision. Keep the accepted plan visible when a proposed replacement appears; label and compare the proposal separately. A session activity update changes the projection, never the accepted plan revision. At most one accepted plan revision governs a goal at a time; backend enforcement comes in WBC-02.

Consume an explicit current assignment/attempt/generation. A disconnected session is not an unassigned task. Keep legacy fixture conversion in one named adapter and never silently synthesize a live generation, permission or completion record. Unknown assignment means unknown, and write controls remain unavailable.

Allow `sophia_native`, `owner_native` and `human` doers. The first Paperclip integration is a Sophia-native reviewer: show **Sophia · Source reviewer**, not a fabricated Claude/Codex account or quota. Resource account configuration remains in Resources.

**Handback:** validated fixture view, one conversion seam, exact types and contract examples. No OpenAPI route is registered as implemented in this PR.

### G2 — Correct the lane projection and result entry

Keep four columns: **Active / Up next / Unassigned / Complete**. They are a view over state, not four new operational statuses.

- Active: running, waiting, held, ready for review or changes needed. The chip supplies the actual condition.
- Up next: assigned/planned/queued work that has not begun; show all activation requirements.
- Unassigned: work with no admitted assignee. Dependency conditions remain visible even here.
- Complete: the item's own declared completion policy is satisfied with applicable evidence.

A candidate waiting for required review stays Active. A review that found a defect can itself complete while the implementation needs changes. A passed check on candidate A cannot certify candidate B. Do not require a human to approve every routine operation merely to make Complete reachable.

Retain stopped, cancelled, failed and superseded items in an accessible **Closed work** disclosure with count/reason; failures still being repaired remain an active obligation. No item silently disappears and no closed failure is colored as success.

Add **Open result** and, when qualified, **Review candidate** next to the candidate in the sheet. The port carries an exact Source/candidate version and its evidence; it never constructs arbitrary provider URLs. No candidate means no invented link. A previous usable candidate remains available, clearly marked, while a new attempt is running or failed. In this PR use a labeled source fixture through the result port, not a new artifact renderer.

**Handback:** review-negative and candidate-stale scenarios are understandable on desktop and phone. M03's report/Knowledge implementation is not duplicated.

### G3 — Required people and available controls

Consume typed `waiting_on[]` references. Native permission, product decision, prerequisite, capacity and connection waits can have different respondents. Compute For you from an unresolved actionable request for this viewer—not the executor's account owner. Show a compact cross-goal attention link without changing the viewer's selected goal.

Replace the owner-only guard on **shared task actions** with the projected per-viewer availability, reason and qualified effect/boundary. The fixture service supplies these values for tests; the browser does not derive grants from roles or logos. Missing availability means unavailable, not allowed.

Authorized project builders can guide contributed assignments under the owner's mandate. Native credentials/permission responses/reserve changes remain owner-bound. Keep owner-local management controls distinct from shared task controls; do not remove their existing owner guard globally just to fix the task sheet.

Support a Resume affordance only for a genuinely held task whose action projection permits it. Do not automatically resume after a queued message, a quota reset or navigation. Stop speaking and Stop task stay separate.

**Handback:** Luis can steer an allowed shared assignment on Davide's resource in a fixture, but cannot answer Davide's native approval or change his reserve. A viewer can ask/read without retasking.

### G4 — Commands and decisions tell the truth

Extend, rather than duplicate, `resources/SessionActs.tsx`. Carry stable work, assignment, attempt and command identities. State storage is keyed by `(project, work, assignment generation, command)`; a display may summarize the latest command but retains unresolved history. Reusing one session for another assignment cannot inherit old drafts or receipts.

Keep Sending before admission. Use the receipt dimensions in [the contract](../contracts/01_WORKBOARD_BINDING.md): admission, delivery and effect settlement. Guidance delivery is not checked compliance. A Hold or Stop is not complete on Delivered. Represent Held, Stopped, refused, unavailable and outcome unknown. Do not invent native-consumed observations on routes that lack them.

Replace “Ends its session's work at once” with **“Stop this task? Completed work is kept. Running actions may need time to stop.”** After delivery say **“Stop requested; waiting for the runtime to confirm.”** After verified settlement say **“Stopped. Completed work is kept.”** Explain a controlled-stop-and-resume route when it is not a true native pause.

A definite pre-dispatch refusal may say nothing was sent. A lost reply may not. Preserve and reconcile the same operation key; disable a conflicting new answer while a decision's outcome is unknown. Receipt events arriving out of order cannot regress a settled result, and a callback for task A cannot change task B.

Change decision copy to **“Your choice is recorded. The plan is updating.”** The human decision becomes authoritative when the service commits it; an agent's later reaction is a separate state. Retain the existing revision/expiry fixes and include bound work/plan/candidate references. Expiry/no answer makes no default selection.

**Handback:** delayed, duplicated, out-of-order and lost-result fixtures; real effects remain unimplemented.

### G5 — Ask, freshness and attention

Keep Ask in the task sheet. Its port targets the same shared Sophia conversation with current work references and one question identity. Do not call the coding worker, start a second conversation model, use private memory, enable a microphone or route an ordinary question as a work amendment.

Replace the fixed word-reveal timer. The port accepts correlated received chunks or one completed answer; show completed text immediately when that is all that exists. Preserve the current latest-answer guard and extend it through task/plan navigation and reconnect. An unavailable conversation shows the retained question plus an explicit route to open the existing conversation—not a fabricated answer.

The first PR uses labeled response-event fixtures. It does not bind a live Ask endpoint. Seeing this component does not prove the backend can answer it.

Keep the ring as **Last report age**; expose connection state independently, and never label an agent stuck from an old report alone. No model request for animation/freshness. Prioritize decision/result/blocker changes in While you were away; expose full text without hover. Browser-local seen state is described as such. Reset view-local state on viewer/project/plan identity changes, preserve valid local selection during normal live updates, and never mark a decision accepted because it was seen.

**Handback:** desktop, touch, keyboard and reduced-motion scenarios with the existing typography; no global navigation or room redesign.

## 4. Files and ownership

| Existing seam | Mission action |
|---|---|
| `apps/studio/src/features/work/planning/plan.ts` | Separate plan definition from projected facts; typed waiting and completion evidence. |
| `PlanBoard.tsx`, `TaskTile.tsx`, `PlanTab.tsx`, `lenses.ts` | Lane projection, attention, supported hierarchy and native/human doers. |
| `TaskSheet.tsx`, `TaskActions.tsx` | Source/result port, scoped capabilities and exact target identity. |
| `apps/studio/src/features/resources/SessionActs.tsx` | Shared command semantics; preserve resource-owner management behavior. |
| `Decision.tsx`, `AskSophia.tsx`, `seen.ts` | Correlation, receipts, real-chunk presentation and view identity. |
| `GoalList.tsx`, `GoalCard.tsx`, `studio/ProjectShell.tsx` | Validated plan slot and stable local goal selection. |
| Existing fixtures and `apps/studio/e2e/work.spec.ts` | Extend, not replace, regression coverage. |

New proposed destinations are feature-local `planning/board-view.ts` and `planning/board-reducer.ts` only when the existing modules cannot host the small interfaces cleanly. Reuse current style tokens and shared primitives. No broad store/framework replacement.

Davide reviews the contract delta before the UI creates new assumptions. Protected: production route registration, migrations, dsh/runtime manifests, provider credentials, current M03-owned components and frozen guide/pack assets. Add the proposed schemas to this mission's documentation and validate the fixtures; WBC-02 owns their live amendment/generator promotion.

## 5. Acceptance matrix

All application cases begin **not run in this packet**. Record regression-before/fix-after evidence on the exact PR candidate.

| ID | Scenario | Required result |
|---|---|---|
| UI-01 | Three-level plan; unknown parent; malformed cycle | Every item is either represented once or clearly rejected; no hidden work or browser recursion failure. |
| UI-02 | Old and current attempts share work/session history | Only exact current binding receives actions; no live fallback to array order. |
| UI-03 | Accepted plan plus proposed replacement | Accepted work remains visible/operative; proposed actions never inherit execution authority. |
| UI-04 | Review finds defects | Review can be Complete; implementation is Changes needed. |
| UI-05 | New candidate after old passing check | Old evidence cannot mark new candidate complete. |
| UI-06 | Stopped/failed/cancelled task | Visible closed reason, not successful Done. |
| UI-07 | Luis's resource awaits Davide's decision | For you addresses Davide; native permission still addresses the actual account owner. |
| UI-08 | Authorized builder versus viewer versus owner | Shared guidance works only under projected grant; no owner-account power is transferred. |
| UI-09 | Admission is delayed or lost | Sending until committed; unknown is not recorded or safely unsent. |
| UI-10 | Hold/Stop delivery without settlement | Pending/unknown shown; no Held/Stopped assertion. |
| UI-11 | J/K, close/reopen, same session new assignment | Drafts and receipts remain attached to their original work/generation. |
| UI-12 | Duplicate/out-of-order command observations | No regression, duplicated command, or overwritten newer action. |
| UI-13 | Decision changed/expired/unknown | Stale answer refused, expired disabled, same-key reconciliation before a new choice. |
| UI-14 | Human answer committed but lead not run | Choice recorded; plan reaction pending—not human still undecided. |
| UI-15 | Overlapping asks and late answer | Correct correlation; no fake streaming or answer under wrong question/task. |
| UI-16 | Native Sophia source-review item | Correct native doer label; no fictional subscription resource. |
| UI-17 | Old report during healthy long tool | Freshness ages without inferring failure; connection shown separately. |
| UI-18 | Result revision fails | Previous usable exact result remains openable; no false publication. |
| UI-19 | Dependencies off-screen; phone and keyboard | Full conditions and result/action links usable without hover. |
| UI-20 | Active call, reduced motion, account switch | Media exits remain reachable; decorative motion stops; previous viewer attention doesn't leak. |
| UI-21 | No real backend/feature capability | Existing production path unchanged; fixtures never imported into live data flow. |

## 6. Definition of done and stop condition

Run actual repository toolchain, formatting/lint/type/contracts checks, affected unit suites and the existing Studio browser/build scripts. Read the current package names instead of copying an obsolete filter. Record platform and known baseline failures; do not weaken unrelated runtime gates.

Luis reviews one desktop and one phone walkthrough that includes the adverse cases, not only the happy path. The PR handback includes the contract digest, retained fixes, tests, screenshots, live-backend dependencies and exact code ownership transfer.

**Stop after this single useful UI-readiness PR.** No live backend prerequisite is invented for finishing it; no fixture pass is reported as a live deployment. Do not expand into the quota optimizer, full handover, personal assistant, image/prototype generation or application co-review.

**Prompt/skill delta:** none in runtime or model prompts. This is display/interaction and proposed-contract work. No hosted operation or new paid call is authorized.
