---
id: sophia-mission-companion-and-research-ledger
version: 0.2
created: 2026-09-27
updated: 2026-09-27
status: investigation_and_design_proposal_not_applied
pass: 2
repository: davidelaverga/Sophia
pull_request: 13
inspection_head: 2911b037c9703703f2ae33955123d434797e3155
reported_hosted_baseline: 2d59884
planning_baseline: Sophia_Implementation_Pack_v0.4_Part2_2026-09-24
next_action: implementation_binding_and_runtime_qualification
---

# Sophia — Mission companion, research and runtime evolution
## Continuation ledger · Pass 2

This is the investigation/design ledger for Davide and the implementation team. It is not the runtime mission record and does not authorize deployment, recording, provider spending or a change to accepted project state.

The [original v0.1 ledger](prior/Sophia_Mission_Companion_and_Research_Ledger_v0.1_2026-09-27.md) is retained byte-for-byte. This edition incorporates the second-pass findings and supersedes the first pass's unresolved native-preset question and future-research agenda. First-pass mission/UX findings and evidence boundaries remain in force.

## 0. Resume here

**Current user direction:** continue the research-agent pass and add a strategy for implementing newer DeepSeek Harness updates.

**Recommended product increment:** remove the compulsory brief ritual; retain the existing durable media/work/authority machinery; add one research-worker family with Markdown and PDF profiles; connect actual research results to the team's mission and later conversations.

**Native correction:** declarative agent presets are already in the installed rc.1 source. Do not build a parallel preset engine or make a full upgrade an artificial prerequisite. Source availability is not the same as Sophia binding that capability. Use native composition plus existing software authority guards.

**Upgrade recommendation:** qualify rc.2 as the bounded tagged candidate, examine the specifically relevant newer failed-step tool-result recovery in the latest source, and select a coherent tested release unit. Separate runtime parity from research feature activation and from model/payer changes. No automatic `latest` deployment.

**Delivery:** [Research implementation amendment](RESEARCH_AGENT_IMPLEMENTATION_PLAN.md), [dsh upgrade strategy](DSH_UPGRADE_STRATEGY.md), [prompt/skill candidates](prompts/RESEARCH_PROMPTS.md), and [source audit](SOURCE_AUDIT.md). The source manifest is in `evidence/source_manifest.json`.

**Evidence limit:** source/documentation inspection only. No repo test suites, provider calls, hosted database reads/writes or release operations were performed. No current performance/cost benefit is measured by this pass. The bundle's validation report checks documentation packaging, not the product.

## 1. Product direction retained from pass 1

Sophia is the cooperative guide who helps the team turn ideas into useful reality. She clarifies uncertain intent, helps choose next steps, compares predictions with observations, investigates blockers and retains learning. Her mission-lifecycle procedure is not a compulsory questionnaire.

Mission, work goal, session focus, execution attempt, artifact and cognitive intervention remain distinct. The team can be evaluating one experiment while clarifying another part of the mission. The six skill modes are per-focus interventions, not a single rigid project state.

The runtime mission ledger is a source-grounded, revisioned view of canonical project records. It is not a second writable `mission.md`. Markdown is a representation/export; the database/source authority remains the existing product domain.

Keep proposal, observation, hypothesis, accepted decision and scoped lesson distinguishable. Preserve who said what and unresolved disagreement. Do not treat the voice-floor holder as the voice of the entire team. Preserve earlier expectations and the original baseline rather than rewriting history after outcomes are known.

Ordinary conversation remains possible. Sensitive or private personal content is not released to a team project by joining its room. The project-note capability requires an understandable active policy; current Live transcription callbacks do not already implement durable shared notes.

The guide describes only actual available tools. A research worker does not imply a full project lead, builder, image generator or browser agent is implemented. A technical lead may coordinate consequential project work once the actual service is available; it need not paraphrase every ordinary question or route every simple research request.

Remove the dedicated brief form, checkboxes and term as the primary conversation ritual. Keep a clear internal work specification generated from the conversation, optional text/manual controls for accessibility and recovery, historical brief results, and actual work controls.

## 2. Refreshed baseline

