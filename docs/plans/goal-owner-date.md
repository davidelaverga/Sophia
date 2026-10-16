# A goal has an owner and a target date

> 2026-10-15 · Point 9 of the gaps report (`evaluacion-2026-10-15/informe-brechas-funcionales.md`): in Asana Goals or
> Linear a goal says who owns it and when it should be done. Here a goal has a title, an outcome, criteria and its
> state, and nothing else. Luis: «Sigue con los puntos del informe que necesitan API».

## What was measured

- `Goal` holds id, projectId, title, revision, authorityEpoch, status, outcome, criteria and stateRevision. The mission
  runtime, Sophia's tools and the runtime wire module read it, and its revision and authority epoch fence commands.
- The Studio has no list of a project's members with their names. `room_names` (0050) keeps a member's name once they
  have joined the call.

## What changes

- **Kept beside the goal, not in it:** `Goal`, its revision and its authority are untouched. The mission's commands
  and the runtime see nothing new.
- **Migration 0054:**
  - `sophia.goal_targets(project_id, goal_id, owner_id, target_date, revision)`;
  - `sophia.set_goal_target(project, goal, owner, date, expected_revision)`:
    - editors and admins only (403);
    - the owner, when there is one, must be an active member (422);
    - the date is a calendar date between 2000 and 2100 (422);
    - a compare-and-set on its revision, where 0 means none yet; a stale write is 409 `stale_revision`;
    - it emits `goal.target_set`, so every member's feed reads it again.
  - Clearing both owner and date is a target too, with neither set.
- **Contract amendment A25:**
  - `GET /api/v1/projects/{projectId}/goal-targets` returns `{ targets: GoalTarget[] }` for members;
  - `PUT /api/v1/projects/{projectId}/goals/{goalId}/target` takes `{ ownerId, targetDate, expectedRevision }` and
    returns the `GoalTarget` with the cursor;
  - `GET /api/v1/projects/{projectId}/members` returns `{ members: [{ actorId, role, name }] }` for members. The name
    is the one the room keeps (0050), else null.
- **Names:** reading one's membership on opening a project keeps one's name for the room, as joining the call
  already does (`remember_room_name`). Members who opened the project since are named.
- **Studio:**
  - A goal's row says its owner and date, as «Ana · due 30 Oct», when it has them.
  - Its sheet gains «Owner» (the members, or «No owner») and «Target date», with Save for editors and admins.
  - Viewers read them. A stale save says so and reads again.

## Checks

- `api.db.test.ts`, «goal targets»:
  - an editor sets owner and date, and members read them;
  - a viewer and an outsider are refused;
  - an owner who isn't a member is refused, and so is a date out of range;
  - a stale revision is 409;
  - clearing works;
  - an event is kept.
- `api.db.test.ts`, «members»: the active members with their roles, named once they opened the project; an outsider
  is refused.
- `readiness.db.test.ts`: not ready without 0054.
- `goal-owner-date.spec.ts`:
  - an editor sets an owner and a date in the sheet, and the row says them;
  - a viewer sees them with no Save;
  - a stale save is said.
