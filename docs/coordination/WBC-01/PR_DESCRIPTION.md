**LFE-07: make Tasks ready for real work state (WBC-01)**

WBC-01 ([mission](docs/missions/2026-10-03-workboard-connection/missions/WBC-01_UI_READINESS.md)) makes Tasks ready for real work state. It follows #63; it doesn't rebuild it. **Fixture-ready only**: no endpoint, migration, provider call, deployment, runtime change or prompt change.

- **Owner:** Davide (ownership amendment).
- **Implementer:** Claude Code.
- **Design and UX review:** Luis, from the [walkthroughs](docs/evidence/WBC-01/README.md).
- **Code review:** Codex ([WBC-01-CC-0002](docs/coordination/WBC-01/WBC-01-CC-0002.md)).

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

Nine existing checks changed their expected words or lanes, by design. Two Resources act checks also changed their words. All are listed in the [progress](docs/progress/WBC-01.md).

## Evidence (fixture, darwin-arm64, Node 24.21.0, pnpm 11.7.0)

- `pnpm toolchain:check`, `format:check`, `lint`, `build`, `typecheck`, `contracts:check`: exit 0.
- `pnpm test`: 708 pass. `pnpm artifacts`: identities reproduced. `pnpm test:integration`: 67 pass, 2 skipped.
- `pnpm --filter @sophia/studio run build`: passes. No board or fixture code is in the bundle.
- `pnpm --filter @sophia/studio test:browser`: 176 of 176 pass. That includes 25 `wbc ·` checks for UI-01–UI-21 and 7 `review ·` checks.
- **Mutations:** 37 repairs reverted one at a time; each makes a check fail ([mutations.txt](docs/evidence/WBC-01/mutations.txt)). The one exception is a redundant key, recorded.
- **Independent review** of `f736ad7`: 3 P1, 3 P2 and 7 P3. All are fixed except one P3, kept by choice, with regressions ([table](docs/progress/WBC-01.md#independent-review-before-the-push)).
- **Not exercised:** an active call on the Tasks page (UI-20's call part). The call controls are unchanged and covered by the room's checks.

## Overlap

- **#73** (Luis, LFE-07.2) touches `plan.ts`, `PlanNext.tsx`, `board.css`, the work fixture and the checks. Whichever merges second rebases. Its `active_review` and `last_review` belong on `GoalView`, and `PlanNext` now takes `goal`.
- **#32** (M03): `features/artifacts/` is untouched.

## Backend handoff (WBC-02)

1. Agree the contract.
2. Generate the validators.
3. Serve the view with per-viewer actions.
4. Bind the command, decision and result ports. Ask stays unavailable.

See the [progress](docs/progress/WBC-01.md#backend-handoff-wbc-02).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
