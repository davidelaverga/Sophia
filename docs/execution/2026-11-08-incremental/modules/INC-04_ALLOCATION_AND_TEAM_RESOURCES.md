# INC-04 — Automatic allocation and team resources

**Outcome:** Sophia selects an eligible resource, model, and effort for each new assignment, explains the selection, and lets Davide or Luis change the relevant preference. Shared contributions have enforceable scope. Quota displays reflect observed provider data.

**Delivery owner:** Codex coordinator. **Implementers:** Claude Code workers and Claude Code design specialist. **Verification:** the independent Codex reviewer/tester, with separate source-review and deployment-test records.

**Normative dependencies:** [domain/funding](../contracts/01_DOMAIN_AUTHORITY_AND_FUNDING.md), [runner protocol](../contracts/02_RUNNER_AND_SESSION_PROTOCOL.md), [allocation/events](../contracts/03_INTAKE_ALLOCATION_AND_EVENTS.md), [delivery](../operations/DELIVERY_AND_REVIEW.md), [design approval](../operations/DESIGN_APPROVAL.md).

## 1. Scope and prerequisites

INC-01 supplies actual resource identities, grants, capability observations, and qualified native connections. INC-02 supplies immutable assignments and a working repository mission. The allocator automates new admissions through those paths; it does not repair an unqualified connection by selecting it optimistically.

Begin with deterministic policy and a read-only selection preview, then enable actual new-assignment binding. Active worker and project-manager transfer remain deferred. A provider becoming cheaper, a reset approaching, or a user editing a preference does not move a running session.

The programme's delivery team is fixed by Davide: Codex coordinator; Claude Code workers and designer; automatic Codex PR review; one independent Codex review/test thread. This spec's product allocator may select qualified Codex or Claude Code alternatives for future Sophia-managed assignments while preserving role obligations. It must not silently replace the threads or providers implementing this programme.

## 2. Existing seams and additions

The baseline ResourcePanel/ResourceSheet already exposes useful seams for owner identity, model/effort, capacity windows, actions, and receipts. Resource data and command callbacks must come from the new authorized service, not fixtures. Existing research reservations and runtime admission establish useful accounting patterns; they are not a completed shared-account allocator. [S1][S2]

Add a versioned selection policy, qualified candidate projection, atomic account/grant commitments, immutable assignment binding, and bounded explanation. Use one inventory and one admission ledger. Do not maintain a browser-side competing balance or a Paperclip balance that can independently authorize additional Sophia effects.

## 3. Requirements

### INC04-R01 — Hard eligibility precedes ranking

For every candidate, require current actor/project/repository/source authority; applicable control and design holds cleared for the effect; provider route qualified for this owner/use; active grant for project, role, model, effort, duration and allowance; required tools/environment; independent verification eligibility; user pins; capacity policy; and current host/auth health.

Record exclusion reason codes without leaking private account details. A model recommendation cannot override a failed filter. Permission denial, withdrawn source, mission Stop, or design hold is not resource exhaustion and cannot be solved by another account.

### INC04-R02 — Distinguish connection, entitlement, and contribution

A connected tool is not automatically an eligible shared resource. Preserve connection identity, underlying provider/account entitlement, funding route, and owner contribution grant as separate records. The grant narrows provider eligibility; it does not create it.

Start cross-member use with qualified API contributions. A native contribution enters another member's eligible pool only after the provider route and technical delegation boundary are specifically qualified. Otherwise its owner can use it for their own work on the shared project, and other members see the permitted limitation. No pooled consumer login-token vault is introduced.

### INC04-R03 — Keep funding routes and units distinct

Explore defaults to the qualified API policy; repository execution defaults to qualified signed-in native resources. Funding follows the operation, not the visible lens. API benefit credits, paid API balance, native subscription windows, monetary budgets, call allowances, and concurrency slots are different dimensions.

Do not produce one universal “tokens remaining” number. A linked-plan API benefit must have verified account/organization attribution; a subscription price is not a balance. Strict benefit-only use requires an actually enforceable funding boundary under C01; unknown or stale benefit balance is not that guarantee. A separately authorized bounded total-spend policy is a different option. Automatic PR review retains its separately configured Codex integration and funding/limit record rather than being counted as a free local native call.

### INC04-R04 — Deduplicate accounts conservatively

Different devices, keys, and runner connections can share one underlying allowance. Use qualified provider/account identifiers or a safe verified fingerprint to group aliases. Do not infer identity from a display name alone. Keep native and API entitlement scopes distinct even when associated with the same commercial subscription.

