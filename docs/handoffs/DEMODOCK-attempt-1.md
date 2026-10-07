# Implementation-session handoff

Goal and attempt: the Codex P2s left on #151 (demo data) and #147 (the phone dock), attempt 1. Luis: «Encólalo todo»,
«Continúa con lo demás».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a Studio slice from Luis's queue, named in «Goal and attempt».
Writable scope: `apps/studio/e2e/report.spec.ts`, `apps/studio/e2e/room-dock.spec.ts`, `apps/studio/fixtures/report-data.ts`, `apps/studio/fixtures/room.tsx`, `apps/studio/src/app/theme.css`, `docs/handoffs/DEMODOCK-attempt-1.md`.
Runtime unit: the Studio (`apps/studio`) on its fixture pages; no API, database, worker or deployment touched.
Existing authority: Luis's instructions in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no deploy, no production data, no comment on Davide's PRs.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `follow-ups/demo-and-dock` from `main`
`9a40e42`, 2026-10-07
Ending commit/tree: `aef0b47f90ec14c633f8f77c5c6f4d17ef239e9e` (tree `9dc3e72abc8d4f33c39a04e60aee9cb1ae4f3adc`). The commit after it adds only this handoff. In `main` as `c629358` (the squash of #159), with the review's fixes after the commit named here.

## Outcome

- **The demo publishes both versions** (`fixtures/room.tsx`): `?demo=1` opens the report on v2, its history holding v1;
  `versions=` still says otherwise.
- **An explicit `design=designing` wins** over the demo's published page, so the Designing state and its later
  publication can be shown in the demo.
- **The dock's tips at 600 px and under** (`theme.css`): a dock icon says what it does from the keyboard
  (`:focus-visible`) or under a pointer that hovers (a narrow window), not only when pressed and held. Every icon-only
  dock action already had its tip (`DockWord`'s `said`, from #147's follow-up).
- Already done before this branch: `tamper=html` reaches the demo's pages (`demoPageContent`), checked by
  `report.spec.ts` «in the demo too».

## Evidence

- New checks: `report.spec.ts` «demo · an explicit design=designing is the state shown» and «demo · both versions are
  published by default»; `room-dock.spec.ts` «at 390 px, from the keyboard or under a hovering pointer, an icon says
  what it does».
- Prettier, `oxlint --type-aware` (clean but `brand-assets.mjs`, already on `main`), `tsc`.
- Run locally once the game was closed: `room-dock`, `report`, `knowledge-filters` and `knowledge-library` specs, 89
  passed.
- Mutants, each killed with the control surviving: the demo on one version, `design=designing` ignored in the demo,
  no tip from the keyboard, no tip under a hovering pointer.
- Independent review: one P1 (the demo check read the pane by the plain fixture's title) and one P2 (a publish in the
  demo asked for a third version the fixture doesn't hold), fixed: the check reads the pane by the demo's title; a
  publish stops at the versions held (`VERSIONS_HELD`). Left (P3): the demo's work card and conversation still name
  v1 while its report opens on v2; tips near the edge at 360 px; tips show at once on hover at 600 px.

## Limitations and next action

- Next: merge on green CI with no Codex P1.
