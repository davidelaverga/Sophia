# A voice write names its speaker

> 2026-10-15 · Left by #334 and #336: a message, note, proposal or decision made by voice kept no name, so outside a
> call it read «A member». Luis: «Arregla también los dos pendientes del follow-up».

## What was measured

- A voice write runs as the speaker. The bridge names the speaker by actor id, and the API checks it against the
  exchange and the input epoch. No name travels with the call, and the database kept none, so 0048's and 0049's
  columns stay empty for it.
- The name the room shows is the one the API signs into each member's LiveKit token, from their account (`room-token`,
  `name: req.actorName`). The API knows it then and nowhere else.

## What changes

- **The database keeps the name a member joins with** (migration 0050).
  - `sophia.room_names` holds one row per project and actor. RLS is on and no role reads the table directly.
  - The API mints the room token in a write transaction. Before it, it names the actor (`nameActor`) and calls
    `remember_room_name(project)`, which keeps that name for an active member only. A guest has no account name and
    keeps none.
- **A voice write takes it from there.** `name_from_room(project)` puts the kept name in the transaction, and only the
  speaker's own: it reads `sophia.actor_id()`'s row, and a name already set (a Studio write's token) wins. Then 0048's
  and 0049's columns fill as for a typed write. No name leaves the database.
  - In the API, every voice write runs through `asSpeaker`: notes, proposals, decisions, and the brief kept with a
    steer.
- **The bridge sends nothing new.** Nothing changes between the services, so it doesn't matter which one deploys first.
- `/ready` requires both functions, and `readiness.db.test.ts` walks 0049 → 0050.

## Checks

- `mission.db.test.ts`, «names the speaker by the name their room token carried»:
  - a voice note said before the speaker joined through the Studio keeps no name;
  - after `room-token`, a note, a proposal and a decision by voice keep the speaker's name.
- The database suites on PostgreSQL 16, and `pnpm check`.

## Left

- The name kept is the one the member last joined with. It stays after they leave the project, like the names in the
  rows themselves.
