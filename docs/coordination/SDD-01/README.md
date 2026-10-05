# SDD-01 coordination (Claude ↔ Codex)

SDD-01 is the native dsh HTML design mission: a requested HTML research deliverable is designed by a native designer role from its frozen research, checked in its rendered pixels, reviewed by a separate native reviewer, saved as an immutable rendition, steered while it works and revised by section later (Sophia Native Design Mission Pack v0.1, [installed here](../../missions/2026-10-04-native-design/00_START_HERE.md): `03_SDD01_MISSION.md`). It starts from M75's merged foundation ([handoff](../M75/HANDOFF_TO_SDD01.md)).

| Item | Value |
|---|---|
| Mission | SDD-01 |
| Protocol | [`sophia.dev-handoff.v1.1`](../../missions/2026-09-27-companion-research/shared/CLAUDE_CODEX_PROTOCOL.md) with the `sophia.native-design.v0.1` profile ([pack 07](../../missions/2026-10-04-native-design/07_COMMUNICATION_PROTOCOL.md)) |
| Message ids | `SDD-01-CC-####` (Claude), `SDD-01-CX-####` (Codex), findings `SDD-01-RF-####`, operations `SDD-01-OP-####`, allocated from the coordination issue |
| Coordination issue | [#103](https://github.com/davidelaverga/Sophia/issues/103) |
| Branch / PR | `claude/sdd01-native-html-design` / [#104](https://github.com/davidelaverga/Sophia/pull/104) (draft) |
| Base | `main` `ed6f3cd` |
| Implementer | Claude Code (cloud session); sole implementation writer for the paths in the [binding map](BINDING_MAP.md) §1 |
| Reviewer / operator | Codex: independent review, isolated verification, the hosted operations and the in-app tests. Its source writable scope is empty unless a `codex/*` path list is assigned |
| Owner | Davide: product, spend, merge and release. Luis: integration review (AGENTS.md) |
| Parallel track | WBC-02 (Paperclip source review), under the [proposed addendum](PARALLEL_EXECUTION_ADDENDUM.md); shared-boundary requests in the binding map §9 |
| Progress | [docs/progress/SDD-01.md](../../progress/SDD-01.md) |
| Release packet | [PRODUCTION_BATCH.md](PRODUCTION_BATCH.md): what ships, its identities, preconditions, order, qualification and rollback |

A comment wakes nobody. Davide resumes either agent with one line, for example: `SDD-01: read <the latest SDD-01-CC message> on <the coordination issue>, recover the exact candidate and operation revision, and act only within its scope.` No message here is an approval: merging, releasing, hosted reads or writes and paid calls each need Davide's own scoped approval.

## Messages

| Id | Kind | Operation | State |
|---|---|---|---|
| [SDD-01-CC-0001](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-5999501561) | review_request | OP-0001 r1: G0 binding and G1 import at `16fb5c6` | Awaiting Codex |
| [SDD-01-CC-0002](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6001384489) | review_request | OP-0002 r1: G2–G4 and the G5/G6 parts at `a53480b` | Superseded by r2, r3 (CC-0003, CC-0004: main merged) |
| [SDD-01-CX-0001](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6002542800) | prepared | OP-0001 r1 | Codex's G0/G1 review started |
| [SDD-01-CX-0002](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6002761520) | review_finding | OP-0002 r3 at `b1e227e` | RF-0001, RF-0002 (P2): changes required; review continues |
| [SDD-01-CC-0005](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6003217977) | review_request | OP-0002 r4: RF-0001 and RF-0002 fixed, at `719a402` | Superseded by r5 |
| [SDD-01-CC-0006](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6003598634) | review_request | OP-0002 r5 at `a67979b` (main merged, lint fix) | Reviewed in CX-0003, CX-0004 |
| [SDD-01-CX-0003](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6003915137) | review_finding | OP-0002 r5 | RF-0001, RF-0002 `pass_for_scope`; RF-0003 (P1) and the completion request |
| [SDD-01-CX-0004](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6004171711) | review_finding | OP-0002 r5 | RF-0004 (P2): the required renderer CI omitted the capture kernel |
| [SDD-01-CX-0005](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6004340895), [CX-0006](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6004451148), [CX-0007](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6004569512) | prepared | production preflight (read-only) | The ledger at 0036; six terminal running bindings on m03; no renderer, no byte store; the runtime host fails the confinement prerequisite. Folded into [PRODUCTION_BATCH.md](PRODUCTION_BATCH.md) §0 |
| SDD-01-CC-0007 | review_request | OP-0002 r6: RF-0003 and RF-0004 fixed, the G5 gaps closed, guide v1.3, the production batch | Posted on #103 with this push |
