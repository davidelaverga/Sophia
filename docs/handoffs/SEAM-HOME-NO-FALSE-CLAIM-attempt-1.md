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
Ending commit/tree: `6c0ce14f29ac` (tree `657397eb5dcb`), the last commit of `seams/home-no-false-claim`'s own that
changes code, after the first review round (the next one updates only the note and this record). Files changed
against `2e151c934`: `e2e/home.spec.ts`, `fixtures/home.tsx`, `src/features/personal/Welcome.tsx`,
`src/features/personal/personal.css`, `src/features/personal/places-view.test.ts`,
`src/features/personal/places-view.ts`, `docs/plans/home-no-false-claim.md`, and this record.

## Outcome

- With no call, no session within 10 min and nobody in a room, Sophia's sentence under Home's greeting now says
  nothing. Before, it said «Your projects are as you left them.» on every return. Home reads nothing that could back
  that: `ProjectSummary` has no field for changes, and the since read (`getSince`) has one caller, Updates.
- The call, the session soon, the live room and the invitation with no projects keep their words.
- Her sentence's place is held: with nothing to say, one empty line (aria-hidden) stands where the sentence goes. A
  session nearing, someone entering a room or a call ending with Home open fills or empties it, and nothing under the
  greeting moves. The projects' arrival no longer pushes the page down either (on main it dropped 46 px). The greeting
  itself never moved.

## Evidence

- Written first (commit `d94bd77e6`):
  - `places-view.test.ts` fails with `actual: [ { text: 'Your projects are as you left them.' } ], expected: []`.
  - `home.spec.ts` «nothing soon and nobody in a room: Sophia claims nothing she hasn’t read» fails on
    `getByText('Your projects are as you left them.')`, Expected 0, Received 1.
  - «quiet projects come without moving the greeting or «You and Sophia»» fails with Expected `[34, 222]`, Received
    `[34, 176]` (offsets of the greeting and of «You and Sophia», quiet against loading).
  - The other 23 tests of `home.spec.ts` pass there.
- Review round 1 (one P2, verified and fixed): with the place emptied, the sentence coming or going with Home open
  moved everything under the greeting 46 px (Places rereads the projects every 20 s, `usePersonal.ts:179`; its clock
  moves every 20 s, `Places.tsx:117`). Written first (commit `eaf429244`, log `pw-logs/home-held-place-red.txt`, 1
  failed, 24 passed): «Sophia’s sentence keeps its place…» fails at `home.spec.ts:90` with Expected `[34, 176]`,
  Received `[34, 222]`, when the Standup's sentence comes after `quiet` with Home open. Fixed at `6c0ce14f2`.
- Playwright through `safe-run.ps1`, two workers, at the held place (`6c0ce14f2`):
  - home, home-first-glance, home-needs, home-phone-needs, home-no-companion, home-invited, home-needs-refusal and
    next-ask-places: 74/74.
  - The specs that open Home through Places (personal, spaces-honest, spaces-companion, type-scale, micro-type,
    light-mode, phone-fits, states): 162/162.
- Unit: places-view 31/31. The Studio suite passes 1770/1772. The two failures are the Windows path ones on main
  (`attention.test.ts`, `browser-imports.test.ts`).
- Prettier on every touched non-docs file, whole-repo `oxlint --type-aware` (0 warnings, 0 errors, 1354 files) and
  `tsc --noEmit -p apps/studio` are clean.
- Captures at 1280×800 dark and 390×844 light, read in place from `loading` to `quiet` to `four`, are in the
  session's scratchpad `seams-home-no-false-claim/held-*.png` (with `held-*.json`). No horizontal overflow on the page
  or in Home's scroller (0 px each). «You and Sophia» sits at 222 px (desk) and 206 px (phone) in all three; the held
  line is 24 px high. The earlier `home-*.png` there show this branch before the held place.

## Decisions and changes

- **Nothing, not another line.** Each existing line says something true about what Home read, and none fits quiet
  projects. A new sentence would be a new claim. Saying nothing is the state Home already draws while the projects
  load or when their read fails.
- **A new lever, `home.html?projects=quiet`.** The report says `?projects=four` reproduces the claim. In today's code it
  doesn't: `four`'s Standup starts in 10 min, so it shows «Standup in Product launch starts in 10 min.», and
  `home.spec.ts` asserts that. `quiet` holds the same four projects with the Standup tomorrow.
- **The place held, not closed** (review round 1). One empty line where the sentence goes, as `.hw-held` holds the
  line's place (home-no-companion.md). The other way, accepting the movement, would leave a press about to land on
  the line landing on «Continue». The price is a line of air under the greeting on a quiet Home and while loading.
- **A second lever, `homeFixture.reread(set)`.** The projects read again with Home open, as Places does every 20 s, so
  the check sees the sentence come and go where it happens, not across two page loads. It replaces the earlier
  quiet-against-loading check, which it covers.
- The greeting's own checks run on `four` and stay as they are. The layout check compares by layout offsets
  (`offsetTop`), not painted boxes, so the words still rising in can't decide it.

## Remaining obligations

- The held place is a line of air under the greeting on a quiet Home and while loading. A sentence that wraps to two
  lines (a long project's name on a narrow phone) still moves what is below by one line, as on main (the plan's
  limits).
- `docs/plans/home-welcome.md` still lists the old sentence as that design's record. The new note supersedes it.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Next step, the full seam #7 (effort M, the report's own estimate):
  - Home reads the since window (A34, `getSince`) for each project it shows. Today only Updates reads it, and only
    where the vision or attention flag shows Updates.
  - Where a window holds news, Sophia's sentence fills the place this cut holds: «Since you last looked: 2 decisions
    and a new report in “Product launch”. Open Updates». It is said once per window (`toSequence`) per project,
    account and device. It goes with Mark as seen or with opening Updates. An empty window («Nothing new since you
    last looked.») says nothing.
  - Inside a project, an arrival line goes under the bar, where a newcomer's welcome goes, with Open Updates.
  - Never during a call: the call has its own sentence and Catch up.
  - Levers: `room.html?demo=1` for the arrival (its digest lists the finished readout and the brief's decision), and a
    new `home.html?since=some` that answers `/api/v1/projects/{id}/since` from the fixture's `updatesWindowOf`
    (`fixtures/meeting-data.ts`).
- Source IDs consulted: none from the source register; the work read this repository and costuras.md only.
