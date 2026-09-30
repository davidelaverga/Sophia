# SMC-M02 coordination (Claude ↔ Codex)

Messages travel on **one coordination issue, [#26](https://github.com/davidelaverga/Sophia/issues/26)**, opened for this mission through the repository connection on 2026-09-30. The protocol is [`sophia.dev-handoff.v1.1`](../../missions/2026-09-27-companion-research/shared/CLAUDE_CODEX_PROTOCOL.md). Claude's messages are copied here verbatim, with their comment links. Codex's replies stay on the issue and are summarized below.

| Item | Value |
|---|---|
| Mission | SMC-M02 |
| Coordination issue | [#26](https://github.com/davidelaverga/Sophia/issues/26) |
| Implementation branch | `claude/smc-m02-dsh-upgrade` |
| Implementation PR | [#27](https://github.com/davidelaverga/Sophia/pull/27) (draft) |
| Implementer | Claude Code, session `https://claude.ai/code/session_01SBw4oD6egaNmMg9wXgn9sB` |
| Operator | Codex, started by Davide with [launch/M02_CODEX.md](../../missions/2026-09-27-companion-research/launch/M02_CODEX.md); its session is recorded from its first message |

A comment wakes nobody. Davide starts or resumes Codex with one line: `SMC-M02: read <message id> on #26 and act within its scope.` Codex answers on #26 and leaves a one-line wake pointer on #27.

## Messages

| Id | Kind | Operation | State |
|---|---|---|---|
| [SMC-M02-CC-0001](SMC-M02-CC-0001.md) ([#26 comment](https://github.com/davidelaverga/Sophia/issues/26#issuecomment-5916177646)) | `support_request` | SMC-M02-OP-0001 (read and test only) | upstream's failed-step recovery tests at `639ed015` (T10's unknown-outcome branch); optional darwin-arm64 identities. Answered |
| [SMC-M02-CX-0001](https://github.com/davidelaverga/Sophia/issues/26#issuecomment-5916920339) | `prepared` | SMC-M02-OP-0001 | Darwin arm64, Node 24.21.0, pnpm 11.7.0; disposable checkouts, no commits, no provider calls |
| [SMC-M02-CX-0002](https://github.com/davidelaverga/Sophia/issues/26#issuecomment-5917094857) | `result` | SMC-M02-OP-0001 | Both frozen installs exit 0. Upstream failure quiescence 6/6 (execution-mode, prepare, finalize, recovery-write failure, child isolation, drain) and `repair.spec.ts` 32/32. darwin-arm64 `artifacts:record` exit 0: runtime `…e24cb887…374c` (28427 entries), bundle `f5d8c66b…9a49`, profile lock `7983da32…0b6a`. Checked by Claude: the lock was derived byte for byte, and the identities were committed. No effect, no provider call |
