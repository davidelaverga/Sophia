# C03 — Natural intake, allocation, and event contracts

**Applies to:** INC-01–INC-05  
**Ownership:** Sophia proposes and admits effects; models never grant authority  
**Implementation note:** names below are proposed semantic interfaces. INC-00 binds them to current schemas and real upstream operations.

## 1. Entry points and old clients

### C03-R01 — Introduce automatic interaction explicitly

Keep the current saved-conversation contract intact for existing clients. In its existing explicit-Ask path, askSophia=false remains a human message without a new routing/assessment inference call, inference spending, substantive AI reply, or work admission. Preserve the installed validation/default semantics for omitted legacy fields; omission never opts a legacy client into automatic inference or shared spending.

The new surface uses a versioned contract, proposed as interaction_contract=automatic_v1. Legacy explicit behavior is described here as legacy_explicit_ask; do not rename installed wire values needlessly.

The new composer has no required intent selector. Resource selection, privacy/audience controls, mentions, and artifact targeting remain legitimate controls with distinct purposes.

Do not overload the old reply-only endpoint with native execution. Route a persisted input through the versioned intake/admission service, then invoke the bounded existing answer/Explore path or the qualified coding path.

### C03-R02 — Trusted input envelope

An input carries:

| Field group | Semantics |
|---|---|
| Identity | Stable client_request_id; authenticated actor and server-derived membership; conversation/room identity; server admission sequence |
| Content | Original message or governed final speech transcript; attachments and source references; payload hash |
| Audience | Existing personal/private or project/shared scope and current revision; no inferred expansion |
| Addressing | Structured mention IDs validated against allowed people/Sophia; reply target and its source/audience |
| Work context | Selected exact artifact/version/region, explicit mission reference, allowed project/repository context |
| Interaction | New/legacy contract; text/voice origin; voice session/utterance identity if relevant |
| Selection | Optional explicit execution-policy reference, not a new spending grant |

The server validates mentions against structured user choices and current identities. A textual @Luis inside a quotation, imported page, generated response, or unavailable identity is not a trusted recipient instruction. Preserve original text even when routing fails.

Speech interim text may be rendered as provisional input but cannot cause irreversible work; promotion uses the governed final/admitted utterance and stable identity.

## 2. Interpretation and proposed effects

### C03-R03 — Separate four dimensions

Every assessment keeps audience, addressee, intent, and authorized effect separate. Authority can deny a plausible intent. A human-directed conversation can remain stored without an AI turn.

Proposed action families:

| Family | Destination and boundary |
|---|---|
| human_message | Retained conversation and permitted attention; no substantive AI response or coding turn |
| answer | Existing bounded API answer with permitted retrieval |
| explore | Existing admitted research/design route, with selected API funding and exact context |
| work_read | Bounded read of authorized retained work/session/evidence state |
| manager_inquiry | Fresh bounded question to current project manager only when execution is permitted and retained evidence is insufficient |
| manager_followup | Queued instruction to current project manager within its accepted mission |
| build_start | New bounded coding mission only when target, objective, authority, source, and resource route are resolved |
| control | Explicit scoped Hold/Stop/Resume or qualified intervention through the current control service |
| clarify | One focused missing-decision question; no guessed consequential effect |
| no_action | Acknowledgement/ordinary retained discussion requiring no action |

These are internal types, not a replacement visible selector.

### C03-R04 — Deterministic first, bounded assessment where needed

Interpret in this order:

1. Persist and authenticate the original input.
2. Resolve trusted mentions, reply targets, current surface, explicit source selection, and existing mission links.
3. Apply deterministic addressing/control rules where sufficient.
4. If meaning remains uncertain, run a bounded API assessment under a named payer and routing allowance.
5. Produce a schema-validated action proposal and concise supporting evidence.
6. Resolve exact target/current mission before suggesting a duplicate mission.
7. Pass the proposal through current admission, including design/control/resource boundaries.
8. Commit the admitted effect and durable dispatch before external send.

Do not send the entire native history or all project documents to a routing model. Retrieve a bounded, audience-eligible context set. The classifier cannot call mutating tools. Schema-invalid or timed-out output is a retained routing failure/clarification, never a guessed default action.

Human-directed clear messages avoid substantive inference. The new contract permits a separately metered assessment for ambiguous untagged messages; this is the explicit amendment to the old blanket non-Ask zero-inference assumption.

### C03-R05 — Assessment record

Store input ID, policy/schema/version, deterministic rule or model route, permitted context manifest, proposed addressee/action, target basis, uncertainty flags, concise reason/evidence spans, assessment payer/cost observation, and admission outcome.

A target basis can be explicit, existing accepted project standard, or unresolved. A broad phrase such as “make it better” with multiple plausible targets cannot authorize a new repository task. A clear “implement this accepted header in repo X” can proceed within existing authority without a redundant confirmation.

