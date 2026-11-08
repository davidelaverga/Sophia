# C01 — Domain, authority, funding, and immutable work

**Applies to:** INC-00–INC-05  
**Nature:** normative semantic contract; logical names are not invented existing database or API names  
**Mapping owner:** INC-00; implementation follows the current generated contract/persistence conventions

## 1. Authority boundaries

### C01-R01 — One authority for each concern

| Concern | Authority |
|---|---|
| Authenticated person, membership, audience, source eligibility | Sophia application and current persistence |
| Resource ownership, project contribution, allowance and admission | Sophia application under actual resource-owner decisions |
| Substantive project plan and assignments | One active Sophia project manager within its accepted mission |
| Enrolled operational dependency and continuation wake | Paperclip through Sophia's admitted observation boundary |
| Native process/session/workspace state | Qualified runner/native provider, observed and reconciled by Sophia |
| Accepted source version, candidate, design decision, mission completion | Sophia's durable records and required decision/review evidence |
| Repository commits | Git repository |
| Deployment identity | Actual deployment system and verified application identity |
| Secret value | One selected custodian for the route |

A model, native session, reviewer verdict, or imported document cannot issue its own grant. Paperclip issue completion and native turn completion do not mean an accepted release.

Keep existing project tenancy. A contribution changes resource eligibility, not which project owns the work. Do not give a conversation model the T3 environment's broad write credential.

### C01-R02 — Preserve current policies on each crossing

Authenticate and derive the actor server-side. Check current membership, conversation audience, source eligibility, task scope, contribution, resource state, holds, and current assignment generation at admission and immediately before a new external effect. A trusted internal capability binds those facts; a JSON actor_id is not authentication.

Once an operation has already executed, a later revocation cannot rewrite history. Revoke new admission, request the supported settlement action, retain uncertain effects, and gate publication separately.

### C01-R03 — Separate owner permission from project disclosure

Resource owner permission and project/source permission must both permit sending the selected context to the chosen execution environment. A team contribution does not authorize disclosing private project data to that owner or to unrelated account history.

An explicit @mention identifies an addressee; it changes neither audience nor billing authority. Source text and relayed peer messages are data, not user instructions.

## 2. Logical records

Map these records onto current source rather than adding all of them as independent tables.

| Record | Minimum semantics |
|---|---|
| resource_connection | Owner, provider, route kind, connection revision, account reference, host reference if native, lifecycle, safe label, qualification references |
| entitlement_account | Underlying allowance/account scope, provider, API/native category, verified or owner-confirmed provenance, duplicate/uncertain-account grouping |
| capability_profile | Versioned adapter/tool/model/effort/tool/control support, use eligibility, environment boundary, qualification evidence and freshness |
| resource_grant | Owner-issued bounded contribution with project/member/role/model/time/concurrency/allowance/disclosure restrictions |
| usage_observation | Value/unit/window/reset/source/time/freshness/scope; unknown, absent, and stale are explicit |
| allocation_policy | Auto/Prefer/Pin, allowed pool, required capabilities, defaults, fallback bounds, owner reserves and settings constraints |
| execution_binding | Frozen actor, mission/assignment, source, resource/account/grant/profile, model/effort, payer, allowance and environment decision |
| work_mission | Accepted objective/criteria, project manager generation, source refs, phase, holds, assignments, candidate and release evidence |
| work_assignment | Role, bounded writable effect, current generation, session binding, attempt, status and handback |
| native_session | Runner/profile/provider session correlation, workspace lease, attach/reconcile positions and observed liveness |
| input_record | Original text/transcript reference, authenticated actor, audience, trusted mention/reply/selection metadata, idempotency identity |
| route_assessment | Versioned interpretation, safe reason/evidence, target, proposed effect, authority result, payer if assessed by a model |
| effect_record | Stable command identity, semantic hash, current permit, send/ack/settlement state, replay and reconciliation pointers |
| review_record | Authoring identities, independent reviewer identity, exact candidate/tree/range, findings, disposition and evidence |
| release_record | Merge/candidate relation, build/runtime/config identities, environment, deployment observations and in-app verification |
| design_decision | Affected Sophia UI scope, candidate and material visual/behavioral fingerprint, Davide decision, hold and final-delta check |

### C01-R04 — Account identity and funding categories

