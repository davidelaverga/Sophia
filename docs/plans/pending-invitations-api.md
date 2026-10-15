# Member invitations waiting in the app (A16): the API

> 2026-10-14 · Luis, watching the end-to-end video: «Cuando invitaste a Davide… no se vio un feedback o notificación de
> “Has sido invitado”… ¿y si la persona está activamente in app?» Then: «Arregla los puntos mencionados».

## What was measured

- On the real dev stack, Luis invited Davide while Davide had Sophia open at Home: nothing appeared. The project shows
  in Davide's list only after he opens the email's link and accepts.
- There is no read of one's own invitations. `sophia.room_invitations` is readable only by the project's editors
  (`editors_read`); the invited person cannot read the row meant for them. Accepting takes the link's token
  (`POST /join/accept`), whose hash the database keeps (`accept_room_invitation`, 0010).

## What changes

- **`sophia.pending_member_invitations(p_email)`** (migration 0046, SECURITY DEFINER, for `sophia_api`): the member
  invitations for the address the caller signed in with, still open and still usable (not revoked, not expired,
  `uses < max_uses`), in projects the caller is not already in. It returns:
  - the invitation's id;
  - the project and its title;
  - who invited;
  - the role and when it expires;
  - the link's version, which the API uses to rebuild the link.

  It never returns the token's hash. The address is the token's `email` claim, never a request field.
- **`GET /api/v1/me/invitations`** (`listPendingInvitations`): `{invitations: [{id, projectId, projectTitle, inviter,
  role, expiresAt}]}`. It returns no link and no token. A guest gets 403, as for every route outside the guests' own.
- **`POST /api/v1/invitations/{invitationId}/accept`** (`acceptPendingInvitation`):
  - It finds the member invitation for the caller's address by its id, whatever its state
    (`sophia.member_invitation_for`). If there's none — unknown, or for another address — the answer is 422
    `not_found`, so it doesn't say whose it is.
  - It rebuilds the link's token from the invitation's id and version, as `linkFor` makes it, and runs the same
    `accept_room_invitation`. Each state is answered as the link's accept answers it: already a member returns the
    project (a retry after a lost reply, Codex P2 on #332), and closed or used up is 409. The address match, the locks
    and the event all hold, unchanged; no 50-row window applies.
- **Security.** The link's token proved only that its holder could read the email. Accepting already required signing
  in with that address, which proves the same, so the in-app accept asks for nothing less. A reissued link (a new
  version) between the list and the accept is answered «Invitation not found», and reading the list again finds the
  new one.
- Contract amendment A16 adds the two paths and `PendingInvitation` and `PendingInvitationList`.

## Checks

- `access.db.test.ts`, «member invitations waiting in the app (A16)»:
  - The invited address (in any case) lists its invitation: id, project, title, inviter, role, expiry, and no link.
  - Another address lists none and can't accept it (422 `not_found`).
  - The invited person accepts it, joins with the invited role, and their list is empty after. Accepting again (a lost
    reply) answers the same project.
  - A revoked invitation is not listed, and accepting it says it's closed (409). A guest gets 403.
- `pnpm check` (contracts regenerated and checked), and the database suites on PostgreSQL 16.

## Left

- The Studio's notice at Home and in Work, with Accept (a separate PR on this contract).
