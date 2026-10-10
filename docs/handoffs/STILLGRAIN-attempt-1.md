# Implementation-session handoff

Goal and attempt: the film grain stays still (`docs/plans/still-grain.md`), attempt 1. Found in the «$20» evaluation:
measured on every fixture page, the one animation running on all of them was the grain; Luis: «sigue evaluando e
iterando».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a fix named in «Goal and attempt».
Writable scope: `apps/studio/src/app/theme.css` (the grain), `apps/studio/e2e/still-grain.spec.ts`, the design note
and this handoff.
Runtime unit: the Studio (`apps/studio`); no API change.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `studio/still-grain` from `main` (`ab80958f`), 2026-10-09
Ending commit/tree: `935f15dd9c66fee3bcb1d7c4f0a616dda09a8eed` (tree `ded952632e2b1107ef19ea97b38bc2ea37b27042`). The commit after it adds only this handoff.

## Outcome

- The grain (`body::after`) was a layer twice the screen, moved six times every 0.9 s on every page, for as long as
  it stayed open. It keeps its texture and its 3 %, held still over the screen (`inset: 0`); the keyframes went, and
  the reduced-motion rule no longer needs to stop it.

## Evidence

- The evaluation's measure (12 fixture pages, desktop and phone, `document.getAnimations()`): `grain` ran on all 24.
- `still-grain.spec.ts`, written first and failing first (3 failed: `animation: grain`); then 3 passed. With it, the
  specs nearest the grain under the machine's guard (1 worker): `still-grain`, `signin`, `home`, `ink` (contrast on
  five pages, desktop and phone), `room-passage-link`: 64 passed.
- Mutants against the spec, then removed: the grain moving again, the grain gone, the grain at 6 %: each killed. The
  control (a comment) passed.
- Prettier, `oxlint --type-aware` on the whole repo, `tsc`.
- Independent review (on the committed objects): no P1 or P2. No seams (the noise stitches its tiles; the 160 px
  period was there in every frame before), the z-order unchanged (100, the next is 60), nothing else used the
  keyframes or the inset. Its P3: the spec's second check (nothing infinite on the body) mostly repeats the first;
  kept as it is, a cheap guard.

## Limitations and next action

- Next: merge on green CI with no Codex P1.
