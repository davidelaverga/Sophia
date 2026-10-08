# Implementation-session handoff

Goal and attempt: Goals and Tasks tell the pilot, the first PR after the «$20» look at the project's other views,
attempt 1. Luis: «Sigue con Goals, Tasks y Resources».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a Studio slice from Luis's queue, named in «Goal and attempt».
Writable scope: `apps/studio/e2e/views-goals.spec.ts`, `apps/studio/fixtures/demo-goals.ts`, `apps/studio/fixtures/room.tsx`, `docs/plans/views-goals.md`, and this handoff.
Runtime unit: the Studio (`apps/studio`) on its room fixture page; no API, database, worker or deployment touched.
Existing authority: Luis's instructions in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no deploy, no production data, no comment on Davide's PRs.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `views/goals` from `room/alive` (`6bbdc944`), 2026-10-08
Ending commit/tree: `3c0cbec42611d8890a2df66572ca3edeab1a1448` (tree `6ffe1bc7bfddd606cf10dd55e5d762413799f214`), after its base merged in once main moved, after its base's stronger stop check merged in, after its base merged in once main moved. The commit after it adds only this handoff.

## Outcome

Design note: `docs/plans/views-goals.md`. The critique was given to Luis in the session.

- Every tab of the room page answers: Goals and Resources were links the page ignored. Resources, with nothing
  serving it there, says what it will hold, as the product does.
- The demo has its goals, from its own story and numbers: the pilot (completed), the rollout (running), keeping teams
  through an admin change (ready). Tasks no longer says «0» and «No goals yet».
- A goal's controls move it as the API's admission does (`admit_goal_command`, 0012): Hold, Stop and Resume at once,
  under a new authority, then settling (held, stopped) a moment later; Request review leaves the goal as it is.

## Evidence

- Browser checks: `e2e/views-goals.spec.ts` (4) new. Run locally under the guard (`pw-safe.ps1`) with the room's other
  checks: 72 passed. Checked by hand in the in-app browser: Goals from its tab with three goals, Tasks with three
  and Hold turning the rollout Holding then Held (Resume and Stop then offered), Request review leaving a ready goal
  ready, Resources saying what it will hold, no request unanswered.
- Control mutant: Goals left out of the views the page serves; the Goals check fails.
- Prettier, `oxlint --type-aware`, `tsc`.
- Independent review, two rounds: the first's P2 taken (Request review set a status the product never sets), with
  its P3s (the authority moved rather than the revision, the intermediate status); the second found no P1 or P2, and
  its P3 is taken (the admission published).

## Limitations and next action

- Left for after Davide's #107 (open; it changes Tasks' board, its fixtures and checks): the Tasks page's own demo
  (its board tells a PDF export, not the pilot), Resources' panel in the demo (its sessions open that board's tasks),
  and the goal's «Sent… when Sophia confirms» line that stays after Sophia confirmed (`work.spec.ts` checks it).
- The Work pulse says «Project updated», «6 days ago», beside a goal that just moved: the fixture's events are
  generic, not the API's `command.admitted`.
- The fixture still refuses no command a stale page sends; the API would answer «The goal changed meanwhile».
- Next: merge on green CI with no Codex P1, after #182.
