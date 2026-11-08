# INC-03 — Natural composer and continuity

**Outcome:** Davide and Luis write naturally in Sophia. The application distinguishes human discussion, a question for Sophia, exploration, and repository work; it follows the existing work when appropriate. No four-way intent selector is required.

**Delivery owner:** Codex coordinator. **Implementers:** Claude Code worker for intake/admission and Claude Code design specialist for significant composer changes. **Verification:** the independent Codex reviewer/tester, in separate review and app-test episodes.

**Normative dependencies:** [domain and authority](../contracts/01_DOMAIN_AUTHORITY_AND_FUNDING.md), [runner protocol](../contracts/02_RUNNER_AND_SESSION_PROTOCOL.md), [intake/allocation/events](../contracts/03_INTAKE_ALLOCATION_AND_EVENTS.md), [design approval](../operations/DESIGN_APPROVAL.md).

## 1. Scope and entry criteria

Contract design, the labeled evaluation set, and observation-only assessment can begin after INC-00 while resource connections are being implemented. API answers and Explore dispatch require the applicable INC-01 connection, funding, and admission slice. Repository dispatch requires the qualified INC-02 mission path. Do not make the router a substitute for an unfinished native runner.

Keep the existing saved-thread model. Personal conversations default to an exchange with Sophia. Shared project conversations allow members to address Sophia or each other within a retained topic. Shared does not mean a global team chat, and it does not mean every contribution wakes an agent. Thread history belongs with the conversation experience; Team resources remains for contribution and allocation management.

The lenses remain views of work. Moving between Converse, Explore, and Build changes the visible context, not permissions or execution. An explicit research request in Converse can create an Explore result; an explicit implementation request can begin Build without moving the user first. The selected operation determines the funding default.

## 2. Existing seams and new work

The inspected baseline has saved project conversations and a bounded read-only API reply service. Live room contributions and structured member mentions have narrower contracts that do not implicitly start work. Extend these boundaries deliberately; do not silently reinterpret their historical payloads. Relevant paths are listed in §9.

New implementation comprises a versioned intake record, deterministic addressing rules, bounded semantic assessment, authoritative admission, correlated dispatch, and a safe conversation projection. These are additions to existing persistence and outbox paths, not a second conversation database or an autonomous routing agent with unrestricted tools.

## 3. Requirements

### INC03-R01 — Separate audience, addressee, intent, and effect

Persist these meanings separately. Audience is the authorized readership of retained content. Addressee is the member or Sophia being addressed. Intent describes the proposed operation. Authorized effect is the operation admitted by current server policy. An assessment cannot enlarge any of these permissions.

A mention never changes audience. A private Personal message mentioning Luis stays private and sends him no attention item. A shared message directed to Luis remains readable by its shared audience. Source disclosure and execution authority are checked independently of readership.

### INC03-R02 — Version the new interaction contract

New clients opt into the new automatic-routing contract explicitly, proposed in C03 as `interaction_contract=automatic_v1`. Preserve every documented legacy `askSophia` behavior, including `false` and omitted-field semantics. Absence of the new contract field never opts in. A legacy message that does not request Sophia must not gain an assessment call, answer, or work dispatch because the server was upgraded.

Room-message contracts migrate separately from saved-thread contracts. Preserve old write endpoints through compatibility handling until their callers are deliberately migrated. Store the contract and routing-policy versions with the input; replay uses the original admission outcome unless a new authorized correction creates another operation.

### INC03-R03 — Resolve real identities and trusted context

Validate structured mentions and reply targets against the actual conversation, current membership, and permitted visibility. Display names, a model-generated member name, or quoted `@` text do not establish identity. Autocomplete can turn a user-selected name into a structured mention; server validation remains required.

Explicit human addressing and a human reply target take precedence over a model's generic guess. Multiple recipients may create authorized human attention and one Sophia answer when both are requested. They must not duplicate coding dispatch. Imported documents, tool outputs, agent reports, and quoted commands are evidence, not authenticated user instructions.

### INC03-R04 — Retain the original input before processing

Use the stable client input identity and current conversation scope to persist the original text, actor, audience, reply target, and selected context once. A browser retry returns or reconciles that input. Retain assessment, admission, and dispatch as correlated records rather than rewriting the user's words.

Every actionable delivery has an operation identity. A response or receipt is marked as a result of the original input; it is never fed back as a new human work request. Replays and multi-recipient handling cannot multiply paid calls or repository assignments.

