# Deployment and independent in-app verification

**Executor:** the same independent Codex thread that reviews source, when the release operation is within its existing authority.  
**Closure owner:** the Codex programme coordinator.  
**Related:** [delivery and review](DELIVERY_AND_REVIEW.md), [design approval](DESIGN_APPROVAL.md), [acceptance matrix](../ACCEPTANCE_MATRIX.md).

## 1. Release outcome

A mission completes when its required capability is merged into main, the exact accepted implementation is deployed to the intended environment and the independent reviewer/tester successfully exercises the actual in-app journey. Source, merge, deployment and user outcome are separate observations. A ready endpoint or a model's completion sentence proves neither the whole journey nor its funding/authority boundaries.

**DEP-R01 — Keep review and testing distinct within one thread.** The independent Codex thread records a source-review run and an app-verification run with separate IDs, evidence and verdicts. Reusing the same thread for those duties is explicitly allowed. It remains independent of the Claude Code authors and returns defects to them for repair. If deployment access belongs to another authorized human/operator, the thread prepares the exact operation request, observes returned receipts and performs the app verification; it does not invent access or appoint a new required agent role.

## 2. Prepare an exact release before requesting any missing authority

**DEP-R02 — Reuse applicable authorization.** Discover source, deployment, migration, configuration and grant identities read-only first. A recorded authorization remains usable while its candidate/scope, target, effects, allowance and expiry cover the requested step. Do not repeatedly ask permission for routine steps already covered. If approval is missing, finish the concrete release request first and ask only the actual owner for the missing decision. This preserves the existing repository operation protocol. [S1]

The release request identifies:

- Mission/release ID, accepted source SHA/tree, repository and affected services.
- Current deployed identity and proposed artifacts/digests, configuration revision and feature cohort.
- Migrations by exact name/hash/order; compatibility of old/new components during rollout.
- Required environment variable names and secret references, without values.
- Resource owner, applicable grants, bounded test allowance and any expiry.
- Applicable Davide design decision and approval equivalence to the final source.
- Operation sequence, readiness probes, actual app cases, rollback/containment and stop conditions.
- Unresolved effects and the authority that covers each external action.

No new paid provider test, account delegation, secret upload, destructive data operation or expanded service target is implied by the phrase “test the release.” Where a real account step is required, prepare the rest first and let the owner authenticate through its official flow.

**DEP-R03 — Verify the merge gate immediately before integration.** Confirm the actual current PR head, independent source acceptance, automatic Codex coverage for all pushed commits, required CI and design approval lineage. Merge uses current repository authority, presently Luis or his explicit scoped delegate. A GitHub button being available is not authorization. A changed head returns to the relevant review gate; no accepted finding is silently dropped.

## 3. Bind source to deployed bytes

**DEP-R04 — Record the relevant release tuple.** Bind the deployed capability to its actual source/artifacts rather than a release name alone. As applicable, record Studio artifact and producer SHA, API/worker/native-host images or artifacts, dsh bundle/runtime digest, T3/runner version, database migration revision, configuration, enabled cohort and provider capability profile. Include only affected dependencies; no requirement to redeploy every service for a frontend correction.

The acceptance record contains the merge SHA, candidate SHA/tree and deployed producer/artifact identities separately. If an authorized pre-merge qualification already deployed exactly the accepted tree and dependencies, prove equivalence after merge and retain the original producer label; do not publish again solely to make the label match a merge commit. If equivalence cannot be established, verification remains incomplete.

**DEP-R05 — Use real runtime identity checks.** At the inspected Sophia baseline the runtime's composition gate, profile lock and artifact digests matter; a dsh process exit code or loaded plugin alone is insufficient. Runtime/lock changes follow the current artifact recording process and run from the deployed runtime artifact rather than workspace node_modules. Old status notes in runtime-unit.json are not current production evidence. Refresh the current release tuple rather than copying historical prose. [S2]

**DEP-R06 — Apply compatible migrations deliberately.** Use new migrations through existing conventions; never edit an already applied migration or run an assumed schema reset. Validate relevant migrations against real PostgreSQL, role/RLS behaviour and the supported transition from the prior deployed schema. Regenerate contract/OpenAPI/client types where the schema/API changes. A code rollback must be compatible with the schema that will remain; destructive rollback requires separate concrete authority.

## 4. Deployment sequence and failure handling

