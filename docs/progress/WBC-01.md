# WBC-01 — Tasks ready for real work state

Mission: [WBC-01](../missions/2026-10-03-workboard-connection/missions/WBC-01_UI_READINESS.md), under the [workboard connection packet](../missions/2026-10-03-workboard-connection/00_START_HERE.md) (v1.0, 2026-10-03). Parent scope: LFE-07.1, the shared LFE-06 controls and the interface parts of SCM-03/04. A follow-up to merged PR #63, not a rebuild of it.

**Status: fixture-ready.** Not source-ready for a live service, not integrated, not hosted, not accepted. This session made no endpoint, migration, provider call, deployment, runtime or prompt change. Under [coordination policy v1.1](../coordination/WBC-01/policy/WBC-01_POLICY.md), Codex may later release the Studio only, after Davide approves one exact batch. Claude deploys nothing.

## Owners and the handoff

| Role | Who | Since |
|---|---|---|
| Implementation owner | **Davide** (ownership amendment, 2026-10-03; the packet named Luis) | 2026-10-03 |
| Implementer | Claude Code, this session (Davide's Mac, darwin-arm64) | 2026-10-03 |
| Design reference | **Luis**. His visual and interaction decisions remain the baseline; his feedback on the walkthroughs is welcome, not a required sign-off (policy v1.1 §1) | — |
| Pull request | Codex opened [PR #76](https://github.com/davidelaverga/Sophia/pull/76) from the branch as handed over (Davide's decision) and pushes each handed-over head unchanged | 2026-10-03 |
| Independent review, app tests, release | Codex, in its own clean worktree, through [#74](https://github.com/davidelaverga/Sophia/issues/74) (policy v1.1 §3–§5; [app-test plan](../coordination/WBC-01/policy/WBC-01_APP_TEST_PLAN.md) QA-01–QA-16). No release yet | 2026-10-03 |
| Product, contract and release approval | Davide | — |

The amendment and policy v1.1 change who implements, reviews, tests and releases. Scope, preservation, acceptance and exclusions are the packet's.

**Start.** Branch `lfe-07/workboard-readiness` from main `2542906` (PR #72), 2026-10-03. The packet inspected `c8dd5aa` and rechecked `2c13747` (PR #70). Two PRs merged since: #71 (`answers.ts`: an unconfirmed answer kept by the decision's revision and viewer while the page lives; a followed address waits for its plan) and #72 (an address at open waits for its plan; the Resources grid keeps its Tab stop by tile id). Both are retained; neither changes the work, decision or action contracts.

**Baseline on `2542906`, unmodified:** `node --test "apps/studio/src/**/*.test.ts"` 423 pass; `playwright test e2e/work.spec.ts` 35 of 35 pass.

### Open work on the same files

Both PRs below have since merged, #73 on 2026-10-03 and #32 on 2026-10-04; each is merged into this branch (see the review sections below). The table keeps how the branch treated them while they were open.

| PR | Owner | Overlap | How this branch treats it |
|---|---|---|---|
| [#73](https://github.com/davidelaverga/Sophia/pull/73) LFE-07.2 slice 1, the progress review on the goal's line (open, head `b7caf58`) | Luis (EdX2C) | `plan.ts` (adds `WorkPlan.active_review`/`last_review`), `PlanNext.tsx`, `board.css`, `fixtures/work.tsx`, `fixtures/fixture-api.ts`, `e2e/work.spec.ts`, `docs/progress/LFE-07.md` | Not edited here: `review.ts`, `work-review.ts`, `fixture-api.ts`'s command route, PlanNext's review line, `docs/progress/LFE-07.md`. The other shared files conflict textually; whichever merges second rebases. For that rebase: a running or finished review is a live observation, so `active_review`/`last_review` belong on the goal's view (`GoalView`), not on the plan definition (`WorkPlan` is now `sophia.work.plan.v2`, and activity never changes its revision). `PlanNext` now takes `goal: GoalView`. The fixture's `review=` parameter stays #73's; this branch uses `case=` |
| [#32](https://github.com/davidelaverga/Sophia/pull/32) SMC-M03 (draft) | Davide's M03 session | `GoalList.tsx`, `ProjectShell.tsx`, `fixtures/work.tsx`, `fixture-api.ts`; owns `features/artifacts/` | `features/artifacts/` is not touched or duplicated: a result is read through a port and shown as plain text from a labelled source fixture. `ProjectShell.tsx` is not changed; `GoalList.tsx` gains one line and a small component |

## The contract proposal

[WBC-01-CC-0001](../coordination/WBC-01/WBC-01-CC-0001.md), written before any shared DTO code: the Studio reads the packet's `sophia.work.board.v1` (plans as `sophia.work.plan.v2`) and `sophia.work.receipt.v1` exactly as proposed, through one feature-local reader and one conversion into the board's rows, and names its four readings and three gaps for WBC-02. **Davide's agreement is still pending**; nothing in this PR binds an endpoint, so a change he asks for stays inside `board-view.ts`, `resources/receipts.ts` and the ports.

## What changed, before and after

| Part | Before (main `2542906`) | After |
|---|---|---|
| G1 the view | `WorkPlan` v1 plus proposed fields; who does an item found by matching sessions, falling back to any session on the same work id | `board-view.ts`: the proposed view, field for field, read by `readBoardView` (refuses, never repairs). `plan.ts` joins each accepted item to its exact projection: assignment, generation, attempt. No work-id fallback. A proposed replacement shows beside the accepted plan (`Proposal.tsx`, `proposal.ts`) and is never operated; a proposed-only plan is read-only. Sophia's own reviewer is "Sophia · Source reviewer", with no resource or capacity |
| G2 lanes and results | In motion / Up next / Open / Done; Done = run finished or checked | Active / Up next / Unassigned / Complete, a view over lifecycle (`LANE`). Complete only with the item's policy satisfied with evidence and a check of the version it holds now (never one no single current version matches); ready-for-review and changes-needed are Active; unknown is Active, never Unassigned. Stopped, cancelled, failed and superseded work goes under Closed work with its reason. The sheet's Result (`TaskResult.tsx`, `results.ts`): exact versions, Open result and Review candidate when the view allows them, the last usable version kept while a newer attempt runs or failed |
| G3 people and controls | Waiting on whoever an open request names; For you included the executor's account owner; task actions owner-only | Typed `waiting_on[]`, each with its respondent (`Waiting for` in the sheet). For you = a pending request naming the viewer, or work they do by hand; never account ownership. Shared task commands follow the view's per-viewer `available_actions` (`actions.ts`); missing is unavailable; the mandate is said. Resume only for a held task. A cross-goal "Also for you" link that never switches by itself (`GoalList.tsx`). Owner-local Resources controls keep their owner guard |
| G4 commands and decisions | `SessionActs` steps recorded → queued → delivered, per session; Stop "Ends its session's work at once"; decision answers keyed by revision, retried by choice | `resources/receipts.ts`: admission, delivery and effect folded per operation; highest revision wins, Recorded never taken back, a settled effect final, a foreign or malformed receipt ignored. Commands and drafts kept by (project, work, assignment, generation). A lost reply is retried with the same operation. The contract's copy, including "Stop this task? Completed work is kept. Running actions may need time to stop." Decisions bound to work, plan and candidate; an unconfirmed answer is retried with its own operation (`operationFor`); "Your choice is recorded. The plan is updating." while the plan's reaction is pending |
| G5 Ask, freshness, attention | Full answer from a Promise, revealed word by word every 45 ms | `ask.ts`: a question with its identity and exact references; real received chunks or one complete answer; repeats, gaps and late events ignored; the latest question per task kept across J/K, closing and a reconnect. Unavailable keeps the question and offers the conversation. The ring stays the report's age; the connection is said apart. While-away: decisions, then new results, then blockers; the line opens in full on press (`AwayLine`); kept per project, goal, plan and viewer. Another viewer starts with no command, draft, question or look of the last |

### Retained (reproduced before changing their seams)

Recursive rows and the cycle-safe tree; decision revision and expiry; named-assignment lookup (now exact, from the view); request-derived waiting owner (now typed); Sending before Recorded; the shared `SessionActs`; task-keyed actions and late-answer protection; `answers.ts` (#71); followed addresses (#71, #72); the work type scale (#69, #70); the rail, board, sheet, dependency threads, keys, reduced motion, mobile layout and the Claude Code greeting.

### The v1 fixture's conversion

The page's old v1 plan was converted once, by hand, into explicit v2 definitions and projections (`fixtures/work-data.ts`). There is no runtime adapter, and production has no v1 reader.

| v1 fixture | v2 board view |
|---|---|
| item without refs | `deliverable_ref`, `criteria_ref`, `source_scope_ref`, `review_policy_ref`, `recipe_ref` written as labelled fixture refs |
| `outcome: checked` | `lifecycle: complete`, completion `satisfied` with evidence |
| `outcome: finished` | `lifecycle: ready_for_review` |
| a session whose assignment names the item | an explicit `assignment` with id, generation, attempt and executor |
| an open `RequiredAction` | a `native_permission` wait naming its owner |
| owner-only acts | explicit `available_actions` per viewer (Davide, Luis, Mara) |
| `WorkPlan.next_checkpoint`, `decisions` | on the goal's view; decisions bound to work, plan revision and candidate |

## Acceptance (fixture evidence; nothing here is live)

Every case is **fixture-ready only**: the real Studio components on `fixtures/work.html` over labelled simulated views. None is source-ready against a service, integrated, hosted or accepted. Browser checks are in `e2e/work.spec.ts` (`wbc ·`), unit checks beside the modules.

| ID | Evidence on the fixture | Checks |
|---|---|---|
| UI-01 | Loops of parents and blockers, a missing blocker and a repeated id: each shown once, the plan says it doesn't hold together; three levels and an orphan shown once; work observed outside the plan listed, never hidden | `plan.test.ts`, `wbc · UI-01`, `pre-push · work observed outside` |
| UI-02 | A new attempt of the same session: the earlier attempt's report isn't its state; commands carry generation 4 and attempt 4 | `plan.test.ts`, `actions.test.ts`, `wbc · UI-02` |
| UI-03 | A replacement proposed beside the accepted plan, compared; a proposed-only plan has no commands or Ask | `plan.test.ts`, `proposal.test.ts`, `wbc · UI-03` |
| UI-04 | The review with defects is Complete; the retry is Active, Changes needed; its findings open | `wbc · UI-04` |
| UI-05 | A check of retry-v1 says nothing of retry-v2; a complete item whose check is of another version isn't shown complete | `plan.test.ts`, `results.test.ts`, `wbc · UI-05` |
| UI-06 | Stopped, cancelled, failed under Closed work with reasons; the repair stays Active | `plan.test.ts`, `wbc · UI-06` |
| UI-07 | Work on Luis's resource waits on Davide's decision and Luis's own permission; For you follows the request, not the account | `plan.test.ts`, `seen.test.ts`, `wbc · UI-07` |
| UI-08 | Luis guides Davide's session within Davide's mandate; no permission or reserve control in the task; Mara reads and asks only | `actions.test.ts`, `wbc · UI-08`, the updated acting check |
| UI-09 | Slow admission stays Sending; a lost reply is unknown, retried with the same operation; a refusal sent nothing | `receipts.test.ts`, `wbc · UI-09` (two) |
| UI-10 | A delivered Stop is requested; unknown says so; only a settled Stop is Stopped, and the task moves to Closed work | `receipts.test.ts`, `wbc · UI-10`, `wbc · Resume` |
| UI-11 | A draft survives J/K and close; the same session's next assignment starts with no command or draft; a Stop question never carries to another task or generation; commands outlive choosing another goal | `receipts.test.ts`, `command-store.test.ts`, `wbc · UI-11`, `pre-push ·` (four), `pr76 · P1` |
| UI-12 | Receipts repeated, late and sent to another task change nothing | `receipts.test.ts`, `wbc · UI-12` |
| UI-13 | Changed, expired and unconfirmed answers; the same operation on retry | `answers.test.ts`, `wbc · UI-13`, the existing decision checks |
| UI-14 | A choice recorded while the plan updates; for the decider and anyone else | `wbc · UI-14`, the updated answer check |
| UI-15 | Chunks shown as received, nothing on a timer, whole answers at once, a reconnect's repeats ignored, the answer kept under its task | `ask.test.ts`, `wbc · UI-15` (two), the staggered check |
| UI-16 | Sophia's own source reviewer: no subscription, no Resources link; asking where unavailable keeps the question | `plan.test.ts`, `wbc · UI-16` |
| UI-17 | A 9-minute-old report during a healthy call ages, is never called stuck; a lost connection is said apart | `wbc · UI-17` |
| UI-18 | A failed revision keeps the last usable version openable, marked; the withdrawn one isn't offered | `results.test.ts`, `wbc · UI-18` |
| UI-19 | By keys alone and on a phone: conditions, result and actions reached without hover, nothing past the screen | `wbc · UI-19` (two), the existing phone check |
| UI-20 | Reduced motion (existing check); another account looking starts afresh; during a call, the microphone and Leave stay in reach with a sheet open, by pointer, keyboard and on a phone (Codex F-003; fake LiveKit) | `wbc · UI-20`, the existing motion check, `codex · F-003` (three) |
| UI-21 | No request leaves the page; the view drawn is the one its reader accepted; no fixture or test builder reaches the build; the app's shell is never given plans | `fixture-boundary.test.ts`, `wbc · UI-21`, the bundle grep below |

## Independent review before the push

One reviewer read the whole diff at `f736ad7`, given the code and CONTRIBUTING's rules, not these conclusions. Each finding was checked against the code and fixed, with a regression that fails when the fix is reverted:

| Finding | Fix |
|---|---|
| **P1** A Stop question open on one task could be answered on the next (J, a link, or a new generation) | The commands block is keyed by task and by exact scope (project, work, assignment, generation). The browser check reproduces it between two tasks that both take Stop, and fails without the keys |
| **P1** Guidance could go twice under two operations: Send stayed enabled while it went, and the same words sent again after a lost reply minted a new key; sent words could return to the field | Send waits while a guidance goes. The same words, unresolved, are the same operation (`repeatOf`). Sent words leave the field once recorded, kept in the page's store, whether the sheet is open or not |
| **P1** Commands, drafts and Ask answers were lost when another goal was chosen (the board unmounts) | They live while the page lives, per project and viewer (`resources/command-store.ts`, `planning/ask-store.ts`), as decisions already did (`answers.ts`). A lost Stop survives a goal switch and is retried with its own operation |
| **P2** Earlier unresolved commands were unnamed and couldn't be retried | Each is named and has its own Try again; they sit outside the live region |
| **P2** Work observed outside the plan in force vanished; a goal with observed work and no plan looked empty | "Observed outside the plan" lists it (read-only; the goal's own Hold and Stop still reach it), and the board says how many; a goal with no plan in force says its work is observed |
| **P2** A plan naming another project or goal was shown as this one's; Resources took its command project from its look-storage scope | `readBoardView` refuses it; `boardOf` won't operate a plan of another project; ResourcePanel takes an explicit `projectId` |
| **P3** A later refusal replaced Recorded · a bare completion after a missing chunk read as the whole answer · Try again after an unknown admission changed nothing · the pill named the viewer in the third person · two "current" versions picked one · the fixture's attention wasn't gated on a plan in force · the cross-task receipt check proved nothing in the browser | Recorded is kept and delivery/effect become unknown · no answer is shown · it says Sending again · "for you" · neither is the result, and the sheet says so · gated · the check now runs on a guidance only recorded, on the page's clock |

Not changed: the while-away line still announces its full text when pressed open. It is the viewer's own request, and the line keeps Luis's existing live region.

## Codex's review on #74

Codex reviewed and app-tested `8afd007` in its own checkout ([CX-0001](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973418530)–[CX-0003](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973428310)). Its gates and the 176 browser checks passed. Its own probes reproduced three findings, fixed in `5a55cc8` ([FIX_READY](../coordination/WBC-01/WBC-01-CC-0003.md)):

| Finding | Fix |
|---|---|
| **F-001** (P2): a receipt from another project, with the same ids, settled a local Stop | Receipts match the command's project too |
| **F-002** (P2): an unobserved task kept its write commands; work past planning with no assignment showed as Queued or Working | Such work is Active, said not observed, and offers nothing to send; the sheet says why. Read and Ask stay |
| **F-003** (P1): during a call, the modal task sheet covered the mini dock's microphone and Leave (QA-09, UI-20's call part) | Under Davide's scope extension to the shared shell, every project sheet shows the call's switches under its head while a call is live (task, resource and invitation sheets), reachable by pointer, keyboard and screen reader. This changes production behavior during real calls |

UI-20's call part is now exercised on the fixture, desktop and phone, over a fake LiveKit (`codex · F-003`). It still isn't tested on a physical iPhone or in a hosted call.

Codex's second round, at `e4d9734` ([CX-0004](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973797796), [CX-0005](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973830528)), found F-001 and F-003 resolved, and F-002 partly so. A lost command's Try again still sent after its task stopped being observed or its action was denied. That is fixed in `38bb9d6` ([FIX_READY](../coordination/WBC-01/WBC-01-CC-0004.md)): one rule, `retryableNow`, for the button and the send. A command is retried only while its kind may be sent here now; otherwise it is kept, uncertain, with its operation, and that operation goes once sending is allowed again.

## Codex's READY, the PR, and its review

Codex found F-002 closed and nothing new at `10b9d32` ([CX-0006](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973969188), READY for source and fixture review). It then pushed the branch unchanged and opened [PR #76](https://github.com/davidelaverga/Sophia/pull/76). The repository's Codex reviewer on GitHub left three findings on that head, and main had moved: Luis's #73 (LFE-07.2) merged.

**The merge** (`4e7a42b`): #73 put the progress review on the plan (`WorkPlan.active_review`, `last_review`). Here the plan is the v2 definition, and a review is a live observation, so it stays #73's own proposed read, a goal's review beside the board's view:
- `review.ts` reads it with the plan's revision;
- `PlanNext` takes it as `review`.

Luis's words, tests and nine browser checks are kept. #73's goal commands are `workFixture.goalCommands`. This branch's pre-push checks are renamed `pre-push ·`, apart from #73's `review ·`.

**The findings,** fixed in `9f3d872` ([FIX_READY](../coordination/WBC-01/WBC-01-CC-0005.md)):

| Finding | Fix |
|---|---|
| **P1** A Stop pressed after the same assignment moved to a new attempt or session went again as the earlier attempt's lost request | An operation is reused only for the exact same target, attempt and session included |
| **P2** An answer that never comes left "Thinking…" forever | Each question waits at most 30 s for its next event, then fails, keeping the question, with Ask again and the conversation |
| **P2** Only the first of up to three proposals was shown | Every proposal gets its band. With none accepted, the first is the read-only board and the others are "also proposed" |

## CX-0009, #77, and the Resources fence

Codex verified the merge with #73 and the three repairs at `4667905` ([CX-0009](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5975038104), CHANGES_REQUIRED). It found two new problems in Ask again, reported main moving on (#77) and passed on a new GitHub finding. All four are handled in [CC-0006](../coordination/WBC-01/WBC-01-CC-0006.md), with main merged in again after #78–#81.

**The merge with #77** (LFE-07.2 slice 2, the card of a review that proposes a change). #77 reads that review from `WorkPlan.last_review`. Here it stays the goal's own read beside the view (`Reviewed`), as with #73:
- the card's pill sits in the board's bar, and the card shares the decisions' slot;
- the card compares the review with the revision it is read with, the same as the goal's line, so the two never disagree;
- "Waits on your decision: answer it" shows only while the board's plan is in force and a decision can be sent;
- the fixture reads the review with the plan in force, so a plan taken further leaves the review on its own revision.

Luis's twelve `review card ·` checks and three unit tests pass unchanged.

**The merge with #78 and #79** (the card's Codex P2s; Challenge, LFE-07.2's last slice) follows the same rule:
- #78's expired decisions and its focus handling are kept;
- Challenge goes through the card's slot, and only on a board whose plan is in force, the same gate as answering a decision;
- its page memory carries this branch's decision operations.

Luis's eight new checks pass unchanged.

**The merge with #80 and #81** (one live region per receipt; the Umbral brand): a decision's status is one node from the start, carrying this branch's words. #80's check for it now expects those words ("Your choice is recorded. The plan is updating."), and still checks that the node stays the same. #81 merges cleanly.

| Finding | Fix |
|---|---|
| **F-004** (P2): an earlier Ask's wait could fail the question asked again, since both had the same question and sequence | Each send of a question has its own number. A wait or an event belongs to its send, and an earlier send's changes nothing |
| **F-005** (P2): Ask again ignored the current Ask availability | One rule (`askBlocked`) for a first question and for asking again, at the button and at the send. While blocked, the failed question stays with why. A task whose Ask is no longer offered still shows it. Once allowed again, the same question goes |
| **GitHub P2** (`SessionActs.tsx`): a resource session without its assignment's id and generation still offered Guidance, Hold and Stop | `sessionTarget` needs both. Without them, Act says why and nothing can be sent. The resource fixture's sessions now carry them, and `unfenced=1` shows the case |

## CX-0010, and the merge with #82–#87 and #32

Codex verified CC-0006 at `87c078b` ([CX-0010](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5980093766), CHANGES_REQUIRED): F-004, F-005's availability repair, the Resources fence and the three merges hold. It found three more, two of them also left by GitHub's reviewer. All are handled in [CC-0007](../coordination/WBC-01/WBC-01-CC-0007.md), after merging main again (`27f51f2`: #82–#87 and #32, which conflicted only on the fixture pages' imports).

| Finding | Fix |
|---|---|
| **F-007** (P1): after a new attempt or session, the earlier execution's open Stop showed as the latest, and its Try again went to the earlier target. A guidance draft carried over too | History stays by assignment generation, but only a command for the execution shown speaks as the latest or can be tried again. An earlier attempt's or session's open command is listed as such and kept as it was. Drafts are kept by execution, and so is the task sheet's commands block, so a Stop question doesn't survive into the next execution |
| **F-005 residual** (P2): with no conversation connected, Ask again silently did nothing | A missing conversation is a blocking reason too, said and kept, by the same rule as the view's availability. Connected again, the same question goes |
| **F-006** (P2): on a proposed-only board, the goal's line and the review card compared the review with different revisions | One reference: the plan in force's revision, null while none is. With none in force, both say which revision the review was of, and its proposal is read only |

## CX-0011

Codex verified CC-0007 at `be46d05` ([CX-0011](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5980774711), CHANGES_REQUIRED). The merge with #32 and F-005 to F-007 hold. GitHub's reviewer left two P2s on the same head. All three are handled in [CC-0008](../coordination/WBC-01/WBC-01-CC-0008.md) (`49a9e12`):

| Finding | Fix |
|---|---|
| **F-008** (P1): on Resources, a Stop confirmation opened for one assignment stayed open when the session was given the next, and confirming it stopped the replacement | The shared commands block keys its Stop confirmation by the exact execution, so the confirmation closes on any caller when its target changes |
| **GitHub P2** (`shape.ts`): date-times without an offset, or impossible dates, were accepted | The reader accepts only RFC 3339 date-times with their offset, on dates the calendar has, and says where one fails |
| **GitHub P2** (`PlanBoard.tsx`): a decision of the viewer's arriving later stayed folded | A decision not seen before opens the decisions when it arrives, once; one the viewer closed stays closed; arriving over the review's card, it takes the slot |

## CX-0012

Codex verified CC-0008 at `efa05ae` ([CX-0012](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5981163850), CHANGES_REQUIRED). F-008 and both earlier GitHub P2s hold. It confirmed two findings from GitHub's review of that head, both in code from earlier rounds. Both are handled in [CC-0009](../coordination/WBC-01/WBC-01-CC-0009.md) (`7b0cd50`):

| Finding | Fix |
|---|---|
| **F-009** (P1): with two versions both claiming to be current, a passed review of one still let the task show as Complete | A review bound to a version no single current one matches certifies nothing: the task stays Active, said why, and its review line says it can't be matched. Policy-complete tasks with no version-bound review stay Complete |
| **F-010** (P2): the while-away summary said "A decision waits on you" for one already past its expiry | The summary uses the board's own rule and the time: a decision waits only while it can be answered; past its expiry it is said expired, to its decider and to others |

## CX-0013

Codex verified CC-0009 at `18471ee` ([CX-0013](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5982948690), CHANGES_REQUIRED). F-009 and F-010 hold, and the exact-head CI passed all six jobs. GitHub's P1 on call controls didn't reproduce: a background project's sheet unmounts. Both new findings are handled in [CC-0010](../coordination/WBC-01/WBC-01-CC-0010.md) (`f8a8ac5`):

| Finding | Fix |
|---|---|
| **F-011** (P2): F-009's long reason, as a chip that doesn't wrap, widened the phone sheet past the screen | A few words in the chip, "Not shown as complete"; why on a line of the sheet that wraps |
| **F-012** (P2): a task whose current result went away was said to have started | A result lost is said as lost (none current, withdrawn, or two claiming to be); a task's mark only when it moved |

## CX-0014

Codex verified CC-0010 at `5625c6f` ([CX-0014](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5983801664), CHANGES_REQUIRED). F-011 holds at 375, 390 and 430 px, and F-012 holds through the reader. It confirmed one finding from GitHub's review of that head, handled in [CC-0011](../coordination/WBC-01/WBC-01-CC-0011.md) (`c39909d`):

| Finding | Fix |
|---|---|
| **F-013** (P2): a choice made for a replacement plan showed in the plan in force's Decided history | A plan's history holds its own choices, at its revision or earlier, so carried-forward history stays. Another plan's choices are listed apart, each named by its plan's revision |

## CX-0015

Codex verified CC-0011 at `de85481` ([CX-0015](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5984274045), CHANGES_REQUIRED). F-013 holds, and the exact-head CI passed all six jobs. It confirmed two findings from GitHub's review of that head, both handled in [CC-0012](../coordination/WBC-01/WBC-01-CC-0012.md) (`9c0bd56`):

| Finding | Fix |
|---|---|
| **F-014** (P2): a newer receipt saying less of a command's delivery erased a delivery already established | Delivery, once established, is never taken back by a later receipt saying less; before that, a newer word (uncertainty included) stands; the Recorded, effect and refusal fences are unchanged |
| **F-015** (P2): the "your choice is recorded, the plan is updating" band showed a replacement plan's choice | One rule for the plan's own choices (`decidedFor`), shared with the fold: the band holds the plan shown's own; another plan's are listed apart with their revision |

## CX-0016, and the merge with #88–#90

Codex verified CC-0012 at `64dd4f7` ([CX-0016](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5984741374), CHANGES_REQUIRED). F-014 and F-015 hold. It confirmed four findings from GitHub's review of that head, all in code from earlier rounds. Main then moved (#88–#90, Personal, with the opening's pacing fixes); it merged without conflicts (`e4003cd`). All four are handled in [CC-0013](../coordination/WBC-01/WBC-01-CC-0013.md) (`8143be6`):

| Finding | Fix |
|---|---|
| **F-016** (P1): a command sent from Resources was unknown to Tasks, and the reverse | One command space per project and viewer for both; the same request from the other surface is the same operation; execution matching stays strict, and a command naming no attempt is said as such |
| **F-017** (P2): a result read could stay "Reading…" for good | Each read has the Studio's 30 s limit, then is said late and can be opened again; a reply after that changes nothing |
| **F-018** (P2): a distinct plan kept the previous plan's lens and folds | The board's view is keyed by the plan shown too; the same plan's next revision keeps it |
| **F-019** (P2): an expired proposal still made the pill say "1 decision for you" | The pill counts only answerable decisions; with none, it says how many expired, calling no one |

## Commands run on the final code (darwin-arm64, Node 24.21.0, pnpm 11.7.0)

Recorded in the [handoff](../handoffs/WBC-01-attempt-1.md) with their counts.

## Walkthroughs

Seventeen screens, desktop (1280×800) and phone (390×844, emulated in Chromium), from the labelled fixture page: [docs/evidence/WBC-01/](../evidence/WBC-01/README.md). They show the default board and each adverse case. They are fixture captures, not live behavior: Luis's reference and Codex's starting point, not app-test evidence.

## Backend handoff (WBC-02)

1. Agree or amend [WBC-01-CC-0001](../coordination/WBC-01/WBC-01-CC-0001.md); then promote the agreed shapes through the amendment and generator process, and swap `readBoardView`/`readReceipt` for the generated validators.
2. Serve the board view for the project (snapshot plus stream on one cursor) with per-viewer `available_actions`; nothing in the Studio derives a grant.
3. Bind the ports: the command port (receipts with admission, delivery, effect and evidence), the decision port (`choice_recorded`, then the plan's reaction as its own state), the result port (exact version bytes, hash-checked). Ask stays unavailable in WBC-02.
4. Wire `PlanBoard` into the production shell only once a qualified view exists; until then Tasks shows the goals alone.
