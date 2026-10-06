# Room: follow-ups to #124 and #125, the review and task writes

> 2026-10-06 · Luis · PR 20 of the room's $20 plan · the P2s Codex left on #124 (merged, or awaiting, by the no-P1 rule), and their twins in #125's tasks · "Sí, publícalo en el #105 y sigue"

## What changes

**A press with no reply is settled only by its own record** (`ReviewRow`, Codex on #124):
- **Its own record.** A review of mine, with the same verdict and, for a request for changes, the same words. Another device of mine asking for different changes doesn't settle it.
- **Records that came while it was sending count.** A record that arrived while the press was sending can settle it once the reply is lost. Every review new since the press began is weighed, not only those new since the last render.
- **Settled by the feed, as by its reply.** The ask closes, its words go, and the row says what was recorded. A second Send can't make a second review.

**A write on its way says so** (reviews and tasks):
- **Its button.** The pressed button reads «Approving…», «Sending…», «Creating…» or «Marking done…».
- **The slow note.** After six seconds, the Studio's slow note (`useSlow`) shows under the row or the form.

**A read on its way, or failed, says so** (reviews and tasks):
- **The first read.** It says «Reading reviews…» or «Reading tasks…», then the slow note. If it fails: «Reviews can’t be read now.» or «Tasks can’t be read now.», with Try again.
- **A later refresh.** As the feed moves, the same query is read again, so a refresh that fails keeps what was read on screen. The row never vanishes, so an open ask keeps its words and Approve and Request changes stay. (A key per cursor had nothing to keep.)

**A late reply takes its place by time.** A review or task recorded here goes into the cached list by its `at`, newest first, not always at the top. A reply that comes after a newer record from the feed doesn't push that record down.

**Nothing is reviewed before it is on screen:** Approve and Request changes wait until the version's text, PDF or page is read and checked.

**Tasks** (Codex on #125):
- **At once.** A task made while the first read is on its way is in the list straight away.
- **Its quote.** It stays within the API's 800 characters.
- **The foot.** A Create closed while on its way still says «Creating the task…» there.
- **A viewer with no tasks** is told so, not sent to a press they don't have.

**A refusal** gives way only to reviews that arrive after it was shown.

**The fixture takes review writes for any report,** as it answers their reads (the reading report's reviews, Codex on #124).

## Out of scope

- The other P2s of #121–#123 (search, the recap's running status, the walk, following): the next follow-ups PRs.
- A request identifier on a review record. The proposal could carry one later; for now the note stands in for it.

## Checks (written first)

- **Browser** (`e2e/room-review.spec.ts`):
  - a lost request for changes isn't settled by my other device asking for different changes;
  - a record that came while the press was sending settles it once the reply is lost;
  - a lost request for changes settled by the feed closes the ask: no Send, and its words are the row's;
  - while the write is on its way, «Approving…», then the slow note;
  - a first read that fails says so, and Try again reads it; one on its way says so;
  - a refresh that fails as the feed moves keeps what was read, and an open ask's words;
  - nothing is approved before its text is on screen;
  - a late reply doesn't put an older review above a newer one;
  - the reading report takes a review.
- **Browser** (`e2e/room-passage-task.spec.ts`):
  - «Creating…» while a Create is on its way;
  - a first read of the tasks that fails says so, and Try again reads them;
  - while the tasks are read, the tab says so, and a task made meanwhile is there;
  - a Create closed while on its way still says so, in the foot;
  - a viewer with no tasks is told so;
  - a refresh that fails as the feed moves keeps the tasks read.
- **Units:** `reviewSettled` and `byTime` (`review-view.test.ts`); `taskQuote` (`task-view.test.ts`).
