# M03 — Research that returns useful Markdown/PDF and advances the mission

**Proposed PR title:** `feat(research): sourced Markdown/PDF work with nonblocking voice delivery`  
**Mission ID:** `SMC-M03` · **Implementer:** Claude Code · **Operator/support:** Codex  
**Depends on:** integrated M01 context/mission contracts and qualified M02 runtime/preset seam.  
**Launch:** [Claude](../launch/M03_CLAUDE.md) · [Codex](../launch/M03_CODEX.md)

## 1. Outcome

An authorized member asks Sophia to investigate a real question and produce a Markdown or PDF result. Sophia derives the assignment and permitted source context from the conversation without a brief form. One durable worker runs while the team continues talking. The result has inspectable evidence, actual stored artifact bytes and a usable viewer. A later exchange connects the finding to the current mission and an appropriately accepted next step.

Deliver the full Markdown/PDF episode in this PR, using independently tested internal checkpoints. No slides, images, autonomous multi-agent research swarm, general browser use, external engineer coordination or new memory provider is required.

## 2. Research architecture

One shared research base prompt and evidence skill, with immutable output presets:

| Preset | Scope |
|---|---|
| `sophia-research-md-v1` | Investigate an admitted question; author source-backed Markdown; validate and submit. |
| `sophia-research-pdf-v1` | Same research procedure plus retained report source, confined PDF rendering and visual checks. |
| `sophia-research-pdf-rendition-v1` | Optional, restricted layout-authoring episode over existing research; no fresh web by default. Omit if deterministic rendering suffices. |

Use M02's public native mounting and immutable configuration identity. Keep host profile, capability preset, model/effort policy, output requirements and task context distinct. A PDF request does not silently increase reasoning, switch provider/payer or repeat research. A started native session does not switch presets to change format.

The project lead is not a compulsory intermediate model. A straightforward admitted research recipe runs directly through the current work service. Material roadmap/reallocation decisions use the lead only once its real service exists; this PR does not claim it does.

## 3. Source providers and native reuse

Implement the pinned, reviewed policy in [WEB_SOURCE_POLICY](../research/WEB_SOURCE_POLICY.md). Initial selected provider direction: **Tavily search + Jina Reader extraction**, with direct public HTTP as an explicit qualified alternative. Configure the selected route once; no hidden vendor waterfall.

The old repository's example selected Tavily/Jina, but runtime configuration and keys were not verified. Codex discovers authorized credential presence and actual permitted provider use; never copy old `.env` or secret values into the PR or chat. [Audit](../research/LEGACY_WEB_PROVIDER_AUDIT.md)

At the inspected native candidate, register a small Tavily adapter through public `ctx.web.registerSearchProvider`. Native search request/result/cancellation shapes fit its basic search API. The native family currently documents Exa, Perplexity and DeepSeek, not built-in Tavily/Jina. [SRC-14, SRC-15](../SOURCE_REGISTER.md)

**Jina is extraction, not necessarily a conforming direct HTTP fetch.** The native `WebFetchResult` requires the fetched resource's final URL and HTTP status. A Reader response may expose only the extraction service's status. Use the Sophia source-read adapter with separately typed provider transport status and nullable origin metadata unless the chosen Jina response actually proves all native fields. Do not cast `200 from Jina` as `200 from the origin`, or claim its Markdown is exact original HTML. This is a targeted refinement of pass 2's generic native-web reuse recommendation. [SRC-18](../SOURCE_REGISTER.md#src-18)

Keep Tavily Extract and Firecrawl adapters as documented optional later alternatives, not mandatory implementations in this PR. They may be added only when a concrete conformance or coverage problem justifies them and the route is authorized. A native direct HTTP option must use the supported public service and its network rules rather than private implementation imports.

## 4. Model-facing operations

Expose the smallest real tool surface through Sophia-owned, source/budget-aware operations. These names are proposed binding targets:

| Tool | Contract |
|---|---|
| `research_read_context` | Read the exact admitted assignment, current eligible constraints and source manifest. |
| `research_search` | Search an eligible external query under the selected provider; capture discovery records and actual usage/request identity. |
| `research_read_source` | Read a permitted source/URL or next passage; capture full supported extraction up to enforced bounds and return paginated content. |
| `research_write_draft` | Write/revise allowed per-attempt source files with expected base identity, not arbitrary host paths. |
| `research_render_pdf` | Execute the fixed renderer supervisor on an immutable source/asset manifest. |
| `research_inspect_output` | Read actual text/check evidence and permitted page previews from the exact rendition. |
| `research_submit_result` | Submit source/evidence/artifact IDs for server validation and publication. |
| `research_report_blocker` | Emit a bounded work event/remaining-work record without directly speaking to the room. |

