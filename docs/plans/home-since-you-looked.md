# Home says what changed since you last looked, once

> 2026-10-19 · costuras.md seam #7, the full seam after its first cut (#467, `home-no-false-claim.md`;
> `evaluacion-2026-10-18/experiencia/costuras.md`); Luis 2026-10-18: «Todo trabajo nuevo que hagas ten en cuenta nuestro
> cuello de botella actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir
> trabajando». Studio only, no API: A34 is served. One PR: Home's line; the arrival line in a project is the next step.
> Review round 1 (one P1, three P2) changed what counts as news, what is remembered and when a visit says it: below.
> Codex P2 on #468 keeps a call's project waiting when the read after the call fails: its own section, below, with the
> review of that fix (a waiting project Home doesn't show is read as Home is arrived at).

## What was measured

- After the first cut, `sophiaSays` (`places-view.ts`) says the call you are in, else a session within 10 min, else the
  busiest live room, else nothing, and Sophia's place under the greeting is held by one empty line (`Welcome.tsx`,
  `.hw-says-held`). Home still reads nothing of what changed: `ProjectSummary` has no such field, and `getSince`
  (`api/vision.ts`, A34) has one caller, Updates (`UpdatesView.tsx`, `SinceYouLooked`). A grep confirms it.
- Updates is a project view only under the vision flag (the fixture pages) or the attention flag (A34 served):
  `ProjectShell.tsx` shows `UpdatesView` only `if (VISION || ATTENTION)`. Without either, a press to Updates opens
  «Coming», so Home may only offer Open Updates where one of them is on.
- **The report's «once per window (toSequence)» doesn't hold as written.** A34's `toSequence` is the project's newest
  event, capped 500 past the seen mark (`0066_project_updates.sql`: `latest` is `projects.event_sequence`, `to_value =
  least(latest, from_value + 500)`). The window's events are every event of the project, the room's too
  (`room.lobby_changed`, `room.input_floor_changed`, `room.sophia_presence`…). Keyed by `toSequence`, the same «2
  decisions» would come back after any call, and after opening Updates and coming back to Home.
- **A window with no seen mark is not «since you last looked».** The mark moves only through Mark as seen (A34's
  `why`, «only through this write»), so `fromSequence: null` means the person never marked one, and the window is
  everything so far, up to 500 events. Updates says it in those words: «You haven’t looked before: this is everything so
  far.» (`digestLead`). Counting it on Home would be a claim like the one the first cut removed.
- What a window can name: `decided`, `made` and `noted` (what was decided, made and kept: the three a meeting's recap
  says it holds, `recapText`'s «Nothing was decided, made or kept»), and `open` and `work` (proposals still open, tasks
  that moved). A task's events move it in the window without adding a line (`DISTINCT ON (j.id)`).
- The request budget today: Places reads the projects every 20 s (`usePersonal.ts`, `refetchInterval: 20_000`) and
  is unmounted while a project is open (`SignedIn.tsx`, `!project && <Places …>`). Home shows `HOME_ROWS` = 3 projects.
- The levers: no fixture answered `/since` for Home. `home.html?projects=quiet` puts Product launch fourth, so it is
  not among the rows. The app's fixture page (`app.html`, vision flag on) answers `/since` only for a project with a
  meeting (`fixture-api.ts`, `recordsAnswer`); otherwise the read is an unexpected request.
- The arrival line's lever, `room.html?demo=1`, holds no seen mark (`newMeeting`'s `seen.sequence` is null), so its
  window is «everything so far» and, by the rule above, says nothing; `room-updates.spec.ts` asserts that lead.

### Review round 1, verified against the code

