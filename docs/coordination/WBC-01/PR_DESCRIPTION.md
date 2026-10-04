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
- `pnpm test`: 735 pass (after merging main, #81). `pnpm artifacts`: identities reproduced, and `pnpm test:integration`: 67 pass, 2 skipped. Both last ran at `8afd007`; no runtime path has changed since.
- `pnpm --filter @sophia/studio run build`: passes. No board or fixture code is in the bundle.
- `pnpm --filter @sophia/studio test:browser`: 225 of 225 pass. That includes:
  - 25 `wbc ·` checks for UI-01–UI-21;
  - 7 `pre-push ·`, 7 `codex · F-` and 4 `pr76 ·` checks for the reviews' findings;
  - Luis's 31 checks from #73 and #77–#80 and his 5 brand checks from #81, with 2 more for the merges.
- **Mutations:** 75 repairs reverted one at a time; each makes a check fail ([mutations.txt](docs/evidence/WBC-01/mutations.txt)). The one exception is a redundant key, recorded.
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
- **Main merged in:** Luis's #73 (`4e7a42b`), #77 (`a31cbe3`), #78 and #79 (`4b68306`), and #80 and #81 (`655fb99`). The progress review, its card and its Challenge read the review beside the board's view, not as a field of the v2 plan. The card and the goal's line compare the review with the same revision. Answering its decision and challenging it are offered only where the plan is in force. Luis's words, tests and checks are kept.
  - **F-003 changes production behavior.** During a live call, every project sheet (task, resource, invitation) shows the call's switches, Leave included, under its head: the sheet covers the mini dock.
  - The shared-shell paths (`app/Sheet.tsx`, `app/call-in-reach.tsx`, `ProjectShell.tsx`, `MiniDock.tsx`, `InviteSheet.tsx`) are under Davide's scope extension.
- **Not exercised:** a physical iPhone, and a hosted call.

## Overlap

- **#73** and **#77–#80** (Luis, LFE-07.2) and **#81** (the Umbral brand) have merged. All are merged in here, as above.
- **#32** (M03): `features/artifacts/` is untouched.

## Backend handoff (WBC-02)

1. Agree the contract.
2. Generate the validators.
3. Serve the view with per-viewer actions.
4. Bind the command, decision and result ports. Ask stays unavailable.

See the [progress](docs/progress/WBC-01.md#backend-handoff-wbc-02).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
