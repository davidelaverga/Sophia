# Implementation-session handoff

Goal and attempt: FND-B-C2-ATTENTION-COMMON-01 (the earliest serving slice: saved conversations and names with Home's
needs and Updates), attempt 1.
Human owner / executor resource: Davide (product, merge and production decisions); Luis (UI acceptance) / Claude Code
session (Claude B) on Davide's Mac, coordinated by P.
Native session: none (a coding session, not a runtime attempt).
Starting worktree/commit: `sophia-attention-common`, branch `foundation/attention-common-20261017`, new from C1
`2c60b408e163770b4eb8e81cd08c044f4b044133` (R-qualified).
Ending commit/tree: in B's private handback (a commit cannot name itself).
Writable scope: one normal merge of C's narrow attention `713e4293` (C2a Needs, C2b Updates, the attention flag), its
conflict resolutions, the A34 client compat repair, the real-API served cases and this record. No B2, Personal, C3+
import; no API, SQL, migration, amendment or name beyond 0065/0066/A15/A34.
Runtime unit: none run. Existing authority: P's packet; fake actors and owned loopback services only.

## Outcome

- **The merge.** One merge onto C1, both parents kept. Conflicts resolved as unions:
  - the API imports both route sets: C's Needs and Updates, unconditional, and C1's conversations, conditional;
  - route gating takes both flags (`viewsShown(vision, conversations, attention)` and `shownView`), in the nav, the
    address and the commands; both env declarations;
  - the four contract outputs are regenerated from both sides' amendments (A33, A15/A34), not hand-merged.
  - 0058 stays main's canonical `dec9ec3e`; C's older copy is not taken.
- **Two harnesses, kept apart.**
  - `playwright.served.config.ts` with `e2e-served/` is the normal App against the listening API and restricted
    PostgreSQL (C1's). It now also builds with `VITE_SOPHIA_ATTENTION=1`.
  - C's page fixture becomes `playwright.attention.config.ts`, `vite.attention.config.ts` (switch
    `SOPHIA_ATTENTION_PAGE`) and `e2e-attention/`. It is a page fixture, never counted as the real API.
- **The A34 wire under either flag.** The served window does not change with the build. Under VISION, `parseSince`
  read only the fixtures' older digest shape, so a real A34 window with nulls or `more` was refused.
  - Now A34's own parser reads it whatever the build. Under VISION, the older shape is still read when the answer is
    not A34's; the parser drops unknown fields, so it reads a copy.
  - No contract change and no VISION widening. Before the change the new unit failed (VISION on, a valid window
    refused); after it, 9/9.

## Evidence

Node 24.21.0, pnpm 11.7.0, private PostgreSQL 17.11 UTF8 (fresh, removed after).
- Format, lint, typecheck, contracts (regenerated, no drift) and the toolchain check pass.
- Units: 3000 passed, 0 failed, 70 skipped.
- Artifacts reproduce unchanged: bundle `sha256:e956becc…`, lock `b868da08…`, darwin dsh `e24cb887…`. C's layers change
  no native, dsh or lock input.
- `test:sql`: 66 migrations. `test:db`: 1001/1001, including A15's and A34's suites. The exclusive Q13 candidate group
  is a skipped suite there, not counted.
- Real API (normal App → listening API → restricted PostgreSQL, synthetic HS256; VISION off, conversations and
  attention on): 9/9.
  - The 5 C1 cases, unchanged.
  - Home lists the real A15 need of a guest knocking through an editor's link. Its title is the one `/me/needs` gives
    for that entry.
  - Switching to another account in the tab lists only that account's needs.
  - A project with 510 messages (34 batches of 15; first written here as 505), then a kept note and an accepted
    decision. The first window (500 events, `more`,
    `fromSequence` null) says it is a first part and shows neither line. Mark as seen writes `/seen` and the next
    window shows both; marking that one leaves «Nothing new since you last looked.».
  - Someone not in that project gets 403 on its snapshot and the closed door, and no read of it succeeds.
  - No request touches meetings, recaps, so-far, search, focus or source origins.
