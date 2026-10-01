# SMC-M03 plan: research specialists, Markdown/PDF delivery and Knowledge

**Approved by Davide on 2026-09-30 and 2026-10-01** (D1–D10, L6, U3, U4; see §8). Copied into the repository at S0 from the planning session; later changes are recorded in [SMC-M03.md](SMC-M03.md) and the [contract binding](SMC-M03-contract-binding.md). Coordination: [#31](https://github.com/davidelaverga/Sophia/issues/31).

**Research specialists that produce Markdown/PDF, spawnable from voice and text, running on GPT-6.1 Sol (medium) through native dsh routing with measured prompt caching, coordinated with Codex.**

- Target repo: `davidelaverga/Sophia`. Donor, read-only: `davidelaverga/Sophia-Agent`.
- Base: `main` at `ba983e7` (PR #29 merged at `41ac3e7`, then #28 and #23), plus Luis's #24 merged at `19a41e0`. Luis's #30 is merged once it is updated on `main` (it conflicts with #23's review fixes).
- Harness: dsh `dsh-v0.2.0-rc.2` at `639ed01`. pi-ai is pinned at 0.87.1; the latest is 0.99.2.
- How this plan was built:
  - 9 parallel research reports.
  - An internal adversarial review in 4 lenses: pack compliance, dsh-native feasibility, admission/data, security/ops. 48 findings were accepted, each checked against the source.
  - A completeness pass done by me. The fifth critic was lost to a container restart.
- These reviews are internal. They are not independent validation; that is Codex's and Luis's role.

---

## 0. Ground truth (verified in source)

| Fact | Consequence |
|---|---|
| **Admission surface**<br>• M01 is merged.<br>• The Live tool surface is exactly six tools.<br>• `start_brief` is gone, and `POST …/native-tasks` returns 410.<br>• The bridge refuses to start unless the declared tools = guide manifest = API tool surface. | Nothing can admit native work today. Adding research requires a versioned guide asset, a contract amendment, and coordination between the API and the bridge. |
| **M02 status**<br>• M02 source is on `main` (#29 merged at `41ac3e7`).<br>• The G5 runtime cutover (OP-0003) is a hosted operation still to be verified.<br>• At the last read, production ran unit `s1-03-dev`. | M03 branches from `main`. **No M03 hosted change of any kind happens before OP-0003 is verified.** |
| **Model routes**<br>• dsh presets are `{id, plugins}` and have **no route field**.<br>• Routes are set per Agent through `ctx.agents.create({agentOptions})`.<br>• Sophia uses one unit-wide `defaultRoute()`. | R1 needs an execution-policy layer. The route is resolved at admission, carried in the create command, and verified by the bridge. |
| **GPT-6.1 Sol availability**<br>• `gpt-6.1-sol` is on OpenAI Responses, released 2026-09-29.<br>• The pi-ai 0.99.2 catalog has it, with $2/$10 per 1M tokens, cached input $0.10, cache write $2.50, a 272K price tier, and `supportsStrictMode:true`.<br>• The pinned pi-ai 0.87.1 does not have it (it does have `gpt-6-luna`). | Declare Sol by hand, with values taken from the 0.99.2 catalog. This is **not** the M02 luna precedent. |
| **Strict-mode tools**<br>• pi-ai sets `strict` on tools only when `supportsStrictMode` is true.<br>• Research is the first role to send tools on this route. | Declare `supportsStrictMode:true` (it sends an explicit `strict:false`). Verify live before anything else. |
| **Provider cache handling**<br>• `prompt_cache_key` is the dsh session id, `sophia-<attemptId>`. It is not configurable.<br>• The route setting `cacheRetention` defaults to `short`.<br>• `long` on a hand-declared entry sends `prompt_cache_retention:"24h"`, which likely returns 400.<br>• Anthropic uses `cache_control`; DeepSeek caches automatically. | Provider caching is pure configuration. Guard against `long`. |
| **Usage accounting**<br>• dsh reports `cacheReadTokens`/`cacheWriteTokens`.<br>• **Compaction makes its own billable call through `ctx.llm.stream`**, which bypasses `agent/request`.<br>• Sophia forwards only input/output on `assistant/message`.<br>• `usage_records` has no cache columns.<br>• dsh zeroes cost. | Recorded usage and spend under-count today. The spend reservation must hook `llm/stream`. |
| **Runtime wire**<br>The runtime host reaches the API only through the A04 wire: hello, commands, receipts, observations (asynchronous, fire-and-forget), ready. | Research tools need a new **synchronous** runtime-operations surface. |
| **Text path**<br>• Typed chat goes into **the same Gemini Live session**: same tools, `inputMode:'text'`.<br>• It requires the floor, a ready voice connection and an open exchange.<br>• Text mode exists only in the browser; notices are spoken into a muted element. | One tool handler serves voice and typed text. Text-mode delivery needs a signal and a notice packet. |
| **Hard-coded brief readers**<br>• All readers are hard-coded to `draft_brief`: SQL views, `media_assignments`, `toTask`, contract `const`, diagnostics, `/ready`.<br>• The **bridge strictly parses every assignment batch**.<br>• The snapshot throws on any `artifact_versions` row.<br>• `artifacts.format` has no `markdown` value.<br>• SQL assumes one job per attempt and per command. | Readers go first: API + bridge + Studio, before any writer. Readers use a kind *allowlist*, not kind-agnostic queries. |
| **Controls and bindings**<br>• Steer and resume target only `sophia_episode` bindings.<br>• Bindings are unit-scoped.<br>• Admission binds to the newest active runtime row, whatever its unit. | Research runs as `sophia_episode`. A unit change requires zero non-final bindings on the old unit. Admission checks that the chosen unit serves the preset and route. |
| **Skill discovery**<br>The base `skill-filesystem` row is global, scans workspace and home roots, and watches them. | Research prompt text goes through `ctx.systemPrompt.section`. Close workspace skill discovery. |
| **Storage and renderer**<br>• There is no object storage.<br>• `source_texts` holds at most 256 KiB of text.<br>• There is no renderer, and Render services run native Node.<br>• Playwright adds `--no-sandbox` unless `chromiumSandbox:true`.<br>• CI (ubuntu-24.04) restricts user namespaces. | Build the byte store before source capture. The renderer runs on a separately qualified host. PDF stays gated until then. |
| **Donor PDF kernel**<br>• The kernel is `render_html_to_pdf.mjs` (blob `f2e808cf`) from the observability lineage (`codex/sophia-observability-v1`, `mem00-text-pilot`, `release/voice-lab-c5-r1`); production deployed from that lineage.<br>• Donor `main` and the newest mailbox branch are from the pandoc era.<br>• The pack already pins the kernel and defines `sophia.render-job.v1`/`render-result.v1`. | R3 = the observability lineage plus the 06-26 and 07-12 forensics, bound to the existing render contracts. |

## 1. Your requirements, answered

**R1 — The research main agent runs GPT-6.1 Sol at medium effort.**
- Every research specialization runs on the immutable route `research-sol-medium-v1` = `openai/gpt-6.1-sol/medium`. That covers Markdown, PDF, and later a rendition preset if one is ever needed.
- The route is resolved **at admission** and recorded with the attempt.
- The Live guide stays on Gemini, because it is not a dsh agent. M02's six roles stay on `gpt-6-luna/high`.
- It is recorded as an owner route amendment (owner, date, spend ceilings), because Sol input costs about 20× luna's.
- Research gets a **dedicated OpenAI project/key with a provider-side hard budget**, as a second pi-ai provider row. This is both a spend backstop and native isolation.

**R2 — Caching, with provider and model swappable natively.** There are three layers:
1. Provider prompt caching through pi-ai, per route. This is configuration only (`cacheRetention`, compat), with no Sophia provider code.
2. Within-attempt prefix stability, engineered and tested: fixed sections and tools, no skill watching, no dynamic tools. Cross-attempt reuse is a hypothesis to measure.
3. The application's source-content cache: a stored re-read never pays twice.

Supporting this:
- Full usage truth: cache tokens plus compaction calls.
- A Sophia price table, so the cache hit rate and spend are measurable and the allowance is enforceable.
- **Swapping:**
  1. An owner amendment records provider, payer, data recipient, ceiling and cache policy.
  2. Davide creates the capped key in the provider console and enters it into the runtime host's secret store. Codex verifies presence only.
  3. A new immutable route id is added to the bundle's route allowlist.
  4. The registry points the specializations at that route.
  5. `pnpm artifacts:record`, then the gate.
  6. Codex cutover, with zero non-final bindings left on the old unit.

  Hot-swapping a running attempt is out of scope.

**R3 — The donor PDF path.**
- Port the observability-lineage kernel, its report contract, its checks and its truth invariants into a confined TypeScript renderer. Bind it to `sophia.render-job.v1` and `render-result.v1`.
- Do **not** port: `--no-sandbox`, guessed roots, lexical fallbacks, the pandoc fallback, or the Python graph.

**R4 — Extensible specialists.**
- One registry is the single source for composition, admission resolution and dispatch. Research is family #1; Markdown and PDF are specializations #1 and #2.
- New specializations follow a published **extension checklist**. Model-facing declarations stay static per guide version, by rule.

**R5 — Voice and text.**
- One server use case handles `startResearch`, `renderResearch` and amendments. Voice and typed chat both reach it through the Live tool handler (`inputMode` is voice or text).
- The text path gets proper notice delivery.
- Studio admission without a live session is **not** in default scope, because under the pack it would be a brief form. It is possible only via a recorded amendment.

**Delivery UI (added 2026-09-30).**
- A report card lets you download straight away or open the report in a side panel.
- The side panel enlarges to full page and back, reusing the same mounted viewer.
- Download is available from both the card and the viewer, and is always the exact version on screen.
- It mirrors dsh's native delivery card, sidebar and full-page model and its pinned pdf.js; Sophia adds the stored, versioned download that dsh leaves as a product decision. See §2.8 and the mockup canvas.
- **Knowledge is the permanent home of reports.** Each report has a "what it is" description. Each version records what changed and what carried over, checked against measured differences. A compare view shows version pairs, and a cross-project library has a project filter (§2.8.8).

**R6 — Codex coordination.**
- Protocol `sophia.dev-handoff.v1.1`, on a new SMC-M03 issue created after you authorize it.
- Codex handles hosted operations, deploys, hosted and paid tests, independent review, isolated test runs, audits and darwin identities.
- Approvals are bound to your direct instruction, never to a GitHub comment.
- Security details and live evidence stay private.

## 2. Architecture

### 2.1 Five layers kept separate (pack pass-2 §3.2)

| Layer | Lives in | Changes by |
|---|---|---|
| Host profile | the `sophia-runtime` profile (M02) | a runtime unit |
| Capability preset | preset rows `sophia-research-md-v1`, `sophia-research-pdf-v1` | a new preset id |
| Execution policy | the route id (provider, model, effort, compat, maxTokens) in the bundle's **route allowlist**; chosen at admission; recorded with the attempt | a new route id plus an amendment |
| Output profile | `md-report-v1`, `pdf-report-v1` (renderer, manifest schema, checks, repair budget, assets) | a new profile id |
| Task context | the admitted manifest (question, outputs, sources, mission revisions, allowance envelope) | each admission |

### 2.2 Specialist registry (R4)

**One source file.** `config/specialists.json` is validated by a schema. The bundle build copies it in, and `role-registry.ts` derives from it. The API loads it for admission resolution. The gate and a unit test enforce equality everywhere, so there is no second registry: `roles.json` keeps only the M02 roles, and `models.json` is generated or checked from the unit.

```jsonc
{
  "id": "sophia-research-pdf-v1", "family": "research", "task_kind": "research",
  "outputs": ["markdown", "pdf"],               // markdown always retained (source + partial)
  "route": "research-sol-medium-v1",            // must be in the unit's allowlist; no default fallback
  "native_tools": ["todo_write", "research_read_context", "research_search", "research_read_source",
                   "research_write_draft", "research_render_pdf", "research_inspect_output",
                   "research_submit_result", "research_report_blocker"],
  "prompt_sections": ["research-base.v1", "research-evidence.v1", "format-pdf.v1"],   // hashed assets
  "output_profile": "pdf-report-v1",
  "admission": { "required": ["question", "outputs"], "optional_preferences": ["depth", "source_constraints"] },
  "source_policy": "web-pilot-v1",              // 1 worker, 1 call at a time, ≤5 searches, ≤8 reads, …
  "continuation_owner": "sophia_episode",       // no native goal tools ⇒ steer/Hold/Resume reach it
  "workflow": false, "peer": false, "raw_host_shell": false
}
```

**dsh composition.**
- Presets move into separate patch files, using the list form of `dsh.bundle.patch`:
  - `presets/research-md.patch.yml`;
  - `presets/research-pdf.patch.yml`.
- `llm-pi-ai`, `agent-default-model` and the bridge row stay in `cordis.patch.yml`.
- A new `bundlePatchFiles()` helper feeds every place that assumes a single file today:
  - the gate;
  - `patch-lint`;
  - `artifacts.mjs`;
  - `verifyProfile`;
  - the composition-set check;
  - the package `files` list.
- Per-file lint still rejects empty files and duplicate ids.

**What each research preset mounts.** Only preset-scoped registrations:
- a research-base plugin: fixed-order `ctx.systemPrompt.section({order, text, interpolate:false})` from hashed assets, plus the research tools;
- a per-format output plugin.

**Global registrations** (the Tavily provider and the `web` row pin) live in one top-level bundle row. Placing them inside presets would throw `WEB_DUPLICATE_PROVIDER` when the second preset activates.

**Skill discovery.**
- Restate the `skill-filesystem` row with `includeDefaultRoots:false` and `watch:false`.
- Research roles get no `skill` tool.
- A test proves the research catalog contains only Sophia content.

**Gate and identity.**
- `checkPresetRoster` changes from "plugins must be `[]`" to a recorded expected-rows digest per preset.
- `presetIdentity` for new presets covers:
  - the preset rows;
  - the section asset hashes;
  - the tool policy.
- Changing the formula is safe because bindings are unit-scoped and cutover requires zero non-final bindings on the old unit.

**Other rules.**
- `sophia-research-v1` remains for history only; the registry forbids admitting it.
- Wire change (A11): `RuntimeCommand.payload` gains `route`, emitted **only on research creates**. The role pattern widens to `^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$`. Every other command stays byte-identical to 0020, and a SQL test proves it.

**Extension checklist** for a new specialization, for example an exec brief, a deck or a sheet:
1. Registry entry.
2. Preset patch file.
3. Output profile, plus a renderer if needed.
4. Route id: an existing one, or a new one with an amendment.
5. Contract amendment (outputs and kind).
6. Format migration, if the format is new.
7. Versioned guide asset (tool schema and capability text).
8. Recorded runtime unit.
9. Tests: route shape, preset digest, admission resolution, output checks.
10. Codex release batch.

### 2.3 Execution policy: route and cache (R1, R2)

```yaml
- id: llm-pi-ai
  config:
    providers:
      openai:                         # M02 route, unchanged (gpt-6-luna)
        apiKeyEnv: OPENAI_API_KEY
        api: openai-responses
        defaultMaxTokens: 128000
        models: [ {id: gpt-6-luna, …} ]
      openai-research:                # dedicated project/key with a provider-side hard budget (D1)
        apiKeyEnv: OPENAI_RESEARCH_API_KEY
        api: openai-responses
        baseURL: https://api.openai.com/v1
        defaultMaxTokens: 16000       # bounds worst-case reservation (~$0.16 output/request)
        # cacheRetention unset ⇒ "short": prompt_cache_key = session id; OpenAI implicit 30-min cache
        models:
          - id: gpt-6.1-sol           # values from pi-ai 0.99.2 catalog + OpenAI docs (absent from pinned 0.87.1)
            name: GPT-6.1 Sol
            contextWindow: 272000     # cheaper tier
            input: [text, image]
            reasoningEfforts: {low: low, medium: medium, high: high, xhigh: xhigh, max: max}   # no `off`
            compat: {supportsStrictMode: true, supportsLongCacheRetention: false}
- id: compaction-basic                # restated; research route compacts early so a compaction call fits one reservation
  config: { modelPolicies: [ {provider: openai-research, model: gpt-6.1-sol, thresholdRatio: 0.45} ], … }
- id: sophia-control-bridge
  config:
    routes:                           # the unit's route ALLOWLIST (immutable ids)
      default: agent-default-model
      research-sol-medium-v1: {provider: openai-research, model: gpt-6.1-sol, reasoningEffort: medium, maxTokens: 16000}
```

**Admission and dispatch.**
- Admission resolves the specialist's route and persists the full envelope in the admitted `context_manifests` row:
  - preset id and digest;
  - route id with the resolved provider, model and effort;
  - price-table version;
  - allowance envelope;
  - source-policy values.
- Dispatch sends `role` and `route`.
- The bridge parses its config strictly. `routeFor(command)` requires the route to be in the allowlist and servable; otherwise it raises a ProtocolError. **There is no fallback.** M02 roles map explicitly to `default`.
- The route checks on resume are unchanged, so an attempt never changes route.

**One global, prepended `llm/stream` listener** in the bridge. It sees every model call: turns, retries, workflow children and compaction.
- **Route guard:** the call must equal the owning attempt's recorded route. This closes the workflow `agent({provider, model})` escalation.
- **Reservation:** it awaits the reserve RPC (§2.5) before `next()`, and throws a typed error on denial or when the API is unreachable (fail closed).
- `agent/request` stays for route selection only.

**Gate checks.**
- `checkModelRoutes`: every allowlisted route, one check per adapter (`llm-pi-ai`, `llm-deepseek`).
- `checkSpecialistRoutes`: every registry route is in the allowlist, and the research specializations share one route unless amended.
- **Cache guard:** no `cacheRetention: long` unless every model on the route supports it, and hand-declared GPT-5.6+/6.x entries carry `supportsLongCacheRetention:false`.
- **maxTokens guard:** required on non-default routes.

**`runtime-unit.json`.**
- `model_route` stays as the default.
- It adds `model_routes`: route id → route, plus `decided` (owner, date, ceiling), `model_entry_source` and `live_verified:false`.
- The host scripts check the union of credential refs.

**Tests.**
- `mockRouteOverlay` restates the bridge row with every allowlisted route pointed at the mock. Rehearsals of research roles must reach the mock and never `openai-research`.
- A new `research-route-shape.test.mjs` asserts:
  - `model:gpt-6.1-sol`;
  - `reasoning:{effort:medium, summary:auto}`;
  - `include:[reasoning.encrypted_content]`;
  - every tool has `strict:false`;
  - `prompt_cache_key` = the session id;
  - no retention or options fields.
- The existing `request-shape.test.mjs` is untouched.
- Each wire protocol needs its own stub and expected shape. Adding Anthropic later means a new Messages stub.

**Cache layout.**
- The research base and evidence rules are fixed-order system sections, byte-identical across Markdown and PDF. Format additions sit at a higher order.
- Task data goes only in the user context or tool results (the M01 no-interpolation rule).
- The tool set is fixed per preset.
- Tests:
  - system and tools are byte-identical across turns 1..N of one attempt;
  - cross-attempt reuse is measured, as `cacheReadTokens>0` on turn 1 of a new attempt.

**Usage truth.**
- The bridge projects `assistant/message` **and `compaction/summary`** usage: input, output, cacheRead, cacheWrite, provider, model.
- It decides and records `assistant/attempt`.
- A migration adds cache columns and replaces the trigger, with a distinct `provider_call_id` per compaction.
- A Sophia price table, versioned in the unit, covers the cache-write rate and the 272K tier.
- Hit rate = cacheRead / (input + cacheRead + cacheWrite).

### 2.4 Admission from voice and text (R5)

```
voice ─┐ Gemini Live tool: start_research / render_research ─┐
text  ─┘ typed chat → same Live session (inputMode:text) ────┴→ POST /v1/media/tool-calls → TOOL_HANDLERS
   → apps/api/src/research.ts  startResearch()/renderResearch()        (one use case, API resolves specialist)
   → research gate (per pilot project: configured / authorized / healthy / enabled) + grant cap present
   → sophia.admit_research_task (one txn): pick an active READY runtime instance whose unit advertises
     this preset+route+digest; enforce one research worker; allowance record; goals/attempts/bindings
     (sophia_episode)/commands(exchangeId, inputEpoch)/jobs(kind=research)/outbox + manifest
   → worker dispatch (role+route from job) → bridge create(agentOptions)
```

**What comes from where.**
- **The model supplies:** `question`, `outputs`, source refs, focus refs, preferences, and `amendsTaskId` or `newRequest`.
- **The server derives everything else:** actor from the bridge speaker/`inputEpoch`, specialist, route, allowance, eligibility, and the record revision for rendition.
- Missing preferences become stated `assumptions[]`. Consequential missing scope or spend triggers one focused clarification.

**Admission shapes.**
- **Duplicates:** if a non-terminal research task from the same actor exists in this exchange, the call returns it as `existingTaskId`. A second task needs `amendsTaskId` or `newRequest:true` after the guide confirms. There is never dedupe onto a terminal task. After a cold start, in-flight tasks are surfaced to the model through `project_status`.
- **Amendment** (`amendsTaskId`): a new job and attempt under the same goal and allowance. Prior outputs are kept. Steer is only for in-flight course correction. Submitting on an already-succeeded job is defined and tested.
- **Rendition** (`render_research{sourceTaskId, outputs:['pdf']}`): the server resolves the retained record. It is binding-less: a render job only, with **zero** external calls, on the same allowance. Hold defers the claim, and Stop cancels the job. Phase mapping for binding-less jobs is defined.

**Receipts.**
- A receipt says `admitted`/`queued` until a running observation arrives. It never says "started".
- Failures are typed as `not_started:<code>` or `unconfirmed:<code>` and are never auto-retried.
- Denial stages are enumerated and content-free.
- The response uses `WHEN_IDLE` with `willContinue:false`.

**Guide asset v1.2.**
- It adds `start_research`, `render_research`, and a steer action on `control_work`.
- These are declared unconditionally; the prompt handles typed unavailability.
- It states that research text never authorizes a tool call, and that only the read tool or work card is authoritative for results.
- `GET /v1/media/tool-surface?guide=<id>` serves the matching name set, defaulting to v1.1. **The bridge rolls back before the API.**

**Delivery.**
- The notice is a **fixed server template** (kind, registry title, status, taskId), never web-derived text.
- It is generic by kind, and there is one narrator.
- Studio signals text mode to the bridge through a participant attribute. The bridge sends a new `notice` ChatReply kind to text-mode identities, and Studio renders it.
- Delivery is recorded per recipient class, as heard or delivered-as-text.
- Typed text containing reserved markers (`[Sophia…`, `[Project…`) is escaped or rejected.
- This needs an A09/A11 amendment.

**Result reading.**
- `jobs.result_source_id` points to a bounded summary/limitations text written by the submit transaction.
- A job → artifact-version link is added.
- `NativeTaskDetail.result.outputs[]` carries id, format, sha256, bytes and limitations, and usage is aggregated.
- `read_selected_source(taskId)` pages the summary and the Markdown through the byte store.
- `control_work` looks up tasks by id, removing the latest-50 limit.

### 2.5 Durable research, allowance, evidence and publication

**Runtime-operations surface (A11).** Routes `POST /v1/runtime/research/{context,reserve,settle,capture,draft,submit,render}`:
- authenticated like observations: runtime lease plus a binding check on attempt, native session and unit;
- idempotent by nativeSessionId plus the native tool-call id;
- fenced by authority epoch and goal status, so Hold and Stop apply;
- answered with typed errors.

Bytes flow host → API → store. **Storage credentials never live on the runtime host**, and buckets are provisioned outside `db/migrations`.

**Canonical tables only.**
- Work machinery for admission.
- `context_manifests` for the manifest.
- `ResearchRecord` as a versioned JSON `source_objects` row plus `source_dependencies`.
- Passages as `source_objects` plus one narrow **provenance** table.
- Outputs: one `artifacts` row per report, `artifact_versions` v1..vN, and `artifact_renditions` for PDF and other formats (§2.8.8).
- **Job cardinality:** one task job per attempt. Render and repair jobs are children linked by parent id, carrying no attempt or command id. Readers allowlist `kind IN ('draft_brief','research')`. SQL tests cover two jobs on one attempt and on one command.

**Allowance (M03 §8).**
- There is one allowance record per research lineage: original, amendments, rendition and repairs.
- The cap comes from a **grant table**, which also holds the gate state. **No cap means admission is refused.**
- Reservations happen before every source call (facade) and every model call (the `llm/stream` hook):
  - serialized per allowance with a row lock;
  - an idempotent reservation id per provider call;
  - states: `reserved` → `settled` from usage, or `uncertain` on abort or error until reconciled;
  - headroom kept for persisting a partial result.
- There is no reset on Resume, a new format or a new session.

**Turn-end rules** (CREATE OR REPLACE, dispatching by job kind):
- error, max-tokens or blocked → failed or partial, with a typed reason, and the reservation is released;
- completed without a submit → at most one bounded nudge, then failed with `no_result_submitted`, keeping the draft as a partial;
- the same authority-epoch withholding as 0016 applies.

**Revocation (T19)**, in one transaction:
- stop the dependent bindings through `native.stop` cleanup, so hello and resume never reload them;
- set a new attempt state (the CHECK is widened);
- extend `native_delivery_ineligible` to resume, steer and input, checking the attempt's consumed-source table;
- create the rebuilt attempt from the ResearchRecord minus the revoked passages, with explicit lineage, the same allowance and a goal-placement rule.

Tests: restart and Resume after a revocation.

**Completion.**
- It is an application transaction through `research_submit_result`, never the last assistant message. `capture_native_result` stays brief-only.
- The transaction verifies ownership, hashes, formats, source closure, checks and authority, then moves candidate → validated → stable.
- Upload and commit are reconciled with stable ids and a pending state.
- Stop and revocation fence late publication.

**Byte store** (D5) lands in S1. If S3 must run first, captures are capped at 256 KiB with the truncation declared.

### 2.6 Source access (G1)

**Tavily.**
- A typed `fetch` adapter implementing `WebSearchProvider` (the Exa plugin shape), registered from the top-level row.
- `available()` is false without a key, and the adapter never goes keyless.
- Pinned settings:
  - `include_answer:false`, `include_raw_content:false`, `include_images:false`;
  - `include_usage:true`;
  - `max_results` ≤ 5.
- Typed errors for 401/403/432/433/429/5xx.
- `searchWithReceipt()` preserves the request id, credits and score.
- The `web` row is restated with `searchProvider: tavily`.

**Jina Reader.** A Sophia `SourceReadResult` adapter.
- Refuses with no network I/O when the key is missing or empty, and always sends `Authorization`.
- `providerHttpStatus` = Jina's own status; `originHttpStatus` is unknown except for a parsed warning ≥400; `reportedFinalUrl` is unknown.
- Records `redirects: unverifiable (hosted extractor)` and a DNS-rebinding limitation on every read.
- Sends `Accept: application/json`, a fixed `X-Respond-With`, `X-No-Cache`/`DNT`, and an `X-Timeout` shorter than the local 30 s deadline.
- Never sends `X-Max-Tokens`, `X-Set-Cookie` or `X-Proxy-Url`.
- Reads errors from the response structure, never from body text.

**Eligibility (T07).**
- **Read targets are provenance-bound.** Tools accept a search-result id, an extracted-link id or an admitted input ref, never a free URL. Every read records its ref.
- Parsing uses the WHATWG parser, then a deny check after resolving A/AAAA. It covers:
  - IPv4-mapped, NAT64 and 6to4 embeddings;
  - fc00::/7, fe80::/10 and zone ids;
  - `.localhost`, `.local`, `.internal`, `.home.arpa` and single-label names;
  - wildcard-DNS names;
  - credentials in the URL, disallowed ports and signed URLs;
  - proxy, fetcher and shortener hosts, including r.jina.ai itself;
  - cross-project refs.
- **Never pre-fetch from Sophia infrastructure.**

**Prompt-injection containment.**
- Retrieved text sits in tool results inside a delimited data envelope that carries the source id.
- The research-base section states the rules.
- A facade query guard returns `disclosure_denied` when a query contains:
  - verbatim spans from private manifest sources;
  - roster names or emails;
  - secret-like strings.
- Injection fixtures cover:
  - a page telling the model to search for private text;
  - a page telling it to read an attacker URL;
  - a page telling it to claim completion;
  - a summary telling the guide to call a tool.

**PDF input (T14).** Unsupported in the pilot. PDF or binary sources are detected and returned with `coverage: unsupported|partial` and a stated limitation. The capability text says so.

**Paging and caching.**
- Paging continues beyond 4,096 characters (T05). The inline passage is at most 6,000 characters. Truncation is always declared.
- A stored re-read costs zero paid calls.
- Native `web_search`/`web_fetch` stay hidden.

### 2.7 PDF (G3): donor-inspired, confined, bound to the existing contracts

**Job flow.**
- `research_render_pdf` goes through the runtime surface.
- The API enqueues a child `jobs(kind='render')` with a `sophia.render-job.v1` payload.
- A **supervisor on the separately qualified renderer host** holds only a render-runner capability, for two API endpoints: claim the next job under a lease, and settle it.
- The API mints short-lived per-job signed URLs. The supervisor has no DATABASE_URL and no storage master key.
- The supervisor returns `sophia.render-result.v1`.
- The existing `extraction-manifest.json` and `dependency-closure.json` pins are reused.
- **The runtime host never launches Chromium.**

**Confinement.**
- The Chromium tree runs with an empty environment, in fresh user, network (loopback only), pid and mount namespaces (`unshare -Urnpm --fork` or bwrap).
- It gets its own tmpfs and cgroup/prlimit limits.
- `chromiumSandbox:true`, and there is no `--no-sandbox` anywhere.
- A startup self-test fails closed if Chromium's sandbox is not active.
- Cancelling kills the namespace init.

**Kernel port** into `renderers/web/pdf/` (flip the DESTINATION_MAP row). Keep from the donor kernel:
- playwright-core with `javaScriptEnabled:false`;
- deny-by-default `page.route`, with blocked or missing assets fatal;
- `emulateMedia('print')`;
- A4 with a page-number footer;
- an explicit `sourceRoot` plus a hashed asset manifest.

Add from the PNG kernel and the forensics:
- `data:`/`blob:` allowed for images only;
- an extension allowlist;
- a CDP overflow probe;
- URL-wrapping CSS;
- installed, licensed EN/IT/ES fonts plus glyph fixtures;
- a `lang` parameter.

**Report contract.**
- `report_manifest_v1` semantics are validated **before** rendering: section and visual ids, TOC anchors, visibility-aware word counts, count-aware visuals.
- `report.css` and the pdf-report SKILL patterns become output-profile assets.
- The receipt follows the render-result contract, plus: Chromium/playwright versions, output sha256 and size, the `%PDF-` header and a parse, page count, footer-stripped blank and short pages, the overflow list, and vector/raster counts.
- An unknown check does not pass.
- At most 1 semantic repair and 1 format repair, then a truthful failure.
- Markdown ready with the PDF failed is a partial, never a "fallback".

**Qualification and CI.**
- Codex probes a Render Docker private service with these **negative checks from the job context:**
  - public TCP fails;
  - DNS fails;
  - 169.254.169.254 fails;
  - the private API host fails;
  - the environment and secret files are unreadable.
- If the probe fails, Codex names an alternative with its price and data-recipient implications, for you to decide.
- CI adds an explicit user-namespace/AppArmor step, asserts the sandbox is active, and never adds a no-sandbox path.

**Scope.** Rendition = deterministic template only. A rendition preset is deferred until it is proven necessary.

### 2.8 Delivery UI: cards, side viewer, full page, downloads (Studio)

Mockup: the "Sophia Report Delivery" canvas. It has three artboards:
- an interactive Tasks page with the viewer;
- the room, with the report notice in the side chat;
- the phone viewer.

It is drawn in Studio's own language: dark-only, Geist and Geist Mono, 1px lines, radii 4/6/8/12, glass used only for floating bars, violet reserved for Sophia.

#### 2.8.1 What dsh provides natively, and what Sophia does with it

Studio is React 19 and talks to the Sophia API. dsh's web UI is React 18 Cordis plugins loaded by dsh's own module loader. So **Sophia mirrors dsh's behaviour and pins its libraries, but does not import its client packages.**

| Concern | Native in dsh rc.2 | Sophia |
|---|---|---|
| Declaring a deliverable | `present` tool: `files:[{path, description?}]`, recorded as a log-only `deliverables/presented` event; mutable path, no hash, no copy | **Not enabled in M03.** `research_submit_result` stays the authority; the pack says native `present` is evidence only. Its `outputs[]` mirrors `PresentedFile` (`path`, `description`) and adds `format`, `mime`, `sha256`, `bytes`, `version`. |
| Store, versions, download | **None, deliberately.** Upstream: "Neither a download endpoint nor a fallback copy remains; both require an explicit future product decision." `/api/file` has no `Content-Disposition`. | Built in the Sophia API (`artifacts`/`artifact_versions` plus the byte store). This fills a gap upstream left open on purpose, so it is **not** divergence. The response headers copy `/api/file`'s set (`private, no-store`, `nosniff`, sandbox CSP) and add `Content-Disposition`. |
| Delivery card | `ui-deliverables`: 60px row, 40px icon tile, basename plus description or extension; the whole card opens the preview; a trailing action slot; 2 columns, collapsing below 620px | Same anatomy. **Download sits in the trailing slot.** Hovering shows "Open". Spacing uses Studio tokens. |
| Side window and full page | `ui-sidebar-right`: push panel plus in-frame fullscreen **sharing one content tree (no remount)**; opens at 45% of the viewport, remembers width, caps at 70%, keeps 400px for the centre; below 768px it opens fullscreen | Same model in Studio's own `DocumentPane`. Full page is an in-frame mode of the same mounted viewer, so there is no PDF re-fetch and zoom/scroll are kept. The Fullscreen API is not used for this: iPhone Safari lacks it. |
| PDF preview | `ui-sidebar-documentpreview`: lazy `pdfjs-dist@6.3.289`; hardened options (`enableXfa:false`, `useWorkerFetch:false`, `stopAtErrors:true`); fit-width; zoom 25–400%; lazy pages with placeholders; text layer | **Same version and options**, canvas-per-page plus `TextLayerBuilder`. Additions: DPR ≤ 2, only visible pages ±1 rendered, canvases released off-screen, `pdf.destroy()` on close. The worker is a same-origin Vite asset (`new URL(…, import.meta.url)`). |
| Markdown preview | `ui-primitives` mdast→React: raw HTML literal, links limited to http/https/mailto, **remote images loaded** | Same parser set (`mdast-util-from-markdown@2.0.3`, `micromark-extension-gfm@3.0.0`, `mdast-util-gfm@3.1.0`) and the same policy. **One divergence:** remote images render as links, never `<img>`. The plan and Studio's CSP require this, and it prevents leaking the reader's IP. |

#### 2.8.2 Work card (download or open from the card)

**Where it lives.**
- A new `features/artifacts/WorkCard.tsx`. `GoalList` picks it for research tasks with a one-line branch; `TaskCard` (briefs) is untouched.
- The same `ArtifactActions` component renders the chat notice card in the room (S6).
- The deliverable is called a **Report**, because "Brief" is already both the side-panel tab and the old task card.

**Card anatomy.**
- **Header:** a status Tag, "asked by <name>, by voice / in the chat · time", and on the right the elapsed time and spend against the allowance ("6 min · $0.74 of $5.00").
- **Title:** the question itself.
- **One row per output.**
  - The PDF is primary; Markdown is its source and partial.
  - A row shows a 40px tile (PDF rose, MD teal), the filename, and a meta line (pages or words, size, version).
  - **The whole row opens the viewer** (hovering shows "Open"). A separate trailing **Download** button avoids nested buttons.
  - Rows sit side by side, and stack in a narrow container.
- **Footer:** "N sources" and "N limitations" text buttons that open the viewer on those tabs, plus the suggested next step, marked *suggested*, never *accepted*.

**States, always named in words:**
- Researching: a thin progress bar plus "3 of 8 reads · 2 of 5 searches", with Steer/Hold/Stop.
- Report ready.
- Partly delivered: Markdown ready, PDF not produced, with the truthful reason and "Try PDF again". That button is a zero-search rendition on the same allowance.
- Not produced.
- Held / Stopped.
- A partial is never labelled a "fallback".

#### 2.8.3 Side viewer (open in a side window)

**Ownership.** `DocumentPane` is owned by **`ProjectShell`** and reached through `DocumentViewerContext.open({versionId, format, tab})`, so it works on the Tasks page and in the room.

**Coexisting with #24's side chat.** One pane at a time: opening a report closes the chat/brief panel. The chat stays mounted, so drafts survive. In the room, the pane head gets a chat toggle to swap back.

**Size.**
- It opens at about 46% of the viewport (min 480px, max 720px), and can be resized from its left edge.
- The width is remembered per viewer (localStorage, wrapped in try/catch).
- It always leaves at least 400px for the conversation. Below that, and on phones (≤760px), it covers the page.

**Head.**
- A format tile, the title (ellipsis), and a mono meta line: format, version, pages or words, size, short sha256.
- **Download** (a pill with label; icon-only on phones).
- **Enlarge** (round; tip "F"), which swaps to **Back to side panel** in full mode.
- **Close** (round; tip "Esc").

**Tabs and format.**
- Underline tabs: **Document** and **Sources N**.
- On the right, a segmented **PDF | Markdown** switch when both exist.
- A limitations callout at the top of the document when there are any.

**PDF body.**
- Paper pages on `--void` with the sheet shadow, fit-width.
- A floating glass pager: ‹ n / N ›, − zoom +, "Fit width".
- Keyboard: arrows, PageUp/PageDown, Home, End.
- Links inside the PDF open a new tab with `noopener`; internal links move to the target page.

**Markdown body.**
- A 68ch reading measure at 15px/1.65.
- Tables in scroll wrappers.
- Citations as superscript links into the Sources tab.
- Code in plain `<pre>` (no Shiki in v1).

**Sources tab.** The provenance truth from §2.6:
- a "read in full" or "snippet only" tag per source;
- the retrieval route (Tavily snippet vs Jina extraction);
- "origin status unknown" where Jina read it;
- links out with `noopener`.

#### 2.8.4 Full page (enlarge)

- It is an **in-frame mode of the same pane**, following dsh's pattern: `position:fixed; inset: var(--topbar) 0 0; z-index:40`. That sits above the phone side panel (30) and below sheets (50), and the topbar stays visible.
- It adds a **lazy page rail** at ≥1024px (IntersectionObserver thumbnails, unlike the donor's eager 80) and a wider paper (max 780px). Markdown stays at 68ch, centred.
- **History:** each intent (open, enlarge) pushes one history entry, so Back steps down. `?report=<versionId>&view=full` makes it deep-linkable and lets a member open it in a new tab. This needs a small edit to `route.ts` to preserve that one parameter (L1, Luis).
- **Esc** steps down: full → side → closed.
- `f` toggles full page. The key is free today, and single-letter keys fire only when not typing.
- Transitions: `slide` 220ms to open, a 220ms scale-in to enlarge; none under reduced motion.

#### 2.8.5 Download (card and viewer), always the version on screen

**Bytes contract.** Reuse the pack's contract-only route `GET /api/v1/sources/{sourceId}/content` → `SourceContent{sourceId, sha256, mime, downloadUrl, expiresAt}` (each version's `source_id`). A11 extends it with `disposition=inline|attachment`.
- The API authorizes each read (project membership) and mints a private Supabase Storage signed URL with **TTL ≤ 300 s**.
- `download=<filename>` makes Storage send `Content-Disposition: attachment`.
- **Studio never stores URLs or paths.** Only `artifactVersionId` and `sourceId` live in state. This is the donor's durable-URL lesson: its 7-day URLs and ephemeral paths broke.

**Storage keys.**
- Content-addressed as `<project>/<artifactId>/<sha256>.<ext>`, and never overwritten (the CDN could serve stale bytes).
- Filenames look like `<title-slug>-<YYYY-MM-DD>[-vN].<ext>`. The hash appears in the viewer meta, not in the filename.

**Card download.** Fetch the signed attachment URL with the bearer token, then navigate the same tab to it. An attachment does not unload the page, and the page's bytes are never loaded.

**Viewer download.** Save **the bytes already loaded** as a Blob through `URL.createObjectURL` plus `<a download>`, which is same-origin so the filename holds.
- Before saving, SubtleCrypto checks their sha256 against the version record, so download = preview.
- A mismatch is a visible error, never a silent download.

A toast confirms "Downloading <filename> · <size>". Success fades after about 5 s (dsh timing); errors stay until retried.

**Optional, v1.1.** "Open in browser tab" for PDFs, using an inline signed URL, for native search and print. Safari needs a synchronous `window.open` in the click handler.

#### 2.8.6 Security, CSP and accessibility

**CSP (#28 is still report-only).**
- Keep `object-src 'none'` and `frame-src` at `'self'`: no native PDF embed and no framed blobs, so pdf.js on canvas is the in-app path.
- `worker-src 'self'` is enough with a same-origin worker.
- Use `useWasm:false` in v1 rather than adding `'wasm-unsafe-eval'`. Our Chromium-rendered PDFs use DCT/Flate; revisit if JPX images appear.
- Check `font-src data:` in report-only mode.
- Add the storage host to `connect-src` only if it differs from the configured Supabase project.
- Model-generated HTML is never served inline on any Sophia origin.

**Accessibility.**
- The pane is a non-modal `complementary` region labelled with the report title.
- Focus moves to its heading on open and returns to the opener on close.
- ARIA tabs, labelled icon buttons, status in words.
- 44px targets under `pointer: coarse`.
- Contrast: meta text is at least `--text-2`, never `--text-4`.

**Icons.** `download`, `expand` and `collapse` are appended to `packages/ui/src/Icon.tsx` in its 24-grid, 1.5-stroke style (L4).

#### 2.8.7 Files, budget and sequencing

**New files** (no conflict with Luis):
- `apps/studio/src/features/artifacts/{WorkCard,ArtifactActions,DocumentPane,MarkdownView,PdfView,SourcesList}.tsx`
- `…/{document-pane,markdown-view,download,work-card-view}.ts` plus tests
- a scoped `artifacts.css`
- `apps/studio/src/api/artifacts.ts`

**Small edits to Luis's files:**
- `ProjectShell.tsx`: provider plus pane.
- `StudioShell.tsx`: one pane at a time.
- `GoalList.tsx`: the card branch.
- `route.ts`: preserve `report`.
- `Icon.tsx`.
- `vercel.json`: CSP.
- `apps/studio/package.json`: pinned `pdfjs-dist@6.3.289` plus the three mdast/micromark packages. The lock is written by the main session only.

**Budget.**
- Target roughly 600–900 lines for the whole delivery UI.
- Explicitly excluded: annotations, co-review, voice page commands, decorative effects. That is where the donor's 13k-line viewer came from.

**Sequencing.**
- This work lands after Luis's #24/#30 are merged, or rebased with him.
- **Migrations now start at 0022, and the contract amendment is A11**, because Luis's #30 ships `0021_personal_space.sql` and `A10-personal-space.json`. The order is agreed on the M03 issue; if #30 lands later, the numbers are re-reserved.

#### 2.8.8 Knowledge: where reports live, with descriptions, versions and projects

**Placement.**
- Tasks shows the work in progress. Its card links "Kept in Knowledge as vN".
- **Knowledge is the permanent home**, in the project view `/p/<id>/knowledge`, which today is S1-08's "Coming" placeholder.
- Knowledge is a **projection over the canonical artifacts**. It is not a new store (CONTRACT_BINDINGS §2).
- M03 turns on only the **Reports** tab. The Sources and Decisions tabs appear once S1-08 supplies their data. Nothing pretends to work (the PendingView rule).

**Model: one report, many versions, several renditions.**
- An `artifacts` row is one report. It supersedes "one artifact per format" in §2.5.
- `artifact_versions` holds v1..vN, linked by `parent_id`. Each version's authored source is the Markdown.
- A narrow `artifact_renditions(version_id, format, source_id, sha256, bytes, mime, pages|words)` holds the PDF, and later other formats.
- A version that only adds a rendition is still a version. Example from the mockup: "Adds the PDF that could not be produced in v1".

**Descriptions.**
- **What it is** (`artifacts.summary`, at most 240 characters):
  - Written by the research worker in `research_submit_result` at v1.
  - Members can edit it, with attribution ("Written by Sophia · edited by Davide, 1 Oct") and a revision.
  - A later version proposes a new description only when the question or scope changed.
- **Per version:**
  - `change_note`, "What changed": at most 200 characters.
  - `retained_note`, "Carried over": at most 200 characters.
  - `trigger`: who asked, how (voice, chat or Tasks), and why, linking a mission decision where one exists. For example: "Asked after the team decided to drop Fly Machines (decision recorded 1 Oct)".
  - A **server-computed `change_facts`** record, built deterministically from the stored versions and the ResearchRecord:
    - sections added, revised, removed and unchanged, found by heading anchors;
    - findings new, revised, withdrawn and kept, by claim id;
    - sources added, dropped and kept, including a snippet upgraded to a full read;
    - whether the conclusion or recommendation changed, by section role;
    - renditions added or removed;
    - new external calls made;
    - cost.
- **The chips are generated from `change_facts`, never from prose.** Examples: "3 sections revised", "1 table row removed", "Conclusion unchanged", "No new searches".

**Truth gate on the notes.** The notes are written by the model but must agree with `change_facts`:
- a claim of "conclusion unchanged" is rejected when the facts say it changed;
- a named section must exist in the diff;
- a claim of "kept" must not name a removed section.

The model gets one repair. If it still fails, the notes fall back to a deterministic template such as "3 sections revised: Summary, Hosts compared, Recommendation. 5 unchanged." A note is never blank and never contradicts the facts.

**Compare view.**
- A section-level diff of the stored Markdown of two versions, split by heading anchors with whitespace normalized.
- Revised sections get a sentence and word diff: `<del>` on the left, `<ins>` on the right, never color alone.
- Unchanged sections fold into one line: "5 sections unchanged: …, Show".
- Consecutive pairs are computed at publish and cached as a derived, content-addressed source. Other pairs (for example v1→v3) are computed on request.
- Rendition-only changes appear as their own row.

**Viewer integration.**
- The pane head gets a version selector (v1 | v2 | v3).
- A "What changed" strip shows the version's note.
- **Highlight changes since the previous version** marks inserted text in the reading view.
- A "Compare with vN-1" link opens the compare view.

**Projects: finding reports when there are many.**
- Project Knowledge shows that project. A **This project | All projects** switch lists reports from **every project the viewer is a member of**.
- The list has:
  - a project filter with counts;
  - a format filter (any, with a PDF, Markdown only);
  - search over title, what-it-is, question and change notes (Postgres full-text search on those fields only in M03, not report bodies);
  - most-recently-updated first.
- Cards carry a project chip, and the detail breadcrumb names the project.
- The cross-project library's canonical place is Luis's Work place (#30, `/work`). The in-project switch opens it with the project preselected (L6).

**Authorization.**
- The list query joins memberships server-side and follows `members_read` per project.
- Counts cover only readable projects, and project names never leak from projects you are not in.
- Guests never get the cross-project scope.
- Downloads and compare re-check access per project.

**API (A11).**
- `GET /api/v1/knowledge/reports?project=<id>|all&format=&q=&cursor=` returns cards: `{artifactId, projectId, projectName, title, summary, summaryAuthor, currentVersion, versionCount, updatedAt, formats, sourceCounts, missionRef, latestChange{note, retained, chips}}`.
- `GET /api/v1/artifacts/{id}/versions` (contract-only today) is extended with notes, facts, trigger and renditions.
- `GET /api/v1/artifacts/{id}/compare?from=&to=`.
- `PATCH /api/v1/artifacts/{id}/summary`: a member edit, revisioned, with an expected revision.

**Tests.**
- A note contradicting the facts is rejected, and the template fallback is used.
- Deterministic diff fixtures: revised, added, removed and unchanged sections, and a rendition-only version.
- The summary edit is attributed and conflicts on a stale revision.
- **Cross-project isolation:** a member of project A sees no names, counts or cards from project B.
- Filter counts are correct, and search covers only the declared fields.
- v1-only cards show no "Carried over" line.
- The compare view folds unchanged sections, and the highlight toggle works.
- Keyboard and screen-reader semantics for `<ins>`/`<del>`.

**Slices.**
- **S1:** `artifact_renditions`, the summary, note and facts columns, and the read API skeleton.
- **S4:** notes and `change_facts` at publish, the truth gate, and the Knowledge UI: list, report page and timeline, compare, and the pane's version selector and highlighting.
- **Cross-project library:** lands with Luis's Work place (#30), in S7 or right after #30 merges.

### 2.9 Gates, compatibility and rollback (T22, U-T21, G5)

**Gates** are separate from readers: research admission per pilot project, and PDF separately. Each has the states configured, authorized, healthy and enabled, with typed `capability_unavailable` reasons.

**Compatibility matrix.** Covers each service (API, bridge, Studio, worker, runtime unit), including rows for the s1-03 and m02 bridges.

**Rollback.**
- Rollback happens only to targets listed in that matrix, and the bridge rolls back before the API.
- A runtime rollback turns the gate off before the token swap.
- A runtime_instances row-state table records which rows stay active or are revoked.

**What never happens.**
- There is never a Hold across a unit change. Old-unit research is finished or Stopped, then reconstructed through the T19 path if needed.
- No destructive down-migrations.
- The brief readers are kept.

### 2.10 Observability, prompts and evaluation

**Observability.**
- A per-attempt stage ledger: selected, executed, admitted, queued, dispatched, running, submitted, published, announced.
- Content-free denial codes.
- Diagnostics `TASK_SUMMARIES` codes for research.
- The new functions added to `/ready` REQUIRED_SCHEMA.
- Usage, cache hit rate and cost per task, in the existing diagnostics.

**Prompts.** The research-base section, the evidence rules and the format additions are authored from the pack candidates (`RESEARCH_PROMPTS.md`, `research-evidence.v1.md`, `research-system-and-formats.v1.md`), each versioned with a manifest and hashes, with M01-style loading tests.

**Evaluation set.** 12 fixed research questions across EN/IT/ES. They cover:
- a fresh-news question;
- a stable fact;
- a contradiction;
- a PDF source;
- a private-source refusal;
- an injection page;
- a long table or URL;
- a rendition.

The set runs:
- offline, against recorded Tavily/Jina fixtures and the mock model, on every change;
- as one small paid live batch under the qualification ceiling (Codex).

Metrics: unsupported claims, citation closure, coverage honesty, cost, cache hit rate, latency.

## 3. Cost model (estimate; Codex replaces it with measured values)

**Pricing:** `gpt-6.1-sol` costs $2/M input, $0.10/M cached input, $2.50/M cache write and $10/M output.

**Assumptions:**
- about 15 turns per task (5 searches, 8 reads, drafting, submit);
- context growing from about 8K to 30K tokens;
- reasoning at medium effort.

| Task | With caching | Without |
|---|---|---|
| Markdown | ≈ $0.40–0.80 | ≈ $0.80–1.50 |
| PDF (+ authoring, render, inspect, ≤2 repairs) | ≈ $0.60–1.20 | ≈ $1.20–2.20 |
| Tavily (5 basic searches) + Jina (8 reads) | ≈ $0.05 | |

**Ceilings (D1, decided):**
- **per task: $5**, so a task that lands slightly above $3 finishes instead of being wasted. The allowance still keeps headroom, so a task that does reach the cap saves a useful partial result rather than losing the work;
- **qualification: $40** (about 25 tasks including failures);
- matching hard budgets on the provider-side research key.

Reasoning-token volume at medium effort is the biggest unknown.

## 4. Slices: one PR `claude/smc-m03-research`, staged commits

**Branch.** Base `main` at `41ac3e7`. Draft PR `claude/smc-m03-research` → `main`. After any later merge into `main`, merge `main` in; never rebase.

**"M02 seam frozen"** is satisfied by the #29 merge (`41ac3e7`). Any later runtime-file change on `main` is coordinated on the M03 issue.

**Single-writer rule.**
- The main session is the only writer of migrations, the A11 contract and generated files, and `pnpm-lock.yaml`.
- Parallel subagents work in separate worktrees on disjoint paths and hand back patches:
  - the renderer package;
  - the Tavily/Jina adapters;
  - the Studio viewers.

| Slice | Content | Depends on |
|---|---|---|
| **S0 Bind** | branch; `docs/progress/SMC-M03.md` and `SMC-M03-contract-binding.md` (every tool → runtime route → SQL; migrations reserved from **0022** and amendment **A11** (#30 ships 0021 and A10); cross-linked on #26/#29); MISSION_STATE copy; handoff file; coordination issue once you authorize it; CC-0001 inspect_request | your go-ahead |
| **S1 Readers + byte store** | migration: `markdown` format; kind-**allowlist** views and `media_assignments`; job parent link; job→artifact link; usage cache columns; grant/gate table; byte-store tables. A11 part 1: kinds, `outputs[]`, markdown, role pattern and `route`, tool-surface `?guide`, `notice` ChatReply. Persistence: `readArtifacts`, snapshot refusal removed, `readNativeTask` by id. **Bridge:** kind-tolerant parsing (unknown kinds deferred per entry) and a kind-generic notice template. Studio: kind-tolerant parsers, `WorkCard` shell (states and rows, read-only), the three new icons. Diagnostics codes; `/ready` | S0 |
| **S2 Registry + execution policy** | specialists.json; preset files; research-base and output plugins; route allowlist; `routeFor`; the `llm/stream` route-guard and reservation hook; `openai-research` provider plus the Sol entry; compaction policy; gate generalization (bundlePatchFiles, routes, cache and maxTokens guards); skill-filesystem closure; usage and compaction forwarding; mock overlay; route-shape test; unit `sophia-runtime-m03-dev` | M02 seam frozen |
| **S3 Source access (G1)** | Tavily; Jina; provenance-bound eligibility and the resolver deny check; injection envelope and query guard; capture, paging and cache; provenance table; reservation service; PDF-source detection; 17+ conformance cases | S1 |
| **S4 Durable Markdown (G2)** | runtime-operations routes; admission SQL (ready-instance selection, one worker, dedupe, amendment) and `startResearch`; dispatch by kind (other commands byte-identical); research tools made real; ResearchRecord; allowance; turn-end rules; revocation; submit/publish transaction; prompt assets v1; offline eval set. **Delivery UI:** `DocumentPane` (side and full page, history, Esc/F), `MarkdownView`, Sources tab, `GET /sources/{id}/content` with signed URLs, card and viewer downloads with the hash check | S1–S3 |
| **S5a Renderer package** | kernel port; namespace-confined launcher; supervisor with the render-runner capability; render-job/-result binding; checks; fixtures; real-Chromium CI with the sandbox asserted | — (runs in parallel, early) |
| **S5b PDF (G3)** | PDF preset; report contract; repair loop; `PdfView` (pdfjs 6.3.289, lazy pages, pager/zoom, text layer), page rail in full page, CSP verification in report-only; binding-less `render_research` ("Try PDF again") | S4, S5a, host qualified |
| **S6 Voice + text (G4)** | guide v1.2 plus the version-aware surface; handlers; text-mode signal and notice delivery with the chat **report notice card** (Open / Download / Markdown);  marker escaping; steer; controls; EN/IT/ES commissioning | S4 |
| **S7 Mission loop + release (G5)** | link results to the mission question/expectation; suggested vs accepted next step; compatibility matrix; release batches; hosted two-person episode; measurements; closure handoff | all |

**First three commits:**
1. `docs(smc-m03): contract binding, progress record, mission state`.
2. `feat(schema): markdown format, kind-allowlisted task readers, job lineage, usage cache columns (0022)` together with A11 part 1 and regenerated contracts.
3. `feat(readers): kind-tolerant bridge assignments, Studio work card and safe Markdown view, snapshot artifacts`.

**Definition of done for every slice:**
- `pnpm check` green, plus `test:sql`/`test:db` on PG16 for schema work;
- SOURCE_MAP and DESTINATION_MAP updated;
- lock changes and `pnpm artifacts:record` in the same commit;
- the handoff updated;
- an internal multi-lens review;
- a Codex review support_request.

## 5. Release order (Codex operations, each with your bound approval)

**Step 0.** M02 OP-0003 is verified: step-A Stops settled, and **zero non-final s1-03 bindings**. (Alternatively, Codex re-prepares G5 on a candidate that already includes the M03 readers.)

1. **OP-A: schema.** Append-only and readers-compatible, with a PG 17.6 rehearsal.
2. **OP-B: readers.** API + bridge + Studio, in the order the compatibility matrix gives.
3. **OP-C: provider keys and renderer host.**
   - Davide creates capped keys in the provider consoles and enters them into the runtime host's secret store only.
   - Codex verifies presence booleans.
   - The renderer probe runs, including the negative checks.
4. **OP-D: runtime unit `sophia-runtime-m03-dev`.** Gate off → drain → register the capability → confirm no overlap on the runtime home → deploy → check that ready lists the research presets and route → gate stays off.
5. **Enable research admission** for the pilot project, voice and typed together.
6. **OP-E:** a capped live qualification run, followed by a two-person episode.
7. **PDF admission,** after the renderer qualifies.

## 6. Test mapping

| Slice | IDs |
|---|---|
| S1 | T10, T11 (reader side), T22 (readers); old-bridge/new-API and new-bridge/old-API compatibility; brief dispatch byte-identical |
| S2 | U-T08, U-T12–U-T15; M02-T08/T09 (spill for research); route shape; `llm/stream` guard and compaction reservation; mock rehearsal; cache and maxTokens guards; compaction usage row |
| S3 | T02, T04 (both keyless guards), T05, T06, T07 (provenance, resolver, IPv6, proxies, cross-project, injection fixtures), T08 (source side), T09, T14, R-T07, R-T08, R-T09, 17+ conformance cases, RA-01 (denied private source, unavailable source) |
| S4 | T01 (source-only synthesis), T03 core (active-work dedupe, amendment, retry after failure), T08 (model side, exactly-at-cap), T11, T12 (Markdown), T17, T18, T19 (restart and Resume after revocation), R-T01, R-T22, RA-01 idempotent retry, RA-04 restart with pending input, each turn-end rule |
| S4 UI | download = preview (hash check, mismatch surfaced), signed URL TTL and disposition, Esc steps full→side→closed, focus return, one pane at a time with the #24 chat, phone cover ≤760px, reduced motion, old Studio + research kinds |
| S5a/S5b | T12, T13 (namespace negatives), T21 (glyphs; small screen, zoom and dock for the viewer), CSP report-only clean with the pdf worker, RA-02 (non-ASCII, long table/URL, missing asset, path escape, unavailable measurement, cancelled render), renderer final proof, binding-less rendition Hold/Stop |
| S6 | T03 (voice, typed, cold reconnect and rephrase, parallel calls), T15, T16 (all-text and mixed rooms, old Studio), T17 steer, R-T17, RA-03, notice-spoof test, EN/IT/ES |
| S7 | T20, MCG-04, T21, T22 plus U-T21 rollback, U-T20 two-person episode, measurements |

## 7. Codex coordination (R6)

**The issue.**
- Titled "SMC-M03 coordination", created only after you authorize it (D10).
- One channel: PRs carry only one-line wake pointers.
- IDs `SMC-M03-CC/CX/OP-0001…`, using strict v1.1 kinds.
- Reservations are cross-linked on #26/#29.

**Two Codex roles.**
- **Operator Codex:** your local session with Render/Vercel/Supabase. It performs every hosted effect and keeps a private journal. Only one operator at a time.
- **Cloud `@codex review`:** static review only; no `@codex` task runs.

**Authority.**
- A wake one-liner is not an approval.
- Every `execution_request` carries an `approval_ref` to your direct instruction in the operator session, bound to:
  - the candidate commit;
  - the migration hashes;
  - the config keys;
  - the services;
  - the ceiling.
- Batch approvals are fine.

**Hygiene.**
- Security findings against deployed services go to the private store. Publicly: id, severity and fixed status only.
- Conformance and episode evidence stays private, referenced by hash.
- Keys never go through chat.

**Codex source changes** go only on `codex/*` branches with a listed path set, and Claude integrates them. **Luis** is the integration reviewer.

**Delegated to Codex:**
- CC-0001 read-only inspect: deploy tuple, schema ledger, OP-0003 state, key presence booleans, Render plans/Docker/disk/private network, storage, Studio headers.
- The renderer probe (live qualification, under a cap).
- Provider conformance live runs.
- **The Sol live checklist,** in this order:
  1. tools with optional params and `strict:false` are accepted;
  2. `cached_tokens>0` on turn ≥2;
  3. `cache_write_tokens` is reported;
  4. a negative-control 400 on `prompt_cache_retention`;
  5. the real context limit.
- The PG 17.6 rehearsal.
- darwin-arm64 identities.
- Isolated test runs.
- Independent security review at each G checkpoint: SSRF, renderer escape, reservation and publication races, injection.
- Donor and upstream audits, and log diagnosis.
- OP-A…E.

**Kept by Claude:** all M03 source, migrations, contracts, tests, local disposable Postgres, the binding, progress and handoffs, drafting execution requests, interpreting evidence, and the PR and its review fixes.

## 8. Decisions (all decided 2026-09-30)

| # | Decision | Recommendation |
|---|---|---|
| **D1** ✅ | R1 route amendment: research on `gpt-6.1-sol/medium` (Markdown + PDF) through a dedicated OpenAI research key/project with a provider-side hard budget; **$5 per task**, $40 for qualification; other dsh roles unchanged | Decided |
| **D2** ✅ | Declare Sol by hand on the pinned pi-ai 0.87.1 now, with values from 0.99.2 (the alternative is waiting for a dsh release on ≥0.99) | Declare now |
| **D3** ✅ | Target `main` (#29 merged at `41ac3e7`); OP-0003 verification comes before any M03 hosted step | Decided |
| **D4** ✅ | Text scope: typed chat in the Live session only. A Studio control without a live session needs a pack amendment. | Typed chat only |
| **D5** ✅ | Byte store: private Supabase Storage (the pack's direction; server-only credentials, API-minted signed URLs) or capped Postgres bytes | Supabase Storage |
| **D6** ✅ | Renderer host: approve Codex's Render Docker probe under a small cap. If it fails, choose between the named alternative and keeping PDF gated. | Probe first |
| **D7** ✅ | Approve Tavily and Jina as data recipients; you create capped keys | Needed before G1 live runs |
| **D8** ✅ | Guide v1.2 adding `start_research`, `render_research` and steer | Yes |
| **D9** ✅ | Context capped at 272K (cheaper tier) and early compaction for research | Yes |
| **D10** ✅ | Authorize creating the SMC-M03 coordination issue | Yes |

### 8.1 Delivery-UI decisions (proposed; Luis reviews)

| # | Decision | Recommendation |
|---|---|---|
| **L1** | Deep link for an open report: preserve `?report=<versionId>&view=full` in `route.ts` (a small edit in #30's file) so Back, deep links and new-tab open work | Yes |
| **L2** | One pane at a time in the room (the report replaces the chat panel, with a chat toggle in its head), rather than side by side at ≥1440px | One at a time for v1 |
| **L3** | Report pane resizable from its left edge, width remembered per viewer (#24's panel is fixed at 380px) | Yes |
| **L4** | Append `download`, `expand` and `collapse` to `packages/ui` Icon.tsx | Yes |
| **L5** | CSP (#28): keep `object-src 'none'`/`frame-src 'self'`, `useWasm:false` instead of `'wasm-unsafe-eval'`, verify in report-only before enforcing | Yes |
| **U1** | "Open in browser tab" (native PDF search and print) in v1, or v1.1 | v1.1 |
| **U2** ✅ | Version selector in the viewer head plus the Knowledge timeline (your 1 Oct direction) | Superseded: selector and timeline in M03 |
| **L6** ✅ | The cross-project library lives in the Work place (#30, `/work`); project Knowledge gets a This project / All projects switch that opens it with the project preselected | Yes |
| **U3** ✅ | Members can edit a report's "what it is" description, with attribution and a revision | Yes |
| **U4** ✅ | Compare consecutive versions at publish; any pair computed on request | Yes |

## 9. Risks

1. **OP-0003 is complete and verified** ([CX-0015](https://github.com/davidelaverga/Sophia/pull/29#issuecomment-5921358520)); this risk is closed.
2. **The renderer host may not qualify.** PDF would slip; Markdown still ships.
3. **Sol's strict-mode and cache behaviour on the pinned pi-ai are unverified live** until Codex's checklist runs.
4. **Spend.** Sol costs about 20× luna. This is mitigated by the `llm/stream` reservation, the dedicated capped key and early compaction.
5. **Three strict-parser surfaces plus coupling to the guide surface.** Mitigated by the readers-first batch, `?guide` and the rollback order.
6. **Coordination latency.** Each round trip needs you to wake the other side.
7. **Plan size.** This is one large PR. The staged commits and G checkpoints keep review tractable; a serious finding can become a small corrective PR.
