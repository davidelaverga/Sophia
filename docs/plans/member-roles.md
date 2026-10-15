# An admin changes a member's role, and can hand the admin role over

> 2026-10-15 · The deep gaps report's first item (`evaluacion-2026-10-15/informe-brechas-a-fondo.md` §2.1): no function
> changes a role, and a member invitation gives editor or viewer only. Since a member can leave (#349), the last admin
> can never go, so a project can't outlive its creator. Luis: «Sigue con ceder el admin y cambiar roles».

## What was measured

- `project_members.role` is set when a member joins (0003, 0006, 0047, 0010) and never changed after.
- `leave_project` refuses the project's only admin (0052).
- The Studio has a members list since A25 (#352), but nowhere to manage members.

## What changes

- **Migration 0055:** `sophia.change_member_role(project, actor, role)`.
  - Admins only (403).
  - The target is an active member (422), and the role is admin, editor or viewer (422).
  - A project keeps at least one admin: demoting its last admin, oneself included, is refused (409 `invalid_state`,
    «A project needs an admin…»).
  - Setting a role already held changes nothing and answers the same, because the act is idempotent in itself. A
    change holds the project's row, bumps the membership's revision and `audience_revision`, and emits
    `project.member_role_changed`, labelled «Role changed».
  - Handing the admin over is two acts, as in Slack or Linear: make someone admin, then step down or leave.
  - A call already joined keeps the standing its token carries until it reconnects, at most the token's 10 minutes.
    The next token reads the new role.
- **Contract amendment A27:** `PUT /api/v1/projects/{projectId}/members/{actorId}/role` takes `{ role }` and returns
  `{ actorId, role, revision, cursor }`. `/ready` requires 0055.
- **Studio:**
  - The Invite sheet's Members tab gains «In this project»: each member (A25's names, «A member» when unknown), you
    marked. For an admin each row has a role select; for anyone else the role is words.
  - A refusal (the last admin) is said on the row, and the select goes back.
  - Leaving as the only admin now says where to go: «Make another member an admin in Invite › Members first.»

## Checks

- `api.db.test.ts`, «member roles»:
  - an admin makes an editor admin, and both list as admins;
  - then the first admin can step down to editor, and can leave;
  - an editor is refused;
  - the last admin can't demote themselves;
  - a non-member target and an unknown role are refused;
  - the same role twice changes nothing;
  - an event is kept.
- `readiness.db.test.ts`: not ready without 0055.
- `member-roles.spec.ts`:
  - an admin makes Marco an admin from the Members tab, and it is sent;
  - the only admin making themselves editor is told why, and the select goes back;
  - an editor sees roles as words.
