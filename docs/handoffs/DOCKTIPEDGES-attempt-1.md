# Implementation-session handoff

Goal and attempt: the dock's tips stay on a narrow screen, attempt 1. The P3 left on #159 (its review), from Luis's queue.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a Studio slice from Luis's queue, named in «Goal and attempt».
Writable scope: the files this PR changes (its diff against `main`), and nothing outside `apps/studio` and `docs/`.
Runtime unit: the Studio (`apps/studio`) on its fixture pages; no API, database, worker or deployment touched.
Existing authority: Luis's instructions in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no deploy, no production data, no comment on Davide's PRs.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `polish/dock-tip-edges` from `main`, 2026-10-08
Ending commit/tree: `c42c95895db7fb22e52df190837b741bbade6ba1` (tree `6fff2bb443899abd780b8259edfc104f08928487`). The commit after it adds only this handoff.

## Outcome

At 600 px and under, the dock's squares are `position: static` (`theme.css`): a tip opens over the dock's middle,
not over its own square, so the outer squares' tips (Microphone, Leave) stay on the screen. The initial badge keeps its
place (it sits in `.dock-icon`).

## Evidence

- `room-dock.spec.ts` «at 360 px, the tips of the outer squares stay on the screen»: failed first (the left edge at
  −4 px), passes after; the dock spec 9 passed.
- Captures at 390 px: Microphone's and Leave's tips over the dock's middle.
- Prettier, `oxlint --type-aware` (clean but `brand-assets.mjs`), `tsc`.

## Limitations and next action

- At 600 px and under, tips still show at once on hover (no 320 ms wait as on a computer): a P3 left.
- Next: merge on green CI with no Codex P1.
