---
id: sophia-mission-companion-and-research-ledger
version: 0.1
created: 2026-09-27
status: investigation_and_design_proposal_not_applied
pass: 1
repository: davidelaverga/Sophia
pull_request: 13
inspection_head: 2911b037c9703703f2ae33955123d434797e3155
reported_hosted_baseline: 2d59884
planning_baseline: Sophia_Implementation_Pack_v0.4_Part2_2026-09-24
next_pass: research_agent_presets_and_artifact_delivery
---

# Sophia — Mission companion, continuity, and research work
## Investigation ledger and continuation brief · Pass 1

This document is the **investigation ledger for Davide and the implementation team**. It is not the proposed runtime mission ledger, does not update the hosted project's mission, and does not authorize deployment or provider spending.

## 0. Resume here

**User-requested direction.** Replace the compulsory implementation-brief interaction with a voice-first cooperative guide. Sophia helps a team articulate an idea, improve it, choose useful work, observe results, resolve difficulties, and retain learning across project sessions. She uses a mission-lifecycle skill and a durable, source-grounded account of the mission. The first useful background specialist should research a question and deliver Markdown/PDF; other output presets can follow.

**Main finding.** PR #13 implements a deliberately narrow real-voice-to-durable-task increment. Its exposed task is `draft_brief`, its brief worker has no tools, its voice prompt is mostly operational, and its voice-facing status read is much poorer than the project's intended context model. The current Live bridge explicitly does not retain input or output transcripts. There is no exposed mission-update tool in its four-tool surface. Changing the system-prompt label alone cannot produce the requested continuity. [R01–R08]

**Important correction.** Typing is not inherently required to start the existing brief: `start_brief` accepts a spoken instruction, and contribution IDs are optional. The PR reports that the owner's test created briefs by voice. The form is a prominent UI affordance, not a mandatory backend prerequisite. [R01, R03, R04]

**Important release distinction.** At the inspected PR head, the clipped brief, non-scrolling conversation, and stale background-task indicator already have source fixes. The PR reports deployment of these fixes as awaiting approval. That is separate from the product decision to remove the brief-centered workflow. Do not report the source bug as still unfixed; do not report the fix as deployed without new operator evidence. [R01]

**Recommendation.** Retain the real media, attribution, admission, source, job, control, and recovery machinery. Replace its thin product layer with a mission-aware guide and, in the next bounded increment, a genuine research task. Extend the existing canonical project state and ContextPacket compiler; do not create a competing writable `mission.md`. [R09–R12]

**Next pass.** Audit research composition on Sophia's actual pinned dsh release and compare it with newer native preset support; inspect Google async/context semantics against the pinned SDK; inspect old Sophia-Agent renderer/work patterns; compare DeerFlow's research and extensible-skill patterns. Produce a bounded implementation amendment and an end-to-end Markdown/PDF acceptance episode. Do not adopt another harness merely to gain a renderer.

## 1. Evidence discipline and boundaries

| Label | Meaning in this document |
|---|---|
| SOURCE-VERIFIED | Directly read implementation at the recorded Sophia commit. Does not establish deployed behavior. |
| REPORTED-RUNTIME | A PR/operator report describes a run or deployment. Not independently reproduced in this review. |
| PLAN | Supplied architecture, goal, or later design extension. Not evidence of implemented functionality. |
| USER-DIRECTION | Explicit product direction in Davide's request. Not a provider grant or approval of every proposed schema. |
| PROPOSAL | A design recommendation developed in this pass. |
| OPEN | Requires additional source inspection, a decision, or an actual test. |

The review read selected code paths, not every file in the 203-file PR. No dependencies were installed, no repository test suites were run, and no hosted write, merge, deployment, recording, or model invocation was performed. The screenshot is direct evidence of the visible experience; it cannot establish its deployment SHA or every runtime cause.

The original attached archives were extracted for inspection without modification. The Library's current product-wide UX, wake/preset, capacity, and cognitive-modulation extensions were consulted for relevant boundaries. The two latter large areas were not re-audited in full. Older research is a donor, not authority over the current implementation.

## 2. Source and version ledger

### 2.1 Supplied archives

| Archive | SHA-256 | Treatment |
|---|---|---|
| `Sophia_Implementation_Pack_v0.4_Part2_2026-09-24(2).zip` | `2a869f5201bac25c47584fda95b7146ef9dfd3b5ab86ef71db11cc93d9973766` | Cumulative planning baseline. |
| `Sophia_Implementation_Pack_v0.3_Part1_LINKS_FIXED_2026-09-24(2).zip` | `61fb067bf32541496c7fbf5ec8ce59ea33a2e6e3a6441dbb11c5f1cf9761d7b3` | Prior/link-fixed provenance; not a second competing plan. |
| `Sophia_Implementation_Pack_v0.3_Part1_2026-09-24(1).zip` | `6604230ad2905e21e27f81e31a605a06719c12161bdd669383ead973ad7b19ea` | Earlier archive retained unchanged. |
| `Sophia_Progress_Alignment_and_Next_Goal_2026-09-25(1).zip` | `ff9e22e518133e77e58bd5b026cf29708e413b460133ca5aa2adfc0d33a68302` | Explains the narrower S1-05A episode. |

Also read: `goal_lifecycle(2).md`; `Sophia-beyond-Sprint-1(1).pdf`; the supplied September 27 screenshot.

### 2.2 Sophia source and deployment identity

| Item | Observed value | Evidence class |
|---|---|---|
| PR #13 | Open, draft, not merged | Connector metadata at inspection |
| Head | `2911b037c9703703f2ae33955123d434797e3155` | Source pin |
| Base | `studio/qol` at `d18e171df15d53d4c1ff6044e90bd29bdcf60ece` | Source pin |
| Reported hosted API/Studio/worker/bridge/runtime | `2d59884` | REPORTED-RUNTIME, not independently queried |
| Source UI/status fixes | `83a4f3e` | Reported fix commit, present in inspection head |
| Empty-room timeout migration | `0017`, commit `00a16c2` | Source/release report |
| Proposed release OP-0009 | Bridge + Studio at `00a16c2`, apply migration 0017 | Awaiting owner approval in inspected PR report |
| Configured dsh source | `46a7f68b0922371ce7144b668b90e377d8e799f4`, `0.1.7-rc.1` | `config/runtime-unit.json` |
| Google SDK pin | `@google/genai` `2.24.0` | Source/config |

