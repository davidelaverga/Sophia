# Implementation-session handoff

Goal and attempt: SEAM-HOME-NO-FALSE-CLAIM (costuras.md seam #7, first cut, 2026-10-18; Luis 2026-10-18: «Que sigue>»
after «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en un pr,
excelente o como veas, que alivie la presión pero hay que seguir trabajando»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-6`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-6`, branch `seams/home-no-false-claim` from `origin/main`
(`2e151c934`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-18, «Que sigue>»; local only, nothing pushed; merges on green with no open P1 once
pushed.
Ending commit/tree: `a8d78cd916c7` (tree `1f3018bd5d12`), the last commit of `seams/home-no-false-claim`'s own that
changes code (the next one adds only this record). 5 files changed against `2e151c934` at that commit:
`e2e/home.spec.ts`, `fixtures/home.tsx`, `src/features/personal/places-view.test.ts`,
`src/features/personal/places-view.ts`, `docs/plans/home-no-false-claim.md`.

## Outcome

- With no call, no session within 10 min and nobody in a room, Sophia's sentence under Home's greeting now says
  nothing. Before, it said «Your projects are as you left them.» on every return. Home reads nothing that could back
  that: `ProjectSummary` has no field for changes, and the since read (`getSince`) has one caller, Updates.
- The call, the session soon, the live room and the invitation with no projects keep their words.
- Quiet projects now arrive without moving anything. «You and Sophia» and the rows stay where they sit while the
  projects load (on main they dropped 46 px when the claim arrived). The greeting itself never moved.

## Evidence

- Written first (commit `d94bd77e6`):
  - `places-view.test.ts` fails with `actual: [ { text: 'Your projects are as you left them.' } ], expected: []`.
  - `home.spec.ts` «nothing soon and nobody in a room: Sophia claims nothing she hasn’t read» fails on
    `getByText('Your projects are as you left them.')`, Expected 0, Received 1.
  - «quiet projects come without moving the greeting or «You and Sophia»» fails with Expected `[34, 222]`, Received
    `[34, 176]` (offsets of the greeting and of «You and Sophia», quiet against loading).
  - The other 23 tests of `home.spec.ts` pass there.
- Playwright through `safe-run.ps1`, two workers, at the fix (`a8d78cd91`):
  - home, home-first-glance, home-needs, home-phone-needs, home-no-companion, home-invited, home-needs-refusal and
    next-ask-places: 74/74.
  - The specs that open Home through Places (personal, spaces-honest, spaces-companion, type-scale, micro-type,
    light-mode, phone-fits, states): 162/162.
- Unit: places-view 31/31. The Studio suite passes 1770/1772. The two failures are the Windows path ones on main
  (`attention.test.ts`, `browser-imports.test.ts`).
- Prettier on every touched non-docs file, whole-repo `oxlint --type-aware` (0 warnings, 0 errors, 1354 files) and
  `tsc --noEmit -p apps/studio` are clean.
- Captures at 1280×800 dark and 390×844 light, of `quiet` beside `four` and `loading`, are in the session's scratchpad
  `seams-home-no-false-claim/`. No horizontal overflow on the page or in Home's scroller (0 px each). «You and
  Sophia» sits at 176 px (desk) and 160 px (phone) for both quiet and loading, against 222 px and 206 px under a
  sentence.

## Decisions and changes

- **Nothing, not another line.** Each existing line says something true about what Home read, and none fits quiet
  projects. A new sentence would be a new claim. Saying nothing is the state Home already draws while the projects
  load or when their read fails.
- **A new lever, `home.html?projects=quiet`.** The report says `?projects=four` reproduces the claim. In today's code it
  doesn't: `four`'s Standup starts in 10 min, so it shows «Standup in Product launch starts in 10 min.», and
  `home.spec.ts` asserts that. `quiet` holds the same four projects with the Standup tomorrow.
- The greeting's own checks run on `four` and stay as they are. The new layout check compares quiet with loading by
  layout offsets (`offsetTop`), not painted boxes, so the words still rising in can't decide it.

## Remaining obligations

- The line now arrives into an empty place. If a session comes within 10 min, or someone enters a room, while Home is
  open, what's under the greeting moves down 46 px. Before, the claim held that place. Keeping an empty place would
  leave a gap on every quiet Home and on loading (the plan's limits).
- `docs/plans/home-welcome.md` still lists the old sentence as that design's record. The new note supersedes it.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Next step, the full seam #7 (effort M, the report's own estimate):
  - Home reads the since window (A34, `getSince`) for each project it shows. Today only Updates reads it, and only
    where the vision or attention flag shows Updates.
  - Where a window holds news, Sophia's sentence takes the place this cut emptied: «Since you last looked: 2 decisions
    and a new report in “Product launch”. Open Updates». It is said once per window (`toSequence`) per project,
    account and device. It goes with Mark as seen or with opening Updates. An empty window («Nothing new since you
    last looked.») says nothing.
  - Inside a project, an arrival line goes under the bar, where a newcomer's welcome goes, with Open Updates.
  - Never during a call: the call has its own sentence and Catch up.
  - Levers: `room.html?demo=1` for the arrival (its digest lists the finished readout and the brief's decision), and a
    new `home.html?since=some` that answers `/api/v1/projects/{id}/since` from the fixture's `updatesWindowOf`
    (`fixtures/meeting-data.ts`).
- Source IDs consulted: none from the source register; the work read this repository and costuras.md only.
