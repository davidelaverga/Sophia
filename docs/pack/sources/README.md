# Source register and evidence boundaries

**Checked 24 September 2026.** `source-register.json` is the machine-readable index. Repository commits are research/initial implementation pins, not claims of deployment or successful integration. File blob hashes are explicitly labelled; a file blob is not a repository commit.

## How to use the evidence

A source-derived statement describes what an upstream file or official document supports. A **Sophia decision** selects how our product will use it. A **new contract** names behavior we have to implement. A **live check** remains unperformed until a coding session leaves the corresponding evidence. No design paragraph is a passed test.

Latest user decisions and P-01 override historical recommendations. In particular, the old Claude plans do not reinstate an Omnigent/Claude-SDK root, late voice, a dashboard-led product, compulsory numerical assumptions, or the requirement to repair the old Sophia first.

## Coverage limitations

The dsh launch, composition, Agent lifecycle, default bundle, provider adapters, tool authoring, checkpoint hook, PTC runtime and replay paths were inspected directly for this installment. Google/OpenAI public contracts were refreshed. Some generic Google Live examples still name an older model; this pack explicitly selects Gemini 3.8 Live. The direct 3.8 model-card URL failed to open on some attempts; the model index, launch notice, 3.8-specific best-practice notes and SDK types supply the supported facts. SDK shape does not prove account-specific model availability.

Omnigent, Buzz and QM retain their pinned v0.2 file-level audits; their relevant contracts are carried forward rather than relabelled as new live tests. Omnigent's complete OpenAPI binding and installed-host behavior are the next detailed audit. Existing Sophia's PDF wrapper and artifact source paths were re-established; the rich deck/render closure still needs extraction work. No source is silently substituted for a failed lookup.

No full provider login, live audio call, image request, dsh boot, database migration, deployment, native cross-owner session or browser application test was run to create this pack. `evidence/pack-validation.json` reports documentation checks only.

## Source inventory

