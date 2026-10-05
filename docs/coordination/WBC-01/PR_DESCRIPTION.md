**LFE-07: make Tasks ready for real work state (WBC-01)**

WBC-01 ([mission](docs/missions/2026-10-03-workboard-connection/missions/WBC-01_UI_READINESS.md)) makes Tasks ready for real work state. It follows #63; it doesn't rebuild it. **Fixture-ready only**: this PR adds no endpoint, migration, provider call, runtime change or prompt change, and deploys nothing. A Studio-only release, if any, is Codex's, after Davide approves an exact batch ([policy v1.1](docs/coordination/WBC-01/policy/WBC-01_POLICY.md) §5).

- **Coordination:** #74.
- **Owner and approvals:** Davide.
- **Implementer:** Claude Code. Its session has no GitHub credential, so Codex opened this PR from Claude's branch, unchanged.
- **Review, app tests and release:** Codex ([WBC-01-CC-0002](docs/coordination/WBC-01/WBC-01-CC-0002.md); [app-test plan](docs/coordination/WBC-01/policy/WBC-01_APP_TEST_PLAN.md)).
- **Design reference:** Luis. Feedback on the [walkthroughs](docs/evidence/WBC-01/README.md) is welcome, not a required sign-off.

## Contract

[WBC-01-CC-0001](docs/coordination/WBC-01/WBC-01-CC-0001.md) was written before the DTO code. The Studio reads the packet's proposed `sophia.work.board.v1` (plans as `sophia.work.plan.v2`) and `sophia.work.receipt.v1` field for field:

- one reader, `readBoardView`, refuses a malformed view or a plan placed in another project or goal, and never repairs one;
- one conversion builds the board's rows (`plan.ts`);
- commands, decisions, Ask and results go through ports.

**Davide's agreement is pending.** Nothing binds an endpoint, so a change stays inside `board-view.ts`, `resources/receipts.ts` and the ports.

## What changed

| | Before | After |
|---|---|---|
| G1 | v1 plan; who does it found by any session on the same work id | The view's exact assignment, generation and attempt; no work-id fallback. A proposed replacement shows beside the accepted plan, never operated. Sophia's own reviewer is "Sophia · Source reviewer", with no subscription |
| G2 | In motion / Up next / Open / Done (finished or checked) | Active / Up next / Unassigned / Complete. Complete only by the item's policy with evidence, and a check of its current version. Closed work with reasons. Work outside the plan is listed. Result: exact versions, Open result and Review candidate, the last usable version kept |
| G3 | For you included the account owner; task acts owner-only | Typed waits with their respondents. For you from requests naming the viewer. Per-viewer `available_actions` (missing means unavailable), with the mandate said. Resume only when held. "Also for you" across goals, never switching |
| G4 | Steps recorded → queued → delivered; "Ends its session's work at once" | Admission, delivery and effect, folded per operation, never regressing. Kept while the page lives, by project and viewer, then by work and generation. A retry or the same request again reuses its operation. The contract's copy. Decisions bound to work, plan and candidate; the choice and the plan's reaction said apart |
| G5 | The full answer revealed every 45 ms | Real received chunks or one complete answer, per question, kept across goals. Unavailable keeps the question. Freshness and connection said apart. While-away: decisions and results first, readable in full, kept per project, goal, plan and viewer |

**Retained:**
- recursive rows;
- decision revision and expiry;
- exact assignment lookup;
- request-derived waits;
- Sending before Recorded;
- the shared `SessionActs`;
- task-keyed acts and late-answer protection;
- #71's kept answers and #72's addresses;
- the type scale;
- Luis's rail, board, sheet, threads, keys, reduced motion, mobile layout and greeting.

Nine existing checks changed their expected words or lanes, by design. Two Resources act checks also changed their words, and so did #80's decision receipt check (the contract's copy for a recorded choice). All are listed in the [progress](docs/progress/WBC-01.md).

## Evidence (fixture, darwin-arm64, Node 24.21.0, pnpm 11.7.0)

