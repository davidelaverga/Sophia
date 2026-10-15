# Invite people from your other projects

> 2026-10-15 · Luis: «si ya existe un equipo… al momento de invitar, yo no debería tener que escribir el correo de
> todos, sino que me salga una lista con todos los miembros del equipo y ahí yo decido a quién invitar». His choices:
> the list is the people you already share a project with, with no new «team» model, and choosing someone sends them
> an invitation they accept, never a direct add.

## What was measured

- A member invitation is bound to one email: it is mailed, it waits in the person's own list (A16), and only that
  address can accept it (0010, 0046). The Members tab takes one typed email per send (`InviteSheet.tsx`, `MemberForm`).
- The account's name, as the API reads it from the verified token, is the email (`apps/api/src/auth.ts:64`). The room
  keeps that name for each member once they open a project or join its call (0050, and #352 for opening).

## What changes

- **Migration 0054:** `sophia.invitable_people(project)`.
  - It is for an admin of the project only (403 otherwise).
  - It lists everyone who is an active member of another project the admin is in, with the latest email the room
    keeps for them.
  - It leaves out:
    - the admin;
    - the project's current members;
    - anyone with an open member invitation to this project;
    - anyone whose address isn't known yet.
- **Contract amendment A26:** `GET /api/v1/projects/{projectId}/invitable` returns `{ people: [{ actorId, email }] }`,
  at most 500, ordered by address. `/ready` requires 0054.
- **The writes stay as they are:** each chosen person gets the same member invitation as a typed email (one
  `createInvitation`, one key each). It is mailed, waits in their list, and only they can accept it.
- **Studio, the Members tab, above the email field:**
  - «From your projects» lists those people with a checkbox each.
  - One role applies to the whole choice, and «Invite N» sends them.
  - What went out is said («Invited 2»), with any address that failed named and kept checked, so a retry sends only
    those.
  - Those invited drop out of the list, since they now have an invitation.
  - With nobody to offer, the section isn't there. Typing an email stays, for someone new.

## Checks

- `access.db.test.ts`, «people to invite from other projects»:
  - an admin is offered a member of another project, known by address;
  - a current member, the admin themselves, and someone with an open invitation are not offered;
  - an editor is refused.
- `readiness.db.test.ts`: not ready without 0054.
- `invite-from-projects.spec.ts`:
  - an admin chooses two people and invites them, both are sent with the role chosen, and the list drops them;
  - with nobody to offer, no section shows;
  - a failed one is said and stays checked.