- **DSH-01** — `package.json`. Node/pnpm and package version; not evidence that all artifacts are published to npm
- **DSH-02** — `docs/architecture.md`. official launcher, profiles, bundles, services, durable vs live events
- **DSH-03** — `packages/boot/app-boot/README.md`. profile installation, bundle order, config and failed plugin readiness
- **DSH-04** — `packages/bundle/base/cordis.patch.yml`. precise base plugin IDs and defaults to retain/change
- **DSH-05** — `packages/bundle/sdk-app/cordis.patch.yml`. valid row replacement and insertion syntax; SDK carrier distinction
- **DSH-06** — `packages/sdk/client/README.md`. SDK lifecycle limitations, not product Stop support
- **DSH-07** — `packages/sdk/protocol/README.md`. initialize/session/prompt/shutdown protocol; absent mid-turn cancel
- **DSH-08** — `docs/subsystems/core.md`. Agent create/resume/send/steer/inject/cancel/maintenance
- **DSH-09** — `packages/core/agent/src/types.ts`. create/setup/role attachment contract
- **DSH-10** — `packages/core/agent/src/index.ts`. public AgentService creation and ownership
- **DSH-11** — `packages/session/session-checkpoint-policy/src/index.ts`. checkpoint before model/tool boundaries
- **DSH-12** — `docs/cookbook/adding-a-tool.md`. defineTool, execute context, guards and structured results
- **DSH-13** — `packages/preset/agent-preset-registry/README.md`. named presets, current definitions on resume
- **DSH-14** — `packages/llm/llm-deepseek/README.md`. Messages API, deepseek-flash, output_config.effort, telemetry and files defaults
- **DSH-15** — `packages/llm/llm-pi-ai/README.md`. provider map, credential references, catalog replacement, version-specific capabilities
- **DSH-16** — `docs/subsystems/agent-team.md`. native team message durability and step-boundary delivery
- **DSH-17** — `packages/test-support/llm-replay/README.md`. keyless recorded model output; concurrency binding limit
- **DSH-18** — `packages/ptc-runtime/ptc-runtime-node/README.md`. fresh sandboxed Node process, binding calls, cancellation, no kernel persistence
- **OM-01** — `omnigent/server/routes/_host_launch.py`. host owner and session owner launch checks
- **OM-02** — `docs/QUEUE_STEER_DESIGN.md`. Codex RPC versus Claude managed terminal timing; draft vs sent semantics
- **BZ-01** — `crates/buzz-acp/src/base_prompt.md`. recipient identity, result callbacks, no acknowledgement loops
- **BZ-02** — `desktop/src-tauri/src/huddle/human_floor.rs`. human floor and generation/authorization check pattern
- **BZ-03** — `crates/buzz-acp/src/acp.rs`. pending permission identity and prevent double answers
- **QM-01** — `docs/persistent-subagent-sessions.md`. durable message vs follow-up wake; completion return reconciliation
- **QM-02** — `src/harness/harness.ts`. typed capabilities, silent result, pending approvals, scope
- **QM-03** — `src/resolution/sharing-access.ts`. audience and source scope conditions; do not copy open private carry
- **LK-01** — `packages/livekit-rtc/src/audio_source.ts`. AudioSource queue, clearQueue, captureFrame and close
- **LK-02** — `packages/livekit-rtc/package.json`. @livekit/rtc-node 1.1.0, ESM exports and native binding dependency
- **LK-03** — `examples/publish-wav/index.ts`. raw RTC room/publish lifecycle; no AgentSession dependency
- **LK-04** — `README.md`. raw SDK vs Agents distinction
- **GG-01** — `package.json`. @google/genai 2.24.0 package pin
- **OLD-01** — `backend/packages/harness/deerflow/sophia/tools/create_pdf_artifact.py`. modest PDF wrapper has ToolRuntime/thread coupling; not the rich universal renderer
- **OLD-02** — `backend/packages/harness/deerflow/sophia/build_mutation.py`. S2 transaction donor; full transplant dependency audit remains Part 2
- **OLD-03** — `backend/packages/harness/deerflow/sophia/tools/build_deck_from_slides.py`. exact deck extraction entry point; executable closure audit not completed in this installment
- **G-01** — `https://ai.google.dev/gemini-api/docs/models`. model IDs; normal Live and Extended Thinking are separate
- **G-02** — `https://ai.google.dev/gemini-api/docs/live-api/get-started`. Live connection and media API
- **G-03** — `https://ai.google.dev/gemini-api/docs/live-api/tools`. NON_BLOCKING tools; defaults must not substitute explicit settings
- **G-04** — `https://ai.google.dev/gemini-api/docs/live-api/session-management`. compression, resumable handles, GoAway; generic page contains older model examples
- **G-05** — `https://ai.google.dev/gemini-api/docs/live-api/best-practices`. 3.8 proactive audio is permanent; bounded context practice
- **G-06** — `https://googleapis.github.io/js-genai/release_docs/classes/types.FunctionResponse.html`. scheduling and willContinue are top-level response properties; willContinue not supported by Vertex
- **G-07** — `https://ai.google.dev/gemini-api/docs/image-generation`. Interactions API, response_format image_size/aspect_ratio, output step parsing, reference image input
- **G-08** — `https://ai.google.dev/gemini-api/docs/interactions`. store:false; no stored previous interaction chain in Sophia image jobs
- **G-09** — `https://ai.google.dev/gemini-api/docs/thinking`. gemini-3.8-flash low/medium/high; output caps can truncate thinking
- **G-10** — `https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-8-live-gemini-3-8-live-extended-thinking/`. September 15 Live launch and separate product roles
- **OA-01** — `https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst`. dated snapshot, image generation/edit, no model streaming promise
- **OA-02** — `https://developers.openai.com/api/docs/models/gpt-image-2.5-flare`. dated snapshot and second comparison model
- **OA-03** — `https://developers.openai.com/api/docs/guides/image-generation`. direct Images API generation/edit versus Responses tool
- **DS-01** — `https://api-docs.deepseek.com/news/news260910/`. API ID deepseek-flash currently names V4.1 Flash
- **DS-02** — `https://api-docs.deepseek.com/updates/`. current change log; V4-Pro statement conflicts with release article, so no Pro dependency
- **IM-01** — `https://github.com/pbakaus/impeccable`. prior v0.2 README audit: design guidance; skill implementation extraction remains Part 2
- **TEST-01** — `https://playwright.dev/docs/trace-viewer`. browser evidence reference from v0.2; exact project test implementation is new Sophia work
- **TEST-02** — `https://storybook.js.org/docs/writing-tests/interaction-testing`. S2 UI scenario test reference; not dsh replay
- **P-01** — `references/Sophia_DeepSeek_Harness_Three_Sprint_Product_Plan_Draft_v0.2_2026-09-24.md`. latest scope and donor review; newer user media decisions take precedence
- **P-02** — `references/Sophia_Project_Bridges_Donor_Review_and_Plan_Changes_v0.2_2026-09-24.md`. latest scope and donor review; newer user media decisions take precedence

- **DSH-19** — `packages/util/package-manifest/src/types.ts`: exact profile and bundle fields, read directly.
- **DSH-20** — `packages/bundle/sdk-app/package.json`: real packaged-bundle manifest, read directly.