- C's page fixture under its own config: 5/5, and 10/10 with `--repeat-each=2`.
- C1's fixture specs (conversations, profile, account menu, message format, links, room return, skip link): 262/262.
- VISION regression (room-updates, updates-narrow/quiet/digest, room-recap, room-so-far, app-auth): 74/75.
  `updates-digest.spec.ts:70` fails identically on C1's base: its button name expects the host to be UTC or UTC-4.
  Recorded, not waived.

## Decisions and changes

- **Full Chromium for the attention served cases.** Home asks for on-device speech recognition (`dictation.ts`).
  Playwright's default `chrome-headless-shell` does not bind it and terminates the page with a bad Mojo message
  (`OnDeviceSpeechRecognition`), on C1's own base too. The C1 served cases never open Home.
  `attention-served.spec.ts` alone uses `channel: 'chromium'`, the full build of the same revision, already installed.
- **Real nulls.** Over HTTP the real API gave `fromSequence: null`. Null people (`proposedBy`, `decidedBy`, `askedBy`)
  need a decision or report no member made, which no route makes. Those stay proven by the units and C's page fixture.

## Remaining obligations

- R's review of this head; Luis's acceptance of the combined Studio. P then selects any publication (#391).
- Unchanged: the return-anchor allowlist for `#message-`/`#todo-` (not in this slice), «For: Anyone» (C5, not in this
  slice), Places' «the vision flag» comment, and the R1 D-OPS question.

## Read and wire repair (FND-B-C2-READ-WIRE-REPAIR-01, R-C2-READ-01 and R-C2-WIRE-01)

Both findings were reproduced before anything changed.

- **A refused read hid nothing (P1).**
  - Before: Updates had read its window; then this person's own `/since` answered 403 while the project's snapshot
    answered 503 (the shell's door stays open). On a refocus refetch, the page still showed the old lines, Mark as
    seen, «This may be out of date.» and even «this is everything so far».
  - The repair, as C1's read fences do:
    - each read keeps when it was set out (`readFrom`);
    - a refusal (401, 403) of this person's own read is kept in the account's query cache (`since-refused`, per
      project);
    - `shownSince` shows a window only while no refusal stands and only if its read was set out after the last one.
  - Consequences: nothing shows while refused; a later ordinary failure, another view and back, or an older read
    answering late shows nothing either; only a read set out since (Try again, a refocus) shows it again, and Mark
    as seen goes with the window. An ordinary failure alone still keeps the window, said as possibly out of date.
  - Real App against the listening API, the refusal stubbed in the browser:
    - before: the refusal case failed at its first check (old lines and Mark as seen on screen);
    - after: both cases pass, 6/6 repeated. Four pure cases cover the rule's orders; an older read answering late is
      proven by those units only, not in the browser.
- **Malformed A34 fell through to the older reader (P2).**
  - Before: under the vision flag, a window the contract refuses was read by the older digest's reader. Four
    windows got through: R's counterexample (no `more`, so it read as complete), `more` as a word, `more` as a
    number, and one whose ids, moments and sequences are all malformed strings.
  - Now `/since` is read by the contract's parser alone, whatever the build (`parseSince = parseProjectUpdates`), and
    the older digest is refused too.
  - The VISION fixture pages keep their intent at their own answer: `updatesWindowOf` makes their digest a window,
    complete (`more: false`), in `fixtures/meeting-data.ts`.
  - The VISION regression set gives the same 74/75 (the time-zone case on C1's base). No contract, API or generated
    file changed.

## Read order (FND-B-C2-READ-ORDER-02, R-C2-READ-01's residual)

The fence above stamped a read with `Date.now()` and a refusal with the query core's `errorUpdatedAt`, both the wall
clock. Set back between them, the clock put a refusal before the read it refused, and a later ordinary failure showed
the old window again (R's source counterexample: a read at 2000, a refusal at 1000).
- Before, reproduced:
  - in a unit, with those very stamps;
  - in the real App against the listening API, using Playwright's page clock in the browser only (the API and its
    tokens keep real time): this person's own read succeeded; the browser clock moved back an hour while their
    refused read (403, the snapshot 503) was on its way; then a Try again that failed (503) showed the old lines, Mark
    as seen, «This may be out of date.» and «everything so far».
- Now both stamps come from `sinceOrder()`, a count in this page that only goes up, as C1's fences count
  (`withdrawn-purge.ts`). The refusal takes its count when it is seen. `errorUpdateCount` only tells one refusal from
  the next and orders nothing.
- After:
  - the case passes: nothing read before shows, no seen is written, and a read set out since restores it, the clock
    still back;
  - with the three other refusal cases, 9/9 over three repeats; the served suite 12/12;
  - the strict A34 reader and the fixture adapter are unchanged.
- A page loaded afresh starts the count again with an empty cache, so the first read there shows only what it reads.

## Current common carried (FND-B-NEEDS-CURRENT-COMMON-INTEGRATION-01)

One normal merge of the published common `9df69813` into `44cf0b03`, both parents kept; the merge base is `2c60b408`.
`9df69813` is #393: saved conversations, service replies with the verified executor identity, completed-goal
retirement, the receipt correction and current main.
- **Seven paths changed on both sides.** Six merged automatically: `SignedIn.tsx` (C1's account actions beside the
  attention wiring), `ProjectShell.tsx`, `app-auth.spec.ts`, persistence `index.ts`, the OpenAPI and the types.
- **One conflict, the generated validators.** It was resolved by regenerating every contract output from the combined
  amendments (A15/A34 with A33/A35/A40/A41). The regenerated OpenAPI and types equal the automatic merge, and
  `contracts:check` has no drift.
- **Everything else keeps its own side's bytes:** 9df's 101 paths and the attention branch's 43.
- **No Personal content was carried.** The lock, runtime record and profile lock are common's. Every identity
  reproduces unrecorded; linux-x64 stays whatever common's CI qualifies.
- **Names.** 0065/0066 and A15/A34 are this branch's. 0075/A41 and every current main file are unchanged.
- **Unchanged.** The strict A34 reader, the fixture adapter and the READ/WIRE closures are unchanged.
- **Checks.** The ordinary check, SQL, DB and served cases of this head are in B's handback.

## Readiness and the journal-preflight test (FND-B-COMMON-READINESS-AND-TEST-FOCUSED-CORRECTION-01)

Two findings on this head.

**Readiness (R-C6E-READY-01).** The snapshot always calls 0075's `goal_retirements`, whatever the flags, but `/ready`
did not require it. A database short of 0075 read ready, then failed every snapshot.
- Now `/ready` requires it.
- The staged readiness case adds the adverse step. Short of 0075, the API is not ready and a member's snapshot fails;
  with 0075, it is ready and that snapshot reads.
- With the new requirement removed, the case fails.

**The journal-preflight test (#391's failed check, job 117485430739).** `tests/unit/reply-child.test.mjs`'s timeout case
created the 10 ms preflight and attached its rejection handler only after a tick. So a refusal could arrive first,
unobserved.
- With the old order and consumption delayed 20 ms, the test fails as CI did: `reply_recovery_unconfirmed` at about
  11 ms, with `PromiseRejectionHandledWarning`.
- Now the outcome is observed the moment the preflight exists, as a value that never rejects. It is asserted after the
  same delay, and both modes keep their abort, late-read, single-ACK, no-observe and no-settle checks.
- The test passes, and so does its file (266/266).
- CI's own dynamic cause is not proven beyond this reproduction.

## A conversation read refused at its status (FND-B-SHARED-REFUSAL-FOCUSED-CORRECTION-01)

V's local diagnostic and R's disposition (R-REFUSAL-CLIENT-01, P1 under P's client-denial contract) found the defect.
A project's conversations or a thread refused with 403 kept their cached content and controls on screen until the
error body was read.
- With the body delayed 100 ms, six rendering opportunities came after the client had the 403. The client awaited
  the body before raising the refusal, and the view fences only on the code `forbidden`.
- A malformed body became `http_403` and was no refusal at all.

**Now these two protected reads are refused by their status.** `listConversations` and `getConversationMessages` call
with `protectedRead`, and a 403 is raised at once as `forbidden`, its body cancelled and never consulted. Other calls
and other statuses are unchanged; the fence, retry, draft and restoration paths are untouched.

**Checks.** `client.test.ts` has four new cases, the list and a thread each with an endless body and a malformed one.
- Before the fix all four fail: the refusal had not come within 200 ms, or the code was `http_403`. Now 9/9.
- With the early refusal disabled in the client (not in the test), the four fail again.
- **Not done here:** the browser case's own measurement correction (R-REFUSAL-MEASURE-01), which counts from the
  server's marker; its `<= 3` assertion is unchanged.
- The selected C1 source shares these modules and stays held: this fix is not in its artifact.

## FND-B-REFUSAL-SEMANTIC-UI-REGRESSION-01 (R-REFUSAL-MEASURE-01)

- Four semantic browser cases in `apps/studio/e2e/conversations-removal.spec.ts` (list and open thread, each with a
  delayed and a malformed 403 body). The page's fetch is wrapped after load; each conversations list/thread 403 is
  stamped (sequence, path, `performance.now`) as its Response is handed to the app, with the status app-visible before
  the delayed body can decode. From that stamp on, every `requestAnimationFrame` callback records protected rows, the
  open thread's messages or composer, or New conversation that are laid out and visible. Zero is required. This
  measures rAF-callback DOM geometry and computed visibility, not compositor paint. The legacy `<=3` cases are kept
  byte-for-byte as historical evidence.
- Causal failure on 527d (kept first): 1-3 frames 0.4-66 ms after the client saw the 403. query-core 5.103.2
  notifies observers with `setTimeout(0)`, so the fence committed by the view's layout effect came a task late.
- Correction (same privacy behavior): the list read (`ConversationsView` `useList`) fences and the thread read
  (`OpenConversation` `useTranscript`) calls `onDenied` in their query functions as the client learns the refusal; the
  layout effects stay for the rest. The talk-store write re-renders in React's sync lane, before the next frame.
- Proof: the fixed source passes all 46 cases in the spec. A declared `protectedRead` guard mutant fails all 4
  semantic cases: ~20 frames over ~310-344 ms for delayed bodies, and malformed bodies are never classed as a refusal.
  Restored blob 2044ed49. The prior source fails 3-4 of 4.

## FND-B-391-409-THREE-FINDINGS-FOCUSED-01 (Updates refusal, 391 P2 4304920481)

- `getSince` is a `doorRead`: its 401 or 403 is raised at once with that status (`refusedByStatus` in `client.ts`),
  never after an error body that may be slow, endless or malformed. Other `/since` failures (503) still read their
  body as before. Updates keeps the refusal as its read learns it (`sinceRefusedNow`) and reads the fence from the
  account's query cache as it changes (`useSyncExternalStore`). The per-account cache, project key, `sinceOrder` and
  `shownSince` rules are unchanged.
- `e2e/updates-refusal.spec.ts` covers 401 and 403, each with a delayed and a malformed body, and requires zero frames
  showing a cached line or Mark as seen after the client sees the refusal. It measures DOM layout and visibility in
  rAF callbacks, not compositor paint. It also checks that a later 503 does not restore the window, that a read since
  does, and that reading never writes seen.
- On 586327ce the delayed cases fail with 18 frames up to ~290 ms after the refusal; the malformed cases pass. A
  `doorRead` mutant fails the same way. A mutant that removes the view-side keep still passes 4/4: this fixture does not
  measure that keep as needed. A held older 200 and a view trip are not covered by this spec.

## FND-B-391-409 on mentions (409 P2 4304921244)

- A confirmed room message clears the mention choice only while that choice is still what it named (`sameMembers`,
  compared by members, not by array). A choice made while it went stays for the next message. An unchanged choice
  clears as before, and draft and reply matching are unchanged.
- `e2e/mentions.spec.ts` "chosen again while a message goes" holds the send, switches from Marco to Lucía and writes the
  next words. The first success leaves Lucía and the words; the request bodies are `[Marco]` then `[Lucía]`. The
  original unconditional clear, restored as a mutant, fails that case. Definite-failure and unknown-retry cases are not
  in this spec.
## FND-B-UPDATES-INDEX-AND-CAUSAL-QUALIFICATION-01

- 0066 (unapplied, unmerged) gains `project_events_job_admission_idx`, the one name P allocated: a partial index
  `(project_id,entity_id,sequence) WHERE entity_type='job' AND type='native_task.admitted'`, exactly the predicates
  and order of `update_asker` and `version_asker`. No helper body changed, and no new migration or contract.
- The bounded probe in `apps/api/src/updates.db.test.ts` runs only with `SOPHIA_UPDATES_SCALE=1`. Fixture: 10,000
  unrelated events, then 500 report tasks admitted before the reader's mark, then their 500 results in the window.
  Through GetSince every report names its asker. On a fresh plain-installer PG17 cluster (all 0001-0075 applied),
  `project_updates` took 776.7 ms without the index (dropped and rolled back) and 163.2 ms with it. The admission
  lookup went from a 300-buffer bitmap scan removing 10,999 rows to a 3-buffer index scan. All 12 A34 cases pass.
- Updates' synchronous keep is now causally covered. `e2e/updates-refusal.spec.ts` "observer delivery held" holds
  TanStack's observer scheduler, using the page's own module instance. Frames then come after the refusal reaches the
  app and before the query tells the view. With the keep, none of them shows a protected line; with only the keep
  removed (`doorRead` kept), cached lines show from 2.9 ms.
- `e2e/updates-digest.spec.ts` gives only the meeting-time case a UTC context (`timezoneId`), so it no longer depends
  on the machine's zone. Its assertion is unchanged.
- Corrections to the earlier handback: the ordinary check does not run the DB tests. The earlier probe applied 67
  migration files before 0070 failed; it was not a full schema.

## FND-B-NEEDS-OWN-READ-REFUSAL-FOCUSED-CORRECTION-01 (#391 4305645985, R-NEEDS-OWN-READ-01)

- Home's account Needs read (`GET /api/v1/me/needs`, `listNeeds`) is a `doorRead`: its 401 or 403 is raised at
  once with its status. `useNeeds` keeps the account's refusal, in this page's read order, in the account's query cache
  as the read learns it, and reads it as the cache changes. No row read before the last refusal shows, whatever comes
  after it (a 503, a late answer, another view and back); a read set out since, and answered, restores them. A 503
  with no refusal before it keeps the rows as before. Polling, the padlock, the seen mark after a turn is shown, and
  the per-account cache are unchanged.
- `e2e/home-needs-refusal.spec.ts` adapts the Updates refusal spec. It covers 401 and 403, with delayed and malformed
  bodies, and the held-delivery case: zero frames show a cached need or action, and no seen write is made. One `@phone`
  case runs on the phone project. Removing only `doorRead` fails both delayed cases; removing only the synchronous
  keep fails all six (held: rows visible; others: rows back after the later 503). The checks measure DOM layout and
  visibility in rAF callbacks, not compositor paint.

## FND-B-NEEDS-CURRENT-MAIN-EAE-INTEGRATION-01

- Main `eae138d4` is merged in cleanly (tree `5e6411e9`): Luis's Home Needs focus by id, Unicode folding, rem type and
  the other UI merges sit beside the Needs own-read fence.
- Cases the browser cannot stage on one query are covered in `use-needs-order.test.ts`, on a real `QueryClient`: an
  older read answering after a refusal, the same mark after a remount, another account's own scope, and a read since
  restoring the rows. `home-needs-refusal.spec.ts` adds a 503 with no refusal before it, which keeps the rows.

## Next bounded action

B's private handback goes to P; R reviews this integration. No push until P selects one publication.
