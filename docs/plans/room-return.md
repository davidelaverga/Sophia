# Room: the meeting ends, the project continues

> 2026-10-06 · Luis · PR 23 of the room's $20 plan, behind the vision flag · Davide's vision, chapter 5 «Return», and his #105 ask for a task that finishes after the meeting closes · "Terminemos todo y grabemos"

## The gap, measured

A meeting can close while Sophia's research is still running. Today the recap's Work section reads the work as it is now, so a result that comes later changes the meeting's record. Davide's rule (#105): keep the at-close recap boundary stable, and show later outcomes as linked updates, never as though they existed before the meeting ended.

## What changes

**The recap is the record at close.**
- **Frozen at close:** once the meeting is closed, its recap is what was recorded by then. Later work never changes it.
- **Work still running (or queued):** it says so, «Research · still running at close», and the line is not reported as done.

**«After the meeting»,** under the recap of a closed meeting: what came of its work later, each line with its time and a way to it. For example: «17:34 · Research report ready · v2», with Open, which opens that version.
- It is a separate section, read from its own route, and the recap's own sections never change. Its times are the 24-hour clock, with the day when it isn't the meeting's; anything dated before the close is not shown.
- Without work running at close, it shows only when something came, so a failed read there stays quiet.
- While nothing has come: «Nothing yet. The work goes on after the meeting.» This shows only when work was still running at close.

**API (proposed, an A12 refinement, [posted to #105](https://github.com/davidelaverga/Sophia/issues/105#issuecomment-6013736483)):**
```ts
GET /api/v1/projects/{projectId}/meetings/{meetingId}/after   → { updates: AfterUpdate[] }   // oldest first
type AfterUpdate = {
  at: string                       // after the meeting's endedAt
  kind: 'work_finished' | 'version_made'
  taskId: string | null            // the work requested in the meeting it finishes
  artifactId: string | null; artifactVersionId: string | null; versionNumber: number | null; title: string | null
}
// Only for closed meetings; only outcomes of work whose origin is that meeting; current eligibility and Forget apply.
```

**Fixture:**
- **The meeting:** its recap is frozen at close.
- **Work running at close:** `research=running` puts it in the recap.
- **Finishing it:** `researchDone()` after the close adds a `work_finished` update, linked to the report's version.

## Out of scope

- The Updates page's own «since you last looked»: it is the project now, not the record at close, so later work shows there. The fixture keeps it so.
- Several conversations (Davide's chapter 2), and deciding a direction as a separate act (chapter 4: the brief's decisions already are one).

## Checks (written first)

- **Browser** (`e2e/room-return.spec.ts`):
  - closed with research running, the recap says it was still running at close, and «Nothing yet»;
  - the research finishing after the close leaves the recap's sections unchanged, and «After the meeting» lists it with its time, and Open opens that version;
  - an open meeting's sheet has no «After the meeting»;
  - «since you last looked», after the close, no longer says the research runs.
- **Units** (`recap-view.test.ts`): the at-close words for running work; the after-lines.
