# Source register and audit coverage

Machine-readable truth is [source-register.json](source-register.json). Repository entries are pinned source reads; official documentation is dated live research; provided documents retain byte hashes. `part1_retained` is not a fresh reread. Source inspection is not runtime validation.

## DSH-01

**Use:** Node/pnpm and package version; not evidence that all artifacts are published to npm

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/package.json)

Path: `package.json`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: root manifest.

## DSH-02

**Use:** official launcher, profiles, bundles, services, durable vs live events

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/docs/architecture.md)

Path: `docs/architecture.md`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: lines 1–245; opening and turn flow reread.

## DSH-03

**Use:** profile installation, bundle order, config and failed plugin readiness

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/boot/app-boot/README.md)

Path: `packages/boot/app-boot/README.md`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: lines 1–220.

## DSH-04

**Use:** precise base plugin IDs and defaults to retain/change

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/bundle/base/cordis.patch.yml)

Path: `packages/bundle/base/cordis.patch.yml`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: complete patch in three ranges.

## DSH-05

**Use:** valid row replacement and insertion syntax; SDK carrier distinction

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/bundle/sdk-app/cordis.patch.yml)

Path: `packages/bundle/sdk-app/cordis.patch.yml`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: complete.

## DSH-06

**Use:** SDK lifecycle limitations, not product Stop support

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/sdk/client/README.md)

Path: `packages/sdk/client/README.md`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: lines 1–210.

## DSH-07

**Use:** initialize/session-prompt/shutdown protocol; no mid-turn cancel or session-close; session/prompt returns durable enqueue identity

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/sdk/protocol/README.md)

Path: `packages/sdk/protocol/README.md`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: lines 1–190.

## DSH-08

**Use:** Agent create/resume/send/steer/inject/cancel/maintenance

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/docs/subsystems/core.md)

Path: `docs/subsystems/core.md`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: lines 1–220.

## DSH-09

**Use:** Durable Agent identity and inbox event vocabulary; create/setup belongs to DSH-10, not this type-only file.

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/core/agent/src/types.ts)

Path: `packages/core/agent/src/types.ts`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: lines 1–165.

## DSH-10

**Use:** public AgentService creation and ownership

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/core/agent/src/index.ts)

Path: `packages/core/agent/src/index.ts`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: lines 1–235.

## DSH-11

**Use:** checkpoint before model/tool boundaries

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/session/session-checkpoint-policy/src/index.ts)

Path: `packages/session/session-checkpoint-policy/src/index.ts`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: lines 1–170.

## DSH-12

**Use:** defineTool, execute context, guards and structured results

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/docs/cookbook/adding-a-tool.md)

Path: `docs/cookbook/adding-a-tool.md`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: lines 1–190.

## DSH-13

**Use:** named presets, current definitions on resume

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/preset/agent-preset-registry/README.md)

Path: `packages/preset/agent-preset-registry/README.md`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: lines 1–170.

## DSH-14

**Use:** Messages API, deepseek-flash, output_config.effort, telemetry and files defaults

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/llm/llm-deepseek/README.md)

Path: `packages/llm/llm-deepseek/README.md`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: lines 1–145.

## DSH-15

**Use:** provider map, credential references, catalog replacement, version-specific capabilities

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/llm/llm-pi-ai/README.md)

Path: `packages/llm/llm-pi-ai/README.md`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: lines 1–145; config reread.

## DSH-16

**Use:** native team message durability and step-boundary delivery

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/docs/subsystems/agent-team.md)

Path: `docs/subsystems/agent-team.md`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: identity/mailbox/task projection and API sections.

## DSH-17

**Use:** keyless recorded model output; concurrency binding limit

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/test-support/llm-replay/README.md)

Path: `packages/test-support/llm-replay/README.md`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: main usage and limitation sections.

## DSH-18

**Use:** fresh sandboxed Node process, binding calls, cancellation, no kernel persistence

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/ptc-runtime/ptc-runtime-node/README.md)

