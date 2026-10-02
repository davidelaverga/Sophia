# docs/execution/

Execution and continuation packs, one folder per pack, each installed byte for byte. A pack's own `SHA256SUMS.txt` passes in its folder. Installation records live here rather than inside a pack, so the pack keeps its exact file set.

## [2026-10-01-unified/](2026-10-01-unified/00_START_HERE.md)

| Item | Value |
|---|---|
| **Source** | `Sophia_Unified_Continuation_Pack_v2.0_2026-10-01.zip` (sha256 `5eccd48a8e2dfeb45b98a7487e9fbe5d7e82df0cb74ab5d9e6afaa7148754206`), which Luis gave to his Claude Code session on 2026-10-02 (UTC) with the instruction to start LFE-00 |
| **Installed** | By Claude Code during LFE-00, on 2026-10-02 (UTC): all 307 files, the 306 that `SHA256SUMS.txt` lists and that file itself. In the folder, `sha256sum -c SHA256SUMS.txt` passes for all 306. `python scripts/validate.py` passes with no errors on a throwaway copy ([run output](../evidence/unified-v2.0/validate.run.txt)). It rewrites `tests/documentation-validation.json` and `tests/design-model-output.txt`, so it never runs in place |
| **Contents** | The cumulative forward plan (v2.0): product and releases, the current baseline as the pack read it, decisions and supersession, sequence and ownership, the code/integration map, goals, Luis's frontend packages (LFE-00 … LFE-16), launch prompts, architecture, bindings, the personal-assistant design, proposed contracts and fixtures, and an offline reader (`READER.html`) |
| **Status** | Forward planning and navigation authority, as its [00_START_HERE](2026-10-01-unified/00_START_HERE.md) states. It supersedes the planning of the v0.4 pack in [`docs/pack/`](../pack/00_START_HERE.md), which stays byte-identical as history. The other packs it names (v0.3, the September 30 coordination continuation, the October 1 v1.0 overlay) were never installed here. Nothing in the folder grants an authority, approves an operation or records an executed one. Repository security rules, current source, explicit owner decisions and in-flight missions (M03 on issue [#31](https://github.com/davidelaverga/Sophia/issues/31) and PR [#32](https://github.com/davidelaverga/Sophia/pull/32)) remain binding |
| **Read at** | main `aadd192` (2026-10-01). What moved since, and where the source and deployments stand now, is in [LFE-00 progress](../progress/LFE-00.md); the pack itself is not edited |
