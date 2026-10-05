# Room: ask Sophia about a passage, and keep it in the brief

> 2026-10-05 · Luis · PR 4 of the room's $20 plan (prototype scene 5) · "Procede con ese orden"

## The gap, measured

A report open in the viewer can be read, cited and downloaded, but not talked about. To ask Sophia about one sentence, a member copies it, closes the report, opens Chat and pastes it with no word of where it came from. To keep it for the team, they open the brief and type it again. Granola, Notion and Copilot pages all let a selection become a question or a note in one press.

## What changes

**Selecting text in the report's Markdown** shows a small bar above the selection: «Ask Sophia» and «Keep».
- The bar shows only for a selection inside the report's text, never the pane's head, tabs or sources.
- A citation's number is not part of the passage.
- It goes when the selection collapses, and Esc takes it away before the pane steps down.
- Its buttons keep the selection (pressing one doesn't clear it first).

**Ask Sophia** (in the room only, where the chat is) puts the passage in the chat's message, opens Chat and leaves the caret after it, for the question:

```
“The fixture holds.” (Fixture report, v2)
```

Whatever the member had already written stays, after it. The report gives way to Chat as it does today (one pane at a time). Nothing is sent until the member sends it.

**Keep** writes the passage to the brief as the member's own note (an observation, as reported), with where it came from:

```
“The fixture holds.” — Fixture report, v2
```

- The pane says «Kept in the brief» with «Undo» for 8 s.
- Undo forgets the note, but only when the preview says nothing else goes with it. If something was already built on it, Undo says so, and the brief is where to forget it.
- An unanswered write, Keep's or Undo's, says so and offers «Try again» with the same key, as the brief does. Meanwhile no other Keep is offered, so a retry never carries another note's key.
- Keep shows only when the brief allows this person a note (`capabilities.recordNote`).

**Limits:** a passage longer than 800 characters is cut at a word, with "…"; the note fits the API's 2,000. The chat's message stays inside its 2,000 too: with a long draft the quote is cut shorter, and a full message is left as it is.

**Words are the member's selection,** never paraphrased; they go to the shared brief only by the member's press, so Personal never feeds it and no transcript is kept.

## Also in this PR

- **Esc puts the made object away while the focus is elsewhere** (Codex's P2 on #102), when no panel, report, dialog or field has it.
- **The work line's record is read only while the line shows** (Codex's P2 on #106): not under a video stage, nor in a room kept out of sight.

## Out of scope

- «Link» to the exact passage (it needs anchors per version);
- passages from the PDF view;
- turning a passage into a task (API, issue #105).

## Checks (written first, `e2e/room-passage.spec.ts`)

- A selection in the text shows the bar; one in the head shows none; collapsing it takes the bar away; Esc takes it away and the report stays.
- Ask Sophia: Chat opens, its message starts with the quoted passage and its source, a draft written before stays, and the caret is at the end.
- Keep: the brief receives the passage with its source, the pane says «Kept in the brief», and Undo takes it out.
- Undo refuses when something else would go.
- Keep is absent when the brief allows no note; Ask is absent outside the room.
- The made object goes on Esc with the focus on the page; the work line's record is not read under a video stage.
- **Units** (`passage.test.ts`): the passage's clean-up and cut, the two texts, and when Undo may go ahead.
