# The served board names people from the project's members

> 2026-10-17 · informe-25 (`evaluacion-2026-10-17/informe-25.md`), DL-05, from Luis's «Sigue con la cola … y el nuevo
> informe-25». Studio only: A25's `GET /projects/{id}/members` is already served.

## What was measured

- On the served board every teammate but the viewer read «someone»: «1 decision for someone», «Someone decides» with
  no picture, «Someone chose». `ServedWork.tsx` named only the viewer (`peopleOf`), because the board's view carries
  ids only. The project's members were read by Goals and the access sheet, never by Tasks.

## What changes

- **`board-people.ts` (pure):** each member with a name, said as the stage says it (`spokenName`: an address is no
  name), then the viewer as their account says it, which wins over the room's name for them. A member with no name, or
  an id no active member has, is left out: the board's own words read then, never an invented name.
- **`ServedWork.tsx`:** reads the members with Goals' key (one read names both views), only while the board itself is
  read (`enabled`).
- **`spokenName` (conversation-view.ts):** the rule `authorLabel` already applied, now shared.
- **What reads differently**, beyond the «someone» fallbacks, because `people` also names waits and executors:
  - the task waiting on a permission says «Waiting on Marco», not «Waiting on a permission»;
  - its sheet says «Marco answers it»;
  - a goal's faces read «On it: Luis, Marco»;
  - an owner's executor is named as the member.
- **The demo** (`fixtures/demo-work.ts`): on the board its people carry the ids its project's members carry
  (`BOARD_CAST`), so it is named through the same served path. Resources' demo keeps its own cast.

## Checks, written first

- `board-people.test.ts`: members by name; an address said as a name and a chosen name whole; a member with no name
  left out; the viewer's account over the room's name; a viewer with no display name said by name, never by address;
  `whoDoes` names a person a task is assigned to.
- `served-names.spec.ts`: on the demo, the pill reads «1 decision for Marco», the decision «Marco decides» with a
  picture, the fold «Luis chose», the waiting task «Waiting on Marco», no «someone» in the goal, no «Davide» anywhere;
  on a phone the pill is whole on one line.

## Left

- Two members whose addresses start alike read the same first name; the pill, which lists names once, then says it once.
- The members read keeps for 60 s: a member who just joined reads «someone» until the next read.
- The members key is written in three places (GoalTargets.tsx, InProject.tsx's invalidations, here); one `useMembers`
  with `enabled` can hold it once work/targets-robust has merged.
