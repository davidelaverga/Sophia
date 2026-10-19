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
Ending commit/tree: `19b9b2dbc5cc` (tree `d492d2249236`), the last commit of this branch's own that changes code, after
review round 1 (the next one updates only this record). Files changed against `f7d2fe7c0`: `e2e/home-since.spec.ts`,
`e2e/room-updates.spec.ts`, `fixtures/fixture-api.ts`, `fixtures/home.tsx`, `fixtures/meeting-data.ts`,
`fixtures/room.tsx`, `src/app/SignedIn.tsx`, `src/app/attention.test.ts`, `src/features/personal/Places.tsx`,
`src/features/personal/Welcome.tsx`, `src/features/personal/personal.css`, `src/features/personal/places-view.test.ts`,
`src/features/personal/places-view.ts`, `src/features/personal/useSinceNews.ts`,
`src/features/updates/UpdatesView.tsx`, `src/features/updates/since-said.test.ts`,
`src/features/updates/since-said.ts`, `docs/plans/home-since-you-looked.md`, and this record.

## Outcome

- Where Updates is served (the vision or the attention flag), Home reads A34's window for the three projects it
  shows. Where one holds news since the person last marked it seen, Sophia's sentence under the greeting fills the
  place #467 holds: «Since you last looked: 2 decisions and a new report in **Launch plan**. Open Updates».
  - Counts are summed across those projects. The one with the most is named, then «and 2 more projects».
  - Open Updates opens that project at Updates.
  - Before, Home read nothing of what changed and, since #467, said nothing.
- **Only what someone else did** (review round 1). The decision the person took, the report they asked for and a note
  kept in their name (Sophia's in their turn too) are never news to them. A decision they proposed and another took
  still is.
- **Once per line**, per project, account and device. A line is never said again once Home said it, Updates showed it,
  or it was in the window when the person's call there ended. One more decision is said alone: «a decision».
- **As a visit begins, or not at all.** Home says the windows read before the arrival, from its first frame. Nothing
  under the greeting moves while Home stays open, and nothing comes mid-visit, after a call or a passing session. A
  page's first arrival reads and says nothing; the next says it.
- What says nothing: a window after a seen mark that holds nothing new, a window never marked seen (everything so far),
  and one with only proposals or tasks. The call, a session soon and a live room keep their priority; news they cover
  waits for a later arrival.
- The news is a polite status, mounted all along in her sentence's held place, and never takes the focus.
- The request budget:
  - Home: one read per shown project, kept 20 s (the projects' own interval), only while Home is the place arrived
    at, never during a call, never polled or retried.
  - A call's end: one read of that call's project.
  - None at all without either flag.

## Evidence

- Plan: `docs/plans/home-since-you-looked.md`, committed before the tests (`cfbdb7ab2`; round 1 `1ee013b67`).
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
- Green through the guard at `d11eab279` (round 0): Home specs 77/77, the Places and style specs 187/187, Updates and
  the app page 80/80, `e2e-attention` 5/5.
- **Review round 1** (one P1, three P2; all four verified in the code and fixed):
  - **P1, Home told the person what they did themselves.** A34's window is every line after the mark; `0066` leaves out
    only what is private to someone else, never the reader's own. Deciding in a project and coming back to Home said
    «Since you last looked: a decision…», and a call ended with Home open said it at once.
  - **P2, the news moved what is under the greeting.** It came one read after the rows, 24 px under «You and Sophia».
    It also came mid-visit, after a call ended with Home open or a covering sentence went.
  - **P2, nothing tested that opening Updates ends it.**
  - **P2, the jump #467 had removed.** The same cause as the second, measured by the same offsets.
  - Written first (`b354ea6e2`):
    - `places-view.test.ts`: «a window whose only lines are the reader’s says nothing» fails with `actual: [ { text:
      'Since you last looked: a decision, a new report and a note kept in ' }, …]`, `expected: []` (36 of 37 pass).
    - `since-said.test.ts`: «does not provide an export named 'freshIn'».
    - `attention.test.ts`: the new signature isn't there («did not match /\{ here, inCall, covered, enabled =
      SINCE_SHOWN \}: SinceOptions/»).
  - The browser red run (log `pw-logs/home-since-r1-red.txt`): 6 failed, 10 passed.
    - The first arrival said it after the rows were drawn: «Expected: ""», «Received: "Since you last looked: 2
      decisions and a new report in Launch plan. Open Updates"».
    - Said once already: «Expected: "Since you last looked: 2 decisions and…"», «Received: ""».
    - The reader's own lines were counted: «Expected: "Since you last looked: a decision in Launch plan. Open Updates"»,
      «Received: ""», since the first arrival had said all four.
    - A call ended with Home open, and a session that passed with Home open, both brought the news in at once:
      `locator('.hw-says')` «Expected: 0», «Received: 1». The page snapshots show the element is the news itself
      («Since you last looked: 2 decisions and a new report in…»).
    - Updates' memory: «Expected substring: "d:00000000-0000-4000-8000-0000000000da"», «Received string:
      "never:1.0.0"».
  - Fixed at `19b9b2dbc`. The fix commit also moves one test helper (`token`) to the outer scope in
    `since-said.test.ts`, which lint asked for; no assertion changed.
  - **Control mutants**, applied for one run each and restored:
    - Updates' write removed: «keeps the lines it shows…» fails with «Received has value: null»
      (`pw-logs/home-since-r1-mutant-updates.txt`).
    - The call's read made a no-op: «a call ended with Home open…» fails with «Expected: ""», «Received: "Since you
      last looked: 2 decisions and a new report in Launch plan. Open Updates"» (`pw-logs/home-since-r1-mutant-call.txt`).
