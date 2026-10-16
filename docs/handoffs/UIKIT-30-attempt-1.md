# Implementation-session handoff

Goal and attempt: UIKIT-30 (the room as lit paper; «has the floor» at 4.5:1 on paper; informe-ui-premium §8 move 3;
Luis: «Procede con los arreglos»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/light-stage` from `ui/light-breath` at
`c24411b6` (stacked on PR #251 → #250 → … → #220; the base retargets as each merges)
Writable scope: this worktree only (`apps/studio`, `packages/ui`, `docs/plans`, `docs/handoffs`; a contract amendment
only where its note says so), on branch `ui/light-stage`; no service code, no deploy.
Runtime unit: Luis's Windows host (the fixture dev server on :5197; Playwright through
`.claude-guards/safe-run.ps1`, 2 workers); CI (GitHub Actions) as the run on record.
Existing authority: Luis's standing instructions for the kit stack (push to `ui/*`, answer Codex's threads with a fix
commit, cancel superseded CI runs); merges are Luis's, with no open P1. Spending: no paid service; CI minutes only.
Ending commit/tree: `8d9057cb46fc` (tree `f5b642686d62`), the last commit of `ui/light-stage`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 4 files changed against
`ui/light-breath` at that commit: `e2e/light-stage.spec.ts`, `src/app/theme.css`, `docs/handoffs/UIKIT-30-attempt-1.md`, `docs/plans/light-stage.md`. The review notes below name the commit of each later change.
The branch as merged (#252, merge commit `86de0da06125`): its head `3fd143b7407f` (tree `5666d637add9`), the repository result
reviewed and merged: no commit of the branch's own after `8d9057cb46fc` changes code, the later ones merge its base
forward or touch this record. (Recorded after merge: Codex on #252.)

## Outcome

- On paper the stage carries a layer behind everything: the halo as a soft field to the edges (0.06 at the light's
  centre, 0.025 by 60 %, gone at the corners) over a warm vignette (0.05 at the edges, nothing by 55 %); the light
  sits above it. The stage reads as a surface the light sits on, not a hole in the page. In the room nothing is added.
- «has the floor» on paper is the warm at full (`rgb(150, 83, 40)`, 5.6:1); the room keeps 0.85.
- Unverified: the Playwright run (the local guard); CI is the run on record.

## Evidence

- Source-register IDs (`docs/pack/sources/source-register.json`): none consulted. A Studio CSS slice: the materials were
  the repository's own files (`theme.css`, the fixture room) and informe-ui-premium §8, not a registered source.

- `pnpm format`, `pnpm lint` (type-aware), `pnpm --filter @sophia/studio typecheck`: clean.
- Measured in the page, the room in a call in light: `.room-stage::before` background
  `radial-gradient(80% 70% at 50% 332.725px, rgba(109, 91, 208, 0.06), rgba(109, 91, 208, 0.024) 60%, …)` over the
  warm vignette, `z-index: 0`; the light at `z-index: 1`; the role `rgb(150, 83, 40)`. In the room: no field, the
  role `rgba(241, 220, 199, 0.85)`.
- Headless captures after the three light fixes: `evaluacion-2026-10-11/light-mode/*-after.png`.

## Decisions and changes

- A pseudo-element behind the stage, not a background on `.room-stage`: the stage is a size container whose children
  are placed in it; a `::before` at `z-index: 0` leaves the light, the people and the dock exactly where they are.
- Numbers under 0.1 on purpose: a field, not a second light; the warm vignette says «surface», the halo says «hers».

## Remaining obligations

- Watch CI; the independent review (Codex) with no P1/P2 before merge. The base is `ui/light-breath` until #251 merges.

## Next bounded action

The light-mode verdict's three moves are in (#250, #251, this). Back to the UI report's queue: Hold/Stop as text
buttons (one primary per view), the dock to the header on non-Studio views; the Knowledge cover's paper before paint.

## Post-review, round 2 (Codex on #252)

- The warm vignette is sized `ellipse closest-side`: each edge's midpoint is the ramp's end (0.05), the corners past it.
  At `100% 100%` an edge stood at half the radius, inside the clear 55 %, so no edge was tinted.
- light-stage.spec measures it as drawn: the vignette alone (the stage's parts hidden, the halo's layer taken off), a
  screenshot's pixels at the left and top edge midpoints warmer than the centre. A control with the old sizing reads
  no difference.
- The ending record names the integration result; the source-register IDs are recorded (none consulted).
