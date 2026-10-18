# A report says what it was made for

> 2026-10-16 · Luis's QoL queue, item 5 (informe-brechas-a-fondo.md §3). A version carries its `trigger`, the research
> task that made it, and that task names its goal and what was asked (`NativeTaskDetail`). The report pane says
> neither, so a reader can't tell why the report exists or get back to the goal. Studio only: it reads what is already
> served.

## What changes

- **`ReportOrigin`**, above the Document tab's text, a group named «What it was made for» (not a note: the pane's one note says why a format isn't shown):
  - «Made for» the goal's title, as a press. It opens Goals with that goal's sheet (`#goal-<id>`, through the project's
    way across views: `project-go.tsx` gains a `goals` arrival).
  - «Asked» and what was asked, on a single line that ends in an ellipsis, with the whole question in its title.
- **What it reads:**
  - the version's `trigger.taskId`, then that task (cached by its id);
  - the goal's title, from the project's snapshot already read.
  - A goal the snapshot doesn't hold leaves the press out; the question still shows.
  - With no trigger, or a task that can't be read, nothing shows. No error is said: the report reads as before.
- **The fixture:** each version carries its trigger. In the demo, the research task's goal is the rollout.

## Follow-ups (Codex P2s on #383)

- **Above every format:** the origin stands above the designed HTML page and the PDF too, not only the Markdown. On the
  full page it keeps the designed page's edge.
- **Where the report covers the page** (a phone, the full page), «Made for» closes it before opening Goals (the
  viewer's `leaveFor`), as a source's origin does. Beside Goals at the side size, the report stays open.

## Checks

`report-origin.spec.ts`:
- in the demo, the report says it was made for «Roll the new onboarding out to every region». Pressing it opens Goals
  with that goal's sheet;
- outside the demo (a goal not in the snapshot), the question shows and no press is offered.
