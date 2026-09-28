# Pack v1.1 — Exact M01 system prompt and complete mission skill

**28 September 2026** · Targeted amendment to [pack v1.0](Sophia_Mission_Companion_and_Research_Ledger_v0.3_2026-09-27.md).

## Added

| File | What it provides |
|---|---|
| [M01_SYSTEM_PROMPT.v1.1.md](prompts/M01_SYSTEM_PROMPT.v1.1.md) | Complete literal system prompt, not a role sketch. |
| [mission-lifecycle.v1.1.md](skills/mission-lifecycle.v1.1.md) | Full adapted runtime skill; six modes, cues, ledger operations and transitions. |
| [M01_SYSTEM_INSTRUCTION.v1.1.txt](prompts/M01_SYSTEM_INSTRUCTION.v1.1.txt) | Exact combined static payload for provider-setup comparison. |
| [M01_ASSETS.v1.1.json](prompts/M01_ASSETS.v1.1.json) | Immutable authored identities, lengths, hashes and assembly rule. |
| [M01_PROMPT_LOADING.md](shared/M01_PROMPT_LOADING.md) | Exact loading, function-name, dynamic-context, failure and reconnect requirements. |
| [validate_m01_assets.py](scripts/validate_m01_assets.py) | Local asset/spec equality and hash checks; no provider calls. |
| [Ledger v0.4](Sophia_Mission_Companion_and_Research_Ledger_v0.4_2026-09-28.md) | Continuation record for this content amendment. |

## Updated

M01 section 8 now contains the entire combined prompt literally. Section 7 fixes the six model-facing names. G3 and M01-T19–T22 require proof of actual asset loading, no missing-file fallback, reconnect consistency and real capability binding. Both M01 launch prompts reference the exact files and checks. Start/readme/index/file-map/contract cross-references and package hashes are updated.

## Preserved

The R00 procedure, M02/M03 mission specs and their launch prompts, Claude–Codex operations protocol, source-provider design, previous ledgers, original v1 candidate assets and all pass-2 reference files are unchanged. The old candidate core/skill are explicitly excluded from active M01 assembly. The older repository observations retain their original inspection dates.

## What was verified here

Package structure, local links, checksums, canonical prompt/skill presence, byte-for-byte equality of the combined payload and Mission 1's literal copy, plus preservation of unaffected files. No app tests, real model calls, repository changes, merges, schema operations or deployment were performed. The runtime behavior of these authored instructions still requires M01's actual acceptance episode.
