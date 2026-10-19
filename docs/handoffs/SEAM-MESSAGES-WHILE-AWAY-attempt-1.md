# Implementation-session handoff

Goal and attempt: SEAM-MESSAGES-WHILE-AWAY (costuras.md seam #10, 2026-10-18; Luis 2026-10-18: «Que sigue>» after «Todo
trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en un pr, excelente o como
veas, que alivie la presión pero hay que seguir trabajando»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-5`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-5`, branch `seams/messages-while-away` from `origin/main` (`2e151c934`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-18, «Que sigue>»; local only, nothing pushed; merges on green with no open P1 once
pushed.
Ending commit/tree: round 1 ended at `72124e89eff8` (tree `48a64a5fe45f`). Round 2, the review's three P2s, ends at
`196fe37a0`, the last commit that changes code (the next one updates only this record and the plan). 11 files
changed against `2e151c934` there: round 1's nine and `fixtures/fixture-api.ts`, `fixtures/room.tsx` (the `holdFeed`
lever). One branch, one PR when Luis says.

## Outcome

- Back on the tab after messages came in the room's discussion, the chat shows a divider above the first of them:
  «2 messages came while you were away» («1 message …» for one), in the halo's ink between two hairlines.
- Where that divider is out of the chat's view (the chat opens at the newest of thirty, or the reader was scrolled far
  from it), a line at the chat's head says «30 messages came while you were away. Jump to the first» («Jump to it» for
  one), `role=status`, never focused. Jump brings the divider into view and gives it the focus.