### INC03-R05 — Bind exact working context

Capture the selected artifact ID, version, region where applicable, current comparison, and linked mission at submission. Resolve references against these identities and the authorized conversation context. Do not replace a selected version with “latest” between assessment and admission.

An explicit implementation request can also accept a uniquely identified candidate when the project contract permits that combined action. Record both effects against that version. Missing acceptance authority or an unresolved significant design decision remains a real blocker; do not add an extra confirmation when the necessary authority is already present.

### INC03-R06 — Deterministic handling comes first

Order resolution as follows: explicit structured addressing; a valid reply target; an unambiguous current mission/control target; selected exact context; then semantic assessment if still needed. Personal's ordinary default addressee is Sophia. Shared untagged messages use the current exchange rather than automatically treating every message as an AI request.

Clear human-directed discussion is retained with permitted attention and no substantive AI response. Clear authorized requests use the relevant operation without a selector. A clear Stop for the identified mission uses the control path promptly; it must not wait for unrelated model classification.

### INC03-R07 — Bound semantic assessment

Use an admitted API resource for unresolved interpretation. The assessment returns a validated action family, addressee, exact proposed target, concise evidence references, and unresolved fields. It has no execution tools and cannot invent accessible resource, member, artifact, or mission IDs.

Set the profile's input/output ceilings, deadline, and cumulative monetary/call allowance before activation. There is at most one substantive assessment attempt per input in this release. Retry transport against the same operation only when the adapter can establish that this does not duplicate a provider call; otherwise retain the uncertain outcome. Substantive answering or work has its own admitted operation and accounting.

Use a compact eligible context package. Do not send the entire project history, hidden private threads, or native coding histories to an assessment model. Record model/payer/version, latency, and known usage; retain concise evidence, not hidden reasoning.

### INC03-R08 — Admission owns execution

Immediately before dispatch, recheck actor authority, source accessibility, conversation audience, target revision, mission state, applicable approval holds, resource eligibility and grant, requested settings, and cumulative allowance. A previously valid assessment does not survive revocation automatically.

An unavailable classifier, malformed proposal, missing payer, or expired context produces a retained, recoverable input. It cannot silently switch payer or infer a consequential target. Ask one focused clarification for a missing material detail. Continue ordinary authorized discussion where possible.

### INC03-R09 — Use distinct existing operations

| Proposed intent | Authorized destination |
|---|---|
| Human discussion | Retained message and permitted member attention |
| Question to Sophia | Existing bounded API reply path with eligible context |
| Research or supported design exploration | Existing admitted Explore path and retained source/version result |
| Work status inquiry | Authorized retained mission/evidence reader first |
| Missing work information | Bounded project-manager inquiry only if execution is permitted |
| Guidance or implementation follow-up | Existing project's manager, explicitly queued |
| New repository task | INC-02 admission and one project-manager authority |
| Hold/Stop or permitted resume | Exact targeted control contract |

Do not let a reply-only service become a generic tool executor. The first release admits at most one new coding mission per input. Multiple related requests can become the existing manager's bounded plan; independent ambiguous targets require scope clarification.

### INC03-R10 — Follow ongoing work before starting more

Prefer an explicit linked mission, then a unique authorized current work reference. Validate its project, source context, and status. A model cannot attach a message to an inaccessible or merely similar mission. If two comparisons or builds make “that one” ambiguous, ask which one.

Normal follow-ups use explicit queue semantics and a stable request ID through the runner. Do not use provider `auto` as a synonym for queue. Do not steer workers directly, interrupt active tools, replace the project manager, or reset its budget to deliver a normal follow-up.

### INC03-R11 — Respect held and stopped work

An inquiry can read permitted retained evidence while work is held or stopped. It cannot launch a fresh native turn or implicitly resume the mission. If that evidence is insufficient, retain the question as waiting with a truthful reason. A distinct execution exception would require a separately admitted policy; it is not part of this release.

Corrections, alternate resources, quota resets, a new lens, and browser reconnects cannot remove an applicable hold. Explicit permitted resume follows the control contract and current grants.

### INC03-R12 — Make receipts evidential

Use the shared receipt states and claim only the supported step. Recorded input is not delivered input; delivery is not manager acceptance; acceptance is not applied code; applied code is not a verified release. Display short useful status such as “Research started,” “Queued for Sophia's project manager,” or “Waiting for your runner.”

