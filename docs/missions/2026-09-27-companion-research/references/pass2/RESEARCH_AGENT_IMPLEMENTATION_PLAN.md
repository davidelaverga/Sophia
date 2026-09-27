---
id: sophia-research-agent-implementation-amendment
version: 0.1
date: 2026-09-27
status: proposed_not_applied
baseline: Sophia_Implementation_Pack_v0.4_Part2_2026-09-24
sophia_source: 2911b037c9703703f2ae33955123d434797e3155
scope: research_worker_family_markdown_pdf_and_voice_delivery
---

# Sophia — Research that advances the mission
## Implementation amendment · Pass 2

**Decision proposed:** one Sophia-owned research-worker family on the existing dsh runtime; explicit immutable Markdown/PDF presets; source-backed findings; a confined PDF renderer; durable job admission and delivery; one conversational Sophia. Remove the brief form, not the existing work-control and recovery foundation.

**Not performed:** no repo changes, deployment, live provider call, test-suite execution, or grant change. This is the concrete design to implement and test. All new role IDs, tool names and data extensions below are proposals, not current callable APIs.

Read alongside [the runtime upgrade strategy](DSH_UPGRADE_STRATEGY.md), [source audit](SOURCE_AUDIT.md), [prompt candidates](prompts/RESEARCH_PROMPTS.md), and [the updated ledger](Sophia_Mission_Companion_and_Research_Ledger_v0.2_2026-09-27.md).

## 1. The product episode

A team talks about an idea. Sophia helps make the unresolved question explicit. Someone says, “Research the onboarding options we discussed, explain the trade-offs and give us a PDF.” Sophia commissions that work through an actual tool and keeps talking with the team. The work yields an inspectable source-backed report, not a conversational promise or a status card containing a long paragraph.

When a useful result is ready, Sophia gives a short, relevant introduction at a safe moment. The report opens in a bounded viewer. The team may ask for clarification, change its direction, or leave the room. Later, Sophia can connect the result to the original question and the team's accepted decisions without reconstructing the entire conversation.

A clear authorized request does not need a second universal confirmation or a form. A proposal such as “we could research onboarding” is not work admission by itself. Ambiguity about the question, source scope, material cost or consequential mission change warrants one focused clarification.

A formal mission is not a precondition for every research task. An early exploration can link to the project and session focus while the mission is provisional. The mission-aware companion should not invent an accepted mission just to commission work.

### 1.1 The first acceptance episode

Use one real project question with two team contributions and at least one fresh external source where the question requires it. Request Markdown, then request a PDF rendition of that same research. Verify that rendering does not automatically repeat the source investigation. Correct one conclusion or constraint, then open a fresh exchange and show that Sophia recalls the current accepted direction, not the superseded assumption.

Do not make arbitrary quotas of sources or page counts the product objective. Evidence coverage, relevance, usability and the team's next decision are the objective.

## 2. What the source audit changes

