# Room: Sophia's line says what she is doing

> 2026-10-05 · Luis · PR 3b of the room's $20 plan (prototype scene 2) · "sigue con el PR 3b"

## The gap, measured

While Sophia researches, the room's line says "Working on 1 task in the background", and nothing more until the report arrives. Work's card has it: the task's detail, read every 15 s while it runs, gives the reads and searches used (WorkCard, `progressText`). The room shows none of it.

## What changes

When exactly one piece of work runs, and it is one of Sophia's native tasks, her line's note says what it is doing. The words are from the task's record and its kind:

| The task | Her line's note |
|---|---|
| research, before any read | Researching |
| research, `reads.used` = n | Researching · n sources read |
| draft_brief | Drafting the brief |
| more than one piece of work, or a goal without a task | Working on N tasks in the background (as today) |

**The words are Studio's.** They use counts from the record, never the question's text.

**The read** is the task's detail. It uses Work's query key (`['native-task', project, task, phase, result, name]`), so a Work card and the room share it. It is read again every 15 s while the task runs, as Work does.

**No progress bar.** A "3 of 8" would show the reads allowance, not how far the report is, and a moving line at the room's edge distracts (Luis, 2026-09-30). The note changes when the record does.

**Guests** have no project snapshot, so nothing is read for them.

## Out of scope

- "Making the PDF": `pdfRendering` is true only for a "Try PDF again" rendition, after the task has finished (contract), so it never shows while she researches;
- Esc closing the made object while the focus is elsewhere (Codex's P2 on #102): it goes with the next PR's keyboard work.
- Showing the question being researched.

## Checks (written first)

- **Units** (`work-line.test.ts`):
  - the words for each row above;
  - the task chosen only when it is the sole running work;
  - none without a snapshot.
- **Browser** (`e2e/room-work.spec.ts`, fixture `research=running` and `window.fixture.researchProgress`):
  - the note says "Researching";
  - after reads and one poll (15 s), "Researching · 3 sources read";
  - when the task is no longer running, the note is the floor's again.
