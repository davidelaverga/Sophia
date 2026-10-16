# Implementation-session handoff

Goal and attempt: REMOVE-MEMBER (an admin removes a member from the project; the first item of Luis's queue, «Procede
y encola las tareas»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `api/remove-member` from `api/project-activity`
(stacked)
Writable scope: this worktree only (`db/migrations`, `packages/contracts`, `packages/persistence`, `apps/api`,
`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy, no migration applied to a live database.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record (Docker Desktop doesn't start on the host, so the DB suites run in CI only).
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `7fb1e5773d8b` (tree `b8e541124bda`), the last commit of `api/remove-member`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 25 files changed against
`api/project-activity` at that commit: `apps/api/src/access.db.test.ts`, `apps/api/src/api.db.test.ts`, `apps/api/src/app.ts`, `apps/api/src/diagnostics/sanitize.ts`, `apps/api/src/readiness.db.test.ts`, `apps/api/src/routes/activity.ts`, `e2e/remove-member.spec.ts`, `fixtures/fixture-api.ts`, `src/api/client.ts`, `src/app/theme.css`, `src/features/access/InProject.tsx`, `src/features/studio/ActivitySheet.tsx`, `src/features/work/labels.test.ts`, `src/features/work/labels.ts`, `db/migrations/0058_remove_member.sql`, `docs/plans/remove-member.md`, `packages/contracts/amendments/A29-remove-member.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/scripts/generate-validators.ts`, `packages/contracts/src/generated-types.ts`, `packages/contracts/src/generated/validators.d.ts`, `packages/contracts/src/generated/validators.js`, `packages/contracts/src/validate.ts`, `packages/persistence/src/activity.ts`, `packages/persistence/src/index.ts`. The review notes below name the commit of each later change.

## Outcome

- **Migration 0058:** `sophia.remove_member(project, actor, key)`.
  - Admins only (42501). Never oneself, and the target must be an active member (22023).
  - Idempotent per actor and key (`sophia.member_removals`).
  - The membership goes inactive (its revision bumped) and the audience moves.
  - A `room_removals` row with the new reason `removed` takes the member out of the call and keeps watch while a token
    they hold could bring them back.
  - `project.member_removed` records who removed whom.
- **Related functions in 0058:**
  - `accept_room_invitation` is replaced, so that coming back cancels a `removed` removal as it does a `left` one;
  - `pending_member_removal` lets an admin read the removal for the API's immediate attempt.
- **A29:** `POST /api/v1/projects/{projectId}/members/{actorId}/removal`. The API tries once to take the member out
  of the call, and the worker does the rest. `/ready` requires 0058.
- **Labels:** «Member removed» in the pulse, «Removed from the project · Marco» in Activity, and the sanitizer knows
  the code.
- **Studio:** «In this project» gives an admin «Remove» on each other member's row, confirmed in place («They leave
  the project and its call. A new invitation brings them back.»). Once removed, the row goes.

## Evidence

- Plan: `docs/plans/remove-member.md`.
- Written first and failing (commit `f821b5b7`):
  - `api.db.test.ts` «removing a member (A29)»;
  - `access.db.test.ts`: back by invitation, with the removal cancelled;
  - readiness «without 0058»;
  - `remove-member.spec.ts`. Run without the change, 2 of its 3 cases failed (no Remove); the editor's case passes
    either way.
- **After the change, locally:**
  - remove member, member roles, activity, invite from projects, invite members and field scale specs: 27.
  - A capture showed the confirmation squeezing the member's name out of the row, so it now takes its own line.
  - The labels and sanitizer unit tests pass. Type-aware lint over the whole repo, typecheck, Prettier and
    `contracts:check` are clean.
- **Not run locally:** the DB suites. CI runs them.

## Remaining obligations

- CI; Codex with no open P1. It merges after #355, retargeted to `main`.
