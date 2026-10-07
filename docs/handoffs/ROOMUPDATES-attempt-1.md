# Implementation-session handoff

Goal and attempt: Updates, with «Since you last looked» and the meetings' recaps (`docs/plans/room-updates.md`), attempt 1. It is PR 12 of the room's $20 plan, behind the vision flag (A13, and A12's Updates list, issue #105).
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/updates` on `room/recap` (#115), 2026-10-05
Ending commit/tree: the content commit before this handoff's.

## Outcome

Under the vision flag, Updates stops being «Coming»:
- **«Since you last looked»:** a digest built as the recap is, with the same sections and who did what.
  - It says when the person never looked, and when nothing is new.
  - «Mark as seen» writes the digest's sequence, and the digest is read again. With no reply it says «Not marked. Try again.»
  - The digest follows the feed, so a note kept elsewhere shows without a reload.
- **«Meetings»:** newest first. The running meeting shows only once someone is in a call, as «Now · started 10:02»; a closed one as «Oct 4, 15:00 · 38 minutes». Each row opens its own recap in the sheet from #115.
  - A close from there moves the feed, so the row stops saying «Now».
  - Leaving the call from inside that sheet opens no second one.

**API proposals (#105):**
- `since` takes `after` as optional, defaulting to the viewer's attention.
- The `Digest` shape.
- `names` on the recap and the digest: the API has no read of a project's members, and the room only knows who it saw this visit.
- `client.ts` lets a 204 reach the parser, as `PUT /seen` answers.

**Shared with #115:**
- `RecapSheet` takes a `meetingId`.
- `RecapPart` (heading ids from `useId`, a level) and `namers` serve both the sheet and Updates.

**Independent review, two passes:**
- **First pass:** no P1, and three P2s:
  - the list said «Now» after a close;
  - two «This meeting» sheets with one id, with the focus escaping the modal;
  - the fixture's publish on connect made BASE-01 pass before its event.
- **P2 fixes:**
  - the fixture's close moves the feed;
  - one recap sheet at a time, with its own title id;
  - no publish on connect, and the list is read again on joining or leaving.
- **P3s fixed:** heading levels, one read per cursor, «may be out of date», words tied to the range, an empty refusal, year and day words, and the fixture's id and comments.
- **Second pass:** no P1 or P2.
- **P3 left for later:** leaving from the sheet of an older meeting loses the left meeting's recap (it can be opened from the list behind the sheet).

## Evidence

Every run used the guards' gentle mode, beside Luis's games.

- **Units:** `updates-view.test.ts` 3 of 3, `recap-view.test.ts` 3 of 3.
- **Browser:**
  - `room-updates.spec.ts` with `room-recap.spec.ts`: 23 of 23;
  - `work.spec.ts` F-003: 3 of 3;
  - **full suite:** the guard stopped it at 350 of 668 when Gw2 opened. Up to there, only the 5 report print and reading checks failed, which fail on this machine and on main locally. CI runs the full suite on this PR.
- **Mutations** (`light_mutants.py`):
  - 7 of 7 on Updates: the digest and the list follow the feed, the digest is read again once seen, no Mark as seen without something to see, no reply versus a refusal, the record's names, and a row opening its own meeting;
  - 2 of 2 on the review fixes: no second sheet, and the list read on joining;
  - the control survives;
  - a client invalidation of the list after a close survived because the feed already re-reads it, so it was removed.

**Gates:**
- `tsc`, `oxlint --type-aware` and Prettier pass. They ran directly, because this machine's Node is 24.11.

**Source-register IDs consulted:** none.

## Remaining obligations

- **Davide:** the A13 shapes above, `names`, and an id for the meeting the room is in (#105).
- **Not done here:** a dot on Updates in the nav when something is new.
- **Codex's P2s on #114 and #115** go to the next follow-ups PR:
  - the focus marker on an unknown outcome, and bound to its version;
  - a double Leave while disconnecting;
  - Open from a recap under another sheet.

## Next bounded action

The follow-ups PR for #114 and #115. Then A13's «meeting so far» for a late joiner, and search with citations.
