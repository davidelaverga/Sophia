# Room: the report's next version arrives live, with what changed

> 2026-10-05 · Luis · PR 5 of the room's $20 plan (prototype scene 6) · "Procede con ese orden"

## The gap, measured

When Sophia revises a report while it is open, the pane learns of it only when the window gets its focus back (ART-02). It then says "v2 is the current version. Show it". Pressing it swaps the text, scrolls to the top, and gives no sign of what changed: the reader looks for the change by eye. A citation says only its number until it is pressed.

## What changes

**Live:** the open pane reads the report's versions again whenever the project's feed moves (its snapshot's cursor), as well as on focus. A version published in the room shows up within the event's round trip.

**The offer says how much changed:** when the new version replaced the one on screen, the offer reads «v2 is here · 2 sections changed. Show it», from the facts the service computed at publication. Otherwise it stays as today.

**Shown from the offer, the change is marked:**
- each section added or revised since the version that was on screen has a small mark beside its heading: «New» or «Changed»;
- the facts line above the text says it in words, as the history does (`factsLine`);
- the marks come from comparing the two texts by section (`compareSections`), the history's own comparison, so they are never Sophia's notes;
- they go when the pane closes or another version is chosen.

**The place is kept:** the heading the reader was at stays where it was on screen. When that section is gone, the scroll stays where it was.

**A citation shows its source on hover and focus:** its title and its site, in a tip, as the Studio's other tips show.

## Out of scope

- marks inside a section, word by word;
- following Sophia's voice through the sections (it needs the bridge, issue #105);
- «Show everyone» (shared focus, issue #105).

## Checks (written first)

- **Browser** (`e2e/room-live-version.spec.ts`):
  - a version published while the report is open is offered without a focus change, with its count;
  - Show it marks the changed sections and only them, and says the facts line;
  - the heading being read keeps its place;
  - the marks go with another version;
  - a citation's tip names its source.
- **Units** (`live-version.test.ts`): the offer's words, which headings are marked, and the heading kept.
