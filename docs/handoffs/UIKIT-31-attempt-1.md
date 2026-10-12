# Implementation-session handoff

Goal and attempt: UIKIT-31 (one primary on a goal: Hold, Resume and Stop as text buttons in the goal's head;
informe-ui-premium §3 movement 6; Luis: «sigue con Hold/Stop como botones de texto»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/hold-stop-text` from `ui/light-stage` at
`18ed5952` (stacked on PR #252 → #251 → … → #220; the base retargets as each merges)
Writable scope: this worktree only (`apps/studio`, `packages/ui`, `docs/plans`, `docs/handoffs`; a contract amendment
only where its note says so), on branch `ui/hold-stop-text`; no service code, no deploy.
Runtime unit: Luis's Windows host (the fixture dev server on :5197; Playwright through
`.claude-guards/safe-run.ps1`, 2 workers); CI (GitHub Actions) as the run on record.
Existing authority: Luis's standing instructions for the kit stack (push to `ui/*`, answer Codex's threads with a fix
commit, cancel superseded CI runs); merges are Luis's, with no open P1. Spending: no paid service; CI minutes only.
Ending commit/tree: `dc25fcb3` (tree `16f159f2796e`): 4 files: `WorkControls.tsx` (the classes), `theme.css` (the step after the filled press),
`e2e/goal-controls.spec.ts` (new, 3), `docs/plans/goal-controls-text.md`. The commit after it adds only this handoff.

## Outcome

- In a goal's head «Request review» is the one filled press; Hold, Resume and Stop are `text-button`s with the same
  words, tips and disabled state. Stop keeps asking in place (its question's own presses keep their shapes). The text
  buttons stand 12 px from the filled press and 6 px from each other.
- The task sheet's «Act on it» (`SessionActs`) is untouched: a different place, with its keys.
- Unverified: the Playwright run (the local guard); CI is the run on record.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm --filter @sophia/studio typecheck`: clean.
- Measured in the page, Tasks (`room.html?demo=1&place=work`) and the work space (`work.html`): filled `['Request
  review']`; text `Hold` 24 px with its tip, `Stop` 24 px; the gap after the primary 12 px; pressing Stop shows
  «Stopped goals can’t be resumed. · Keep working · Stop for good», and «Keep working» puts the text button back.
- Captures: `evaluacion-2026-10-11/ui-premium/tasks-controls-{dark,light}.png`.

## Decisions and changes

- Text beside the primary, not a menu: a menu hides Stop, and a stop that is final should be one visible press that
  asks, as it was.
- 24 px is the press scale's inline step (`control-heights`), so no height was invented.
- After the review (Codex on #253, 2026-10-11): on a coarse pointer the row keeps 8 px between its text presses, so
  their reaching targets (4 px a side) never meet; the disabled test hovers the disabled press and the enabled one.

## Remaining obligations

- Watch CI; the independent review (Codex) with no P1/P2 before merge. The base is `ui/light-stage` until #252 merges.

## Next bounded action

The dock to the header on non-Studio views (informe-ui-premium §3 movement 7), then the Knowledge cover's paper
before paint; the light in the project views still waits for Luis's eye.

## Post-review, round 3 (Codex on #253)

- Stop carries its tip («End the work for good»): `ConfirmButton` takes a `tip`, shown with `has-tip` beside an
  optional key; goal-controls.spec reads both tips and Stop's on focus.
- The disabled text step (0.6) is scoped to a goal's controls; any other disabled text button keeps the kit's 0.45
  (a spec reads it).
- The press's 0.5 px nudge already skips `:disabled` (`c59c9cf7`, from #232, merged forward).