- Green through the guard at `19b9b2dbc`:
  - `home-since`, `home`, `home-first-glance`, `home-invited`, `home-needs-refusal`, `home-needs`, `home-no-companion`,
    `home-phone-needs`, `next-ask-places`: 79/79.
  - `personal`, `spaces-honest`, `spaces-companion`, `type-scale`, `micro-type`, `light-mode`, `phone-fits`, `states`,
    `control-heights`, `focus-visible`: 187/187.
  - `room-updates`, `updates-digest`, `updates-narrow`, `updates-quiet`, `updates-refusal`, and the app page's
    `app-auth`, `profile-editor`, `signed-in-later`, `skip-link`, `new-version` (`SignedIn` changed): 96/96.
  - `e2e-attention` (attention flag, no vision): 5/5. The config's second server uses POSIX `VAR=x cmd`, which cmd.exe
    can't start, so it ran from a throwaway copy using `set VAR=x&& cmd`, deleted after. Its 8 unexpected-request
    lines are `GET /api/v1/me/invitations` and `GET /api/v1/personal`, as in round 0, never `/since`.
- Unit: since-said 7/7, places-view 37/37. The Studio suite passes 1847/1849; the two failures are the Windows path
  ones (`attention.test.ts`, `browser-imports.test.ts`). The attention guard's readers list differs only by its
  separators (`app\\SignedIn.tsx` against `app/SignedIn.tsx`): the same five files.
- Prettier on every touched non-docs file, whole-repo `oxlint --type-aware` (0 warnings, 0 errors, 1367 files) and
  `tsc --noEmit -p apps/studio`: clean.
- Captures, from a throwaway spec (deleted), at 1280×800 dark and 390×844 light: `quiet&since=some` on its first
  arrival, then on the next, then after a call ended with Home open. They are in the session's scratchpad
  `seams-home-since-you-looked/r1-*.png`, with `r1-*.json`.
  - No horizontal overflow on the page or in Home's scroller (`.c-home`), 0 px each. Two inner boxes measure the same
    with and without the news (`.hw-col` 12 px; `.hw` 74 px on the phone), so the news doesn't cause them.
  - The first arrival is drawn and read at the same offsets: «You and Sophia» 222 px (desk) and 206 px (phone), the
    held status 24 px.
  - The next arrival has the news in its first frame and after its reads, unchanged: the status 48 px, «You and
    Sophia» 246 px and 230 px.
  - A call ended with Home open, then the next arrival: 222 px and 206 px, nothing said.

## Decisions and changes

