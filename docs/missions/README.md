# docs/missions/

Mission packs, one folder per pack, each installed byte for byte. The pack's own `SHA256SUMS` passes in its folder, and its `scripts/validate_pack.py` reads only the folder itself. Installation records live here rather than inside a pack, so the pack keeps its exact file set.

## [2026-09-27-companion-research/](2026-09-27-companion-research/00_START_HERE.md)

| Item | Value |
|---|---|
| **Source** | `Sophia_Three_PR_Mission_Pack_v1.0_2026-09-27.zip`, which Davide gave to the S1-05A implementation session on 2026-09-27 with the R00 launch |
| **Installed** | By Claude Code during R00, on 2026-09-27, byte for byte: 49 files, the 48 that `SHA256SUMS` lists and the manifest itself. In the folder, `sha256sum -c SHA256SUMS` passes. `references/pass2/` is unchanged, and its own `SHA256SUMS` passes (`evidence/reference_preservation.json`). `python3 scripts/validate_pack.py` passes, with no failures |
| **Contents** | R00 (foundation integration) and three feature missions: M01, the mission companion; M02, the dsh upgrade; M03, the research workflow. Also their Claude and Codex launch prompts, and protocol `sophia.dev-handoff.v1.1` |
| **Status** | Additive guidance. The frozen [pack v0.4](../pack/00_START_HERE.md) and the S1-05A records are unchanged. Nothing in the folder grants an authority, approves an operation or records an executed one |
| **Repository records that follow it** | [R00 progress](../progress/R00-foundation.md) and the R00 preflight [S1-05A-CC-0034](../coordination/S1-05A/S1-05A-CC-0034.md) on issue #14 |
