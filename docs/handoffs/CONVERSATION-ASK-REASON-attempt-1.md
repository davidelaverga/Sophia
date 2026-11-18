# Implementation-session handoff

Goal and attempt: CONVERSATION-ASK-REASON (finding 3 of the 2026-11-08 hunt on main, `evaluacion-2026-11-08/caza-main.md`:
the Studio always said «Sophia doesn’t answer here yet», whatever the list's `askReason`; Luis 2026-11-08: «Procede y
corrige», and he approved the three lines word for word), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-3`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-3`, branch `conversations/ask-reason` from `origin/main`
`953e5dc3d` (everything through #500 merged; not pushed)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no migration, no contract.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard); CI as the run on record.
Existing authority: Luis, the quotes above; local only, nothing pushed.
Ending commit/tree: `0fa167ab8`, the last commit that changes code; the next one adds only this record. Files changed
against `953e5dc3d`: `apps/studio/src/features/conversations/{conversation-list.ts, conversation-list.test.ts,
ConversationsView.tsx, OpenConversation.tsx, ConversationComposer.tsx, NewConversation.tsx}`,
`apps/studio/fixtures/{conversation-wire.ts, fixture-api.ts, room.tsx}`,
`apps/studio/e2e/conversations-ask-off.spec.ts`, `docs/plans/conversation-ask-reason.md`, and this record.

## Outcome

- **One function, `askUnansweredWords(reason)`** (`conversation-list.ts`, next to `replyEndWords`):
  - `runtime_unavailable`, `cleanup_capacity`: «Sophia can’t be reached right now»;
  - `replies_disabled`, `grant_disabled`, `grant_expired`, `calls_exhausted`: «Sophia’s answers are off for this project
    now»;
  - `replies_not_enabled`, `context_assembler_unbound`, null, any other: today's «Sophia doesn’t answer here yet».
- **Both places that said it read it**: the list's reader (`useReader`) computes it once from `capability.askReason`.
  The composer's hint shows the clause, as its hint always did. The new conversation's note (and the checkbox's
  description) adds «: the question goes to the team.», so it says Luis's three lines exactly.
- **Fixture lever**: `ask=<reason>` serves one of 0089's reasons; `ask=off` is still `replies_not_enabled`. It is
  documented in `conversation-wire.ts`'s header comment and on `fixture-api.ts`'s `askReason`.

## Evidence

- **Written first and failing** (`b3e32160e`):
  - unit: `SyntaxError: The requested module './conversation-list.ts' does not provide an export named
    'askUnansweredWords'`;
  - e2e (`pw-logs/ask-reason-red.txt`): `expect(locator).toContainText(expected)`, `Expected substring: "Sophia’s
    answers are off for this project now"`, `Received string: "Sophia doesn’t answer here yetEnter sends · Shift+Enter, a
    new line"`; the `runtime_unavailable` case: the form's line not found.
- **Fix `0fa167ab8`.** Green:
  - unit `conversation-list.test.ts`: 112/112;
  - through the guard (`pw-logs/ask-reason-green.txt`): `conversations-ask-off`, `conversations-details`,
    `question-asks`, `conversations-start`, `conversation-thread`, `project-conversation-writes`,
    `conversations-answers`: 53/53;
  - whole-repo `oxlint --type-aware` (exit 0), `tsc --noEmit -p apps/studio` (exit 0), Prettier on every non-docs file:
    clean.

## Decisions and changes

- **The contract has no enum.** A33 types `askReason` as a code (`^[a-z][a-z_]{0,62}$`). The set is what
  `sophia.conversation_ask_capability` (0089) returns, so the unit test reads it from the last migration that defines
  that function: a reason added there fails the test until it has words.
- **`context_assembler_unbound` keeps today's words.** It was not in the approved list. It is the deployment's binding,
  neither an owner's or the allowance's decision nor known to pass.
- **The composer keeps its short form.** Its hint never had «: the question goes to the team.» (it sits beside «Enter
  sends»), and «today's text, unchanged» covers it; the form's note carries the full approved lines.
- **No plan fixed words for these reasons.** `conversation-ask-capability.md` names no copy. `replyEndWords` (the end of
  a request) already says a blocked `runtime_unavailable` «couldn’t be reached», but puts every other reason but
  `replies_not_enabled`, `cleanup_capacity` included, under «aren’t on for this project now». That differs from the
  approved grouping here (`cleanup_capacity` passes). It is left unchanged: another surface, not in this item.

## After the independent review

No P1/P2. The P3s, test first where they change behaviour:

- `d02252c89` the unit test reads any `$tag$` body and fails on a definition it can't read. Its old regex returned
  null on a `$fn$` body (checked with node), so such a migration would have been skipped silently.
- `5ec659e45` / `fdd12bb74` an unknown reason code: red `pw-logs/ask-reason-p3-5-red.txt` (the form's «yet» line not
  found: the fixture served «available»); the fixture now serves any code A33's pattern allows.
- `679102052` an ask blocked mid-session. **The finding did not hold**: the case passed on the unfixed code
  (`pw-logs/ask-reason-p3-2-red.txt`), because every send reads the list again (`ConversationComposer`,
  `invalidateQueries({ queryKey: LISTS })`). It stays as a guard: with that read removed it fails, `Received string:
  "Sophia will answerEnter sends · Shift+Enter, a new line"` (`pw-logs/ask-reason-p3-2-mutant.txt`). New lever
  `allowance=runsOut`. No product change.
- `f7a2440e7` / `d575e8081` «Ask Sophia» described by the reason, desktop and phone: red
  `pw-logs/ask-reason-p3-4-red.txt` (`Expected: "Sophia’s answers are off for this project now"`, `Received: ""`).
  A phone now shows the reason alone (it hid the whole hint); a desktop is unchanged.
- Green: unit 113/113; through the guard (`pw-logs/ask-reason-p3-green.txt`) ask-off, details, question-asks, start,
  thread, writes, answers, widths, panes: 97/97; whole-repo oxlint, tsc, Prettier clean.

## Remaining obligations

- CI is the run on record.
- Luis: whether `replyEndWords` should move `cleanup_capacity` to the «couldn’t be reached» words, to match.

## Next bounded action

- Luis: say whether this joins the next batch. It is pushed only on his word and merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and the hunt report only.
