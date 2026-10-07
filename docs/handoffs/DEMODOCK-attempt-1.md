# Implementation-session handoff

Goal and attempt: the Codex P2s left on #151 (demo data) and #147 (the phone dock), attempt 1. Luis: «Encólalo todo»,
«Continúa con lo demás».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `follow-ups/demo-and-dock` from `main`
`9a40e42`, 2026-10-07
Ending commit/tree: `aef0b47f90ec14c633f8f77c5c6f4d17ef239e9e` (tree `9dc3e72abc8d4f33c39a04e60aee9cb1ae4f3adc`). The commit after it adds only this handoff.

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
- **Not run locally:** the machine was short of RAM (a game open, 4–6 GB free; the guard needs 8). The browser checks
  run in CI on the push; mutants wait for a local run.

## Limitations and next action

- Next: CI on the PR; the local run and mutants when the guard allows.