- Once per absence, keyed by its first message: the line goes for good once the divider has been wholly in view, or on
  Jump; hidden and shown with nothing new adds nothing; sending from the bar ends the line and the divider. Kept past a
  visit to another view, not across a reload. The viewer's own messages still don't count (#463). The title's count is
  unchanged.
- Round 2: a reply the person sends from their phone while the tab is hidden puts what came before it behind them, so
  back on the tab no divider sits above a message they already answered. Messages the feed delivers only after the
  tab is shown (a phone's frozen page, a woken laptop) are marked too: the tab reads the snapshot once more on return,
  and the absence closes on the first read that lands after it.

## Evidence

- Plan: `docs/plans/messages-while-away.md` (committed before the tests, `8f543496a`).
- **Written first and failing** (`0a70ab2cf`):
  - unit: `unread-title.test.ts` fails at import on the test commit (`SyntaxError: The requested module
    './unread-title.ts' does not provide an export named 'awayWords'`). Against main's behaviour written in the new
    names (a scratch stub, not committed), 7 of 12 fail on their assertions, e.g. «shown again, what was counted came
    while away…»: `actual: null, expected: { ids: [ 'a', 'b' ], reached: false }`; the order guard and the four
    earlier tests pass;
  - e2e `unread-title.spec.ts`, through the guard at the detached test commit: 4 failed, 5 passed (the four earlier
    tests and the control «hidden and shown with nothing new adds nothing»). The divider tests on
    `expect(locator).toBeVisible() failed … element(s) not found`; the thirty case on `toHaveText` expecting «30
    messages came while you were away. Jump to the first», `element(s) not found`.
- **After the change** (`72124e89e`):
  - unit: `unread-title.test.ts` 12/12; the whole Studio suite 1778/1780, the two failures the known Windows ones
    (`attention.test.ts`, `browser-imports.test.ts`);
  - e2e through the guard, two workers: `unread-title` 9/9; with its neighbours (`chat-times`, `discussion-earlier`,
    `message-format`, `message-links`, `room-chat-replies`, `room-discussion`, `studio-links-in-place`,
    `decision-alert`, `resources`, `voice-chat`, `room`) 177/177;
  - whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio` and Prettier on every touched non-docs file: clean.
- **Captures** (a throwaway spec, deleted), 1280×800 dark and the 390×844 phone in light: the divider in view, the line
  over thirty, and the divider after Jump, focused from the keyboard. No horizontal overflow on the page, the panel, the
  line or the divider (0 px each). In the session's scratchpad, `seams-messages-while-away/`.

- **Round 2, the review's three P2s** (all verified real against the code, see Decisions):
  - commits, in order: `610a65d95` reach-by-reading tests; `5811413f7` failing tests for the reply from elsewhere and
    the late feed, with the fixture's `holdFeed`; `12b5395d9` the reply fix; `5ecaaa9d7` the held-feed cases made to
    wait for the reads already on their way; `196fe37a0` the late-feed fix;
  - reach by reading (`610a65d95`): the three cases pass on the branch. The two mutants the review named were run
    against the whole spec: without `if (seen) reach(open)`, the reading case and the opened-in-view case fail
    («Expected: 0 Received: 1» on the line, log `pw-logs/seam10-r2-mutant1.txt`); without the history's scroll
    listener, the reading case fails the same way (`seam10-r2-mutant2.txt`); restored after;
  - red at `5811413f7`: unit, the three new cases fail on their assertions, e.g. «answered from another device…»
    `actual: { ids: [ 'a' ], reached: false }, expected: null`, and «the viewer known only once the tab is shown…»
    `actual: { ids: [ 'a', 'm', 'b' ] …}, expected: { ids: [ 'b' ] …}`; e2e detached, 3 failed and 13 passed: the
    reply case on `toHaveCount(0)` for /came while you were away/ («Received: 1»), the two held-feed cases on
    `toBeVisible()` for «2 messages…» and «3 messages…» («element(s) not found»), log `seam10-r2-red.txt`;
  - red at `5ecaaa9d7` (reply fixed, late feed not): 2 failed, 14 passed, the two held-feed cases on the divider's
    count (lines 305 and 326), log `seam10-r2-red-2.txt`. The first held-feed run had shown a stray read: the page's
    first events refresh the snapshot once more a moment after it opens, and when that landed after the held
    messages the hidden page counted them the usual way; the cases now wait for it, and the second checks the title
    still says (1) after the held two;
  - green at `196fe37a0`: unit `unread-title.test.ts` 15/15; the Studio suite 1781/1783, the two failures the known
    Windows ones (`attention.test.ts`, `browser-imports.test.ts`); e2e `unread-title` 16/16, and with its neighbours
    (`chat-times`, `discussion-earlier`, `message-format`, `message-links`, `room-chat-replies`, `room-discussion`,
    `studio-links-in-place`, `decision-alert`, `resources`, `voice-chat`, `room`, `push-to-talk`, `knock-alert`)
    201/201, log `seam10-r2-neighbours.txt`; whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio` and
    Prettier on every touched non-docs file: clean;
  - captures (throwaway spec, deleted), 1280×800 dark and the 390×844 phone in light, in
    `seams-messages-while-away/round-2/`: the held feed's divider counting all three, the reply from elsewhere with
    nothing marked, the divider read down to with the line gone. 0 px horizontal overflow on the page, the chat
    panel, its history and the divider in each.

## Decisions and changes

- **The report's «in the chat's header when the chat is closed»:** closed, the side panel draws nothing, header
  included. So the line waits at the chat's head for the chat to open, and shows only where the divider is out of view.
  With the divider in view the divider carries the words, and no Jump points at what is already there; so the report's
  «with the chat open while hidden, the line still shows» is checked as the divider's words.
- **One count, one place:** the project shell's existing count (`unread-title.ts`) keeps what it counted as `away`
  when the tab is shown again, instead of dropping it; a pure step (`nextUnseen`) decides, unit-tested. It reaches the
  chat by context (`CameWhileAway`, as `CallInReach` does), so it outlives a visit to another view. An absence before
  the last one was reached adds to it, its first kept.
- **Where the divider goes:** above the first drawn of the messages that came, so past the snapshot's 50 it still has a
  place.
- **Measured, not guessed:** «in view» is the divider wholly inside the history's box, checked as the absence is drawn,
  as the panel opens (after the history's own observer has put it at the newest line) and as it scrolls. The line's
  state starts hidden, so it never flashes before the measure. The divider drawn while following keeps the history at
  the bottom; the line leaving keeps the history's words still on screen.
- **Sending:** the bar tells the chat as a message goes (`Composer`'s `onSend`), whichever way it goes.
- **Class names:** `while-away-line` and `while-away-divider`; Resources already has its own `.away-line`, which the
  first capture showed squeezing this one.
- **Round 2, a reply from elsewhere:** real. `withUnseen` drops only the viewer's own messages and `sent` was wired
  only to this tab's bar. Now `unanswered`, applied at every read while the tab is shown, drops the viewer's last
  typed message and all before it from what came (one that left the snapshot came before); an absence left empty is
  gone. Done at the shown reads only, so the title's count while hidden stays as #463 left it (its own unit test
  still holds). Spoken turns are left out: speaking in the call reads nothing of the chat.
- **Round 2, the late feed:** real. Messages reach the snapshot only through the feed's events (`useProjectFeed.ts`,
  the 120 ms refresh after an event; `refetchOnWindowFocus: false`; reconnects wait the backoff in `feed-loop.ts`),
  so a frozen page's queued events land after the tab is shown and were taken as seen. Chosen fix: on return the
  shell reads the snapshot once more (`refetch`), and the absence stays open until a read completed after the return
  (`dataUpdatedAt` ≥ the moment of return), capped at 5 s. Not the refetch's own promise: the query hands data down
  on a later timer, and an event refresh can cancel that read, so the first read to land, whichever it is, ends the
  absence, and the closing read itself counts what it brings. The review's alternative (wait for the feed to be live
  again) was not taken: a frozen page's feed still says live, and the read on return is the truth either way.
- **Round 2, reaching by reading:** real gap in the tests, not in the code; covered by three browser cases and shown
  to catch both mutants.

## Remaining obligations

- Only the room's chat marks it; another view says nothing, and the divider waits for the room.
- With the divider already in view as the tab is shown, nothing is announced; the divider is read where it stands.
- A message of the viewer's own counted before their membership was read counts in the line while the membership
  stays unknown, as it does in the title meanwhile; once known, it leaves with what came before it.
- The title's count while the tab is hidden still counts a message the viewer already answered from their phone, as
  #463 left it; a follow-up if Luis wants the title to match.
- One more snapshot read each time the tab is shown; a read on return slower than 5 s is given up, and what comes
  after it is seen.
- The branch was cut from `origin/main` `2e151c934`, which has moved on since; nothing was merged forward.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository and
  `evaluacion-2026-10-18/experiencia/costuras.md`.
