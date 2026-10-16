# Implementation-session handoff

Goal and attempt: MEMBER-ROLES (an admin changes a member's role and can hand the admin role over; first item of the
deep gaps report; Luis: «Sigue con ceder el admin y cambiar roles»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `api/member-roles` from `api/invite-from-projects`
(stacked; `api/project-leave` merged forward so the leave fix's labels and sanitizer entries are here)
Writable scope: this worktree only (`db/migrations`, `packages/contracts`, `packages/persistence`, `apps/api`,
`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy, no migration applied to a live database.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record (Docker Desktop doesn't start on the host, so the DB suites run in CI only).
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `d36919284e72` (tree `3f933e514502`), the last commit of `api/member-roles`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 33 files changed against
`api/invite-from-projects` at that commit: `apps/api/src/access.db.test.ts`, `apps/api/src/api.db.test.ts`, `apps/api/src/app.ts`, `apps/api/src/diagnostics/sanitize.ts`, `apps/api/src/readiness.db.test.ts`, `apps/api/src/routes/goal-targets.ts`, `apps/api/src/routes/projects.ts`, `e2e/field-scale.spec.ts`, `e2e/invite-members.spec.ts`, `e2e/member-roles.spec.ts`, `e2e/project-leave.spec.ts`, `fixtures/fixture-api.ts`, `src/api/client.ts`, `src/app/theme.css`, `src/features/access/InProject.tsx`, `src/features/access/InviteSheet.tsx`, `src/features/studio/ProjectName.tsx`, `src/features/work/labels.test.ts`, `src/features/work/labels.ts`, `db/migrations/0052_project_leave.sql`, `db/migrations/0056_member_roles.sql`, `docs/handoffs/PROJECT-LEAVE-attempt-1.md`, `docs/plans/member-roles.md`, `packages/contracts/amendments/A27-member-roles.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/scripts/generate-validators.ts`, `packages/contracts/src/generated-types.ts`, `packages/contracts/src/generated/validators.d.ts`, `packages/contracts/src/generated/validators.js`, `packages/contracts/src/validate.ts`, `packages/persistence/src/goal-targets.ts`, `packages/persistence/src/index.ts`, `packages/persistence/src/removals.ts`. The review notes below name the commit of each later change.

## Outcome

- **Migration 0056:** `sophia.change_member_role(project, actor, role)`.
  - Admins only (42501). The target must be an active member and the role admin, editor or viewer (22023).
  - A project keeps at least one admin: demoting its last one, oneself included, is 409 `invalid_state`.
  - Setting a role already held changes nothing.
  - A change bumps the membership's revision and `audience_revision`, and emits `project.member_role_changed`,
    labelled «Role changed». The sanitizer knows it.
- **A27:** `PUT /api/v1/projects/{projectId}/members/{actorId}/role`. `/ready` requires 0056.
- **Handing the admin role over** is two acts: make someone admin, then step down or leave.
- **Studio:**
  - The Invite sheet's Members tab gains «In this project», using A25's members. An admin gets a role select on each
    row (yours is «Your role»); an editor or viewer sees the role in words.
  - A refusal is said on the row, and the select shows the role that stands.
  - The only admin who tries to leave is told to «Make another member an admin in Invite › Members first.»

## Evidence

- Plan: `docs/plans/member-roles.md`.
- Written first and failing (commit `3cef015f`):
  - `api.db.test.ts` «member roles (A27)»: hand over, step down, then leave; the refusals;
  - readiness «without 0056»;
  - `member-roles.spec.ts`. Run without the change, all 3 cases failed (no list).
- **After the change, locally:**
  - member roles, leave, invite from projects, invite members, field scale, sheet frame, tabs scale and toast specs:
    21 + 29.
  - Two older tests looked up «Role» by substring and found the new selects, so they now ask for it exactly
    (`invite-members.spec.ts`, `field-scale.spec.ts`).
  - The labels and sanitizer unit tests pass. Type-aware lint over the whole repo, typecheck, Prettier and
    `contracts:check` are clean.
- **Not run locally:** the DB suites. CI runs them.

## Remaining obligations

- CI; Codex with no open P1. It merges after #353, retargeted to `main`.
- A call already joined keeps the standing its token carries until it reconnects (at most 10 minutes). The next token
  reads the new role.
- **Not done:** an admin removing a member from the project.
