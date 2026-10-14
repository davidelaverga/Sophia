# Implementation-session handoff

Goal and attempt: E2E-S2 (a project's title of spaces alone is refused; `informe-e2e-real.md` S2, Luis: «Arregla los puntos mencionados»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `api/blank-title` from `main`
Writable scope: this worktree only (`apps/api`, `db/migrations`, `docs/plans`, `docs/handoffs`); no contract change, no deploy.
Runtime unit: Luis's Windows host (the database suite through `scripts/with-postgres.ts`, Docker); CI as the run on record.
Existing authority: Luis's instruction to fix the e2e findings; merges on green with no open P1.
Ending commit/tree: `a5cc1d4f886b` (tree `1174cf6af6db`), the last commit of `api/blank-title`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 4 files changed against
`origin/main` at that commit: `apps/api/src/api.db.test.ts`, `db/migrations/0047_blank_project_title.sql`, `docs/handoffs/E2E-S2-attempt-1.md`, `docs/plans/api-blank-title.md`. The review notes below name the commit of each later change.

## Outcome

- `POST /api/v1/projects` with a title of spaces alone answers 422 `invalid_request` («A project needs a title»,
  retry never), as an empty title does. Before, it created the project with the title `"   "`. Nothing is trimmed:
  a title's own spaces stay, and a retry's digest is unchanged.

## Evidence

- Plan: `docs/plans/api-blank-title.md`.
- Measured on the real dev stack (`informe-e2e-real.md`, S2): `{title:"   "}` → 201, stored `"   "`.
- Written first and failing: `api.db.test.ts` «… validates the request» now also sends `"   "`. Before the fix it got
  `[201, undefined, undefined]`, not `[422, 'invalid_request', 'never']`.
- After: `api.db.test.ts` 15/15 on a disposable PostgreSQL 16 (`scripts/with-postgres.ts`). Type-aware lint of
  `apps/api` clean; typecheck clean.

## Review notes

- Codex P1 on #327: the route's check refused a replay of a blank title an earlier build had admitted (its receipt
  recorded under its key): a retry after a lost reply got 422, not its 201. The check moved into `create_project`
  (migration 0047, 0006's body plus the check after the replay); the route's check is gone. New case «replays a blank
  title admitted before blanks were refused» (failing first: it got 422); after, `api.db.test.ts` and
  `persistence.db.test.ts` 37/37.

## Remaining obligations

- CI; Codex with no open P1. This is in the API (Davide's lane), done at Luis's request.
