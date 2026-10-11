# docs/missions/

Mission packs, one folder per pack, each installed byte for byte. The pack's own `SHA256SUMS` passes in its folder, and its `scripts/validate_pack.py` reads only the folder itself. Installation records live here rather than inside a pack, so the pack keeps its exact file set.

## [2026-09-27-companion-research/](2026-09-27-companion-research/00_START_HERE.md)

| Item | Value |
|---|---|
| **Source** | `Sophia_Three_PR_Mission_Pack_v1.1_2026-09-28.zip` (sha256 `8ad62933ee6f150c07796f9f6bcdb3945f83e4ec028d74778ae32f3d20be802c`), which Davide gave to the SMC-M01 implementation session on 2026-09-28 with the M01 launch. It replaces v1.0 (`Sophia_Three_PR_Mission_Pack_v1.0_2026-09-27.zip`, given to the S1-05A session on 2026-09-27 with the R00 launch) |
| **Installed** | v1.0 by Claude Code during R00, on 2026-09-27. **v1.1** by Claude Code during SMC-M01, on 2026-09-28, byte for byte over v1.0: 61 files, the 60 that `SHA256SUMS` lists and the manifest itself. v1.1 is a superset of v1.0: 12 files changed, 12 added, none removed. In the folder, `sha256sum -c SHA256SUMS` passes. `references/pass2/` is unchanged, and its own `SHA256SUMS` passes. `python3 scripts/validate_pack.py` and `python3 scripts/validate_m01_assets.py` pass, with no failures (they write a `__pycache__/`, which is not part of the pack; delete it) |
| **Contents** | R00 (foundation integration) and three feature missions: M01, the mission companion; M02, the dsh upgrade; M03, the research workflow. Also their Claude and Codex launch prompts, and protocol `sophia.dev-handoff.v1.1`. v1.1 adds M01's exact system prompt, its complete mission-lifecycle skill, the assembled system instruction, the asset manifest and the [loading contract](2026-09-27-companion-research/shared/M01_PROMPT_LOADING.md) |
| **Status** | Additive guidance. The frozen [pack v0.4](../pack/00_START_HERE.md) and the S1-05A records are unchanged. Nothing in the folder grants an authority, approves an operation or records an executed one |
| **Repository records that follow it** | [R00 progress](../progress/R00-foundation.md) and the R00 preflight [S1-05A-CC-0034](../coordination/S1-05A/S1-05A-CC-0034.md) on issue #14. [SMC-M01 progress](../progress/SMC-M01.md), its [contract binding](../progress/SMC-M01-contract-binding.md) and its [coordination](../coordination/SMC-M01/README.md) on issue #17 |

## [2026-10-03-workboard-connection/](2026-10-03-workboard-connection/00_START_HERE.md)

| Item | Value |
|---|---|
| **Source** | `Sophia_Workboard_Connection_Missions_v1.0_2026-10-03.zip` (sha256 `7ca48b53201c38807d66613be7649aad9852f18306ca92feb96589b6cc2efa8f`), which Davide gave to the WBC-01 implementation session on 2026-10-03 with the WBC-01 launch and an ownership amendment (Davide implements, Luis reviews design and UX, Codex reviews code) |
| **Installed** | By Claude Code during WBC-01, on 2026-10-03: all 30 files, the 29 that `FILE_HASHES.sha256` lists and that file itself. In the folder, `sha256sum -c FILE_HASHES.sha256` passes for all 29. `checks/validate_packet.py` was not run here (its Python dependencies are not installed on this machine); its recorded results are the packet's own (`checks/packet-validation.json`) |
| **Contents** | Two missions: WBC-01 (Tasks made ready for real work state, fixture-backed) and WBC-02 (one Paperclip-managed source review). The shared binding contract, the proposed `sophia.work.board.v1` and `sophia.work.receipt.v1` schemas with synthetic examples, launch prompts, the Claude ↔ Codex protocol, the source register and a standalone explanation for Luis |
| **Status** | Additive guidance under the [v2.0 continuation](../execution/2026-10-01-unified/00_START_HERE.md). The schemas are proposals, not generated contracts or endpoints. Nothing in the folder grants an authority, approves an operation or records an executed one |
| **Repository records that follow it** | [WBC-01 progress](../progress/WBC-01.md) and its [coordination](../coordination/WBC-01/README.md) |

