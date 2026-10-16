# An admin removes a member from the project

> 2026-10-15 · The first item of Luis's queue («Procede y encola las tareas»), completing members management after
> roles (#354): a member can leave (#349), but an admin can't take someone out of the project.

## What was measured

- Leaving (0052) sets the membership inactive, bumps the audience, and records a `room_removals` row with reason
  `left`. The worker takes the person out of the call and keeps watch while a token they hold could bring them back. A
  new invitation cancels it.
- The Invite sheet's «In this project» (#354) lists the members with their roles, and has nothing to remove one.

## What changes

- **Migration 0058:** `sophia.remove_member(project, actor, key)`.
  - Admins only (403).
  - Not oneself, since leaving is that (422).
  - The target is an active member (422). Removing an admin is allowed, because the remover is an admin, so the
    project keeps one.
  - Idempotent per actor and key in `sophia.member_removals`: a replay answers the same receipt.
  - It sets the membership inactive (its revision bumped) and bumps `audience_revision`. It records a `room_removals`
    row with the new reason `removed` (no lobby entry), and emits `project.member_removed` with the member as the
    entity.
  - `accept_room_invitation` is replaced again, so that coming back cancels a `removed` removal as it cancels a `left`
    one.
  - `sophia.pending_member_removal(project, actor)` lets an admin read that removal for the API's immediate attempt.
- **Contract amendment A29:** `POST /api/v1/projects/{projectId}/members/{actorId}/removal`, with an Idempotency-Key
  and body `{}`, returns `{ actorId, cursor }`.
  - The API tries once to take them out of the call, and the worker does the rest.
  - `/ready` requires 0058.
- **Labels:** «Member removed» in the Work pulse. In Activity, «Removed from the project · Marco».
- **Studio:**
  - Each other member's row in «In this project» has, for an admin, a «Remove» confirmed in place: «They leave the
    project and its call. A new invitation brings them back.»
  - Once removed, the row goes.
  - The person removed meets the closed door the Studio already shows when access ends.

## Checks

- `api.db.test.ts`, «removing a member»:
  - an admin removes an editor, who can no longer read the project;
  - the list counts one fewer;
  - the event and the removal row are kept;
  - a replayed key answers the same;
  - an editor is refused;
  - oneself and a non-member are refused.
- `access.db.test.ts`: someone removed comes back by invitation, and the removal is cancelled.
- `readiness.db.test.ts`: not ready without 0058.
- `remove-member.spec.ts`:
  - an admin removes Marco after confirming, and the row goes;
  - their own row offers no Remove;
  - an editor sees none.
