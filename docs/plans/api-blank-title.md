# A project's title is words, not spaces

> 2026-10-14 · `evaluacion-2026-10-14/e2e-real/informe-e2e-real.md`, S2. Luis: «Arregla los puntos mencionados».

## What was measured

- `POST /api/v1/projects {title: "   "}` → 201, stored as `"   "`. The contract checks the length (1–180) and the
  database the same (`create_project`, 0006): three spaces are three characters. An empty title, a number and 181
  characters are refused (422).

## What changes

- **`create_project` refuses a title of spaces alone for a new creation** (migration 0047, its 0006 body with one check
  after the key's replay): 422 `invalid_request`, retry never, «A project needs a title», as an empty title is refused.
  The stored title is the one sent: nothing is trimmed.
- **A replay still answers what was admitted** (Codex P1 on #327): a creation an earlier build admitted with a blank
  title, retried with its key and body, gets its stored 201 receipt, not a refusal. The check sits after the replay for
  that reason, in the database: the API cannot read the creations' register.

## Checks

- `api.db.test.ts`:
  - «conflicts on a reused key with another title and validates the request» now also sends `"   "`: 422
    `invalid_request`, never.
  - «replays a blank title admitted before blanks were refused»: an earlier build's state, put as owner, answers its
    stored receipt (201).
- `pnpm check`; the database suites on PostgreSQL 16 (CI, and locally through `scripts/with-postgres.ts`).
