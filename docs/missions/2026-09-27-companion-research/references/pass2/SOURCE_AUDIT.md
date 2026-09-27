# Source audit — Pass 2

**Date:** 27 September 2026. **Evidence boundary:** selected source/documentation review, not executed runtime conformance or a complete security audit. All new designs are proposals. Source pins are not proof of deployed software.

The GitHub connector supplied these sources. Full repository bytes were not cloned or archived. A direct container network attempt failed at DNS; connector reads succeeded. No repository tests, paid models, hosted database queries, release operations or external writes were performed. Local package validation checks only the generated documents.

## Current pins

| Role | Pin | Treatment |
|---|---|---|
| Sophia PR #13 | `2911b037c9703703f2ae33955123d434797e3155` | Refreshed source head; PR-reported hosted revision is separate. |
| Sophia installed dsh source | `46a7f68b0922371ce7144b668b90e377d8e799f4` | 0.1.7-rc.1 baseline. |
| Tagged upgrade candidate | `477b4f420553e8a52c2fbccc464d7561b239c443` | 0.1.7-rc.2 prerelease, not automatically approved. |
| Latest observed dsh source | `21638c56315ae6a2b552d6091945d3144c9af32e` | Separate source-build candidate; never equate with rc.2 npm artifacts. |
| Google SDK | `b12dad09079feee92bc843be0965543baa1ec88d` | Source pin used by the existing 2.24.0 plan/implementation. |
| Old Sophia donor branch | `8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf` | Resolved relevant codex/sophia-observability-v1 branch, not asserted default/main or live production. |
| DeerFlow 2 | `827acf51dc4a713d99632f0319a62ee487598c77` | Pinned selected modern source. |
| DeerFlow 1.x | `2ab28765803d4d9582aaa8f2f3355137d154e273` | Pinned historical research branch. |

## Load-bearing findings

1. **Correction to the prior uncertainty:** declarative native agent presets already exist at the installed rc.1 source pin (D01). Current registry code supplies explicit mount, retained composition generations, child inheritance, and pre-first-turn-only select (D03). Source availability does not prove Sophia's current profile mounts or binds it.
2. **A real new upgrade concern:** selected main adds failed-step tool-result pairing recovery, including unknown/not-started distinctions, beyond the tagged comparison source (D17–D19). It does not automatically replay uncertain effects or repair every already-closed historical turn.
3. **Google call lifetime is not job lifetime:** `willContinue:false` finishes a tool call; later research output needs application events/context, not another response on that finished ID (G01–G05). The pinned JS method defaults `turnComplete:true`; passive context delivery must set false explicitly (G02).
4. **Native web retrieval is valuable but incomplete:** bounded public anonymous transport is documented; text-only HTTP fetch rejects PDF and is not a project-egress or research-provenance policy (D05–D07).
5. **PDF reuse remains concrete:** the selected old PDF kernel has the same Git blob at both donor pins (O01–O02). Its `--no-sandbox` and guessed roots must not survive the existing plan's confinement requirements (S04).
6. **Later slides require a refreshed donor choice:** the newer legacy obligations name a native deck service and reject screenshot-deck fallback (O03), unlike the older extraction plan's image-based compiler (S04). This review does not verify that newer native service, and does not change the Markdown/PDF scope.

## Inspected sources

<a id="s01"></a>
### S01 — Current Sophia runtime patch

[packages/dsh-bundle/cordis.patch.yml](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/packages/dsh-bundle/cordis.patch.yml)  
**Evidence:** `implementation_source`. **Coverage:** Full file
**Commit:** `2911b037c9703703f2ae33955123d434797e3155`.
**Returned Git blob:** `9e447944fc5698462080d51d5b7acc312c3c110e`. This is a Git object identity, not a locally computed SHA-256.

<a id="s02"></a>
### S02 — Current control bridge

[packages/dsh-bundle/src/control-bridge.ts](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/packages/dsh-bundle/src/control-bridge.ts)  
**Evidence:** `implementation_excerpt`. **Coverage:** Source lines 1–220 and 350–620: guards, journaling, create/resume, model route
**Commit:** `2911b037c9703703f2ae33955123d434797e3155`.
**Returned Git blob:** `460720b502fa53fe54b5d1b4762f548cd60767a5`. This is a Git object identity, not a locally computed SHA-256.

<a id="s03"></a>
### S03 — Current room result announcement

