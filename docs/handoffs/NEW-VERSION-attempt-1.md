# Implementation-session handoff

Goal and attempt: NEW-VERSION (the third gaps report §4, platform; Luis: «Sigue con la cola»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `app/new-version` from `origin/main` (`e1cc4b4d`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Sigue con la cola»; merges on green with no open P1.
Ending commit/tree: `ed2318d7c8a9` (tree `1c413d3fac84`), the last commit of `app/new-version`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 5 files changed against
`origin/main` at that commit: `e2e/new-version.spec.ts`, `src/app/App.tsx`, `src/app/NewVersion.tsx`, `src/app/theme.css`, `docs/plans/new-version.md`. The review notes below name the commit of each later change.

## Outcome

- After a deploy, a part that can't load says «Sophia was updated. Reload to keep going.», with Reload and Not now.
- The notice stays until answered, in every state of the Studio.

## Evidence

- Plan: `docs/plans/new-version.md`.
- Written first and failing (commit of the tests): `new-version.spec.ts`, on the app's fixture page, which dispatches
  Vite's `vite:preloadError`.
- **After the change, locally:**
  - new-version, app-auth, signin and signed-in-later: 52/52;
  - type-aware lint, typecheck and Prettier are clean.
- **Found in the capture:** from `left: 50%` a phone gave the notice half the screen and three lines. It is now centred
  on the whole width, and its answers keep their words whole (24 px each).

## Decisions and changes

- **The event is not prevented,** so the load that failed still fails as itself (a join's error, the viewer's).
- **No automatic reload:** it would drop a call in progress.
- **It wraps the App** (`App` renders `AppBody` and `NewVersion`), so it shows signed in, signed out and at a
  room's door alike.

## Remaining obligations

- None.

## Next bounded action

- Luis: merge on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and Vite's documented
  `vite:preloadError` event.
