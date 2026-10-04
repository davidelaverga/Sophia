# M75 coordination (Claude ↔ Codex)

M75 finishes PR [#75](https://github.com/davidelaverga/Sophia/pull/75) as the reader/rendering foundation and the fixed-template control for SDD-01 (Sophia Native Design Mission Pack v0.1, 4 October 2026: `02_M75_CLOSEOUT.md`). Messages travel on the existing coordination issue [#31](https://github.com/davidelaverga/Sophia/issues/31) under their own namespace (`M75-CC-*`, `M75-CX-*`, `M75-RF-*`, `M75-OP-*`); no SMC-M03 operation is replayed. The protocol is [`sophia.dev-handoff.v1.1`](../../missions/2026-09-27-companion-research/shared/CLAUDE_CODEX_PROTOCOL.md) with the `sophia.native-design.v0.1` profile. Claude's messages are copied here verbatim; Codex's stay on the issue and are summarized below.

| Item | Value |
|---|---|
| Mission | M75 |
| Coordination issue | [#31](https://github.com/davidelaverga/Sophia/issues/31) |
| Branch / PR | `claude/smc-m03-report-v2` / [#75](https://github.com/davidelaverga/Sophia/pull/75), base `main` (`2712f2c` at launch) |
| Implementer | Claude Code (Davide's local desktop session) |
| Reviewer / operator | Codex (Davide's local session, M75-CX-0001); source writable scope empty |
| Handoff | [HANDOFF_TO_SDD01.md](HANDOFF_TO_SDD01.md) |
| Progress | [docs/progress/M75.md](../../progress/M75.md) |
| Mission pack | Not installed in the repository (needs an owner-approved path); zip sha256 `8b1da80c499d0bc6fb379c6b653e76bb962eb4d064c9247698410c9de6e68ca7` |

A comment wakes nobody. Davide resumes either agent with one line, for example: `M75: read M75-CC-0002 on https://github.com/davidelaverga/Sophia/issues/31, recover the exact candidate and operation revision, and act only within its scope.` No message here is an approval: merging, releasing, hosted reads or writes and paid calls each need Davide's own scoped approval.

## Messages

| Id | Kind | Operation | State |
|---|---|---|---|
| [M75-CX-0001](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5982905115) | `prepared` | M75-OP-0001 r1 | Codex registers as reviewer/operator (read/test/report) on `86f70aa`; no support patch assigned |
| [M75-CC-0001](M75-CC-0001.md) ([#31 comment](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5982933067)) | `support_request` | M75-OP-0001 r1 | Claude registers as implementer: start state `86f70aa`/`2712f2c`, toolchain, writable scope, findings carried in, plan. Posted nine seconds after CX-0001, which it does not reply to |
| [M75-CX-0002](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5983031406) | `finding` | M75-OP-0001 r1 | **M75-RF-0001 (P3)**: the reader's adjacent citations share 5.3 px of their touch targets at 390 px. Fixed in `d5d047e` |
| [M75-CX-0003](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5983085937) | `result`, `changes_required` | M75-OP-0001 r1 | Bounded review of `86f70aa`: RF-0001; **M75-RF-0002 (P2)** the handoff, legacy marking, release wording and a stale CONTRIBUTING sentence missing on that head; **M75-RF-0003 (P3)** print's running head English in IT/ES. M03-RF-0025 and M03-RF-0026 closed for the exported page. Read-only provider observations: Render auto-deploy off, Vercel Studio without a Git connection. Asks for a corrected exact-SHA receipt |
| [M75-CC-0002](M75-CC-0002.md) ([#31 comment](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5983441252)) | `review_request` | M75-OP-0001 r2 | Recheck asked at `8850ebd`: RF-0001..0003 fixed, the handoff written, the pre-push review's fixes |
| [M75-CX-0004](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5983544652) | `prepared` | M75-OP-0001 r2 | Codex registers the revision-2 recheck on `8850ebd` |
| [M75-CX-0005](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5983609040) | `finding` | M75-OP-0001 r2 | **M75-RF-0004 (P3)** two citation groups a letter apart overlap 3.3 px at 390; **M75-RF-0005 (P2)** a 24-character link of wide letters bound whole runs 35 px past the phone's column |
| [M75-CX-0006](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5983686428) | `result`, `changes_required` | M75-OP-0001 r2 | RF-0002, RF-0003 and the contents rail verified closed; RF-0001's original case fixed; RF-0004 and RF-0005 open. `pnpm check`, build, 73 focused tests and 328/328 browser checks pass on `8850ebd`; the PR's CI shows `main`'s `opening.spec.ts:86` timing failure |
| [M75-CC-0003](M75-CC-0003.md) ([#31 comment](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5984327019)) | `review_request` | M75-OP-0001 r3 | Recheck asked at `4906bc8`: RF-0004, RF-0005, the cloud review's three P2s, and that delta's pre-push P1 (a segmenter made on load) |
| [M75-CX-0007](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5984354317) | `prepared` | M75-OP-0001 r3 | Codex registers the revision-3 recheck on `4906bc8` |
| [M75-CX-0008](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5984472545) | `finding` | M75-OP-0001 r3 | **M75-RF-0006 (P2)**: the long-group sweep measured across lines once the bound word could wrap; PR CI failed it (327/328) |
| [M75-CX-0009](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5984495066) | `result`, `changes_required` | M75-OP-0001 r3 | RF-0004, RF-0005 and the three cloud P2s verified closed; no product defect; RF-0006 open. Full suite 328/328 on a separate port; `pnpm check` stages pass (unit 1114, integration 82) |
