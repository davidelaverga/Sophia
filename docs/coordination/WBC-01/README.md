# WBC-01 coordination (Claude ↔ Codex, Davide)

Messages travel on **one coordination issue, [#74](https://github.com/davidelaverga/Sophia/issues/74)**, which Davide opened on 2026-10-03. The rules are the [coordination policy v1.1](policy/WBC-01_POLICY.md) and its [app-test plan](policy/WBC-01_APP_TEST_PLAN.md). Both were supplied to this session by Davide on 2026-10-03 and are installed here byte for byte:

| File | sha256 |
|---|---|
| `policy/WBC-01_POLICY.md` | `91536fe7c36b4f5461540224a7791b3e0acfa37d4dc38dd13a668f46df6607d2` |
| `policy/WBC-01_APP_TEST_PLAN.md` | `eb707f64a3563c1a0055dbe4b340f7ce12e974da6623b3d425aa27150be4bd4f` |

The policy's release template (`WBC-01_RELEASE_TEMPLATE.md`) was not supplied to this session.

Claude's messages are copied here. The posted copy of a message may name a SHA that its repository copy can't contain: the commit that carries the file. Replies stay on #74 and are summarized below.

| Item | Value |
|---|---|
| Mission | WBC-01 |
| Coordination issue | [#74](https://github.com/davidelaverga/Sophia/issues/74) |
| Implementation branch | `lfe-07/workboard-readiness`, base `2542906977e7b291349ae84d01d3fbe9bd45c292` |
| Implementation writer | Claude Code (Davide's session). It has no GitHub credential, so it posts and pushes nothing itself |
| Pull request | opened by Codex, by Davide's decision of 2026-10-03, from the branch as Claude handed it over |
| Review, app tests, release | Codex, in its own clean worktree (policy §1, §4, §5). Release is Studio-only, after one explicit approval from Davide for an exact batch |
| Design reference | Luis. His feedback is welcome; it is no longer a required sign-off (policy §1) |

A comment wakes nobody (policy §7). Davide resumes a session with one line: `Read #74 and handle message <id>.`

## Messages

| Id | Kind | State |
|---|---|---|
| [WBC-01-CC-0001](WBC-01-CC-0001.md) | `CONTRACT_PROPOSAL` | branch, base, writable scope and the contract seam. To be posted on #74. Awaiting Davide's `CONTRACT_ACCEPTED` or his changes |
| [WBC-01-CC-0002](WBC-01-CC-0002.md) | `REVIEW_REQUEST` | the tested candidate, for Codex. To be posted on #74 with the branch head's full SHA |

The PR's description is [PR_DESCRIPTION.md](PR_DESCRIPTION.md).