The voice `live-session.ts` blob is `b2db694a3895e75f1708b4d100d8325edeeb24ce` both at the inspection head and at `2d59884`. This establishes that the inspected prompt matches that file in the reportedly hosted source revision. It does not prove which bytes a live process has loaded.

**Metadata drift to reconcile:** `config/runtime-unit.json` still contains S1-03-era `built_not_ready`, fixture-admission, SDK-not-installed and live-not-verified notes, while the PR reports real later integrations and hosted tests. Preserve exact build identities, but separate immutable build facts from dated qualification notes. Neither silently infer that the whole deployment is absent from old notes nor silently relabel all qualification fields as current success. [R13]

## 3. Product alignment

### F01 — The requested guide already belongs to the product direction

The v0.4 human guide describes Sophia as helping a team understand an idea, make it visible, decide what to build, coordinate work, review the result, and carry learning into the next cycle. It explicitly rejects a project-management dashboard with a chatbot attached. Converse may be useful before there is a formal goal. [P01]

The September 25 product-wide UX ledger broadens this toward hands-free navigation, source-aligned context, and immediate cooperation. These are compatible with a mission-aware companion; they are not reasons to require an implementation-brief form. [P03]

**Assessment:** the proposed change is a correction of the current product increment's emphasis, not a request to discard the overall architecture.

### F02 — S1-05A narrowed the demonstration intentionally

The alignment specification chooses one durable task: produce an implementation brief from current project facts and agreed contributions, while real voice continues. It explicitly excludes completion of the full memory, project-lead, image, prototype, and external-engineering capabilities. [R02]

**Assessment:** the implementation largely reflects that narrow contract. The problem is that a plumbing-validation task became a major user-facing ritual. Change the product acceptance episode explicitly rather than describing the team as having ignored the broad plan.

### F03 — The layout defect and the product defect are separate

The screenshot shows the brief intersecting the floating dock and dominating the lower conversation area. The PR reports source fixes for clipping, scrolling, and the stale count of two completed tasks. Those fixes remain useful for every future document surface. [R01; supplied screenshot]

Removing the brief form does not eliminate the need to test future artifacts at small viewports, browser zoom, and mobile safe areas. Retain the generic layout fix and regression coverage.

## 4. Implementation findings

### F04 — The voice prompt is operational, not mission-oriented

`apps/media-bridge/src/live-session.ts` identifies Sophia as a calm, concise collaborator in one shared project room. It then explains input-floor attribution, status/source reads, explicit brief admission, control semantics, and truthful reporting. These are useful constraints. It does not supply a mission procedure, a first/returning-session orientation policy, a mission ledger, or a live capability description beyond the narrow tools. [R03]

The `restored` branch concerns a provider reconnection that lost dialogue. It is not an assessment of whether the team has met before. New transport session and new project mission must not be conflated.

**Consequence:** replacing "collaborator" with "guide" would not supply the missing state or actions. Preserve the operational constraints while adding the actual product role and procedure.

### F05 — Only four tools are exposed to Live

| Existing tool | Actual implemented scope |
|---|---|
| `project_status` | Project title; up to ten goals with ID/title/status; up to ten work items; up to ten recent contribution excerpts. |
| `read_selected_source` | One brief result or one currently available shared contribution; not a general project-source reader. |
| `start_brief` | Admit one `draft_brief` with instruction and optional selected contribution IDs. |
| `control_work` | Request Hold, Resume, or Stop for a current task through current goal authority. |

No mission-write, general research, PDF export, technical-lead, or builder tool is present in this surface. Their absence is intentional in the implementation comments: do not expose placeholder capabilities. [R04, R05]

**Consequence:** a system prompt must not tell the current model that it has an operational project lead or PDF worker. Those descriptions become active when the real endpoints are available under current permissions.

### F06 — Voice already bypasses the form, but not the brief-only task restriction

`startBrief` accepts `contributionIds: []` when omitted. `instruction` is required, but it can be supplied from the spoken request. The owner's PR test reportedly exercised this path. [R01, R05]

The UI independently renders a prefilled implementation-brief input, a Draft button, and contribution checkboxes. Its task request is hard-coded to `draft_brief`. [R06]

**Consequence:** remove the form dependency from the experience, not merely hide a required backend field. Internally the system must still compile an explicit, attributable work instruction and bind relevant source versions.

### F07 — The current voice path deliberately does not persist conversation content

In `room-session.ts`, the input-transcription callback only calls `wordsHeard()` when text is present; the output-transcription callback does nothing. The adjacent comment explicitly says transcripts are not retained or published outside the test's explicit scope. `wordsHeard` handles interruption/playback state. [R07]

A persistence function accepts contributions from a composer or an admitted utterance, but that potential origin does not prove that the Live callback records every utterance. In the inspected path it does not. [R07, R08]

**Consequence:** the existing provider session can support the current conversation, but it is not a durable account of what the team agreed or learned. Mission continuity needs an explicit source/notes path and a retention decision. Do not "fix" this by secretly recording every conversation.

### F08 — The canonical model is richer than the voice-facing read

The snapshot exposes revision counters, goals, discussion and tasks. `project_status` reduces these further and does not include the mission frame, accepted decisions, predictions, outcomes or lessons. Conversely, `compile_brief_manifest` already reads the current `project_revisions.frame`, current eligible accepted decisions, and selected contributions to construct the worker's seed context. [R05, R09, R10]

**Consequence:** extend the existing canonical read/compiler seam for the companion. Do not claim there is no mission-related storage anywhere, and do not create a second independent state model merely because the voice tool omits it.

### F09 — The brief worker is not a research worker

`sophia-brief-v1` has an empty native-tool allowlist. Its job is to synthesize provided inputs. Research and lead role IDs exist, but their names do not establish working product capabilities. The registry says several Sophia domain tools are future-goal work and excludes global web tools and host execution. [R11]

`native-tasks.ts` also reports every native task as `draft_brief`; admission SQL only permits that kind. Result capture stores Markdown text as a source-backed result. [R08, R10]

**Consequence:** a research task needs real source discovery/read capabilities, provenance, bounded execution, and artifact publication. A renamed brief task would still be a synthesis-only task.

### F10 — The reusable asynchronous foundation is already present

