# WBC-01 — Tasks ready for real work state

Mission: [WBC-01](../missions/2026-10-03-workboard-connection/missions/WBC-01_UI_READINESS.md), under the [workboard connection packet](../missions/2026-10-03-workboard-connection/00_START_HERE.md) (v1.0, 2026-10-03). Parent scope: LFE-07.1, the shared LFE-06 controls and the interface parts of SCM-03/04. A follow-up to merged PR #63, not a rebuild of it.

## Owners and the handoff

| Role | Who | Since |
|---|---|---|
| Implementation owner | **Davide** (ownership amendment, 2026-10-03; the packet named Luis) | 2026-10-03 |
| Implementer | Claude Code, this session (Davide's Mac) | 2026-10-03 |
| Design and UX reviewer | **Luis**: reviews one desktop and one phone walkthrough before merge | — |
| Independent code reviewer | Codex, on the exact commit, through the coordination issue | — |
| Product and contract decisions | Davide | — |

The amendment changes only who implements. Scope, preservation, acceptance and exclusions are the packet's.

**Start.** Branch `lfe-07/workboard-readiness` from main `2542906` (PR #72), 2026-10-03. The packet inspected `c8dd5aa` and rechecked `2c13747` (PR #70). Two PRs merged since: #71 (`answers.ts`: an unconfirmed answer kept by the decision's revision and viewer while the page lives; a followed address waits for its plan) and #72 (an address at open waits for its plan; the Resources grid keeps its Tab stop by tile id). Both are retained; neither changes the work, decision or action contracts.

**Baseline on `2542906`, unmodified, darwin-arm64, Node 24.21.0, pnpm 11.7.0:** `node --test "apps/studio/src/**/*.test.ts"` 423 pass; `playwright test e2e/work.spec.ts` 35 of 35 pass.

### Open work on the same files

| PR | Owner | Overlap | How this branch treats it |
|---|---|---|---|
| [#73](https://github.com/davidelaverga/Sophia/pull/73) LFE-07.2 slice 1, the progress review on the goal's line (open, mergeable, head `b7caf58`) | Luis (EdX2C) | `plan.ts` (adds `WorkPlan.active_review`/`last_review`), `PlanNext.tsx`, `board.css`, `fixtures/work.tsx`, `fixtures/fixture-api.ts`, `e2e/work.spec.ts`, `docs/progress/LFE-07.md` | Not edited by this branch: `review.ts`, `work-review.ts`, `fixture-api.ts`'s command route and PlanNext's review line. The other shared files conflict textually; whichever merges second rebases. Semantic note for that rebase: a running or finished review is a live observation, so `active_review`/`last_review` belong on the goal's view (`GoalView`), not on the plan definition, whose revision activity never changes. The fixture's `review=` parameter is #73's; this branch uses `case=` |
| [#32](https://github.com/davidelaverga/Sophia/pull/32) SMC-M03 (draft) | Davide's M03 session | `GoalList.tsx`, `ProjectShell.tsx`, `fixtures/work.tsx`, `fixture-api.ts`; owns `features/artifacts/` (report viewer, Knowledge) | `features/artifacts/` is not touched or duplicated: a result opens through a port, shown here from a labelled source fixture as plain text |

## The contract proposal

Posted before any shared DTO code as [WBC-01-CC-0001](../coordination/WBC-01/WBC-01-CC-0001.md). In short: the Studio reads the packet's `sophia.work.board.v1` (with `sophia.work.plan.v2`) and `sophia.work.receipt.v1` exactly as proposed, through one feature-local guard and one conversion into the board's rows. No endpoint, OpenAPI amendment, generator or migration is added; WBC-02 promotes the agreed subset.

## Slices

| Slice | Mission part | State |
|---|---|---|
| S0 | Packet installed, owner handoff, contract proposal | done |
| S1 | G1 + G2: the board view bound through one guard; accepted plan kept while a replacement is proposed; lanes Active / Up next / Unassigned / Complete and Closed work; result entry | — |
| S2 | G3: typed waits, For you from the viewer's own requests, per-action availability | — |
| S3 | G4: receipts (admission, delivery, effect) in the shared `SessionActs`; decisions bound and keyed | — |
| S4 | G5: Ask through a port with real chunks; freshness and connection apart; while-away priorities; view-local state by viewer and plan | — |
| S5 | Evidence: UI-01–UI-21, desktop and phone walkthroughs, the handoff | — |

## Acceptance (fixture evidence; nothing here is live)

Every case starts **not run**. A fixture pass is not a live, hosted or accepted result.

| ID | Scenario | Fixture evidence |
|---|---|---|
| UI-01 … UI-21 | See the mission's table | not run |