[apps/media-bridge/src/room-session.ts](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/apps/media-bridge/src/room-session.ts)  
**Evidence:** `implementation_excerpt`. **Coverage:** Source lines 815–980: announce, idle gate, delivery receipts
**Commit:** `2911b037c9703703f2ae33955123d434797e3155`.
**Returned Git blob:** `0d8daa71c2dedc0938a09467dbd996cf3fd54dba`. This is a Git object identity, not a locally computed SHA-256.

<a id="s04"></a>
### S04 — Active renderer extraction design

[docs/pack/architecture/14_RENDERER_EXTRACTION.md](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/docs/pack/architecture/14_RENDERER_EXTRACTION.md)  
**Evidence:** `existing_plan`. **Coverage:** Full file
**Commit:** `2911b037c9703703f2ae33955123d434797e3155`.
**Returned Git blob:** `1c35755d232ffd227f00f377586621e96d804346`. This is a Git object identity, not a locally computed SHA-256.

<a id="s05"></a>
### S05 — PR #13 metadata and reported runtime evidence

[Source](https://github.com/davidelaverga/Sophia/pull/13)  
**Evidence:** `refreshed_metadata_and_reported_runtime`. **Coverage:** Head 2911b037…; draft/unmerged. Hosted tuple and test results are PR-reported, not independently reproduced.

<a id="d01"></a>
### D01 — Preset registry already present in installed rc.1 source

[packages/preset/agent-preset-registry/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/preset/agent-preset-registry/README.md)  
**Evidence:** `official_repository_documentation`. **Coverage:** Full file
**Commit:** `46a7f68b0922371ce7144b668b90e377d8e799f4`.
**Returned Git blob:** `44b01be1ceea5936668f091fb410137f3a139a88`. This is a Git object identity, not a locally computed SHA-256.

<a id="d02"></a>
### D02 — Preset registry current source documentation

[packages/preset/agent-preset-registry/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/21638c56315ae6a2b552d6091945d3144c9af32e/packages/preset/agent-preset-registry/README.md)  
**Evidence:** `official_repository_documentation`. **Coverage:** Full file
**Commit:** `21638c56315ae6a2b552d6091945d3144c9af32e`.
**Returned Git blob:** `1db29f2383a58648a91f2271df129b687b6cbe35`. This is a Git object identity, not a locally computed SHA-256.

<a id="d03"></a>
### D03 — Preset registry implementation: definitions, activation, mount, blank-session select

[packages/preset/agent-preset-registry/src/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/preset/agent-preset-registry/src/index.ts)  
**Evidence:** `implementation_source`. **Coverage:** Source lines 1–470, including public mount and select methods
**Commit:** `477b4f420553e8a52c2fbccc464d7561b239c443`.
**Returned Git blob:** `54c8ae5cfd454e8fd9c738bdb1918b59b02d6b3c`. This is a Git object identity, not a locally computed SHA-256.

<a id="d04"></a>
### D04 — Public Agent contract

[packages/core/agent/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/core/agent/README.md)  
**Evidence:** `official_repository_documentation`. **Coverage:** Full documentation through known limitations
**Commit:** `477b4f420553e8a52c2fbccc464d7561b239c443`.
**Returned Git blob:** `be003d7b899306b58c4ddc88e720c18dde9ce33b`. This is a Git object identity, not a locally computed SHA-256.

<a id="d05"></a>
### D05 — Web capability family

[packages/web/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/web/README.md)  
**Evidence:** `official_repository_documentation`. **Coverage:** Full file
**Commit:** `477b4f420553e8a52c2fbccc464d7561b239c443`.
**Returned Git blob:** `22ef641e29c4626b2af40ed07a5d13b5cc0700c9`. This is a Git object identity, not a locally computed SHA-256.

<a id="d06"></a>
### D06 — Bounded anonymous HTTP fetch provider

[packages/web/web-fetch-http/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/web/web-fetch-http/README.md)  
**Evidence:** `official_repository_documentation`. **Coverage:** Full file; text-only content and PDF limitation explicit
**Commit:** `477b4f420553e8a52c2fbccc464d7561b239c443`.
**Returned Git blob:** `a3e6da087df37b051aa2dc506eb718b4876601de`. This is a Git object identity, not a locally computed SHA-256.

<a id="d07"></a>
### D07 — Native web-tool configuration and registration

[packages/web/tool-web/src/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/web/tool-web/src/index.ts)  
**Evidence:** `implementation_source`. **Coverage:** Full file
**Commit:** `477b4f420553e8a52c2fbccc464d7561b239c443`.
**Returned Git blob:** `4145fdeb0f0509e57d08dfe09928afe1e5b405be`. This is a Git object identity, not a locally computed SHA-256.

<a id="d08"></a>
### D08 — Skill family

[packages/skill/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/skill/README.md)  
**Evidence:** `official_repository_documentation`. **Coverage:** Full file
**Commit:** `477b4f420553e8a52c2fbccc464d7561b239c443`.
**Returned Git blob:** `75261bdca06b658f04fac17a3eab4306dbe5cecd`. This is a Git object identity, not a locally computed SHA-256.

<a id="d09"></a>
### D09 — Compaction family

[packages/compaction/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/compaction/README.md)  
**Evidence:** `official_repository_documentation`. **Coverage:** Full file
**Commit:** `477b4f420553e8a52c2fbccc464d7561b239c443`.
**Returned Git blob:** `46ab8fab72d55b4926c9fe582187e025ce7a67d0`. This is a Git object identity, not a locally computed SHA-256.

<a id="d10"></a>
### D10 — Spill family

[packages/spill/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/spill/README.md)  
**Evidence:** `official_repository_documentation`. **Coverage:** Full file; spill opt-in and storage-failure behavior
**Commit:** `477b4f420553e8a52c2fbccc464d7561b239c443`.
**Returned Git blob:** `d90c7606cecaf87fbbccad98afd1846c9f587520`. This is a Git object identity, not a locally computed SHA-256.

<a id="d11"></a>
### D11 — Workflow family

[packages/workflow/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/workflow/README.md)  
**Evidence:** `official_repository_documentation`. **Coverage:** Full file
**Commit:** `477b4f420553e8a52c2fbccc464d7561b239c443`.
**Returned Git blob:** `2eb78c2b8fce87aeadad5fab4f3d5a5ea983e514`. This is a Git object identity, not a locally computed SHA-256.

<a id="d12"></a>
### D12 — Native deliverables

[packages/deliverables/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/deliverables/README.md)  
**Evidence:** `official_repository_documentation`. **Coverage:** Full file
**Commit:** `477b4f420553e8a52c2fbccc464d7561b239c443`.
**Returned Git blob:** `3666cbbbe1695a95fe33497c22dd94f502a7f292`. This is a Git object identity, not a locally computed SHA-256.

<a id="d13"></a>
### D13 — Office-to-PDF family, not HTML report authoring

[packages/document/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/document/README.md)  
**Evidence:** `official_repository_documentation`. **Coverage:** Full file
**Commit:** `477b4f420553e8a52c2fbccc464d7561b239c443`.
**Returned Git blob:** `8993c608169ef08abe45babcf33ce6552c147425`. This is a Git object identity, not a locally computed SHA-256.

<a id="d14"></a>
### D14 — Newer base bundle defaults

[packages/bundle/base/cordis.patch.yml](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/bundle/base/cordis.patch.yml)  
**Evidence:** `implementation_excerpt`. **Coverage:** Lines 1–185 only; not whole composition
**Commit:** `477b4f420553e8a52c2fbccc464d7561b239c443`.
**Returned Git blob:** `db6701a9b698d2a185748359278ea0c02fe4046f`. This is a Git object identity, not a locally computed SHA-256.

<a id="d15"></a>
### D15 — Observed rc.2 release and exact tag identity

[Source](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.2)  
**Evidence:** `release_metadata`. **Coverage:** Release list and git tag reference fetched. Prerelease, not stable. Release-note claims are not reproduced benchmark results.
**Commit:** `477b4f420553e8a52c2fbccc464d7561b239c443`.

<a id="d16"></a>
### D16 — Installed source to tagged candidate comparison

[Source](https://github.com/deepseek-ai/deepseek-harness/compare/46a7f68b0922371ce7144b668b90e377d8e799f4...477b4f420553e8a52c2fbccc464d7561b239c443)  
**Evidence:** `partial_compare_metadata`. **Coverage:** ahead_by=346, behind_by=0. Returned diff/file body was truncated; NOT a complete changed-file audit.

<a id="d17"></a>
### D17 — Failed-step missing tool-result recovery change

[Source](https://github.com/deepseek-ai/deepseek-harness/commit/6a6f350b9437cf24e34a34f39ee4dfd107897d0c)  
**Evidence:** `selected_commit_diff`. **Coverage:** Commit metadata and selected diff, implementation note, agent-loop and session changes identified. Not all changed tests executed or all diff files read.
**Commit:** `6a6f350b9437cf24e34a34f39ee4dfd107897d0c`.

<a id="d18"></a>
### D18 — Current main AgentLoop source import difference

[packages/core/agent-loop/src/agent.ts](https://github.com/deepseek-ai/deepseek-harness/blob/21638c56315ae6a2b552d6091945d3144c9af32e/packages/core/agent-loop/src/agent.ts)  
**Evidence:** `implementation_excerpt`. **Coverage:** Lines 20–52; ToolCallRecovery import observed
**Commit:** `21638c56315ae6a2b552d6091945d3144c9af32e`.
**Returned Git blob:** `2f68565cef052f82ef6f2a740141962507654e02`. This is a Git object identity, not a locally computed SHA-256.

<a id="d19"></a>
### D19 — Tagged rc.2 AgentLoop source comparison

[packages/core/agent-loop/src/agent.ts](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/core/agent-loop/src/agent.ts)  
**Evidence:** `implementation_excerpt`. **Coverage:** Lines 20–42; counterpart without ToolCallRecovery import
**Commit:** `477b4f420553e8a52c2fbccc464d7561b239c443`.
**Returned Git blob:** `bcd7ad17a82699c395c3a14855cdee6ed4a2b905`. This is a Git object identity, not a locally computed SHA-256.

<a id="g01"></a>
### G01 — Pinned Google FunctionResponse types

[src/types.ts](https://github.com/googleapis/js-genai/blob/b12dad09079feee92bc843be0965543baa1ec88d/src/types.ts)  
**Evidence:** `implementation_excerpt`. **Coverage:** Lines 2030–2110
**Commit:** `b12dad09079feee92bc843be0965543baa1ec88d`.
**Returned Git blob:** `fc49deb97efa41ade618a88fa4687dad434bdfed`. This is a Git object identity, not a locally computed SHA-256.

<a id="g02"></a>
### G02 — Pinned Google Live serializer and send defaults

[src/live.ts](https://github.com/googleapis/js-genai/blob/b12dad09079feee92bc843be0965543baa1ec88d/src/live.ts)  
**Evidence:** `implementation_excerpt`. **Coverage:** Lines 1–100 and 320–700; tool pass-through, clientContent default, realtime ordering
**Commit:** `b12dad09079feee92bc843be0965543baa1ec88d`.
**Returned Git blob:** `6e7f8e6f11cea9bd1c052fbca1ecc6608fa3e1ee`. This is a Git object identity, not a locally computed SHA-256.

<a id="g03"></a>
### G03 — Gemini 3.8 Live model and migration documentation

[Source](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live)  
**Evidence:** `official_documentation`. **Coverage:** Current model-specific nonblocking and full-session clientContent behavior

<a id="g04"></a>
### G04 — Live API capabilities comparison

[Source](https://ai.google.dev/gemini-api/docs/live-api/capabilities)  
**Evidence:** `official_documentation`. **Coverage:** Standard vs Extended Thinking differences; interruption and cancellation

<a id="g05"></a>
### G05 — FunctionResponse reference

[Source](https://googleapis.github.io/js-genai/release_docs/classes/types.FunctionResponse.html)  
**Evidence:** `official_documentation`. **Coverage:** Top-level scheduling and willContinue termination

<a id="o01"></a>
### O01 — Old Sophia HTML-to-PDF kernel

[backend/packages/harness/deerflow/sophia/js/render_html_to_pdf.mjs](https://github.com/davidelaverga/Sophia-Agent/blob/8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf/backend/packages/harness/deerflow/sophia/js/render_html_to_pdf.mjs)  
**Evidence:** `implementation_source`. **Coverage:** Full file; current donor blob matches older pack donor
**Commit:** `8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf`.
**Returned Git blob:** `f2e808cf5e7c4f6514c1bb912c361dd6c21eba7d`. This is a Git object identity, not a locally computed SHA-256.

<a id="o02"></a>
### O02 — Same PDF kernel at pack donor pin

[backend/packages/harness/deerflow/sophia/js/render_html_to_pdf.mjs](https://github.com/davidelaverga/Sophia-Agent/blob/d467ab97464908b4e7c7752701eee9d24db7faf6/backend/packages/harness/deerflow/sophia/js/render_html_to_pdf.mjs)  
**Evidence:** `blob_identity_check`. **Coverage:** First 12 lines plus identical Git blob identity; whole content already read through O01
**Commit:** `d467ab97464908b4e7c7752701eee9d24db7faf6`.
**Returned Git blob:** `f2e808cf5e7c4f6514c1bb912c361dd6c21eba7d`. This is a Git object identity, not a locally computed SHA-256.

<a id="o03"></a>
### O03 — Newer legacy worker obligations

[skills/public/sophia/builder_obligations.md](https://github.com/davidelaverga/Sophia-Agent/blob/8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf/skills/public/sophia/builder_obligations.md)  
**Evidence:** `implementation_prompt`. **Coverage:** Full file; native-deck instruction is not proof of executed native export
**Commit:** `8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf`.
**Returned Git blob:** `7d3d8f1ed91e473e4d345ff62cc345228c9241f4`. This is a Git object identity, not a locally computed SHA-256.

<a id="f01"></a>
### F01 — DeerFlow 2 lead-agent assembly

[backend/packages/harness/deerflow/agents/lead_agent/agent.py](https://github.com/bytedance/deer-flow/blob/827acf51dc4a713d99632f0319a62ee487598c77/backend/packages/harness/deerflow/agents/lead_agent/agent.py)  
**Evidence:** `implementation_excerpt`. **Coverage:** Lines 1–230; principal/tool authorization imports, resolved release policy, project-context tool gating
**Commit:** `827acf51dc4a713d99632f0319a62ee487598c77`.
**Returned Git blob:** `8fe6882af88494f357698d10a76a33430a1eeb00`. This is a Git object identity, not a locally computed SHA-256.

<a id="f02"></a>
### F02 — DeerFlow 2 skill and delegation prompt composition

[backend/packages/harness/deerflow/agents/lead_agent/prompt.py](https://github.com/bytedance/deer-flow/blob/827acf51dc4a713d99632f0319a62ee487598c77/backend/packages/harness/deerflow/agents/lead_agent/prompt.py)  
**Evidence:** `implementation_excerpt`. **Coverage:** Lines 1–235 and 250–455; scoped catalog, escaping, delegation-cost and verification guidance
**Commit:** `827acf51dc4a713d99632f0319a62ee487598c77`.
**Returned Git blob:** `eecd5f0db77f2f8266aca5f22ffd7d815e1fcf86`. This is a Git object identity, not a locally computed SHA-256.

<a id="f03"></a>
### F03 — DeerFlow 1.x research graph

[src/graph/builder.py](https://github.com/bytedance/deer-flow/blob/2ab28765803d4d9582aaa8f2f3355137d154e273/src/graph/builder.py)  
**Evidence:** `implementation_source`. **Coverage:** Full file
**Commit:** `2ab28765803d4d9582aaa8f2f3355137d154e273`.
**Returned Git blob:** `71cf3a2bc395a3bdfac8aa101823d92751621939`. This is a Git object identity, not a locally computed SHA-256.

<a id="f04"></a>
### F04 — DeerFlow 1.x researcher instructions

[src/prompts/researcher.md](https://github.com/bytedance/deer-flow/blob/2ab28765803d4d9582aaa8f2f3355137d154e273/src/prompts/researcher.md)  
**Evidence:** `implementation_prompt`. **Coverage:** Full file
**Commit:** `2ab28765803d4d9582aaa8f2f3355137d154e273`.
**Returned Git blob:** `7d49e8f3ef8f6b69954a6f05d4a22b01ebb702e7`. This is a Git object identity, not a locally computed SHA-256.

## Coverage deliberately not claimed

The full rc.1→rc.2→main diff, npm dependency closure and reproducible build, restart compatibility, provider eligibility/quotas, live Google wire behavior, PDF accessibility compliance, complete DeerFlow safety model, newer legacy native-deck service and live two-user research episode all still require the specified implementation evidence. The upgrade candidate is selected only after those relevant checks, not because its version number is newer.

The first-pass ledger is retained unchanged in `prior/`. Its source inventory and mission/UX decisions remain relevant; this pass specifically supersedes its unresolved native-preset question and its next-pass research agenda.
