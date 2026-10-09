# Implementation-session handoff

Goal and attempt: the type scale check measures once each view has drawn, not once the network is idle
(`docs/plans/type-scale-drawn.md`), attempt 1. Found on #187's CI; Luis: «Do this task here: Replace networkidle wait
in type-scale spec».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a test fix named in «Goal and attempt».
Writable scope: `apps/studio/e2e/type-scale.spec.ts`, the design note and this handoff.
Runtime unit: none: an end-to-end check of the Studio (`apps/studio`); nothing the Studio builds changes.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `test/type-scale-no-networkidle` from `main` (`ab80958f`), 2026-10-09
Ending commit/tree: `c608b4d4340461e81a59e45e0ae8e62e9a4e73b5` (tree `ac349a6a5341e71a3d70f4a63fd7aa7e421eff55`). The commit after it adds only this handoff.

## Outcome

- «type · Knowledge keeps to the app's scale, its bar too» timed out on #187's CI in `waitForLoadState('networkidle')`:
  a fixture page keeps loading as it draws, and a quiet half second may not come in 30 s on a slow runner.
- Each view now names what must be on screen before it is measured: the bar's Invite (the membership's read) and a
  part for each read, the last of a chain included: the room's words; Knowledge's first report and first drawn cover;
  Updates' decided line and a meeting; Conversations' context and a message only its thread shows. What it measures,
  and the scale, are unchanged.

## Evidence

- The spec alone under the machine's guard (1 worker), with the repo's Node 24.21 (`pnpm install` first: #107 added
  packages): the first run passed the room, Knowledge and Conversations, and failed on Updates' anchor, which no
  longer existed (Updates changed since the text was taken): said as that missing text, not as a network timeout.
  With Updates' anchors fixed, `--repeat-each=3`: the first 7 runs passed, all four views among them; the guard then
  stopped the run (free RAM down to 5.6 GB), so the last 5 didn't run.
- Prettier, `oxlint --type-aware` on the whole repo.
- Independent review: no P1. Its two P2s taken: Conversations' anchor was each row's last message, met by the list
  read, not the thread's (now a message only the thread shows, looked for in the thread); Knowledge's covers draw three
  reads after the list (now its first drawn cover too). Its P3s taken: the bar's Invite as the membership's anchor; the
  comment that the heading proved the view had drawn (the bar says «Loading…» from the first render).
- After the review: the spec, `--repeat-each=2`: 8 passed.

## Limitations and next action

- `ink.spec.ts` has the same `networkidle` wait over five pages: left for its own change.
- Next: merge on green CI with no Codex P1.
