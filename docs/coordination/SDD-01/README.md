# SDD-01 coordination (Claude ↔ Codex)

SDD-01 is the native dsh HTML design mission: a requested HTML research deliverable is designed by a native designer role from its frozen research, checked in its rendered pixels, reviewed by a separate native reviewer, saved as an immutable rendition, steered while it works and revised by section later (Sophia Native Design Mission Pack v0.1, [installed here](../../missions/2026-10-04-native-design/00_START_HERE.md): `03_SDD01_MISSION.md`). It starts from M75's merged foundation ([handoff](../M75/HANDOFF_TO_SDD01.md)).

| Item | Value |
|---|---|
| Mission | SDD-01 |
| Protocol | [`sophia.dev-handoff.v1.1`](../../missions/2026-09-27-companion-research/shared/CLAUDE_CODEX_PROTOCOL.md) with the `sophia.native-design.v0.1` profile ([pack 07](../../missions/2026-10-04-native-design/07_COMMUNICATION_PROTOCOL.md)) |
| Message ids | `SDD-01-CC-####` (Claude), `SDD-01-CX-####` (Codex), findings `SDD-01-RF-####`, operations `SDD-01-OP-####`, allocated from the coordination issue |
| Coordination issue | Created with the PR; its number is recorded here in the commit after it exists |
| Branch / PR | `claude/sdd01-native-html-design` / the draft PR opened from it |
| Base | `main` `ed6f3cd` |
| Implementer | Claude Code (cloud session); sole implementation writer for the paths in the [binding map](BINDING_MAP.md) §1 |
| Reviewer / operator | Codex: independent review, isolated verification, the hosted operations and the in-app tests. Its source writable scope is empty unless a `codex/*` path list is assigned |
| Owner | Davide: product, spend, merge and release. Luis: integration review (AGENTS.md) |
| Parallel track | WBC-02 (Paperclip source review), under the [proposed addendum](PARALLEL_EXECUTION_ADDENDUM.md); shared-boundary requests in the binding map §9 |
| Progress | [docs/progress/SDD-01.md](../../progress/SDD-01.md) |

A comment wakes nobody. Davide resumes either agent with one line, for example: `SDD-01: read <the latest SDD-01-CC message> on <the coordination issue>, recover the exact candidate and operation revision, and act only within its scope.` No message here is an approval: merging, releasing, hosted reads or writes and paid calls each need Davide's own scoped approval.

## Messages

| Id | Kind | Operation | State |
|---|---|---|---|
