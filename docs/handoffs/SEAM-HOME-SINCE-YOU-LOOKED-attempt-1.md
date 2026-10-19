# Implementation-session handoff

Goal and attempt: SEAM-HOME-SINCE-YOU-LOOKED (costuras.md seam #7, the full seam after its first cut #467,
2026-10-18; Luis 2026-10-18: «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede
hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-7`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-7`, branch `seams/home-since-you-looked` from
`seams/home-no-false-claim` (#467, open) with `origin/main` `e395d63ea` merged on top (`f7d2fe7c0`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API (A34 is served).
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-18, the quote above; local only, nothing pushed; merges on green with no open P1 once
pushed. It stacks on #467, which merges first.
Ending commit/tree: `d11eab279bfa` (tree `8d0738a6d4e0`), the last commit of this branch's own that changes code (the
next one updates only the note and adds this record). Files changed against `f7d2fe7c0`: `e2e/home-since.spec.ts`,
`fixtures/fixture-api.ts`, `fixtures/home.tsx`, `fixtures/meeting-data.ts`, `src/app/attention.test.ts`,
`src/features/personal/Places.tsx`, `src/features/personal/Welcome.tsx`, `src/features/personal/personal.css`,
`src/features/personal/places-view.test.ts`, `src/features/personal/places-view.ts`,
`src/features/personal/useSinceNews.ts`, `src/features/updates/UpdatesView.tsx`,
`src/features/updates/since-said.test.ts`, `src/features/updates/since-said.ts`, `docs/plans/home-since-you-looked.md`,
and this record.

## Outcome

- Where Updates is served (the vision or the attention flag), Home reads A34's window for the three projects it
  shows. Where one holds news since the person last marked it seen, Sophia's sentence under the greeting fills the
  place #467 holds: «Since you last looked: 2 decisions and a new report in **Launch plan**. Open Updates».
  - Counts are summed across those projects. The one with the most is named, then «and 2 more projects».
  - Open Updates opens that project at Updates.
  - Before, Home read nothing of what changed and, since #467, said nothing.
- Once per window, project, account and device. The line isn't said again on the way back to Home, after a reload, or
  after Updates showed that window. A new decision is news again.
- What says nothing: a window after a seen mark that holds nothing, a window never marked seen (everything so far),
  and one with only proposals or tasks. The call, a session soon and a live room keep their priority; news they cover
  waits for a later arrival.
- The news is a polite status, mounted all along in her sentence's held place, and never takes the focus.
- The request budget: one read per shown project, kept 20 s (the projects' own interval). Reads happen only while Home
  is the place arrived at, never during a call, never polled or retried, and none at all without either flag.

## Evidence

- Plan: `docs/plans/home-since-you-looked.md`, committed before the tests (`cfbdb7ab2`).
- **Written first and failing** (`c2ce9e3be`):
  - `places-view.test.ts`: the three new cases that expect a line fail on it, e.g. `actual: ''`, `expected: 'Since you
    last looked: 2 decisions and a new report in Launch plan. Open Updates'` (33 of 36 pass; the two cases that
    expect nothing already hold).
  - `since-said.test.ts`: `ERR_MODULE_NOT_FOUND` for `since-said.ts`, the new module.
  - `home-since.spec.ts` (log `pw-logs/home-since-red.txt`, 3 failed). The status line is missing («Expected: "Since you
    last looked: 2 decisions and a new report in Launch plan. Open Updates"», «element(s) not found»), and nothing is
    read («Expected length: 3», «Received length: 0»).
- **One spec change after the red run, in the fix commit:** the fixture page runs under StrictMode. Its second mount
  reads again what the first let go, since the reads pass their abort signal, and the first green run saw 6 reads for
  3 projects. The spec now counts the projects asked (`asked`), and raw reads only between two moments. The red
  assertions stand as they failed.
- Green through the guard at `d11eab279`:
  - `home-since`, `home`, `home-first-glance`, `home-invited`, `home-needs-refusal`, `home-needs`, `home-no-companion`,
    `home-phone-needs`, `next-ask-places`: 77/77.
  - `personal`, `spaces-honest`, `spaces-companion`, `type-scale`, `micro-type`, `light-mode`, `phone-fits`, `states`,
    `control-heights`, `focus-visible`: 187/187.
  - `room-updates`, `updates-digest`, `updates-narrow`, `updates-quiet`, `updates-refusal`, `app-auth`,
    `profile-editor`: 80/80.
  - `e2e-attention` (attention flag, no vision): 5/5. The config's second server uses POSIX `VAR=x cmd`, which cmd.exe
    can't start, so it ran from a throwaway copy using `set VAR=x&& cmd`, deleted after. Its 8 unexpected-request
    lines are `GET /api/v1/me/invitations` and `GET /api/v1/personal`, never `/since`.
- Unit: places-view 36/36 and since-said 5/5. The Studio suite passes 1843/1845; the two failures are the Windows path
  ones (`attention.test.ts`, `browser-imports.test.ts`).
- The attention guard on Windows fails only on its path separators. Its readers list, computed with `/` as a Linux
  runner gives it, is exactly the new expected one (`app/SignedIn.tsx`, `features/personal/useNeeds.ts`,
  `features/personal/useSinceNews.ts`, `features/studio/ProjectShell.tsx`, `features/studio/ViewNav.tsx`).
- Prettier on every touched non-docs file, whole-repo `oxlint --type-aware` (0 warnings, 0 errors, 1367 files) and
  `tsc --noEmit -p apps/studio`: clean.
- Captures (throwaway spec, deleted) at 1280×800 dark and 390×844 light, quiet then `since=some`, in the session's
  scratchpad `seams-home-since-you-looked/` (`*-quiet.png`, `*-since.png`, `*-since-focus.png`, `*.json`):
  - No horizontal overflow on the page or in Home's scroller (0 px each).
  - The held status is 24 px, the news 48 px (two lines at a desk and on a phone).
  - «You and Sophia» sits at 222 → 246 px (desk) and 206 → 230 px (phone).
  - Open Updates is 16 px and 24 px high, `rgb(185, 168, 255)` dark and `rgb(85, 70, 184)` light, with the kit's
    focus ring.

## Decisions and changes

- **«Once» is keyed by where the window starts and what it counts, not by its `toSequence`.** That differs from the
  report. A34 pins `toSequence` to the project's newest event (`0066_project_updates.sql`), and room events
  (`room.lobby_changed`, `room.input_floor_changed`…) are project events too. Keyed by it, the same «2 decisions»
  would come back after any call, and right after reading them in Updates.
- **A window never marked seen says nothing.** A34's mark moves only through Mark as seen. With `fromSequence: null`
  the window is everything so far, and Updates says so («You haven’t looked before»). «Since you last looked: 40
  decisions» would be the kind of claim #467 removed.
- **It names what was decided, made and kept.** These are the three a recap says it holds. Proposals still open and
  tasks that moved stay in Updates; a decision waiting on the person is A15's need on Home already. With
  `more`, it adds «and more».
- **The name is the strong part and isn't quoted**, as in Home's other three sentences. The report's quotes are a
  report's way to mark it.
- **A visit's news is fixed once its reads settle.** Nothing comes or goes while Home stays open. It is remembered
  only once her sentence says it, so news covered by a call, a session soon or a room isn't lost.
- **Opening Updates ends it.** `DigestBody` remembers the window it shows, so Home doesn't then tell the person what they
  just read. Mark as seen moves the mark, and the next window holds nothing to say.
- **The status is mounted all along.** It is the first cut's held line, now a `role=status` paragraph. Only the news
  goes into it. The other sentences stay outside it, since a countdown said every minute would be noise.
- **Levers.** `home.html?since=some|more|seen` answers A34 from `updatesWindowOf`. Launch plan holds the news because
  `quiet` puts Product launch fourth, so Home doesn't show it. Product launch holds a note kept, to prove it isn't read.
  The app's fixture API answers `/since` with an empty window (`nothingSince`) for a project without a meeting, so
  Home's read on `app.html` is no unexpected request.

## Remaining obligations

- The limits in the note:
  - The rows move down 24 px once, on the arrival that says it.
  - A row that comes into the three mid-visit is read then and said on the next arrival.
  - The project's name may break across the two lines.
  - Someone who never pressed Mark as seen hears nothing.
  - The memory is this device's.
- `e2e-attention` needs the POSIX shell its config assumes; locally it ran only through a throwaway copy. CI is the run
  on record, as is `e2e-served` (real API), which wasn't run here.

## Next bounded action

- Luis: say when to push (after #467); then merge on green with no open P1.
- Next step, the arrival line inside a project. It goes under the bar, where a newcomer's welcome goes: «Since you last
  looked: 2 decisions and a new report. Open Updates», `role=status`, with the same news and memory (`since-said.ts`:
  `newsOf`, `newsKey`, `unsaid`, `rememberSaid`). It was left out of this PR for three reasons:
  - Its lever `room.html?demo=1` holds no seen mark (`newMeeting`'s `seen.sequence` is null), so it would say nothing.
    Giving it one changes the demo's Updates lead, which `room-updates.spec.ts` asserts. A `seen=` lever on the room
    fixture is the clean way.
  - It is a second surface, with one read on every project open.
  - One concern per PR, given the bottleneck.
- Source IDs consulted: none from the source register; the work read this repository and costuras.md only.