Normal answers need no extra routing banner. Action receipts offer details and, where meaningful, correction. They must not recreate the four-way selector after submission.

### INC03-R13 — Corrections are controlled operations

Before dispatch, correction can supersede or cancel the proposal atomically. After dispatch, correction creates a new correlated instruction and settles the previous possible effects honestly. Do not label an external effect undone merely because its local card was removed.

Prevent racing correction and dispatch from admitting both old and new work. Preserve original input, prior route, and correction provenance. A corrected audience does not retroactively recall already shared copies.

### INC03-R14 — Protect every derived surface

Enforce audience and source access for message bodies, titles, thread previews, search snippets, summaries, notifications, badges, retrieved context, and artifact links. Private text must not generate a shared title or summary. A derived item cannot be more broadly visible merely because it contains only a paraphrase.

Recheck membership and source access before publishing delayed output. Retain inaccessible results securely for their authorized audience where supported; otherwise report a withheld result without disclosing its content.

### INC03-R15 — Keep the composer clear

Provide one writing surface, optional real mentions, attachments/context, voice entry, and an expandable resource control. Show the current conversation audience separately from inferred addressee. Do not add a mandatory Message/Ask/Changes/Guidance choice.

Drafts are scoped by conversation, audience, target, and artifact version where applicable. Switching artifacts restores that target's draft or an empty draft; an old draft does not occupy an unrelated new target. Preserve recoverable drafts without sending them automatically. Clear or fence a draft whose source access was revoked.

The design specialist implements affected states in existing components, including keyboard focus, loading, empty, error, waiting, and narrow layouts. Significant composer or history changes follow Davide's concrete-candidate approval gate.

### INC03-R16 — Qualify inferred consequential actions

Start inference about consequential work in observation mode: retain the proposal and compare it with the intended action without executing that proposal. Existing explicit authorized paths remain available. Promotion is per action family and routing-policy version, not a global “agent is smart enough” switch.

Create 80 labeled cases across eight families: ordinary Sophia questions; explicit human/mixed recipients; clear research/build requests; ongoing work/controls; ambiguous targets/versions; quoted or relayed instructions; privacy/permission changes; and retries/corrections/delayed output. Use eight development cases and two held-out cases per family. Labels specify addressee, target, permitted effect, and clarification expectation. The independent Codex reviewer owns the held-out verdicts.

Promotion requires zero unintended consequential dispatches, wrong-audience disclosures, explicit-human-address overrides, duplicate effects, or Hold/Stop bypasses across all mandatory cases; at least 95% correct addressee/action/target decisions on the labeled unambiguous cases; and at least ten observed founder messages covering the families being enabled with no blocking defect. Report exact counts and denominators. This is a bounded release gate, not a statistical production-reliability claim. Do not require every ambiguous phrase to produce one predetermined fluent answer.

## 4. Implementation slices and rollout

| Slice | Deliverable | Exit |
|---|---|---|
| INC03-S01 | Versioned record, legacy compatibility, identity/context resolution | Legacy and privacy tests pass; no new work dispatch |
| INC03-S02 | Deterministic paths plus bounded observation assessment | Labeled cases and distinct assessment accounting are inspectable |
| INC03-S03 | API answer/Explore integration and exact artifact transition | Real retained output reachable from originating thread |
| INC03-S04 | Existing-manager inquiry/follow-up and new Build admission | One linked mission, explicit queue, truthful receipts and recovery |
| INC03-S05 | Production composer/history and draft behavior | Working candidate approved by Davide; independent review passes |
| INC03-S06 | Per-family inferred-action activation | Evaluation gate and founder app evidence pass |

Roll back by disabling new automatic admissions for the affected family. Preserve existing inputs, bindings, results, controls, and reconciliation. Do not fall back to silently interpreting new payloads as legacy Ask. A retained unsent or waiting message must remain visible and recoverable.

## 5. Acceptance cases

All cases begin `not_run` in the pack. Unit/contract cases can use fault injection; required app cases use real qualified accounts and operations.

