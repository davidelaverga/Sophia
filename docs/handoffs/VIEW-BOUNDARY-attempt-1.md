# Implementation-session handoff

Goal and attempt: VIEW-BOUNDARY (the third gaps report §4, platform; Luis: «Sigue con la cola»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `app/view-boundary` from `origin/main` (`e1cc4b4d`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Sigue con la cola»; merges on green with no open P1.
Ending commit/tree: `0503a903894b` (tree `868774220a24`), the last commit of `app/view-boundary`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 6 files changed against
`origin/main` at that commit: `e2e/view-boundary.spec.ts`, `fixtures/room.tsx`, `src/app/theme.css`, `src/features/studio/ProjectShell.tsx`, `src/features/studio/ViewFailed.tsx`, `docs/plans/view-boundary.md`. The review notes below name the commit of each later change.

## Outcome

- A project view that fails to draw says so in its place, with Try again and Load the page again.
- The header, the other views and the call stay. What failed reaches the crash reports.

## Evidence

- Plan: `docs/plans/view-boundary.md`.
- **Written first and failing** (commit of the tests): `view-boundary.spec.ts`.
- **Found on the way:**
  - The first trigger, a goal served with `criteria: null`, never reached a view. The client refused the whole
    snapshot as «Sophia is unreachable».
  - The trigger is now a fixture Resources view that throws until healed (`resources=crash`, `healView`).
- **After the change, locally:**
  - view-boundary and resources: 100/100;
  - conversations, knowledge, updates, goals and project-activity specs passed beside them earlier, 264 checks;
  - type-aware lint, typecheck and Prettier are clean.
- **Capture:** Resources failing in its place under the header, which keeps its views, Join the room and Invite.

## Decisions and changes

- **`ViewFailed` wraps the page body,** and moving to another view starts it clean. It first did so keyed by the view;
  see the CI catch below for why it no longer is.
- **The Studio's own view keeps the outer boundary for now:** its stage holds the dock, and the dock must stay outside a
  boundary that could replace it.
- **`LoadFailed` stays** for what loads before any view.
- **Codex P1 on #416, after the ending commit: the pulse outside the boundary.** In Tasks, WorkPulse was a sibling of
  `ViewFailed`, so a pulse that failed to draw took the header with it.
  - The check came first (`f1139f44`): the pulse inside the boundary's mark. It failed.
  - The fix (`4737289d`): the pulse moves inside with the view's body. What the boundary holds is marked
    (`data-view-boundary`) in a box that draws nothing (`display: contents`), so the page's grid is unchanged.
  - The boundary's, Tasks', Goals', Conversations', Knowledge's, Updates', Resources' and the cards' specs, with
    `view-titles`: 269/269.
- **Main merged in (`9c2c5e50`):** #417's `data-content` sits on the same `<main>`, and both sides' styles stay. The
  toast's comment, which both PRs had pushed away from its rule, is back above `.toast`.
- **Codex P1 on #416, second: the boundary's words in the component.** They now live in `view-failed-view.ts`.
  - The unit check came first (`70ee86f2`) and failed.
  - The fix (`1eabc87b`): `ViewFailed` draws `VIEW_FAILED`.
  - `view-boundary`, `skip-link` and `view-titles`: 18/18.
- **CI caught `goal-address.spec.ts` failing:** keyed by the view, the boundary remounted the page on every move. Goals
  and Tasks share one `GoalList`, and the goal chosen in its rail must hold across a visit to Goals.
  - The existing check is the failing one; nothing new was needed.
  - The fix (`59441112`): the boundary takes the view as a prop. `getDerivedStateFromProps` lets a failure go when the
    view moves, before it draws, and nothing that draws well is remounted.
  - **Not run locally:** AION2 was open, so no browser runs on Luis's machine. CI is the run on record for this push.
    Typecheck and type-aware lint are clean.

## Remaining obligations

- None. A boundary of the Studio view's own, with the dock kept outside, is a possible later step.

## Next bounded action

- Luis: merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
