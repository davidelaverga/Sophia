# A member leaves a project

> 2026-10-15 · Point 1 of the gaps report (`evaluacion-2026-10-15/informe-brechas-funcionales.md`), its second piece
> after renaming (`project-rename.md`): someone invited to a project could never step out of it; it stayed on their
> Work list for good. Luis: «Sigue con los puntos del informe que necesitan API».

## What was measured

- `project_members` has an `active` flag since 0001, and every check reads it (`is_member`, `can_edit`, `is_admin`).
  Accepting a member invitation sets it back to true (0010), so coming back is an invitation, as in Slack or Linear.
- No function sets it to false, and no route or Studio press leads there.

## What changes

- **Migration 0052:** `sophia.leave_project(project, key)`.
  - Any active member may leave; anyone else is refused (403).
  - The last active admin can't leave (409 `invalid_state`, «You're the project's only admin…»). Otherwise the
    project would be left with no one who can invite or rename. Handing the role over and archiving are their own
    pieces.
  - It is idempotent per actor and key in `sophia.project_departures`. A retry after a lost reply answers the same
    receipt, though the person is no longer a member.
  - It holds the project's row, sets the membership inactive (its revision bumped) and bumps `audience_revision`, as
    joining does. It emits `project.member_left`, so the others' feeds read the smaller audience.
- **Contract amendment A22 (A19 and A20 are proposals to Davide in #105; the rename took A21):** `POST /api/v1/projects/{projectId}/leave`, with `ProjectLeaveRequest` `{}` and
  `ProjectLeft` `{ projectId, cursor }`. `/ready` requires the function.
- **Studio:**
  - The header's title opens the menu «Project» for every member now: «Rename…» for an admin, and «Leave project…»
    for anyone.
  - «Leave project…» opens the sheet «Leave project». It says what leaving means: the project leaves their list and a
    new invitation brings them back. It offers Cancel and «Leave project».
  - Once left:
    - a call in the project's room is ended;
    - the projects' list is read again;
    - the person is taken to Work.
  - Refused (the only admin), the sheet stays and says why.

## Checks

- `api.db.test.ts`, «leaving a project»:
  - an editor leaves: they no longer read the project or list it, others list one member fewer, and an event is kept;
  - the replayed key answers the same receipt;
  - an outsider is refused;
  - the only admin is refused, until a second admin exists;
  - an invitation brings the person back (`active` again).
- `readiness.db.test.ts`: not ready without 0052.
- `project-leave.spec.ts`:
  - an editor's menu has «Leave project…» and no «Rename…»;
  - leaving records the leave and goes to Work;
  - the only admin is told why and stays;
  - leaving during a call ends the call.
