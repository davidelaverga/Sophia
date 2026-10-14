# Implementation-session handoff

Goal and attempt: E2E-S3 (the invitations list refuses who may not manage it; `informe-e2e-real.md` S3, Luis: «Arregla los puntos mencionados»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `api/invitations-list-access` from `main`
Writable scope: this worktree only (`apps/api`, `docs/plans`, `docs/handoffs`); no migration, no contract change, no deploy.
Runtime unit: Luis's Windows host (the database suite through `scripts/with-postgres.ts`, Docker); CI as the run on record.
Existing authority: Luis's instruction to fix the e2e findings; merges on green with no open P1.
Ending commit/tree: pending

## Outcome

- `GET /api/v1/projects/{id}/invitations` reads the caller's membership first. Admins and editors get the list as
  before. A viewer, someone who is not a member, or anyone on a project that does not exist gets 403 `forbidden`
  («Not permitted»), as `GET …/membership` answers an outsider. Before, all three got 200 with an empty list,
  filtered by the `editors_read` row policy: nothing leaked, but it differed from every other project read.
- The Studio asks for the list only from the Invite sheet, which only opens for those who may invite (`canInvite`).

## Evidence

- Plan: `docs/plans/api-invitations-list-access.md`.
- Measured on the real dev stack (`informe-e2e-real.md`, S3): Outsider on the seeded project → 200 with 0; on an
  unknown id → 200 with 0.
- Written first and failing: `access.db.test.ts` «the invitations list». Before the fix: `[200, 200, 200, 200, 200]`;
  wanted `[200, 200, 403, 403, 403]`.
- After: `access.db.test.ts` 10/10 on a disposable PostgreSQL 16. Type-aware lint of `apps/api` clean; typecheck clean.

## Remaining obligations

- CI; Codex with no open P1. This is in the API (Davide's lane), done at Luis's request.
