# SMC-M01 coordination (Claude ↔ Codex)

Messages travel on **one coordination issue, [#17](https://github.com/davidelaverga/Sophia/issues/17)**, created for this mission through the repository connection. The protocol is [`sophia.dev-handoff.v1.1`](../../missions/2026-09-27-companion-research/shared/CLAUDE_CODEX_PROTOCOL.md). Claude's messages are copied here verbatim with their comment links; Codex's replies stay on the issue and are summarized in the table below.

| Item | Value |
|---|---|
| Mission | SMC-M01 |
| Coordination issue | [#17](https://github.com/davidelaverga/Sophia/issues/17) |
| Implementation branch | `claude/upbeat-feynman-d7jskb` |
| Implementation PR | [#18](https://github.com/davidelaverga/Sophia/pull/18) (draft) |
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
| [SMC-M01-CC-0001](SMC-M01-CC-0001.md) ([#17 comment](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5879898292)) | `inspect_request` | SMC-M01-OP-0001 (read only) | the M01 channel's first request: the live tuple, the ledger, the free migration number and counts |
| [SMC-M01-CX-0001](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5880038214) | `blocked` (partial) | SMC-M01-OP-0001 | schema, counts, roles, API health, Studio deployment and #16 observed; Render inspection stopped at the sign-in boundary the request excluded. Superseded by CX-0003 |
| [SMC-M01-CX-0002](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5880048077) | `result` | SMC-M01-OP-0001 | 0 non-terminal native tasks; the 2 non-terminal rows CX-0001 counted are work attempts |
| [SMC-M01-CX-0003](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5880197156) | `reconciled` | SMC-M01-OP-0001 | Davide opened a signed-in Render tab: the four services live at `0391bc6`, Auto-Deploy and PR Previews off; the bridge's `SOPHIA_LIVE_MODEL` and `GEMINI_API_KEY` are present, the model value masked and unverified |
| [SMC-M01-CC-0002](SMC-M01-CC-0002.md) ([#17 comment](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5880747058)) | `support_request` | SMC-M01-OP-0002 (read only) | before the release request: an independent review of the confirmation binding, forgetting, the note policy and 0018 on production's data; the 0018 dry run at `8a4b6a7`; how Render can deploy a commit that is not on its tracked branch. **Superseded by CC-0004** (a new candidate) |
| [SMC-M01-CC-0004](SMC-M01-CC-0004.md) ([#17 comment](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5881088629)) | `support_request`, revision 2 of OP-0002 | SMC-M01-OP-0002 (read only) | CC-0002's checks at the candidate that fixes the Codex GitHub review of #18: note-policy freshness, and the retired endpoint's contract. 0018's hash changed. **Superseded by CC-0005** |
| [SMC-M01-CC-0005](SMC-M01-CC-0005.md) ([#17 comment](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5881350659)) | `support_request`, revision 3 of OP-0002 | SMC-M01-OP-0002 (read only) | CC-0002's checks at the candidate that fixes the second Codex GitHub review of #18: CORS allows `PUT`, and a proposal replaces only a decision of its own kind. 0018's hash changed again. Waiting for Davide to wake Codex |
| [SMC-M01-CC-0003](SMC-M01-CC-0003.md) | `execution_request`, **draft, not posted** | SMC-M01-OP-0003 (release) | apply 0018, then the API and the bridge back to back, then the Studio, at the reviewed commit. Posted once #18 is merged after #16 and CC-0002 is answered; unapprovable until it names that commit |

**SMC-M01-OP-0001 has its answer:** every question in CC-0001 is observed except the exact `SOPHIA_LIVE_MODEL` value, which the dashboard masks. The operation was read only and left nothing to clean up. Claude checked each reply against CC-0001's seven questions; the findings and what they mean for M01 are in [the progress record](../../progress/SMC-M01.md#5-operations). The wake pointers arrived on #18 as designed ([CX-0001](https://github.com/davidelaverga/Sophia/pull/18#issuecomment-5880040204), [CX-0002](https://github.com/davidelaverga/Sophia/pull/18#issuecomment-5880048950), [CX-0003](https://github.com/davidelaverga/Sophia/pull/18#issuecomment-5880198238)).
