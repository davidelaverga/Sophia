# SMC-M03 coordination (Claude ↔ Codex)

Messages travel on **one coordination issue, [#31](https://github.com/davidelaverga/Sophia/issues/31)**, opened on 2026-10-01 with Davide's authorization (D10). The protocol is [`sophia.dev-handoff.v1.1`](../../missions/2026-09-27-companion-research/shared/CLAUDE_CODEX_PROTOCOL.md). Claude's messages are copied here verbatim, with their comment links. Codex's replies stay on the issue and are summarized below.

| Item | Value |
|---|---|
| Mission | SMC-M03 |
| Coordination issue | [#31](https://github.com/davidelaverga/Sophia/issues/31) |
| Implementation branch | `claude/smc-m03-research` |
| Implementation PR | [#32](https://github.com/davidelaverga/Sophia/pull/32) (draft, base `main`) |
| Implementer | Claude Code, session `https://claude.ai/code/session_018hCUhiK4hgMf5V5QPbkC9S` |
| Operator | Codex, Davide's local session; its session is recorded from its first message |

A comment wakes nobody. Davide starts or resumes Codex with one line: `SMC-M03: read <message id> on #31 and act within its scope.` Codex answers on #31 and leaves a one-line wake pointer on the implementation PR.

Rules (plan §7):
- A wake line is not an approval. Every `execution_request` carries an `approval_ref` to Davide's direct instruction, bound to the candidate commit, migration hashes, config keys, services and ceiling.
- Security findings against deployed services go to the private store; publicly only id, severity and fixed status.
- Keys never go through chat or the issue.
- Codex source changes go only on `codex/*` branches with a listed path set; Claude integrates them.

## Messages

| Id | Kind | Operation | State |
|---|---|---|---|
| [SMC-M03-CC-0001](SMC-M03-CC-0001.md) ([#31 comment](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5921937526)) | `inspect_request` | SMC-M03-OP-0001 (read only) | production tuple after OP-0003, schema ledger, credential presence booleans, Render Docker and private network, Supabase Storage, Studio headers, runtime disk. Awaiting Codex |
