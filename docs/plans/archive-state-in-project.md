# Archive state inside the project: follow-ups to #368

> 2026-10-19 · two P2s left on #368 (archiving a project), from the follow-up list
> (`evaluacion-2026-10-16/seguimientos-p2.md`): «Refresh archive state when project events arrive» and «Hide Archive
> for already-archived projects». Luis 2026-10-18: «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella
> actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando».
> Studio only; no API, no contract.

## What was read

- **The line doesn't hear another tab.** Inside a project, «This project is archived» comes from the archived list
  (`Archive.tsx`, `useArchivedProjects`, `staleTime` 30 s). The list is read again only after this tab's own writes
  (archive, unarchive, rename, leave: each invalidates `['projects', name]`), or on focus once 30 s have passed. The
  feed's applied events (`useProjectFeed.ts`, `eventApplied`) refresh the snapshot alone. Yet the API emits
  `project.archived` or `project.unarchived` on the project's stream for each change (`archive-project.md`). So when
  another admin archives the project, a member looking at it reads nothing until they leave the tab and come back.
- **Archive is offered for an archived project.** The menu offers «Archive project…» to every admin
  (`ProjectName.tsx`); it holds no archive state. Archiving an archived project changes nothing at the API, yet the
  sheet's `onArchived` is the menu's `onLeft`: confirming ends the call and sends the person to Work. «Unarchive»
  already lives in the line under the header.

## What changes

- **`useProjectFeed.ts`, the debounced refresh:** an applied event also invalidates the archived list
  (`['projects', identity, 'archived']`, `Archive.tsx`'s `archivedKey`), so the line comes or goes with the event. Not
  filtered by type: the fixture's events all say `project.updated` (`fixture-api.ts`'s `frameOf`), and that file
  belongs to the mute-all branch. The 120 ms debounce coalesces a burst into one read, and only an observed list is
  read again (in a project, the line observes it).
- **`Archive.tsx`, one read helper:** `useIsArchived(identity, projectId)`, whether this project is among the archived
  ones, false until the read lands. The line uses it as it did inline.
- **`ProjectName.tsx`:** the menu calls it before its early return (hook order) and offers «Archive project…» only to
  an admin of a project that isn't archived. The sheet, its write, its keys and Cancel are unchanged.

## Checks, written first (browser)

- `archive-project.spec.ts`:
  - the project open and its feed up to date, `window.fixture.archivedElsewhere()` (the project archived and the event
    sent, as another admin's archive does) shows «This project is archived» within 2 s, with no focus change;
  - in an archived project (`archived=1`), once the line says so, an admin's menu reads Rename…, Activity, Leave
    project…, with no Archive.

## Limits

- Every applied event reads the archived list once more while a project is open: one small read per burst. A filter on
  `project.archived` / `project.unarchived` waits for the fixture's events to carry a type.
- Before the archived list lands, an admin's menu still offers Archive, as the line is still absent meanwhile.
- The state still comes from the archived list; «Decouple archive status from the capped list» (#368) stays on the
  follow-up list, and `useIsArchived` is where it would change.
