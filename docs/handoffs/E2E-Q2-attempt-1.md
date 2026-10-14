# Implementation-session handoff

Goal and attempt: E2E-Q2 (a refusal the API marks retry never is not asked again; `informe-e2e-real.md` Q2, Luis: «Arregla los puntos mencionados»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `ui/honor-retry-never` from `main`
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no contract, no deploy.
Runtime unit: Luis's Windows host; CI as the run on record.
Existing authority: Luis's instruction to fix the e2e findings; merges on green with no open P1.
Ending commit/tree: `6da2bdcc2620` (tree `3cbcc4b3372f`), the last commit of `ui/honor-retry-never`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 3 files changed against
`origin/main` at that commit: `src/app/account-cache.test.ts`, `src/app/account-cache.ts`, `docs/plans/honor-retry-never.md`. The review notes below name the commit of each later change.

## Outcome

- Each account's `QueryClient` (`cacheOf`) asks its reads with `retryRead`. A refusal the API marks `retry: never`
  (403, 404, 422…) is not asked again; anything else (a 503 `safe_read`, a dropped connection) is retried three times,
  as TanStack's default. A read's own `retry` still wins.

## Evidence

- Plan: `docs/plans/honor-retry-never.md`.
- Measured on the real dev stack: behind «No access», `membership`, `snapshot` and `plans` were asked four times each
  (403 at 1.3, 2.3, 4.4, 8.4 s). The report's first draft called it endless polling; the timings show three retries,
  and the report is corrected.
- Written first and failing: `account-cache.test.ts` (`retryRead` refuses a `never` 403, allows a `safe_read` 503 up to
  three times and a network error; every account's cache uses it). Before the fix the module had no `retryRead`.
- After: unit tests 1209/1209. Prettier, type-aware lint (whole repo) and typecheck clean.

## Remaining obligations

- CI; Codex with no open P1.
