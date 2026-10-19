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
Ending commit/tree: `72124e89eff8` (tree `48a64a5fe45f`), the last commit of `seams/messages-while-away`'s own that changes
code (the next one adds only this record). 9 files changed against `2e151c934` at that commit:
`e2e/unread-title.spec.ts`, `src/app/theme.css`, `src/features/conversation/Composer.tsx`,
`src/features/conversation/Conversation.tsx`, `src/features/conversation/WhileAway.tsx`,
`src/features/conversation/unread-title.test.ts`, `src/features/conversation/unread-title.ts`,
`src/features/studio/ProjectShell.tsx`, `docs/plans/messages-while-away.md`. One branch, one PR when Luis says.

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

## Remaining obligations

- Only the room's chat marks it; another view says nothing, and the divider waits for the room.
- With the divider already in view as the tab is shown, nothing is announced; the divider is read where it stands.
- A message of the viewer's own counted before their membership was read, and still unknown as the tab is shown,
  counts in the line, as it does in the title meanwhile.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository and
  `evaluacion-2026-10-18/experiencia/costuras.md`.
