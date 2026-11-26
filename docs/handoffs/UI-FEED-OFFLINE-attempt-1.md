# Handoff: the feed says «Reconnecting» as soon as the browser goes offline, attempt 1

Goal and attempt: UI-FEED-OFFLINE (`docs/plans/feed-offline.md`; Luis 2026-11-24, «Sí, hazlo», on the follow-up of
improvement 7 in `five-decisions.md`), attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/feed-offline` from `origin/main`
`dc2215118`.
Ending commit/tree and changed files: content commit `133229f04` (`feed-loop.ts`, `feed-loop.test.ts`,
`useProjectFeed.ts`, `e2e/feed-recovery.spec.ts`, `docs/plans/feed-offline.md`), then this record.

## Outcome

When the person's network drops, the header says «Reconnecting» in milliseconds instead of after up to 25 s of a quiet
stream. Nothing else moves: no new words, the stream's own 25 s wait still covers an API that dies behind a proxy.

## Evidence

- Unit: `feed-loop.test.ts` with `project-feed-refresh.test.ts`, 16 of 16; `features/studio` and `api` unit tests, 203
  of 203. The drop test was red before the port.
- Through `pw-gentle.ps1`: `feed-recovery.spec.ts`, 7 of 7. The new test was red on `main` (the pill stayed «live»);
  with the change, offline to «Reconnecting» in 25 ms, back to «Up to date» in 28 ms.
- Rehearse stack (`dev-stack.ts --runtime rehearse --voice rehearse`, Luis in the founder project, 1280 × 800,
  headless full Chromium): browser offline 20 s → «Reconnecting» 18 ms after (11.5 s on `main`), back 46 ms after;
  API killed → 25.0 s and API down 40 s → 22.0 s, as on `main`.
- `prettier --check` on the changed files, `pnpm lint` and the Studio's `typecheck` return 0.

## Decisions and changes

- The port is listened to only while a stream attempt runs, as `wakes` only while the loop waits. A drop aborts the
  attempt the way a gap does; the backoff is not reset by it.
- `online` and the rest of `feed-reconnect.md` are unchanged.

## Remaining obligations

- The PR is not merged.
- Not checked: how Render's proxy closes a stream when the API process dies (the 25 s wait covers it either way).

## Next bounded action

Luis reviews the PR.

Source IDs consulted: `feed-reconnect.md`, `five-decisions.md` (7), `feed-loop.ts`, `useProjectFeed.ts`,
`api/stream.ts` (`STREAM_IDLE_TIMEOUT_MS`), `e2e/feed-recovery.spec.ts`.