When reliable alias identity is unavailable, label the limitation and apply the owner-approved conservative admission/concurrency policy. Do not fabricate an independent full allowance for each connection. Account-wide commitments include work across Sophia projects, not only the selected screen.

### INC04-R05 — Preserve observation provenance and uncertainty

Capacity observations carry source, entitlement scope, unit, window, observed time, freshness/applicability, reset information when supplied, and known limitations. Use every applicable limiting window. Context-window fullness and session token totals are not remaining subscription quota.

Unknown data remains unknown. Stale capacity cannot be shown as current. Passing a displayed reset time schedules an authorized refresh/reconsideration; it does not replenish a local wallet or resume held work. Provider outages and missing telemetry may use a conservative standing policy only when that policy is explicit and does not require a fresh reading the candidate lacks.

Provider limits may also be affected by activity outside Sophia. Display the distinction between provider-observed allowance and Sophia's own commitments; do not promise a hard provider billing cap that the adapter cannot enforce.

### INC04-R06 — Commit atomically before dispatch

Selection preview is read-only: no provider call, lease, or reservation merely to open a dropdown. Actual admission rechecks candidate and policy revisions and atomically creates the assignment binding, relevant account/grant commitments, writer/concurrency claim, and durable dispatch intent.

Two concurrent projects cannot each consume the same final slot or grant allowance. An idempotent retry returns the same binding. If a newer hold, grant revision, or source withdrawal intervenes before native dispatch, recheck and block new effects. Release a commitment only on evidence that the relevant effect never started or has settled under the accounting contract.

### INC04-R07 — Reconcile usage without double subtraction

Track consumed usage, outstanding commitments, and observation coverage separately. A later provider observation can include consumption already attributed to an assignment; do not subtract that consumption again as an unreflected commitment. Conversely, do not discard unsettled effects merely because no usage event arrived.

Use provider attribution where available and explicit uncertainty where it is not. Do not assign all account-wide movement to the most recent Sophia task. Retry, repair, steering, replacement attempts, and reconnect retain the mission's cumulative allowance and unsettled obligations.

### INC04-R08 — Protect management and verification capacity

Account/concurrency policy reserves capacity for project-manager responsiveness and required independent review/testing before filling remaining worker slots. Reserve the appropriate dimension supported by the route: measured budget where available, or bounded assignment/concurrency allowances when native quota is not reported.

Do not invent exact future native token costs. If the known policy cannot preserve required verification, wait or reduce parallel implementation. The same independent reviewer/tester can perform those roles sequentially, with separate run/evidence records. It cannot be the authoring session for that candidate. Same vendor or account does not itself defeat independence; author/session history does.

### INC04-R09 — Rank eligible candidates transparently

Use a versioned deterministic order: required capability suitability; explicit user preference; qualified capacity and protected reserves; observed reset/availability; recorded reliability; and the configured cost/latency tradeoff. Define stable tie-breaking by candidate identity. A decision record stores the eligible set, relevant input revisions, selected candidate, and concise reason codes.

Unknown capacity is not ranked above known capacity by assuming it is full. Expensive models are not automatically better for every task. This release does not require an inference call to choose a dropdown or compute arithmetic. An optional future decision-model scorer must have a bounded API payer and remain subordinate to all hard filters.

### INC04-R10 — Support automatic, preferred, and pinned policy

Offer policy for the pending action, project role, and applicable project/lens default. The most specific explicit setting wins within all owner-grant restrictions. Display that scope before saving. A preference allows eligible alternatives within its stated fallback allowance; a pin waits if the exact requested binding/settings cannot be honored.

A contributor can narrow or revoke their own grant; another member cannot broaden it by changing project preferences. Applying a change to future work leaves active bindings intact. If no eligible candidate exists, expose the concrete blocker and permitted next step without silently purchasing credit or changing payer.

### INC04-R11 — Distinguish requested, accepted, and observed settings

Discover or qualify actual model/effort support for the selected route/version. Retain provider-native effort values; identically named options need not mean equal compute. Requested configuration, adapter acceptance, and provider-observed effective configuration are separate evidence fields.

Reject unsupported strict settings before dispatch. If effective settings cannot be observed, mark them unconfirmed instead of presenting the requested value as a measurement. Capability catalogs can restrict options but do not alone prove account access. Defaults seed new admissions and do not overwrite a manual setting on an existing session.

### INC04-R12 — Keep fallback bounded and visible

A preferred resource that is offline, exhausted, or unavailable may fall back only for new work within the standing owner/project allowance. Show the effective resource, payer scope, model, effort, and reason before commitment where a preview exists; if availability changes between preview and admission, expose the actual binding in its receipt and retain both decisions.

