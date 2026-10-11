# Room: a passage becomes a task

> 2026-10-06 · Luis · PR 19 of the room's $20 plan, behind the vision flag (a proposed A17, issue #105) · "Sigue hasta que acabemos"

## The gap, measured

A member reads «The figure for March is unchecked» in Sophia's report and wants someone to check it. Today they keep it in the brief as a note, or say it in the chat, and nothing says who does it or whether it was done. Notion, Linear and Granola all turn a selection into an owned task in one press, and keep where it came from.

## What changes

**«Task» in the passage bar,** after Link. Only under the vision flag, for editors and admins, and where the passage has a place (the same place Link points to).

**Pressing it opens a small form in the pane,** in place of the selection:
- the passage, quoted, with its source (`“The fixture holds.” — Fixture report, v2`);
- «What needs doing?» (required, up to 500 characters);
- «For»: Me, Anyone, or a member in the call by name, as the call was when the form opened (one who leaves stays the one shown and sent). Guests and Sophia are never offered.
- Create records it. Cancel, or Esc (from anywhere in the form, so the pane stays), closes the form and gives the focus back to the report's title.
- Create needs words; without them, the field says so.

**Created,** the form goes and the pane says «Task added for Lucía.», with «See tasks», which opens the Tasks tab (and the line goes). The task is in the tab at once.

**A Tasks tab,** after History, counting the open tasks: «Tasks 2». It shows the report's tasks, newest first, open ones before the done ones. Each row shows:
- what needs doing;
- who it is for: «you», a name, or «anyone»;
- the passage, as a link to its place in its version (the same link Link copies), in a tab of its own: followed in the room, it would reload it and leave the call;
- «Done», for the person it is for (a task for anyone: any member), or an editor or admin. A done task says «Done by you.» or «Done by a member.» and offers nothing more.

**Writes:**
- one key per press (useAdmission), for Create and for each Done;
- with no reply, the form or the row says «Not confirmed. Try again.», and only that press goes again;
- while a Create is held (sending, or with no reply), no other Task is offered. Closed, the form leaves its Try again in the pane's foot; a refusal goes with the form;
- the API's refusal is said in its words.

**The tasks are read again as the feed moves,** as reviews are, so a teammate's task or Done shows without a reload.

**API (proposed as A17, [posted to #105](https://github.com/davidelaverga/Sophia/issues/105#issuecomment-6010589410)):**
```ts
POST /api/v1/projects/{projectId}/tasks                       Idempotency-Key
     { text: string; owner: string | null;                   // an actor id, or null for anyone
       from: { artifactId; versionId; passage: string; quote: string } }   → 201 ProjectTask
GET  /api/v1/artifacts/{artifactId}/tasks                     → { tasks: ProjectTask[] }   // newest first
POST /api/v1/projects/{projectId}/tasks/{taskId}/done         Idempotency-Key   → 200 ProjectTask
type ProjectTask = {
  taskId; text; owner: string | null; ownerName: string | null;
  from: { versionId; versionNumber: number; passage: string; quote: string };
  by: string; at: string; doneBy: string | null; doneAt: string | null
}
// editors and admins create; Done by the owner (anyone's: any member), an editor or an admin; viewers read; guests 403.
// owner must be a member; the quote is the member's own selection (≤ 800 characters), never paraphrased.
```

**Fixture:** tasks are kept per report, once per key.
- `loseNextTaskReply()`: the write lands, but its reply doesn't arrive.
- `taskBy(owner)`: another member makes a task.

## Out of scope

- Tasks for Sophia: «Ask Sophia» and «Request changes» already give her work.
- Due dates, reopening, editing, and a board of every task in the project.
- Tasks from the PDF view, as with Ask and Keep.
- A Create with no reply survives the form, not the pane: opening another report drops it, as Keep's does.

## Checks (written first)

- **Browser** (`e2e/room-passage-task.spec.ts`):
  - Task opens the form with the passage and its source; Create needs words;
  - For lists Me, Anyone and the members in the call, never a guest;
  - Create records it once, says «Task added for Lucía.», and See tasks opens the tab with its row;
  - the tab counts the open tasks; Done records once, and the row says «Done by you.»;
  - a viewer sees the tasks, with no Task in the bar and no Done;
  - Esc (from the form's button) and Cancel close the form, the pane stays, and the focus goes back to the title;
  - while a Create has no reply, no other Task is offered; closed, the foot keeps its Try again;
  - Done with no reply: Try again, recorded once;
  - with no reply, only Try again, and it records once, for Create and for Done;
  - another member's task shows as the feed moves;
  - the passage's link in a row points to its place in its version.
- **Units** (`task-view.test.ts`): who a task is for, in words; the order (open, newest first, then done); who may mark it done; whom it may be for in the call.
