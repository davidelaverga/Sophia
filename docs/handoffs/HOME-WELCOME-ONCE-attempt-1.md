# Handoff: Home says «Welcome» on the first visit only, attempt 1

Goal and attempt: HOME-WELCOME-ONCE (`docs/plans/home-welcome-once.md`; Luis 2026-11-26, «Sí, solo la primera»),
attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/home-welcome-once` from `origin/main`
`f8639a2ba`.
Ending commit/tree and changed files: `apps/studio/src/features/personal/home-seen.ts` (new), its test (new),
`apps/studio/src/features/personal/Places.tsx`, the note and this record.

## Outcome

Home says «Welcome» only the first time it is shown to an account on a browser, while the personal space is empty.
From the next visit on, it greets by the hour. Nothing else on Home changes, and no words are new.

## Evidence

- The note's last section: unit, the real stack's first visit and reload, lint, format and types.

## Decisions and changes

- Kept per account on the browser (`localStorage`), not on the server: no endpoint holds it, and none is invented.
- Read once per page and account, so the visit that welcomes keeps «Welcome» until the page goes.
- Unreadable storage counts as seen: the hour's greeting rather than «Welcome» every time.
- Kept on sign-out: the key holds no words.

## Remaining obligations

- The PR is not merged.

## Next bounded action

Luis reviews the PR.

Source IDs consulted: `apps/studio/src/features/personal/places-view.ts`, `apps/studio/src/features/personal/Places.tsx`,
`apps/studio/src/app/keys-tip.ts`, `apps/studio/src/app/auth-callback.ts`.