The four declarations explicitly use `NON_BLOCKING`; immediate tool responses use `WHEN_IDLE` and `willContinue: false`. Durable work returns an admission receipt and later result events. The bridge separates speech interruption from background-work control and rejects stale/attribution-invalid calls. [R04, R05, R07]

Google's model-specific 3.8 Live documentation currently describes asynchronous function calling. The generic tool guide explains scheduling modes but contains older model coverage and differing sample shapes; verify the exact SDK/wire contract rather than copying a generic snippet. [W01–W03]

**Consequence:** next pass should extend a real task-lifecycle integration, not begin by inventing an unrelated background runner.

### F11 — Important implementation safeguards should survive the UX change

Preserve server-derived speaker identity, role checks, idempotent task admission, source dependencies, current revision/authority checks, runtime lease/recovery behavior, result withholding after obsolete authority, and the distinction between admitted, incorporated, produced, checked and accepted. [R05, R10]

The inspected snapshot refuses unimplemented artifact/human-action projections when such records exist rather than returning a false empty list. A new artifact task must complete its projection contract; it cannot just insert artifact rows and assume the UI is ready. [R09]

### F12 — The reported test state is promising but incomplete

The PR reports complete audible replies, barge-in, and voice-started briefs; it also lists remaining live acceptance cases. This review does not certify the whole room or background-work experience, nor independently reproduce the reported tests. [R01]

Do not use a new research episode to erase unmet privacy, control, two-person, or recovery checks from S1-05A.

## 5. Decision ledger

These IDs distinguish the user's requested direction from the detailed implementation proposed here.

| ID | Decision | Status |
|---|---|---|
| D01 | Sophia is a cooperative team guide whose purpose is helping ideas become useful reality. | USER-DIRECTION; aligned with v0.4 |
| D02 | Remove the compulsory visible brief workflow and its dedicated instruction/selection UI. | USER-DIRECTION |
| D03 | Make mission progress and learning durable across sessions. | USER-DIRECTION |
| D04 | Use an adapted mission-lifecycle skill to guide conversation and reflection. | USER-DIRECTION; exact adaptation PROPOSAL |
| D05 | Keep mission distinct from work goals, conversational session focus, and runtime attempts. | USER-DIRECTION plus normalization PROPOSAL |
| D06 | Keep the mission's authoritative state in the existing project domain; render Markdown/UI projections. | Retained PLAN; concrete extensions PROPOSAL |
| D07 | Start with one research-worker family and Markdown/PDF output profiles; later formats share the engine. | USER-DIRECTION; engineering details deferred |
| D08 | Do not declare lead/builder/research capabilities until they are real and eligible. | Retained implementation boundary |
| D09 | Use one lifecycle intervention per current focus, not one compulsory global project stage. | PROPOSAL |
| D10 | Record discussion observations without automatically turning them into accepted team decisions or launched work. | PROPOSAL within current authority principles |
| D11 | Retain optional typed interaction and manual controls without requiring typing to complete the primary episode. | PROPOSAL; confirm product wording |
| D12 | Preserve infrastructure/control regressions and close their evidence separately from product realignment. | PROPOSAL |
| D13 | Prefer a compact skill and context packet; do not make a new classifier or full cognitive-modulation release a prerequisite. | PROPOSAL aligned with current extension boundaries |
| D14 | Treat output files as results serving a mission question, not the mission itself. | PROPOSAL |

## 6. Vocabulary and responsibility boundaries

| Concept | Meaning | Primary responsibility |
|---|---|---|
| Mission | Why the team is doing this and the outcome it wants to bring about; can evolve through explicit decisions. | Team authority, facilitated by Sophia |
| Work goal | A bounded contribution with outcome, constraints and evaluation criteria. | Project lead and authorized team |
| Session focus | What this conversation is usefully addressing now. Can be exploratory and informal. | Participants and Sophia |
| Attempt | One concrete execution try, with retained lineage, state and resource accounting. | Runtime/worker under the product's mandate |
| Artifact | A versioned result or working object used to think, decide, build, or review. | Producing worker; acceptance by the appropriate authority |
| Mission-cycle focus | Sophia's current conversational intervention: clarify, predict, compare, explain, unblock or learn. | Companion; revisable inference, not authorization |

**Companion:** understand and refine human intent; make useful distinctions; notice missing evidence and disagreement; suggest the next useful step; maintain attributable project understanding; delegate through available tools; explain outcomes in context.

**Project technical lead:** reason about the project roadmap, dependencies, resource allocation, work-goal decomposition, technical trade-offs, evaluation and replanning within the team's mandate. A project lead is not identical to a coordinator serving one work goal. [P01]

**Specialist worker:** execute the admitted research, design, build, review, or rendering task with scoped capabilities and return evidence/results.

**Software:** enforce identity, permissions, current revisions, budgets, delivery, retries, cancellation, source eligibility and state projection. A persuasive prompt or selected lifecycle mode cannot grant these powers.

An ordinary question need not invoke the technical-lead model. A straightforward bounded research request can use an approved recipe without inventing an extra managerial conversation. Larger or conflicting work should invoke the real lead when available. This is a proposed routing rule, not an already installed delegation API.

## 7. Adaptation of the attached lifecycle skill

### 7.1 What to retain

The attached skill separates the current situation, desired situation and gap, then distinguishes Wanting, Predicting, Expecting, Explaining, Escaping and Abstracting. Its strongest contribution is not a formal stage diagram; it is the discipline of choosing the useful intervention and comparing expectations with actual results rather than repeatedly generating new plans. [A01]

| Original mode | Mission-guidance interpretation | Durable content to retain | Possible UI wording |
|---|---|---|---|
| Wanting | Clarify the idea, who benefits, current situation and desired difference. | Mission statement, purpose, initial baseline, desired outcome, unresolved assumptions. | What we're creating |
| Predicting | Choose a plausible next action or experiment and state the expected result. | Candidate/accepted approach, dependencies, assumptions, expected observation and checkpoint. | What we're trying |
| Expecting | Compare actual observations with the prior prediction. | Original prediction, observed result, source and remaining gap. | What happened |
| Explaining | Explore why expectation and result differ. | Competing explanations, evidence, missing evidence, proposed discriminating test. | What we understand |
| Escaping | Remove a blocker or try a meaningfully different approach. | Blocker, attempted remedies, constraint, owner/action, next test. | What needs attention |
| Abstracting | Extract a scoped lesson and revisit assumptions when warranted. | Lesson, supporting episodes, limits/counterexamples, whether accepted for reuse. | What we've learned |

