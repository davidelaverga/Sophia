# A project's title is words, not spaces

> 2026-10-14 · `evaluacion-2026-10-14/e2e-real/informe-e2e-real.md`, S2. Luis: «Arregla los puntos mencionados».

## What was measured

- `POST /api/v1/projects {title: "   "}` → 201, stored as `"   "`. The contract checks the length (1–180) and the
  database the same (`create_project`, 0006): three spaces are three characters. An empty title, a number and 181
  characters are refused (422).

## What changes

- **The route refuses a title of spaces alone** as it refuses an empty one: 422 `invalid_request`, retry never, «A
  project needs a title». The stored title is the one sent: nothing is trimmed (a title's own spaces stay its own, and
  a retry with the same key keeps the same digest).

## Checks

- `api.db.test.ts`: «conflicts on a reused key with another title and validates the request» now also sends `"   "`:
  422 `invalid_request`, never.
- `pnpm check`; the database suites on PostgreSQL 16 (CI, and locally through `scripts/with-postgres.ts`).