**DEP-R07 — Stage admission independently from observation.** Keep new capability admission disabled until its required services/contracts are ready and its owner/cohort is qualified. Turning off new work must preserve recovery, retained work reads and settlement of active or uncertain operations. Do not disable the very reconciliation path needed to determine whether a previously sent native command executed.

A typical bounded sequence is:

1. Confirm no new blocking authority, design or unsettled-effect change.
2. Apply compatible schema/configuration under the existing release request.
3. Deploy affected components in their documented compatibility order.
4. Verify artifact identities, health and the required bridge/runner route.
5. Enable only the approved capability and named founder/test cohort.
6. Run the selected real app cases and inspect corresponding receipts.
7. Close temporary test grants/fixtures according to the agreed cleanup plan; retain durable product/evidence records.

The exact order is chosen from the current deployment topology, not guessed from this example. Each step records attempted, confirmed, failed or uncertain effect and stops when its precondition no longer holds.

**DEP-R08 — Treat unknown outcomes as unknown.** A deployment timeout, lost response, native Stop acknowledgement or disconnected browser cannot be upgraded to success or failure without evidence. Reconcile the existing effect using stable IDs and actual target state before retrying. Do not create a second deployment/job/session to make uncertainty disappear. Preserve the cumulative allowance and both attempted and observed outcomes.

**DEP-R09 — Roll back admissions and code safely.** On a material regression, prevent new affected admissions, keep authorized observation/settlement available and apply the qualified containment/rollback. Retain failed artifacts, receipts and costs. Do not delete the failed attempt, revert the database blindly or let the router spend through another member to bypass the failure. A fallback within an approved resource policy is different from bypassing a permission denial or project Stop.

## 5. Actual in-app verification

**DEP-R10 — Exercise the intended user path.** Open the actual deployed app in a normal authenticated session and perform the required journey through visible controls. Record URL/environment, build identity, acting user/role, relevant browser/device/viewport, inputs, observed output and backing receipt/source identifiers. A fixture page or direct API request can complement this evidence but cannot substitute for the app episode. Label synthetic test content and fixture-based checks explicitly.

The reviewer/tester independently checks the relevant scope:

| Slice | Minimum real app evidence |
|---|---|
| INC-01 connections and Explore | Owner/provider connection state backed by real qualification, actual result, reconnect state, selected payer/model/effort and a retained API Explore output |
| INC-02 repository mission | Scope accepted, real PM/worker work, review/PR evidence, current phase/blockers, merge/release identity and observed running result |
| INC-03 natural composer | Correct human/Sophia addressing, explicit request routing, correlated existing-work follow-up and exact Explore source carried into Build |
| INC-04 allocation | Eligible role/model/effort selection, inspect/edit/pin behaviour, truthful wait/fallback and owner grant limits |
| INC-05 voice/founder release | Real voice inquiry and authorized PM follow-up, durable work after call/browser end and correct audience for delayed responses |

The matrix names the required positive and adverse cases. Do not turn this table into an exhaustive repeat of the entire October programme.

**DEP-R11 — Keep identity and privacy checks real.** Both founders must have their own qualified native bindings. Each founder must initiate or continue bounded repository work under their own bindings with actual candidate output before full programme closure. An API contribution must be genuinely used by the other eligible member. A role toggle in a fixture, server impersonation or an owner using their own contribution does not satisfy the cross-member case.

Use actual authorized account contexts and owner-controlled official sign-in. Prepare non-sensitive setup before an owner login handoff; do not collect their native session tokens or inspect unrelated history. Verify Personal/private content boundaries in derived titles, search, summaries, notifications and retrieval as well as the message body. A shared project permits only the scoped result/context, not the owner's entire native environment.

**DEP-R12 — Verify recovery at the changed boundary.** Select the relevant failure/recovery case: reconnect without duplicate action, revocation before dispatch, pinned resource unavailable, stale quota, lost receipt, repeated speech input, held mission inquiry, or delayed reply after audience change. The test proves the mechanism that changed. Browser reload alone is not a native-host restart test; a Stop receipt alone is not process/effect settlement; a transcript usage count is not remaining subscription quota.

**DEP-R13 — Record financial and setting truth.** Each paid/native episode records actual resource/account route, current grant, binding, requested/accepted/observed model and effort, usage observations and uncertainty. Separate an API credit benefit from provider native subscription allowance. If balance/remaining quota or final spend is unavailable, retain `unknown` with its source and freshness; do not infer it from plan price or context-window usage. No silent paid continuation, top-up or cross-payer fallback is admitted by testing.