These labels need not all appear as permanent UI cards. Show the material relevant to the current focus, and make deeper history available on demand.

### 7.2 Changes required for a team product

**A. Do not make one mode the project's global state.** The skill's one-active-mode discipline is useful for a single conversational intervention. A project can be clarifying one branch, evaluating another and unblocking a third. Bind the mode to a topic/work-goal/focus and keep it a revisable inference. Do not block a valid request because it occurs "out of order."

**B. Replace individual coaching assumptions with shared authorship.** One speaker's idea is not automatically a collective decision. Record who proposed something, whether the authorized decision was made, and any material disagreement. Sophia may offer her own grounded hypothesis; neither the user's diagnosis nor hers is automatically the correct causal explanation.

**C. Preserve historical baselines and predictions.** The original skill updates Origin as the situation changes. In the product, keep an immutable baseline and the prediction made at the time, plus a separate current-situation projection. Otherwise a later summary can rewrite what success was supposed to mean.

**D. Do not import numerical emotional-tone bands as product truth.** Attend to explicitly expressed frustration, uncertainty, urgency and motivation through language. Do not diagnose teammates, assign pseudo-precise emotional scores, or convert sensitive observations into durable team records by default.

**E. Adapt the skill's closing non-project-management stance.** Sophia should not become a bureaucratic checklist assistant, but this product explicitly delegates work and tracks project outcomes. Keep the reflective method while adding honest operational handoffs.

**F. Treat learning as scoped and revisable.** One failure can support an observation or hypothesis. A broader reusable lesson needs supporting evidence and an explicit scope. The original skill cautions against premature abstraction; preserve that distinction rather than making every session generate an accepted lesson.

**G. Make ordinary conversation valid.** Do not force every greeting, clarification, creative detour or factual question into a mission interview. The skill is an internal aid to being useful, not a six-part form read aloud.

## 8. The proposed runtime mission ledger

### 8.1 One authoritative project state, several views

The existing architecture explicitly rejects a second writable `mission.md` that can disagree with Postgres. Keep that rule. [R12]

The proposed **mission lifecycle ledger** is a structured, revisioned extension/projection of the existing mission, decisions, source records, work goals, observations and learning. A generated Markdown view is valuable for export and handoff, but it is not another authority that the model edits independently.

Use the existing canonical records wherever they fit. Determine exact missing fields and migrations during implementation. Do not create a separate service or a table for every research noun.

### 8.2 Minimum useful contents

| Group | Minimum contents | Important distinction |
|---|---|---|
| Mission frame | Statement, purpose, starting situation, desired outcome and constraints. | Draft vs accepted; baseline vs current understanding. |
| Current direction | Current focus, selected next step, important open questions. | Proposal vs commitment; conversation focus vs work admission. |
| Work links | Existing work-goal IDs, attempt/task IDs, responsible role and current verified status. | Do not duplicate a competing task-state machine. |
| Expectations | What an action was expected to change, how/when to check it. | Original prediction must remain recoverable. |
| Observations | What happened, source, time and evidence class. | Worker claim, user report and executable check are not equivalent. |
| Blockers/explanations | Remaining gap, hypotheses, tried remedies, next useful check. | Hypothesis is not established cause; waiting is not automatically being stuck. |
| Learning/decisions | Scoped lesson, accepted decision, rationale, superseded alternative. | Memory relevance is not decision authority. |
| Session continuity | Useful changes, unresolved matters, next checkpoint and references. | Not an automatic raw transcript archive. |

For the first vertical slice, a compact mission frame, attributable notes, one decision, one prediction/result pair, and a returning-session read are sufficient. More elaborate causal graphs are not prerequisites.

### 8.3 Illustrative entry envelope — not a locked schema

```json
{
  "entryId": "server-assigned",
  "projectId": "server-bound",
  "missionRevision": "revision-checked",
  "kind": "observation | proposal | decision | expectation | outcome | blocker | lesson",
  "text": "A concise account of the relevant project information",
  "epistemicStatus": "reported | observed | inferred",
  "decisionStatus": "not_applicable | proposed | accepted | rejected | superseded",
  "speakerActorId": "server-attributed or null for a machine observation",
  "recordedBy": "trusted tool/runtime identity",
  "sourceRefs": [],
  "workGoalRefs": [],
  "supersedes": null,
  "scope": "existing project/audience policy",
  "observedAt": "timestamp",
  "recordedAt": "timestamp"
}
```

The separation of epistemic and decision status is deliberate: an accepted decision can still depend on an unverified assumption; a well-supported observation does not authorize a product pivot. Exact names/types must be reconciled with existing contracts, not pasted into production as a second parallel model.

### 8.4 Update protocol

1. Read current authorized mission/context state and relevant revisions.
2. Identify the meaningful delta from admitted conversation or work evidence. No full rewrite after every utterance.
3. Bind the delta to actual server-provided source and actor identity. Model-generated IDs or remembered names do not establish attribution.
4. Distinguish observations, proposals and consequential decisions. Record ordinary authorized project notes without a confirmation ceremony for each word. Ask or apply the actual team decision policy before changing accepted mission scope, resource commitments or consequential constraints.
5. Submit a typed, idempotent update with expected revisions. Software checks authority and source eligibility and either commits it or reports the conflict.
6. Project the accepted write to the UI and current context. Never say "I've saved that" before receiving a durable receipt.
7. Refresh affected future handoffs. Revalidate held/queued work when a material mission or source change affects its authority; do not silently steer every existing task just because a note changed.

Two collaborators changing a mission concurrently must not overwrite one another through last-writer-wins Markdown. Keep conflicting proposals visible until resolved under the actual policy.

### 8.5 Voice-note capture and retention

The current no-retained-transcript path is a deliberate boundary. A new ledger needs a clearly enabled project-note capability, not blanket ambient recording.

A bounded initial design is to let Sophia retain selected, attributable project notes during an explicitly opened, authorized exchange. Exact quotations require actual retained text evidence. A model paraphrase must be labelled as a note/interpretation, not an exact transcript. A transient input buffer or utterance reference mechanism must be designed and tested before relying on it for provenance.