| Area | Verified source fact | Implementation consequence |
|---|---|---|
| Native presets | The registry already exists at Sophia's rc.1 source pin. Current code has explicit mount, generation retention and blank-session selection. [D01–D03](SOURCE_AUDIT.md#d01) | Reuse it; do not build another dynamic preset engine. Upgrade and activation are separate changes. |
| Native web | Search/fetch service and providers exist; HTTP fetch has public-address and size restrictions but accepts textual formats only. [D05–D07](SOURCE_AUDIT.md#d05) | Reuse transport. Add project policy, source capture and explicit PDF intake; no assertion that native fetch already reads papers. |
| Context | Skills, compaction and spill have separate native owners. Spill is opt-in and retains the original result if its store fails. [D08–D10](SOURCE_AUDIT.md#d08) | Use native mechanisms, configure them deliberately, and retain a hard product result-size ceiling. |
| Native delivery | `present` records an existing file in a native Session event. [D12](SOURCE_AUDIT.md#d12) | Useful candidate evidence, not proof of cloud publication, viewer availability or team acceptance. |
| PDF conversion | Native document service converts Office files. [D13](SOURCE_AUDIT.md#d13) | It is not a substitute for the existing HTML-report renderer design. |
| Legacy renderer | Actual HTML-to-PDF JavaScript is independent of LangGraph and unchanged between selected donor blobs. [O01–O02](SOURCE_AUDIT.md#o01) | Extract the fixed kernel with the already-planned confinement changes; do not transplant the agent graph. |
| Modern DeerFlow | Selected source builds scoped skill catalogs and dynamic delegation descriptions; guidance weighs actual delegation benefit and distinguishes execution evidence from truth. [F01–F02](SOURCE_AUDIT.md#f01) | Borrow those design principles, not Python middleware or another coordinator. |
| Original DeerFlow | Fixed coordinator/planner/researcher/analyst/coder/reporter graph; researcher always searches and bans inline citations. [F03–F04](SOURCE_AUDIT.md#f03) | Borrow the research stages, not those role counts or blanket policies. Sophia needs inline evidence and source-only research too. |

## 3. Responsibilities and composition

### 3.1 One visible guide, one worker family

Sophia Live remains the conversational guide. A research worker receives a bounded question and relevant authorized context. It does not independently speak into the room, accept team decisions, rewrite the mission, grant itself tools, or control the team's other work.

The existing project-lead responsibility remains project-level coordination. A simple research assignment can use a predefined admitted recipe without a mandatory extra lead-model call. Material roadmap changes, work affecting several goals, resource conflicts or major replanning use the actual project-lead service once implemented. Never describe that service as available while its tool is a placeholder.

One worker family means shared behavior and contracts, not one immortal mutable process or a ban on separate bounded instances. A later independent reviewer may need a separate instance for genuine independence. Initial research uses one worker; fan-out is earned only by measured benefit.

### 3.2 Five configuration layers must not be conflated

| Layer | Owns | Example |
|---|---|---|
| Host runtime profile | Installed trusted bundles, service implementations, storage, telemetry and isolation | Existing `sophia-runtime` profile, exact release unit |
| Native capability preset | Agent-visible tools, prompt sections, skills and scoped registrations | Proposed `sophia-research-md-v1` |
| Execution policy | Provider/model/effort, source scope, cumulative allowance and continuation | Current approved route plus a bounded research policy |
| Output profile | Authoring contract, renderer and format checks | Markdown or PDF |
| Task context | Current question, mission/goal references, sources, constraints and open decisions | Per-task ContextPacket and source digest |

Provider/model changes are not needed merely to upgrade the harness. Output format must not silently imply “higher reasoning,” a different payer or more research breadth.

### 3.3 Initial preset catalog

Proposed declarations reuse the same base research prompt and evidence skill, resolved into explicit plugin lists at build time:

| Preset | Includes | Excludes |
|---|---|---|
| `sophia-research-md-v1` | Research procedure, scoped source tools, draft operations, Markdown checks, submission | General shell, deployment, account configuration, autonomous subagents |
| `sophia-research-pdf-v1` | Same research base plus PDF authoring instructions, fixed renderer and render-check tools | Unrestricted Chromium launch, remote assets, raw host commands |
| `sophia-research-pdf-rendition-v1` | Same content-integrity rules; reads existing research and authors/renders its PDF | Fresh web research by default; mission mutation; unrestricted file reads |

The third is a restricted rendition recipe in the same family, not a new researcher with different epistemic policy. It can be omitted initially when the fixed report template renders the retained source directly without model authoring. If layout-specific composition is needed, use a fresh bounded rendition episode with the existing evidence; do not switch the preset of a session that already started.

Native `select()` rejects a session after its first turn; `mount()` is the setup seam for an unpublished agent, and children can inherit the parent's exact retained generation. Do not use lower-level recompose to bypass the started-session restriction. [D03](SOURCE_AUDIT.md#d03)

### 3.4 One source for role and tool policy

Extend the existing role configuration so a resolved role identifies its native preset, base/format skill versions, permitted domain operations, and exact configuration digest. Generate the relevant allowlists and prompt capability descriptions from that definition rather than maintain contradictory parallel files.

Use native presets for composition and keep Sophia's enforced guards for authority. They do different jobs. The current bridge already applies a monotonic guard to roots and nested work and restores its recorded role on resume. Preserve it. [S02](SOURCE_AUDIT.md#s02)

A missing or broken preset fails admission/readiness; it never falls back to a broad default composition. Preset activation failure, missing web credentials, unsupported source type and renderer unavailability are distinct conditions.

## 4. Shared research procedure

### Stage A — Orient and define sufficiency

Read the assigned question, audience, purpose, current accepted mission/goal constraints, selected sources and requested format. Identify the decision or understanding the research should enable. Keep known facts, proposed claims and open assumptions separate.

Determine whether this is source-only synthesis, current external research, an update to earlier research, or format-only rendition. Do not always search merely because the agent is named “research.” Do search when freshness or the task explicitly requires external verification.

Set a compact plan and completion condition. A small question does not need a multi-agent plan. A substantial comparison should name comparison criteria and missing evidence before expanding the search.

### Stage B — Collect evidence

Use eligible project sources and approved external search/fetch. Record sources at ingestion, not from a final model-generated bibliography. Search hits are discovery evidence; material claims should ordinarily be grounded in the actual source content. Mark snippets, inaccessible pages, dated material and incomplete extraction honestly.

Prefer appropriate primary material. A vendor's claims are evidence of what that vendor says; they are not automatically independent proof of performance. Conflicting sources remain distinguishable. Retain source language and dates; translate content where useful without removing provenance.

Full raw content may remain outside the model context. Give the worker bounded passages plus source IDs and pagination handles. A truncated excerpt must say it is truncated; do not label an 8,000-character prefix as the complete exact source.

### Stage C — Reason and check

Organize the answer around the user's question, not around tool calls. Link load-bearing factual claims to passages. Clearly identify inferences, assumptions, unknowns and evidence that would change the conclusion. Check relevant contradictions rather than simply count agreeing pages.

For comparisons, use the same criteria for all options and avoid ranking based on incomparable measurements. For quantitative data, preserve units, periods and populations; compute with an approved deterministic operation when required, not invented figures or visual estimates.

A review pass checks citation targets and unsupported claims. Routine work can self-check within the worker's allowance. A costly independent reviewer is conditional on the task's risk/quality contract; neither this document nor a research completion grants it authority to accept the team's mission.

### Stage D — Author the requested artifact

Use the selected output profile. Retain a research record and editable source. Do not force every report into the same large template, insist on a diagram, or add generated images merely to look complete.

The report should make its conclusion, rationale, evidence, limitations and practical implications easy to find. Its length is determined by the assignment. Internal scratch notes and tool outputs are not user deliverables unless explicitly requested.

### Stage E — Validate and submit

Persist candidate source and requested rendition, obtain actual validation results, and submit their immutable IDs/hashes to the application. Submission is idempotent and bound to task, attempt, current authority and source revision. A successful model turn or last assistant paragraph is not artifact completion.

The server verifies the object belongs to this attempt, exists, has the declared format, matches the manifest/hash, passes mandatory checks and remains eligible. Only then does it emit artifact-ready state. This is separate from human acceptance and goal completion.

### Stage F — Return to the mission

Return a compact finding summary, key uncertainty, source/artifact references and possible implications. The companion decides how to introduce it naturally. The mission ledger records the research result as evidence; a suggested direction remains a proposal until the appropriate team decision.

“Research produced a PDF” is an execution outcome. “The team's assumption was supported” is a claim requiring evidence. “We changed the mission” is a decision requiring authority. Do not collapse those three.

## 5. Tool surface and service boundaries

The following are proposed semantic operations. Bind actual wire names through the canonical contracts during implementation; do not add declarations that return placeholders.

| Operation | Implementation direction | Enforcement |
|---|---|---|
| Read current project/task context | Existing project state and ContextPacket seam | Project membership, audience, eligibility, exact revisions |
| Find/read source passages | Source objects plus bounded search/read adapter | Source identity/hash/locator, continuation, no broad personal memory |
| Search the web | Native `ctx.web` provider through a thin Sophia policy/provenance adapter | Provider authorization, query disclosure, source count and allowance |
| Fetch a public page | Native bounded public HTTP provider | Native network policy plus project policy and evidence capture |
| Read a supported PDF | Explicit source intake/extraction path | Binary size/page caps, sandboxed parse, page locators and coverage |
| Write/revise a draft | Restricted per-attempt source workspace | Relative allowed paths, expected base/hash, no host/skill writes |
| Render PDF | Fixed render-job supervisor and kernel | Exact source manifest, denied network, cancellation and resource limits |
| Inspect render | Structured check receipt plus permitted page previews | Result bound to exact source/rendition; unknown does not pass |
| Submit research result | Product service captures and publishes candidate | Current authority, idempotency, format checks, source closure |
| Report blocker | Existing work-event path with bounded structured detail | No direct room narration; no self-granted continuation |

The native search and fetch implementation should be reused below the thin adapter, not duplicated. The adapter adds the product-specific policy and source IDs that the generic provider cannot infer. A trusted plugin calling a native service directly must observe the same policy; a model-facing tool allowlist alone is not a complete egress boundary.

### 5.1 Explicitly unavailable in the first worker

No raw host shell, arbitrary subprocess, package installation, plugin manager, credential/account tools, deployment, cross-project mutation, direct SQL, automatic long-term memory writing, generalized browser control, scheduled task creation or unrestricted workflow/child spawning.

Renderer supervision may execute a fixed process as trusted infrastructure; that does not expose an arbitrary shell tool to the model. General computation and additional formats are future capability additions with their own sandbox and tests.

### 5.2 PDF source intake is separate from PDF output

The native HTTP fetch provider explicitly rejects binary types and defers text-extractable PDFs. Native Office-to-PDF converts different input formats; it is not a PDF research reader. [D06, D13](SOURCE_AUDIT.md#d06)

Bind existing source-upload/extraction support if it is actually implemented and eligible. Otherwise add one bounded binary intake and PDF extraction component, reusing approved network-validation primitives where publicly supported. Do not import dsh private internals merely to make the first reader work.

Initially support text-based PDFs with page-scoped extraction; image/scan-only or partially extracted pages return an explicit coverage limitation. Source visual inspection can be a qualified capability, not an invented OCR result. A missing PDF reader does not mean the paper was read from a search snippet. The basic HTML/text research pilot may run while PDF intake is still unavailable, but its capability description must say so.

A YouTube/video URL is likewise not a watched video or a verified transcript. Treat transcripts and video analysis as explicit future source capabilities unless a current verified route exists.

## 6. Minimal research state, not a second knowledge platform

Extend existing tasks, work attempts, source objects, dependencies, artifact versions and events. Avoid a new independent job store or generic knowledge graph.

A small source-backed `ResearchRecord` can initially be a versioned JSON document linked to the task, with database columns/indexes only for operations that need transactional enforcement. It contains:

```text
ResearchRecord
  id, projectId, workId, attemptId, revision
  question, purpose, language, intendedAudience
  missionRevision?, workGoalId?, sessionFocusRef?
  inputManifestRef, sourceEligibilityRevision
  sourceRefs[]: sourceId, version/hash, locator, retrieval time, coverage
  claims[]: statement, factual|inference|assumption, evidenceRefs[], uncertainty
  unresolvedQuestions[], contradictions[], remainingWork[]
  sourceArtifactRef, renditionRefs[]
  checks[], limitations[], resultSummary
```

This is a proposed conceptual record, not an already-supported API. Keep the claim list focused on load-bearing claims rather than creating bureaucracy for every sentence. Native session logs remain execution evidence; canonical accepted project state remains domain authority.

### 6.1 Admission request

Extend the existing `NativeTaskRequest` union with a real research kind. Suggested content: instruction/question, requested outputs (`markdown`, `pdf`), selected source references, optional goal/focus references and an eligible execution-profile preference. The server supplies actor/project binding, current grants, revisions, resolved native preset and resource allowance.

A model must not choose an arbitrary native preset path, provider credential, file root, database actor or authority epoch. A preference is not a permission grant. Resolve ambiguous “this” against current authorized focus or ask one question.

Keep idempotency on the server-derived command identity. A reconnect/retried admission must not create a second job. A new user request that truly changes the scope is a new identified amendment, not reuse of the same key with different bytes.

### 6.2 State vocabulary

Use existing lifecycle enums where they fit. The following are conceptual work phases to map through an explicit contract amendment, not literal replacements for today's database enums:

```text
admitted → collecting → synthesizing → authoring → checking → artifact ready
                 ↘ blocked / held / stopping / failed / partial ↗
```

Desired control state, actual worker activity, artifact delivery and human acceptance remain separate. A task can have a usable Markdown result while its requested PDF rendition failed. Show that distinction, and never call the original PDF request fully complete.

### 6.3 Result manifest and publication

A result must identify the actual primary format, source version, immutable object hashes, evidence record, checks and limitations. When both formats were requested, they share research lineage and each has its own rendition identity and validation result.

Existing result capture for `draft_brief` takes text from a native assistant message. Do not use that path for research or PDF publication. Add the research result operation without changing historical brief records. A native `present` event can contribute candidate-file evidence; it cannot itself grant cloud upload or acceptance. [D12](SOURCE_AUDIT.md#d12)

The application uploads/captures through its authorized storage path, checks the bytes, commits publication and then emits an event. It must reconcile an unknown upload/publication outcome rather than blindly write a second version. Disallowed, stale or stopped attempts cannot publish new results after the authority changes.

### 6.4 Projections must arrive before artifact records

The first pass found that current `readSnapshot` deliberately refuses when artifact records exist but their projection is unavailable. Implement the real artifact/work projection and viewer contract before enabling new research publication. Otherwise the first real PDF could make the existing snapshot fail.

Do not add a separate “research artifacts” side channel that bypasses the intended artifact/version model. Use a compatibility deployment sequence; keep required current data readable throughout migration.

## 7. Output profiles

### 7.1 Markdown

Create a real UTF-8 `.md` object with a title, appropriate structure, inline citations or stable source references, and explicit limitations. The rendered preview uses a sanitized Markdown renderer; raw HTML, executable links and remote image fetching are restricted by the product's source policy.

Validate nonempty parseable content, expected language, declared file format, resolvable citation targets, required sections/criteria where specified, and no internal scratch or secrets. Verify that the preview/download refers to the same source version. Do not claim a semantic conclusion is true merely because the Markdown parser accepts it.

Markdown is the first cheap complete vertical slice. The team should be able to read it, ask about a cited source, and revise it before PDF is activated.

### 7.2 PDF

Use the approved HTML-report source path, not a new Python research harness. Retain the authored HTML and approved assets as supporting source; the primary deliverable remains PDF. Internal HTML is not an extra user-facing output format in this pilot.

The old PDF kernel is a viable donor: it uses Chromium, disables page JavaScript, prints A4 with page numbers, blocks unexpected subresources and checks generated bytes. Its Git blob is unchanged at the two inspected donor pins. This is source portability evidence, not evidence that the new service is deployed. [O01–O02](SOURCE_AUDIT.md#o01)

Apply the existing extraction design's required adaptations:

- Explicit immutable source root and allowed asset hashes; no guessed `outputs` root.
- Realpath/path validation; no escaping symlinks, arbitrary absolute paths or unlisted files.
- Non-root job, read-only input, bounded scratch/output, no provider/application secrets, no Docker socket and no network.
- Tested browser confinement; remove `--no-sandbox` and never silently retry with weaker isolation.
- Fixed supervisor command, bounded process/time/memory, cancelled process-group settlement before cleanup.
- Structured renderer result including exact source-manifest hash, browser/kernel versions, output hashes/sizes, page count and check outcomes.

These are already in the active plan, not newly invented prerequisites. [S04](SOURCE_AUDIT.md#s04)

For source integrity, preserve citations and important content across Markdown/HTML/PDF. For visual quality, inspect actual pages: margins, clipped/overflowing text, readable tables, heading hierarchy, source links and multilingual glyphs. Missing measurements remain unknown. A correct file signature or one successful screenshot cannot establish all-page accessibility compliance.

Do not require conceptual images for ordinary research. Use tables and simple diagrams only where useful. Quantitative charts must derive from real recorded data. Source assets are bundled by hash; fonts remain installed/licensed in the renderer image, not distributed as font files to the user.

### 7.3 Reuse research when changing format

When the user asks for a PDF of existing research, reuse its evidence and conclusions unless the request also changes freshness, audience, scope or interpretation. A pure rendition is a smaller operation with no fresh research permission by default. If essential source content is missing or invalidated, explain the gap and request/perform only the permitted work needed to repair it.

A format failure may leave an accessible source or partial result. It must never silently substitute that source for the requested PDF while reporting success.

### 7.4 Later slides

Do not ship slides in this increment. The older v0.4 extraction plan selects image-based PPTX, while the newer legacy worker obligations point to a native deck service and forbid screenshot-deck fallback. That is a future donor-choice question requiring source and actual-output inspection. This document neither asserts the newer service works nor silently changes the accepted slide strategy. [S04, O03](SOURCE_AUDIT.md#o03)

## 8. Google Live: short calls, durable work and result delivery

### 8.1 Keep standard Live for conversation

Google's model-specific documentation supports nonblocking tools and full-session client-content updates for `gemini-3.8-live`. Extended Thinking has different idle and scheduling semantics; it is not required to run Sophia-owned background research. Keep the existing standard voice route and SDK during the research/dsh change unless a separately tested media change is necessary. [G03–G04](SOURCE_AUDIT.md#g03)

### 8.2 Call lifetime versus job lifetime

A short in-exchange lookup can use a nonblocking call and, where useful, a sequence of responses ending with `willContinue:false`. A durable multi-minute research task should instead finish its **admission** call promptly with the real work ID, then run independently of the Google socket.

Illustrative typed response, after successful product admission:

```ts
// Schema illustration using the existing SDK shape; not a ready production endpoint.
const response = {
  id: call.id,
  name: 'start_research',
  response: { output: { status: 'admitted', workId: receipt.workId } },
  scheduling: FunctionResponseScheduling.WHEN_IDLE,
  willContinue: false,
};
session.sendToolResponse({ functionResponses: [response] });
```

`scheduling` and `willContinue` are top-level fields. The pinned SDK passes function-response objects into the wire object, rather than lifting fields nested inside `response`. `willContinue:false` means future responses for that call will not be considered. Do not attach the final research result to that closed call ID. [G01–G02, G05](SOURCE_AUDIT.md#g01)

“Admitted” is not necessarily “running.” Sophia should say that the task is queued/started according to the actual receipt/state, never done before publication.

### 8.3 Result sequence

```text
attributed spoken request
  → short admission transaction + durable command/job
  → nonblocking tool response, original call finished
  → worker on dsh, conversation continues independently
  → source/evidence/format checks and product publication
  → durable result event, artifact/work projection
  → eligible compact Live context update
  → one useful announcement at a safe boundary, or retained for next exchange
```

The current bridge already has an idle-gated announcement and retried delivery receipt. Generalize it from brief-specific copy, retain its actual state/attribution gates, and improve the event identity and evidence semantics. [S03](SOURCE_AUDIT.md#s03)

### 8.4 Full-session context updates: a qualified improvement

The model-specific docs no longer justify a blanket claim that client content is only for initial history. Proposed passive updates use `sendClientContent` with an explicit `turnComplete:false`; the pinned JS default is **true**, and the model-specific documentation says true interrupts generation. [G02–G04](SOURCE_AUDIT.md#g02)

A compact update can contain event/work/artifact/source identities, current authority/eligibility revisions, a bounded summary and missing-context markers. It is an application event, not fabricated human speech or a model-authored system instruction. Quote/sanitize any untrusted worker/source content inside the trusted event envelope.

Do not promise deterministic ordering against separately streamed audio merely because ordered client content exists. Test the exact SDK/model in interruption, concurrent speech, reconnect and source-change cases before replacing the current notice path. Until that probe passes, keep the known transport and use current-record reads at the next appropriate turn.

One component owns voice delivery. A worker report, context update, UI card and announcement must not each independently trigger speech. A useful result can say what it resolves and what remains open; it should not read a whole report by default or speak only “a brief is ready.”

### 8.5 Cancellation, rooms and truthfulness

Provider tool-call cancellation concerns the pending interaction. It does not automatically revoke a research task already admitted by the application. An explicit Stop work uses the authenticated work-control path. A correction spoken during a disputed admission must reconcile whether work was actually admitted before deciding how to amend/cancel it.

Stop speaking, Stop looking, End exchange, Hold work and Stop work retain different semantics. Leaving the voice room does not destroy useful research. No eligible exchange means the result remains visible in project records and is available on return; it does not justify silent room reopening or another background narrator.

The current announcement receipt is triggered after audio begins reaching the room. Preserve that as a measured playback-start observation, not proof that every participant heard the complete conclusion. Track context sent, playback started, playback completed/interrupted and user opened/accepted separately where needed. First-frame delivery does not prove comprehension. [S03](SOURCE_AUDIT.md#s03)

If audience/source permission narrows, rebuild or stop affected context rather than append an instruction to forget already-disclosed material. Do not let a late old-source result enter the new eligible context.

## 9. Budgets, effort and recovery

### 9.1 Resource envelope

Use one cumulative work/goal allowance across attempts, steers, format conversion and reviews. The policy should carry model-route constraints, money/token reservation where available, tool/search/fetch limits, wall-clock deadlines, source-byte/page bounds, repair allowance and enough reserved capacity to save/publish an honest result.

Native per-request output caps, native goal round counts and workflow concurrency limits are useful but do not constitute a complete cumulative financial allowance. Do not reset spending because an agent was resumed or its format changed.

The harness upgrade retains today's approved model route. Later research experiments may compare the planned DeepSeek route with the current development route, but only with explicit provider/data/payer eligibility. Source pin, model string and reasoning effort are recorded independently.

### 9.2 Initial calibrated policies

Start with one worker and a small fixed portfolio: source-only synthesis, ordinary external research, deeper research, and rendition-only. Use one bounded repair by default for a format/check failure; a second attempt requires an explicit policy reason or remaining allowance. These are proposed pilot defaults, not measured optima.

Do not hard-code universal “high reasoning” for every step, fan out on every question, or demand an extra classifier before every read. Source collection, synthesis, checking and rendering have different computational needs. Record actual cost/latency and compare eligible settings after the stable baseline works.

A full Jev cognitive controller, provider quota scheduler or autonomously generated workflow is not a prerequisite. Preserve the extension seams from the existing modulation/capacity plans without bringing their entire later scope into this pilot.

### 9.3 Context and partial output

Use native compaction and spill rather than port old Python middleware. Define explicit inline-result ceilings: native spill failure can retain the original result, so the product must still prevent an unbounded response from entering the next model request. Prefer a safe bounded preview with a readable source handle, or a clear context-storage failure, over quietly dropping source evidence. [D09–D10](SOURCE_AUDIT.md#d09)

Persist important findings/source IDs and draft state before context loss. A compaction summary is a navigation aid, not authority over current accepted decisions or source files. On resume, reconcile actual drafts/results/receipts, not just a sentence claiming the work was complete.

When budget or a source failure prevents completion, retain verified partial research and a precise missing-work account. Do not manufacture a final PDF from unsupported conclusions solely to satisfy a format gate. Preserve prior usable versions during repair.

## 10. Mission integration and UI

Retain the mission read/write and note-governance work from pass 1. Research does not require automatic raw-room transcription, and adding it does not authorize ambient recording.

A research job should link to the question/expectation it investigates. On completion, attach the result as evidence. The companion can compare predicted versus observed outcomes, ask about a material unresolved issue, and propose a next step. Only the appropriate decision operation changes accepted mission state.

Converse removes `BriefRequest` and brief-specific selection controls. Optional text and manual controls remain for accessibility/recovery. Work Pulse shows actual phase, blockers and controls, not invented percentages. Research results open in the existing shared artifact presentation model with a bounded scroll area and dock-safe space.

Source, latest rendition and accepted version are not synonyms. A PDF view and its source read must agree on artifact/version. Voice navigation should use the same reference resolver/context seam as manual navigation, not a second browser-click agent.

## 11. Incremental migration from the brief slice

Keep legacy `draft_brief` records and their read/control handlers. Remove or disable new brief creation in the primary experience as the replacement capability becomes available. Do not rename old tasks into research, delete useful old results, or remove the historical `sophia-brief-v1` definition while resumable work still depends on it.

Add the new native-task kind and typed result contract with reviewed append-only migrations and contract amendments. Do not edit migrations 0012/0016 or assume a new migration number is still free; coordinate against the live repo ledger.

Deploy read compatibility before writing new kinds/artifacts. This includes old-result reads, current snapshots, generic TaskCard/result links, source access and error presentation. Feature-off should disable new research admission without hiding already-created research history.

The runtime upgrade may be rolled back separately before new feature data exists. After research data is introduced, the old brief-only application is not automatically a valid rollback target. See the explicit compatibility strategy in the upgrade document.

## 12. Exact implementation map

| Existing destination | Proposed delta |
|---|---|
| `apps/media-bridge/src/tools.ts` | Declare only implemented research/context operations; retain controls and correct FunctionResponse shape. |
| `apps/media-bridge/src/live-session.ts` | Shared capability-aware guide assembly; add a qualified passive-context method without changing unrelated voice setup. |
| `apps/media-bridge/src/room-session.ts` | Generic result events, bounded context/notice scheduling, stale suppression and meaningful delivery evidence. |
| `apps/api/src/media-tools.ts` | Map attributed research intent to the same admission service as text; richer source/current-context reads. |
| `apps/api/src/routes/conversations.ts` and current native-task route | Extend request/result contract; inspect actual route ownership before adding another endpoint. |
| `packages/persistence/src/native-tasks.ts` | New kind/result mapping; preserve historical briefs and current RLS. |
| `packages/persistence/src/snapshot.ts` | Real research work/artifact projection before publishing artifact records. |
| Existing SQL/functions introduced in 0012/0016 | New migration only: admission, source-dependency checks, result publication, control/authority validation. |
| `packages/contracts/` | Reviewed schemas, generated types/validators, new explicit compatibility tests. |
| `config/roles.json`, `packages/dsh-bundle/src/role-registry.ts` | Shared research-family catalog, explicit native preset mapping and policy digests. |
| `packages/dsh-bundle/src/control-bridge.ts` | Native preset mount on create/resume plus existing guards; no second loop. |
| `packages/dsh-bundle/cordis.patch.yml` | Trusted preset/skill/domain-tool composition; explicit disabled native surfaces retained. |
| Planned context/source package | Minimal source capture, passage reads, research context and current mission references; no separate memory authority. |
| `renderers/web/pdf/render-html.mjs` (planned destination) | Adapt the already-selected kernel behind the fixed supervisor. |
| `apps/studio/src/features/conversation/Conversation.tsx`, `TaskCard.tsx` | Remove brief ritual; generic result summary and artifact open/read controls. |
| Existing Studio artifact/viewer area | Implement actual Markdown/PDF view with source/version and dock-safe scrolling; bind exact destination with Luis. |

New module filenames should follow the repo's conventions after ownership review. A planned destination is not asserted to exist today. Do not create duplicate services just to match illustrative names here.

## 13. Bounded work sessions

These are proposed work-session IDs within an amendment to existing goals, not a renumbering of the approved pack. Runtime sessions are specified in the companion upgrade plan.

### RA-01 — One real source-backed Markdown research task

**Depends:** qualified compatible runtime/preset mapping; existing admission and source/auth records. Minimal project context may precede the complete S1-08 knowledge work.

**Build:** research kind, one preset/base skill, scoped source adapters, evidence record, actual Markdown result, generic artifact projection and viewer. Hide the brief form when the replacement is usable; retain optional text and old-result reads.

**Evidence:** one useful fresh-source research task through the real API/dsh path; exact source/citation references; one denied private source; one unavailable source; idempotent retry; actual readable Markdown.

**Rollback:** stop new research admission, preserve existing records/results and read-compatible application. No dataset deletion.

### RA-02 — Same research, real PDF rendition

**Depends:** RA-01 and the narrow S1-13 renderer extraction/confinement work.

**Build:** immutable report source/asset package, isolated kernel, structured render/check receipt, PDF storage and bounded in-app view. Bind supported PDF intake separately from output generation.

**Evidence:** readable multipage report with citations; format-only request does not issue new research calls; non-ASCII text; long table/long link; missing asset refusal; path/symlink escape refusal; unavailable measurement does not pass; cancelled renderer settles and no stale publication occurs.

**Rollback:** disable PDF admission/rendering while retaining Markdown and prior PDF reads. No silent wrong-format success.

### RA-03 — Voice launches and receives research without taking over conversation

**Depends:** RA-01; run PDF case after RA-02. Retain S1-05A privacy/control obligations.

**Build:** actual voice tools, task-attributed command ID, immediate admission response, coalesced result context and one narration, reconnect and next-exchange delivery. Probe passive `clientContent` explicitly before enabling it.

**Evidence:** two authenticated participants continue talking during the job; one durable task; correct person/source context after handoff; interrupted announcement can be understood/recovered; result remains accessible after End; no guest/private-source leakage.

**Rollback:** revert transport enhancement to the known notice/read path, not to a blocking research call. Keep durable artifacts.

### RA-04 — Steer, Hold, Stop and useful partial recovery

**Depends:** RA-01/02; source dependencies, work fences and control bridge.

**Build:** safe-boundary amendments, existing cumulative allowance, source/version-based partial continuation, renderer cancellation settlement, deterministic stale-result rejection.

**Evidence:** a mid-research change preserves valid findings; Hold stops new work until explicit Resume; Stop prevents publication under the old epoch; a process restart retains pending inputs and results; PDF failure preserves the verified Markdown result without falsely completing the PDF request.

**Rollback:** disable new amendments while preserving Hold/Stop and record reads. Do not discard a live job simply because a feature flag changed.

### MCG-04 continuation — Research changes the next conversation

**Depends:** the minimal mission read/write, adapted guide skill and enabled project-note policy from pass 1, plus RA-03.

**Build:** link research to the original question/prediction and source-backed mission update; preserve proposals versus accepted direction.

**Evidence:** in a fresh exchange, Sophia identifies the current mission, the tested assumption, the result, one remaining uncertainty and the next accepted step; a corrected/removed source does not reappear through an old summary.

This is the product acceptance, not a new memory-platform project.

## 14. Acceptance matrix

| ID | Test | Required result |
|---|---|---|
| R-T01 | New idea, no formal mission | Useful exploration; no required brief/mission form or invented acceptance. |
| R-T02 | Explicit research by voice | One durable admission under the actual speaker; no second confirmation unless meaningful ambiguity. |
| R-T03 | Discussion/proposal only | No work commissioned silently. |
| R-T04 | Admission lost/retried | Same command/task; unknown is reconciled, not replayed with new identity. |
| R-T05 | Ordinary source-only summary | No compulsory web search. |
| R-T06 | Freshness-dependent question | Actual external source retrieval; timestamps and limitations retained. |
| R-T07 | Malicious source or skill-looking page | Treated as evidence, never new system/tool/permission instructions. |
| R-T08 | Private source or private search query | Egress policy holds; denied material never reaches another provider. |
| R-T09 | PDF source unsupported/incomplete | Honest unsupported/coverage result; no false claim to have read the whole paper. |
| R-T10 | Long tool output/spill failure | Hard bounded model input with recoverable evidence or clear error. |
| R-T11 | Actual Markdown | Stored bytes, inline source references, usable sanitized viewer/download. |
| R-T12 | Same research→PDF | No redundant research by default; exact lineage, actual PDF and retained source. |
| R-T13 | Render failure or unknown check | No success label; prior usable result retained. |
| R-T14 | Unsafe renderer path/network request | Refused under enforced isolation, not just prompt guidance. |
| R-T15 | Result during speech | No duplicate narrator or unintended interruption; useful later delivery. |
| R-T16 | Late result after End/reconnect | Project retains it; eligible next exchange can discuss it without reopening the room. |
| R-T17 | Tool cancellation vs explicit Stop | Correctly distinguish pending call disposal from durable job control. |
| R-T18 | Hold/Stop/steer race | Current authority wins, accumulated spending unchanged, completed findings retained where valid. |
| R-T19 | Source revocation/correction | Dependent future contexts invalidated/rebuilt; old raw session does not reinject it. |
| R-T20 | Fresh returning conversation | Research informs mission understanding; result ≠ accepted decision. |
| R-T21 | Language | English/Italian/Spanish cases, actual Unicode source/renderer coverage, not labels alone. |
| R-T22 | Capability unavailable | No promised search/PDF/project lead when unavailable; no provider or format substitution without policy. |

Report actual cost, latency, interruption count, duplicate admissions/notices, source coverage, unsupported claims, successful correction and returning-session continuity. A passing unit fixture does not replace the real two-person episode. No wall-clock waiting period is required; run bounded cases as soon as prerequisites are available.

## 15. What stays out of this increment

Full native slides, image generation, arbitrary browser/computer use, free-form host shell, global memory migration, autonomous skill editing, continuous model hot-swapping, full quota scheduler, unrestricted subagent fan-out and a second project coordinator. These can be evaluated later through the same contracts; none is required to replace the brief ritual with useful research.

## 16. Completion statement for an implementation handoff

A successful handoff must name the exact Sophia/dsh/SDK/renderer units; implemented preset and tools; tested source formats; actual MD/PDF artifact references; passed and pending acceptance cases; observed usage; migration/compatibility state; remaining S1-05A obligations; and the rollback target that can read all newly created data.

Do not say “research implemented” because `sophia-research-v1` exists in a role enum, because the model emitted a filename, or because a renderer returned bytes. The result must reach the team and remain useful in the next mission conversation.
