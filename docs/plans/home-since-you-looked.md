# Home says what changed since you last looked, once

> 2026-10-19 · costuras.md seam #7, the full seam after its first cut (#467, `home-no-false-claim.md`;
> `evaluacion-2026-10-18/experiencia/costuras.md`); Luis 2026-10-18: «Todo trabajo nuevo que hagas ten en cuenta nuestro
> cuello de botella actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir
> trabajando». Studio only, no API: A34 is served. One PR: Home's line; the arrival line in a project is the next step.

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

## What changes

- **The read** (`useSinceNews.ts`): one `getSince` for each project Home shows, under the vision or attention flag
  only. It is kept 20 s, as fresh as the projects' own read, so an arrival sooner reads nothing again. It is read only
  while Home is the place arrived at, never during a call, never polled, never retried. That is at most 3 reads per
  arrival, and none on most.
- **The news** (`features/updates/since-said.ts`, `newsOf`): what was decided, made and kept, and whether events lie
  after the window (`more`). A window with no seen mark, or with nothing decided, made or kept, has none: proposals still
  open and tasks that moved stay in Updates, and a decision that waits on the person is A15's need on Home already.
- **Once** (`newsKey`, `unsaid`, `readSaid`, `rememberSaid`): per account on this device, each project keeps the key
  of the news last said or looked at: where the window starts (`fromSequence`) and what it counts, never its end. The
  same news after any number of room events is the same key; one more decision, or a new seen mark with news after it,
  is news again. Kept in `localStorage` (`sophia.since.said.v1.<account>`); where storage refuses, for as long as the
  page lives. Nothing names the account on screen.
- **A visit says it at its start**: the news a visit may say is fixed once its reads settle, from what was remembered
  when Home was arrived at, and it is remembered as said only once Sophia's sentence says it. The call, a session soon
  and a live room keep their priority. News they cover is not remembered, so the next arrival says it. Leaving Home and
  coming back is a new visit, and the news said is not said again.
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
- **Opening Updates ends it** (`UpdatesView.tsx`, `DigestBody`): the window Updates shows is remembered as looked at, so
  Home doesn't then say «since you last looked» about what was just read there. Mark as seen moves the mark; the next
  window holds nothing to say.
- **Levers**: `home.html?since=some` answers `/api/v1/projects/{id}/since` from `updatesWindowOf`
  (`fixtures/meeting-data.ts`): Launch plan holds 2 decisions and a new report after a seen mark (the fixture's earlier
  decision and a proposal still open among them), Product launch, not shown in `quiet`, holds a note kept, and the others
  hold nothing. `since=more` adds one decision to Launch plan's (a new window), and `since=seen` is every window after
  a seen mark, empty. `homeFixture.sinceReads()` lists the projects asked. The app's fixture API answers `/since` with
  an empty window for a project without a meeting.

## Checks, written first

- **Unit** (`places-view.test.ts`): `sophiaSays` with a window of 2 decided and 1 made returns «Since you last looked: 2
  decisions and a new report in Launch plan. Open Updates», Launch plan strong, Open Updates naming its project. An empty
  window, one never marked seen, and one with only proposals and tasks say nothing. The call, a session soon and a live
  room come first. Several projects give summed counts, the most named, «and 1 more project». Every kind is named,
  and `more` adds «and more».
- **Unit** (`since-said.test.ts`): the key ignores `toSequence` and changes with a count or the seen mark; `unsaid`
  drops what was said and what names nothing; the memory is per account, and kept for the page when storage refuses.
- **Browser** (`home-since.spec.ts`, `home.html?projects=quiet&since=some`): the line as a status, Launch plan strong,
  the focus not taken. One read for each of the three rows and none for Product launch. Open Updates presses
  `updates <Launch plan>`. Once: Leave Home and back says nothing and reads nothing (kept 20 s); a reload says nothing;
  `since=more` says the new window. `since=seen` says nothing. In a call nothing is read and the call's sentence
  stands. Under the session soon (`projects=four`) the news isn't said and isn't remembered, so `quiet` then says it.
- **Measured once green**: the fixture page runs under StrictMode, whose second mount reads again what the first let go
  (the reads pass their abort signal). The spec therefore counts the projects asked, and raw reads only between two
  moments. A production build mounts once.
- **The attention guard** (`app/attention.test.ts`) lists the flag's readers, and now names `useSinceNews.ts` with its
  one use (`const SINCE_SHOWN = VISION || ATTENTION`).

## Limits

- **It moves the rows once.** The news comes one read after the projects, and it is two lines where one is held (at a
  desk and on a phone, measured: the status 24 → 48 px, «You and Sophia» 222 → 246 px and 206 → 230 px). On the
  arrival that says it, what is under the greeting moves down 24 px. This happens once per window: a visit's news is
  fixed, and an arrival that says nothing moves nothing. A session soon or a room replacing it with Home open moves it
  back, as a wrapped sentence did on main.
- **A row that comes in mid-visit is read, not said.** A session nearing can bring a project into the three rows while
  Home is open. Its window is read then (one more read), and anything in it is said on the next arrival.
- **The name may break across the two lines** («Launch / plan» at a desk). Keeping it whole would overflow a phone
  with a long title.
- **Never marked, never said.** Someone who has never pressed Mark as seen in a project hears nothing about it on Home.
  Their window is everything so far, and Updates says so. Once they mark it, Home starts.
- **Same counts, same news.** One decision withdrawn and another made in the same window count the same, so the line
  isn't said again. Updates lists both.
- **This device only.** A line said, or Updates opened, on another device is said here again. The memory is per device,
  as the report asks.
- **Next step: the arrival line inside a project.** Under the bar, where a newcomer's welcome goes: «Since you last
  looked: 2 decisions and a new report. Open Updates», `role=status`, with the same news and memory (`since-said.ts`).
  Not in this PR because:
  - its lever (`room.html?demo=1`) has no seen mark, so it would say nothing, and giving it one changes what the demo's
    Updates says, which `room-updates.spec.ts` asserts;
  - it is a second surface, with a read on every project open;
  - one concern per PR, given Luis's bottleneck.
