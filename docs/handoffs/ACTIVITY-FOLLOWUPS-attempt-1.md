# Implementation-session handoff

Goal and attempt: ACTIVITY-FOLLOWUPS (Codex's P2s on #355, the project's activity), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `studio/activity-followups` from
`origin/api/host-more` (`a1b8daaa`, #369: stacked, because it touches #355's code before `main` has it)
Writable scope: this worktree only (`apps/api`, `apps/studio`, `db/migrations`, `packages/contracts`, `docs/plans`,
`docs/handoffs`).
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers; disposable
PostgreSQL through `scripts/with-postgres.ts`); CI as the run on record.
Existing authority: Luis 2026-10-16, «Sigue con los follow-ups P2 que quedan»; merges on green with no open P1, after
#369.
Ending commit/tree: `e27d90b82b2d` (tree `52dc36d354ee`), the last commit of `studio/activity-followups`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 15 files changed against
`origin/api/host-more` at that commit: `apps/api/src/access.db.test.ts`, `apps/api/src/api.db.test.ts`, `apps/api/src/app.ts`, `apps/api/src/readiness.db.test.ts`, `apps/api/src/routes/activity.ts`, `apps/api/src/routes/host-acts.test.ts`, `apps/api/src/routes/host-acts.ts`, `apps/api/src/routes/rooms.ts`, `e2e/project-activity.spec.ts`, `src/app/theme.css`, `db/migrations/0061_activity_names.sql`, `docs/plans/activity-followups.md`, `packages/contracts/amendments/A28-project-activity.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/src/generated/validators.js`. The review notes below name the commit of each later change.

## Outcome

- **0061 `activity_names`:**
  - `sophia.activity_name(project, actor)`: the room name, else the latest name given at the door.
  - `project_activity` is replaced with the same signature:
    - the target is the member or guest acted on, never the actor (`NULLIF`);
    - a lobby entry's target is its guest.
  - `REQUIRED_SCHEMA` asks for `activity_name(uuid,uuid)`, and `readiness.db.test.ts` has its «without 0061» step.
- **`routes/activity.ts`:** `before` above 9223372036854775807 answers 422. A28's two `before` patterns, and the
  entry's `sequence`, say at most 19 digits. The contracts are regenerated.
- **`routes/host-acts.ts`:** `recordedIfDone`. Mute, stop-camera, stop-screen and mute-all record only when LiveKit
  says something happened, and a removal once LiveKit answers.
- **Studio (`theme.css`):** the activity's rows share one set of columns (subgrid), with the name's track at
  `fit-content(40%)` and wrapping anywhere.

## Evidence

- Plan: `docs/plans/activity-followups.md`.
- **Written first and failing** (commits `8d9a5b52` and `a4312ca9`):
  - the DB tests for no self-target, the bigint bound, guest names and readiness;
  - `host-acts.test.ts`;
  - the long-name spec.
- The alignment assertion was added to the long-name spec after the first capture showed ragged columns.
- **After the change, locally:**
  - the api, access, readiness and media DB tests: 69/69;
  - `host-acts.test.ts`: 2/2;
  - project-activity and host-controls specs: 19/19;
  - typecheck, type-aware lint, Prettier and `contracts:check` are clean;
  - a capture at 390 px with a 120-character name.

## Remaining obligations

- The first P2, evidence that survives a database failure after LiveKit acted, stays on the follow-up list. It needs
  an intent written before the call and reconciled after.
- When #369 merges, this PR goes to `main` (`after369-379.sh`).