- **«Once» is per line.** Round 0 keyed it by where a window starts and what it counts, not by its `toSequence`.
  - A34 pins `toSequence` to the project's newest event (`0066_project_updates.sql`), and room events
    (`room.lobby_changed`, `room.input_floor_changed`…) are project events too. Keyed by it, the same «2 decisions»
    would come back after any call, and right after reading them in Updates.
  - Round 1 keeps each project's lines (`d:`, `m:`, `n:` and their ids) as last said, shown or seen, one window per
    project. A count is only what is new to the person, and their own lines never count.
- **Their own lines, by A34's names.** A34 names the person behind each line: `decidedBy`, `askedBy`, `noted.actorId`.
  The API's actor is the token's subject, lowered (`apps/api/src/auth.ts:70`), and the Studio already reads the viewer
  that way (`ServedWork.tsx`). `proposedBy` alone doesn't make a decision theirs: someone else took it.
- **A call's end reads once and keeps its window** (`useCallSeen`, inside `SignedIn`'s `useCall`, wherever the person
  is). What was decided, made and kept by then was in front of them, in the room or its recap. Its price: a line from
  before the call that was never said isn't said after it (Updates still lists it).
- **A visit decides as it begins.** That was the reviewer's option «only if fixed before the rows are drawn, else the
  next arrival, unremembered». «You and Sophia» is a press even while the space loads (`youDoor` gives «Open»), so
  anything said after a cold arrival's reads would move it. The other options weighed (the note's limits):
  - holding what is under the greeting for the windows;
  - reserving two lines on every quiet Home;
  - keeping the projects longer, so rows could reorder on the way back.
- **A window never marked seen says nothing.** A34's mark moves only through Mark as seen. With `fromSequence: null`
  the window is everything so far, and Updates says so («You haven’t looked before»). «Since you last looked: 40
  decisions» would be the kind of claim #467 removed.
- **It names what was decided, made and kept.** These are the three a recap says it holds. Proposals still open and
  tasks that moved stay in Updates; a decision waiting on the person is A15's need on Home already. With `more`, it
  adds «and more».
- **The name is the strong part and isn't quoted**, as in Home's other three sentences. The report's quotes are a
  report's way to mark it.
- **Opening Updates ends it.** `DigestBody` keeps the lines of the window it shows, so Home doesn't then tell the person
  what they just read. Mark as seen moves the mark, and the next window holds only new lines.
- **The status is mounted all along.** It is the first cut's held line, now a `role=status` paragraph. Only the news
  goes into it. The other sentences stay outside it, since a countdown said every minute would be noise.
- **Levers.**
  - `home.html?since=some|more|mine|seen` answers A34 from `updatesWindowOf`. Launch plan holds the news because
    `quiet` puts Product launch fourth, so Home doesn't show it. Product launch holds a note kept, to prove it isn't
    read.
  - `mine` holds the reader's own lines and one of Marco's. The page's token names a reader, and
    `homeFixture.hangUp()` ends `call=<id>` with Home open.
  - The room page's `fixture.saidSince()` reads what Updates kept.
  - The app's fixture API answers `/since` with an empty window (`nothingSince`) for a project without a meeting, so
    Home's read on `app.html` is no unexpected request.

## Remaining obligations

