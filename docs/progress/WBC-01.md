# WBC-01 — Tasks ready for real work state

Mission: [WBC-01](../missions/2026-10-03-workboard-connection/missions/WBC-01_UI_READINESS.md), under the [workboard connection packet](../missions/2026-10-03-workboard-connection/00_START_HERE.md) (v1.0, 2026-10-03). Parent scope: LFE-07.1, the shared LFE-06 controls and the interface parts of SCM-03/04. A follow-up to merged PR #63, not a rebuild of it.

**Status: fixture-ready.** Not source-ready for a live service, not integrated, not hosted, not accepted. No endpoint, migration, provider call, deployment, runtime or prompt change was made.

## Owners and the handoff

| Role | Who | Since |
|---|---|---|
| Implementation owner | **Davide** (ownership amendment, 2026-10-03; the packet named Luis) | 2026-10-03 |
| Implementer | Claude Code, this session (Davide's Mac, darwin-arm64) | 2026-10-03 |
| Design and UX reviewer | **Luis**: reviews the desktop and phone walkthroughs before merge | pending |
| Independent code reviewer | Codex, on the exact commit, through the coordination issue | pending |
| Product and contract decisions | Davide | — |

The amendment changes only who implements. Scope, preservation, acceptance and exclusions are the packet's.

**Start.** Branch `lfe-07/workboard-readiness` from main `2542906` (PR #72), 2026-10-03. The packet inspected `c8dd5aa` and rechecked `2c13747` (PR #70). Two PRs merged since: #71 (`answers.ts`: an unconfirmed answer kept by the decision's revision and viewer while the page lives; a followed address waits for its plan) and #72 (an address at open waits for its plan; the Resources grid keeps its Tab stop by tile id). Both are retained; neither changes the work, decision or action contracts.

**Baseline on `2542906`, unmodified:** `node --test "apps/studio/src/**/*.test.ts"` 423 pass; `playwright test e2e/work.spec.ts` 35 of 35 pass.

### Open work on the same files

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
| G2 lanes and results | In motion / Up next / Open / Done; Done = run finished or checked | Active / Up next / Unassigned / Complete, a view over lifecycle (`LANE`). Complete only with the item's policy satisfied with evidence and a check of the version it holds now; ready-for-review and changes-needed are Active; unknown is Active, never Unassigned. Stopped, cancelled, failed and superseded work goes under Closed work with its reason. The sheet's Result (`TaskResult.tsx`, `results.ts`): exact versions, Open result and Review candidate when the view allows them, the last usable version kept while a newer attempt runs or failed |
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
| UI-01 | Loops of parents and blockers, a missing blocker and a repeated id: each shown once, the plan says it doesn't hold together; three levels and an orphan shown once; work observed outside the plan listed, never hidden | `plan.test.ts`, `wbc · UI-01`, `review · work observed outside` |
| UI-02 | A new attempt of the same session: the earlier attempt's report isn't its state; commands carry generation 4 and attempt 4 | `plan.test.ts`, `actions.test.ts`, `wbc · UI-02` |
| UI-03 | A replacement proposed beside the accepted plan, compared; a proposed-only plan has no commands or Ask | `plan.test.ts`, `proposal.test.ts`, `wbc · UI-03` |
| UI-04 | The review with defects is Complete; the retry is Active, Changes needed; its findings open | `wbc · UI-04` |
| UI-05 | A check of retry-v1 says nothing of retry-v2; a complete item whose check is of another version isn't shown complete | `plan.test.ts`, `results.test.ts`, `wbc · UI-05` |
| UI-06 | Stopped, cancelled, failed under Closed work with reasons; the repair stays Active | `plan.test.ts`, `wbc · UI-06` |
| UI-07 | Work on Luis's resource waits on Davide's decision and Luis's own permission; For you follows the request, not the account | `plan.test.ts`, `seen.test.ts`, `wbc · UI-07` |
| UI-08 | Luis guides Davide's session within Davide's mandate; no permission or reserve control in the task; Mara reads and asks only | `actions.test.ts`, `wbc · UI-08`, the updated acting check |
| UI-09 | Slow admission stays Sending; a lost reply is unknown, retried with the same operation; a refusal sent nothing | `receipts.test.ts`, `wbc · UI-09` (two) |
| UI-10 | A delivered Stop is requested; unknown says so; only a settled Stop is Stopped, and the task moves to Closed work | `receipts.test.ts`, `wbc · UI-10`, `wbc · Resume` |
| UI-11 | A draft survives J/K and close; the same session's next assignment starts with no command or draft; a Stop question never carries to another task or generation; commands outlive choosing another goal | `receipts.test.ts`, `command-store.test.ts`, `wbc · UI-11`, `review ·` (four) |
| UI-12 | Receipts repeated, late and sent to another task change nothing | `receipts.test.ts`, `wbc · UI-12` |
| UI-13 | Changed, expired and unconfirmed answers; the same operation on retry | `answers.test.ts`, `wbc · UI-13`, the existing decision checks |
| UI-14 | A choice recorded while the plan updates; for the decider and anyone else | `wbc · UI-14`, the updated answer check |
| UI-15 | Chunks shown as received, nothing on a timer, whole answers at once, a reconnect's repeats ignored, the answer kept under its task | `ask.test.ts`, `wbc · UI-15` (two), the staggered check |
| UI-16 | Sophia's own source reviewer: no subscription, no Resources link; asking where unavailable keeps the question | `plan.test.ts`, `wbc · UI-16` |
| UI-17 | A 9-minute-old report during a healthy call ages, is never called stuck; a lost connection is said apart | `wbc · UI-17` |
| UI-18 | A failed revision keeps the last usable version openable, marked; the withdrawn one isn't offered | `results.test.ts`, `wbc · UI-18` |
| UI-19 | By keys alone and on a phone: conditions, result and actions reached without hover, nothing past the screen | `wbc · UI-19` (two), the existing phone check |
| UI-20 | Reduced motion (existing check); another account looking starts afresh. **Not exercised:** an active call on the Tasks page (the work fixture has no call; the call controls are unchanged and covered by the room's BASE checks) | `wbc · UI-20`, the existing motion check |
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

## Commands run on the final code (darwin-arm64, Node 24.21.0, pnpm 11.7.0)

Recorded in the [handoff](../handoffs/WBC-01-attempt-1.md) with their counts.

## Walkthroughs for Luis

Seventeen screens, desktop (1280×800) and phone (390×844), from the labelled fixture page: [docs/evidence/WBC-01/walkthrough/](../evidence/WBC-01/walkthrough/). They show the default board and each adverse case; they are fixture captures, not live behavior.

## Backend handoff (WBC-02)

1. Agree or amend [WBC-01-CC-0001](../coordination/WBC-01/WBC-01-CC-0001.md); then promote the agreed shapes through the amendment and generator process, and swap `readBoardView`/`readReceipt` for the generated validators.
2. Serve the board view for the project (snapshot plus stream on one cursor) with per-viewer `available_actions`; nothing in the Studio derives a grant.
3. Bind the ports: the command port (receipts with admission, delivery, effect and evidence), the decision port (`choice_recorded`, then the plan's reaction as its own state), the result port (exact version bytes, hash-checked). Ask stays unavailable in WBC-02.
4. Wire `PlanBoard` into the production shell only once a qualified view exists; until then Tasks shows the goals alone.
