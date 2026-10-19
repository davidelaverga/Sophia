# A project says what changed since you last looked, once, as you arrive

> 2026-10-19 · costuras.md seam #7, its second half (`evaluacion-2026-10-18/experiencia/costuras.md`); Home's half is
> #468 (`home-since-you-looked.md`) and batch 5 (`home/call-seen-retry`), whose «Next step» this is · Luis 2026-10-19:
> «Entonces sigue trabajando en lo que viene mientras esperamos». Studio only, no API: A34 is served. Stacks on the
> local `group/follow-ups-5` (`56c61c61e`).

## Measured (`56c61c61e`)

- **Inside a project nothing says what changed.** `getSince` (`api/vision.ts`) has three readers, all on Home's side or
  in Updates: `UpdatesView`'s `SinceYouLooked`, and `useSinceNews.ts` (Home's visit, a call's end, its retry). A person
  who opens a project after a week of decisions sees «Since you last looked» only if they open Updates themselves.
- **Where a newcomer's welcome goes** (`ProjectShell.tsx`, `UnderTheBar`; `WelcomeBand.tsx`): a card fixed under the
  bar on the right (`.welcome-band`, `position: fixed`), over whatever view is open and moving none of it. While the
  project opens, the slow note (`.wait-note`) takes the same place. So a line that comes after a read moves nothing.
- **The memory to share is Home's** (`features/updates/since-said.ts`): `freshIn` (only what someone else did, and not
  already kept), `unsaid` (with a call's pending project left out), `linesOf`, `readSaid`, `rememberSaid`, per account
  on this device, one window per project. Updates keeps the window it shows (`DigestBody`), and after Mark as seen keeps
  the empty one, so that write replaces what was kept for the project.
- **The words are Home's** (`places-view.ts`): `newsOf` (null for a window never marked seen, or one naming nothing
  decided, made or kept) and `newsWords` («2 decisions, a new report and more»), private to `places-view.ts` today.
- **The reads that can be shared.** Home reads under `homeSinceKey(id)` = `['vision', 'since', id, 'home']`, kept
  20 s (`FRESH_MS`), through `readOf`, which also ends a call's pending wait (`settlePending`). Updates reads under
  `['vision', 'since', id, cursor]` and keeps another shape (`SinceRead`, with `readFrom` for its refusal order), so its
  entry can't serve a window. A Mark as seen invalidates `['vision', 'since', id]`, Home's key included.
- **One call at a time** (`SignedIn.tsx`, `oneCall`): opening another project ends the call, so «in a call» inside a
  project is its own room live or reconnecting (`isInCall`). A project kept on screen behind a call has `background`.
- **The lever, against the brief.** `room.html?demo=1` has no seen mark (`newMeeting`'s `seen.sequence` is null), so
  by `newsOf` it says nothing. The lead that pins it is the plain room's in `room-updates.spec.ts` («You haven’t looked
  before: this is everything so far.»), and the demo's lines are pinned in `updates-digest.spec.ts`: a `seen=` lever
  leaves both as they are. The room page's token names no reader (`fixture-no-api`), so every line would count as
  someone else's. In the demo, the viewer took the Oct 4 decision, asked for the readout and kept one of the two notes.
  The fixture also forgets a Mark as seen on reload, which the API never does.

## What changes

- **The line** (`ArrivalSince.tsx`, under the bar, where the welcome goes, in its card): «Since you last looked: 2
  notes kept. Open Updates», with a Dismiss press (×). The counts in words are Home's (`newsWords`, moved to `since-said.ts` beside
  `newsOf` so both surfaces say them the same way). There is no project name, since the bar already shows it. It is
  only what someone else did, and nothing already said, shown or seen on this device (`freshIn`, `unsaid`).
- **A status mounted before its words**: an empty `role="status"` element is under the bar from the shell's first frame.
  The card is put in it after a commit, so it is announced and never takes the focus.
