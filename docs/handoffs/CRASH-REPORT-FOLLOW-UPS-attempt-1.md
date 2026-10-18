# Implementation-session handoff

Goal and attempt: CRASH-REPORT-FOLLOW-UPS (two Codex P2s on #367, from the follow-up list; Luis: «Sigue con los P2 en local, sin subir
nada»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `app/crash-report-follow-ups` from `origin/main` (`215166872`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con los P2 en local, sin subir nada»: local only until he says; merges on
green with no open P1 once pushed.
Ending commit/tree: `1f6a6cb5cb94` (tree `fc3f7d699848`), the last commit of `app/crash-report-follow-ups`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 6 files changed against
`origin/main` at that commit: `e2e/crash-feedback.spec.ts`, `fixtures/crash-sentry.ts`, `src/app/crash-report.ts`, `src/app/crash-sentry.ts`, `vite.fixtures.config.ts`, `docs/plans/crash-feedback.md`. The review notes below name the commit of each later change.

## Outcome

- Feedback reads «Sent. Thank you.» only once Sentry's ingest answered 2xx within 8 s; a request blocked (aborted), refused (500, 403) or rate-limited reads «Couldn’t send it. Try again.».
- A Sentry whose load or set-up failed is started again by the next Send: the feedback goes, and automatic reports work from then on, without a reload.

## Evidence

- Three new e2e in `crash-feedback.spec.ts`: aborted ingest, refused ingest (500), and `?sentryFlaky=1` (first `init` throws). On main the first two read «Sent» with no alert and the third stays on the alert; with the fix all pass.
- Playwright through `safe-run.ps1`, two workers: crash-feedback, app-auth and new-version specs, 34/34 (the scrubbing of the url the SDK's sendFeedback adds is still checked by the Codex P1 test).
- `vite build`: Sentry's SDK stays in its own dynamically loaded chunk (`esm-*.js`), not in `index-*.js`.
- Prettier, `oxlint --type-aware` and `tsc --noEmit -p apps/studio` clean.

## Decisions and changes

- The SDK's `sendFeedback` (re-exported by @sentry/react 10.75.3 from @sentry/feedback): no Sentry project or token needed, contrary to the earlier reply on the thread. Its rejection, including its own 30 s timeout, is absorbed; `within` races it against 8 s and clears its timer.
- Retry on the feedback path only (and the boot start), not in `reportCrash`: the triage's refuter showed that each retry of a chunk that won't load fires `vite:preloadError`, which NewVersion reads as a deploy.
- Sentry's chunk now loads through `src/app/crash-sentry.ts`, as the DSN does through crash-dsn.ts, so `fixtures/crash-sentry.ts` can fail the first set-up; the fixture swaps it in `vite.fixtures.config.ts`.

## Remaining obligations

- A chunk fetch that failed may stay failed in Chromium's module map until reload; the test exercises a failed `init`, the case the SDK can recover from.
- The earlier reply on the Codex thread («needs the owner's Sentry project») should be corrected when this is pushed; that posts to GitHub, so it waits for Luis.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
