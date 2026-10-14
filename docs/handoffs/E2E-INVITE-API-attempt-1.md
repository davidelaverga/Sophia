# Implementation-session handoff

Goal and attempt: E2E-INVITE-API (A16: member invitations waiting in the app, the API; Luis: «¿y si la persona está activamente in app?» and «Arregla los puntos mencionados»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `api/pending-invitations` from `main`
Writable scope: this worktree only (`db/migrations`, `packages/contracts`, `packages/persistence`, `apps/api`, `docs/plans`, `docs/handoffs`); no deploy.
Runtime unit: Luis's Windows host (the database suites through `scripts/with-postgres.ts`, Docker); CI as the run on record.
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: pending

## Outcome

- **Migration 0046, `sophia.pending_member_invitations(p_email)`.** SECURITY DEFINER, executable by `sophia_api` only.
  It returns the member invitations for that address that are still open and usable, in projects the caller is not
  already in. It never returns the token's hash; it returns the link's version.
- **`GET /api/v1/me/invitations`.** Returns `{invitations: [{id, projectId, projectTitle, inviter, role, expiresAt}]}`
  for the address the caller's token carries, with no link and no token. A guest gets 403.
- **`POST /api/v1/invitations/{invitationId}/accept`.** It finds the invitation in the caller's own list, rebuilds the
  link's token (`linkFor`), and runs the same `accept_room_invitation`. Anything not in the caller's list answers 422
  `not_found`.
- **Contract amendment A16:** `PendingInvitation`, `PendingInvitationList`, and the two paths. Contracts regenerated.
- **Persistence:** `listPendingInvitations`.

## Evidence

- Plan: `docs/plans/pending-invitations-api.md`, which includes the security reasoning: signing in with the invited
  address proves what holding the emailed link proved.
- Measured on the real dev stack: Davide, at Home while invited, saw nothing until he opened the email.
- Written first and failing (commit `fad67b7c`): `access.db.test.ts` «member invitations waiting in the app (A16)». Both
  cases failed for want of the routes (404).
- After the change:
  - `apps/api/src/access.db.test.ts` 11/11, `packages/persistence/src/access.db.test.ts` and `api.db.test.ts` 26/26,
    on a disposable PostgreSQL 16.
  - `pnpm contracts:check` clean. Type-aware lint (whole repo), typecheck and Prettier clean.
- `pnpm test` on this host fails in the renderer and capture-kernel suites. Main fails the same way here (checked in
  `Sophia-e2e` at 2572d786), so this is the Windows environment. CI is the run on record.

## Remaining obligations

- CI; Codex with no open P1. This is in the API and the database (Davide's lane), done at Luis's request.
- The Studio's notice is the next PR, on this contract.
