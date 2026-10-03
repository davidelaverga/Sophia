# LFE-07 — let people review the lead's plan, steer and reallocate intelligently

Package: [frontend/LFE-07](../execution/2026-10-01-unified/frontend/LFE-07.md). Implementation and integration: Luis. The coordination backend (SCM-04/05): Davide. Read on 2026-10-03.

## Where the source stands

| What | State | How it was observed |
|---|---|---|
| Plan, decision or review API | None in the repository | `apps/api/src`, `packages/contracts` |
| Coordination contracts | Proposed schemas in the continuation: `sophia.work.plan.v1`, `sophia.work.decision.v1`. Not in the generated contracts | `contracts/coordination` |
| SCM-04/05 | Not started in any branch | `gh pr list` |

## LFE-07.1 — the smallest useful plan (fixture)

- **Attempt 1** ([handoff](../handoffs/LFE-07-attempt-1.md), [design note](../plans/LFE-07.1-plan-view.md)): the plan in Tasks, under its goal. It shows:
  - its revision and state, and the next checkpoint;
  - each item with who does it and when it starts;
  - what it assumes, apart from what was decided, and who decides what is left.

  It reads and doesn't act. It runs on `fixtures/work.html`.
- **Then a board** (same handoff): goals one at a time; four lanes of live tiles; threads; a task's sheet with Act on it and Ask Sophia; what changed since the last look. It runs on fixtures. Endpoints are proposed in the pull request.
- **Attempt 2** ([handoff](../handoffs/LFE-07-attempt-2.md)): Codex's P2s on the board, fixed (the tree, waiting on whom, decisions' revision and expiry, goals without a plan, a task's draft and Sophia's latest answer, what was seen per plan).
