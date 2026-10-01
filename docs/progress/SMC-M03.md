# SMC-M03 progress: research specialists, Markdown/PDF delivery and Knowledge

The mission: [M03](../missions/2026-09-27-companion-research/missions/M03_RESEARCH_WORKFLOW.md), pack v1.1. Coordination: issue [#31](https://github.com/davidelaverga/Sophia/issues/31). Plan: [SMC-M03-plan.md](SMC-M03-plan.md) (approved). Contract binding: [SMC-M03-contract-binding.md](SMC-M03-contract-binding.md). State: [SMC-M03-state.json](SMC-M03-state.json). Coordination mirror: [docs/coordination/SMC-M03](../coordination/SMC-M03/README.md).

This record keeps source, tests, hosted evidence and human acceptance apart. A state changes only with the evidence named beside it.

**Checkpoint, 2026-10-01, attempt 1: S0 (bind), S1 (readers first, byte store, report content and Knowledge reads) and S2 (the research route and its guard, usage with cache counters and compaction calls, the specialist registry; unit `sophia-runtime-m03-dev`) are done. S2 awaits Codex's review (CC-0004); S3 (source access) is next. Nothing is merged, released or deployed.**

| Readiness | State |
|---|---|
| Source-ready | No: S0, S1 and S2 are in PR #32; S3 to S7 are planned (plan §4) |
| Merge-ready | No |
| Release-ready | No: every hosted step is a Codex operation with Davide's bound approval (plan §5) |
| Hosted-verified | No. This attempt touches no hosted state |
| Product-accepted | No |

## 1. Identities

| Item | Value |
|---|---|
| Base | `main` `ba983e7` (merge of #23; #29 merged at `41ac3e7`, then #28 and #23) |
| Luis's work included | #24 (`studio/side-chat`) merged at `19a41e0` in `da7660e`, as Davide asked ("targets also Luis's latest changes"). #30 is not included yet (§5) |
| Branch | `claude/smc-m03-research` |
| Implementation PR | [#32](https://github.com/davidelaverga/Sophia/pull/32) (draft, base `main`) |
| Implementer | Claude Code, session `https://claude.ai/code/session_018hCUhiK4hgMf5V5QPbkC9S` |
| Operator | Codex, woken by Davide on #31 |
| Toolchain on this host | linux-x64, Node 24.21.0 (tarball checksum verified), pnpm 11.7.0; `pnpm install --frozen-lockfile` exit 0 at `da7660e` |
| Harness | dsh `0.2.0-rc.2` at `639ed01` (unit `sophia-runtime-m02-dev`, cut over by OP-0003) |
| Hosted gate | M02 OP-0003 complete and verified ([CX-0015](https://github.com/davidelaverga/Sophia/pull/29#issuecomment-5921358520)) |

## 2. Goals

| Goal | Slices (plan §4) | State |
|---|---|---|
| G1 Source access | S0, S1, S3 | S0 and S1 done (§6, §7); S3 after S2 |
| G2 Durable Markdown | S2, S4 | S2 done (§8–§10); S4 next after S3 |
| G3 PDF | S5a (renderer host, Codex probe), S5b | planned; the host depends on CC-0001 and D6 |
| G4 Voice and text | S6 | planned |
| G5 Mission loop and release | S7 | planned |

## 3. Owner decisions

All recorded in plan §8. D1–D10 decided on 2026-09-30, with D1 raised to **$5 per task** and $40 for qualification, and D3 set to `main`. L6, U3 and U4 approved on 2026-10-01. L1–L5 and U1 are proposed for Luis's review.

## 4. Operations

| Operation | Kind | Request | State |
|---|---|---|---|
| SMC-M03-OP-0001 | read only | [CC-0001](../coordination/SMC-M03/SMC-M03-CC-0001.md) ([posted](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5921937526)) | awaiting Codex. Wake line: `SMC-M03: read SMC-M03-CC-0001 on #31 and act within its scope.` |
| SMC-M03-OP-0002 | review and local tests | [CC-0002](../coordination/SMC-M03/SMC-M03-CC-0002.md) ([posted](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5922184205)) | **answered** by the operator Codex in [CX-0002](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5923248971) at `dfb91d6` (the cloud attempt CX-0001 was blocked). Every suite exit 0 on Node 24.21.0 and PostgreSQL 16.13; 0021 after 0022 exit 0; compatibility and RLS hold. One finding, **M03-RF-0001 (P2)**: the task detail's `outputs` took the task's newest version even when it was not published. **Fixed**: outputs read only published versions, with a regression case for candidate, validated and rejected versions by the task and by a child job (`research-readers.db.test.ts`, fails without the fix). Returned to Codex for re-review in [CC-0003](../coordination/SMC-M03/SMC-M03-CC-0003.md), with S1 part 2. Wake line: `SMC-M03: read SMC-M03-CC-0003 on #31 and act within its scope.` <br>**Revision 2 answered** in [CX-0003](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5930015231) at `569fc75`: M03-RF-0001 verified fixed; `pnpm check` exit 0 (415 unit; 72 integration, 2 skipped) with the runtime-service suite inside it; `test:sql` 21 migrations; `test:db` 214/214. One new finding, **M03-RF-0002 (P2)**: a Knowledge cursor whose microseconds exceed `bigint` passed validation and failed in SQL as a retryable 503. **Fixed**: the decoder refuses it, and any cursor with extra segments, as `invalid_request` (422) before any query; `knowledge.db.test.ts` covers bigint max (200), max + 1 and beyond (422), zero (200) and an extra segment (422), and fails without the fix. Returned with S2 in CC-0004 |

Cloud Codex review of #32 at `29bb825` (Davide's request, [comment](https://github.com/davidelaverga/Sophia/pull/32#issuecomment-5922653573)): verified by Claude.
- The PR is not end to end yet. That is true, and by plan: it stays a draft until S7.
- The mission state named the S1 part 1 commit. Fixed.
- Three docs ended with a blank line (`git diff --check`). Fixed.
- Its suites did not run there, because Node 24.21.0 and the dependency set were unavailable. CC-0002's test item stays open for the operator Codex.

No hosted effect, deployment, migration, paid call or credential use happened in this attempt.

## 5. Luis's open work

- **#24** is merged into this branch. The delivery UI builds on its `SidePanel`.
- **#30** conflicts with #23's review fixes on `main` (`App.tsx`, `route.ts`, `route.test.ts`, `CONTRIBUTING.md`, and `ProjectHome.tsx` deleted vs changed). Those resolutions are Luis's. This branch merges #30 once Luis updates it on `main`. It owns `0021` and `A10`; M03 starts at `0022` and `A11`.
- The cross-project Knowledge library (L6) lands in #30's Work place after that merge.

## 6. S1 part 1: readers first

What a later release writes, these readers already read. No writer exists in this slice.

| Surface | Change | Evidence |
|---|---|---|
| Schema | `0022_research_readers.sql`: <br>• `markdown` format; <br>• report description (revisioned) and per-version notes, `change_facts`, trigger, number and limitations; <br>• `artifact_renditions`; <br>• job parent and report links, with one task job per attempt and children without an attempt or command; <br>• cache usage columns; <br>• `is_task_kind` allowlist in the task view and in `media_assignments` | `pnpm test:sql`: 21 migrations; `research-readers.db.test.ts` 5/5 |
| Contract | A11 read side ([binding §3](SMC-M03-contract-binding.md)); runtime wire unchanged | `pnpm contracts:check` |
| Persistence | `readArtifacts` (each report's stable version and its renditions, at most 100); the artifact refusal removed; the real task kind and `artifactId`; result outputs and cache usage | `pnpm test:db` 203/203 (198 before) |
| Bridge | Result notices by kind; an unknown kind is skipped, never blocking a known one | `room-session.test.ts` 93/93, mutation-checked |
| Studio | Task kind and research phase words; the work heading by kind; `native_task.research` summary | `conversation-view.test.ts` |
| API | `research` summary code; `/ready` requires 0022 | `pnpm check` |

Left for S4, where research writes usage: the task detail reports the usage of the attempt's latest model call (the brief's rule, one step). A research attempt makes many calls, so its detail will sum them per attempt.

Compatibility: every added property is omitted when it has no value, so an older Studio or bridge reads every pre-M03 record unchanged. 0022 must be applied before an API that carries these readers (`/ready` says so). No research row can exist until the writer release, which follows the release carrying these readers.

## 7. S1 part 2: byte store, report content and Knowledge reads

| Surface | Change | Evidence |
|---|---|---|
| Byte store | `ByteStore` port (`apps/api/src/byte-store.ts`): write-once objects at `<project>/<source>`, signed GET URLs with an optional download name; a Supabase Storage REST adapter (config `SOPHIA_STORAGE_URL`, `_KEY`, `_BUCKET`, all or none) and an in-memory one. **Not exercised live**; the credential question is in [binding §8](SMC-M03-contract-binding.md) | `byte-store.test.ts` 6/6 |
| Report content | `GET /api/v1/sources/{id}/content?disposition=`: published report versions and their renditions only (never a candidate or a rejected version); inline text as text, stored bytes as a 120-second URL; `no-store`; not ready → 409; no store → 503 for stored bytes only | `sources.db.test.ts` 5/5 over HTTP, mutation-checked |
| Knowledge | `GET /api/v1/knowledge/reports?project=<id>|all&format=&q=&cursor=` (cards, per-project counts, 30 per page) and `GET /api/v1/artifacts/{id}/versions` (published versions with notes) | `knowledge.db.test.ts` 5/5: <br>• isolation across projects (no card, count or name from another project); <br>• format and search; <br>• paging; <br>• no candidate version; <br>• guest refused |
| Studio | Icons `download`, `expand`, `collapse` (L4); `api/artifacts.ts` for the three reads | typecheck |

## 8. S2 part 1: execution policy (the research route)

The runtime unit becomes `sophia-runtime-m03-dev` (previous: `sophia-runtime-m02-dev`, the rollback). Same dsh release and the same runtime tree (`sophia-tree-v2:sha256:4552d08f…`); only the Sophia bundle changes. No hosted effect: the unit is built and recorded on linux-x64 only.

| Surface | Change | Evidence |
|---|---|---|
| Route allowlist | The bridge row carries `routes` (`research-sol-medium-v1`: `openai-research` / `gpt-6.1-sol` / `medium`) and `roleRoutes` (both research roles). Config keys are strict; `default` cannot be redefined; a role route must name a role this unit defines | `tests/unit/routes.test.mjs` |
| `routeFor` | A create resolves the role's route, records it in the attempt's identity, and refuses a command that names another route before any session or journal entry exists. An attempt without a recorded identity resumes on its role's route | `research-route.test.mjs` (rejected create, empty journal) |
| Route guard | A global `llm/stream` hook (prepended) refuses any model call made for a bound attempt, by its Agent or by a child a `workflow` program spawns, that names another provider, model or effort. The refusal happens before a request leaves and is journaled as `sophia/route-refused` (audit only; replay ignores it). Compaction passes: it targets the session's latest route and names no effort | `route-guard.test.mjs`: the mock offers a second model; the child that names it never reaches the mock, the child on the route does, and one refusal is journaled on the parent attempt |
| Sol route | `openai-research` provider row in the bundle patch (`openai-responses`, `OPENAI_RESEARCH_API_KEY` by reference), the `gpt-6.1-sol` entry declared by hand (D2): context 272000, `maxTokens` 16000 (the request default cap), `compat.supportsLongCacheRetention:false` so no retention field is ever sent. Cache retention stays unset (short), so `prompt_cache_key` is the native session id | `research-route.test.mjs` against a local Responses stub with a dummy key: model, `reasoning {effort: medium, summary: auto}`, encrypted reasoning, `prompt_cache_key = sophia-<attempt>`, no `prompt_cache_retention` or options, `max_output_tokens` 16000, `store:false`, `strict:false` tools, the role's tools only, a stable instructions and tools prefix across turns |
| Compaction | `compaction-basic` policy for the Sol route: threshold 0.45, headroom 16000, summary cap 8000 | gate |
| Roles and presets | `sophia-research-md-v1` and `sophia-research-pdf-v1` (identity presets for now; their research tools compose in S4); the role pattern widens to `^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$` and the command gains an optional `route` (A11, runtime wire regenerated) | `role-registry.test`, `contracts:check` |
| Gate | `checkModelRoutes`: bridge routes and role routes equal the unit's; the provider row, key reference, base URL, model entry, effort, `maxTokens`, context window and compat equal the recorded route; `cacheRetention` is never `long`; research roles share one route. `checkCompaction`: the policy equals the unit's, names a recorded route, and never a separate summarization model | `gate-parse.test.mjs`; `profile-gate.test.mjs` adverse case (long retention, `maxTokens` 128000, a role remapped to `default`, a changed compaction threshold) |
| Runtime host | Credentials are the default route's key plus each research route's key reference, by name only. The default is required; a missing research key is logged by name, and the research route then fails its first call with the adapter's `MISSING_CREDENTIAL` (never another route) | reviewed against `llm-pi-ai` at the pin; no automated test (the script runs only on a host). Codex rehearses it at cutover |
| Test doubles | `mockRouteOverlay` points every route at the keyless mock; `researchRouteOverlay` points the real `openai-research` entry at the local stub | M02 request-shape parity unchanged |

| Identity | Value |
|---|---|
| Unit | `sophia-runtime-m03-dev` |
| Bundle archive (linux-x64) | `sha256:6344b0c5827fff52ee9fca8778255e03a90be81abc9c487b5330a7ea23c48f0e` |
| Runtime tree | unchanged, `sophia-tree-v2:sha256:4552d08f78b47b7d0f16e79a92c487cffdfc5bb0a05eaef867c89ba837479a12` (both platforms) |
| darwin-arm64 bundle archive and profile lock | pending: Codex records them on Apple silicon (`pnpm artifacts:record`). Until then the gate on a Mac reports the missing platform entry |

Run on this host (Node 24.21.0, pnpm 11.7.0, PostgreSQL 16.13): `pnpm check` exit 0 (419 unit; 73 integration, 2 skipped as before), `pnpm test:sql` 21 migrations, `pnpm test:db` 214/214. Unchanged by this part: the schema, the API and Studio.

The specialist registry is part 3 (§10); usage forwarding is part 2 (§9). Moved to S4, with the research tools they guard: the reservation hook and the `skill-filesystem` closure ([binding §8](SMC-M03-contract-binding.md)).

## 9. S2 part 2: usage with cache counters and compaction calls

| Surface | Change | Evidence |
|---|---|---|
| Bridge | An assistant message's usage adds `cacheReadTokens` and `cacheWriteTokens` when the adapter reported them. A `compaction/summary` event is projected as its own model call (`compactionId`, provider, model, usage), never its summary text. dsh's counts are disjoint, and `llm-pi-ai` leaves a zero cache counter out, so an absent counter means zero or not reported | `research-route.test.mjs`: the stub reports 1200 cached and 100 written tokens on turn 2; the service receives input 200 (uncached), read 1200, write 100, and no counters on turn 1. `compaction-usage.test.mjs`: a real compaction on a bound attempt passes the route guard (nothing refused) and reaches the service as one call, without the summary text |
| Schema | `0023_usage_cache.sql`: `usage_records.purpose` (`turn` or `compaction`, default `turn`); `runtime_record_observations` fills the cache columns and records compaction calls; `usage_count(jsonb)` reads a count or null | `pnpm test:sql`: 22 migrations |
| Persistence | A task's result reports the turn that produced it (`purpose = 'turn'`), never a later compaction | `runtime.db.test.ts`: per-call rows, null when not reported, a summary without usage records nothing, the result unchanged by a later compaction (mutation-checked: without the filter the case fails) |
| API | `/ready` requires 0023 | `pnpm check` |

The bundle changes, so the unit's linux-x64 bundle archive is re-recorded: `sha256:c119dbaec86fb54319356bbe46bef9cc2474e25e036ae83a32b3a7ebe3e004b2` (replacing §8's `6344b0c5…`). The runtime tree is unchanged; darwin-arm64 is still pending Codex.

Compatibility: 0023 only adds a defaulted column and replaces the writer, so the readers released with 0022 keep working before and after it. An older bundle sends no cache counters and a null compaction projection; the writer records nothing new for it. The API with the purpose filter needs 0023 first, and `/ready` says so.

Known gap, unchanged from M02: a `workflow` child's own model calls are not observed (the bridge forwards bound sessions only), so their usage is not recorded. Research roles have no `workflow`; the M02 `sophia-research-v1` does. Recorded for S4's allowance work, where every call is reserved before it runs.

## 10. S2 part 3: the specialist registry

| Surface | Change | Evidence |
|---|---|---|
| Registry | `config/specialists.json` (schema `config/schemas/specialists.schema.json`): per specialist its family, task kind, outputs (Markdown always), route, native tool policy, output profile, admission fields, source policy and continuation owner; `workflow`, `peer` and `raw_host_shell` are `false` by schema. `config/roles.json` is back to the roles before M03 | `tests/unit/specialists.test.mjs`: the schema refuses a host shell, workflows, peers, no Markdown, the `default` route, an unknown field, a PDF output without its renderer, and a duplicate id |
| Generation | `packages/contracts/scripts/generate-specialists.ts` validates the registry and writes `packages/dsh-bundle/src/specialists.generated.ts` (id, family, outputs, route, native tools). It runs in `pnpm --filter @sophia/contracts generate`, and its `--check` in `pnpm contracts:check` | a registry edit without regeneration fails `contracts:check` (mutation-checked) |
| Bundle | `role-registry.ts` derives the specialist presets from the generated module: their tool policy is the registry's, never restated; no goal continuation | `role-registry.test.mjs`: the presets are exactly `roles.json` plus the registry |
| Equality | The unit's `role_routes` and the bridge row's `roleRoutes` equal the registry's routes; each route is recorded by the unit and each preset is in its roster | `specialists.test.mjs` (a changed route fails it, mutation-checked) |

The research specialists' tool policy now names the research tools S4 builds. Until S4 registers them, a research attempt is offered only `todo_write` (`research-route.test.mjs`); the policy changes the presets' digests, so the bundle archive is re-recorded: linux-x64 `sha256:b085f3f9f7c225ceac3390fa3df2883263759ba6b3c3882ea793bd225ecb00a1` (replacing §9's `c119dbae…`). darwin-arm64 is still pending Codex.

Moved to S4 with the research tools ([binding §8](SMC-M03-contract-binding.md)): the preset patch files and `bundlePatchFiles()`, the research-base and output plugins, prompt sections, and the registry's `prompt_sections`. The API's admission resolution against the registry is S4's as planned. SOURCE_MAP §2d and DESTINATION_MAP record S2's upstream sources and paths.

A test fix found by this part's full run: `tool-recovery.test.mjs` (M02-T10) read the native session log as soon as the service had observed the second turn's end, and once, with the runtime-service suite inside the run, the log did not hold that event yet (`['error']` for `['error', 'completed']`; it passed 3/3 alone). The service sees an event when dsh appends it and the log file is written after, so the test now waits until the log holds both turn ends before asserting. No product code changed.
