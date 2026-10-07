# Room: what the meeting left, on leaving

> 2026-10-05 · Luis · PR 11 of the room's $20 plan, the first piece behind the vision flag (A12, issue #105) · "lo que no tenemos para API que se haga por fixtures"

## The gap, measured

At about $20 a month, people pay for what happens after the meeting: notes within minutes (Meet's Gemini notes, Zoom's summary, Fathom, Granola, Otter). The room has none. Leaving drops the person back on an empty stage. What the meeting decided, made and kept is in the brief, Knowledge and Work, but nobody puts it together.

## What changes

**On leaving the call by their own press** (not a drop, another tab, being taken out, or another project's call), from any view of the project (the dock, the mini dock, a sheet's call row), the room shows a sheet, «This meeting», built from the proposed A12 recap (`GET /projects/{id}/meetings?limit=1`, then `GET …/meetings/{meetingId}/recap`). Every item comes from a committed record; nothing is a transcript.
- **The head:** how long it lasted, and how many members and guests were there.
- **Decided:** each decision, with who proposed it and who decided it.
- **Made:** each report version Sophia made, with who asked. «Open» opens it in the viewer.
- **Kept:** the notes kept in the brief, a member's own or Sophia's paraphrase, said so.
- **Still open:** proposals not decided.
- **Work:** the tasks that ran, with their state.
- A section with nothing is left out. With nothing at all: «Nothing was decided, made or kept in this meeting.»

**«Copy recap»** puts the recap as plain text on the clipboard, with the reader named (others read it, so not «you»). Where the clipboard is refused, the text stays in a field to copy by hand until the sheet closes.

**«Close the meeting»** (editors and admins, A12's close): it ends the meeting for everyone, so its recap is final. It is idempotent per key. Once closed: «Closed. Everyone's recap is this one.»

**Behind the vision flag:** the sheet calls APIs that don't exist yet, so it shows only where the build sets `VITE_SOPHIA_VISION=1` (the fixture pages). The shapes are the proposal's (#105), checked at runtime in `src/api/vision.ts`.

**Fixture:** the meeting's recap is built from the fixture's own records:
- the notes kept with Keep during the call;
- the report version a result notice brought;
- the fixture's decision;
- the people in the call.

So what a member did in the room shows up in it.

**Each leave reads its own recap:** the read is kept only while the sheet shows, so the next leave never shows the last one. A read again that fails keeps the recap shown and says it may be out of date. Over another sheet, Escape puts away the recap only.

## Out of scope

- Undo for a decision (the recap shows `undoable`; deciding again needs the brief's API);
- the recaps list in Updates, and «Since you last looked» (A13, the next PR);
- a paragraph written by Sophia (decision 2 of #105).

## Not shown on the fixture

- Leave from the places' bar (at home, in the personal space) shows no recap: the call's project goes with the call from there. A13's recaps in Updates are where it is read later.

- A leave the page makes itself (another project's call, the project closing) is quiet by construction (`leave()` without `pressed`); the fixture has no second project to show it.
- The recap is of the project's latest meeting (`?limit=1`): the proposal gives the page no id for the meeting it was in. If A12 adds one to the room, the sheet reads that one.

## Checks (written first)

- **Browser** (`e2e/room-recap.spec.ts`):
  - leaving shows the sheet with the meeting's head and its sections, built from the records;
  - a passage kept during the call is in Kept, with the member's name;
  - «Open» opens the made report;
  - Copy puts the recap's text on the clipboard;
  - an editor closes the meeting once (the same key on a retry);
  - a dropped call shows no sheet;
  - Esc closes it.
- **Units** (`recap-view.test.ts`): the head's words, the sections kept, and the copied text.
