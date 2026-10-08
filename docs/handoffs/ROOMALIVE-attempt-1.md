# Implementation-session handoff

Goal and attempt: the demo's room, alive, the second PR after the «$20» look at the room, attempt 1. Luis: «Sigue con
R2» (after «Sigue con lo siguiente de la cola»: «"Is this worth $20?" for the rest of the app… the room, then the
other views»).
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a Studio slice from Luis's queue, named in «Goal and attempt».
Writable scope: `apps/studio/e2e/room-alive.spec.ts`, `apps/studio/fixtures/fake-people.ts`, `apps/studio/fixtures/room-scene.ts`, `apps/studio/fixtures/room.tsx`, `docs/plans/room-alive.md`, and this handoff.
Runtime unit: the Studio (`apps/studio`) on its room fixture page, in the demo only; no API, database, worker or deployment touched.
Existing authority: Luis's instructions in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no deploy, no production data, no comment on Davide's PRs.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/alive` from `room/honest` (`20a5e89f`), 2026-10-08
Ending commit/tree: `e8b4b1d771e74ed5896a58b7217e6279e2bdf7df` (tree `838774c55d0d0334d300f4b9fc2fcddb69f1d589`), after main merged in once R1 landed (the floor's move kept as floorMoves, R1's own copy of the presses taken out), after the stop check made to hold the floor, as a control mutant (the scene's timers never cleared) survived it, after its base merged in once main moved, after its base's CI fix merged in. The commits after it change only this handoff.

## Outcome

Design note: `docs/plans/room-alive.md`. Fixture only: what Sophia says is the runtime's to write; the demo shows the
bar.

- The demo's room has its team: Marco and Lucía are there unless `people=` says otherwise.
- Asked in, Sophia says where the project stands, from its own report, captioned as she says it. Then Marco takes the
  floor (only the holder is captioned, CX-0019) and asks aloud, and she listens to him.
- Her presses cut the scene short: a line under way ends cut off, and nothing more is said. Without the demo, nothing
  changes.

## Evidence

- Browser checks: `e2e/room-alive.spec.ts` (4) new. Run locally under the guard (`pw-safe.ps1`) with the room's other
  checks (room-honest, room-dock, room-captions, room-people, ink, type-scale, views-goals): 72 passed. Checked by hand in the in-app browser: the whole scene ending «Sophia is listening to
  Marco», and a cut mid-line (her line `interrupted`, Marco never speaking, «listening to you»), no request
  unanswered.
- Control mutant: the scene's timers never cleared on a press. It survived the first stop check (Marco's line fell
  outside what it read); the check now also holds the floor where it was past Marco's turn, and the mutant fails it.
- Prettier, `oxlint --type-aware`, `tsc`.
- Independent review, two rounds: the first's P2 taken (Marco was captioned without the floor), with its P3s on a
  cut line and the checks' timing; the second found no P1 or P2, and its P3 is taken (a pass made from the page
  ends the scene).

## Limitations and next action

- Before joining, the room still says «The room is ready» without naming who is in it: the pre-join view has no
  people to show yet.
- The scene's Marco replaces whoever the page marked as speaking (fixture hooks only).
- Next: merge on green CI with no Codex P1, after #181.
