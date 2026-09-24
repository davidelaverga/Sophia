# DeepSeek Harness: from the upstream repository to Sophia's runtime

**Initial implementation pin:** `46a7f68b0922371ce7144b668b90e377d8e799f4` / `0.1.7-rc.1`. **Sources:** DSH-01–DSH-20.

## 1. Start with the real application structure

The upstream root is a pnpm workspace. Its package manifest declares pnpm 11.7.0 and supports Node `^22.19.0 || >=24`; Sophia selects Node 24. Inspect `package.json`, `docs/architecture.md`, `packages/boot/app-boot/README.md` and `packages/bundle/base/cordis.patch.yml` before creating our wrapper.

A profile names an ordered composition in `$DSH_HOME/profiles/<name>/`. A bundle contributes patch rows plus executable plugins. Profiles stack bundles, then apply profile, home and command-line patches. A config replacement replaces the entire target row's `config`, not selected nested keys. [DSH-01–DSH-05]

**Decision:** use `dsh-base` followed by `@sophia/dsh-bundle`, with profile name `sophia-runtime`. Do not install the dsh web UI, the one-shot headless runner, or the stock SDK server into this composition. Our control-bridge plugin keeps the runtime connected and creates/resumes the appropriate agents.

The execution-host supervisor launches the official `dsh --profile sophia-runtime`. It manages a child process, not a replacement Cordis root. Development builds may use the upstream source checkout to produce the pinned runtime artifact. Production launches the frozen artifact and plugin package from the same release unit; no `npx ...@latest` boot.

## 2. Bootstrap sequence

**S1-01 repository preparation:** create the new monorepo and a source checkout of upstream at the pin. Keep the upstream checkout read-only except for local build output; do not merge its source into Sophia's application tree. Record source SHA, package version, Node/pnpm versions and produced artifact digests.

**S1-03 profile installation:** package `@sophia/dsh-bundle` with its `dsh.bundle.patch` manifest and compiled plugin exports. Generate the named profile using the supported profile structure, with the two ordered bundles and a literal empty `[]` local patch before further configuration. The snippets in `config/` illustrate source-grounded shapes but are not a successfully installed runtime.

**S1-03 boot and handshake:** launch the official binary with an explicit project home, no inherited personal home and a sanitized environment. The bundle opens an outbound authenticated connection to the Sophia service, bound to runtime unit, project, lease and epoch. It reports only ready after required services and policy listeners are registered. A loader warning/skipped plugin is not successful readiness.

**S1-03 lifecycle proof:** create one native session, admit a prompt, stream real output, steer at a step boundary, cancel an active tool, restart and recover the recorded obligations. The proof must test the actual bridge, not only the upstream SDK example.

## 3. Why the stock SDK is not our control plane

The inspected TypeScript SDK is useful for ordinary programmatic runs. Its protocol exposes `initialize`, `session/prompt` and `shutdown`; it does not expose mid-turn session cancellation. Closing the owning client abandons the runtime, and `run()` waits for idleness rather than identifying one uniquely attributed command's completion. [DSH-06, DSH-07]

Sophia needs independent work, Hold/Stop, attributed steering, periodic reviews and recovery. We therefore implement a small Cordis bridge over the public Agent interface rather than pretending the SDK supplies those operations. This is a new transport adapter; it does not replace the native loop, tool pipeline, history or compaction.

## 4. Map product actions to actual public APIs

| Sophia action | Native mechanism | Additional Sophia obligation |
|---|---|---|
| Create native role session | `ctx.agents.create(...)`, `setup(agentCtx, agent)` | Bind project/work/attempt/role revision; install only scoped tools |
| Resume a session | `ctx.agents.resume(...)` | Match runtime/preset compatibility and recheck current eligibility |
| Start queued work | Agent queued input / `followup(...)` | Persist command before delivery; identify the current attempt |
| Steer work | `agent.steer(...)` / next-step input | Capture command identity, source revision and input receipt; check later incorporation |
| Supply passive context | `agent.inject(...)` | Does not wake by itself; use only current eligible context |
| Hold | Set local/domain hold fences, disable continuation, then `agent.cancel(cause, {keepInbox:true})` | A pre-step guard rejects execution while held; retained pending input cannot restart itself |
| Stop | Fence the work epoch, cancel active work, settle and dispose the owned Agent handle | Retire pending domain delivery, stop associated jobs, block publication and never automatically resume the stopped native session |
| Change supported configuration while idle | `agent.runMaintenance(...)` | Record next role/config revision; preserve outstanding obligations |
| Release native agent | owned `AgentHandle.dispose()` | Observe settled/unknown results before releasing project lease |

Native `cancel` is not a persistent Hold/Stop latch: with no active activity it is a no-op, and waking input can run after active cancellation settles. Therefore the bridge installs the current work-state guard at `agent/pre-step`, disables its continuation while held/stopped, and checks effectful tools before execution. Set these fences before cancellation. Explicit Resume clears only a valid Hold after reconciliation; stopped work needs a newly admitted continuation and context, not a delayed wake on the retired handle.

These API names come from the public core contract and source. Use the exact exported argument types at the pinned revision, not locally invented overloads. `whenIdle()` is an observation, not a command receipt. [DSH-08–DSH-10]

## 5. Durable admission and the native log

Sophia's Postgres transaction owns admission before dispatch. dsh owns its session history and inbox projection. The two stores are not one transaction. The bridge therefore records command IDs and native correlation, checks for prior delivery during reconnect, and uses idempotent domain tools for effects. It must not advertise cross-store exactly-once execution.

