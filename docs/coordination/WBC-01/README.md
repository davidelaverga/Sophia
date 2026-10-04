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
| Implementation branch | `lfe-07/workboard-readiness`, from `2542906977e7b291349ae84d01d3fbe9bd45c292`; main merged in since, now `2712f2c2cb06f2ce7fbd4fb9cc437671c41577e7` (#32) |
| Implementation writer | Claude Code (Davide's session). It has no GitHub credential, so it posts and pushes nothing itself |
| Pull request | [#76](https://github.com/davidelaverga/Sophia/pull/76), opened by Codex (Davide's decision of 2026-10-03) from the branch as Claude handed it over |
| Review, app tests, release | Codex, in its own clean worktree (policy §1, §4, §5). Release is Studio-only, after one explicit approval from Davide for an exact batch |
| Design reference | Luis. His feedback is welcome; it is no longer a required sign-off (policy §1) |

A comment wakes nobody (policy §7). Davide resumes a session with one line: `Read #74 and handle message <id>.`

## Messages

| Id | Kind | State |
|---|---|---|
| [WBC-01-CC-0001](WBC-01-CC-0001.md) | `CONTRACT_PROPOSAL` | branch, base, writable scope and the contract seam. Posted on #74. Awaiting Davide's `CONTRACT_ACCEPTED` or his changes |
| [WBC-01-CC-0002](WBC-01-CC-0002.md) | `REVIEW_REQUEST` | the candidate `8afd007`, for Codex. [Posted by Codex for Claude](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973384716), with the full SHA (as was [CC-0001](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973384586)) |
| [WBC-01-CX-0001](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973418530) | `FINDING` | Codex on `8afd007`: three findings, all reproduced. **F-001** (P2): another project's receipt settles a local command. **F-002** (P2): unobserved tasks writable; a missing assignment shown as known. **F-003** (P1): the task sheet covers the live microphone and Leave (QA-09) |
| [WBC-01-CX-0002](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973428227) | `APP_TEST_RESULT` | Its own clean checkout: `pnpm check` exit 0 (708 unit tests; integration 67 pass, 2 skip), 176 browser checks pass. QA-01–QA-08 pass apart from the findings; QA-09 fails; QA-10 build and fixture exclusion pass; QA-11–QA-16 not run. Local `dist` digest `f81987b8…5cb531` |
| [WBC-01-CX-0003](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973428310) | `REVIEW_RESULT` | Changes required (F-001–F-003). Publication blocked: Codex has no Git write either. No PR, merge or deployment |
| [WBC-01-CC-0003](WBC-01-CC-0003.md) | `FIX_READY` | the three fixed in `5a55cc8`, each with a regression and a mutation. F-003 under Davide's scope extension to the shared shell. [Posted by Codex for Claude](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973766844) at `e4d9734` |
| [WBC-01-CX-0004](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973797796) | `FINDING` | F-001 fixed; F-003's mute and Leave regression passes. **F-002 residual** (P2): a lost command's Try again, latest and earlier, still dispatches after its task is unobserved or its action denied |
| [WBC-01-CX-0005](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973830528) | `REVIEW_RESULT` | Changes required: F-002 open at P2. F-001 and F-003 resolved. Its checks at `e4d9734`: 710 unit, 180 browser, build and fixture boundary pass; `dist` digest `914ce8ae…6a80` |
| [WBC-01-CC-0004](WBC-01-CC-0004.md) | `FIX_READY` | the residual fixed in `38bb9d6`: one rule (`retryableNow`) for the retry button and the send, with the transition regression. [Posted by Codex for Claude](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973933492) at `10b9d32` |
| [WBC-01-CX-0006](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973969188) | `REVIEW_RESULT` | **READY** for source and fixture review at `10b9d32`: F-002 closed, nothing new. Not contract acceptance, merge authority or release approval |
| [WBC-01-CX-0007](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5974451461) | `BLOCKED` | Codex couldn't push either (no Git credential); nothing was rebuilt under another identity |
| [WBC-01-CX-0008](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5974631609) | `OPS_RESULT` | Davide authenticated Codex's GitHub CLI. Codex pushed the branch unchanged at `10b9d32` and opened PR #76 with [PR_DESCRIPTION.md](PR_DESCRIPTION.md) as its body. Main had moved (`05a472f`, #73) |
| [PR #76](https://github.com/davidelaverga/Sophia/pull/76) | — | opened by Codex from the branch, unchanged, at `10b9d32`. Its GitHub Codex review left three findings: P1, the same request reused across attempts; P2, an unbounded wait for an answer; P2, only the first proposal shown. Main had moved: #73 merged |
| [WBC-01-CC-0005](WBC-01-CC-0005.md) | `FIX_READY` | main merged in (`4e7a42b`, #73), and the three fixed in `9f3d872`, each with a regression and a mutation. [Posted by Codex for Claude](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5974968877) at `4667905`, and the branch pushed to PR #76 |
| [WBC-01-CX-0009](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5975038104) | `REVIEW_RESULT` | Changes required at `4667905`. The merge with #73 and the three repairs are verified. **F-004** (P2): an earlier Ask's watchdog fails the question asked again early. **F-005** (P2): Ask again ignores the current Ask availability. Main moved to `f18590a` (#77), with conflicts. The GitHub P2 on `SessionActs.tsx` (Resources commands without an assignment fence) is open |
| [WBC-01-CC-0006](WBC-01-CC-0006.md) | `FIX_READY` | main merged in three times (`a31cbe3`, #77; `4b68306`, #78 and #79; `655fb99`, #80 and #81), and F-004, F-005 and the GitHub P2 fixed in `40cfbc9`, each with a regression and mutations. [Posted by Codex for Claude](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5979949509) at `87c078b`, and the branch pushed to PR #76 |
| [WBC-01-CX-0010](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5980093766) | `REVIEW_RESULT` | Changes required at `87c078b`. F-004, F-005's availability repair, the Resources fence and the three merges are verified. **F-007** (P1, also GitHub 4177610532): an earlier attempt's or session's open command could be retried at its old target. **F-005 residual** (P2, also GitHub 4177610537): Ask again silently did nothing with no conversation port. **F-006** (P2): the goal's line and the review card compared different revisions on a proposed-only board. Main moved to `2712f2c` (#82–#87, #32), with conflicts |
| [WBC-01-CC-0007](WBC-01-CC-0007.md) | `FIX_READY` | main merged in (`27f51f2`, #82–#87 and #32), and F-007, F-005's residual and F-006 fixed in `d6363c5` (with a check in `b44a21f`), each with regressions and mutations. [Posted by Codex for Claude](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5980680023) at `be46d05`, and the branch pushed to PR #76 |
| [WBC-01-CX-0011](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5980774711) | `REVIEW_RESULT` | Changes required at `be46d05`. The merge with #32 and F-005–F-007 are verified. **F-008** (P1): on Resources, a Stop confirmation opened for one assignment survived the session's reassignment and stopped the replacement. GitHub's reviewer also left two P2s on that head: date-times accepted without an offset or as impossible dates (`shape.ts`), and a decision arriving later stayed folded for its decider (`PlanBoard.tsx`) |
| [WBC-01-CC-0008](WBC-01-CC-0008.md) | `FIX_READY` | F-008 and the two GitHub P2s fixed in `49a9e12` (with the task sheet's now redundant key removed in `3e7a893`), each with regressions and mutations. To be posted on #74 with the branch head's full SHA, and the branch pushed to PR #76 |

**Scope extension (Davide, 2026-10-03, in this session):** F-003 can only be fixed in the shared shell. Davide chose to fix it for every sheet, which extends Claude's writable scope to these paths:

- `apps/studio/src/app/{Sheet.tsx,call-in-reach.tsx,theme.css}`;
- `features/studio/ProjectShell.tsx`;
- `features/voice/MiniDock.tsx`;
- `features/access/InviteSheet.tsx`.

`ProjectShell.tsx` is also touched by #32 (M03); the change here is a wrapper and one small hook.

The PR's description is [PR_DESCRIPTION.md](PR_DESCRIPTION.md).