Reuse existing task/context/file primitives where they already satisfy these contracts; do not duplicate them simply to preserve illustrative names. Hide ungated global native web/shell tools from this preset. All actual egress passes the same source and allowance policy even when called by a trusted adapter; no untrusted workspace plugin discovery, raw shell, arbitrary subprocess, package install, account manager, SQL, deployment or unrestricted workflow child spawning.

## 5. Durable request, evidence and publication

### 5.1 Admission

Extend the existing native-task union with an actual `research` kind and an explicit rendition request/variant. Model-facing input includes the question/instruction, requested outputs (`markdown`, `pdf`), relevant existing sources and optional work/focus references. Server derives authenticated actor/project, grants, actual mission/ledger revisions, preset, provider/model/effort, limits and source eligibility.

A clear authorized spoken request commissions one task without another compulsory confirmation. Discussion alone does not. Consequential missing scope, uncertain target or additional spend requires focused clarification. A provisional mission is allowed; internally bind the existing current project revision without inventing accepted mission content.

Use existing goal/attempt/command/job/outbox/lease machinery. Keep current control states rather than building a competing research queue. Duplicate delivery/reconnect returns the same admission. A materially new instruction is an identified amendment, not a changed payload under the old idempotency key.

### 5.2 Evidence and draft state

A versioned `ResearchRecord` can be a source-backed JSON document with indexes only where transactional checks require them. Include question/purpose, assignment manifest, important claims and linked source passages, contradictions, limitations, current draft/output references, checks and remaining work. Preserve discovery snippets separately from inspected full/extracted content.

Record source identity at retrieval, not from an invented final bibliography. URLs, dates, extraction type/version, retrieved content hash and passage/page locators remain inspectable. Store only authorized content within retention and permitted-use scope. An extraction error, login wall, search snippet or unread table is not evidence that the full source was read.

Save useful state at meaningful boundaries and before compaction. Native context spill/compaction is reused; a summary remains a navigation aid, not authority over current source and decisions. Hard input-result ceilings hold even if spill storage fails.

### 5.3 Critical schema compatibility