The actual checkpoint policy calls `agent.session.runtime.checkpoint()` before steps and before tool execution. Retain this plugin. The adapter flushes native pending state before acknowledging durable native delivery, and its integration test establishes that the selected message identity survives the actual inbox/log projection. Store external command correlation in a dedicated session extension event and reconcile it with the pending inbox and durable history; do not infer receipt from an output sentence. [DSH-11]

Normalize durable `session/event` records using `(runtime unit, session ID, native seq)`. Send transient stream chunks only to the live UI path, with a clearly transient classification. A model chunk is not yet a settled assistant message. Reconnection rebuilds from durable observations and accepted product state, not a lossy narration log. [DSH-02]

## 6. Precisely change the base composition

| Base area | Decision |
|---|---|
| `agent`, `agent-loop`, `session`, JSONL persistence, projection and checkpoint policy | Retain; no parallel Sophia loop/history implementation |
| `llm-deepseek`, `llm-pi-ai`, retry, credentials seam | Retain configured server API-key references; no consumer OAuth discovery in the project container |
| `session-log-deepseek`, `plugin-package-inventory-deepseek`, `session-telemetry-otel` | Disable these rows; also set `DSH_TELEMETRY_DISABLED=1`; prove outbound requests do not include the disabled extensions |
| `hmr` | Disable in the shipped profile; upgrade at a release-unit boundary |
| Model-facing plugin management/config editing/account sign-in | Do not offer these tools to product roles; composition is operator-owned |
| Base shell/filesystem tools | Do not expose host execution to guide/lead. Prototype role uses project-workspace tools against isolated build containers |
| Goals and goal driver | Available for bounded native worker continuation; disabled for the technical lead's periodic review session |
| Native team package | Use for in-process dsh peers; no assertion that it provides cross-owner distributed tenancy |
| PTC Node/workflow runtime | Use for bounded research/native task composition under an enforced sandbox; not as durable job scheduler |
| Web search/fetch | Use a scoped Sophia source tool for Google-grounded lookup and exact fetch, rather than unreviewed global provider defaults |
| Compaction, spill and image-offload infrastructure | Retain native mechanisms; connect offloaded objects to our retention/eligibility accounting |

`DSH_TELEMETRY_DISABLED` is treated as a disable switch; do not set it to the string `false` and assume telemetry remains enabled. The DeepSeek adapter's session-log and inventory extensions are distinct from model input, which is exactly why they need explicit disabling rather than a prompt rule. [DSH-04, DSH-14]

## 7. Roles are scoped configurations, not personas fighting for the room

Define versioned roles `sophia-guide-v1`, `sophia-lead-v1`, `sophia-research-v1`, `sophia-prototype-v1` and `sophia-review-v1`. Preserve stable Sophia identity/voice in common prompt material; mount task procedures and tools in each agent's scope.

The guide can read current project state, search eligible sources, start bounded creative work, ask the technical lead and submit a user-backed intent. It cannot accept a goal on its own authority. The lead can propose a roadmap, compile briefs, allocate admitted resources, inspect evidence and request interventions. It cannot approve another person's login or expand a budget. Research/prototype workers only receive the relevant ContextPacket. Review is read-only over the exact candidate and its evidence.

Use the preset registry and create-time scoped setup. On resume a preset ID resolves to the currently installed definition, so IDs and package versions belong to the release unit. A historical session cannot silently resume under a changed permission/prompt composition. [DSH-09, DSH-13]

## 8. Tools and structured results

Implement domain tools with `defineTool` from the pinned dsh tools package. Declare parameter/output schemas, return canonical structured data from `execute`, and provide bounded model rendering separately. Use the actual execution context's agent and call identity; do not let arguments choose a different authenticated user. [DSH-12]

The initial tool families are `project_read`, `sources_search`, `source_read`, `creative_start`, `work_status`, `work_review`, `work_steer`, `peer_send`, `peer_read`, `workspace_read`, `workspace_patch` and `workspace_run`. Names are Sophia's new schema. They all call scoped domain services. A tool result with `status:'admitted'` is not rendered as `completed`.

Guarded tool execution remains guarded inside PTC. Native PTC runs a fresh sandboxed Node process, exposes async bindings and returns bounded logs/JSON. It is not Prime's persistent IPython kernel. The inspected implementation clears the program-visible environment, bounds control traffic and fails restricted execution when its sandbox is unavailable. Retain those controls; also keep user build scripts in separate no-secret containers. [DSH-18]

## 9. Model routing

For native work, use `deepseek-official` / `deepseek-flash` and the documented `off|low|high|max` effort vocabulary. The adapter uses the Messages endpoint and sends reasoning through `output_config.effort`. A made-up `medium` value is not a valid DeepSeek setting at this pin. Use `low` for routine research/drafting, `high` for lead alignment and difficult prototype work; escalation remains an attributed policy decision. [DSH-14]

Keep pi-ai as the additional text-provider seam; its `providers` dictionary is route configuration, and an explicit `models` list replaces the catalog. `apiKeyEnv` is a reference, not a credential value. No model can install another provider or choose ambient local subscription credentials. [DSH-15]

Google Live and image generation are not forced through a text-model adapter. They live in the media/creative integrations and return structured results into the same product records. Selected high-resolution visual analysis uses the Google capability job, while exact source reads remain provider-neutral.

## 10. Upgrade discipline

Freeze CLI artifact, Cordis dependencies, Sophia bundle, role IDs, provider settings, native session codecs and schema revision as one runtime unit. The upgrade lane boots a new unit on copies of representative sessions, runs replay and then the affected live crossings. Keep the previous unit available to drain existing work. A binary rollback cannot reverse an already migrated data format or an external deployment.

Use dsh replay for fixed recorded model behavior. It does not test a live provider, discover new reasoning failures or guarantee concurrent child script binding. Separate deterministic protocol fixtures from live three-resource collaboration. [DSH-17]