| Item | Current evidence | What it does not establish |
|---|---|---|
| Sophia PR #13 | Head remains `2911b037c9703703f2ae33955123d434797e3155`; draft/unmerged. | Deployed service source independently verified. |
| Hosted baseline | PR reports `2d59884`; newer Studio/bridge fixes and migration 0017 await approval. | Permission to deploy or statement that pending release happened. |
| Installed dsh source | `46a7f68b0922371ce7144b668b90e377d8e799f4`, `0.1.7-rc.1`. | All native features active in Sophia. |
| Tagged candidate | `477b4f420553e8a52c2fbccc464d7561b239c443`, `0.1.7-rc.2` prerelease. | Stable certification, complete compatibility or all current-main fixes. |
| Latest observed dsh source | `21638c56315ae6a2b552d6091945d3144c9af32e`. | Available/reproducible npm artifact or automatic rollout target. |
| Old Sophia donor | Relevant `codex/sophia-observability-v1` branch at `8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf`. | Current default/main or actual old production state. |
| DeerFlow 2 | `827acf51dc4a713d99632f0319a62ee487598c77`, selected source inspected. | Whole-harness safety or integration proof. |
| DeerFlow 1.x | `2ab28765803d4d9582aaa8f2f3355137d154e273`, historical research graph and prompt. | Recommended current orchestration for Sophia. |

Exact coverage and returned blob identities: [source audit](SOURCE_AUDIT.md) and `evidence/source_manifest.json`.

## 3. New source findings

### P2-F01 — Native presets were already available in rc.1

The installed-pin registry README describes ordinary declarative Cordis preset declarations, not a future-only feature. Current registry implementation confirms eager activation, diagnostics, scoped mounting, retained generations, child inheritance and blank-session-only selection. The prior pass's uncertainty is resolved; it must not become an erroneous upgrade prerequisite. [D01–D03](SOURCE_AUDIT.md#d01)

### P2-F02 — Live composition retention does not mean historical-code recovery

