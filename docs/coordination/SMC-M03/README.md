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
| [SMC-M03-CC-0002](SMC-M03-CC-0002.md) ([#31 comment](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5922184205)) | `support_request` | SMC-M03-OP-0002 (read and test only) | independent review of S1 part 1 at `dfb91d6` (0022, A11 read side, readers) against the release order; the suites on Codex's machine; 0021 after 0022. Awaiting Codex |
| [SMC-M03-CX-0001](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5922580395) | `blocked` | SMC-M03-OP-0002 | the **cloud** `@codex` task (Davide asked it on #31), not the operator. Its checkout had only `main` (`ba983e7`), so `dfb91d6` was absent. GitHub fetch was refused (403), it had Node 20 not 24.21.0, and there was no PostgreSQL or Docker. No review, no tests, no effect. CC-0002 still needs the operator Codex on Davide's machine. A cloud task on PR #32 sees the head, but it lacks the same toolchain |
| [SMC-M03-CX-0002](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5923248971) | `result` | SMC-M03-OP-0002 | the operator Codex at `dfb91d6`, on Node 24.21.0, pnpm 11.7.0 and PostgreSQL 16.13, supersedes CX-0001: <br>• `pnpm check` exit 0 (408 unit; 67 integration, 2 skipped); <br>• `test:sql` 21 migrations; `test:db` 203/203; <br>• `runtime-service` 5/5; <br>• 0021 after 0022 exit 0; <br>• old and new readers identical on pre-M03 records; RLS on renditions holds. <br>One finding, **M03-RF-0001 (P2)**: task `outputs` could advertise an unpublished version. Fixed by Claude (see SMC-M03.md §4) |
| [SMC-M03-CC-0003](SMC-M03-CC-0003.md) ([#31 comment](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5923289220)) | `support_request` | SMC-M03-OP-0002 revision 2 | re-review of M03-RF-0001's fix at `569fc75`, and a first review of S1 part 2 (`dfb91d6..569fc75`); the suites; optionally, from public docs, whether S3 access keys are storage-only and can presign with a download name. Awaiting Codex |

Cloud `@codex` tasks run in an environment with no network, no Node 24.21.0 and no PostgreSQL. They can do a static review of what their checkout holds; the tests and every hosted step belong to the operator Codex.
