# Implementation-session handoff

Goal and attempt: Knowledge has drawn once every cover on screen has, not the first alone
(`docs/plans/knowledge-covers-drawn.md`), attempt 1. Left from #202; Luis: «Procede con knowledge».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a test fix named in «Goal and attempt».
Writable scope: `apps/studio/e2e/{drawn.ts,drawn.spec.ts (new)}`, `apps/studio/fixtures/{fixture-api.ts,room.tsx}`
(`hold=covers`, `releaseCovers`), the design note and this handoff.
Runtime unit: none: end-to-end checks of the Studio (`apps/studio`) and its fixtures; nothing the Studio builds changes.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `test/knowledge-covers-drawn` from `main` (`3e6d57b1`), 2026-10-09
Ending commit/tree: `63d19a10eb85b31a7bce0c8aeb5974dab5c7753b` (tree `283d7f2fb15e3d5f2b6aab8cac5c44101f2d36ee`). The commit after it adds only this handoff.

## Outcome

- Knowledge's last part in `e2e/drawn.ts` polls until no cover on screen waits and one at least shows words, on a wide
  screen and a phone alike (no branch on the width). `ink` and `type-scale` measure every cover on screen.
- The room fixture's `hold=covers` holds the demo library's covers until `window.fixture.releaseCovers()`, then lets
  them through 400 ms apart; `e2e/drawn.spec.ts` uses it, desktop and phone.

## Evidence

- Measured first: with today's fixture every cover on screen had drawn when the old wait ended (21 runs, desktop and
  phone, CPU slowed 6× too): the gap appears only when covers come at different times.
- `drawn.spec.ts` written first: with the old wait it failed (3 covers still waiting on a wide screen, 1 on a phone).
- Under the machine's guard (1 worker): `drawn` + `ink` + `type-scale`, `--repeat-each=2`: 32 passed; `knowledge*`,
  `report`, `room-live-version`, `room-passage-link`: 130 passed.
- Mutants with a passing control: the old first-cover wait, «waiting» not looked for, the wait not awaited, one cover
  measured, the covers not held all fail. «One at least shows words» survives: a guard no check reaches.
- Prettier, `oxlint --type-aware` on the whole repo, `tsc --noEmit` for the Studio (e2e and fixtures included).
- Independent review (committed objects), twice: no P1 or P2. Its P2 (the phone's precondition had a 400 ms window)
  taken: covers held until let through. Its P3s taken: one cover with words asked for, spacing from the release, a
  plain if/else in `drawn()`, the hold on the project as the other holds, `hold=covers` in the room fixture's header.
- After the review's changes: mutants as above; `drawn`, `ink`, `type-scale`, `knowledge*`, `report`,
  `room-live-version`, `room-passage-link`: 146 passed.

## Limitations and next action

- «One at least shows words» is not exercised: every cover reads in these fixtures.
- Next: merge on green CI with no Codex P1.
