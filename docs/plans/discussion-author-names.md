# A message in the room names who wrote it, in a call or not

> 2026-10-14 · Seen while verifying #330 on the real dev stack: with nobody in the call, Davide's message in the room's
> chat read «A member». Luis: «Arregla también el de “A member” en el chat».

## What was measured

- The Studio names an author from the room's participants (`useKnownNames`, from the call). A chat read with nobody
  in the call has no names, so every message reads «A member».
- The service keeps no name: a discussion entry (`DiscussionEntry`) has the author's `actorId` only, and no table holds
  a member's name.

## What changes

- **A message keeps its author's name** (migration 0048): `contributions.author_name`. `submit_contribution` keeps the
  name the API puts in the transaction (`sophia.actor_name`, set just before the call) — the token's own name, never a
  request field. The contract's `Contribution` has no such field, so a client cannot name itself (422). Messages
  written before, by voice, or by a tool keep none.
- **The snapshot says it** (contract amendment A17): `DiscussionEntry.authorName`, a string or null, optional.
- **The Studio uses it when the room doesn't know the author**: `authorLabel(actorId, me, names, fallback)` reads the
  call's name first, then the message's own, through the same address-to-name rule (`davide@sophia.test` → «Davide»).
  The chat and its quotes pass it.

## Checks

- `access.db.test.ts`, «who wrote in the room»: an editor's message comes back in the snapshot with their name, and a
  `authorName` sent by the client is refused (422).
- `conversation-view.test.ts`, «an author the call does not know»: the message's address reads «Davide»; none reads «A
  member»; what the room knows wins.
- `pnpm check` (contracts regenerated), the database suites on PostgreSQL 16, and a browser check on the real stack
  (nobody in the call: the chat names Davide).

## Left

- Notes and decisions in the brief name their authors from the call too («A member» outside one). The same column for
  the mission ledger's entries and decisions would follow the same path.