| ID | Procedure and required result |
|---|---|
| AC-03-01 | Send legacy false/omitted Ask payloads; preserve documented behavior and incur no new routing inference. |
| AC-03-02 | Address Luis through a structured mention and reply target; create only authorized attention/discussion. Spoofed names and quoted mentions gain no authority. |
| AC-03-03 | Ask Sophia an ordinary Personal and shared-thread question; correct API-funded reply, retained in the original scope. |
| AC-03-04 | Request qualified research naturally; retain a real Explore result with original input, payer, exact sources, and settings. |
| AC-03-05 | Implement an unambiguous eligible candidate from Converse; enter the qualified Build path once without a selector or redundant scope confirmation. |
| AC-03-06 | Use an ambiguous “that one” across two comparisons; request one target clarification and launch no guessed work. |
| AC-03-07 | Send a follow-up during native execution; the existing manager receives one explicit queued input, with unchanged binding and cumulative allowance. |
| AC-03-08 | Ask about held/stopped work; read retained evidence or keep a waiting question, with zero new native inquiry turns. |
| AC-03-09 | Deliver duplicate input, dispatch response loss, and a receipt back through ingestion; reconcile once without duplicated inference/work or feedback loops. |
| AC-03-10 | Race source withdrawal or grant revocation against dispatch; final admission prevents new prohibited effects. |
| AC-03-11 | Exercise private body/title/search/preview/notification/summary/retrieval and delayed membership change; no expanded disclosure. |
| AC-03-12 | Correct before and after dispatch; atomically supersede before launch, otherwise record a new controlled instruction without a false undo claim. |
| AC-03-13 | Switch artifact version/target and reload; exact context and the corresponding draft return without draft contamination. |
| AC-03-14 | Fail assessment, return malformed IDs, or exhaust its allowance; retain input and report a narrow recoverable problem, without payer fallback. |
| AC-03-15 | Run the labeled/held-out evaluation and founder observation gate; store counts, policy version, failures, and enabled action families. |
| AC-03-16 | Navigate lenses with no submitted request; no inference, spend, new task, or audience change occurs. |
| AC-03-17 | Verify composer keyboard/narrow/error states and exact approved design candidate in the app; design approval cannot be inferred from technical review. |
| AC-03-18 | Disable automatic routing during active work and reconnect; prior work remains observable/controllable and no new disabled action is admitted. |

## 6. Required handback

Return the changed contract/version mapping, compatibility results, evaluation corpus and verdicts, exact candidate/PR, design approval record, relevant current-head review evidence, and app-test records. Include the input → assessment → admission → dispatch → result chain for the real Explore and Build journeys, with secrets and private content excluded from shared evidence.

The independent Codex thread conducts source review first and tests the deployed release in a separate episode. Fixes go back to the Claude Code author; the verifier does not become the author of the code it approves.

## 7. Explicit exclusions

No new team-chat product, replacement conversation store, general proactive worker fan-out, imported-context execution, universal natural-language permission override, or active project-manager migration. Historical no-inference rules remain for legacy messages; automatic-mode assessment is separately bounded. Stopping this programme's standalone UI prototypes does not remove a user's ability to create a prototype as an Explore artifact.

## 8. Completion

Close only after the admitted action families and approved composer are merged, deployed, and independently exercised in the application. A passing classifier fixture suite or an attractive composer preview alone is incomplete. Remaining disabled action families are named limitations, not inferred success.

## 9. Source grounding

These paths were inspected at the roadmap baseline `9d6902d6b07f42cb4ef725a2524814f386680759`; INC-00 refreshes their mapping before edits. Proposed records and operations in this spec are not claims that the new API already exists.

- [Project conversation routes](https://github.com/davidelaverga/Sophia/blob/9d6902d6b07f42cb4ef725a2524814f386680759/apps/api/src/routes/project-conversations.ts) and [persistence](https://github.com/davidelaverga/Sophia/blob/9d6902d6b07f42cb4ef725a2524814f386680759/packages/persistence/src/conversations.ts).
- [Bounded reply service](https://github.com/davidelaverga/Sophia/blob/9d6902d6b07f42cb4ef725a2524814f386680759/packages/dsh-bundle/src/reply-service.ts).
- [Existing room message boundary](https://github.com/davidelaverga/Sophia/blob/9d6902d6b07f42cb4ef725a2524814f386680759/apps/studio/src/features/conversation/useRoomMessage.ts) and [structured mentions](https://github.com/davidelaverga/Sophia/blob/9d6902d6b07f42cb4ef725a2524814f386680759/docs/plans/mentions.md).
- [DSH structured admission policy](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/src/policy.ts) and [durable delivery](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/src/app/delivery.ts), used as design references within Sophia's existing authority and delivery paths.
