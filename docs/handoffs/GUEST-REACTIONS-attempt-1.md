# Implementation-session handoff

Goal and attempt: GUEST-REACTIONS (the third gaps report, fault 1; Luis: «Procede»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `room/guest-reactions` from `origin/main` (`f062d838`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Procede» (the seven faults, one PR each); merges on green with no open P1.
Ending commit/tree: `9d63073794e2` (tree `68f10f651d3b`), the last commit of `room/guest-reactions`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 5 files changed against
`origin/main` at that commit: `e2e/call-reactions.spec.ts`, `fixtures/fake-livekit.ts`, `fixtures/join.tsx`, `src/features/voice/RoomDock.tsx`, `docs/plans/guest-reactions.md`. The review notes below name the commit of each later change.

## Outcome

- **`RoomDock.tsx`:** React is offered only when the token's signed standing is not a guest's. That is the API's
  rule for the data channel (`livekit.ts`: guests keep a media-only grant).
- **The fixture:** the guest's page signs its viewer as a guest (`signViewerAs`), as the door's token does. Until now
  the fake LiveKit listed every viewer as an admin.

## Evidence

- Plan: `docs/plans/guest-reactions.md`.
- Written first and failing (commit of the tests): `call-reactions.spec.ts`, where a guest let in through the door
  found React in their dock.
- **After the change, locally:**
  - call-reactions, join, lobby-door, knock-alert, room-dock, room-tiles, host-controls, room-honest and two-screens:
    65/65;
  - type-aware lint, typecheck and Prettier are clean.
- **Captures:**
  - the guest's dock: microphone, camera, screen, clock, Leave, and no React;
  - a member's dock keeps it.

## Remaining obligations

- None. Whether a guest may react at all needs a data grant for guests, which is the API's to decide.

## Next bounded action

- Luis: merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
