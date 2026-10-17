# A goal lists the reports its work made

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §4, work). A report says what goal it was made for (#383,
> «Made for»), but a goal's sheet didn't list its reports. Studio only; the data is served.

## What is served

- The project's snapshot carries its latest 50 native tasks (`work`, `readNativeTasks`): each task has its goal, and
  the artifact it made when it made one.
- It also carries each artifact's current version (`artifacts`, `readCurrentArtifacts`), with the research task that
  made it (`trigger.taskId`).

## What changes

- **`goal-reports.ts`** (pure): a goal's reports are the current versions whose artifact one of the goal's tasks made,
  or whose trigger is one of the goal's tasks. One per report, newest first.
- **The goal's sheet** lists them under «Reports»: each title opens the report in the viewer (`useDocumentViewer`),
  with its version number. With none, or outside a project's viewer, the section isn't there.
- **The limit is the snapshot's:** a goal whose tasks are older than the latest 50 lists the reports those tasks made
  only while they are among them.

## Follow-ups (Codex P2s on #414)

- **A title opens the version its row names;** a newer one is offered by the pane's head («v2 is here»), as elsewhere.
- **Closing the report gives the focus back to the goal's row.** The sheet closed for the report and took its button
  with it, so the viewer falls back to what had the focus as it came (`returnFrom`), read once, never its own title.

## Checks

- **`goal-reports.test.ts`:** by the task's artifact; by the version's trigger; another goal's report is not listed;
  one entry per report, newest first.
- **`goals-overview.spec.ts`:** the demo's rollout goal lists its report, and the title opens it in the viewer. A goal
  without reports shows no «Reports».
- **The fixture:** `reports=1` puts the research task in the snapshot's work and the report's current version in its
  artifacts, as the API serves them.
