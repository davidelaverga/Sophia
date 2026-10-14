# A refusal that will not change is not asked again

> 2026-10-14 · `evaluacion-2026-10-14/e2e-real/informe-e2e-real.md`, Q2. Luis: «Arregla los puntos mencionados».

## What was measured

- On the real dev stack, someone who is not a member opens a project's address. The Studio says «No access to this
  project» and, behind it, asks `membership`, `snapshot` and `plans` three more times each (403 at 1.3 s, 2.3 s, 4.4 s,
  8.4 s), then stops. The API marks those refusals `retry: never` (`ApiError.retry`); the account's `QueryClient` uses
  TanStack's default (three retries for any error).

## What changes

- **Each account's cache asks its reads with `retryRead`**: a refusal the API marks `retry: never` (403, 404, 422…) is
  not asked again; anything else (a 503, a dropped connection) is retried three times as before. Reads that set their
  own `retry` keep it.

## Checks

- `account-cache.test.ts`:
  - `retryRead` refuses a `never` 403;
  - it allows a `safe_read` 503 up to three times, and a network error;
  - every account's cache uses `retryRead`.
- Prettier, type-aware lint, typecheck; unit tests. CI as the run on record (the browser specs run on fixtures, whose
  own clients are not this one).