A voice request such as "Keep that as our current direction" can accept a clear proposal under the speaker's real permissions. Casual alternatives, jokes and "what if" statements do not become accepted mission changes. Off-record/private material must not enter a shared team ledger by implication.

Room input currently comes from the admitted holder only. Do not claim Sophia captured a discussion between both humans while their audio was not admitted. Consented multi-participant following remains a separate capability.

### 8.6 Returning-session orientation

Fresh connection, fresh conversation, and fresh mission are three different situations.

On entry, distinguish: verified empty mission, existing mission, and temporarily unavailable context. Only the first warrants an initial idea invitation. An unavailable read warrants a candid limitation, not resetting the team to a blank beginning.

Build a compact current packet: accepted mission and constraints; current focus; important decisions; active work; new results since the relevant checkpoint; current blockers; useful scoped lessons; pending human decisions; actual capability availability. Select only relevant history, with exact references for deeper reads.

A transport resumption handle and a compressed model conversation are not substitutes for this durable projection. Corrections and revoked sources must affect ongoing context, not merely the next database read. The existing architecture requires affected model contexts to be rebuilt or stopped when removed material would otherwise continue influencing them. [R12]

## 9. Companion prompt and skill composition

### 9.1 Four layers

**Stable identity and responsibility:** the cooperative guide role, human authorship, intellectual honesty, and distinction between exploration, decisions and work.

**Versioned mission procedure:** a compact adaptation of the six intervention modes, including when not to use them. Keep its core in the Live context; load detailed examples only when useful and supported.

**Current authorized state:** a source-grounded, bounded mission packet plus relevant current focus and work evidence. This is data, not an instruction source that can override the system policy.

**Actual capabilities:** implemented tool descriptions and current availability, restrictions and resource grants. Planned agents are not advertised as operational tools.

The dsh text guide and Gemini voice guide should share the same semantic policy and project-state/action contracts. They need not share a provider-specific prompt serializer, and ordinary voice should not be routed through another LLM merely to enforce this conceptual consistency. [P01, R12]

### 9.2 Candidate identity/policy text

The following is a **draft**, not a drop-in replacement certified against the current runtime:

> You are Sophia, the cooperative guide for this team. Help them turn ideas into useful reality while preserving their authorship of the mission. Understand what matters, clarify uncertain assumptions, develop useful alternatives, help choose the next step, and connect results and learning across sessions.
>
> Use the mission-lifecycle procedure to choose the useful intervention for the current focus. Do not turn it into a compulsory questionnaire or force ordinary conversation into project work.
>
> Ground project claims in current authorized records and evidence. Distinguish what someone proposed, what the team has accepted under its decision policy, what work was requested, what a worker reported, and what has actually been checked.
>
> Maintain the mission record only through the available typed tools. Keep attribution, uncertainty, disagreements and important changes. Do not claim a note was saved until the tool confirms it.
>
> Use the current capability description to determine what you can actually do. Delegate suitable work through the implemented tools. Do not promise a lead, builder, research result, export or background follow-up that the runtime cannot deliver.
>
> Keep conversation useful while admitted work runs. Explain consequential results and blockers at an appropriate moment; do not narrate every internal event. Stopping speech does not stop work. Changing a view does not grant work authority.
>
> You hear only admitted input and can use only the currently authorized project and observation scope. Never infer permission, speaker identity or collective agreement from a name or casual conversation.

The actual prompt must include a tested entry-orientation instruction and current tool-specific rules. It must not refer to a mission-writing tool before it exists. Retain the current attribution, selected-source and Stop/End safeguards.

### 9.3 Conditional capability sections

When the project lead is real and eligible, add its purpose, when to invoke it and the concrete tool contract. Otherwise disclose that project-lead delegation is unavailable and continue within the guide's abilities.

When research is real and eligible, describe supported source access, output formats, budget and control semantics. Do not say "I can research the web" when the recipe can only synthesize supplied material.

Do not dynamically mutate model configuration mid-connection merely by editing a prompt file. Verify the supported Google setup/resumption/context-update route. The official general API reference and model-specific documentation distinguish configuration from session content. [W01, W03]

## 10. UX direction

### 10.1 Remove the current brief ritual

Remove `BriefRequest`, the prefilled instruction input and brief-specific point checkboxes from the primary Converse experience. Remove the always-prominent implementation-brief action and avoid replacing it with another form called "mission." Keep historical results accessible as historical documents; do not silently rename them as research findings.

The internal work request remains necessary: goal/question, exact sources, scope, criteria, output requirement and resource envelope. Sophia should assemble it from the conversation and ask only for consequential missing information. Users should not have to author or understand an orchestration document.

Keep optional text entry and manual controls for accessibility, quiet environments and recovery; the primary episode must work without typing. This is a proposal about presentation, not a requirement to preserve the current large composer unchanged.

### 10.2 Use a quiet, evolving mission view

Start with conversation and Sophia's presence. Introduce a compact mission summary only as content develops. A useful view might show current direction, what the team is trying, what changed, and one unresolved decision. Do not show six empty lifecycle panels or a fabricated completion percentage.

Let a request such as "Where are we with this?" open current project progress. A request such as "What did we learn?" selects relevant learning. Reuse the existing planned focus/context/presentation seam instead of adding another navigation agent. Local viewing does not automatically force every participant into the same view. [P03]

Artifacts should appear in a properly bounded document/preview area when ready or requested. A short arrival notice can remain in conversation. The conversation should not permanently become a stack of full-length documents under the dock.

### 10.3 Illustrative first and returning episodes

**New mission, after a successful empty-state read:**

Sophia: "What are you hoping to create together?"

The team explains. Sophia reflects the idea, asks the highest-value clarification, and offers a small, tentative mission summary. She records it under the team's note/decision policy. No required typing or brief command.

**Returning mission, with actual records:**

Sophia: "Last time we chose to test the onboarding direction before expanding it. The test is back; the unresolved question is whether people understand the first step. Shall we look at that result?"

This is an example of the desired structure, not a claim about the hosted project's contents. The actual opener must be driven by evidence and need not speak a recap every time.

**Parallel research, after the next increment exists:**

Human: "Find three useful references for that approach and make a PDF we can review."

Sophia resolves the question and relevant constraints from context, admits one eligible research job, returns a truthful acknowledgement, and continues the conversation. When the result is captured, she introduces the finding that matters to the mission and offers the artifact. Producing a PDF does not automatically validate the recommendation or change the mission.

