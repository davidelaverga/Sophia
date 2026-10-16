# What changed since you last looked, served (A34)

> 2026-10-16 · FND-C2-ATTENTION C2b, #365 section 2 and #105 (A13's «since»; `Refs #365 — section 2`). Migration
> `0066_project_updates.sql`, amendment `A34-project-updates.json` (P's namespace rev3). Stacked on C2a (#390).

## What is served

- **`GET /api/v1/projects/{projectId}/since`** returns `ProjectUpdates`: the calling member's window, as current records.
  - **The window:** the project's events after the member's seen sequence, up to `toSequence`. The service pins it at
    most 500 events on. `more` says events lie after it.
  - **`fromSequence`:** the member's mark before the window, or null if they never marked one.
  - **Lines:** each is a current record an event in the window names:
    - `decided`: mission decisions accepted in the window and still accepted;
    - `noted`: brief notes kept or corrected in the window, still current, their text in a source still ready and
      eligible;
    - `open`: proposals made in the window and still open;
    - `work`: tasks (jobs) with any `native_task.*` event in the window, with their state now;
    - `made`: report versions whose task's result arrived in the window, their source still ready and eligible.
      `askedBy` is who admitted the task, from its own event.
  - **Withdrawals:** a record withdrawn, superseded or made unreadable since is in no line, and so in no count. The
    Studio counts lines.
  - **Private events:** an event private to another person (`visibility_owner`) is never read.
  - **`names`:** each named person's display name (A32's `actor_label`), never an address. Someone without one is
    absent, and the Studio says «a member».
  - **Access:** active members only, viewers included; anyone else gets 403. An archived project still reads for its
    members.
- **`PUT /api/v1/projects/{projectId}/seen`** with `{ sequence }` answers 204.
  - The member's mark moves to the `toSequence` they were shown. It moves only forward, so an older value or a retry
    after a lost reply changes nothing.
  - Never past the project's newest event: that would swallow what comes next, so it answers 422.
  - Each member's mark is their own.
- **Reading acknowledges nothing.** Reading, polling and opening a line move no mark. Events after the shown
  `toSequence` stay new for the next window.
- **Seen is not an answer.** A decision the work board waits on (A15's Needs) stays where it is.

## DTO and route mapping (Luis, B)

| Route | Answer | Refusals |
|---|---|---|
| `GET /api/v1/projects/{projectId}/since` | `ProjectUpdates` (`parseProjectUpdates`) | 401; 403 not an active member; 503 |
| `PUT /api/v1/projects/{projectId}/seen` with body `{ sequence: toSequence }` | 204 | 401; 403; 422 a sequence past the newest event |

```ts
type ProjectUpdates = {
  fromSequence: string | null; toSequence: string; more: boolean
  decided: { decisionId; statement; proposedBy: string | null; decidedBy: string | null; at: string | null; undoable: false }[]
  made: { artifactId; artifactVersionId; title; versionNumber; askedBy: string | null }[]
  noted: { entryId; kind; text; authoredBy: 'member' | 'sophia'; actorId; at }[]
  open: { proposalId; statement }[]
  work: { taskId; kind; state }[]   // state: pending | running | succeeded | failed | cancelled | outcome_unknown
  names: Record<string, string>
}
```

**Where each line opens.** The Studio already has these paths, and each one reads again under the member's own
rights:

- `decided`, `noted` and `open` open the brief (the Studio view);
- `work` opens Tasks at the task (`taskId` is the job's id);
- `made` opens the report version in Knowledge.

## The narrow activation gap (B, preserving Luis's UI)

1. **The parser.** `api/vision.ts` `parseDigest` checks `proposedBy`, `decidedBy`, `at` and `askedBy` as strings, but
   A34 lets them be null. Use the generated `parseProjectUpdates` (A34) and map null to the person's absence.
   `namers` already says «a member» for an unknown id; a null `at` drops the «when».
2. **`more`.** When true, the view says more lie after the window. After Mark as seen it reads again; it already
   invalidates `['vision','since',projectId]`, so the next window arrives.
3. **The view's other half.** `UpdatesView` also renders `Meetings` (A12's `listMeetings`, recaps), which is not
   served. Turning on the Updates view alone would show a failing Meetings part.
   - The narrowest switch: an `UPDATES_SERVED` flag (e.g. `VITE_SOPHIA_UPDATES`) that lists `updates` among the
     served views (`route.ts` `UNSERVED`).
   - With it, the view renders «Since you last looked» and keeps `Meetings` behind `VISION`.
   - Set after V deploys 0066 and the routes.
4. **An old server.** Before the deploy the route answers 404, and the view would say «What changed couldn't be read».
   The switch follows the deploy. A 404 could also read as «not served» (nothing shown), as Needs' does.

## Not here

- Meetings and recaps (A12).
- Mentions, corrections and the messages of the room's chat (C3).
- Search, Personal, organizations and notifications.

## Checks

- **`updates.db.test.ts`** (real API on PostgreSQL), 6 cases:
  - **current records:** every section, with display names and no address;
  - **access:** a viewer reads; an outsider and a removed member get 403;
  - **the shown bound:** seen marks only what was shown; an event after it stays new; a poll acknowledges nothing; a
    retry is the same; an older value never lowers the mark; a value ahead is 422; each member's mark is their own;
  - **the window:** a bounded window with `more`, and the next window starting where the shown one ended;
  - **withdrawals:** a withdrawn note and a report whose source was withdrawn are in no line and no count; another
    person's private event is not read, and its owner reads it;
  - **archived:** an archived project still reads, and the mark is per member;
  - **Needs:** a work-board decision stays in Needs after seen.
- **`readiness.db.test.ts`:** not ready without 0066.