- **P1, Home told the person what they did themselves.** A34's window is every line after the mark; it leaves out only
  what is private to someone else (`0066`: `visibility_owner IS NULL OR visibility_owner=a`), never what the reader did.
  Their decision (`decided_by` is the actor who took it, `0018_mission_ledger.sql:666`), a note Sophia kept in their own
  turn (`mission_entries.actor_id` is the transaction's actor, `0018:279`) and the report they asked for
  (`update_asker`) are all in it. Only Mark as seen moves the mark (`UpdatesView.tsx`, one caller of `markSeen`).
  So deciding in a project, then Home 20 s later, said «Since you last looked: a decision…». A call ending with Home open
  did it at once: the reads ran as `inCall` turned false and the visit was fixed then.
- **P2, the news moved what is under the greeting.** It came one read after the rows (the ids come from the projects),
  two lines where one is held: «You and Sophia» went 222 → 246 px at a desk and 206 → 230 px on a phone, measured in
  round 0. It also came mid-visit: after a call ended with Home open, and when a session soon or a live room that
  covered it went away.
- **P2, nothing tested «opening Updates ends it».** No check read what `DigestBody` writes; `since=seen` is an empty
  window, not a Mark as seen.
- What A34 names to tell them apart: `decidedBy` (and `proposedBy`), `askedBy`, `noted.actorId`. The actor A34 compares
  is the token's subject, lowered (`apps/api/src/auth.ts:70`, `id: payload.sub.toLowerCase()`); the Studio already reads
  the viewer that way (`ServedWork.tsx`, `tokenSubject(identity.token)`).
- What the page keeps: the projects and the windows are queries with the default 5 min of cache once nothing observes
  them (`@tanstack/query-core`, `removable.js`, `3e5`). Places observes them while mounted, so going to Work or Personal
  and back keeps both. A first load, or a return after more than 5 min in a project, reads Home afresh. Nothing under
  the greeting can be drawn after those reads without moving: «You and Sophia» is a press even while the space loads
  (`youDoor` gives «Open»).

## What changes

- **The read** (`useSinceNews.ts`): one `getSince` for each project Home shows, under the vision or attention flag
  only. It is kept 20 s, as fresh as the projects' own read, so an arrival sooner reads nothing again. It is read only
  while Home is the place arrived at, never during a call, never polled, never retried. That is at most 3 reads per
  arrival, and none on most.
- **Only what someone else did** (`since-said.ts`, `freshIn`): a decision they took (`decidedBy`), a report they asked
  for (`askedBy`) and a note kept in their name (`actorId`, Sophia's in their turn too) are never news to them. A
  decision they proposed and someone else took is: it happened without them. A line whose person A34 can't name is
  someone else's.
- **What was said, shown or seen, by line** (`linesOf`, `readSaid`, `rememberSaid`): per account on this device, each
  project keeps the lines of its window the person was told on Home, shown in Updates, or had in front of them when a
  call there ended (`d:<decision>`, `m:<report version>`, `n:<note>`). Each write keeps a project's whole window as read
  then, so the memory is never bigger than one window per project. News is what is in a window and not kept, so the
  count is only what is new to them («a decision», not «3 decisions» of which two were said), and the same line is
  never said twice however far the feed moved. A new mark starts a window of new lines. Kept in `localStorage`
  (`sophia.since.said.v1.<account>`); where storage refuses, for as long as the page lives. Nothing names the account.
- **A call's end** (`useCallSeen`, in `SignedIn`'s `useCall`, which owns the one call, wherever the person is then):
  its project's window is read once and kept. What was decided, made and kept by then was in front of them, in the room or its recap. One read per call, after
  it, never during; one that fails waits for the next read (Codex P2 on #468, below).
- **A visit says it as it begins, or not at all** (`useSinceNews`): a visit begins at each arrival on Home. It says the
  windows this page read before it began, for the projects drawn with it, decided at its first frame and never after.
  So Sophia's sentence is drawn with the news from the first frame, and nothing under the greeting moves while Home
  stays open. A visit says nothing when:
  - it begins in a call, or under another sentence (a session soon, a live room, the first project);
  - its projects aren't known yet;
  - nothing was read before it (the first arrival of a page reads, the next says).
  Its reads then serve the next arrival, and it remembers nothing. A sentence that covers the news mid-visit ends it
  for that visit, so it never comes back with Home open.
- **The words** (`sophiaSays`, a fifth argument): «Since you last looked: 2 decisions and a new report in **Launch
  plan**. Open Updates». Counts are the Studio's (a digit, or «a» for one: «a decision», «a new report», «a note kept»),
  every kind that has any, «and more» when events lie after the window. Across projects the counts are summed, the
  project with the most is named (Work's order breaks a tie), and «and 2 more projects» follows. On Home the project's
  name is the strong part, as in the other three sentences, so it is bold and not quoted as in the report.
- **Open Updates** (a `Said` piece with `updates`, `Welcome`'s `actions.updates`) opens the named project at Updates
  (`onOpenView(projectId, 'updates', {})`).
- **Announced, never taking the focus**: under the greeting, a `role="status"` paragraph is mounted all along. It holds
  the news when that is the sentence, holds her sentence's place when there is none (the first cut's held line, now
  this element), and is empty and 0 px high beside the other sentences, which stay out of it, since a countdown said
  every minute would be noise.
- **Opening Updates ends it** (`UpdatesView.tsx`, `DigestBody`): the window Updates shows is kept, line by line, so Home
  doesn't then say «since you last looked» about what was just read there. Mark as seen moves the mark; the next window
  holds only new lines.
- **Levers**: `home.html?since=some` answers `/api/v1/projects/{id}/since` from `updatesWindowOf`
  (`fixtures/meeting-data.ts`): Launch plan holds 2 decisions and a new report after a seen mark (the fixture's earlier
  decision and a proposal still open among them), Product launch, not shown in `quiet`, holds a note kept, and the others
  hold nothing. `since=more` adds one decision to Launch plan's, `since=mine` holds only the reader's own lines, and
  `since=seen` is every window after a seen mark, empty. The page reads as an account whose token names a reader.
  `homeFixture.sinceReads()` lists the projects asked, and `homeFixture.hangUp()` ends `call=<id>` with Home open. The
  room page's `fixture.saidSince()` reads what this account keeps for its project. The app's fixture API answers `/since`
  with an empty window for a project without a meeting.

## Checks, written first

- **Unit** (`places-view.test.ts`): `sophiaSays` with a window of 2 decided and 1 made returns «Since you last looked: 2
  decisions and a new report in Launch plan. Open Updates», Launch plan strong, Open Updates naming its project. An empty
  window, one never marked seen, and one with only proposals and tasks say nothing. The call, a session soon and a live
  room come first. Several projects give summed counts, the most named, «and 1 more project». Every kind is named,
  and `more` adds «and more». Review round 1: a window whose only lines are the reader's says nothing.
- **Unit** (`since-said.test.ts`): the reader's own lines are no news, a decision they proposed and another took is;
  lines kept for a project are no news there; the memory keeps a project's whole window, per account, and for the page
  when storage refuses; the reader is the token's subject, lowered.
- **Browser** (`home-since.spec.ts`, `home.html?projects=quiet&since=some`):
  - The first arrival reads one window per row (none for Product launch) and says nothing, moving nothing.
  - The next arrival says the line as a status from its first frame: Launch plan strong, the focus not taken, and
    nothing under the greeting moving as its reads come back. Open Updates presses `updates <Launch plan>`.
  - Once: the way back and a reload say nothing; `since=more` says only the new decision.
  - `since=mine` says nothing.
  - A call ended with Home open (`hangUp`) says nothing then or on the next arrival; what came after it is said.
  - A session soon covers it and stays quiet when it passes with Home open; the next arrival says it.
  - `since=seen` says nothing.
- **Browser** (`room-updates.spec.ts`): Updates keeps the lines it shows for its project, and after Mark as seen keeps
  the empty window.
- **Measured once green**: the fixture page runs under StrictMode, whose second mount reads again what the first let go
  (the reads pass their abort signal). The spec therefore counts the projects asked, and raw reads only between two
  moments. A production build mounts once.
- **Measured once green, round 1** (captures at 1280×800 dark and 390×844 light):
  - The first arrival is drawn and read at the same offsets («You and Sophia» 222 px and 206 px).
  - The next arrival has the news in its first frame (status 48 px, «You and Sophia» 246 px and 230 px) and keeps it
    as its reads come back.
  - No horizontal overflow on the page or in Home's scroller.
- **The attention guard** (`app/attention.test.ts`) lists the flag's readers, and now names `useSinceNews.ts` with its
  one use (`const SINCE_SHOWN = VISION || ATTENTION`).

## Codex P2 on #468: a failed post-call read

> Codex P2 on #468 (`useSinceNews.ts:126`), not a P1. Luis 2026-10-18: «Todo trabajo nuevo que hagas ten en cuenta
> nuestro cuello de botella actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que
> seguir trabajando». So it rides on this PR's branch as one small change: two source files and the fixture's lever, no
> API.

- **Read in the code.** `useCallSeen` reads the call's project once as the call ends (`fetchQuery`, `retry: false`)
  and keeps its lines. If that read fails, `.catch(() => undefined)` drops it: `was.current` has already moved on, and
  nothing reads it again. A call often ends because the network or the API went, so that is when the read fails. Once
  they are back, Home reads that window like any other, and says what the person's own call decided, made or kept as
  news: «Since you last looked: 2 decisions and a new report in **Launch plan**».
- **What the browser already covers.** While the browser knows it is offline, TanStack holds the read and runs it once
  it is back (`networkMode: 'online'`, `onlineManager`). So the loss is a read that fails: the API down (503), a
  request cut mid-way, a network the browser still calls online.
- **What changes** (`since-said.ts`, `useSinceNews.ts`):
  - A call's end marks its project **pending** before the read, per account on this device, kept as the said lines
    are (`sophia.since.pending.v1.<account>`; for the page's life where storage refuses).
  - While a project is pending, a visit says nothing of it (`unsaid`), whatever window the page holds, one from before
    the call included.
  - Any read of a pending project's window that takes counts as its post-call read: the call's own, its retry, or
    Home's on an arrival. Its lines are kept whole, as said, and the mark goes (`settlePending`, in the one read all
    three use).
  - **The retry** is one read per pending project when the browser says it is `online` again. Home's own read of the
    projects it shows, as a visit begins, counts too, and comes before the next visit decides. Since the review below,
    an arrival also reads the pending projects Home doesn't show.
  - There is no timer and no polling: a read that fails again leaves the mark for the next of the two.
  - The mark is per device, not per tab, because a reload or a tab closed after the failure would otherwise lose it, and
    the next page's first read of that window would be said.
- **Checks, written first:**
  - Unit (`since-said.test.ts`):
    - a pending project says nothing, and the others' news stands;
    - its first window read is kept and clears the mark, while a read for another project keeps nothing;
    - after that, a later decision is news;
    - the mark is per account, and the page's where storage refuses.
  - Browser (`home-since.spec.ts`; the lever `sinceFail=1` makes the first window read answer 503):
    - A call ends with Home open and its read fails. The next arrival reads Launch plan again and says nothing, nor
      does the one after. One more decision since is said alone.
    - A call ends with Home out of sight and its read fails. The `online` event reads it again, and Home then says
      nothing of it.
- **Limits.**
  - A project the person can no longer read (removed from it, or deleted) stays pending on this device. Each `online`
    event then costs one failed read, and Home doesn't show the project.
  - Updates opened on a pending project keeps the lines it shows, as before, but the project still waits. Home's next
    read of it then keeps that whole window, so a line that came between the two isn't said on Home. Updates lists it.
  - What a wait keeps along with the call's lines: what others did between the call's end and the first read that
    takes. A34 gives a report (`made`) no time, so a window can't be split at the call's end. Updates lists it all.

### Review of the fix: a pending project Home doesn't show

> P2 from the review of `2629a4117` (`useSinceNews.ts:151`), verified in the code.

- **Read in the code.** Two reads end a wait: the `online` listener, and Home's own read, which covers only the
  projects Home shows (`homeShown`, `HOME_ROWS = 3`). A call in a project outside those rows that ends on a 503, with
  the browser still online, waits with nothing to read it, across reloads too. When that project later enters Home's
  rows, Home's first read of it is kept whole as the call's (`settlePending`). So what others did there since the call
  is never said on Home: Marco's four decisions over two weeks in Research, fifth in Work's order. Updates lists them.
- **What changes** (`useSinceNews.ts`): each arrival on Home, once its rows are known, reads each pending project Home
  doesn't show, once (`readAfter`). It runs beside Home's own reads and under the same conditions: on Home, under the
  flags, out of a call. Most of the time nothing is pending, so an arrival reads nothing more. There is no timer and no
  polling. A wait now keeps no more than what others did until the first arrival, or `online`, after the service is
  back.
- **Not added:** a read on mount or on `visibilitychange`. It would end a wait a little sooner when the person lands
  somewhere else, at the cost of a third read path to review.
- **Check, written first** (`home-since.spec.ts`). The fixture gains `projects=fewer` (Design review archived, so
  Product launch is Home's third) and `since=later` (a second note kept in Product launch after the call). A call in
  Product launch, fourth and not shown, ends out of Home, and its read fails. The next arrival reads it once more, and
  the one after doesn't. Once Design review is archived, the note kept after the call is said («a note kept in
  **Product launch**»), and the one the call held is not.
- **No new unit.** What changes is which reads an arrival starts, not a rule over windows; `since-said.ts` stays as
  it is.

## Limits

- **A cold arrival says nothing.** A page's first arrival, or a return after more than 5 min in a project, draws Home
  before its reads come back, and anything said after that would move what is under the greeting. Its reads are kept, so
  the next arrival (Work, Personal or a project and back) says it. The alternatives cost more:
  - holding what is under the greeting until the windows come delays every cold Home by a read;
  - reserving two lines leaves air under the greeting on every quiet Home;
  - keeping the projects longer would let rows reorder under a pointer on the way back.
- **Covered mid-visit, it moves once.** A session nearing or someone entering a room with the news said takes its
  place, and what is under the greeting moves up a line, as any sentence replacing a longer one does on main.
- **Seen where it happened, beyond a call.** A colleague's decision while the person had the project open without a
  call isn't known to have been in front of them, so it is news.
- **What a call swallows.** The window read at a call's end is kept whole, so a line from before the call that was
  never said is not said after it. Updates still lists it.
- **The name may break across the two lines** («Launch / plan» at a desk). Keeping it whole would overflow a phone
  with a long title.
- **Never marked, never said.** Someone who has never pressed Mark as seen in a project hears nothing about it on Home.
  Their window is everything so far, and Updates says so. Once they mark it, Home starts.
- **Home says less than Updates lists.** Home counts only what is new to the person; Updates lists everything since
  the mark, theirs included.
- **This device only.** A line said, or Updates opened, on another device is said here again. The memory is per
  device, as the report asks. Their own lines are never said anywhere, since A34 names them.
- **Next step: the arrival line inside a project.** Under the bar, where a newcomer's welcome goes: «Since you last
  looked: 2 decisions and a new report. Open Updates», `role=status`, with the same news and memory (`since-said.ts`).
  Not in this PR because:
  - its lever (`room.html?demo=1`) has no seen mark, so it would say nothing, and giving it one changes what the demo's
    Updates says, which `room-updates.spec.ts` asserts;
  - it is a second surface, with a read on every project open;
  - one concern per PR, given Luis's bottleneck.
