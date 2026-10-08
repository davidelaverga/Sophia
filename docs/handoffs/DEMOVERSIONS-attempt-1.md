# Implementation-session handoff

Goal and attempt: the demo names one version throughout, attempt 1. The P3 left on #159 (its review), from Luis's queue.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a Studio slice from Luis's queue, named in «Goal and attempt».
Writable scope: the files this PR changes (its diff against `main`), and nothing outside `apps/studio` and `docs/`.
Runtime unit: the Studio (`apps/studio`) on its fixture pages; no API, database, worker or deployment touched.
Existing authority: Luis's instructions in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no deploy, no production data, no comment on Davide's PRs.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `follow-ups/demo-versions` from `main`, 2026-10-08
Ending commit/tree: `b5bf10cf71b15c6d20dc4117a6fe096fca358630` (tree `d17ae7cc1aba97087b79f2c65aa621ff2f7db5cb`), after the typed revision and Codex's P2s (versions=1 names v1). The commit after it adds only this handoff.

## Outcome

In the demo (`?demo=1`) the research task is on its second version (`taskRevision` 2, `fixtures/room.tsx`) and the
conversation's «What it made» names v2 (`fixtures/conversation-data.ts`), as the report opens on v2 since #159. The
plain fixture is unchanged.

## Evidence

- `report.spec.ts` «demo · the work card and the conversation name the version the report opens on: v2»; with the
  research back on v1 it fails (the mutant).
- `report`, `project-conversations`, `conversations-panes` and `work` specs: 253 passed before the locator was
  narrowed to the Open button (it matched Download too); the check alone passes after.
- Prettier, `oxlint --type-aware` (clean but `brand-assets.mjs`), `tsc`.

## Limitations and next action

- `designPublished()` still places pages on both versions though the design's base is v1 (a P3 on #159), untouched.
- Next: merge on green CI with no Codex P1.
