# Implementation-session handoff

Goal and attempt: what the meeting left, on leaving (`docs/plans/room-recap.md`), attempt 1. It is PR 11 of the room's $20 plan, and the first piece behind the vision flag (A12, issue #105).
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/recap` on `room/follow-ups` (#114), 2026-10-05
Ending commit/tree: the content commit before this handoff's.

## Outcome

Leaving the call by one's own press, from any view of the project (the dock, the mini dock, a sheet's call row), opens «This meeting»:
- **The head:** how long it lasted, and how many members and guests were there.
- **Sections:** Decided, Made (with «Open»), Kept, Still open, Work. Each comes from a committed record, and an empty one is left out.
- **«Copy recap»:** puts it on the clipboard as plain text, with the reader named instead of «you». Where the clipboard is refused, the text stays in a field to copy by hand.
- **«Close the meeting»:** for editors and admins, once. When the reply is lost, the recap is read again and says the meeting closed, so there is nothing to press twice.

A drop, another tab, being taken out, another project's call, or Leave from the places' bar shows no sheet.

**How a leave counts:** `useProjectRoom.leave({ pressed: true })` counts `leftByPress`. Only the press sites pass it; every leave the page makes itself is quiet.

**Sheets:** `useDialog` now gives Escape and Tab to the top dialog only, so over another sheet, Escape puts away the recap alone.

**API status:** the requests are A12's proposal, checked at runtime in `src/api/vision.ts`. They run only where `VITE_SOPHIA_VISION=1`, which is set by the fixture pages alone. The fixture builds the recap from what happened on the page:
- the notes kept with Keep;
- the report a result notice brought;
- the fixture's decision;
- the people in the call.

**Independent review, two passes:**
- **First pass:** no P1, and six P2s:
  - an earlier leave's recap could show again;
  - an alert showed beside a recap that was still on screen;
  - leaving from another view showed nothing;
  - one Escape closed two sheets;
  - the focus was lost after «Open»;
  - the hand copy vanished after 4 s.
- **Also:** the copied text said «you». All of these are fixed, plus the P3s on the work words, «Closing…» and the fixture.
- **Second pass:** one P2 was left, Leave from the places' bar. The project unmounts with the call, so the recap could never show. That leave is now quiet, and the plan says so. The P3 `key` on the sheet is added.
- **Remaining:** no P1 or P2.

## Evidence

Every run used the guards' gentle mode, beside Luis's game.

- **Units:** `recap-view.test.ts`, 3 of 3.
- **Browser:**
  - the whole phone project: 65 of 65. `room.spec` BASE-03 and `room-captions`' rejoin test now put the recap away before Join;
  - after the second review, the room, captions, people, made, voice-chat, work and resources specs on both projects: all pass (BASE-03 once fixed);
  - `room-recap.spec.ts`: 15 of 15;
  - `work.spec.ts` F-003: 3 of 3, desktop and phone. Leaving from a task sheet now shows the recap on top, and Escape returns to the sheet;
  - full desktop suite before the review fixes: 587 of 593. F-003 is fixed since. The 5 report print and reading checks fail on this Windows machine and are untouched here; `report-reading:692` fails on main locally too.
- **Mutations** (`light_mutants.py`):
  - first round, 8 of 8 killed;
  - second round, 7 of 7 killed: Escape for the top dialog, the mini dock's pressed leave, the read kept only while shown, the alert only without data, the hand copy kept, the focus before Open, and the reader's name in the copy;
  - the control survives every run;
  - removed after surviving because no press reaches them: the guard on the status before idle, and the «was in the call» guard (Leave exists only in the call). A key part that duplicated `gcTime: 0` was also removed.

**Gates:**
- `tsc`, `oxlint --type-aware` and Prettier pass. They ran directly, because this machine's Node is 24.11.

**Source-register IDs consulted:** none.

## Remaining obligations

- **Davide:** A12's shapes, and the `actorId` this Studio proposes on `noted` items (issue #105). Also an id for the meeting the room is in, so the sheet doesn't take the latest one.
- **This PR** awaits #114, CI and Codex.

## Next bounded action

A13 on the fixture, behind the flag: «Since you last looked» and the recaps in Updates.