Native live references can retain a retired preset generation. A process restart resolves the persisted preset ID against the current installed definition; old code is not a durable archive. Sophia must bind immutable runtime/preset/prompt/skill/policy identities to each attempt and reject incompatible restoration. [D01–D03](SOURCE_AUDIT.md#d01)

### P2-F03 — Current Sophia has a suitable bridge to extend

The bridge already owns native handles, journals commands, restores role/fences, preserves queued input and applies guards to root/nested work. Create/resume currently use the current global default model selection. The upgrade must preserve these mechanisms; introducing per-task model policies also requires a bound resolved execution envelope rather than an unnoticed global-default change. [S01–S02](SOURCE_AUDIT.md#s01)

### P2-F04 — Newer source contains a useful failure-history fix

Commit `6a6f350b…` adds missing-result recovery before failed steps close. Unknown and never-started tool outcomes are distinct; original failure and committed results are preserved. This matters to research continuation, but is not a blanket retry policy or proof that all historical broken logs will recover. Include the failure class in A/B/C qualification. [D17–D19](SOURCE_AUDIT.md#d17)

### P2-F05 — Google admission calls and research jobs have different lifetimes

The exact SDK has top-level `scheduling` and `willContinue`; false finishes the call. A durable research task returns its work ID promptly and later publishes through application records/events, not another response on that finished call ID. [G01–G02, G05](SOURCE_AUDIT.md#g01)

### P2-F06 — Passive Live context update needs an explicit false flag

Current model documentation permits client content throughout the session. The pinned JS `sendClientContent` defaults `turnComplete:true`; model documentation says true interrupts generation. Passive context must set false explicitly and be tested against audio/reconnect races. Do not turn this documentation finding into a claim of live-qualified behavior. [G02–G04](SOURCE_AUDIT.md#g02)

### P2-F07 — Native web and delivery solve only part of the product task

Native search/fetch, skills, compaction, spill and file-presentation mechanisms are valuable. HTTP fetch is textual and rejects PDFs. Native `present` records a file; it does not establish authorized upload, source-linked viewer availability or human acceptance. Spill is opt-in and storage failure can retain the original large result. Add the missing product policies and checks rather than a second full framework. [D05–D13](SOURCE_AUDIT.md#d05)

### P2-F08 — The existing PDF extraction path remains valid

The selected old JavaScript PDF kernel has an identical Git blob at the pack and newer donor pins. It is independent of the old LangGraph orchestration. The active pack already requires explicit manifests, confinement, removal of `--no-sandbox`, cancellation settlement and structured check receipts. Reuse and adapt that kernel rather than inherit unsafe host assumptions. [S04, O01–O02](SOURCE_AUDIT.md#s04)

### P2-F09 — Later slides have a newer donor fork to investigate

The newer old-repo obligations name a native deck service and reject screenshot-backed decks. The older v0.4 extractor targets an image-based compiler. This review does not establish the newer native service's behavior; retain the question for the later slide preset, not as extra scope in Markdown/PDF. [S04, O03](SOURCE_AUDIT.md#o03)

### P2-F10 — DeerFlow is a selective pattern donor

The original graph separates coordination/planning/research/analysis/processing/reporting. The modern selected source favors scoped skill/role descriptions, bounded delegation benefit and evidence checks. Sophia can embody the useful research stages in one worker family without importing another Python graph, mandatory worker hierarchy, always-search rule or bibliography-only citation policy. [F01–F04](SOURCE_AUDIT.md#f01)

## 4. Design decision register

`PROPOSED` means an implementation recommendation, not a permission grant. The user requested the research/preset direction and newer-harness strategy, not every exact schema or optional source capability.

| ID | Decision | Status |
|---|---|---|
| P2-D01 | One research-worker family on existing dsh; MD/PDF first | USER-DIRECTION / concrete design proposed |
| P2-D02 | Use native declarative presets, including the installed capability when appropriate | PROPOSED; source basis verified |
| P2-D03 | Separate host profile, native capability preset, execution policy, output profile and task context | PROPOSED |
| P2-D04 | Keep one worker by default; no automatic manager/fan-out chain | PROPOSED |
| P2-D05 | Source-only, fresh research, update and rendition are distinct procedures | PROPOSED |
| P2-D06 | Thin policy/provenance adapter over native web services | PROPOSED |
| P2-D07 | Explicit supported PDF intake; no false reading claim for unsupported papers/scans/videos | PROPOSED |
| P2-D08 | Retain research evidence/source and derive format-specific renditions | PROPOSED |
| P2-D09 | Use the already-planned isolated HTML→PDF kernel | PROPOSED implementation of existing plan |
| P2-D10 | Finish Google admission call immediately; later result via durable event/context | PROPOSED extension of existing pattern |
| P2-D11 | Test ordered passive client content with `turnComplete:false`; keep fallback until qualified | PROPOSED |
| P2-D12 | Keep standard Gemini voice route and current approved model/payer during runtime parity | RETAINED BOUNDARY |
| P2-D13 | Research conclusions are evidence/proposals, not automatic mission decisions | RETAINED BOUNDARY |
| P2-D14 | Research/preset/native upgrade do not reset cumulative spending | RETAINED BOUNDARY |
| P2-D15 | Tagged rc.2 candidate plus relevant current-source failure case; choose one coherent tested unit | PROPOSED |
| P2-D16 | Immutable preset IDs and recorded configuration closure across restart | PROPOSED |
| P2-D17 | Upgrade/runtime parity and feature activation are separate changes | PROPOSED |
| P2-D18 | Compatibility readers before new task/artifact writes; rollback preserves new data | PROPOSED |
| P2-D19 | Keep legacy briefs readable/control-compatible; no bulk rename or deletion | PROPOSED |
| P2-D20 | Newer native deck service audit deferred to later slides | OPEN / DEFERRED |

## 5. Target execution and information flow

```text
Team's spoken question + current authorized focus/mission context
    → Sophia builds the internal assignment
    → attributed short admission, durable work ID
    → one research worker with native preset + enforced envelope
    → bounded source collection, evidence, synthesis and artifact source
    → Markdown validation / isolated PDF rendition and validation
    → product publication + artifact/work projection
    → one eligible Live update/announcement, not another narrator
    → team interpretation and appropriately accepted mission learning
```

The same canonical project authority drives voice, text and workers. The Google socket, native Session, artifact renderer and team mission have different lifetimes. Closing one is not automatic cancellation, acceptance or deletion of the others.

## 6. Research configuration carried forward

Proposed presets: `sophia-research-md-v1`, `sophia-research-pdf-v1`; optional restricted `sophia-research-pdf-rendition-v1` only when a model-assisted rendition is necessary. Share base research procedure and evidence rules. A fixed renderer-only rendition may not need a model at all.

No broad shell, plugin/credential manager, deployment, raw SQL, automatic personal memory, unrestricted children or competing scheduler. Tools operate only within the authenticated project/attempt/source policy. Native preset composition is not a security sandbox.

Artifact publication identifies the real primary format, immutable source/rendition hashes, citations/evidence, validation outcomes and limitations. A native turn ending or filename text does not publish a report. Existing artifact projection must work before records are introduced; otherwise the old snapshot refusal remains relevant.

A request to render existing research as PDF should not automatically repeat web investigation or materially change conclusions. A new scope/freshness request is a distinct amendment.

## 7. Runtime upgrade stages

**DSHU-01:** inspect complete relevant A/B/C delta and dependency closure; reproduce artifacts; select target from evidence, including the failed-step history case.

**DSHU-02:** achieve public-API/bridge parity without changing model/payer, user-facing feature set or authority semantics. Exercise copied logs/journals, control races and rollback compatibility.

**DSHU-03:** bind the native research presets and approved skills/tools through the existing create/resume setup, preserve guards and record immutable configuration identities.

**DSHU-04:** under actual release authority, pause new admission, drain/hold the old writer, transfer the runtime lease, verify reconciliation, run the bounded founder episode and prove a valid rollback route.

No same writable runtime home under concurrent old/new writers. No HMR over active jobs. No model catalog default changes by accident. No irreversible database reset. No weeks-long waiting rule.

If rc.2 fails a required recovery test addressed by current main, qualify the coherent current-source unit or a later exact release containing that fix. Do not cherry-pick private loop methods into Sophia or pretend rc.2 npm bytes equal current main.

## 8. Feature implementation order

| Work | Dependency and evidence |
|---|---|
| MCG-01 brief-ritual removal | Preserve generic layout/controls and optional text; replacement capability honestly available. |
| MCG-02/03 minimal mission continuity | Canonical read/write and enabled project-note policy; appropriate first/returning-session orientation. |
| RA-01 Markdown research | Real source adapters, evidence record, native worker, actual storage/projection/viewer. |
| RA-02 PDF rendition | Existing renderer extraction/confinement and exact source/rendition lineage. |
| RA-03 voice research delivery | Nonblocking admission, real concurrent conversation, result/room/source races. |
| RA-04 control and partial recovery | Non-destructive valid work preservation, bounded allowance and current authority. |
| MCG-04 learning reuse | Fresh session uses accepted direction and research evidence without superseded assumptions. |

The runtime qualification, UI work and PDF fixed-kernel work can develop in parallel under coordinated file/contract ownership. New product admission only uses the exact unit that has passed its relevant tests.

These sessions amend parts of S1-05/08/11/13 and current alignment work without deleting unmet criteria or claiming an entire sprint complete. Full cognitive modulation, quota management, native slides and general browser control remain separate later scopes.

## 9. Acceptance and evidence status

The research amendment lists R-T01–22. The upgrade strategy lists U-T01–21. First-pass mission/UX tests remain relevant. All are **NOT RUN in this investigation**.

The end-to-end proof must include actual useful MD/PDF bytes, source/citation correctness, real voice while work continues, Stop/Hold/reconnect races, denied private source behavior, readable historical results and returning-session mission continuity.

Record measured cost/latency and errors, not only a green pipeline or a model's claim. “Admitted,” “running,” “source checked,” “artifact ready,” “playback started,” “opened” and “accepted” are different evidence states.

## 10. Open items for the implementation binding

| ID | Required resolution | Current default |
|---|---|---|
| P2-Q01 | B or C runtime target and reproducible package/source build | Qualify B first; C for demonstrated required fixes. |
| P2-Q02 | Exact native preset binding and persisted selection under current bundle | Use public registry/setup, fail closed; prove recovery. |
| P2-Q03 | Actual search provider credentials and project-data disclosure | Use only authorized configured route; no invented availability. |
| P2-Q04 | Text/PDF extraction implementation and supported coverage | Explicit capability table; no hidden parser/OCR claim. |
| P2-Q05 | Current source/artifact publication API and storage policy | Extend canonical contracts, not a side channel. |
| P2-Q06 | Renderer image/browser pin and confinement on the actual host | Fail closed if required isolation is unavailable. |
| P2-Q07 | Live passive-context ordering/interrupt behavior on exact SDK/model | Test before enabling; current notice/read fallback retained. |
| P2-Q08 | Shared-note policy and decision authority | Preserve pass-1 distinction; no default ambient recording. |
| P2-Q09 | Role-specific model/effort and numeric pilot allowances | Preserve approved route for upgrade; calibrate separate policy. |
| P2-Q10 | Compatible downgrade after research data exists | Retain new readers; prepare research-compatible fallback or disable admission. |
| P2-Q11 | Remaining S1-05A live tests and actual deployment state | Refresh and keep unresolved tests open. |
| P2-Q12 | Later native PPTX donor | Separate source/output audit; not in this increment. |

Unknown credentials, release permission or source-format support must not be filled with plausible defaults. Ordinary local development can proceed while those real bindings remain open.

## 11. Source register and continuation instruction

The full source register is [SOURCE_AUDIT.md](SOURCE_AUDIT.md), with exact repository/source pins, paths, selected line coverage, returned Git blobs and evidence class. `evidence/source_manifest.json` contains the same reloadable identity. The original v0.1 source register remains historical context, not an assertion that every old source was freshly audited here.

**Next authorized implementation action:** refresh the actual checkout and current deployment/active work, bind DSHU-01 and the RA-01 contract destinations, and produce the smallest working Markdown research slice. Develop native preset reuse against a qualified unit, rather than restarting a generic harness comparison. Then add the already-planned PDF kernel and actual voice/returning-mission episode.

Success is not that Sophia produces more documents. It is that the team can ask a useful question naturally, receive reliable work, understand its implications, steer it safely and continue later with a clearer mission.