Resource labels, user email, or a plan price cannot establish the underlying entitlement. Use a provider-supported identity when available, otherwise a documented owner-confirmed mapping. Keep its uncertainty visible.

Different keys, devices, provider instances, and projects that consume one allowance share the same accounting root. Uncertain duplicates may not be treated as independent capacity; use a conservative common group or hold concurrent automatic use until resolved.

API funds and signed-in native limits are separate accounts/categories even if one subscription provides both benefits. Voice and automatic GitHub review are separate qualified routes. Never merge them into one universal token wallet.

### C01-R05 — Connection health is not execution readiness

Connection lifecycle is proposed as draft, verifying, connected, unavailable, paused, revoked, and retired. Effective readiness additionally depends on current authentication, host availability, grant, capability support, quota policy, source permission, concurrency, and holds.

Retain independent reason codes instead of a misleading single green connected flag. Show last-observed time and the action needed. A host that went offline is not ready because its credentials were once valid.

Rotation or re-enrollment advances a connection revision. Historical bindings still identify the account/profile used; a new revision does not silently attach unrelated work to a replacement account.

### C01-R06 — Capability qualification

For each versioned profile record:

- Exact provider, native/API route, adapter and tool version, environment class.
- Model IDs and provider-native effort/setting values; discovered, accepted, and observed support.
- Operation families, allowed source types, tool/network boundaries, output modalities.
- Start, attach, observation, queue, inquiry, hold, resume, stop, permission, steer, and restart as supported, unsupported, or unqualified.
- Owner-native eligibility, API team eligibility, and separately qualified native cross-member delegation.
- Test/source evidence, observation dates, limitations, and invalidation conditions.

A catalog entry is discovery, not proof that the actual account can use the model. Directory separation is not a security boundary. A profile cannot advertise untested control semantics as supported.

## 3. Contributions and permitted spending

### C01-R07 — Contribution grant contents and edits

A grant MUST specify:

- Resource and connection/account identity; owner; issuing actor; revision.
- Private owner use, an explicit project set, or disclosed dynamic team scope with exclusions.
- Eligible requesters and required current project/team membership.
- Allowed operations and runtime roles, including whether routing, background work, review, and testing are included.
- Allowed models/efforts/tools/environments and source disclosure boundaries.
- Validity, concurrency, per-grant allowance, owner reserve, and policy for unknown usage telemetry.
- Funding continuation policy and permitted fallback pool.
- New/queued/active-work behavior on pause, expiry, revocation, or membership loss.

Only the owner may enlarge their contribution. A team administrator may narrow or disable team use where current authority permits. The project manager may allocate inside a grant, never broaden it or approve native owner permissions.

Use expected revisions for edits. A grant preview names audience, projects, roles, ceilings, and expiry. Dynamic team scope explicitly includes future eligible membership; selected-project scope does not.

### C01-R08 — API benefit funding is verified separately

Eligible subscription plans can supply API benefits to linked API organizations, as documented in the [provider references](../references/BASELINE_AND_SOURCES.md). Enrollment distinguishes:

1. The key/route works.
2. The intended provider organization is associated with the owner.
3. The subscription benefit was actually claimed/linked.
4. A current balance or usage observation is available.

None implies all four. Ordinary inference credentials need not expose billing information. Missing benefit/balance data remains unknown.

The UI names the actual API account and funding policy. It does not claim that each request necessarily consumed a free benefit when the provider may use purchased or invoiced funds.

### C01-R09 — Paid continuation and strict benefit-only policies

No automatic purchase, top-up change, spend-cap increase, or silent native-to-API fallback.

An owner may authorize a bounded API-spend policy even if the provider draws from a mixed balance. Show that policy before commitment.

If the owner requires benefit-only use, qualify a mechanism that actually enforces that boundary. A stale balance minus Sophia-only estimated usage cannot guarantee it when other applications spend the same account. If the provider cannot enforce or sufficiently prove the restriction, explain the limitation and keep strict benefit-only execution unavailable; offer a separately authorized bounded total-spend policy. Do not weaken the requested restriction silently.

### C01-R10 — Native accounts remain owner-bound

Use supported sign-in in the owner's qualified environment. Sophia stores safe correlation and capability records, not copied consumer session tokens. Do not scrape native authentication stores or export unrelated personal session history.

