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

## Next bounded action

B's private handback goes to P; R reviews this head. No push until P selects one publication.
