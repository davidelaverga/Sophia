# SMC-M03 contract binding (G1)

**Frozen at G1 on 2026-10-01.**

| Anchor | Value |
|---|---|
| Branch | `claude/smc-m03-research` |
| Base | `main` `ba983e7` (#29, #28 and #23 merged), plus Luis's #24 merged at `19a41e0` |
| Plan | [SMC-M03-plan.md](SMC-M03-plan.md) (approved D1–D10, L6, U3, U4) |
| Mission | [M03](../missions/2026-09-27-companion-research/missions/M03_RESEARCH_WORKFLOW.md) |
| Bindings | [CONTRACT_BINDINGS](../missions/2026-09-27-companion-research/shared/CONTRACT_BINDINGS.md) |
| Coordination | [#31](https://github.com/davidelaverga/Sophia/issues/31) |

This document binds the plan's target semantics to the code that exists. A later change is recorded here, with its reason, in the commit that makes it. An existing operation is reused wherever it fits, so no duplicate route, store or queue is added (CONTRACT_BINDINGS §1–§2).

## 1. Reservations

| Item | Reserved | Why |
|---|---|---|
| Migrations | **0022** onward. Planned: 0022 readers and formats, 0023 research writers, 0024 allowance and reservations; more if needed, recorded here first | `main` ends at `0020_typed_mission_turns.sql`. Luis's #30 ships `0021_personal_space.sql` |
| Contract amendment | **A11** (`packages/contracts/amendments/A11-research-and-knowledge.json`) | `main` ends at A09. #30 ships `A10-personal-space.json` |
| Runtime unit | `sophia-runtime-m03-dev`, `previous_unit: sophia-runtime-m02-dev` | The research route and presets change the bundle (§5) |
| Lock | `pnpm-lock.yaml`: written only by the main implementation session, in the commit that changes dependencies | Single writer |

If #30 lands after M03's schema, 0021/A10 stay #30's. If #30 is abandoned, nothing in M03 renumbers: applied numbers are never reused.

## 2. What already exists and is reused

| Mission concept | Existing code (at the base) | M03 use |
|---|---|---|
| Work admission | `sophia.admit_native_task` (0016:158), `goals` / `work_attempts` / `execution_bindings` / `commands` / `jobs` / `outbox` | A new `sophia.admit_research_task` uses the same tables and lock order. `admit_native_task` stays brief-only and is retired over HTTP (410) |
| Native dispatch | `sophia.dispatch_runtime_outbox` (0012:711) builds `{role:'sophia-brief-v1', text}` | Replaced (CREATE OR REPLACE) to take the role and `route` from the job for `kind='research'`. Every other command stays **byte-identical**, proved by a SQL test |
| Receipts | `sophia.apply_runtime_receipt` (0012:464) selects the job by `attempt_id` with no kind filter | **Unchanged** (changed at S1, see §8): 0022 makes a child job carry no attempt or command (`jobs_child_has_no_attempt`) and allows one task job per attempt (`one_task_job_per_attempt`), so every single-row read by attempt or command still finds the task job |
| Observations | `sophia.runtime_record_observations` (0012:583): usage from `assistant/message`; `turn/end` → `capture_native_result` | Replaced: usage also from `compaction/summary`, with cache columns; `turn/end` dispatches by job kind (research turn-end rules, plan §2.5) |
| Brief capture | `sophia.capture_native_result` (0016:29), `kind='draft_brief'` only | **Unchanged.** Research never publishes the last assistant message |
| Task view | `sophia.native_task_view` (0012:803), `WHERE j.kind='draft_brief'` | Replaced in 0022 with the allowlist `sophia.is_task_kind` (`draft_brief`, `research`) and no child job; `artifact_id` appended last (a view replace cannot reorder) |
| Voice results | `sophia.media_assignments()` (0018:734), results kind `draft_brief` | Replaced in 0022 with the same allowlist and the job's real kind. The summary pointer moved to S6 (§8) |
| Snapshot | `readSnapshot` returns `artifacts: []` and `refuseUnprojectedRecords` throws on any artifact version (`packages/persistence/src/snapshot.ts:63,83,169`) | `readArtifacts` projects reports; the refusal is removed **before** any writer exists |
| Task readers | `toTask` hard-codes `kind:'draft_brief'`; `readNativeTasks` returns the latest 50 (`native-tasks.ts:108,123`) | `toTask` reads the real kind. `control_work` resolves by id through `readNativeTask` |
| Tool surface | `TOOL_HANDLERS` (`apps/api/src/media-tools.ts:72`) keyed by the contract's name union; the bridge requires equality with the guide manifest | `start_research` and `render_research` handlers. `GET /v1/media/tool-surface?guide=<id>` serves the surface for the requesting bridge's guide version, with v1.1 as the default |
| Bridge reader | `parseMediaAssignmentBatch` on every poll (`apps/media-bridge/src/service.ts:59`) | A kind-tolerant reader ships in the readers-first release: unknown result kinds are deferred per entry, never failing the batch. The notice text becomes kind-generic (`room-session.ts:1197`) |
| Diagnostics | `TASK_SUMMARIES` (`apps/api/src/diagnostics/sanitize.ts:166`); readiness `REQUIRED_SCHEMA` (`apps/api/src/app.ts:60`) | Research summary codes added. New functions are added to readiness in the release that creates them |
| Sources | `source_objects`, `source_texts` (text ≤ 256 KiB), `put_text_source` | Retained passages and the ResearchRecord are `source_objects`. Bytes beyond the inline cap go to the byte store (D5) |
| Artifacts | `artifacts(format IN html,pdf,pptx,ui)`, `artifact_versions`, `publish_candidate` (0003) | One artifact per report (`format='markdown'`), versions v1..vN, and `artifact_renditions` for PDF (plan §2.8.8) |
| Usage | `usage_records(input_tokens, output_tokens, …)` | Nullable `cache_read_tokens`, `cache_write_tokens`. A reservation table is added (0024) |
| Bytes route | `GET /api/v1/sources/{sourceId}/content` → `SourceContent` (contract-only in the pack) | Implemented with `disposition=inline|attachment` and short-lived signed URLs |
| Versions route | `GET /api/v1/artifacts/{artifactId}/versions` (contract-only) | Implemented and extended with notes, change facts, trigger and renditions |
| Model route | One unit-wide route: `agent-default-model` → `defaultRoute()` (`control-bridge.ts`) | A route allowlist in the bridge row; the route is chosen at admission, carried as `route` in the create command, and recorded in `sophia/identity`. M02 roles map to `default` |
| Presets | Six identity-only presets with `plugins: []`; `checkPresetRoster` requires it | New `sophia-research-md-v1` and `sophia-research-pdf-v1` with preset-scoped plugins. The gate checks a recorded expected-rows digest per preset |

## 3. A11 contents (one amendment, applied in slices)

The S1 part covers the read side. These must ship before any writer:
- `ArtifactVersion.format` gains `markdown`.
- Kinds widen: `NativeTask.kind` and `NativeTaskReceipt.kind` become the enum `draft_brief | research`. `NativeTask` gains an optional `artifactId`.
- `MediaAssignment.results[].kind` becomes any bounded kind name, and a bridge announces only the kinds it knows.
- `NativeTaskDetail.result` gains `outputs[]` (`artifactVersionId`, `format`, `sourceId`, `sha256`, `byteLength`, `limitations`) and `cacheReadTokens`/`cacheWriteTokens`.
- `ArtifactVersion.format` gains `markdown`, plus optional `title`, `versionNumber`, `createdAt` and `renditions[]` (`ArtifactRendition`).
- Every added property is omitted when it has no value, so older readers read every pre-M03 record unchanged.
- Part 2 (with the byte store): Knowledge read schemas (report card, versions, compare); `SourceContent` gains `disposition`.

The later parts cover the write side:
- `RuntimeCommand.payload.role` pattern becomes `^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$`, and an optional `route` is added (S2, §8).
- `MediaToolCall.name` gains `start_research` and `render_research`.
- Research admission request and receipt, with `amendsTaskId` and `newRequest`.
- The runtime research operations: `context`, `reserve`, `settle`, `capture`, `draft`, `submit`, `render`.
- The `notice` ChatReply kind (amends A09's `room-chat` contract).
- `PATCH` of a report description.
- `tool-surface?guide=`.

Each part regenerates types, validators and the runtime wire (`pnpm contracts:check`).

## 4. Research tool → runtime operation → SQL

| Model tool (research presets) | Runtime route (A11) | SQL / service |
|---|---|---|
| `research_read_context` | `POST /v1/runtime/research/context` | Reads the admitted `context_manifests` row and eligible sources |
| `research_search` | `…/reserve`, then the Tavily provider, then `…/capture` | Reservation row (0024); discovery records as `source_objects` plus the provenance row |
| `research_read_source` | `…/reserve`, then the Jina adapter, then `…/capture` | Provenance-bound target (a search result, an extracted link or an admitted input); retained passage plus cursor |
| `research_write_draft` | `…/draft` | A per-attempt draft source with an expected base hash |
| `research_render_pdf` | `…/render` | Child `jobs(kind='render', parent_job_id)` with a `sophia.render-job.v1` payload; the renderer supervisor claims it |
| `research_inspect_output` | `…/context` (render result) | `sophia.render-result.v1` receipt and checks |
| `research_submit_result` | `…/submit` | One transaction: verify, then a candidate version, then validated, then stable; renditions; summary and notes; `change_facts`; the result pointer |
| `research_report_blocker` | `…/submit` (blocker form) | A bounded work event and remaining-work record; never room speech |
| Model calls (all, including compaction) | `…/reserve` and `…/settle` from the bridge's `llm/stream` hook | Reservation row per provider call; settled from usage, or `uncertain` |

All routes are authenticated like observations (runtime lease and binding), idempotent by native session and tool-call id, and fenced by authority epoch and goal status.

## 5. Runtime unit delta (S2)

| Item | At the base | Intended |
|---|---|---|
| Model routes | openai / gpt-6-luna / high (default only) | + `research-sol-medium-v1`: provider row `openai-research` (`OPENAI_RESEARCH_API_KEY`), model `gpt-6.1-sol` declared by hand (D2), effort `medium`, `maxTokens` 16000, `compat {supportsStrictMode:true, supportsLongCacheRetention:false}` |
| Presets | six, `plugins: []` | + two research presets in separate patch files (list form of `dsh.bundle.patch`) |
| Bridge | `defaultRoute()` for every role | `routeFor(command)` against the allowlist; a global `llm/stream` route guard and reservation hook |
| Skill discovery | base `skill-filesystem` with default roots and watch | Restated with `includeDefaultRoots:false`, `watch:false` |
| Usage projection | `assistant/message` input and output | + cache tokens and `compaction/summary` |
| Cutover | — | Codex operation after S2 review. Precondition: zero non-final bindings on `sophia-runtime-m02-dev` |

## 6. What does not change

- The Live model and guide v1.1 bytes, until S6 adds v1.2 as a new versioned asset.
- `capture_native_result` and the brief admission retirement.
- M02 roles and their route.
- The A04 hello, commands, receipts and ready routes.
- Applied migrations: they are only superseded by CREATE OR REPLACE or ALTER in new files.
- Hosted services: every hosted effect is a Codex `execution_request` with Davide's grant.

## 7. Luis's open work

- **#24**: merged into this branch at `19a41e0`. The delivery UI builds on its `SidePanel`.
- **#30**: merged once it is updated on `main`. It conflicts with #23's review fixes in `App.tsx`, `route.ts`, `route.test.ts`, `CONTRIBUTING.md`, and `ProjectHome.tsx` (deleted vs changed); those are Luis's decisions.
- **The cross-project Knowledge library (L6)** lives in #30's Work place and lands after that merge.

## 8. Changes since G1

| Date | Change | Reason |
|---|---|---|
| 2026-10-01 (S1) | `RuntimeCommand` role pattern and `route` move from A11's read side to S2 | `generate-runtime-wire.ts` compiles them into the dsh bundle, so changing them changes the runtime unit's identity. They change with `sophia-runtime-m03-dev` |
| 2026-10-01 (S1) | `NativeTaskRequest.kind` stays `draft_brief` | HTTP brief admission is retired (410). Research is admitted through its own tool request (write side) |
| 2026-10-01 (S1) | The assignment result's summary pointer moves to S6 | The notice only needs the `taskId`: the guide reads the result with `read_selected_source`. A model-written title in a notice is an injection surface that S6's notice-spoof test covers |
| 2026-10-01 (S1) | `MediaAssignment.results[].kind` is a bounded pattern, not an enum | A generated validator fails the whole batch on an unknown enum value. A pattern lets each bridge skip only the entry it does not know |
| 2026-10-01 (S1) | `apply_runtime_receipt` is not replaced | 0022's child-job CHECK and one-task-job-per-attempt index keep the existing single-row reads exact (§2) |
| 2026-10-01 (S1) | 0021 and 0022 are disjoint | #30's `0021_personal_space.sql` only creates `personal_*` tables and their policies; 0022 changes none of them. The runner applies a missing version whatever its number, so either may land first |

