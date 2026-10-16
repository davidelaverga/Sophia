# A project's activity, for its admins: who did what, and when

> 2026-10-15 · Luis asked whether we keep evidence of who did what (`evaluacion-2026-10-15/informe-logs-evidencia.md`),
> then: «Sí, haz la vista Activity y cierra los huecos».

## What was measured

- `project_events` is append-only per project, with `actor_id` and `occurred_at` on every row. About 50 kinds of write
  emit one.
- Nothing shows the actor: `Event` has none in the contract, the SSE read skips `actor_id`
  (`persistence/src/events.ts`), and the Work pulse names no one.
- **Two gaps:**
  - creating a project emits no event (0006, 0047);
  - an admin muting or removing someone in the call (A24, #351) leaves no row and no event. That was my choice in
    host-controls.md, and it is reversed here.

## What changes

- **Migration 0057:**
  - `create_project` (0047) is replaced to emit `project.created`. Its receipt's cursor is that event's sequence
    (`'1'` for a new project, `'0'` before); a replayed key still answers its stored receipt.
  - `sophia.record_host_act(project, target, act)` lets an admin record an act on an active member, `mute` or
    `remove`. It emits `room.host_muted` or `room.host_removed`, with the member as the entity. The API calls it
    right after the room server has done the act.
  - `sophia.project_activity(project, before, limit)`:
    - admins only (403);
    - newest first, at most 50 a page, before a sequence;
    - each entry carries its actor's id and the name the room keeps (0050), and for an act on a member, that member
      too.
    - **Only people's acts are shown:** the project, invitations, sessions, the door, host acts, goals and their
      commands, decisions, the brief's notes, and notes carried or taken back.
    - **Left out:** chat messages, so the view never becomes reading over shoulders, and what Sophia or the runtime
      did, which has no actor.
    - Codes and names only, never content.
- **Contract amendment A28:** `GET /api/v1/projects/{projectId}/activity?before={sequence}` returns
  `{ entries: ActivityEntry[], before }`.
  - An entry is `{ sequence, occurredAt, type, summaryCode, actor: { id, name }, target: { id, name } | null }`.
  - `/ready` requires 0057.
- **Studio:**
  - The project menu gains «Activity» for admins. Its sheet «Project activity» lists entries newest first: who, what
    (the Work pulse's labels, plus «Project created», «Muted in the call by an admin», «Taken out of the call by an
    admin», «Goal owner or date set»), on whom, and when.
  - A person filter keeps the entries one person made.
  - «Earlier» reads the next page.

## Checks

- `api.db.test.ts`, «project activity»:
  - creating, renaming and changing a role are listed newest first, with their actors and the member acted on;
  - a chat message is not listed;
  - an editor is refused;
  - pages go back with `before`.
- `persistence.db.test.ts`: `record_host_act` emits for an admin and refuses an editor.
- `api.db.test.ts` and `persistence.db.test.ts`: a new project's receipt cursor is `'1'`, its creation event's.
- `readiness.db.test.ts`: not ready without 0057.
- `project-activity.spec.ts`:
  - an admin opens Activity from the project menu and reads who did what;
  - the person filter narrows it;
  - «Earlier» reads more;
  - an editor's menu has no Activity.
