# The invitations list refuses who may not manage it

> 2026-10-14 · `evaluacion-2026-10-14/e2e-real/informe-e2e-real.md`, S3. Luis: «Arregla los puntos mencionados».

## What was measured

- `GET /api/v1/projects/{id}/invitations` answered 200 with an empty list to a viewer, to someone who is not a member,
  and for a project id that does not exist. Every other project read refuses them (403). Nothing leaked — the
  `editors_read` row policy filters the rows — but the answer differs by role from everything else and lets ids be
  probed.

## What changes

- **The route reads the caller's membership first.** An admin or an editor gets the list as before. Anyone else,
  including on a project that does not exist, gets 403 `forbidden`, as `GET …/membership` answers an outsider.
- The Studio asks for the list only where its viewer may invite (`canInvite`), so nothing it shows changes.

## Checks

- `access.db.test.ts`, «the invitations list»: admin 200, editor 200, viewer 403, outsider 403, an unknown project 403.
- `pnpm check`; the database suites on PostgreSQL 16 (CI, and locally through `scripts/with-postgres.ts`).