- The limits in the note:
  - A cold arrival (a page's first, or a return after more than 5 min in a project) says nothing; the next arrival does.
  - Covered mid-visit by a session nearing or a room filling, the news gives way, and what is under it moves up a line
    once.
  - A colleague's line while the person had the project open without a call is news to them.
  - The project's name may break across the two lines.
  - Someone who never pressed Mark as seen hears nothing.
  - Home says less than Updates lists.
  - The memory is this device's (their own lines are never said anywhere).
- `e2e-attention` needs the POSIX shell its config assumes; locally it ran only through a throwaway copy. CI is the run
  on record, as is `e2e-served` (real API), which wasn't run here, and the attention guard's readers list, which fails
  on Windows only on its separators.

## Next bounded action

- Luis: say when to push (after #467); then merge on green with no open P1.
- Next step, the arrival line inside a project. It goes under the bar, where a newcomer's welcome goes: «Since you last
  looked: 2 decisions and a new report. Open Updates», `role=status`, with the same news and memory (`since-said.ts`:
  `freshIn`, `unsaid`, `linesOf`, `readSaid`, `rememberSaid`). It was left out of this PR for three reasons:
  - Its lever `room.html?demo=1` holds no seen mark (`newMeeting`'s `seen.sequence` is null), so it would say nothing.
    Giving it one changes the demo's Updates lead, which `room-updates.spec.ts` asserts. A `seen=` lever on the room
    fixture is the clean way.
  - It is a second surface, with one read on every project open.
  - One concern per PR, given the bottleneck.
- Source IDs consulted: none from the source register; the work read this repository and costuras.md only.

## Codex P2 on #468: a failed post-call read

- Source: Codex P2 on #468 (`useSinceNews.ts:126`), not a P1. Luis 2026-10-18: «Todo trabajo nuevo que hagas ten en
  cuenta nuestro cuello de botella actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero
  hay que seguir trabajando».
- Worktree and range: `D:\Descargas\SophiaV4\Sophia-paper-9`, branch `home/call-seen-retry` from `origin/group/seams-4`
  `e7940b963` (#468, open). The ending code commit is `2629a4117fd6` (tree `87654c5be08e`); the next commit updates
  only the note and this record. Local only, nothing pushed.
- Files: `src/features/updates/since-said.ts`, `src/features/personal/useSinceNews.ts`, `fixtures/home.tsx` (the
  `sinceFail=1` lever), `src/features/updates/since-said.test.ts`, `e2e/home-since.spec.ts`,
  `docs/plans/home-since-you-looked.md` (its own section), and this record.
- **Outcome.** A call's end marks its project pending (per account on this device, `sophia.since.pending.v1.<account>`;
  for the page's life where storage refuses) before the read. While it is pending, Home says nothing of it. The first
  window read that takes is kept whole as said, and the mark goes. That read can be the call's own, its retry when the
  browser is `online` again, or Home's read as a visit begins. There is no timer and no polling.
  - Before: a failed read was dropped (`.catch(() => undefined)`), and the next arrival after Home read that window
    said «Since you last looked: 2 decisions and a new report in Launch plan».
- **Evidence.**
  - Note committed first (`0bc9a7e29`). Tests alone, failing (`d8d071c29`):
    - `since-said.test.ts`: «does not provide an export named 'markPending'».
    - `home-since.spec.ts` (log `pw-logs/call-seen-retry-red.txt`): 2 failed, 5 passed.
      - Home open: the second arrival after the failed read said «Since you last looked: 2 decisions and a new report in
        Launch plan. Open Updates» where `""` was expected (line 141).
      - Home out of sight: the `online` event read nothing again. The reads expected `[id1, id1]`, and there was one
        (line 157).
  - Fix `2629a4117`. Unit since-said 9/9, places-view and attention 42/43; the one failure is attention's Windows
    separators. The Studio suite passes 1889/1891, the two Windows path ones.
  - Green through the guard at `2629a4117`: `home-since`, `home`, `app-auth` 71/71 (`pw-logs/call-seen-retry-green.txt`).
  - **Control mutants**, each for one run and restored:
    - Unit: `unsaid` ignoring the pending list fails 1 (the pending project is said). `settlePending` keeping nothing
      fails 2 (`{}` where the call's lines were expected).
    - Browser, a throwaway detached commit `9fc09307d`, now unreachable (`pw-logs/call-seen-retry-mutant.txt`). Home's
      read doesn't settle and the `online` listener is gone: both new checks fail.
      - Home open never says the one later decision («Received: ""»), since the project stays pending.
      - Out of Home, there is no read again.
  - Whole-repo `oxlint --type-aware` (0 diagnostics, 1371 files), `tsc --noEmit -p apps/studio` and Prettier on the
    touched non-docs files are clean.
- **Decisions.**
  - Per device, not per tab: a reload or a tab closed after the failure keeps the mark.
  - The settle lives in the one read that Home, the call's end and the retry share (`readOf`), so whichever takes
    first counts.
  - Only a fresh read settles, never a window cached from before the call. While pending, a visit leaves that project
    out (`unsaid`'s `pending`), whatever the page holds.
  - The retry is the browser's `online` event plus Home's own reads. TanStack already holds a read while the browser
    knows it is offline (`networkMode: 'online'`), so what is lost is a read that fails: a 503, a request cut, a network
    the browser still calls online.
- **Remaining.**
  - The note's two limits: a project the person can't read any more stays pending (one failed read per `online`
    event), and Updates opened on a pending project doesn't end the wait.
  - CI is the run on record. `e2e-attention` and `e2e-served` weren't run here.
- **Next bounded action.** Luis says whether this goes onto #468's branch or into its own PR once #468 merges. It is
  pushed only on his word, and merges on green with no open P1.

## Review of the fix: a pending project Home doesn't show

- Source: a P2 from the review of `2629a4117` (`useSinceNews.ts:151`), verified in the code. Only `online` and Home's
  own read (its three rows, `homeShown`) ended a wait. So a call in a project outside those rows, ended on a 503 with
  the browser still online, waited until the project entered Home's rows. That first read was then kept whole as the
  call's, and what others did there meanwhile was never said on Home.
- Commits, same branch and worktree, local only:
  - `2e3a92852`: note.
  - `a618458ba`: test, failing.
  - `86c2b2e27`: fix.
  - `d55724523`: second test, failing.
  - `c9aaec65b`: second fix.
  - `9f64318ab`: the attention guard's pattern.
  - Then this record. The ending code commit is `9f64318ab179` (tree `2294289b0eb5`).
- **Outcome** (`useSinceNews.ts` `usePendingReads`; `Places.tsx` and `fixtures/home.tsx` pass `theirs`): each arrival
  on Home, once its rows are known, reads once each pending project that is among the person's projects but not among
  Home's rows, and again if those rows change while Home is open. Its conditions are Home's own: on Home, under the
  flags, out of a call. There is no timer and no polling, and most arrivals read nothing more. A project the person no
  longer has is left to `online`, so an arrival never sends a read the service would refuse.
- **Evidence.**
  - Red at `a618458ba` (`pw-logs/call-seen-arrival-red.txt`): 1 failed, 7 passed. At line 176, the arrival read Product
    launch once, the failed read, where two reads were expected.
  - The same check with its read counts taken out, on a throwaway detached commit `b86f2b00c`, now unreachable
    (`pw-logs/call-seen-arrival-red-harm.txt`), failed at the harm itself: «Received: ""» where «Since you last looked:
    a note kept in Product launch. Open Updates» was expected.
  - Red at `d55724523` (`pw-logs/call-seen-theirs-red.txt`): 1 failed, 8 passed. At line 202, a project the person
    was removed from was read twice where once was expected.
  - Green through the guard at `86c2b2e27`: 72/72. At `9f64318ab`: `home-since`, `home`, `app-auth` 73/73
    (`pw-logs/call-seen-theirs-green.txt`).
  - The Studio unit suite passes 1889/1891. The two failures are the known Windows path ones (`app/attention.test.ts`'s
    first case, `features/conversations/browser-imports.test.ts`).
  - Whole-repo `oxlint --type-aware` (0 diagnostics, 1371 files), `tsc --noEmit -p apps/studio` and Prettier on the
    touched non-docs files are clean.
- **Decisions.**
  - No read on mount or on `visibilitychange`. It would end a wait a little sooner when the person lands elsewhere, at
    the cost of a third read path.
  - No new unit, because the change is which reads an arrival starts. `since-said.ts` is untouched.
  - The arrival's read leaves Home's rows to Home's own read, so a project is read once per arrival.
- **Remaining.**
  - `c9aaec65b` alone fails the attention guard's pattern on any OS. The next commit, `9f64318ab`, names `theirs` in it;
    history is never rewritten here.
  - The note's limits stand. A wait keeps, along with the call's lines, what others did until the first read that
    takes, because A34 gives a report no time. A project the person can't read any more costs one failed read per
    `online` event. Updates opened on a pending project doesn't end the wait.
  - CI is the run on record. `e2e-attention` and `e2e-served` weren't run here.
