# Implementation-session handoff

Goal and attempt: the demo's Tasks show the rollout's plan as a board (`docs/plans/demo-board.md`), attempt 1. Found
in the «$20» evaluation: the demo's Tasks repeated Goals; Luis: «sigue evaluando e iterando». Captures before and
after sent to Luis before the PR.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): fixture data named in «Goal and attempt».
Writable scope: `apps/studio/fixtures/demo-work.ts` (new), `apps/studio/fixtures/room.tsx` (its wiring),
`apps/studio/e2e/views-goals.spec.ts`, the design note and this handoff.
Runtime unit: none: the Studio's fixture pages (`apps/studio`); nothing the Studio builds changes.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-decide`, branch `fixtures/demo-board` from `main` (`acfba406`), 2026-10-09
Ending commit/tree: `396a1b989116c415d8275ae0a02e96c5e923b1af` (tree `4f413073f347ca0d141314e3b00dc3b36f000f0f`). The commit after it adds only this handoff.

## Outcome

- With `?demo=1` the room answers `/plans` with a plan for its running goal: the board fixture's (`work-data.ts`), in
  the onboarding pilot's words and cast (Davide is Marco), its times moved to now, read by the Studio's own
  `readBoardView`. The demo's Tasks draw the board: four lanes, seven tasks, the next checkpoint.
- A task offers only what the room can answer (asking Sophia): no Guidance, Hold or Stop the fixture can't take. A
  board that doesn't read is said in the console and in `unexpected`; the goals then show without it.

## Evidence

- `views-goals.spec.ts`, written first and failing first (no checkpoint, no board); then 5 passed, after the
  review's changes too. With it: `report` (it opens the demo's Tasks), `room-recap`, `room-so-far`, `ink`,
  `type-scale` under the machine's guard (1 worker): 149 passed, 5 failed, the known Windows-only ones
  (`report-page` print checks, `report-reading`'s five-column table), none on a page this touches.
- Mutants, then removed: no board served, a fixture title left, the fixed clock, the old cast, the commands back:
  each killed. The control (a comment) passed.
- Prettier, `oxlint --type-aware` on the whole repo, `tsc`.
- Independent review (committed objects): no P1. Its P2 taken: the sessions' Guidance, Hold and Stop failed against
  the room fixture (now not offered). Its P3s taken: a board that doesn't read said loudly; the activity and an
  assumption matched to the tasks; the unused Mara mapping gone. Noted: the room's demo has no viewer (its token
  carries no subject), so the decision waits on «someone» and nothing is «for you».

## Limitations and next action

- The demo's times are moved to now at each read: they never age while the page is open.
- Next: merge on green CI with no Codex P1.