Cross-payer paid fallback, increased caps, API continuation after an allowed benefit, and unqualified native sharing are never implied by “automatic.” Do not retry the same prohibition under another identity. No new attempt may overlap an old uncertain native effect; settle or reconcile it first.

### INC04-R13 — Never migrate active work implicitly

Editing a resource or effort preference changes the next eligible admission. Active assignments retain their immutable owner/account/session/worktree/model binding. If an active resource fails, show the observed waiting/failure state and available controls. This mission does not claim an automatic handover capability.

An ordinary new repair assignment can use a different eligible resource only after the prior attempt is settled, its source/output is reconciled, and authority and cumulative allowance permit the new assignment. A project-manager replacement remains a separately specified deferred operation.

### INC04-R14 — Make team management useful and bounded

Team resources shows contributions, scope, availability, current commitments, and why Sophia allocated a resource. It offers the owner a clear Manage use action for projects, roles, allowed settings, cap, expiry, and concurrency. Preview the exact audience and permitted use before activating a contribution.

The expandable project agent view includes every relevant role: project manager, workers, review, testing, and design when applicable. Display resource owner, native/API route, model, effort, active/waiting state, and available capacity observations. Review and testing can appear as separate obligations assigned to one independent thread.

Team resources does not duplicate the Inbox notification feed. Contextual connection errors and blockers can appear beside their resource. General notifications remain in Inbox. Ordinary collaborators see only the contribution and capacity detail allowed by its owner; secret material and unrelated projects remain private.

### INC04-R15 — Preserve production UI and approval

Wire and refine the existing resource components. Provide expandable detail, clear used/remaining/window/reset labels where known, explicit “Usage not reported” where unknown, keyboard operation, stable focus, and usable narrow layouts. Do not replace missing telemetry with illustrative percentages in production.

The allocation editor, significant resource-management changes, and changed hierarchy require the design specialist's working candidate and Davide's approval under the design protocol. Technical review cannot lift that hold. This is a gate for Sophia's own UI delivery, not a universal future customer approval rule.

## 4. Representative allocation behavior

| Situation | Result |
|---|---|
| Claude is preferred for a new worker but unavailable; eligible Codex fallback is allowed | Bind the new assignment to Codex and explain why. |
| Claude is pinned and unavailable | Wait; preserve the pin and identify the unavailable condition. |
| Two runner connections represent one native account | Apply one account-level capacity/concurrency policy. |
| Native quota is not exposed | Show unknown usage; admit only within the explicit conservative policy. |
| A contribution expires during a pending selection | Final admission refuses the expired grant; no dispatch through the stale preview. |
| A task is held but a second account has capacity | Keep the task held; resource selection cannot resume it. |
| The owner changes effort during active execution | Save the scoped future preference; the current binding stays unchanged. |
| A reviewer is also the implementation author | Exclude that session from independent verification regardless of spare quota. |
| The provider reports a reset but an old effect is uncertain | Refresh capacity while retaining the old effect and blocking duplicate execution. |

## 5. Implementation slices and activation

| Slice | Deliverable | Exit |
|---|---|---|
| INC04-S01 | Versioned policy, eligible set, read-only explanation | Deterministic tests, no implicit calls or reservations |
| INC04-S02 | Account alias mapping, commitments, reserves, atomic binding | Cross-project races and unknown-effect cases pass |
| INC04-S03 | Provider capability/usage reconciliation and strict settings | Truthful fresh/stale/unknown projections |
| INC04-S04 | Owner contribution and all-role allocation editor | Approved working UI, current-authority tests |
| INC04-S05 | Named-founder automatic new assignments | Real native assignment plus other-member API contribution usage |

Initially show selection previews beside explicit bindings. Enable automatic admissions for the named cohort after contract and race tests pass. Validate fallback using a controlled unavailable connection or test capacity observation, clearly labeled in test evidence; do not consume a founder's entire paid allowance to force exhaustion.

Rollback disables automatic new assignments and returns future work to explicit qualified bindings. Preserve all current bindings, commitments, controls, revocations, and reconciliation. A UI rollback cannot restore an expired grant or erase outstanding use.

## 6. Acceptance cases