DSH Super Agent is the pattern donor for policy/target evidence and durable delivery; Sophia's product policy remains authoritative. Do not copy a passive chatbot rule that ignores a clear direct request because no @mention was present.

### C03-R06 — Follow existing work

Prefer an explicit mission reference, then a uniquely relevant permitted active mission derived from the exact selected work. Do not choose the most recently active repository as a hidden default when more than one target is plausible.

The existing project manager receives ordinary follow-ups with explicit queue semantics. Send the same semantic operation ID through retries. Queue acknowledgement does not mean the manager accepted or applied the requested change.

For this founder release, build_start cannot create a second active coding mission/project-manager authority in the same project. A related request becomes a permitted follow-up; an unrelated new request remains durably waiting until the existing mission's slot is safely released. The interface explains that wait and offers the existing work context. Different projects can execute in parallel.

A material scope change becomes a manager proposal/decision under project authority. Intake does not fan out instructions to workers, bypass review, reset the mission allowance, or replace the manager.

### C03-R07 — Observation mode and promotion

Keep inferred consequential action families in observation mode until INC-03's specified evaluation gate passes. Observation records the proposed route without starting that inferred build/follow-up. Explicit authorized commands on existing qualified paths continue to work.

The routing policy version, fixture corpus, expected outcomes, observed mistakes, and activation flag scope are recorded. Disabling automatic routing preserves input and existing work; it does not stop reconciliation or reinterpret legacy requests.

Do not promise a percentage accuracy from a tiny demo. The mandatory corpus must have zero unauthorized effects, wrong-audience disclosures, and duplicate work; other measured misses/clarifications inform the narrow action-family rollout.

## 3. Admission results, errors, and receipts

### C03-R08 — Proposal is not acceptance

An admission result is one of admitted, recorded_only, clarification_required, waiting, denied, or failed, with a stable reason and correlated record. Existing wire status enums may be extended through typed reason/projection fields instead of replaced.

The result identifies the permitted next action and any owner decision needed. No resource, grant, or valid target means waiting/denied/clarification as appropriate; it never triggers an undisclosed account switch.

| Condition | Required response |
|---|---|
| Legacy false Ask | Preserve message; no new automatic substantive effect |
| Clear human recipient | Store and create permitted attention only |
| Ambiguous target | Ask the narrow target question; no repository work yet |
| Routing payer missing or denied | Retain input; explain how to connect/choose an allowed route |
| Strict pin unavailable | Wait on the pin, with change-policy action for authorized user |
| Source/project permission denied | Refuse the effect; no alternative payer bypass |
| Duplicate request | Return original admission/effect |
| Same key, changed semantic payload | Conflict; do not create a second action |
| Timeout after possible dispatch | Outcome unknown; attach/reconcile original effect |
| Manager held/stopped | Read retained evidence if allowed; otherwise retain waiting inquiry |
| Grant changed while queued | Re-evaluate current authority; suppress disallowed send |

### C03-R09 — Fact-based receipt projection

Receipts reflect independently supported facts:

- **Recorded:** Sophia durably retained the input/request.
- **Received:** the named target/transport has acknowledged receiving that operation.
- **Accepted:** the responsible execution owner accepted the proposed instruction within its scope.
- **Applied:** a correlated effect or candidate shows that the instruction was applied.
- **Verified:** the relevant independent acceptance observation confirms the outcome.

Do not force every operation through every label. Human messages do not need a fake Verified state. A waiting or rejected action may never be Received. A native output does not automatically establish Applied. Keep failures, waiting reasons, control settlement, and final product verification separate.

Normal answers need no routing banner. Consequential action receipts can say “Research started,” “Sent to Sophia's project manager,” or “Waiting for your runner.” Details expose the target, resource, state, and correction action.

### C03-R10 — Correction and cancellation

Before dispatch, a correction may replace the proposal or cancel its admission under expected revision. After dispatch, it is a new correlated controlled instruction; do not imply previously performed external work was recalled.

If a correction changes source/audience/resource, reauthorize the new effect. Preserve both original and corrected provenance. A stale UI cannot silently cancel a newer instruction.

## 4. API Explore and exact promotion

### C03-R11 — Funding follows operation, not selected lens

Answer/routing/Explore uses the permitted API route. Repository work uses the qualified native route by default. Voice keeps its separately qualified funding. Selecting Converse, Explore, or Build alone starts nothing and changes no binding.

An Explore request written in Converse creates a linked Explore result and preserves its conversation provenance. A Build request can start from that same conversation once properly admitted. UI navigation does not act as a hidden authorization switch.

### C03-R12 — Source manifest and acceptance

For promotion or exact revision record source artifact IDs/versions, eligible attachment IDs, selection/region, conversation provenance, objective, accepted criteria, repository/base, permitted writable scope, open decisions, and chosen resource policy.