Path: `packages/ptc-runtime/ptc-runtime-node/README.md`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: lines 1–130.

## OM-01

**Use:** host owner and session owner launch checks

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/omnigent/server/routes/_host_launch.py)

Path: `omnigent/server/routes/_host_launch.py`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: resolve_host_launch, 115–260 rechecked.

## OM-02

**Use:** Codex RPC versus Claude managed terminal timing; draft vs sent semantics

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/docs/QUEUE_STEER_DESIGN.md)

Path: `docs/QUEUE_STEER_DESIGN.md`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: complete rechecked in Part2.

## BZ-01

**Use:** recipient identity, result callbacks, no acknowledgement loops

[Source](https://github.com/block/buzz/blob/d01e5f82058463709a22e93bb4cd795da5f53e10/crates/buzz-acp/src/base_prompt.md)

Path: `crates/buzz-acp/src/base_prompt.md`. Commit: `d01e5f82058463709a22e93bb4cd795da5f53e10`. 

Coverage: communication rules; prior v0.2 audit.

## BZ-02

**Use:** human floor and generation/authorization check pattern

[Source](https://github.com/block/buzz/blob/d01e5f82058463709a22e93bb4cd795da5f53e10/desktop/src-tauri/src/huddle/human_floor.rs)

Path: `desktop/src-tauri/src/huddle/human_floor.rs`. Commit: `d01e5f82058463709a22e93bb4cd795da5f53e10`. 

Coverage: complete; prior v0.2 audit.

## BZ-03

**Use:** pending permission identity and prevent double answers

[Source](https://github.com/block/buzz/blob/d01e5f82058463709a22e93bb4cd795da5f53e10/crates/buzz-acp/src/acp.rs)

Path: `crates/buzz-acp/src/acp.rs`. Commit: `d01e5f82058463709a22e93bb4cd795da5f53e10`. 

Coverage: permission bookkeeping; prior v0.2 audit.

## QM-01

**Use:** durable message vs follow-up wake; completion return reconciliation

[Source](https://github.com/yc-software/qm/blob/861af65d75a1896418f8e1c7542b2ed34506324d/docs/persistent-subagent-sessions.md)

Path: `docs/persistent-subagent-sessions.md`. Commit: `861af65d75a1896418f8e1c7542b2ed34506324d`. 

Coverage: complete; prior v0.2 audit.

## QM-02

**Use:** typed capabilities, silent result, pending approvals, scope

[Source](https://github.com/yc-software/qm/blob/861af65d75a1896418f8e1c7542b2ed34506324d/src/harness/harness.ts)

Path: `src/harness/harness.ts`. Commit: `861af65d75a1896418f8e1c7542b2ed34506324d`. 

Coverage: turn/result/profile contracts; prior v0.2 audit.

## QM-03

**Use:** audience and source scope conditions; do not copy open private carry

[Source](https://github.com/yc-software/qm/blob/861af65d75a1896418f8e1c7542b2ed34506324d/src/resolution/sharing-access.ts)

Path: `src/resolution/sharing-access.ts`. Commit: `861af65d75a1896418f8e1c7542b2ed34506324d`. 

Coverage: complete; prior v0.2 audit.

## LK-01

**Use:** AudioSource queue, clearQueue, captureFrame and close

[Source](https://github.com/livekit/node-sdks/blob/550308a9f45ea15d6bced481b66fa6ab3b846ffa/packages/livekit-rtc/src/audio_source.ts)

Path: `packages/livekit-rtc/src/audio_source.ts`. Commit: `550308a9f45ea15d6bced481b66fa6ab3b846ffa`. 

Coverage: lines 1–180.

## LK-02

**Use:** @livekit/rtc-node 1.1.0, ESM exports and native binding dependency

[Source](https://github.com/livekit/node-sdks/blob/550308a9f45ea15d6bced481b66fa6ab3b846ffa/packages/livekit-rtc/package.json)

Path: `packages/livekit-rtc/package.json`. Commit: `550308a9f45ea15d6bced481b66fa6ab3b846ffa`. 

Coverage: lines 1–80.

## LK-03

**Use:** raw RTC room/publish lifecycle; no AgentSession dependency

[Source](https://github.com/livekit/node-sdks/blob/main/examples/publish-wav/index.ts)

Path: `examples/publish-wav/index.ts`. 

Coverage: complete on main.

## LK-04

**Use:** raw SDK vs Agents distinction

[Source](https://github.com/livekit/node-sdks/blob/main/README.md)

Path: `README.md`. 

Coverage: lines 1–210.

## GG-01

**Use:** @google/genai 2.24.0 package pin

[Source](https://github.com/googleapis/js-genai/blob/b12dad09079feee92bc843be0965543baa1ec88d/package.json)

Path: `package.json`. Commit: `b12dad09079feee92bc843be0965543baa1ec88d`. 

Coverage: lines 1–90.

## OLD-01

**Use:** modest PDF wrapper has ToolRuntime/thread coupling; not the rich universal renderer

[Source](https://github.com/davidelaverga/Sophia-Agent/blob/d467ab97464908b4e7c7752701eee9d24db7faf6/backend/packages/harness/deerflow/sophia/tools/create_pdf_artifact.py)

Path: `backend/packages/harness/deerflow/sophia/tools/create_pdf_artifact.py`. Commit: `d467ab97464908b4e7c7752701eee9d24db7faf6`. 

Coverage: lines 1–120.

## OLD-02

**Use:** S2 mutation-contract donor; no wholesale Python transplant; selected source-preservation algorithm is specified in S2-02

[Source](https://github.com/davidelaverga/Sophia-Agent/blob/d467ab97464908b4e7c7752701eee9d24db7faf6/backend/packages/harness/deerflow/sophia/build_mutation.py)

Path: `backend/packages/harness/deerflow/sophia/build_mutation.py`. Commit: `d467ab97464908b4e7c7752701eee9d24db7faf6`. 

Coverage: prior migration analysis plus path/blob re-established this pass.

## OLD-03

**Use:** exact deck extraction entry point; executable closure audit not completed in this installment

[Source](https://github.com/davidelaverga/Sophia-Agent/blob/d467ab97464908b4e7c7752701eee9d24db7faf6/backend/packages/harness/deerflow/sophia/tools/build_deck_from_slides.py)

Path: `backend/packages/harness/deerflow/sophia/tools/build_deck_from_slides.py`. Commit: `d467ab97464908b4e7c7752701eee9d24db7faf6`. 

Coverage: complete, two ranges 1–260 and 260–510.

## G-01

**Use:** model IDs; normal Live and Extended Thinking are separate

[Source](https://ai.google.dev/gemini-api/docs/models)



Coverage: See retained audit record.

## G-02

**Use:** Live connection and media API

[Source](https://ai.google.dev/gemini-api/docs/live-api/get-started)



Coverage: See retained audit record.

## G-03

**Use:** NON_BLOCKING tools; defaults must not substitute explicit settings

[Source](https://ai.google.dev/gemini-api/docs/live-api/tools)



Coverage: See retained audit record.

## G-04

**Use:** compression, resumable handles, GoAway; generic page contains older model examples

[Source](https://ai.google.dev/gemini-api/docs/live-api/session-management)



Coverage: See retained audit record.

## G-05

**Use:** 3.8 proactive audio is permanent; bounded context practice

[Source](https://ai.google.dev/gemini-api/docs/live-api/best-practices)



Coverage: See retained audit record.

## G-06

**Use:** scheduling and willContinue are top-level response properties; willContinue not supported by Vertex

[Source](https://googleapis.github.io/js-genai/release_docs/classes/types.FunctionResponse.html)



Coverage: See retained audit record.

## G-07

**Use:** Interactions API, response_format image_size/aspect_ratio, output step parsing, reference image input

[Source](https://ai.google.dev/gemini-api/docs/image-generation)



Coverage: See retained audit record.

## G-08

**Use:** store:false; no stored previous interaction chain in Sophia image jobs

[Source](https://ai.google.dev/gemini-api/docs/interactions)



Coverage: See retained audit record.

## G-09

**Use:** gemini-3.8-flash low/medium/high; output caps can truncate thinking

[Source](https://ai.google.dev/gemini-api/docs/thinking)



Coverage: See retained audit record.

## G-10

**Use:** September 15 Live launch and separate product roles

[Source](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-8-live-gemini-3-8-live-extended-thinking/)



Coverage: See retained audit record.

## OA-01

**Use:** dated snapshot, image generation/edit, no model streaming promise

[Source](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst)



Coverage: See retained audit record.

## OA-02

**Use:** dated snapshot and second comparison model

[Source](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)



Coverage: See retained audit record.

## OA-03

**Use:** direct Images API generation/edit versus Responses tool

[Source](https://developers.openai.com/api/docs/guides/image-generation)



Coverage: See retained audit record.

## DS-01

**Use:** API ID deepseek-flash currently names V4.1 Flash

[Source](https://api-docs.deepseek.com/news/news260910/)



Coverage: See retained audit record.

## DS-02

**Use:** current change log; V4-Pro statement conflicts with release article, so no Pro dependency

[Source](https://api-docs.deepseek.com/updates/)



Coverage: See retained audit record.

## IM-01

**Use:** Retained v0.2 design guidance audit; actual installed skill extraction/license closure remains explicitly pending

[Source](https://github.com/pbakaus/impeccable)



Coverage: See retained audit record.

## TEST-01

**Use:** browser evidence reference from v0.2; exact project test implementation is new Sophia work

[Source](https://playwright.dev/docs/trace-viewer)



Coverage: See retained audit record.

## TEST-02

**Use:** S2 UI scenario test reference; not dsh replay

[Source](https://storybook.js.org/docs/writing-tests/interaction-testing)



Coverage: See retained audit record.

## P-01

**Use:** latest scope and donor review; newer user media decisions take precedence

Path: `references/Sophia_DeepSeek_Harness_Three_Sprint_Product_Plan_Draft_v0.2_2026-09-24.md`. 

Coverage: complete Files read this turn.

## P-02

**Use:** latest scope and donor review; newer user media decisions take precedence

Path: `references/Sophia_Project_Bridges_Donor_Review_and_Plan_Changes_v0.2_2026-09-24.md`. 

Coverage: complete Files read this turn.

## DSH-19

**Use:** exact dsh.profile.bundles and dsh.bundle.patch declaration types

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/util/package-manifest/src/types.ts)

Path: `packages/util/package-manifest/src/types.ts`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: lines 1–155.

## DSH-20

**Use:** packaged bundle manifest and exported patch precedent

[Source](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/bundle/sdk-app/package.json)

Path: `packages/bundle/sdk-app/package.json`. Commit: `46a7f68b0922371ce7144b668b90e377d8e799f4`. 

Coverage: complete.

## OM-03

**Use:** Published paths, exact multipart names, reply shapes, stream recovery constraints

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/omnigent/server/API.md)

Path: `omnigent/server/API.md`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: 1–290; 350–1350; including exact multipart fields, PATCH model override, native event/Stop, SSE, usage and elicitation contracts.

## OM-04

**Use:** Exact MCP, event, session create, git and Codex goal declarations; code takes precedence over abbreviated API examples

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/omnigent/server/schemas.py)

Path: `omnigent/server/schemas.py`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: 1–220, 1130–1770, 2400–2700.

## OM-05

**Use:** EDIT versus OWNER; forbidden created_by; denied 2xx; interrupt before delivery; non-sticky native Stop

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/omnigent/server/routes/sessions/routes_events.py)

Path: `omnigent/server/routes/sessions/routes_events.py`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: 1–330, 650–930, 1020–1320.

## OM-06

**Use:** Owner-only host inventory, LaunchRunnerRequest, launch reply and broad host-filesystem exposure

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/omnigent/server/routes/hosts.py)

Path: `omnigent/server/routes/hosts.py`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: 1–210, 430–680, 1070–1350.

## OM-07

**Use:** Session-scoped agent ownership, HTTP registration, multi-user stdio refusal, redacted headers

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/omnigent/server/routes/session_mcp_servers.py)

Path: `omnigent/server/routes/session_mcp_servers.py`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: 1–320.

## OM-08

**Use:** Device delegation design; compare with actual route source; not proof of installed-account behavior

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/designs/DEVICE_AUTH.md)

Path: `designs/DEVICE_AUTH.md`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: 1–275.

## OM-09

**Use:** Owner consent, token issuance, token/grant lifetimes and actual OIDC/account support

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/omnigent/server/routes/device_auth.py)

Path: `omnigent/server/routes/device_auth.py`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: 1–250; 395–610; 660–1110 (authorize JSON, form exchange/refresh/revoke, current consent and rotation implementation).

## OM-10

**Use:** Single non-admin machine subject; not a per-owner launch identity

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/designs/CLIENT_CREDENTIALS.md)

Path: `designs/CLIENT_CREDENTIALS.md`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: 1–330.

## OM-11

**Use:** Delegated path allowlist, exact prefix matching, admin-subject caveat

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/omnigent/server/auth.py)

Path: `omnigent/server/auth.py`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: 1–270.

## OM-12

**Use:** Serialized native input, TurnComplete delivery only, per-turn tools ignored, global model-default side effect

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/omnigent/inner/claude_native_executor.py)

Path: `omnigent/inner/claude_native_executor.py`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: 1–240.

## OM-13

**Use:** Native terminal/forwarder ownership; Codex subprocess cleanup; not the whole launch implementation

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/omnigent/runner/native/orchestration.py)

Path: `omnigent/runner/native/orchestration.py`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: 1–250.

## OM-14

**Use:** Concrete native agent bundle format; do not inherit its auto-permission and sandbox defaults

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/examples/polly/agents/claude_code/config.yaml)

Path: `examples/polly/agents/claude_code/config.yaml`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: complete.

## OM-15

**Use:** Upstream schema identity to verify in implementation checkout; not a full schema audit

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/openapi.json)

Path: `openapi.json`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: Opening 80 lines and blob identity only; full document was not downloaded.

## OM-16

**Use:** Client-side API navigation reference; response/code contracts win where prose differs

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/sdks/python-client/omnigent_client/_sessions.py)

Path: `sdks/python-client/omnigent_client/_sessions.py`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. 

Coverage: 1–380.

## OLD-04

**Use:** Rich HTML wrapper imports and source inspection; not a standalone engine

[Source](https://github.com/davidelaverga/Sophia-Agent/blob/d467ab97464908b4e7c7752701eee9d24db7faf6/backend/packages/harness/deerflow/sophia/tools/render_html_to_pdf.py)

Path: `backend/packages/harness/deerflow/sophia/tools/render_html_to_pdf.py`. Commit: `d467ab97464908b4e7c7752701eee9d24db7faf6`. 

Coverage: 1–300.

## OLD-05

**Use:** Actual rich-PDF engine: static Chromium, asset restrictions, print settings and diagnostics

[Source](https://github.com/davidelaverga/Sophia-Agent/blob/d467ab97464908b4e7c7752701eee9d24db7faf6/backend/packages/harness/deerflow/sophia/js/render_html_to_pdf.mjs)

Path: `backend/packages/harness/deerflow/sophia/js/render_html_to_pdf.mjs`. Commit: `d467ab97464908b4e7c7752701eee9d24db7faf6`. 

Coverage: complete.

## OLD-06

**Use:** Slide rasterization; dimensions/scale/assets/overflow including permissive unknown metric

[Source](https://github.com/davidelaverga/Sophia-Agent/blob/d467ab97464908b4e7c7752701eee9d24db7faf6/backend/packages/harness/deerflow/sophia/js/render_html_to_png.mjs)

Path: `backend/packages/harness/deerflow/sophia/js/render_html_to_png.mjs`. Commit: `d467ab97464908b4e7c7752701eee9d24db7faf6`. 

Coverage: complete.

## OLD-07

**Use:** One picture per slide, zero native text runs, notes support and fixed language

[Source](https://github.com/davidelaverga/Sophia-Agent/blob/d467ab97464908b4e7c7752701eee9d24db7faf6/backend/packages/harness/deerflow/sophia/js/compile_pptx.mjs)

Path: `backend/packages/harness/deerflow/sophia/js/compile_pptx.mjs`. Commit: `d467ab97464908b4e7c7752701eee9d24db7faf6`. 

Coverage: complete.

## OLD-08

**Use:** Actual dependency versions; separate minimal renderer dependencies from unrelated runtime deps

[Source](https://github.com/davidelaverga/Sophia-Agent/blob/d467ab97464908b4e7c7752701eee9d24db7faf6/backend/packages/harness/deerflow/sophia/js/package.json)

Path: `backend/packages/harness/deerflow/sophia/js/package.json`. Commit: `d467ab97464908b4e7c7752701eee9d24db7faf6`. 

Coverage: complete.

## OLD-09

**Use:** MIT notice to carry with extracted code

[Source](https://github.com/davidelaverga/Sophia-Agent/blob/d467ab97464908b4e7c7752701eee9d24db7faf6/LICENSE)

Path: `LICENSE`. Commit: `d467ab97464908b4e7c7752701eee9d24db7faf6`. 

Coverage: complete.

## OA-04

**Use:** Official native control semantics: expectedTurnId; no model/cwd overrides in steer; not a second Sophia transport

[Source](https://developers.openai.com/codex/app-server)



Coverage: targeted relevant sections accessed 2026-09-24.

## CC-01

**Use:** PermissionRequest lacks tool_use_id and does not cover every network prompt; native observation remains capability-specific

[Source](https://code.claude.com/docs/en/hooks)



Coverage: targeted relevant sections accessed 2026-09-24.

## DB-01

**Use:** Service-key bypass, fresh membership and view SECURITY INVOKER behavior

[Source](https://supabase.com/docs/guides/database/postgres/row-level-security)



Coverage: targeted relevant sections accessed 2026-09-24.

## UI-01

**Use:** Exact Studio visual and interaction reference. Fixture outcomes are not provider results.

Path: `references/Sophia_Studio_V1_Evolved_V2_R1.html`. 

Coverage: actual bytes; function/action/semantic-state mapping; no live backend.

## DB-02

**Use:** Database role and SECURITY DEFINER review; not evidence this migration was executed

[Source](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)



Coverage: RLS behavior, owner/superuser bypass and policy semantics; accessed 2026-09-24.

## DB-03

**Use:** SKIP LOCKED queue claim syntax; not a distributed exactly-once guarantee

[Source](https://www.postgresql.org/docs/18/sql-select.html)



Coverage: SELECT and locking clause reference; accessed 2026-09-24.

## UI-02

**Use:** One React server-query cache as a chosen implementation, separate from local unsaved state

[Source](https://tanstack.com/query/latest/docs/framework/react/reference/QueryClientProvider)



Coverage: QueryClient and provider usage; accessed 2026-09-24.


## OM-17

**Use:** Actual configured_harnesses nullable map; host liveness freshness, not model-run evidence

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/omnigent/stores/host_store.py)

Path: `omnigent/stores/host_store.py`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`.

Coverage: lines 1–145.

## OM-18

**Use:** Readiness True/False and binary-missing/needs-auth/version-too-low strings

[Source](https://github.com/omnigent-ai/omnigent/blob/7496d36bde584d0a7d11c1d92a6d126f128bc1cd/omnigent/harness_availability.py)

Path: `omnigent/harness_availability.py`. Commit: `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`.

Coverage: complete.
