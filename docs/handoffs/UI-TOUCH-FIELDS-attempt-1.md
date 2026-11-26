# Handoff: a phone's fields and a session's range, attempt 1

Goal and attempt: UI-TOUCH-FIELDS (`docs/plans/touch-fields.md`; improvements 21 and 24 of the independent evaluation
of 2026-11-22), attempt 1. Batch F of seven; A is #544, B #545, C #546, D #547, E #548.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/mejoras-f-movil` from `origin/main`
`d1e6b1410`.
Ending commit/tree and changed files: content commit `fab23ff52` (tree `17b647e31`): 5 files changed, 174
insertions, 9 deletions, under `apps/studio` and `docs/plans`; this record is the next commit.

## Outcome

- 21: on touch, the room's chat field and Invite's two addresses are at least 16 px (no zoom on focus in iOS
  Safari), each at the height it had and centred on its neighbour; a mouse and keyboard see no change.
- 24: a session's range («18:30 – 19:30») never breaks across lines: in the room's line, Calendar and the door.
- No new words.

## Evidence

- Before (fixture on `main` `d1e6b1410`, 390 × 844 touch): the three fields 13 px; the room's line broke «… 02:57» /
  «– 03:27 · starts in 10 min».
- After: 16 px; chat field 40 px in a 51 px bar, member's address row 36 px, guest's 47 px, as before; «name@company.com»
  fits (156 of 255 px). The line breaks before the range, which stays whole, on dark and light; at 1280 × 800 the
  fields stay 13 px and the line is one row.
- A first try with no-break spaces alone still broke after the dash (UAX #14 lets a dash break after itself); a word
  joiner after it holds the range.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` 0; Studio unit tests pass (`access-view.test.ts` 28).
- Playwright through `pw-gentle.ps1`: `touch-fields`, `invite-members`, `field-scale`, `room-discussion` 37 passed on
  the first commit; `touch-fields` and `invite-members` 6 passed on the final one; the touch checks ran (the context
  reports a coarse pointer).
- One independent review: no P1; two P2s answered (at least 16 px rather than a fixed 16, so larger browser text
  still grows the fields; the personal composer and other fields under 16 px listed in the note), two nits fixed in the
  spec (contexts closed after each check, the range's own dash).

## Decisions and changes

- Scope kept to the two fields the evaluation measured; the others under 16 px are listed in the note with what was
  measured or read.
- The range is held by characters in `sessionLabel` (`RANGE_DASH`), not by a span: the label is a string shown in three
  places.

## Remaining obligations

- The PR is not merged; CI's browser job is the run on record for the rest of the suite.
- Not tried on an iOS device.

## Next bounded action

Luis reviews the PR. Batch G (`ui/mejoras-g-…`: improvements 25, 26 and 27; 26 to decide with Luis) follows.

Source IDs consulted: `evaluacion-2026-11-22/mejoras-ui.md` (21, 24), `apps/studio/src/app/theme.css` (touch rules,
the message bar, sheet forms), `features/access/access-view.ts`, `features/voice/RoomStage.tsx`, `CalendarTab.tsx`,
`JoinFlow.tsx`.
