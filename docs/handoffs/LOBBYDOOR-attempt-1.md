# Implementation-session handoff

Goal and attempt: the lobby's «$20» pass, the room's side (the door), attempt 1. Luis: «Arranca».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a Studio slice from Luis's queue, named in «Goal and attempt».
Writable scope: `apps/studio/src/features/access/LobbyPanel.tsx`, `apps/studio/src/app/theme.css` (the lobby's rules), `apps/studio/fixtures/report-data.ts` (the demo's knock), `apps/studio/e2e/lobby-door.spec.ts`, `docs/plans/lobby-door.md`, this handoff.
Runtime unit: the Studio (`apps/studio`) on its fixture pages; no API, database, worker or deployment touched.
Existing authority: Luis's instructions in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no deploy, no production data, no comment on Davide's PRs.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `lobby/critique` from `main`, 2026-10-08
Ending commit/tree: `c80b4a8fe6edcbc094f76dcbd8609020d6c302d0` (tree `7e180350f9e6497deb12e567d9984bb51a7be070`). The commit after it adds only this handoff.

## Outcome

Note: `docs/plans/lobby-door.md` (the measured gap, the change, the checks).

- «At the door» (or «3 at the door») after a warm dot that breathes; still under reduced motion. The status a screen
  reader hears names the one waiting («At the door: Ana Ruiz»); the panel keeps its name «Waiting to come in».
- Each row: the initial in a warm ring, the name and how long they have waited; «Let in» a filled warm pill, «Decline»
  a quiet word; Block after a second knock, unchanged.
- Unboxed (no warm border), 14 px corners; one line on a phone; the demo's knock 50 s old.

## Evidence

- `e2e/lobby-door.spec.ts` 4 passed (failed first, all 4); the report checks that find the door pass.
- Mutants, each killed with the control surviving: «Let in» not filled, the demo knock days old, the row on two lines,
  a box again, the dot moving under reduced motion (this one by hand: Vite hadn't taken `theme.css` in before the
  batch's run).
- Captures at 1440 (in a call) and 390 px.
- Prettier, `oxlint --type-aware` (clean but `brand-assets.mjs`), `tsc`.

## Limitations and next action

- The guest's side (`JoinFlow`, `GuestRoom`) has no fixture page, so it couldn't be measured or captured: the next
  slice is a fixture for it, then its pass.
- Next: an independent review; merge on green CI with no Codex P1.
