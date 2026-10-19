# A goal's owner and date never say «none» when they couldn't be read

> 2026-10-19 · The reliability baseline's gap #4, «lecturas que degradan a vacío en silencio»
> (`evaluacion-2026-10-19/fiabilidad/linea-base.md` §1.1, §5); Luis 2026-10-19: «quisiera trabajar en la fiabilidad y
> resiliencia. Ahí tendríamos que también medir. Lo que no se mide, no se puede mejorar» and «Procede con el script de
> medición y el lote R1». Studio only; no API change.

## What was measured

The baseline lists ~11 reads found by a heuristic (the file never reads `.error`), and says some may be decorative on
purpose. Each was read in the code here, asking one thing: when the read fails, does the person see a claim that there
is none? `Archive.tsx` is left out: the archive branch changes it.

**Real: the goal sheet's owner and date** (`GoalTargets.tsx`, `GoalTargetSection`).

- The members read (`useMembers`) gives `[]` after its three tries. An editor's Owner choice then holds only «No
  owner», and with a goal that has an owner the browser shows «No owner» selected, since no option matches the value.
  A viewer reads «Owner · A member».
- The section reads the targets through `useGoalTargets`, the map alone, so their failure is an empty map. A viewer
  reads «Owner · none · Target date · none»; an editor gets an empty form whose Save is sent against revision 0 and
  comes back «Someone changed it meanwhile». The overview under the brief already says the dates failed
  (targets-robust.md); the sheet said «none».

**Decorative, kept as they are** (a failure shows nothing extra, and nothing claims «none»):

| Read | What a failure leaves | Why it stays |
|---|---|---|
| `FromYourProjects.tsx` (people to invite) | the «From your projects» choice isn't drawn | an extra path beside the typed email, which works; it is drawn only when there are people, and nothing says there are none |
| `InProject.tsx` (members in the invite sheet, same `useMembers`) | «In this project» isn't drawn | nothing says the project has no one; noted below as the closest call |
| `CatchUp.tsx` (the meeting so far) | no «Catch up» offer | an offer for a late join, `retry: false` on purpose; nothing says there is nothing to catch up on |
| `StagePresent.tsx` (`useFocusAt`, Sophia's walk) | no walked section on the stage | a cue on top of the report, which stays |
| `NewConversation.tsx` (starters) | no suggested questions | the same brief read sits beside the form and says «The project’s context can’t be read now.» with Try again |
| `ReviewSources.tsx` (availability, recorded proposal) | no «Review sources» entry; a kept proposal stays as it was | the file says «nothing is said elsewhere» on purpose; the kept proposal survives in storage and returns with the read |
| `source-origins.ts` | a source says «From the project» | true words, as before the origins existed (its header says so) |
| `WelcomeBand.tsx` (the mission) | the welcome without its «for what» line | who brought them and the goals are still said; nothing says the project has no purpose |
| `InvitedBand.tsx` (pending invitations) | no band on Home or Work | nothing says «no invitations»; read every 20 s, so it appears once the read takes |
| `ContinuityChoice.tsx` (the mission) | the consent question isn't asked | unasked stays unset, and team defaults never stand in for a person's consent (its header), so nothing is kept from their turns; the question comes once the read takes |

The overview's rows with the members unread say «A member · due …»: generic, not «none», so they stay.

## What changes

- **`useMembersRead`** (`GoalTargets.tsx`) runs the members read and says how it stands with `notesRead`, as
  `useTargetsRead` does for the dates. `useMembers` stays for the rows and the invite sheet.
- **The sheet says a failed read in place**: «The owner and date can’t be read right now.» with Try again, in the
  area's words (the overview's «The dates can’t be read right now…», the notes' «Notes can’t be read right now.»), as an
  alert. No form and no «Owner · none» while either read has failed with nothing kept. Try again reads again what
  failed.
- One line for both reads: without the members the owner can't be named or chosen, and without the targets the form
  would save against the wrong revision, so neither half can be drawn honestly.
- A read that fails later, with a list kept (`stale`), keeps showing what was read, as the overview does. For the
  targets this needed the change in the review section below: as first written it held only until the project moved.

## Checks

- `e2e/goal-owner-date.spec.ts`, with a new lever `membersRead=fail` / `window.fixture.failMembers` beside
  `targetsRead=fail` / `failTargets`:
  - an editor whose members can't be read is told so, and no Owner choice says «No owner»; Try again, answered, brings
    the choice back with Marco chosen;
  - a viewer whose targets can't be read is told so, never «none»; Try again, answered, says Marco and the date.
- Neighbours: `targets-robust`, `goal-overdue`, `goal-notes`, `goals-overview`, and the invite sheet's members specs
  (`member-roles`, `remove-member`), which read the same members.

## Limits

- While the reads are first coming in, the sheet still draws its empty form or «none» for a moment, as before. That is
  a loading state, not a failure, and stays out of this change.
- `InProject` is the closest call among the decorative ones: a project always has at least its viewer, so an empty
  list can only be unread, and an admin who opens the sheet to change a role finds no list and no reason. It is a
  candidate for the same line in its own change.

## Review: a kept read must outlast the project's moves

> The independent review of this branch, one P2, no P1.

- **What was measured.** The targets are keyed by the project's cursor with `placeholderData: keepPreviousData`.
  TanStack uses a placeholder only while the query is pending (`queryObserver`'s `createResult`: placeholder only when
  `status === 'pending'` and no data). Once the project moved, a failing read at the new cursor ended with no data,
  so `notesRead` said `failed`: the sheet swapped the owner and date on screen for the alert, and an admin's typed,
  unsaved date went with the form. The overview's «The dates can’t be read right now» came up the same way. The line
  above, «keeps showing what was read», held only until the first move.
- **The choice.** Each cursor's read starts from the newest targets read for the project and viewer (`initialData`
  from the query cache, with that read's own `initialDataUpdatedAt`, so it is stale and read at once). A failure then
  leaves data in place: `stale`, never `failed`. Weighed against the other two:
  - taking the cursor out of the key and invalidating on each move needs an effect in every reader (the overview and
    the sheet both read it), so each move reads twice, or a shared record of which move was read; the cursor key is the
    notes' pattern, kept here on purpose;
  - keeping the last map in a ref is per component: a sheet opened after the failure would have nothing to keep.
- **Check.** `goal-owner-date.spec.ts`: an admin with the owner shown types a date, the targets start failing, the
  project moves (`fixture.say`), and once the four tries are refused (the fixture records `targets-refused`) the sheet
  has no alert, the owner is still Marco and the typed date is still there.
- **Not done, the optional P3** (Try again shown busy while its retries run): the overview's `ReadFailed` doesn't do
  it either, and the two should change together rather than give one area two idioms.
- **Limit.** The notes (`useLedger`) keep the same cursor key with `keepPreviousData`, so the overview's notes alert can
  come up the same way after a move. Outside this change; a candidate for the same seed.
