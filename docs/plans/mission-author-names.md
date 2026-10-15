# The brief names who wrote a note and who decided, in a call or not

> 2026-10-14 · Left by #334: the brief's notes and decisions named their authors from the call too, so outside one
> they read «A member». Luis: «arregla notas y decisiones».

## What was measured

- The brief names a note's author (`MissionEntry.actorId`) and a decision's proposer and decider
  (`MissionDecision.proposedBy`, `decidedBy`) from the call's participants (`useKnownNames`). With nobody in the call,
  each reads «A member», as the chat did before #334.
- The service keeps no name for them. The writes go through four `sophia.*` functions (`record_mission_entry`,
  `propose_mission_change`, `decide_mission_change`, and the voice capture), each large (0018, 0020).

## What changes

- **The name travels with the transaction, the row keeps it** (migration 0049):
  - `mission_entries.author_name`, and `decisions.proposed_by_name` and `decided_by_name`.
  - Triggers fill them from the name the API puts in the transaction (`sophia.actor_name`), and only for the
    transaction's own actor (`sophia.actor_id`): a row written for anyone else, by voice or by a service, keeps none.
  - The triggers overwrite whatever a write sets, and an update keeps the names already kept. A decision's
    `decided_by_name` changes only with its `decided_by`.
  - This way none of the large functions is copied to add a column.
- **The API names the actor** for the Studio's writes. `nameActor(c, name)` in persistence sets `sophia.actor_name`,
  and the mission routes for notes, corrections, proposals and decisions call it with the token's own name. Voice
  writes name no one, as voice messages in the chat don't (#334).
- **The brief says it** (contract amendment A18): `MissionEntry.authorName`, and `MissionDecision.proposedByName` and
  `decidedByName`. Each is a string or null, and optional.
- **The guide hears no name.** `project_status` already says who wrote or decided only as who they are to the speaker
  («speaker», «member 1»). A test now holds it to that.
- **The Studio uses each record's own name when the call doesn't know the author.** A note passes its `authorName` to
  `authorLabel` as the fallback, a proposal its `proposedByName`, a decision its `decidedByName`. So the notes, the
  pending proposal and «decided by» name people outside a call (`davide@sophia.test` → «Davide»). A name is never
  pooled per actor, so someone renamed between two writes reads as each write kept it (Codex P2 on #336).
- **`/ready` requires the columns** (Codex P1 on #336): an API on a database short of 0048 or 0049 takes no traffic,
  since the chat and the brief read them on every load.

## Checks

- `mission.db.test.ts`, «who wrote a note and who decided»:
  - an editor's note and proposal, and an admin's decision, come back named;
  - a pending decision has no decider's name;
  - an `authorName` or a `proposedByName` sent by the client is refused (422).
- `mission-view.test.ts`, «who wrote a note or decided, outside a call»: the brief's names fill in, and what the call
  knows wins.
- `voice-status.test.ts`, «project_status names no one».
- `pnpm check` (contracts regenerated), the database suites on PostgreSQL 16, and a browser check on the real stack.

## Left

- Voice writes keep no name. The bridge knows each participant's name from LiveKit and could put it in the
  transaction the same way.
