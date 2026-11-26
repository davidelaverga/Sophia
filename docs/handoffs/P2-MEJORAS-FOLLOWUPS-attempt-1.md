# Handoff: the improvements PRs' open P2s, attempt 1

Goal and attempt: P2-MEJORAS-FOLLOWUPS (`docs/plans/p2-mejoras-followups.md`; Luis 2026-11-26, «Sigue con los P2, en
orden»), attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/p2-mejoras` from `origin/main`
`0c907bb88`.
Ending commit/tree and changed files: one commit per PR's P2s (#544, #545, #546, #547, #555 ×2, #556), the note and
this record. Studio only (`apps/studio`).

## Outcome

Thirteen of the fifteen open P2s are answered here. One (#554's card height) was already gone with #556. One (#544's
guests before joining) needs the API to send each person's condition and is left for Davide's lane.

## Evidence

- The note's «Checks»: unit tests, new e2e cases, and each case walked on the fixtures in the browser pane; lint, format
  and types clean.

## Decisions and changes

- Back and Forward read `?panel=` and `?invite=` again through one hook in `app/` (`useOnBackForward`), at render time
  after the pop, so nothing is written over the entry first.
- A row's own refused Try again keeps its row instead of going to an empty bar: the row is the only place that holds
  its mentions and reply.
- The reload offer now lives in RoomStage (one instance), handed to the dock as a prop.

## Remaining obligations

- The PR is not merged; its CI is the record for the e2e cases (the Playwright guard refused locally: Opera was open).
- #544's guests before joining: an API change (the room's people with their condition).
