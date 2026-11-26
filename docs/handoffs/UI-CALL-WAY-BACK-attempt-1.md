# Handoff: the way back into a call, and back from a slip at the door, attempt 1

Goal and attempt: UI-CALL-WAY-BACK (`docs/plans/call-way-back.md`; improvements 4 and 20 of the independent evaluation
of 2026-11-22), attempt 1. Batch D of seven; A is #544, B #545, C #546.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/mejoras-d-llamada` from `origin/main`
`d1e6b1410`.
Ending commit/tree and changed files: content commit `b59d0d0ea` (tree `30eb1f73e`): 13 files changed, 498
insertions, 29 deletions, under `apps/studio` and `docs/plans`; this record is the next commit.

## Outcome

- F5 in a call: the dock says «You were in the call before the page reloaded.» and Join goes back as the call was (the
  microphone as it was, capped by this device's choice; text mode kept; the camera off). Nothing joins on its own. A
  Leave first, another tab, another project or account, or past two minutes: no offer.
- «Let in instead» stands for the declined guest's minute, or until they ask again, leave, or are let in or blocked; a
  Decline that fails gives the guest their row back.
- Pending Luis: the line's words; the choice of an offer over an automatic rejoin (the note says why).

## Evidence

- Before, on the evaluation's stack (`df4b4a518`): after F5 in a call, «The room is ready» and Join, no word.
- After, on this branch's Studio (:5176, same API): in the call, F5 → the line and Join; Join → back in, the
  microphone off as it was, the line gone; Leave then F5 → no line. Measured again after the review's fixes.
- Studio units: 2559 pass; the 2 failures are the known Windows-only ones.
- `pnpm lint` 0, Studio `tsc --noEmit` 0, Prettier clean.
- Playwright through `pw-gentle.ps1`: before the review's fixes, `call-way-back` 3 passed and `lobby-door`,
  `room-phone-floor`, `invite-members` passed; `arrival-since` failed on the fixture's lobby, which now lists a
  declined guest as the API does. After the fixes the guard refused three runs for RAM (5.4–6 GB free); not insisted.
  CI's browser job is the run on record.
- One independent review: no P1; four P2s and P3s fixed (the note lists them).

## Decisions and changes

- An offer, not an automatic rejoin: a reload must not turn on a microphone nor take the call from another tab of the
  same person; `call-rejoin.md` excludes the page's own leave from any try for the same reasons.
- The undo's window is the guest's own minute: the 8 s were this implementation's earlier choice, not a decision of
  Luis's (commit `7ff23865c`); `project-arrival-since.md` updated.

## Remaining obligations

- The PR is not merged; CI's browser job is the run on record for this batch's specs.
- The line's words pending approval.

## Next bounded action

Luis reviews the PR. Batch E (`ui/mejoras-e-visual`: whole rows pressable, form errors in place, tips that don't
cover, the dock on one row) follows.

Source IDs consulted: `AGENTS.md`, `CONTRIBUTING.md` (Studio UI, the room's side panel), `docs/plans/call-rejoin.md`,
`project-arrival-since.md`, `packages/persistence/src/access.ts` (`readLobby`).
