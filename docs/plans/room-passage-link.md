# Room: a link to the exact passage

> 2026-10-05 · Luis · PR 8 of the room's $20 plan (prototype scene 5) · "Construye todo"

## The gap, measured

A report can be linked (`?report=…&version=…`), but only to its top. To point a teammate at one sentence, a member copies the link and then explains where to look. Notion, Google Docs and Granola link to the exact block.

## What changes

**«Link» in the passage bar** copies a link to that passage of that version: `?report=…&version=…&passage=<block>.<word>.<count>`.

**The link holds nothing of the report's text, not even a hash of it.** It says where the passage is: its block, its first word there, and how many words. A version's text never changes (it is content-addressed), so the place is enough. Whoever holds the link reads nothing without access, and nothing in a request log, the history or a chat's preview can be tested against a guess of the words. That is the house rule for URL parameters; a hash was dropped after review, since a short passage's hash can be found by trying words.

**What is placed:**
- in the block the selection begins in, every word it touches;
- a selection begun or ended mid-word takes the word;
- one that goes on into the next paragraph links its first paragraph's part;
- at most 60 words.

**Link is offered wherever the version is known,** with no chat or brief needed.
- **Copied:** «Link copied.»
- **No clipboard, or a refusal:** an insecure page or an old app view shows the link, focused and selected, to copy by hand.

**Opening it:**
- **Found:** the viewer opens that version and, once its sources are in (until then a citation is drawn as its label, which would shift the words), finds the place. The passage is lit and brought into view, and its block takes the focus. Where the browser has no Highlight API (Safari before 17.2), its words are selected instead.
- **Not found** (the place isn't in this text): the pane says «This passage isn't in this version.» (a status, so it is announced).
- **The parameter is read once:** once decided, it is taken out of the address, so a reload or another version never look for it again. The decision lives with the pane: the Sources tab and back keep the passage lit. The light stays while that version is on screen, again as the text re-renders, and goes with the version.

**Only the version named:** a passage of v1 opened when v3 is current shows v1, as a version link does today.

## Out of scope

- links into the PDF view;
- linking a whole multi-paragraph selection.

## Checks (written first)

- **Browser** (`e2e/room-passage-link.spec.ts`):
  - Link copies where the passage is, with no word of it;
  - opened, it is lit, in view and focused, and the parameter is gone;
  - a mid-word selection takes the words whole;
  - a selection across paragraphs links its first one's part;
  - a passage not in the version says so;
  - another version shows neither the light nor the note;
  - with no clipboard, the link is shown to copy.
- **Units** (`passage-link.test.ts`):
  - placing a selection;
  - the link: its parameters, with no words, and reading it back;
  - the route keeping it, and a viewer step dropping it;
  - finding the passage at its place, or wherever it moved.