## 11. Implementation sequence proposed for discussion

These are bounded work packages, not renumbered official sprint goals or approved deployment missions.

### MCG-01 — Reconcile the live baseline and remove the compulsory brief UI

Verify current PR/release state and preserve the existing layout/status fixes. Remove the brief-specific primary affordances. Keep historical task visibility and all controls. Improve the role wording without claiming new persistence or worker abilities. Track this as a small explicit amendment to the current demonstration, not a restart of the repo.

**Proof:** no compulsory brief field or point-selection ritual; existing speech and work controls still work; no new unsupported capability promises.

### MCG-02 — Establish a minimal mission read/write seam

Reuse current project revisions, decisions and source storage. Add the missing typed mission read/update contracts with server attribution, expected revisions, idempotency, and truthful receipts. Decide the scoped note-capture/retention policy. Keep imported/private sources separate.

**Proof:** a voice-supported project note and one accepted direction survive ending the exchange; an unauthorized change is rejected; two concurrent updates do not silently overwrite one another.

### MCG-03 — Bind the compact lifecycle skill to real continuity

Compile the guide's current state from the canonical seam. Supply a versioned core skill. Distinguish first mission, returning mission and read failure. Implement a useful compact mission projection with exact references; do not require the entire knowledge/search subsystem first.

**Proof:** return in a fresh exchange, retrieve the current accepted direction, compare an expectation with a result, preserve a disagreement, and avoid a compulsory six-step interview.

### RA-01 — Replace the demonstration task with real research and Markdown/PDF

Design only after the second-pass source audit. Generalize the existing task admission/result contracts deliberately, enable the appropriate bounded tools, and complete artifact publication/projection. Retain one ordinary work-control path and source-bound worker input.

**Proof:** ask a real research question by voice, keep conversing, receive a sourced Markdown result and a real inspected PDF, and control/recover the job without duplication. Text synthesis with no research tools is not enough to pass this test.

### MCG-04 — Close the learning loop

Bring research or other work results back into mission reasoning: compare with expectation, identify a justified next step or blocker, retain a scoped lesson where warranted, and use that lesson in a later relevant task.

**Proof:** the next session or task benefits from an actual prior result. A PDF becoming available alone is not proof of mission progress or useful learning.

The full project technical lead and cognitive-modulation implementation can continue under their existing goal ownership. Do not make the complete lead hierarchy, Jev, quota telemetry, all imports, or every UX extension a prerequisite for this small voice/mission/research episode. If work pulls a narrow capability forward, record that scheduling amendment and leave the rest of its goal open.

## 12. Acceptance and failure scenarios

| ID | Scenario | Required observation |
|---|---|---|
| T01 | Two people begin with an unformed idea. | Sophia elicits and improves it without a form or invented commitment. |
| T02 | A returning team opens a fresh voice exchange. | Current accepted direction and relevant unresolved work are available; provider session history is not required. |
| T03 | Current project read fails. | Sophia states the limitation; she does not act as if this is the first project interaction. |
| T04 | One person proposes X; another disagrees. | Attributed proposals/disagreement persist; no invented consensus. |
| T05 | An authorized participant confirms a clear mission revision. | One durable revision and receipt; retries do not duplicate it. |
| T06 | A viewer proposes a consequential accepted-state change. | Appropriate proposal/read behavior; no unauthorized acceptance or work grant. |
| T07 | Two updates use the same base revision. | Conflict is visible and reconciled; no silent lost update. |
| T08 | An outcome differs from the original prediction. | The original prediction remains inspectable; explanation is labelled as hypothesis until supported. |
| T09 | A useful observation does not justify a general lesson. | Sophia retains the observation without inventing an accepted universal rule. |
| T10 | A source is corrected/revoked after entering context. | Dependent packets/history are invalidated or rebuilt before affected use; hidden UI state is not treated as erasure. |
| T11 | The request is casual conversation or brainstorming. | No unnecessary worker dispatch, formal mission interview or repeated approval ceremony. |
| T12 | A declared capability is unavailable. | Sophia does not promise it; the actual limitation is specific. |
| T13 | Research is requested by voice while conversation continues. | One admitted job, ongoing dialogue, exact result identity and appropriate arrival notice. Next-pass acceptance. |
| T14 | Speech is interrupted or the room ends during research. | Playback/exchange ends as requested; independent authorized work is not accidentally cancelled. |
| T15 | Work is held/stopped, then a late result arrives. | Current authority and result-publication rules hold; no accidental restart or accepted-state mutation. |
| T16 | Markdown and PDF are delivered. | Both are real inspectable artifacts with common research lineage; rendering success is distinct from research validity. |
| T17 | A document opens on a small screen or at browser zoom. | Full content and controls remain reachable; dock does not obscure the result. |
| T18 | A teammate views another object. | Local focus can differ; shared focus changes are deliberate and context remains source-aligned. |

Evaluate the conversational result with realistic English/Italian/Spanish team exchanges where relevant. Include uncertain wording and corrections. Do not turn numerical latency or cost targets into promises before measuring the actual deployment.

## 13. Research-agent pass: precise audit agenda

### 13.1 Google async and context delivery

Inspect the exact deployed SDK/source and model route, not generic historical Live examples. Establish:

- Declaration behavior; top-level `FunctionResponse` scheduling and continuation semantics; streamed tool responses versus immediate job admission.
- How final job results reach the guide after the original tool call has finished, after a reconnect, and in a later exchange.
- Suppression/deduplication of stale results and repeated notices; delivery is not merely the model generating an utterance.
- Session content updates, silence/turn boundaries and configuration changes; do not assume every `send_client_content` call is forbidden from a comment written for another model generation.
- A useful distinction between a short in-exchange async lookup and a durable multi-minute research task.

Initial external check: the current 3.8 model page explicitly supports async calling and full-session client-content updates. The generic guide still includes older coverage and differing examples. The exact TypeScript reference URL attempted in this pass was unavailable. Record SDK serialization from actual source and run a bounded integration probe in the implementation environment before changing current code. [W01–W03]

### 13.2 DeepSeek Harness: installed pin first, newer presets second

