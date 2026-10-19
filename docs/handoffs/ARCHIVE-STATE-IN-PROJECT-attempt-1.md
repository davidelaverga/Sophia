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
Ending commit/tree: `1a383d03b874` (tree `e80ab08e4ed8`), the last commit that changes code, after the review round
below; the next one updates only the note and this record. 8 files changed against `b89a5a962`. One branch, one PR
when Luis says. A dry-run merge with #468 (`group/seams-4`, `git merge-tree`) is clean.

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
- **Filtered on `project.*` (after the review, below):** the API's events say `project.archived` /
  `project.unarchived`, and every fixture event says `project.updated` (`fixtures/data.ts`'s `projectEvent`, sent by
  `fixture-api.ts`, which belongs to the mute-all branch and stays untouched). A burst holding a `project.*` event
  invalidates `['projects', identity, 'archived']` (exact) in the same 120 ms debounced timer as the snapshot; room,
  chat and lobby events don't. `invalidateQueries` reads again only an observed list; inside a project the line
  observes it.
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

- A burst holding any `project.*` event (renames, joins, leaves and role changes too, all rare) reads the archived
  list once more; a filter on the two archive types alone can follow once the fixture sends them.
- An archive inside a feed gap (resync from a snapshot) reaches the line with the next project event, or on focus
  after the list's 30 s `staleTime`.
- Until the archived list's first read lands, an admin's menu still offers Archive, as the line is still absent then.
- The archive state still comes from the archived list; «Decouple archive status from the capped list» and the other
  #368 items stay on the follow-up list. `useIsArchived` is the one place that would change.
- The `useProjectRoom.ts` length error above, on main, for whoever owns that file.
- The branch was cut from `origin/main` `b89a5a962`; nothing was merged forward.

## Review notes

- **Independent review, round 1: one P2.** Answered in one fix commit after a failing one:
  - **P2, every room and chat event re-read the archived list, and that read calls LiveKit (real):**
    `/api/v1/projects/archived` runs `roomsNow` (`apps/api/src/routes/projects.ts`), which asks LiveKit's `listRooms`
    when a listed project has a room, then `listParticipants` for each live one; the snapshot route asks LiveKit
    nothing. So each room, chat or lobby burst in a call cost every viewer that read, the history replay on open read
    it twice, and a burst landing while it was out (up to `ROOM_LOOKUP_MS`, 2.5 s) cancelled it. The record's «one
    small read» and «the fixture's events carry no type» were wrong: they carry `project.updated`.
  - Written first and failing (`4a475bc0e`, which also exports `feedPorts` so the cases can drive it):
    `project-feed-refresh.test.ts` 1 passed, 2 failed, both on `assert.deepEqual`: expected
    `{ snapshot: true, archived: false }`, actual `archived: true`, for «room events read the snapshot again and leave
    the archived list alone» and «once read for a project event, a later burst of room events leaves the archived list
    alone». The passing case (a project event anywhere in a burst reads it) guards the other side.
  - Fixed (`1a383d03b`): `apply` raises `archiveDue` on a `project.*` frame; the debounced refresh invalidates the
    archived list only while it is raised, then lowers it. Nothing on screen changes.
- After the round (`1a383d03b`):
  - `project-feed-refresh.test.ts` 3/3 with `feed-loop.test.ts`; the Studio unit suite 1869/1871, the two failures
    the known Windows ones;
  - e2e through the guard, two workers: `archive-project`, `room-updates`, `room-live-version`, `project-rename`,
    `project-leave`, `unread-title` 47/47, log `pw-logs/archive-state-review-1.txt`;
  - `tsc --noEmit -p apps/studio` and Prettier on the touched non-docs files: clean. Whole-repo `oxlint --type-aware`:
    the same one error on `main` (`useProjectRoom.ts:599`), nothing from this branch.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository,
  `evaluacion-2026-10-16/seguimientos-p2.md` and `docs/plans/archive-project.md`.