- **When a visit says it.** A visit is one project open (per `projectId`). It reads once the project is drawn (loaded,
  not refused, no one waiting at the door) and says the line when that read is in. It never says it, and reads
  nothing, when:
  - the visit begins at Updates (Updates says it all), or with the newcomer's welcome for this project;
  - the project is out of sight behind a call (`background`), or its room is in a call or one is on its way: joining,
    or asked as the project opens (Join the room from Work, a toast's Rejoin; `joinOnOpen`). The call has its own
    sentence and Catch up. A call that starts with the line shown ends it, and the call's end keeps the window
    (`useCallSeen`), so it isn't said after;
  - the window is empty, never marked seen, or holds only proposals and tasks (`newsOf`);
  - the project's call read is pending (`unsaid`).
- **Once per window, project, account and device, shared with Home.** Once shown, the window's lines are kept whole
  (`rememberSaid`), so neither the next open nor Home says them again. What Home said, or Updates showed, isn't said on
  arrival.
- **The door goes first.** The lobby floats in the same corner under the bar, at the same depth. While someone waits
  at the door, the visit holds: it reads nothing, and reads once the door is answered. A line said is over when the
  project stops being drawn: a closed door (refused, or the session expired) or a knock. While the lobby is on the
  page for another reason (a Decline's «Let in instead», 8 s), the card is hidden (`.shell:has(.lobby)`) and comes
  back when it goes.
- **Gone** with Open Updates (it opens Updates, which keeps what it shows; Mark as seen is there), a move to Updates by
  any way, Dismiss, a call, a closed door or a knock. Each ends the visit's line for good.
- **Read budget: the arrival reads at most once per project open, and not at all at Updates.** It reads under Home's
  key (`homeSinceKey`, through `readOf`), kept 20 s: opening a project from Home within 20 s of Home's read sends
  nothing. It is read only while the visit is still deciding (never polled, never retried, never on focus), so a Mark
  as seen's invalidation reads nothing more here. A read of a call's pending project ends its wait, as Home's does.
  **Updates is not seeded from it.** Open Updates then reads Updates' own window under its own key, as it does on
  every move of the project's cursor: so an arrival followed by Open Updates is two reads. The brief asked for the
  read to be shared with Updates; see «After review».
- **Levers** (`room.html`): `seen=earlier` puts a seen mark after the Oct 2 meeting (its records seen) and makes the
  page's token name the viewer as A34 does (`sub` = the membership's actor, as `home.html`'s `since=` does). In the demo,
  the window then holds Lucía's note and Sophia's, besides the viewer's own decision, readout and note: «2 notes kept».
  With `seen=`, the fixture keeps its seen mark across a reload (session storage), as the API does. `said=home` keeps
  that window as Home's `useSaidOnce` would, before the page draws. `window.fixture.sinceReads()` counts the `/since`
  reads. The fixture also answers the door (`POST /api/v1/lobby/{id}/decision`: Let in, Decline, Block), as the API
  does, so the lobby empties as a person sees it; before, those presses were refused as unexpected.

## Checks, written first

- **Unit** (`since-said.test.ts`, `arrivalOf`):
  - a window of 2 decided and 1 made by others says «Since you last looked: 2 decisions and a new report.», and keeps
    the window's lines whole;
  - nothing for an empty window, one never marked seen, or one with only proposals and tasks;
  - nothing for the reader's own lines; a decision they proposed and another took is news;
  - nothing for lines kept for this project (said on Home, shown in Updates); lines kept for another project don't
    count;
  - nothing while the project's call read is pending;
  - `more` adds «and more».
- **Unit** (`places-view.test.ts`): Home's sentence unchanged, with `newsWords` moved.
- **Unit** (`attention.test.ts`): the arrival's read is under the same default (`enabled = SINCE_SHOWN`).
- **Browser** (`e2e/arrival-since.spec.ts`, `room.html?demo=1&seen=earlier`):
  - the status is there before its words; then «Since you last looked: 2 notes kept.», the focus not taken; Open
    Updates opens Updates' «Since you last looked», and the line is gone;
  - Mark as seen, then a reload: no line;
  - `said=home`: no line;
  - Dismiss ends it, and a move to Knowledge and back doesn't bring it or read again;
  - `place=updates`: no line;
  - `call=on` (a join asked as it opens), on a page of its own: no `/since` read, nothing kept, no line;
  - the door shut under a said line (`shutDoor`): the notice alone, no Open Updates;
  - `lobby=waiting`: no read while someone waits; Let in, then the line;
  - a knock while the line is said: the line goes, Let in is what a press there reaches, and it doesn't come back;
  - Decline: while «Let in instead» stands, the card is hidden and that press is reached; then the card is back;
  - plain `demo=1` (no seen mark): no line.

## Measured once green

- **The read** (`seams/project-arrival-since` at `f4a188b1d`): one `/since` read per open, after the project is
  drawn. Dismiss, then Knowledge and back, reads nothing more. The fixture page runs under StrictMode, whose second
  mount reads again what the first let go, so the spec counts reads only between two moments, as `home-since.spec.ts`
  does.
- **The card**, from captures at 1280×800 dark and 390×844 light:
  - at a desk it is 420 × 66 px, 16 px under the bar, on one line (at 360 px, its first width, the line broke after
    «notes», hence 420);
  - on a phone it is 358 × 86 px inside the gutters;
  - its status is 0 px high in the flow, so nothing moves;
  - no horizontal overflow.
- **The door and the card** (`b4cd3314f`, Knowledge, captures `door-*-knowledge-*` beside the others):
  - someone waiting: the lobby alone, 320 × 94 px at a desk and 358 × 94 px on a phone; the status is empty;
  - after Decline: the lobby holds «Let in instead» (320 × 64 px at a desk); the card is in its status but not drawn
    (`display: none`);
  - once that offer goes: the card alone, 420 × 66 px at a desk and 358 × 86 px on a phone, where it was before;
  - no horizontal overflow in any of the six.

## After review (2026-10-19)

Five P2s on the built branch, each checked against the code first.

- **A join on open counted as no call** (real). `isInCall` counts only `live` and `reconnecting`, and the arrival read
  as soon as the project drew, the moment `useJoinOnOpen` starts the join. Now a call on its way (`joining`, or
  `joinOnOpen`) ends the visit. Red: `call=on` on a page of its own read the window once («Expected: 0», «Received: 1»).
  A control mutant that ignores the call fails the same way.
- **The card over a closed door** (real). `drawn` only gated the read, so a line said stayed over `AccessNotice`. Now a
  line said is over once the project is no longer drawn. Red: after `shutDoor`, the status still read «Since you last
  looked: 2 notes kept. Open UpdatesDismiss».
- **The card under the lobby** (real). Same corner, same depth (`z-index: 15`), the lobby later on the page. Fixed as
  «the door goes first» above. Red: arriving with someone waiting read the window at once («Received: 1»), a knock
  left the line up, and after a Decline the card stayed visible under «Let in instead».
- **The «in a call» check proved nothing** (real). It ran after a visit to Updates, whose kept window quieted the line
  whatever the call did. It now runs on its own page, before anything else, and counts reads instead of waiting.
- **«At most one read per open» overclaimed** (real for the wording). Updates reads under its own key and its own
  shape (`SinceRead`, with `readFrom` for its refusal fences, R-391), and reads again on every move of the project's
  cursor. Seeding it from Home's entry would mean a staleness rule for Updates and a `readFrom` for a read it didn't
  make, which touches those fences, for one read saved in a view that already reads per cursor. So this branch keeps
  the two reads and says so (the budget above). Sharing Updates' first read is a decision for Luis: it departs from the
  brief.

## Limits

- **This device only**, as Home's memory: a line said on another device is said here again.
- **A visit that begins at Updates reads nothing for the arrival.** Updates keeps what it shows, so a later open has
  nothing new to say about it.
- **Shown is said.** The line is kept once drawn, even if the person looks away before reading it. Updates lists it all.
- **A project opened more than 20 s after Home's read reads its window once more**, which may hold newer lines than
  Home said; they are said here, once.
- **The room page reads as a named reader only with `seen=`**, so the fixture's other pages keep their accounts.
- **A knock ends the line for good**, as a call does: it was on screen and kept as said. Updates lists it.
- **After a Decline, a line drawn while «Let in instead» stands is put in its status hidden**, so a screen reader may
  not hear it as it is drawn; it is seen when the offer goes, 8 s at most.
- **Arrival plus Open Updates is two `/since` reads**: the arrival's and Updates' own (see «After review»).
