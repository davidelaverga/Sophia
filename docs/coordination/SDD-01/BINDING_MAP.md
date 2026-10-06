# SDD-01 binding map (G0)

**Mission:** SDD-01, native dsh HTML design, independent visual review and iteration ([pack 03](../../missions/2026-10-04-native-design/03_SDD01_MISSION.md), [05](../../missions/2026-10-04-native-design/05_RUNTIME_AND_ARTIFACT_BINDINGS.md)). **Coordination:** [README](README.md). This file binds the pack's proposed names to the code that exists at the base, says what is reused, and reserves what is new. It is G0's deliverable and Codex's boundary-review object. A later change is recorded in §12 with its reason, in the commit that makes it.

| Anchor | Value |
|---|---|
| Base | `main` `ed6f3cd` (M75's PR #75 merged as `cec3947`, then #76, #100, #101). `pnpm check` exit 0 there on linux-x64: unit 1275 (1274 pass, 1 skipped), integration 84 (82 pass, 2 skipped) |
| Branch | `claude/sdd01-native-html-design` |
| Foundation | [M75 handoff](../M75/HANDOFF_TO_SDD01.md) (callers C-1..C-4, the reader surfaces, the general page checks, the G6 fixtures) |
| dsh | `0.2.0-rc.2` at `639ed015`, unchanged (no upstream upgrade) |
| Raven donor | `EverMind-AI/Raven` at `3632e604`, read from Git objects only (never installed or run) |
| Runtime unit | today `sophia-runtime-m03-dev`; this PR records `sophia-runtime-sdd01-dev` (previous `sophia-runtime-m03-dev`) |

Status words in this file: **built** (in this PR, with tests), **planned** (not built; named so nobody invents it), **owner** (a decision this PR does not take).

## 1. Reservations

| Item | Reserved | Why |
|---|---|---|
| Migrations | **0038 to 0041** for SDD-01. 0038 design records and renditions, 0039 the runtime design and review operations, 0040 admission, handoff, the review loop, publication and controls, 0041 the lifecycle after admission (withdrawal, Hold and Resume, scoped edit). WBC-02 takes the next free number after these when it starts, or asks to swap | `main` ends at `0037_amendment_preservation.sql`. No open branch carries a migration above 0037 (branches read 2026-10-05) |
| Contract amendment | **A12** (`packages/contracts/amendments/A12-native-design.json`); **A14** for SDD-01-CX-0019's correction (capture delivery) | `main` ends at A11; WBC-02 takes A13 |
| Runtime unit | `sophia-runtime-sdd01-dev`, `previous_unit: sophia-runtime-m03-dev` | Two roles, their presets, prompt sections and skill bundle change the bundle |
| Lock | `pnpm-lock.yaml`: this session is its only writer in this window; the HTML and CSS parsers come in one reviewed commit with the lock | Single writer |
| Paths (new) | `packages/design/`, `packages/dsh-bundle/skills/` (the destination map's unbuilt S1-03 row), `packages/dsh-bundle/src/design-tools.ts`, `renderers/web/pdf/capture-html.mjs`, `apps/api/src/design*.ts`, `packages/persistence/src/design*.ts`, `docs/coordination/SDD-01/` | Feature modules stay branch-local |

## 2. What exists and is reused

| Pack concept | Existing code at the base | SDD-01 use |
|---|---|---|
| One specialist registry | `config/specialists.json`, its schema, `packages/contracts/scripts/generate-specialists.ts`, the two generated modules | Extended with two entries and optional fields (§3). No second registry |
| Native presets | `cordis.patch.yml` preset rows (identity only, `plugins: []`), `checkPresetRoster` | Two more identity presets; tools are registered by the bridge in the agent's own scope, as research's are |
| Role route | Bridge row `routes` / `roleRoutes`, `routeFor`, the global `llm/stream` guard and the meter | Both roles run on `research-sol-medium-v1` (openai-research / gpt-6.1-sol / medium), the admitted research route, whose model entry already declares `input: [text, image]` (pack 03 G0). A role gets no other route |
| Work admission | `admit_research_task` (0025), goals / attempts / bindings / commands / jobs / outbox | A design attempt uses the same tables and lock order; its job kind is `design`, the reviewer's `design_review` |
| Allowance | One allowance per research lineage (0024: "nothing resets it: not Resume, a new format or a new session") | Design and review calls, compaction and image inspection included, reserve against the **same lineage allowance**. No new accounting |
| Dispatch | `dispatch_runtime_outbox` (0037) takes a research create's role and route from its manifest | Replaced once more so a design or review create does the same; every other command byte-identical |
| Turn end | `capture_native_result` → `research_turn_end` (0026) | A design or review turn that ends without its submit is nudged once, then fails, like research |
| Controls | `admit_goal_command` (0012): Hold/Stop fence every binding of the goal; steer reaches every live `sophia_episode` binding | Unchanged. A design attempt is on the report's goal, so Hold, Stop and steer reach it with no new path |
| Rendition-only version | `research_rendition_settled` (0034): a later PDF becomes the next version, same Markdown, and the goal reopens while it renders | The designed HTML is published the same way: the next version, same Markdown source, with an `html` rendition. Published bytes are never replaced |
| Confined browser | `renderers/web/pdf` (`launchConfined`, the request policy, the namespace wrapper, the self-test) and the render job queue (0030–0034) | A second kernel mode, `capture`, in the same package and queue: screenshots and measurements, never a second browser service |
| Byte store | `ByteStore` port, S3 adapter, `put_text_source`, `source_objects` | Source revisions are text sources; captures are stored PNG sources through the existing port |
| Reader | `DocumentPane` (one view per format), `download.ts` (checked bytes), version pinning | A third view: the stored HTML in a sandboxed frame from checked bytes; Download saves the same bytes (B-23) |
| Report parser | `@sophia/report` `parseMarkdown` (one parse for reader and PDF) | Its block list is the frozen content map the design must preserve (§5) |
| General page checks | `e2e/report-probes.ts` with `Marks` (M75) | Reused on designed pages with their own marks (`data-cite`, `data-block`) |

## 3. Roles and composition

| Item | Designer | Reviewer |
|---|---|---|
| Id | `sophia-html-designer-v1` | `sophia-visual-review-v1` |
| Registry `task_kind` / `outputs` | `design` / `["html"]` | `design_review` / `["review"]` |
| Route | `research-sol-medium-v1` | `research-sol-medium-v1` |
| Native tools | `design_read_context`, `design_read_reference`, `design_record_work`, `design_write_source`, `design_patch_source`, `design_render`, `design_inspect_render`, `design_submit_candidate`, `design_report_blocker` | `review_read_context`, `review_read_reference`, `review_inspect_render`, `review_submit_result` |
| Never | host shell, workspace files, web search or read, `skill`, `workflow`, subagents, messaging, any `research_*` tool | the same, and every `design_*` tool: it cannot write source, render, submit a candidate or publish |
| Prompt sections (bundle assets, hashed) | `sophia-html-designer` (pack `runtime/HTML_DESIGNER_SYSTEM.v1.md`), `sophia-html-procedure` (pack `runtime/HTML_DESIGN_PROCEDURE.v1.md`), and the mandatory compact obligations of the four native skills | `sophia-visual-reviewer` (pack `runtime/VISUAL_REVIEWER_SYSTEM.v1.md`) and the reviewer's view of the critique procedure |
| Native skills | `sophia-visual-foundation-v1`, `sophia-editorial-html-v1`, `sophia-web-finish-v1`, `sophia-visual-critique-v1` | `sophia-visual-critique-review-v1` (the reviewer's view of the critique procedure, `sophia-visual-critique-v1/REVIEW.md`); none of the maker's instructions (SDD-01-RF-0002) |
| Reference scope (`references`, read-only) | `critique/*`, `editorial/*`, `foundation/*`, `web/*` | `critique/anti-slop-review`, `critique/gallery-index`, `critique/gallery/*`, `web/precedents-index`, `web/precedents/*` |
| Image input | required: the route must declare `image`, and the attachment service must be mounted | required, the same |

New optional registry fields (schema-checked, emitted into both generated modules; research entries leave them out, so research's generated rows and preset digests keep their meaning):

- `prompt_sections`: ids of the bundle prompt assets the preset loads before its first step.
- `skills`: ids of the native skills (compiled into `packages/dsh-bundle/skills/`), loaded explicitly, never by discovery.
- `references`: the references the role may read, by id or `prefix/*`, read-only and whatever skill holds them (SDD-01-RF-0002); a pattern that names nothing makes the role unavailable.
- `image_input`: `true` when the role needs image-capable inspection; the bridge does not advertise the role otherwise.

Readiness (B-01, B-28): the bridge advertises a design role in its hello only when every named prompt section and skill is present with its recorded SHA-256, every reference its scope names is in the bundle with its recorded SHA-256, the attachment service is mounted, and the route declares image input. The service admits HTML design only onto a runtime advertising the designer and its route, and only while a capture renderer is running (§7). A preset id never changes meaning: a changed definition is a new `-v2`.

**Adaptation (binding amendment 1).** The pack names "the existing scoped native `skill` mechanism where suitable". At this pin the research roles are offered no `skill` tool and the base `skill-filesystem` row reads default roots. Loading the four skills as preset prompt sections plus a scoped reference tool keeps loading explicit and hashed, adds no base-row change and exposes no catalog. `design_read_reference` serves the skills' full sections and their images by id; it is not a memory or web tool.

**Adaptation (binding amendment 2).** The pack's reviewer table has three tools. The reviewer must look at the gallery specimens it judges against, so it gets `review_read_reference` (read-only, the same reference store). Every reviewer tool is `review_*`, so B-03's "the reviewer cannot gain authoring tools" is a name-level check as well as a policy check.

## 4. Logical operations

Every runtime operation authenticates like research's (the runtime lease, then a binding this runtime owns for the attempt and native session), is idempotent by native session and call id, and is fenced by the goal's status and authority epoch, except settle and the read-only result reads.

| Model tool | Runtime route (A12) | SQL | Bridge / API owner | Result and authority boundary |
|---|---|---|---|---|
| `design_read_context` | `POST /v1/runtime/design/context` | `runtime_design_context` | `design-tools.ts` / `routes/runtime.ts` | The task (mode, language, targets, limits), the frozen package (version, Markdown hash, blocks with their citations, sources, limitations), the current source revision, candidates, guidance with its delivery state, the edit scope, the allowance. With a `sourceId`, one page of a readable text |
| `design_read_reference` | none: served by the bridge from the bundle's hashed reference store | (access recorded through `…/design/record`) | `design-tools.ts` | A text section or the image itself, with its SHA-256; an id outside the role's skills is refused |
| `design_record_work` | `POST /v1/runtime/design/record` | `runtime_design_record` | the same | Appends work-record entries (contract, stage, reference, risk ledger, surface, note) at an expected revision. Grants nothing |
| `design_write_source` | `POST /v1/runtime/design/source` | `runtime_design_source_input` → API validation (`@sophia/design`) → `runtime_design_source` | API validates with a parser, then stores | A new immutable source revision against the expected package hash (null only first), with file hashes and diagnostics. Refused when unsafe; stored with diagnostics when incomplete |
| `design_patch_source` | `POST /v1/runtime/design/patch` | same two-step as source | the same | Exact-match edits on the base hash; refused when a find is absent or ambiguous, the base is stale, or a change falls outside the admitted scope (§6). Returns the whole diff |
| `design_render` | `POST /v1/runtime/design/render`, then `…/render-result` until it ends | `runtime_design_render`, `runtime_design_render_result` | the tool waits, like `research_render_pdf` | A capture job on exactly that source revision: its state, captures (by id, section, viewport), measurements and warnings |
| `design_inspect_render` | `POST /v1/runtime/design/capture` | `runtime_design_capture` (then the byte store) | the bridge stores each PNG through the attachment service and returns it as an image block | The actual pixels, at most four per call, plus the measurements of those regions. Unavailable or truncated coverage is said |
| `design_submit_candidate` | `POST /v1/runtime/design/submit` (`candidate`) | `runtime_design_submit` | the same | Records a candidate only when the render is of exactly that source, succeeded, and passed the hard gate. Then the service admits the review. The author cannot create a review or publish |
| `design_report_blocker` | `POST /v1/runtime/design/submit` (`blocker`) | the same | the same | The task fails with its reason and the retained source revision |
| `review_read_context` | `POST /v1/runtime/review/context` | `runtime_review_context` | `design-tools.ts` | The original request, the frozen package, constraints, criteria (hashed), the exact candidate and its render manifest. Never the author's change summary, limitations or work record |
| `review_read_reference` | none (bundle) | as above | the same | As `design_read_reference` |
| `review_inspect_render` | `POST /v1/runtime/review/capture` | `runtime_review_capture` | the same | The assigned candidate's captures only |
| `review_submit_result` | `POST /v1/runtime/review/submit` | `runtime_review_submit` | the same | Writes this review, bound to candidate, source, render and criteria hashes. Then the service decides: publish, repair, or label (§6). It edits nothing |
| (every model call of both roles) | `POST /v1/runtime/design/reserve`, `…/settle` | `runtime_design_reserve`, `runtime_design_settle` over 0024's `reserve_research` / `end_research_reservation` | the bridge's meter, chosen by the attempt's role family | Reserved from the lineage allowance before it leaves, settled from reported usage |

Members and the guide (0041): `POST /api/v1/projects/{projectId}/html-edits` (`request_design_edit`, editors and admins) admits a scoped edit of a published page, the person's instruction kept as their contribution; guide v1.3's `revise_html_page` is the same request by voice or text, from the sections `project_status` lists for the report's page. Withdrawal: every fenced operation of either role is refused once its attempt is revoked or its manifest's closure is withdrawn (`design_scope_of`), and the render result is not read; settle is never fenced.

Renderer side (§7): `POST /v1/renderer/claim` gains the formats a runner can render; `PUT /v1/renderer/jobs/{id}/captures/{name}` stores one PNG; settle takes the capture receipt.

## 5. Records

| Record | Where | Notes |
|---|---|---|
| Design task | `design_tasks` (0038): job, mode `create`/`edit`/`audit`, base version and its Markdown hash, the lineage's allowance, language, targets, repair and review ceilings, edit scope, state | One per `design` job |
| Frozen input package | a JSON source written at admission: request, version, Markdown hash, blocks, citations, sources, limitations | The content hash and the authorization are distinct: the package is readable only by its own attempts |
| Content blocks | from `@sophia/report`'s parse of the version's Markdown: each paragraph, list item, table cell, quote and limitation is a block `b1…bN` with its normalized text and citations | Headings may be reworded (pack 05 §3); blocks may not |
| Source revision | `design_sources`: seq, base revision, package hash (of the manifest), files (`index.html`, optional `styles.css`) as text sources, sections, diagnostics | Immutable. CAS on the package hash |
| Work record | `design_work_entries`: append-only, revisioned | Reference access is recorded here by the bridge |
| Render | a `render_jobs` row (`kind='capture'`, `format='png'`) on the source revision's compiled HTML; its outputs in `render_job_outputs` | The capture receipt names every capture, the measurements, the browser and the sandbox verdict |
| Candidate | `design_candidates`: source revision, render, compiled HTML source, gate result, round, state | `submitted` → `reviewing` → `reviewed` / `needs_revision` / `self_review_only` / `review_unresolved` → `published` / `superseded` / `failed` |
| Review | `design_reviews`: candidate, reviewer attempt, criteria hash, verdict `pass`/`needs_revision`/`blocked`, findings, coverage | A review never edits; a changed candidate is a new candidate |
| HTML deliverable | an `artifact_renditions` row with `format='html'` on the next artifact version, with the candidate and its review state | Content-addressed; Open and Download read it |

## 6. Flow

1. **Admission is format-driven (B-04, B-05, B-25).** `start_research` with `html` in its outputs admits research exactly as today (the research specialist, its outputs and prompt unchanged) and records an HTML design request on the task in the same transaction. Without a ready designer and capture renderer the request is refused as `html_unavailable`, offering Markdown, never a fixed template. Markdown-only requests are untouched.
2. **Handoff (pack 05 §7).** When research publishes, the same transaction admits the design attempt on the same goal and reopens it (`running`), as a later PDF does. A crash cannot split the two: they commit together.
3. **Design.** The native designer reads the package, records its contract, reads references, writes source, renders, inspects real pixels, repairs, and submits a candidate.
4. **Hard gate (software).** The candidate's render is of exactly its source; every capture target exists; the HTML passes the static policy (no script, handler, form, frame, object, remote load, `@import`, `url()` beyond fragments); every block is present with its text and citations; and the render measured every block visible and readable (not hidden, zero-size, clipped, off-screen, or below the contrast floor). Failure is returned to the designer; nothing is recorded as a candidate.
5. **Independent review (B-10).** If a runtime advertises the reviewer, the service admits a review attempt (its own session, job `design_review`) with an input manifest that excludes the author's rationale. Otherwise the candidate is `self_review_only`.
6. **Bounded repair (B-12).** `needs_revision` returns the findings to the designer's session as an input; at most two repair revisions after the first complete candidate and three review rounds in the lineage, none of it reset by a restart.
7. **Publication.** A `pass` publishes. A `self_review_only` or `review_unresolved` candidate (repairs spent) is published labelled as such, its unresolved findings as limitations, because Markdown alone would hide a usable HTML from the person. Only `pass` is shown as reviewed. Publication rechecks the design, its attempt and the candidate's closure (0041), so a late or racing decision publishes nothing.
8. **Withdrawal (B-21, 0041).** Erasing a source revokes, in the same transaction, every design and review under way whose manifest's closure holds it: attempts revoked, sessions stopped through `native.stop`, renders cancelled, candidates failed, the reason on the task. A design is not rebuilt (its report now draws on a withdrawn source; a new report is the way on).
9. **Hold and Resume (B-20, 0041).** A render during a Hold waits; a late operation is refused by the fence; at Resume a design or review whose session never started is queued, and a goal only designs reopened that has nothing left to do completes.
10. **Edit (B-16..B-18, 0041).** A design task in mode `edit` on the report's goal and allowance, bound to the published candidate: its first revision is that candidate's source, its scope the named sections (the shell and the stylesheet protected unless named). A write or patch outside the scope is refused; the gate adds an unchanged-source check and compares each protected section's shape with the base render (reflow allowed). Published as the next version, `Revises the designed HTML page (…)`.

## 7. Rendering and preview safety

| Concern | Binding |
|---|---|
| Kernel | `renderers/web/pdf/capture-html.mjs`, run by the existing supervisor for `format='png'` jobs, in `launchConfined` (namespaces, seccomp self-test, JavaScript disabled, every request outside the entry document refused) |
| Targets | 390 px and 1280 px wide, light; whole-page overview (scaled) and readable section crops (each top-level `[data-section]`, tiled when tall) |
| Measurements | horizontal overflow, each block's visibility, size, clipping and contrast; protected-section crop hashes for edits |
| Old runners | A claim names the formats the runner renders; a runner that names none is a PDF runner and never claims a capture |
| Readiness | HTML is offered only while a capture runner asked for work in the last ten minutes, as PDF is |
| Studio preview | `<iframe sandbox>` (no `allow-scripts`, no `allow-same-origin`) with `srcdoc` from bytes checked against the rendition's hash. Never in Studio's DOM, never through `MarkdownView` |
| Studio CSP | Report-only today. A `srcdoc` frame inherits Studio's policy, so an **enforced** `style-src 'self'` would block the designed page's own `<style>`. **Owner/Codex decision before enforcement** (§11) |

## 8. Studio and guide cutover

| M75 caller | Replacement in this PR |
|---|---|
| C-1 `DocumentPane` → `PageDownload` | The `HTML` view of the stored rendition and its Download (same bytes); nothing for a version without one |
| C-2 `KnowledgeReports` → `PageDownload` | An `HTML` tag when the current version has a rendition; opening it opens that view |
| C-3 `WorkCard` `PageRow` | Only an actual HTML output, with its design state (designing, reviewing, reviewed, provisional, failed); none for a Markdown-only task |
| C-4 `NoticeCard` `PageButton` | `page` comes from the stored HTML output, never the Markdown |
| receipt `HTML_NOTE` | Says the HTML is designed after the research, or that HTML is unavailable |
| guide v1.2 descriptions ("every report also downloads as an HTML page") | **Built: guide v1.3** (`M01_ASSETS.v1.3.json`, its prompt and assembled instruction; `TOOL_SETS['v1.3']`; the API's `TOOL_SURFACES['v1.3']`; contract `MediaToolCall.guide` and `name`). It says what HTML is (a designed page, asked for with `html`) and adds `revise_html_page`; v1.1's and v1.2's declarations are unchanged. The bridge's default stays v1.2; the cutover is `SOPHIA_GUIDE_VERSION=v1.3` ([PRODUCTION_BATCH.md](PRODUCTION_BATCH.md) §3) |

`renderReportPage` stays in `@sophia/report` for the G6 control harness; Studio no longer imports it.

## 9. Shared boundaries with WBC-02 (parallel-execution addendum)

Read: [WBC-02](../../missions/2026-10-03-workboard-connection/missions/WBC-02_PAPERCLIP_FIRST_OUTCOME.md) §3–§6 and the [addendum](PARALLEL_EXECUTION_ADDENDUM.md). No WBC-02 branch, PR or migration exists at the base (branches read 2026-10-05).

| Shared boundary | SDD-01 change, offered to WBC-02 | Request |
|---|---|---|
| Registry, schema, generator | `task_kind` widened from `research` to an enum with `design` and `design_review`; `outputs` constrained per kind; optional `prompt_sections`, `skills`, `image_input`. Additive: research rows unchanged | WBC-02 adds `source_review` (or its own kind) to the same enum in its window; this session is the writer of these three files until this PR merges |
| Bridge, hello, guards, runtime unit | Design tools registered in the agent's scope by role; the meter picks the reserve route by the attempt's family; the unit becomes `sophia-runtime-sdd01-dev` | WBC-02's `sophia-source-review-v1` follows the same registration pattern; the combined unit is rebuilt by whichever lands second |
| Allowance and metering | `runtime_design_reserve` reuses 0024's core functions against the lineage allowance; no second ledger | WBC-02 binds its eight-request ceiling the same way |
| Contracts | A12 is SDD-01's | WBC-02 takes A13 |
| Migrations | 0038–0041. 0041 replaces `mission_erase_source`, `native_delivery_ineligible` and `research_queue_unstarted` (besides design functions); 0040 replaced `dispatch_runtime_outbox` and `capture_native_result` | WBC-02 from 0042; a replacement of any of these starts from SDD-01's body |
| Studio | Report viewer, cards and Knowledge are SDD-01's; the work board is WBC-01/02's | The board opens results through the existing `OpenRequest` (artifact, version, format); `format='html'` is added |
| Release | No hosted effect here | Codex alone; one operator per target |

## 10. Acceptance mapping

The B-cases of [pack 06](../../missions/2026-10-04-native-design/06_ACCEPTANCE_AND_EVIDENCE.md) map to tests in [the progress record](../../progress/SDD-01.md) §3, each labelled L0 (source/fixture), L1 (pinned dsh, confined Chromium, faux model where labelled), L2 (paid model) or L3 (real app). L2 and L3 need Codex's operations and Davide's approval; none is claimed by a lower level.

## 11. Owner and operator decisions this PR does not take

| Id | Decision | Owner |
|---|---|---|
| O-1 | How much of the lineage's $5 cap design may draw on (today it shares what research left; a design that cannot reserve says so and leaves the Markdown) | Davide (spend) |
| O-2 | Redistribution rights of each bundled reference image (Raven is Apache-2.0; some specimens show third-party work) before production bundling | Codex verifies, Davide decides |
| O-3 | Studio CSP before enforcement: a separate preview origin, or a policy amendment for the frame | Davide / Codex |
| O-4 | Guide v1.3 cutover (`SOPHIA_GUIDE_VERSION=v1.3`); the wording is built and tested | Davide, Codex |
| O-5 | The L2 image-perception qualification of `gpt-6.1-sol` (a paid probe with a deliberate defect) | Codex under Davide's approval |
| O-6 | Merge, release order (pack 08 R3) and the combined runtime unit with WBC-02 | Davide, Codex |

## 12. Changes since G0

| Date | Change | Reason |
|---|---|---|
| 2026-10-05 | The package functions (`design_package_input`, `design_freeze_package`, `design_package_failed`) are keyed by the design job id, not the project | `RuntimeCaller` carries no project; the job id names one project already. `design_package_input` returns NULL once frozen, so a replayed freeze changes nothing |
| 2026-10-05 | `DesignRecordRequest.expectedEntries` is optional (A12, 0039) | The bridge records the designer's reference reads itself, with no count the model read; the designer's own `design_record_work` still sends it |
| 2026-10-05 | A design role's model calls are metered through `design/reserve` and `design/settle`, with no finalize step | A design ends on the service's limits; research's partial-result step has no meaning for a page |
| 2026-10-05 | The bridge advertises a design role only when its assets verify, dsh's attachment service is mounted and the role's route declares image input; a create or resume whose assets do not verify is refused | B-01 and B-07: a designer that cannot see its captures is not offered |
| 2026-10-05 | Studio: a design task has its own card (`DesignCard`); the notice's HTML page opens the stored page in the viewer; the Knowledge card's HTML tag opens it; `PageDownload.tsx` and `report-page.ts` are removed from Studio | §8's cutover; `legacy-conversion.test.ts` keeps the conversion off Studio's product path |
| 2026-10-05 | G6 harness: `scripts/g6-control.mjs` and `g6/` (inputs and the control arm); the native arm `not_run` | Pack 03 G6 without a paid run (O-5) |
| 2026-10-05 | Known gaps recorded in the progress record §4 (live revocation, resume after Hold, edit admission, host probe, supervisor crossing, guide v1.3) | Kept visible rather than claimed |
| 2026-10-05 | SDD-01-RF-0001: the procedure texts name the work-record kind `risk`, the one `design_record_work`, 0038 and 0039 admit (was `risk_ledger`, refused) | Codex, CX-0002 at `b1e227e`; `tests/unit/design-roles.test.mjs` checks every kind any text names against the tool and both SQL lists |
| 2026-10-05 | SDD-01-RF-0002: each design role has an explicit read-only reference scope in the registry; the reviewer reads the gallery and the precedents and loads its own view of the critique procedure (`sophia-visual-critique-review-v1`), not the maker's | Codex, CX-0002; per-role tool and reference closure in `tests/unit/design-roles.test.mjs`; the reviewer's precedent read reaches the provider in `tests/integration/design-tools.test.mjs` |
| 2026-10-05 | 0041 takes the spare number: withdrawal revokes running designs and reviews and fences every operation; Resume queues an unstarted design or review; a scoped edit of a published page is admitted (`request_design_edit`, `POST /api/v1/projects/{id}/html-edits`, A12); the gate adds an edit's checks; the research task's HTML state stays the first design's | Codex, CX-0003 (SDD-01-RF-0003, P1) and the completion request; the progress record §4's gaps |
| 2026-10-05 | Guide v1.3 is built (§8); its default stays v1.2 until the cutover | Pack 03 G4 ("The old guide/API compatibility path remains until safe cutover") |
| 2026-10-05 | The old unit's release guard is "no live work" (read-only), shared with WBC-02; the six terminal `running` bindings on `sophia-runtime-m03-dev` are left as they are, the uncertain reservation kept. The operator-only Stop helper drafted at `e35111a` (`reconcile_terminal_bindings`) is withdrawn from 0041: it had no use but zeroing that metadata. A completed report is never rebuilt (0028 revokes live jobs only; 0033 rebuilds on the revoked job's unit), so the old histories need no second host | Codex, CX-0006, CX-0009 to CX-0011, CX-0014; WBC-02-CC-0007 §3 |
| 2026-10-05 | The required renderer CI job runs `capture-html.test.ts` and `tests/integration/design-capture-supervisor.test.mjs` (the real supervisor, capture kernel, API and PostgreSQL); the host probe qualifies the capture kernel | Codex, CX-0004 (SDD-01-RF-0004) |
| 2026-10-05 | A work card reads its research again once the design ends (it kept "Designing" until a reload) | Found by the B-19 test |
| 2026-10-06 | SDD-01-CX-0019 (five late automatic findings on #104), corrected on #117 from WBC's combined base `29371f5a` (0043, A14): a capture counts as seen only once its delivery is acknowledged as the attachment of exactly its bytes, for its job, attempt and render; the designer must have seen the render it submits (no reviewer included); every overview tile counts; citation markers are a bare mark or a link to the source's own entry, CSS draws decoration only, and outside the blocks a page adds only headings, captions, summaries, table headers, in-page navigation and source entries; an edit key's replay must be the same request | Codex, CX-0019 to CX-0027; 0039–0042 and A12/A13 not edited |
| 2026-10-06 | #117's final-head reviews (CX-0031 to CX-0038): a delivery counts only for the submission that names it (`seen`, from the receipts the model was handed with the images; 0043, A14); tooltips, accessible names and ID references rest only on labels the page shows, which the capture kernel then measures; a counter or a list marker draws numbers or bullets only, in every medium. #117's review of `f51ac49`: a request for revision rests on named inspections, each serious finding on one of their captures; text outside the blocks that no captured target shows fails the render; a citation mark holds no letter and no bare number; the document's title and description repeat what the page shows. #117's reviews of `8c88ce9`: generated text and the marks outside the blocks come from an explicit list that spells nothing side by side; each section is seen whole, every tile at one target. #117's review of `44cbe03`: text outside the blocks a target shows is held to contrast; the receipt's measures stay within their bound; nesting deeper than 256 levels is refused; a plain name is a word for a part of the page, and the title repeats a shown label. #117's reviews of `843e82c` to `65ed974`: a text outside the blocks hidden at any captured target fails it; contrast reads a text's fill and opacity, and the profile has no animation; ARIA is an explicit list; the margins outside the sections are captured, however short, and required; no counter and no list marker draws a number (no `ol`); a citation's accessible text is its own mark or a source name; checking references costs the page's size. #117's security review of `c525e2b`: the page is measured and captured as it opens, and a text outside the blocks that a scrolling box hides there fails. #117's review of `69ec0b4`: a pseudo-element styles only generated content (no `::first-line`, `::first-letter`); and, found while answering it, a text's own generated content, a child or a box around it drawn over it is a cover, and `pointer-events` is refused. #117's review of `4ab8d3a`: masks are refused. #117's review of `d524cc0`: the cover check looks along every line of every text, and text outside the blocks is held to a readable size. #117's review of `926e706`: a revision's serious finding rests on a capture of the target and section it names. #117's security review of `926e706`: the cover check reads a text's lines once, within bounds of lines, points and time. #117's review of `9e7dfdf`: every run of a block's text is held to what the block is; contrast is held to the floor of the size text is drawn at; a fixed or sticky element over a text is a cover, and the profile has none. #117's security review of `9e7dfdf`: a page's labels are read within one budget. #117's review of `c8567bd`: contrast is read only over the background a text's styles give. #117's review of `2ec37d3`: media and container queries test the width only, and the page is drawn in the light scheme only; its security review: no border, shadow or outline beneath a text is read as its background. #117's review of `c60d66f`: research is never `aria-hidden`, and a rule for an interaction state only marks it | Codex, CX-0031 to CX-0038; #117's reviews of `f51ac49`, `8c88ce9`, `44cbe03`, `843e82c`, `6c2ef91`, `3e7cf27`, `b6d009c`, `5c22fa0`, `65ed974`, `c525e2b`, `69ec0b4`, `4ab8d3a`, `d524cc0`, `926e706` and `9e7dfdf` (and their security reviews), `c8567bd`, `2ec37d3` (and its security review) and `c60d66f` |