- `pnpm toolchain:check`, `format:check`, `lint`, `build`, `typecheck`, `contracts:check`: exit 0.
- `pnpm test`: 1,225 tests: 1,211 pass, 0 fail, 14 skipped (the same 14 as before), after merging main (#75). `pnpm artifacts`: every identity reproduced, and `pnpm test:integration`: 84 tests: 82 pass, 0 fail, 2 skipped, both on the merge with #75 (main's report package changed; this PR's own changes are the Studio's).
- `pnpm --filter @sophia/studio run build`: passes. No board or fixture code is in the bundle.
- `pnpm --filter @sophia/studio test:browser`: 442 of 442 pass, desktop and phone, in one run on the merge with #75 (`bb7ba05`), on Claude's own fixture server (port 5207); Codex's own run there passed 442 of 442 too (CX-0023). After F-025 (`f3bd434`), `e2e/work.spec.ts` passes 143 of 143; on the merge with #91 (`95996e0`), `e2e/personal.spec.ts` passes 44 of 44; after F-026 and F-027 (`cc4f61b`), `e2e/work.spec.ts` with `e2e/resources.spec.ts` passes 240 of 240. The six specs whose request guard names port 5199 ran with it set to 5207 for that run ([CC-0015](docs/coordination/WBC-01/WBC-01-CC-0015.md)). Main's flaky `personal.spec.ts:227` is fixed: its memory checks passed 60 of 60 one-worker repeats. That includes:
  - 26 `wbc ·` checks for UI-01–UI-21;
  - 7 `pre-push ·`, 40 `codex · F-` and 6 `pr76 ·` checks for the reviews' findings;
  - Luis's 31 checks from #73 and #77–#80, with 3 more for the merges and F-006;
  - main's own suites since then (brand, sign-in, opening, home, report, voice chat, Personal), with two Personal checks added for Correct and Forget.
- **Mutations:** 154 repairs reverted one at a time; each makes a check fail ([mutations.txt](docs/evidence/WBC-01/mutations.txt)). The one exception is a redundant key, recorded.
- **Independent review** of `f736ad7`: 3 P1, 3 P2 and 7 P3. All are fixed except one P3, kept by choice, with regressions ([table](docs/progress/WBC-01.md#independent-review-before-the-push)).
- **Codex's review** of `8afd007` (#74): F-001, F-002 and F-003, fixed in `5a55cc8` with regressions ([table](docs/progress/WBC-01.md#codexs-review-on-74)). Its second round, at `e4d9734`, found F-002's retry path still open; that is fixed in `38bb9d6`. At `10b9d32` it found no more ([CX-0006](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5973969188), READY).
- **The GitHub Codex review of this PR** (at `10b9d32`): three findings, fixed in `9f3d872` ([table](docs/progress/WBC-01.md#codexs-ready-the-pr-and-its-review)):
  - **P1:** an operation is reused only for the exact target, attempt and session included;
  - **P2:** an answer waits at most 30 s per event, then fails with Ask again;
  - **P2:** every proposal is shown.
- **Codex's verification** of those at `4667905` ([CX-0009](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5975038104)), and a second GitHub finding there, are fixed in `40cfbc9` ([CC-0006](docs/coordination/WBC-01/WBC-01-CC-0006.md)):
  - **F-004:** each send of a question has its own wait and events, so an earlier send can't fail or answer the question asked again;
  - **F-005:** Ask again follows the view's current Ask availability, at the button and at the send. While blocked, the failed question stays with why;
  - **GitHub P2:** a resource session's controls need its assignment's id and generation. Without them, Act says why and nothing is sent.
- **Codex's verification** of those at `87c078b` ([CX-0010](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5980093766)) found three more, two also left by GitHub's reviewer there. They are fixed in `d6363c5` and `b44a21f` ([CC-0007](docs/coordination/WBC-01/WBC-01-CC-0007.md)):
  - **F-007 (P1):** an earlier attempt's or session's open command is its history, said and never sent again from here. Only the execution shown speaks and retries, and drafts belong to their execution;
  - **F-005 residual:** with no conversation connected, Ask again isn't offered, and says why;
  - **F-006:** the goal's line and the review card compare the review with one revision, the plan in force's, or say none is in force.
- **Codex's verification** at `be46d05` ([CX-0011](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5980774711)) found F-008, and GitHub's reviewer left two P2s there. All are fixed in `49a9e12` and `3e7a893` ([CC-0008](docs/coordination/WBC-01/WBC-01-CC-0008.md)):
  - **F-008 (P1):** a Stop confirmation belongs to its exact execution, on Resources as on a task's sheet; a reassigned session's old question closes;
  - **P2:** the reader takes only RFC 3339 date-times with their offset, on real dates;
  - **P2:** a decision of the viewer's arriving later opens for them; one they closed stays closed.
- **Codex's verification** at `efa05ae` ([CX-0012](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5981163850)) confirmed two findings of GitHub's review of that head. Both are fixed in `7b0cd50` ([CC-0009](docs/coordination/WBC-01/WBC-01-CC-0009.md)):
  - **F-009 (P1):** a review bound to a version no single current one matches certifies nothing, so the task isn't Complete, and says why;
  - **F-010 (P2):** the while-away summary says a decision waits only while it can be answered; past its expiry, it says it expired.
- **Codex's verification** at `18471ee` ([CX-0013](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5982948690)) found two P2s, one also left by GitHub's reviewer. Both are fixed in `f8a8ac5` ([CC-0010](docs/coordination/WBC-01/WBC-01-CC-0010.md)):
  - **F-011:** a task not shown as complete says so in a short chip; the reason wraps in its sheet, keeping the phone sheet within the screen;
  - **F-012:** a result lost since the last look is said as lost, and a task's mark only when it moved.
- **Codex's verification** at `5625c6f` ([CX-0014](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5983801664)) confirmed one finding of GitHub's review there, F-013 (P2): a plan's Decided history showed a replacement plan's choice. Fixed in `c39909d` ([CC-0011](docs/coordination/WBC-01/WBC-01-CC-0011.md)): a plan lists its own choices, carried-forward history included, and another plan's apart, named by revision.
- **Codex's verification** at `de85481` ([CX-0015](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5984274045)) confirmed two findings of GitHub's review there. Both are fixed in `9c0bd56` and `2136f6b` ([CC-0012](docs/coordination/WBC-01/WBC-01-CC-0012.md)):
  - **F-014:** a delivery once established is never taken back by a later receipt saying less;
  - **F-015:** the board's "the plan is updating" band holds only the plan shown's own choices; another plan's are listed with their revision.
- **Codex's verification** at `64dd4f7` ([CX-0016](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5984741374)) confirmed four findings of GitHub's review there. All are fixed in `8143be6` ([CC-0013](docs/coordination/WBC-01/WBC-01-CC-0013.md)):
  - **F-016 (P1):** Resources and Tasks share one command space; the same request from either surface is the same operation;
  - **F-017:** a result read has the Studio's 30 s limit, then is said late and can be opened again;
  - **F-018:** another plan starts its own view; the same plan's next revision keeps it;
  - **F-019:** past its expiry, a proposal calls no one; the pill says it expired.
- **Codex's verification** at `b603e1d` ([CX-0017](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5985257405)) confirmed two findings of GitHub's review there. Both are fixed in `93a7268` ([CC-0014](docs/coordination/WBC-01/WBC-01-CC-0014.md)):
  - **F-020 (P1):** only a passed check of the version a task holds now certifies it Complete;
  - **F-021:** with the command port gone, what was sent stays said and followed, and nothing new or again is sent.
- **Codex's verification** at `8892325` ([CX-0019](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5985787713)) confirmed two findings of GitHub's review there. Both are fixed in `3e138ef` ([CC-0015](docs/coordination/WBC-01/WBC-01-CC-0015.md)):
  - **F-022 (P1):** from a read that may be stale (coverage unavailable), nothing is sent, answered, challenged or asked; what shows stays, and what was sent stays said, its receipts and replies landing;
  - **F-023:** a choice waits at most the Studio's 90 s write limit, then is not confirmed, and only the same choice goes again, as its operation; a reply counts only for its own send.
- **Codex's check** of that local repair `3e138ef` ([CX-0021](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5986248624)) found F-024, fixed in `cbd1731` (CC-0015): a challenge already sent stays said while the read is stale, its late receipt landing, with nothing offered to send or send again until a port is back.
- **Codex's review** of `cbd1731` ([CX-0022](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5986558522)) passed the repair scope, F-022, F-023, F-024 and the Personal repair, with its own full browser run passing 400 of 400 on `3e138ef`. Main had moved to `cec3947` (#75), which is merged in here.
- **Codex's review** of `226889e` ([CX-0023](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5986904177)) confirmed F-025, also left by GitHub's reviewer (4180194401), fixed in `f3bd434` ([CC-0016](docs/coordination/WBC-01/WBC-01-CC-0016.md)): a send of a question that has ended, answered, failed or unavailable, takes nothing more. Ask again's next send hears only its own answer.
- **Codex's review** of `5568176` ([CX-0024](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5987041022)) passed F-025. Main had moved to `599178d` (#91), which is merged in here (CC-0017).
- **Codex's review** of `31d0e28` ([CX-0025](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5987121352)) confirmed two findings, also left by GitHub's reviewer. Both are fixed in `cc4f61b` ([CC-0018](docs/coordination/WBC-01/WBC-01-CC-0018.md)):
  - **F-026 (P1):** a kind the view offers more than once is no grant, in any order: it is unavailable, said why, on every path that reads it;
  - **F-027:** command scope, execution and space keys are tuples of whole ids, so ids holding the old separator, or a literal `-`, never meet another task's.
- **Personal's Correct and Forget** (main's code, repaired here at Codex's request under Davide's delegation, [CX-0018](https://github.com/davidelaverga/Sophia/issues/74#issuecomment-5985684913)): once a memory's fade ended, its invisible day took the press meant for Forget, and for Correct when the day is long. The day now lets the pointer through. This fixes the flaky `personal.spec.ts:227`; the overlap is measured in CC-0015.
- **Main merged in:** Luis's #73 (`4e7a42b`), #77 (`a31cbe3`), #78 and #79 (`4b68306`), #80 and #81 (`655fb99`), #82–#87 with #32 (`27f51f2`), #88–#90 (`e4003cd`), #75 (`bb7ba05`) and #91 (`95996e0`). The progress review, its card and its Challenge read the review beside the board's view, not as a field of the v2 plan. The card and the goal's line compare the review with the same revision. Answering its decision and challenging it are offered only where the plan is in force. Luis's words, tests and checks are kept.
  - **F-003 changes production behavior.** During a live call, every project sheet (task, resource, invitation) shows the call's switches, Leave included, under its head: the sheet covers the mini dock.
  - The shared-shell paths (`app/Sheet.tsx`, `app/call-in-reach.tsx`, `ProjectShell.tsx`, `MiniDock.tsx`, `InviteSheet.tsx`) are under Davide's scope extension.
- **Not exercised:** a physical iPhone, and a hosted call.

## Overlap

- **#73** and **#77–#80** (Luis, LFE-07.2), **#81–#90**, **#32** (M03), **#75** (M75's report) and **#91** (Luis's Personal presence) have merged. All are merged in here, as above. `features/artifacts/` (#32's and #75's) is untouched by this PR; #75 and this PR both changed only `CONTRIBUTING.md`, which merged without conflict.
- **#91** and this PR both changed `personal.css` and `personal.spec.ts`. The CSS merged on its own. In the spec both sides had added a `settled` helper; main's is kept, and this PR's is renamed `hoveredAtRest`, with no assertion changed ([CC-0017](docs/coordination/WBC-01/WBC-01-CC-0017.md)).
- **Personal** (#88–#90's): one property in `personal.css`, a labelled fixture setting (`memory=old`) and two checks, at Codex's request. Nothing else in Personal changes.

## Backend handoff (WBC-02)

1. Agree the contract.
2. Generate the validators.
3. Serve the view with per-viewer actions.
4. Bind the command, decision and result ports. Ask stays unavailable.

See the [progress](docs/progress/WBC-01.md#backend-handoff-wbc-02).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
