# Implementation-session handoff

Goal and attempt: ARCHIVE-STATE-IN-PROJECT (two Codex P2s on #368 from `evaluacion-2026-10-16/seguimientos-p2.md`:
«Refresh archive state when project events arrive», «Hide Archive for already-archived projects»; Luis 2026-10-18:
«Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en un pr, excelente o
como veas, que alivie la presión pero hay que seguir trabajando»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-6`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-6`, branch `archive/state-in-project` from `origin/main`
(`b89a5a962`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the session's guard, `.claude-guards/safe-run.ps1`, two
workers); CI as the run on record.
Existing authority: Luis 2026-10-18, as quoted; local only, nothing pushed; merges on green with no open P1 once
pushed.
Ending commit/tree: `123586fb18c2` (tree `961a9b27992c`), the last commit that changes code; the next one adds only
this record. 6 files changed against `b89a5a962`. One branch, one PR when Luis says. A dry-run merge with #468
(`group/seams-4`, `git merge-tree`) is clean.

## Outcome

- When another admin archives a project, a member looking at it reads «This project is archived» as the project's
  event arrives, without leaving the tab and coming back. The same refresh takes the line away on an unarchive.
- An admin inside an archived project is no longer offered «Archive project…» in the project's menu (Rename…,
  Activity, Leave project…). Archiving it again changed nothing yet ended their call and sent them to Work.
  «Unarchive» stays in the line under the header.

## Evidence

- Plan: `docs/plans/archive-state-in-project.md` (committed before the tests, `22506051a`).
- **Item 1, the line follows the feed:**
  - written first and failing (`06b302d94`), through the guard at the detached test commit: 1 failed, 6 passed. The
    waits for the archived list's first read and for «Up to date» passed; then `expect(locator).toBeVisible() failed`
    on `getByRole('status').filter({ hasText: 'This project is archived' })`, «Timeout: 2000ms · element(s) not
    found», log `pw-logs/archive-state-red-1.txt`;
  - fixed (`3ea79e01e`): `archive-project.spec.ts` 7/7 on the branch, log `archive-state-green-1.txt`.
- **Item 2, no Archive once archived:**
  - written first and failing (`0b7df1481`), detached: 1 failed, 7 passed, on `toHaveText` for the menu's items:
    expected Rename…, Activity, Leave project…; received `+ "Archive project…"` between Activity and Leave project…,
    log `archive-state-red-2.txt`;
  - fixed (`123586fb1`).
- **After both** (`123586fb1`):
  - e2e through the guard, two workers: `archive-project` with its neighbours (`project-activity`, `project-leave`,
    `project-rename`, `next-ask`, `project-carried-in`, `room-live-version`, `unread-title`, `project-conversations`,
    `conversation-moves`, `discussion-earlier`, `room-updates`, `room`, `work`) 296/296, log
    `archive-state-neighbours.txt`;
  - unit: the Studio suite 1866/1868, the two failures the known Windows ones (`attention.test.ts`,
    `browser-imports.test.ts`);
  - `tsc --noEmit -p apps/studio` and Prettier on every touched non-docs file: clean. Whole-repo
    `oxlint --type-aware`: one error, not from this branch: `useProjectRoom.ts:599` `useRoomConnection` has 61 lines
    (max 60). It is on `origin/main` `b89a5a962` as merged with #467, and #468 also touches that file; left alone.
- **Captures** (a throwaway spec, deleted), 1280×800 dark and the 390×844 phone in light: the line after
  `archivedElsewhere()`, and the archived project's menu with its three items. 0 px horizontal overflow on the page,
  the header, the line and the menu in each. In the session's scratchpad, `archive-state-in-project/`.

## Decisions and changes

- **Checked against the code first:** both items held at `b89a5a962` as the triage quoted them. The archived list is
  also read again on focus once its 30 s `staleTime` has passed, which is the «return to the tab» the first check
  rules out by waiting 2 s with no focus change.
- **Not filtered by event type:** the API's events say `project.archived` / `project.unarchived`, but every fixture
  event says `project.updated` (`fixture-api.ts`'s `frameOf`), and that file belongs to the mute-all branch. So every
  applied event invalidates `['projects', identity, 'archived']` (exact) in the same 120 ms debounced timer as the
  snapshot. `invalidateQueries` reads again only an observed list; inside a project the line observes it.
- **The key written out:** `useProjectFeed.ts` names the key literally, as the Studio does for `['projects', name]`
  elsewhere, with a pointer to `Archive.tsx`'s `archivedKey`, rather than the feed controller importing a component
  module. `identity` joins the ports' deps and the effect's dependency list (the snapshot key already moved with it).
- **One shared read:** `useIsArchived(identity, projectId)` in `Archive.tsx`, used by `ArchivedLine` (unchanged
  behaviour) and by `ProjectName`, where it is called before `if (!props.role) return props.title` to keep hook order.
  Same query key as the line, so no new request.
- **The fixture lever:** `window.fixture.archivedElsewhere()` in `fixtures/room.tsx`, placed beside `shutDoor` in the
  `Fixture` interface and in `window.fixture`, away from #468's hunks.
- Untouched, as asked: the sheet's write, keys and Cancel; `Places.tsx`; `WorkSpace.tsx`.

## Remaining obligations

- Every applied event reads the archived list once more while a project is open; a filter on the two archive event
  types can follow once the fixture's events carry a type.
- Until the archived list's first read lands, an admin's menu still offers Archive, as the line is still absent then.
- The archive state still comes from the archived list; «Decouple archive status from the capped list» and the other
  #368 items stay on the follow-up list. `useIsArchived` is the one place that would change.
- The `useProjectRoom.ts` length error above, on main, for whoever owns that file.
- The branch was cut from `origin/main` `b89a5a962`; nothing was merged forward.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository,
  `evaluacion-2026-10-16/seguimientos-p2.md` and `docs/plans/archive-project.md`.