| ID | Procedure and required result |
|---|---|
| AC-04-01 | Provide candidates failing role/tool/source/owner/model/grant gates; remove them before ranking and expose bounded reasons. |
| AC-04-02 | Repeat identical policy/input revisions; reproduce eligible set, rank, stable tie-break, and explanation without a model call. |
| AC-04-03 | Concurrent projects reserve aliases of one account; enforce the shared limit once and admit no duplicate final slot. |
| AC-04-04 | Exercise unknown/stale usage and overlapping provider windows; no invented full quota or misleading unified token balance. |
| AC-04-05 | Reconcile partially reflected consumption and uncertain effects; neither double-subtract usage nor release unresolved commitments. |
| AC-04-06 | Request excessive worker parallelism; preserve manager/review/test policy reserves or wait honestly. |
| AC-04-07 | Exhaust/unavailable preferred candidate with permitted alternative; bind new work within fallback bounds. Pin the same resource; it waits. |
| AC-04-08 | Change per-action/role/default policy; apply defined precedence while respecting owner restrictions and keeping active bindings unchanged. |
| AC-04-09 | Reject unsupported strict model/effort; distinguish requested, accepted, observed, and unconfirmed effective settings. |
| AC-04-10 | Use an owner API contribution through the other eligible founder; verify real output, payer, grant cap, project, and usage attribution. |
| AC-04-11 | Attempt cross-member native use without route qualification; exclude it while permitting separately authorized owner-initiated shared-project work. |
| AC-04-12 | Revoke/expire grant during selection and before dispatch; prevent new prohibited effects and retain truthful active-effect settlement. |
| AC-04-13 | Hold/Stop/source denial with spare alternate capacity; no fallback bypass. Unknown old effect likewise prevents duplicate new execution. |
| AC-04-14 | Deliver repeated reset observations across restart; refresh/reconsider idempotently without fabricating capacity or resuming held work. |
| AC-04-15 | Select independent review and test sequentially in one qualified thread; preserve distinct obligations/evidence and exclude authoring sessions. |
| AC-04-16 | Execute a real automatically allocated native assignment with permitted manual override in the application; exact effective binding survives reload. |
| AC-04-17 | Inspect all roles, expandable usage detail, sharing edits, owner/private visibility, and empty/error/narrow/keyboard states in the approved UI. |
| AC-04-18 | Disable automation while assignments run; preserve bindings, obligations, control, accounting, and recovery without new automatic dispatch. |

## 7. Required handback and completion

Return policy version and defaults; account-alias evidence; candidate/exclusion examples; concurrency/commitment test results; supported telemetry limitations; exact PR/release; design approval; independent source-review record; and real app evidence for native allocation and other-member API use. Include the meaning of every user-visible quota measure and the admission rule for unknown data.

Close after the approved allocation controls and server policy are merged, deployed, and independently tested. A screenshot populated by fixtures, a plausible recommendation, or one resource selected only in preview is incomplete. Deferred active handover and unqualified native delegation remain visibly out of scope.

## 8. Source grounding

The source paths below were inspected for the roadmap; INC-00 refreshes their current mapping. Their existence is not proof that the proposed allocator is implemented.

- [S1 — ResourcePanel](https://github.com/davidelaverga/Sophia/blob/9d6902d6b07f42cb4ef725a2524814f386680759/apps/studio/src/features/resources/ResourcePanel.tsx) and [resource types/projections](https://github.com/davidelaverga/Sophia/blob/9d6902d6b07f42cb4ef725a2524814f386680759/apps/studio/src/features/resources/resource.ts).
- [S2 — Research allowance foundation](https://github.com/davidelaverga/Sophia/blob/9d6902d6b07f42cb4ef725a2524814f386680759/db/migrations/0024_research_allowance.sql) and [runtime dispatch](https://github.com/davidelaverga/Sophia/blob/9d6902d6b07f42cb4ef725a2524814f386680759/apps/worker/src/runtime-dispatch.ts).
- [DSH role-default preservation pattern](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/src/app/role-models.ts).
- [T3 native provider-instance boundary](https://github.com/pingdotgg/t3code/blob/ade473018d32003658b7d38693e083ee2e314bd8/packages/provider-core/src/server/driver.ts) and [Claude behavior](https://github.com/pingdotgg/t3code/blob/ade473018d32003658b7d38693e083ee2e314bd8/docs/user/providers-claude.md).
- [OpenAI plan-linked API benefit](https://developers.openai.com/api/docs/guides/chatgpt-api-credits) and [Claude plan-linked API benefit](https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-ultra-and-team-plans). Verify actual account eligibility and current conditions during enrollment; no amount is assumed here.

[S1]: https://github.com/davidelaverga/Sophia/blob/9d6902d6b07f42cb4ef725a2524814f386680759/apps/studio/src/features/resources/resource.ts
[S2]: https://github.com/davidelaverga/Sophia/blob/9d6902d6b07f42cb4ef725a2524814f386680759/db/migrations/0024_research_allowance.sql