Qualify the clean launch environment so ambient API keys cannot change the intended billing route. Never swap process-global credentials between concurrent owners.

A Sophia grant does not establish provider permission for another member to consume a native account. Cross-member native delegation enters the pool only with route-specific provider and technical qualification. Until then, each founder uses their own native resources; qualified API contributions remain shareable.

## 4. Binding, allowance, and concurrency

### C01-R11 — Immutable execution binding

At admission freeze the effective actor/audience, mission and assignment generation, source/criteria revisions, selected resource/account/grant/profile revisions, required tools/environment, payer route, allowed spend, and model/effort decision.

Record requested, adapter-accepted, and provider-observed settings independently. Unknown effective settings remain unknown.

Auto can choose only among allowed compatible candidates. Prefer permits its recorded fallback bounds. Pin waits if the named resource/model/effort cannot be honored. Defaults affect new admissions, not an existing idempotent request or running assignment.

### C01-R12 — Atomic commitments

Reserve the applicable mission, grant, account, and concurrency allowance atomically before dispatch. Multiple projects cannot each reserve the same last available account slot. Preserve capacity for manager responsiveness and mandatory review/testing according to the owner-approved policy.

Usage units remain provider-specific. Do not subtract dollar spend from native percentage quota or infer a total token capacity from one rate-limit window. Multiple provider windows constrain the same account; they are not extra pools.

For unknown native quota, enforce the explicitly approved conservative assignment/concurrency policy. A reset timestamp becomes an occasion to refresh observations, not automatic proof of replenishment.

### C01-R13 — Cumulative accounting

Scope cumulative commitments to the accepted mission lineage. Retry, repair, resume, steering, replacement session, and later handover never reset allowance.

Track reserved, incurred, settled, and uncertain usage. A cancelled HTTP request or native Stop does not prove zero provider cost. Retain unresolved commitments until evidence allows settlement. Exceeding an authorized maximum blocks new admission and calls for the defined control response; it never creates hidden additional credit.

Background title generation, routing/decision model calls, probes, and child continuation must have an explicit payer and bounded policy or be disabled. Do not introduce them as free T3 side effects.

### C01-R14 — One writer and one manager generation

At most one active writer owns a given mutable worktree/effect lease. Assign disjoint worktrees/scopes for parallel workers. Granting a new writer waits for the old writer to settle or be effectively fenced.

For the founder release, the uniqueness scope is the project: at most one active coding mission and project-manager authority per project. All implementation/review/test assignments for that mission share its current authority generation. Unrelated new coding requests in the same project are durably waiting; independent projects may execute in parallel. A held or uncertain existing mission retains the slot. Release it only after the mission ends and its relevant external effects are settled or effectively fenced. Non-coding specialist work remains subject to its existing independent scope and admission.

The project manager's authority carries a generation bound to that project and mission. Delayed old-generation output may be retained as evidence but cannot assign new work or accept a candidate. No active manager migration is required in this pack.

Paperclip owns the enrolled continuation wake; T3/native events provide observation. Disable or qualify autonomous child-completion wakes and delegation paths that would create another owner.

## 5. Durable effects, controls, and publication

### C01-R15 — Idempotency and uncertain outcomes

Every mutation has a stable semantic operation ID, caller-scoped idempotency key, canonical semantic payload hash, expected mutable revision, and durable effect correlation. Same key and same semantic payload returns the original outcome. Same key and changed payload conflicts.

Persist admission and outbox intent in the existing transaction before external send. After a possible send without proof, mark outcome_unknown and reconcile the original identity. A different key/provider/session is not safe retry.

Receipt replay is idempotent. Feed reconnect, browser reload, voice redelivery, and coordinator restart do not start new work.

### C01-R16 — Hold, Stop, and design hold are distinct

Control state and execution phase are separate:

| Control | Required behavior |
|---|---|
| Hold requested | Block new work admission; request the qualified pause boundary; show whether native work actually paused |
| Held | No new substantive native turns or implicit inquiry/resume; authorized retained-evidence reads remain possible |
| Resume requested | Only a separately qualified explicit control may continue an observed held/settled assignment after current-authority checks; preserve account/settings/source binding and cumulative allowance |
| Stop requested | Block new work and request native termination/cancellation; distinguish request from settlement |
| Stopped/settled | No future effects for that stopped generation; retain prior work, costs, and results |
| Outcome unknown | Reconcile/observe/fence; do not claim stopped or launch replacement writers |
| Awaiting design approval | Programme-specific hold on affected Sophia UI work/merge/promotion; unrelated authorized work may continue |

