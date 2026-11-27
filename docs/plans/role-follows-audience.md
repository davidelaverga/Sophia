# A role change reaches the other person's open tab

> 2026-11-27 · Luis, «Sigue con la cola de mejoras de UI». Finding 5 of the test before the demo
> (`hallazgos-prueba-demo.md`). Studio only; no API change, no new text.

## Measured

- In the demo test, an admin made Davide a viewer. Davide's open tab kept him an editor for over 25 s, with Invite
  and without the viewer's notes, until a reload.
- Cause: the shell reads the viewer's membership once (`staleTime` 60 s) and again only after a failed read
  (CON-01-CX-0010). Nothing in the feed asks for it.
- On the fixture before the change, `roleByAdmin('viewer')`: Invite still there 4 s later.

## What changes

- A role change already raises the project's `audience_revision` (`0056_member_roles.sql`; also joining, leaving and
  removal), and the snapshot carries it as `audienceRevision`.
- `useProjectMembership` takes it. When it rises past the last one seen (`audienceMoved`, access-view.ts; the first
  reading is the baseline, an older snapshot answered late is no change), the membership is read again and the
  project's member lists (`['members', projectId]`) are refreshed.
- What the role decides (Invite, the viewer's notes, the composer) follows from the membership as it already does.

| Measure (fixture, 1280 × 800)        | Before          | After                 |
| ------------------------------------ | --------------- | --------------------- |
| `roleByAdmin('viewer')` → Invite gone | not in 4 s      | 208 ms, no reload; back to editor 212 ms |

## Not here

- The admin's own confirmation («Davide is now a viewer.») is new text: proposed to Luis, not built.

## Checks

- Unit: `audienceMoved` (access-view.test.ts).
- E2E: `role-follows-audience.spec.ts`, with the fixture's new `roleByAdmin` (raises the snapshot's audience and
  answers the new role). Seen failing with the hook removed (Invite still there). CI is the record: the Playwright
  guard refuses locally while Opera is open.
