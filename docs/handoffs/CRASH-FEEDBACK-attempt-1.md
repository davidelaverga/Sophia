# Implementation-session handoff

Goal and attempt: CRASH-FEEDBACK (crash reports and feedback through Sentry; Luis's queue item 4), attempt 1
Human owner / executor resource: Luis (merge, Sentry project) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `ui/sentry` from `ui/terms-privacy` (#366; it
adds Sentry to that PR's privacy notice)
Writable scope: this worktree only (`apps/studio`, `pnpm-lock.yaml`, `config/runtime-unit.json`'s lock digest,
`docs/plans`, `docs/handoffs`); no deploy, no Sentry account.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-15, «Vamos con Sentry»; merges on green with no open P1, after #366.
Ending commit/tree: `4b54b6bdfecd` (tree `1cac1c12ddc5`), the last commit of `ui/sentry`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 20 files changed against
`origin/ui/terms-privacy` at that commit: `e2e/crash-feedback.spec.ts`, `fixtures/crash-dsn.ts`, `fixtures/room.tsx`, `package.json`, `public/vercel.json`, `src/app/AccountMenu.tsx`, `src/app/FeedbackSheet.tsx`, `src/app/LoadFailed.tsx`, `src/app/crash-dsn.ts`, `src/app/crash-report.ts`, `src/app/crash-scrub.test.ts`, `src/app/crash-scrub.ts`, `src/app/legal-text.ts`, `src/app/theme.css`, `src/main.tsx`, `src/vite-env.d.ts`, `vite.fixtures.config.ts`, `config/runtime-unit.json`, `docs/plans/crash-feedback.md`, `pnpm-lock.yaml`. The review notes below name the commit of each later change.

## Outcome

- **Dependency:** `@sentry/react` 10.75.3, released 23 Sep 2026. 11.x was days old, so I held back to the mature
  line.
  - The lock changes, and `workspace_lock_sha256` was set by hand to the lock's sha256. `pnpm artifacts:record` can't
    spawn pnpm on Windows; CI's artifacts check confirms the value.
- **`crash-report.ts`:**
  - `startCrashReports` (from `main.tsx` and the room fixture), `reportCrash` (from `LoadFailed`) and `sendFeedback`;
  - Sentry is a dynamic import, its own chunk (`esm-*.js` in the build), loaded only with a DSN.
- **`crash-scrub.ts`** (pure): scrubs addresses, breadcrumbs and events.
- **`FeedbackSheet`** opens from «Send feedback» in the account menu, only where reports are on. It is portalled to
  the body, because the bar's blur held it in the header's box at first; the capture caught that.
- **CSP** (report-only) gains Sentry's ingest hosts.
- **The privacy notice** names Sentry.
- **Fixtures:** `?sentry=1` swaps in `fixtures/crash-dsn.ts`, the same plugin pattern as `fake-livekit.ts`.

## Evidence

- Plan: `docs/plans/crash-feedback.md`.
- Written first and failing (commit `4ae01c1f`): `crash-scrub.test.ts` and `crash-feedback.spec.ts`. The unit test's
  event later gained `type: undefined`, as Sentry's `ErrorEvent` requires.
- **After the change, locally:**
  - `crash-scrub.test.ts`: 3/3;
  - crash-feedback, terms-privacy and account-menu specs: 12/12;
  - the build splits Sentry off;
  - type-aware lint over the whole repo, typecheck and Prettier are clean.

## Remaining obligations

- #366 merges first.
- **Luis:** create the Sentry project (React), then set `VITE_SENTRY_DSN` in Vercel. `VITE_SENTRY_ENVIRONMENT` is
  optional.
- The API's own errors are not covered here.
- Seen in passing: `PasskeySheet` renders inside the account menu's box the same way. It likely needs the same
  portal.