Fresh project-manager inquiry is an execution effect. When work is held/stopped and retained evidence is insufficient, retain a waiting question. This pack does not introduce a hidden inquiry exception that resumes the native agent.

Ordinary follow-ups use explicit queue. Active steer/restart requires separately qualified semantics and a permitted deliberate intervention. Voice barge-in affects audio, not coding authority.

Resume is not attach, restart, or a new session. Unknown settlement cannot resume. A stopped generation cannot be reopened through Resume; a separately authorized new mission/attempt must follow its ordinary admission and settlement rules. Hide or disable Resume where the selected capability is unqualified or unsupported.

### C01-R17 — Reauthorization and late results

Check current source eligibility and audience again when publishing a result, replying to a conversation, or speaking into a call. A stale source, withdrawn message, revoked contribution, or old manager generation cannot be made current by an eventual successful tool result.

Retain safe operational evidence under its proper restricted audience. Quarantine or suppress user-visible publication when necessary; settle actual external effects honestly. Do not erase evidence simply to hide an uncertain outcome.

## 6. Exact work and proof

### C01-R18 — Sources, drafts, and accepted work

An artifact reference includes stable artifact ID, exact version, source eligibility, and optionally a validated region/selection. A revision creates a candidate; the accepted version remains until explicit acceptance under project policy.

The selected item/version/target owns its draft key. Switching to another artifact starts or restores that target's own draft. Do not silently send an unrelated prior draft.

Explore-to-Build promotion freezes an exact source manifest, objective, acceptance criteria, repo/base, scope, and binding. A later source update requires a new deliberate revision; it cannot silently change the running mission.

### C01-R19 — Release verification and review independence

Record sourceReview and applicationVerification as separate evidence stages. In this delivery programme the same independent Codex thread performs both. Each stage has its own episode/run ID, exact target, checks, results, and timestamps. The thread must be independent of the authoring sessions; a shared thread between the two verification stages is permitted.

Bind automatic review coverage to pushed commit IDs and exact current PR head. Bind final source review to the accepted candidate/tree and release verification to actual deployed build/runtime/configuration. A squash/rebase/merge must have a recorded relationship to the reviewed tree; material differences reopen affected checks.

The project goal remains open if deployment or app verification fails. A reviewer can finish its review with a failed candidate; these are different outcomes.

### C01-R20 — Private projections and observability

Apply audience/source rules to message bodies, titles, search, previews, notifications, summaries, agent context, and event projections. A private message must not leak through a shared title.

Logs and evidence allowlists exclude secrets, raw authentication output, unrelated native histories, and unnecessary private content. Diagnostic/tracing failure cannot become the authority for current execution state or lose admitted input. Do not use hidden chain-of-thought as product evidence; retain concise reasons, structured decisions, and attributable observations.

## 7. Contract acceptance

| Case | Scenario | Required observation |
|---|---|---|
| AC-C-01 | Duplicate mutation and changed payload | Same request returns one operation; changed semantic payload conflicts |
| AC-C-02 | Revocation while queued | New send denied under current grant; no switch to another payer to bypass |
| AC-C-03 | Same account in two connections/projects | Atomic common-account reservation prevents double-counted capacity |
| AC-C-04 | Unknown usage/balance | Unknown remains visible; strict benefit-only and native quota policy remain enforceable without fabricated numbers |
| AC-C-05 | Frozen settings/binding | Default/grant edits cannot rewrite an admitted request; current denial still fences new effects |
| AC-C-06 | Uncertain send/control | Original operation reconciled; no duplicate writer, refund claim, or false Stop settlement |
| AC-C-07 | Private derived metadata | Body, title, search, summary, notifications, retrieval and delayed output respect one boundary |
| AC-C-08 | Verification identity | Same independent Codex thread may review/test in two stages; an author cannot supply independent approval |

These cases can be evidenced by the corresponding module tests; do not repeat an equivalent live paid operation merely to populate another row. Store an explicit shared evidence reference and the assertion it establishes.
