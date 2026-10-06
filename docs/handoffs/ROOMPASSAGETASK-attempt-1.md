# Implementation-session handoff

Goal and attempt: a passage becomes a task (`docs/plans/room-passage-task.md`), attempt 1. It is PR 19 of the room's $20 plan, behind the vision flag (a proposed A17, issue #105).
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/passage-task` on `room/review` (#124), 2026-10-06
Ending commit/tree: the content commit «Room: a passage becomes a task (A17 on the fixture, behind the vision flag)», the parent of this handoff's commit.

## Outcome

**«Task» in the passage bar** (`PassageTask.tsx`), for editors and admins:
- a form in the pane's foot with the passage quoted and its source, «What needs doing?», and «For»: Me, Anyone, or a member in the call;
- the people are those in the call as the form opens; guests and Sophia are never offered;
- Create records it once per key. With no reply, only Try again is offered, and while the Create is held no other Task is;
- closed, the form leaves its Try again in the foot; a refusal goes with it;
- Esc and Cancel close the form, the pane stays, and the focus goes back to the report's title.

**A Tasks tab** (`TaskList.tsx`), counting the open tasks:
- each row shows what needs doing, for whom, its version, and the passage as a link to its place (in a tab of its own, so the call stays);
- Done is offered to whoever it is for (anyone's: any member), an editor or an admin, with Try again after no reply;
- the list is read again as the feed moves; a Create writes into it at once.

**API (proposed as A17, [posted to #105](https://github.com/davidelaverga/Sophia/issues/105#issuecomment-6010589410)):** POST `/projects/{id}/tasks`, GET `/artifacts/{id}/tasks`, POST `/projects/{id}/tasks/{task}/done`.

**Also:** the fixture answers any report's task reads with none, as #124 does for reviews.

**Independent review, two passes:**
- **First pass:** three P2s, all fixed.
  - Task was offered while a Create was held, so a second press dropped its intent. The Create now lives in the hook, not the form.
  - «For» could show one person and send another once they left the call. The people are now snapshotted.
  - The passage link reloaded the room. It now opens in a tab of its own.
- **Second pass:** one P2, fixed. `.task-list` overrode the Work page's goal list, in production; the class is now `.task-rows`.
- **P3s, fixed:**
  - a late reply no longer takes the focus from elsewhere;
  - the foot's Try again keeps its words and its focus while it is sent;
  - a refusal no longer stays in the foot;
  - Create updates the cache;
  - the rows' live regions stay in the tree;
  - See tasks clears the line;
  - Esc ignores IME composition.
- **P3s left:**
  - a held Create is dropped when another report opens (as Keep's; said in the plan);
  - the fixture accepts what A17 would refuse (owner not a member, lengths);
  - a lost reply in the fixture doesn't move the feed;
  - there is no browser check of the «For» snapshot or of the hold while sending (the fixture answers at once).

## Evidence

Runs used the guards' gentle mode, at Idle priority beside Luis's games, on his word.

- **Browser:**
  - `room-passage-task.spec.ts`: 11 of 11, twice;
  - `room-passage.spec.ts` (the bar now ends with Task), the report, reading, review, room, Work and resources specs: all pass.
  - Two exceptions, both left as they are:
    - `report-reading` «a five-column table…» measures 543.9 px against 544 on this machine. It fails the same way on `room/following`, and CI passes it.
    - A Work test timed out once under load, then passed 3 of 3.
- **Units** (`task-view.test.ts`): 6 of 6.
- **Mutations:** 13 of 13 killed, and the control survives.
  - **The mutants:**
    - a viewer given Task;
    - a guest offered;
    - created without words;
    - no reply offering Create again;
    - Task offered while held;
    - the closed form dropping its Try again;
    - not read as the feed moves;
    - Done on another's task;
    - Cancel's focus lost;
    - Esc stepping the pane down;
    - «me» not this person;
    - the line taking no focus.
  - **Esc:** its mutant is killed once Vite really serves it. `light_mutants.py` sleeps 1 s after a write, which proved too short on this machine. The runs used `served_mutants.py` (scratchpad), which waits until the served module changes; Esc was checked by hand against the served code.
- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass. They ran directly, because this machine's Node is 24.11.

**Source-register IDs consulted:** none.

## Remaining obligations

- **Davide:** A17's routes and shapes (#105).
- **This PR** awaits #124, CI and Codex.

## Next bounded action

A follow-ups PR for the Codex P2s of #121–#124, then the video on the fixtures.