## 6. Evidence quality and completion

**DEP-R14 — Use the evidence ladder accurately.** Source inspection proves a source path; unit/fixture checks prove their inputs; integration checks prove named components in that environment; native qualification proves the observed provider/host route; deployed-byte receipts prove a serving identity; app interaction proves the exercised user journey. None automatically upgrades to the next level. A case records passed, failed, blocked or not_run with evidence and limitations; a skipped check is not passed. [S1]

The release handback includes source-review run ID and app-verification run ID, current candidate/merge/deployment identities, operation receipts, affected acceptance results, design decision where needed, findings, rollback/cleanup status, unresolved effects and next action. Keep secrets and unredacted native logs out of Git and shareable screenshots. Store only the bounded evidence needed to assess the result.

**DEP-R15 — Fix observed defects through the author.** The reviewer/tester returns a reproduction with exact environment, inputs, source/version and smallest failing boundary. The coordinator assigns the repair to Claude Code, preserving the failed release record. New code follows the normal pre-push, automatic current-head review, applicable design and release gates. Reuse unaffected evidence with a recorded reason; rerun the failed boundary and its affected neighbours. Do not repeatedly regenerate a good artifact or rerun a content review merely to obtain a favourable verdict.

**DEP-R16 — Close at the correct scope.** A bounded mission can ship when its own criteria pass even while another founder/provider route is still being qualified. The overall founder programme cannot close until every mandatory mission case, all four native connections, each-founder repo work, actual other-member API sharing and the intended voice/continuity cases have passed or Davide explicitly amends scope. Deferred deck/image/import/migration features remain deferred, not completed. A failed production verification keeps the relevant mission open even if merge and deployment succeeded.

## 7. Acceptance examples

All cases begin `not_run`. Use actual environment evidence for release claims; a dry run establishes only the delivery procedure.

| ID | Scenario | Required observation | Evidence |
|---|---|---|---|
| AC-GOV-11 | Release is prepared under an existing valid scoped authorization | Exact candidate/targets/effects fit the envelope; no redundant approval request; out-of-scope effects remain excluded | Authorization reference, release request and comparison |
| AC-GOV-12 | Candidate is merged after prior preview deployment | Deployed artifact/tree/dependencies are positively mapped to accepted main; producer identity retained accurately | Merge/source/deployment tuple and equivalence check |
| AC-GOV-13 | Provider/runner/deployment reply is lost | Original effect reconciled before retry; no duplicate job/writer/spend; unknown status retained until resolved | Stable operation IDs and actual target observations |
| AC-GOV-14 | Rollout fails after a schema/component change | New affected admissions stop; existing work remains observable/settleable; compatible containment recorded | Rollback/containment receipt and active-work observation |
| AC-GOV-15 | CI/fixtures pass but real in-app journey fails | Case remains failed and mission open; exact repair is assigned to author | App evidence, defect record and unchanged closure gate |
| AC-GOV-16 | Founder cohort is presented for final closure | Four real native connections, each founder's own-binding repo output and other-member API usage are present | Qualified connection matrix, mission outputs and actual payer/actor receipts |
| AC-GOV-17 | One independent Codex thread reviews, operates an authorized release and tests it | Separate source and app evidence is retained, no authoring/self-approval, exact deployed behaviour exercised | Thread/run IDs, review and app-verification records |
| AC-GOV-18 | Significant UI reaches production or a subsequent repair changes it | Final candidate carries valid Davide approval/equivalence; material delta reopens the gate | Design lineage, final source and observed app state |

## Sources

- [S1 — Existing operation authorization and evidence ladder](https://github.com/davidelaverga/Sophia/blob/953e5dc3d4c88e491517f3f0d0eaa18216fea98f/docs/execution/2026-10-01-unified/operations/WORKING_PROTOCOL.md).
- [S2 — Repository runtime, toolchain and delivery rules](https://github.com/davidelaverga/Sophia/blob/953e5dc3d4c88e491517f3f0d0eaa18216fea98f/AGENTS.md).

[S1]: https://github.com/davidelaverga/Sophia/blob/953e5dc3d4c88e491517f3f0d0eaa18216fea98f/docs/execution/2026-10-01-unified/operations/WORKING_PROTOCOL.md
[S2]: https://github.com/davidelaverga/Sophia/blob/953e5dc3d4c88e491517f3f0d0eaa18216fea98f/AGENTS.md
