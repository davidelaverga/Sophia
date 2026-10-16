# Implementation-session handoff

Goal and attempt: PROJECT-ACTIVITY (a project's activity for its admins, and the gaps in the evidence closed; Luis:
«Sí, haz la vista Activity y cierra los huecos», after `evaluacion-2026-10-15/informe-logs-evidencia.md`), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `api/project-activity` from `api/member-roles`
(stacked)
Writable scope: this worktree only (`db/migrations`, `packages/contracts`, `packages/persistence`, `apps/api`,
`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy, no migration applied to a live database.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record (Docker Desktop doesn't start on the host, so the DB suites run in CI only).
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `ab51a25f04ee` (tree `01c9250abae6`), the last commit of `api/project-activity`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 27 files changed against
`api/member-roles` at that commit: `apps/api/src/api.db.test.ts`, `apps/api/src/app.ts`, `apps/api/src/diagnostics/sanitize.ts`, `apps/api/src/readiness.db.test.ts`, `apps/api/src/routes/activity.ts`, `apps/api/src/routes/rooms.ts`, `e2e/project-activity.spec.ts`, `e2e/project-leave.spec.ts`, `fixtures/fixture-api.ts`, `src/api/client.ts`, `src/app/theme.css`, `src/features/studio/ActivitySheet.tsx`, `src/features/studio/ProjectName.tsx`, `src/features/work/labels.test.ts`, `src/features/work/labels.ts`, `db/migrations/0057_project_activity.sql`, `docs/plans/project-activity.md`, `packages/contracts/amendments/A28-project-activity.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/scripts/generate-validators.ts`, `packages/contracts/src/generated-types.ts`, `packages/contracts/src/generated/validators.d.ts`, `packages/contracts/src/generated/validators.js`, `packages/contracts/src/validate.ts`, `packages/persistence/src/activity.ts`, `packages/persistence/src/index.ts`, `packages/persistence/src/persistence.db.test.ts`. The review notes below name the commit of each later change.

## Outcome

- **The gaps closed (migration 0057):**
  - `create_project` (0047) is replaced to emit `project.created`. A new project's receipt cursor is that event's,
    `'1'` rather than `'0'`, and the two tests that pinned `'0'` say why.
  - `sophia.record_host_act` records an admin's mute or removal in the call. The A24 route calls it once the room
    server has done the act, so `room.host_muted` and `room.host_removed` exist where nothing did. This reverses
    host-controls.md's «no write».
- **`sophia.project_activity`:**
  - admins only;
  - newest first, 50 a page;
  - people's acts only, each with its actor and the member acted on, named as the room keeps them;
  - no chat messages and nothing Sophia or the runtime did; codes and names, never content.
- **A28:** `GET /api/v1/projects/{projectId}/activity?before=`. `/ready` requires 0057. The sanitizer and the Work
  pulse labels know the new codes.
- **Studio:**
  - The project menu gains «Activity» for admins. The sheet «Project activity» lists who, what and when.
  - What is said as the actor did it («Took out of the call · Lucía»); the pulse's own words name no one.
  - A person filter keeps one person's entries, and «Earlier» reads the page before.

## Evidence

- Plan: `docs/plans/project-activity.md`.
- Written first and failing (commit `6c5f8dc5`):
  - `api.db.test.ts` «project activity (A28)», plus the creation cursor;
  - `persistence.db.test.ts` «host acts», plus the creation cursor;
  - readiness «without 0057»;
  - `project-activity.spec.ts`. Run without the change, 3 of its 4 cases failed (no Activity); the editor's case
    passes either way.
- **After the change, locally:**
  - activity, rename, leave, host controls and member roles specs: 18.
  - Two corrections came up while running it:
    - the leave spec's menu now lists Activity;
    - a capture showed the pulse's passive words misleading beside an actor, so the sheet uses the actor's words.
  - The labels and sanitizer unit tests pass. Type-aware lint over the whole repo, typecheck, Prettier and
    `contracts:check` are clean.
- **Not run locally:** the DB suites. CI runs them.

## Remaining obligations

- CI; Codex with no open P1. It merges after #354, retargeted to `main`.
- **Out of scope:** before/after values (events carry codes, not payloads), CSV export, and a retention policy for
  `project_events`.
