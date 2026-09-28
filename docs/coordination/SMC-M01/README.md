# SMC-M01 coordination (Claude ↔ Codex)

Messages travel on **one coordination issue, [#17](https://github.com/davidelaverga/Sophia/issues/17)**, created for this mission through the repository connection. The protocol is [`sophia.dev-handoff.v1.1`](../../missions/2026-09-27-companion-research/shared/CLAUDE_CODEX_PROTOCOL.md). Claude's messages are copied here verbatim with their comment links; Codex's replies stay on the issue and are summarized in the table below.

| Item | Value |
|---|---|
| Mission | SMC-M01 |
| Coordination issue | [#17](https://github.com/davidelaverga/Sophia/issues/17) |
| Implementation branch | `claude/upbeat-feynman-d7jskb` |
| Implementation PR | the draft PR for that branch |
| Implementer | Claude Code, session `https://claude.ai/code/session_01WYqdvEfR8p7mTf1Wbh1b4f` |
| Operator | Codex, started by Davide with [launch/M01_CODEX.md](../../missions/2026-09-27-companion-research/launch/M01_CODEX.md); its session is recorded from its first message |
| Implementer's writable scope | this repository's source, migrations, tests and docs, on its own branch; disposable local databases |
| Operator's permitted work without a further request | read-only inspection (protocol §5) |

## How a message reaches the other agent

| Direction | Carried by | Wakes the recipient by |
|---|---|---|
| Claude → Codex | A comment on #17 with the full request | Davide starting or resuming Codex with one line: `SMC-M01: read <message id> on #17 and act within its scope.` A comment alone wakes nobody |
| Codex → Claude | A comment on #17 with the full message | A one-line wake pointer on the implementation PR (`SMC-M01-CX-NNNN posted on #17: <kind> for <operation_id>.`). The Claude session is subscribed to that PR's activity; it also reads #17 at every checkpoint |

Every message is immutable. A correction is a new message with `supersedes`. Approval is Davide's own words, relayed verbatim with where he gave them, or a verified human action: an agent's comment in the owner's name is not approval, because both agents post as `davidelaverga`. The repository is public: ids, checksums, counts and statuses only.

**A good request** names the exact commit, the question, the allowed scope (read-only unless an approval says otherwise), the expected reply and its size, and what is not allowed. **A good reply** gives the conclusion first, then the findings with their sources, the commands and exit codes run, and one next action; large logs stay in the operator's private journal and are named, not pasted.

## Messages

| Id | Kind | Operation | State |
|---|---|---|---|
| [SMC-M01-CC-0001](SMC-M01-CC-0001.md) | `inspect_request` | SMC-M01-OP-0001 (read only) | the M01 channel's first request: the live tuple, the ledger, the free migration number and counts |