The inspected core `artifacts.format` constraint accepts `html`, `pdf`, `pptx`, `ui`—**not Markdown**. Add the chosen Markdown value consistently to the database constraint, API unions/validators, storage MIME mapping, artifact projector and UI. Do not label Markdown as HTML to evade this constraint. [SRC-16](../SOURCE_REGISTER.md#src-16)

The current snapshot also intentionally refuses populated artifact records before its projector exists, as recorded in pass 1. Implement compatible work/artifact/source readers and the actual viewer **before** enabling writes. Do not publish research into a special side channel that avoids the canonical artifact/version model.

### 5.4 Completion is an application transaction

Do not reuse brief-specific capture of the last assistant message as the research success signal. The worker submits real source/evidence/output references; application services verify ownership, hashes, requested formats, eligible source closure, mandatory checks and current goal/attempt authority before committing publication.

Storage upload and database commit are separate effects: use stable object/operation identity, pending publication state and reconciliation. If an upload reply is lost, inspect the expected object/hash before retry; do not publish a duplicate version under a fresh identity. Stop or source revocation fences late publication.

Artifact-ready is not team acceptance or mission completion. Markdown-ready with PDF-failed is a useful partial result but not complete fulfillment of a PDF request. Preserve prior usable versions during repair.

## 6. Markdown, PDF and source reading

### 6.1 Markdown first

Produce actual UTF-8 bytes, inline source references, useful headings and explicit limitations. Sanitize the in-app preview, restrict raw HTML/executable links/remote image loads, and bind preview/download to the same source version. Check file type, nonempty content and citation destinations; semantic truth is not established by successful parsing.

### 6.2 Same research to PDF

Reuse the retained research when a user requests another format. If existing source fits a fixed report template, render without a new model call. Otherwise use the restricted rendition preset to author the layout, without fresh search or changed conclusions by default.

Use the already selected legacy JavaScript HTML-to-PDF kernel as a donor, not its Python agent graph. Retain authored report source and approved assets; PDF is the primary requested output. Requirements from the active extraction plan remain: non-root/confined process, read-only input manifest, bounded output/scratch/time/memory, denied network, no provider/application secrets, no Docker socket, no arbitrary file paths/symlinks and no silent `--no-sandbox` fallback. [Pass-2 renderer scope](../references/pass2/RESEARCH_AGENT_IMPLEMENTATION_PLAN.md)

Codex must confirm a real host can meet those constraints. If the current Render deployment cannot, propose a named bounded renderer-host change with price/authority implications before enabling PDF. An insecure host fallback is not completion.

Validate actual pages: text overflow, margins, long tables/URLs, headings, citations, fonts and EN/IT/ES glyphs. Retain a renderer/check receipt tied to exact source and output hashes. Use deterministic checks plus actual visual inspection for the pilot; unknown checks do not pass. Do not claim full accessibility certification from one screenshot or nonempty bytes.

### 6.3 PDF input is a separate capability

Native anonymous fetch is textual; a provider returning extracted PDF prose does not necessarily preserve page/table coverage. Implement or bind one bounded text-PDF intake/extraction route where required, with page locators and explicit partial/scan limitations. The minimum research pilot can read verified HTML/text while PDF input remains unavailable, but its declaration and result must say so. Producing a PDF does not prove Sophia can read all PDFs.

No OCR/video/transcript/browser claim without a tested route. A search result for a video is not a watched video.

## 7. Voice, work controls and delivery

Add actual `start_research` and rendition/control use cases through the same member and private-media action cores. Remove obsolete new-brief instructions consistently. Preserve server-derived speaker/input epoch, not a model-named requester.

Finish the Google **admission call** promptly with the real work ID, top-level `scheduling: WHEN_IDLE`, and `willContinue:false`. A durable job outlives that call and the socket. Its final result is published through project events and later current-context delivery, never appended as another response to the closed call ID. [Prior SDK audit](../references/pass2/SOURCE_AUDIT.md)

Generalize the existing idle-gated result notice; one component owns narration. UI card, worker event, context update and spoken announcement must not all trigger separate replies. A compact announcement explains what the finding resolves and what remains uncertain, not the whole report.

Probe passive client-content updates only on the exact SDK/model, explicitly setting `turnComplete:false`; default true can interrupt. Until concurrent audio/reconnect tests qualify it, use the known notice/current-record read path. No transport enhancement is necessary merely to avoid a blocking research call.

Stop speaking, Stop looking, End exchange, Hold work and Stop work remain separate. Provider tool-call cancellation is not automatic revocation of already admitted work. Reconcile disputed/unknown admission before amending or canceling. A result after End remains in the project and can be discussed next time; it must not silently reopen voice.

A steer targets the supported boundary and preserves valid findings. Hold admits no new work until explicit Resume. Stop rejects stale completion/publication. Renderer and source HTTP cancellation must settle before cleanup. Source correction/revocation invalidates affected future packets, results and restored history; do not resume removed material through a raw log.

## 8. Resource policy

Use one cumulative allowance across attempts, amendments, rendition and repairs. Atomically reserve before external/model calls; record returned usage and uncertain charges. Native per-request token/round limits do not replace the application's work allowance. No reset on Resume, new output format or new agent session.

The first pilot uses one worker, bounded source calls and one bounded format repair; see [source-policy defaults](../research/WEB_SOURCE_POLICY.md). Money/provider authority comes from the actual grant, not those illustrative limits. Reserve enough remaining capacity to persist and report a useful partial result. No automatic cross-provider retry, paid overage, new account or plan upgrade.

## 9. Goals

| Goal | Deliverable | Required proof |
|---|---|---|
| M03-G1 Source/provider binding | Tavily adapter, Jina extraction contract, policy, credential/readiness and actual caps | Known/unknown/denied cases; no silent cutoff, false origin status, unbounded request or unauthorized fallback. |
| M03-G2 Durable Markdown slice | Research admission/preset, evidence record, format constraint, storage/publication, projector/viewer | Real fresh-source task via actual dsh/API, inspectable Markdown, citation/source closure, duplicate retry test. |
| M03-G3 PDF | Retained source/asset manifest, confined renderer, PDF viewer/checks, optional rendition preset | Same-research rendition without new search, layout cases, failed-render partial truth and cancellation settlement. |
| M03-G4 Voice/control | Real voice tools, result routing, steer/Hold/Stop/End/reconnect handling | Two people continue conversation during one task; no duplicate publication/announcement or stale-authority effects. |
| M03-G5 Mission loop/release | Research linked to an expectation/question, source-based correction, current accepted next step | Fresh exchange uses correct mission/result; approved release tuple, actual usage and compatible fallback. |

Claude creates one feature PR with these staged commits. A blocking provider or render-host setup becomes a bounded Codex request, not an invitation to build a second harness or strip safeguards.

## 10. Acceptance matrix

| ID | Required observation |
|---|---|
| M03-T01 | Source-only synthesis and rendition issue zero external research calls unless separately requested. |
| M03-T02 | Freshness-dependent question uses actual sources; snippets, extraction and source inspection remain distinct. |
| M03-T03 | Authorized spoken request admits one task; ambiguous proposal alone admits none; retry/reconnect does not duplicate. |
| M03-T04 | Missing Tavily/Jina credentials/provider authorization returns truthful unavailability, never an unapproved vendor fallback. |
| M03-T05 | Long document content is available beyond 4,096 characters through a stored source/cursor; any cap is declared. |
| M03-T06 | Jina transport status is not fabricated origin HTTP status; extraction is not raw-source proof. |
| M03-T07 | Private URLs, credentials, cross-project sources, injection instructions and unsafe direct-fetch redirects are rejected/contained. |
| M03-T08 | Concurrent calls at budget boundary cannot exceed reserved authorized limits; unknown charges are reconciled. |
| M03-T09 | Model result remains bounded during provider body overflow and spill failure. |
| M03-T10 | Markdown schema/storage/UI all agree; artifact writes cannot break the project snapshot. |
| M03-T11 | Actual Markdown/PDF bytes, evidence and rendition hashes are verified; preview/download names the same version. |
| M03-T12 | PDF only reported ready after source/format/visual checks; failed PDF retains truthful useful partial output. |
| M03-T13 | Renderer cannot escape source root, read secrets, use network or weaken sandbox; cancellation settles process group. |
| M03-T14 | Source PDF unsupported/scanned/partially extracted produces explicit coverage limits, not false full reading. |
| M03-T15 | Conversation continues while research runs; one meaningful arrival notice at a safe boundary. |
| M03-T16 | End/reconnect/interrupted announcement does not lose result, reopen room or invent full playback/comprehension. |
| M03-T17 | Mid-task steer preserves valid findings; Hold/Resume/Stop/restart preserve current authority and cumulative allowance. |
| M03-T18 | Lost upload/publication receipt reconciles one result; late output after Stop cannot publish. |
| M03-T19 | Corrected/revoked source cannot influence a new packet, resumed worker or returned mission through stale history. |
| M03-T20 | Fresh exchange relates research to question/expectation and distinguishes suggested from accepted next action. |
| M03-T21 | EN/IT/ES source/question/output cases and small-screen/zoom/dock/manual controls work. |
| M03-T22 | Feature-off retains new and historical research/brief readers; rollback does not delete or misinterpret new data. |

Measure actual time/cost, source coverage, unsupported claims, duplicates and corrections. No fixed source/page count is itself success. Tests requiring paid providers or retained human evidence need the actual bounded allowance.

## 11. Release and fallback

Readers first: append-only format/schema extensions and compatible API/projectors → worker/runtime capability → renderer readiness → Studio/viewer → active voice declarations/admission for selected project. Exact order is confirmed by compatibility tests and changed process dependencies. Do not deploy new writers against an older API that cannot decode the new kind.

Codex handles hosted migrations, scoped secrets/config, approved renderer host and exact deploys from Claude's reviewed candidate. An initial preview can use approved synthetic data, but fixture evidence never replaces the real output episode.

After research records exist, the original brief-only application is not a valid assumed rollback. Retain research-compatible readers/controls, disable new admission, preserve pending cleanup and existing artifacts, and roll back only to a proven compatible runtime/feature unit. No destructive down-migration, history rename or reset of uncertain effects.

## 12. Closure

Handoff names exact Sophia/dsh/SDK/renderer/provider configuration, actual enabled tools/formats, real source/output references, measured usage, all acceptance results, remaining inherited S1-05A tests, current deploy/schema tuple and valid fallback. Record the team's actual acceptance separately from artifact-ready and worker-complete.
