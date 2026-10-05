# Room: Sophia's voice lights the report on the stage

> 2026-10-05 · Luis · PR 7 of the room's $20 plan (prototype scene 4) · "Construye todo"

## The gap, measured

When a report is on the stage and Sophia talks it through, nothing on the page says where she is: the people read one place while she speaks of another. Her words already reach every member as live captions (#101), and the report's text is on screen; nothing crosses them.

## What changes

**Her words light up in the text:** her latest caption is matched against the presented report, while hers is the room's latest turn: once a member speaks after her, her light goes.
- **The match:** at least 4 words in a row, from her last 14, whatever their case, accents or punctuation.
- **What is lit:** the block they run in is marked, and the matched words are lit through the CSS Custom Highlight API. No text node is split, and the light moves as she goes.
- **Where she is now:** in one turn she goes from one paragraph to the next. The block whose run ends latest in what she said wins, then the longest run, then the later block.
- **Citations:** a citation's number is not a word. The block's text puts a space where it was, so the words around it still match.
- **What lights nothing:** a member's words, or hers when they are in no sentence of the report.

**The section index:** under the report's head there is a row of its top headings (title and sections), with her mark on the one she is in, said to a screen reader as «Sophia is here». Under a sub-heading the mark stays on its section. A section takes the reader there, focus and all. Nobody's scroll is moved for them: following her is the index, not a jump.

**Nothing is kept.** Captions stay pass-through: the match is computed from what the page holds and gone with it (M01:70).

## Out of scope

- Her mark moving everyone's view, by `present_section(anchor)` (A14's bridge tool, issue #105);
- the same light in the side pane.

## Checks (written first)

- **Browser** (`e2e/room-voice-trail.spec.ts`):
  - her words light the sentence and the index marks its section;
  - as she moves on, both move;
  - a member's words, and hers outside the text, light nothing;
  - a section in the index takes the reader there.
- **Units** (`voice-trail.test.ts`):
  - her latest words;
  - a run's place and length, and its minimum;
  - only her latest words count;
  - the block chosen.