Sophia's configured source pin is `46a7f68b0922371ce7144b668b90e377d8e799f4`, release `0.1.7-rc.1`. Inspect its actual tools, prompt/skill loading, per-agent options, goal driver, workflow runtime, filesystem/security boundary, source reading, compaction and public cancellation/steering events.

The Library's September 27 wake/preset addendum reports a newer native `packages/preset/agent-preset-registry/README.md` at `477b4f420553e8a52c2fbccc464d7561b239c443`. It describes declarative prompt sections, tools and skills sharing the host loop. This was **not live-source-audited in this pass**, and is not the pin recorded in Sophia's runtime unit. [P04, R13]

Compare: existing Sophia role registry, native profile, per-agent preset, execution recipe, output-format profile, and runtime security. They are different layers. Choose reuse/backport/upgrade only after capability and recovery tests; do not build a duplicate preset framework by assumption or silently upgrade an in-progress release.

### 13.3 Old Sophia-Agent donor audit

First resolve the actual branch and exact commit relevant to the latest renderer and background-work implementations. Do not assume the old default branch or a remembered production SHA is the desired donor.

Inspect the actual JavaScript HTML-to-PDF and slide rendering kernels identified by the v0.4 pack; dependencies, font/assets handling, output validation, source retention, artifacts, tool contracts, background-intent durability, cancellation and context handoff. Distinguish reusable conversion code from old orchestration and historical defects. [P01]

Do not import the old middleware/agent loop or change the live legacy repository during this investigation. Do not describe image-based PPTX as editable native slide objects.

### 13.4 DeerFlow donor audit

The supplied repo is **ByteDance's** `bytedance/deer-flow`, not Alibaba. Its current README describes 2.0 as a ground-up rewrite and points to `main-1.x` for the original deep-research framework. Both branches may therefore matter to the user's question. Only the current README orientation was read in this pass; the implementation audit remains open. [X01]

Inspect research planning, source collection, citation grounding, base-prompt/skill composition, artifact creation, sandbox boundaries, cancellation/recovery and renderer profiles. Compare useful patterns rather than adopting its complete orchestration. Verify prompt overlays against source rather than assuming configuration alone gives safe per-job isolation.

### 13.5 Design hypothesis to test

One research-worker family should own research intent, evidence collection, reasoning and source-backed synthesis. Output profiles add the specific format guidance, authoring/rendering tools and validation required for Markdown, PDF and later slides. They should not each create an unrelated research agent with divergent policy and memory.

A likely separation is:

```text
mission question + relevant context + resource/authority envelope
    -> shared research procedure and evidence collection
    -> retained research source / structured findings
    -> Markdown or PDF authoring/rendering profile
    -> artifact capture + validation + delivery
    -> mission comparison / decision / learning
```

This is a design hypothesis, not a final engineering choice. PDF output may need layout-aware authoring, not only conversion of a finished Markdown file. Neither a preset nor an output extension gives new search, filesystem, network or spending authority.

## 14. Open questions and decisions for the next specification

| ID | Question | Why it matters |
|---|---|---|
| Q01 | What exact project-note retention policy is enabled for an admitted exchange? | Current Live path does not retain transcript content. |
| Q02 | Which mission fields already have write/read contracts and which need extension? | Avoid a competing mission store or duplicate command path. |
| Q03 | What can each role propose, accept and amend in the founder pilot? | Input floor is not team-consensus or resource ownership. |
| Q04 | How is a saved note bound to the actual utterance or verified user confirmation? | Avoid fabricated quotation/source identity. |
| Q05 | How does an affected Live context refresh after an accepted revision or source revocation? | A stale provider context can disagree with the database. |
| Q06 | Which research sources/tools are actually permitted and available? | No-tool synthesis is not external research. |
| Q07 | Can the current dsh pin express the needed preset cleanly? | Avoid unjustified upgrade or duplicated infrastructure. |
| Q08 | Which old renderer files and dependencies are the right current donors? | Renderer capability must be proven, not remembered. |
| Q09 | What is the minimum real artifact contract for source, rendition, hash, ownership, visibility and delivery? | Native-task Markdown capture is not the complete artifact projection. |
| Q10 | How will result availability differ from source verification and team acceptance? | Do not turn a file into proof of progress. |
| Q11 | Which remaining S1-05A checks must close before the new episode is hosted? | Product amendments must not erase regression obligations. |
| Q12 | Is optional text entry kept collapsed by default? | Voice-first should not become voice-only exclusion. |

## 15. Exact first-pass code and plan map

| Area | Existing location to inspect/change in a later authorized mission | Intended delta |
|---|---|---|
| Live identity/skill/context | `apps/media-bridge/src/live-session.ts` | Compose truthful role, compact procedure and authorized mission orientation. |
| Voice capability declarations | `apps/media-bridge/src/tools.ts` | Replace brief-only product surface with implemented mission/research operations; retain controls. |
| Tool admission | `apps/api/src/media-tools.ts` | Current mission/context read, typed eligible notes/decisions, new task kind only when real. |
| Input/context lifecycle | `apps/media-bridge/src/room-session.ts` | Explicit scoped note capture, source/turn attribution, refresh/delivery semantics. |
| Primary conversation UX | `apps/studio/src/features/conversation/Conversation.tsx` | Remove `BriefRequest` and brief-specific point selection. |
| Optional text and results | `Composer.tsx`, `TaskCard.tsx`, conversation/studio layout | Optional text; generic results; bounded artifact presentation. |
| Task kinds and result capture | `packages/persistence/src/native-tasks.ts`; SQL functions currently introduced/replaced in 0012/0016 | Generalize through new contracts/migrations, not edits to applied migrations. |
| Mission/current context | `packages/persistence/src/snapshot.ts`; existing project revisions, decisions, source records; planned `packages/context/` | Extend/reuse the canonical context seam. |
| Worker composition | `packages/dsh-bundle/src/role-registry.ts`, `config/roles.json`, actual dsh preset capability | Real research role and output profiles with enforced tools. |
| Runtime provenance | `config/runtime-unit.json` and release evidence | Preserve exact build identity; reconcile stale qualification notes. |
| Plan amendment | Current S1-05A alignment; S1-05, S1-08, S1-11, artifact/render goals | Record bounded scope changes; leave unaffected acceptance criteria intact. |

## 16. Source register

All Sophia repository source references below use the inspection pin unless otherwise noted. GitHub file citations in the accompanying chat bind the findings to the actual connector-returned source. These links and paths make the ledger reusable outside the chat.

