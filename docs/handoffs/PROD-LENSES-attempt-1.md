# Implementation-session handoff

Goal and attempt: PROD-LENSES (informe-25 H1; Luis: «Sigue con la cola mientras Davide cierra la ventana y el nuevo informe-25»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `studio/prod-lenses` from `origin/main` (`f37006560`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con la cola mientras Davide cierra la ventana y el nuevo informe-25»: local only until he says; merges on
green with no open P1 once pushed.
Ending commit/tree: `477fe616aca7` (tree `a031bea3a1dc`), the last commit of `studio/prod-lenses`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 8 files changed against
`f37006560` at that commit: `e2e/prod-lenses.spec.ts`, `src/app/vision.test.ts`, `src/app/vision.ts`, `src/features/studio/StudioShell.tsx`, `src/features/studio/useViewerState.ts`, `src/features/studio/viewer-state.test.ts`, `src/features/studio/viewer-state.ts`, `docs/plans/prod-honesty.md`. The review notes below name the commit of each later change.

## Outcome

- Production offers one lens, so it offers no choice: no lens bar, no palette or keys-index row naming a lens, keys 1-3 do nothing, and the body is no tab's panel; a stored or linked Explore or Build opens Converse and the address says `lens=converse`. Under the vision flag the three lenses stay as they were.
- `?vision=off` turns the vision flag off for one fixture page, so a browser check can measure what production offers; the address can only turn the flag off.

## Evidence

- Written first (commit `10102b606` before the fix): `vision.test.ts` and `viewer-state.test.ts` fail at import on main; at that commit `prod-lenses.spec.ts` fails its two production tests (lens bar count 1, the «coming» card shown) and passes its control under the flag.
- Playwright through `safe-run.ps1`, two workers, at the fix (`477fe616a`): prod-lenses, app-auth, commands, room-captions, studio-lens-address, first-step, room, room-basics, call-keys and views-goals 82/82.
- Unit: vision and viewer-state 16/16; Prettier, `oxlint --type-aware` and `tsc --noEmit -p apps/studio` clean.
- Captures: `evaluacion-2026-10-17/capturas/after-h1-room-production.png` (no lens bar; nav Studio, Goals, Tasks, Knowledge), `-light.png`, `-phone.png`, `after-h1-palette-production.png` (0 lens rows), `after-h1-keys-production.png` (0 lens rows), and the control `after-h1-room-flag.png` (3 tabs).

## Decisions and changes

- The report's production pass is split in small branches, as the design's refuter asked: this one (the lever and H1); `work/prod-asks` (DL-06) stacked on it, since its Request review check needs the lever; `home/no-companion-line` (PJ-02); `work/version-names` (V3, the Studio's side).
- The projection's «in this slice» reasons are Davide's lane (WBC-02): proposed to him in a draft held for Luis, not changed here.
- `lensesShown`/`shownLens` mirror route.ts's `viewsShown`/`shownView`; the registry's ids, words and keys are unchanged under the flag (commands.spec green).

## Remaining obligations

- A stored Explore or Build stays in this device's storage, shown as Converse while it isn't offered.
- `?vision=off` turns off everything under the flag on that page, saved conversations too unless the build serves them, as production does.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