## [2026-10-04-native-design/](2026-10-04-native-design/00_START_HERE.md)

| Item | Value |
|---|---|
| **Source** | `Sophia_Native_Design_Mission_Pack_v0.1_2026-10-04.zip` (sha256 `8b1da80c499d0bc6fb379c6b653e76bb962eb4d064c9247698410c9de6e68ca7`, the same bytes M75 recorded), which Davide gave to the SDD-01 implementation session on 2026-10-05 with the SDD-01 launch and a proposed parallel-execution addendum for SDD-01 and WBC-02 (kept as [PARALLEL_EXECUTION_ADDENDUM.md](../coordination/SDD-01/PARALLEL_EXECUTION_ADDENDUM.md)) |
| **Installed** | By Claude Code during SDD-01, on 2026-10-05: all 32 files, the 31 that `SHA256SUMS.txt` lists and that file itself. In the folder, `sha256sum -c SHA256SUMS.txt` passes for all 31. `python3 tools/test_inventory_raven.py` passes (6 synthetic tests; they write a `__pycache__/`, which is not part of the pack; delete it). The pack was not installed during M75 (M75's records name the zip and say it needed a path); this folder follows the convention of the two packs above, and Davide may move it |
| **Contents** | M75 (PR #75 closed out as the reader/rendering foundation, merged as `cec3947`) and SDD-01 (native dsh HTML design, independent visual review and iteration): decisions, the Raven import contract, runtime and artifact bindings, acceptance and evidence, the communication protocol with the `sophia.native-design.v0.1` profile, the release runbook, launch prompts, the candidate runtime prompts in `runtime/`, the donor manifest and its inventory helper |
| **Status** | Additive guidance under the [v2.0 continuation](../execution/2026-10-01-unified/00_START_HERE.md). The new role, tool and record names are proposals the [binding map](../coordination/SDD-01/BINDING_MAP.md) binds to this repository. Nothing in the folder grants an authority, approves an operation or records an executed one |
| **Repository records that follow it** | [SDD-01 progress](../progress/SDD-01.md), its [coordination](../coordination/SDD-01/README.md) and [binding map](../coordination/SDD-01/BINDING_MAP.md); M75's [handoff](../coordination/M75/HANDOFF_TO_SDD01.md) |

## [2026-10-09-con01-conversations/](2026-10-09-con01-conversations/README.md)

| Item | Value |
|---|---|
| **Source** | `Sophia_CON01_Mission_Pack_v0.1_2026-10-09.zip` (sha256 `88897af565bffd9e6d85e10b1c54c135da110be31e5e760b8c0be3aa6f52da3c`), which Davide gave to the CON-01 implementation session on 2026-10-09 with the Claude Code launch |
| **Installed** | By Claude Code during CON-01, on 2026-10-09: all 29 files, the 28 that `SHA256SUMS.txt` lists and that file itself. In the folder, `sha256sum -c SHA256SUMS.txt` passes for all 28. `python3 -I -B scripts/validate_pack.py`, run from outside the folder, reports 26 local links, 36 acceptance cases, 3 preserved references, 28 checksums and no errors (it writes nothing) |
| **Contents** | CON-01, saved project conversations: mission and product boundary, baseline and bindings as the pack read them at `695fe44`, the conversation contract and saved-text policy proposal, runtime and context, Claude ↔ Codex coordination, gates G0–G5, the 36-case acceptance matrix, operations and the in-app test, the source register, templates, the launch prompts, an offline reader, and the v3 CON-01 goal and two architecture excerpts as original bytes (`references/v3/*.original.txt`) |
| **Status** | Additive guidance under the [v2.0 continuation](../execution/2026-10-01-unified/00_START_HERE.md). The v3 parent pack it names is not installed in this repository. The pack's statement that PR #190 installs v3 is stale: #190 is SDD-01 G7 voice ([binding map](../coordination/CON-01/BINDING_MAP.md) §0). Nothing in the folder grants an authority, approves an operation or records an executed one |
| **Repository records that follow it** | [CON-01 progress](../progress/CON-01.md), its [coordination](../coordination/CON-01/README.md) and [binding map](../coordination/CON-01/BINDING_MAP.md) |