Previewing a design is not accepting an implementation. New revision creates a candidate while the accepted version stays available. Build shows a source-design preview and actual implementation preview as different objects.

Persist drafts by conversation, artifact/version, and action target. A changed selection never sends an old target's text by accident. Retain the old draft where the user can return to it.

## 5. Allocation and user settings

### C03-R13 — Selection input and immutable output

Allocation receives the mission/assignment role, required capabilities and environment, source policy, desired model/effort, allowed resources, grant/policy revisions, current capacity observations, existing commitments, and required independence.

It returns either an immutable proposed binding with eligible alternatives and concise reason codes, or a specific waiting/denied result. Immediately before dispatch recheck the relevant mutable authority and capacity. A changed selected binding is a new admission; it does not mutate an in-flight one.

### C03-R14 — Eligibility before ranking

Hard-filter current authority, native/API route eligibility, grants, source destination, role/tools/model/effort support, reviewer independence, pins, holds, account-level concurrency, owner reserves, and admissible quota uncertainty.

Rank only survivors by capability fit, user preferences, qualified availability, relevant reset observation, reliability, expected duration, and allowed cost/latency. Use deterministic rules first and record their version.

An optional future decision model may advise a difficult capability choice under a bounded API allowance. It cannot relax a filter or choose a route the owner did not allow. No model call is needed to populate a settings menu.

### C03-R15 — Preference scopes

Expose Auto, Prefer, and Pin for:

- The next operation/current proposed action.
- A project default or applicable lens operation family.
- A particular project-agent role.

The editor states its scope, owner/payer, model, effort, and fallback bounds. Role controls cover project manager, implementation, review, and testing as applicable; do not show only the project manager.

The delivery programme roster is fixed by the user. Product allocation policies do not replace its Claude Code workers or combine its coordinator and independent reviewer.

### C03-R16 — New assignments only in this release

INC-04 selects resources for new role assignments and settled retries. It does not migrate a running manager or worker because another account has more allowance.

An exhausted provider can justify another eligible new assignment only after the existing effect is settled/fenced and the policy allows it. A permission denial cannot be bypassed. A reset timestamp without refreshed evidence does not make an account ready.

Show proposed versus actual choice if availability changes before dispatch. Strict pins wait. Preserve requested, accepted, and observed settings, including unknowns.

## 6. Events, projections, and voice

### C03-R17 — Typed durable events

Extend current outbox/feed mechanisms rather than creating a new event bus. Proposed event families are input recorded, route assessed/admitted, resource/grant/capability changed, assignment/binding changed, native observation, effect receipt, source/candidate changed, design hold/decision, review result, and release verification.

Each event has stable event ID, subject/project scope, revision or ordered sequence, causation and semantic operation ID, timestamp, audience/source eligibility, and a safe typed payload. Exact names/schema versions are allocated by INC-00.

At-least-once delivery requires idempotent projections. A missing/expired cursor triggers an authoritative bounded snapshot and cursor recovery. It does not silently drop input or restart an agent. Native ephemeral event retention does not replace Sophia's required mission evidence.

Generated answers, agent reports, and receipts are marked as outputs. They never re-enter intake as new human instructions, preventing recursive work launches and response loops.

### C03-R18 — Voice shares operations, not unrestricted execution

Voice uses work_read, manager_inquiry, and manager_followup through the same admission contracts. A room/voice model cannot use a broad MCP write token or directly instruct workers.

Prefer retained evidence before an inquiry. Fresh inquiries require current mission execution permission and a bounded budget. While held/stopped, insufficient retained evidence yields a waiting question, not an implicit resume.

For delayed answers keep request ID, conversation/audience, original requester, voice session/utterance, and intended destination. Before speaking, recheck participants and disclosure. If the audience changed, publish only to the authorized retained destination or wait; do not speak private output into the currently open room.

Ending a call, audio barge-in, browser disconnect, or microphone mute is not a work Stop. A separate explicit work control carries its own identity and receipt.

### C03-R19 — One narration path

The authoritative mission projection supplies concise progress, blocker, decision, and result messages. Provider token streams, worker chatter, and Paperclip updates cannot each narrate the same event independently.

Use versioned deduplication and audience-aware publication. Optional tracing/analytics may fail without altering execution state. Do not present latency or routing accuracy claims without observed measurements.

## 7. Error/recovery and verification ownership

### C03-R20 — Rollout is capability-specific

Flags separately control real resource enrollment, API funding, native admission, new automatic routing action families, allocator decisions, and voice writes. Turning a flag off stops new admission only in its scope; reconciliation, Stop, evidence reads, and required settlement remain available.

The module acceptance cases test these crossings. Contract cases AC-C-01–08 in C01 may reuse that evidence; no duplicated paid episode is needed simply because two specifications name the same invariant.

Review the actual source and ordinary UI path together. A backend success with misleading recipient, payer, receipt, or completion copy is not acceptable product behavior.