### Sophia repository sources

- **R01** — [PR #13 metadata and owner-test/release report](https://github.com/davidelaverga/Sophia/pull/13), inspected 27 September 2026. Reported hosted state is not independently verified.
- **R02** — [S1-05A goal specification](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/docs/alignment/2026-09-25/S1-05A_GOAL_SPEC.md), especially sections 1, 5.3, 6 and acceptance. Its preparation-time implementation label is historical.
- **R03** — [Live connection and system prompt](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/apps/media-bridge/src/live-session.ts), plus the same file at `2d59884`; matching blob recorded in section 2.
- **R04** — [Live tool declarations and responses](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/apps/media-bridge/src/tools.ts).
- **R05** — [API execution of Live tools](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/apps/api/src/media-tools.ts).
- **R06** — [Conversation UI and BriefRequest](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/apps/studio/src/features/conversation/Conversation.tsx).
- **R07** — [Room/session implementation](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/apps/media-bridge/src/room-session.ts), especially source lines 565–815: connection setup, transcription callbacks, tool execution and playback. Selected sections, not a whole-file behavioral audit.
- **R08** — [Native task persistence and result read](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/packages/persistence/src/native-tasks.ts).
- **R09** — [Project snapshot](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/packages/persistence/src/snapshot.ts).
- **R10** — [Migration 0016 review fences](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/db/migrations/0016_review_fences.sql), inspected opening sections including result capture, current brief manifest, and task-kind admission.
- **R11** — [Role registry](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/packages/dsh-bundle/src/role-registry.ts).
- **R12** — [Pack memory/context architecture](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/docs/pack/architecture/09_MEMORY_AND_CONTEXT.md). Planning authority, not implemented compiler proof.
- **R13** — [Runtime unit](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/config/runtime-unit.json).

### Attached and Library sources

- **A01** — Attached `goal_lifecycle(2).md`, file ID `file_00000000ff0c820aa4b8f2e3736c2d07`; six modes, transition guidance, emotional-tone table and goal-file structure. Described as the user's Minsky-inspired skill; this pass did not independently establish every historical/scientific claim in it.
- **A02** — Attached `Sophia-beyond-Sprint-1(1).pdf`, file ID `file_0000000030f48210bfdf772f89e7fc7e`, 25 September 2026; six pages describing Luis's earlier room/UI additions and then-open decisions. Its hosted commit is older than the PR report used here.
- **A03** — Attached `Screenshot 2026-09-27 at 01.03.24.jpeg`, file ID `file_0000000080a0820a91bd1eb44d740d1e`; visible UI evidence only.
- **P01** — `01_SOPHIA_END_TO_END.md`, cumulative v0.4 Part 2, 24 September 2026; Library file ID `file_0000000012f4820ab41aa44494c7fb58`. Full human guide read. Also supplied inside the attached cumulative archive.
- **P02** — Attached v0.4 pack `02_DECISIONS.md`, `architecture/09_MEMORY_AND_CONTEXT.md`, and relevant S1-08/S1-11 goal definitions; read from extracted original archive. Source member identities are subordinate to section 2's archive hash.
- **P03** — `/Sophia/Sophia_Context_Ledger_v0.2_2026-09-25.md`, file ID `file_000000004c3481f4b2d125acdb7862c6`; first 250 original lines read, covering direction, baseline, focus/context proposals and gap/session ledgers.
- **P04** — `/Sophia/Sophia_Wake_Routing_Presets_and_Steering_Authority_Addendum_v1.0_2026-09-27.md`, file ID `file_000000009748820a85102a29906cbb44`; first 140 original lines read. Preset observations are attributed to that dated study, not freshly verified upstream in this pass.
- **P05** — `/Sophia/Sophia_Capacity_Aware_Planning_and_Steering_Addendum_v1.0_2026-09-27.md`, file ID `file_00000000b328820a8bb06c4f32155b15`; first 100 original lines read for hierarchy/resource constraints. No provider quota telemetry was queried.
- **P06** — `/Sophia/Sophia_Cognitive_Modulation_Implementation_Plan_v0.1_2026-09-26.md`, file ID `file_00000000e84c81f48b7064821a44b775`; first 125 original lines read: proposal status, existing implementation home, shared allocation mechanism, no new coordinator, no universal emotional state, no automatic early activation.

### Initial external orientation, not completed second-pass audits

- **W01** — [Google Gemini 3.8 Live model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live), retrieved 27 September 2026. Model-specific async and client-content capabilities. No provider invocation performed.
- **W02** — [Google Live API tool-use guide](https://ai.google.dev/gemini-api/docs/live-api/tools), retrieved 27 September 2026. Scheduling concepts; generic examples and older model table require version-specific reconciliation.
- **W03** — [Google Live WebSockets reference](https://ai.google.dev/api/live), retrieved 27 September 2026. Session setup/configuration versus session content. Exact SDK source and wire tests remain next-pass work.
- **X01** — [ByteDance DeerFlow README](https://github.com/bytedance/deer-flow/blob/main/README.md), original lines 1–135 read; returned blob `ffdb9025650ad2a1c8a1e5f8f4c2ae7d40a9e268`. This was a default-branch orientation, not a repository-wide pinned audit. Resolve the actual commit before comparing implementation.
- **X02** — `davidelaverga/Sophia-Agent`: requested next-pass donor. No fresh source review of this repository was performed in this pass.
- **X03** — `deepseek-ai/deepseek-harness`: current Sophia runtime pin identified; upstream implementation/preset audit remains next-pass work.

## 17. Continuation instructions

Start the next pass by refreshing PR #13 head/release evidence and identifying only changes relevant to this ledger. Do not rebuild context from old packaging-time status. Keep D01–D08 as user direction or retained boundaries, and keep D09–D14 and the detailed schema/work packages as proposals unless separately approved.

Then execute the four audit tracks in section 13 and return: native-reuse matrix; exact research base/preset/tool design; source/artifact/renderer contract; nonblocking admission and result-delivery sequence; bounded implementation amendment; acceptance tests with real Markdown/PDF output. Separate recommended design from any code actually changed or tested.

The product success condition is not "Sophia made a brief" or even "Sophia made a PDF." It is: **the team can speak naturally, develop a clearer shared mission, commission useful work, understand its result, and continue later without reconstructing what they already learned.**
