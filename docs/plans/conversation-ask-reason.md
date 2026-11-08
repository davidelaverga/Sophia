# Conversations: why Sophia doesn't answer here

Source: finding 3 of the 2026-11-08 hunt on main (`evaluacion-2026-11-08/caza-main.md`, «El aviso "Sophia doesn’t answer here yet" ignora el motivo que la API ya manda»). Luis 2026-11-08: «Procede y corrige», and he approved the three lines below word for word. Studio only: the API already sends the reason (`conversation-ask-capability.md`, 0089).

## The gap

Since 0089 the list's `capability.askReason` says why Sophia won't answer an ask here now. The Studio reads only `ask === 'available'`, so every reason says «Sophia doesn’t answer here yet», in the open conversation's composer and in the new conversation's form. Where her earlier answers show right above, and where the allowance ran out or the grant ended, «yet» is false; `runtime_unavailable` and `cleanup_capacity` pass by themselves.

## The reasons

A33 types `askReason` as a reason code (a pattern, no enum). The set is the one `sophia.conversation_ask_capability` returns (0089), the only function that writes it:

| Reason | Kind | Words |
|---|---|---|
| `runtime_unavailable`, `cleanup_capacity` | passing: the runtime is away or busy ending replies | «Sophia can’t be reached right now» |
| `replies_disabled`, `grant_disabled`, `grant_expired`, `calls_exhausted` | an owner's or the allowance's decision | «Sophia’s answers are off for this project now» |
| `replies_not_enabled`, `context_assembler_unbound`, null, any other | not set up for this reader (0089's privacy answer), or not known | «Sophia doesn’t answer here yet» (today's) |

`context_assembler_unbound` is not in Luis's list. It is the deployment's binding, neither an owner's nor the allowance's decision, nor known to pass, so it keeps today's words.

No words name an amount, a cap, a count or an expiry: the reason carries none (0089), and the words add none.

## What changes

- **One pure function**, `askUnansweredWords(reason)` in `conversation-list.ts`, next to `replyEndWords`: the clause above for a reason (or null).
- **The list's reader** (`useReader`) passes `askReason` along with `answers`, down to the two places that said it:
  - the composer's hint under the field: the clause, as today's hint is («Sophia doesn’t answer here yet»);
  - the new conversation's note under «Ask Sophia», and the checkbox's description: the clause, then «: the question goes to the team.», as today's note is. So the form says Luis's three lines exactly.
- **Fixture**: `ask=<reason>` serves that reason (`ask: unavailable`); `ask=off` stays `replies_not_enabled`.

## What does not change

- `replyEndWords`, the words under a request that ended unanswered. Its blocked words already differ by reason. It groups `cleanup_capacity` with the «aren’t on» words; this change does not touch them (see the handoff).
- When the hint and note show, the quick asks, and `answers` itself.

## Checks (written first)

- Unit (`conversation-list.test.ts`): each reason 0089 can return, read from the migration itself, has its expected words in the test's table, so a reason added there fails the test until it is placed; null and an unknown code say today's words.
- E2E (`conversations-ask-off.spec.ts`): with `ask=calls_exhausted`, an open conversation's composer says «Sophia’s answers are off for this project now», never «yet»; the new conversation's form says the «off» line; with `ask=runtime_unavailable`, the form says the «can’t be reached» line.

## After the independent review (no P1/P2; P3s)

- The unit test reads the function's body under any `$tag$` pair, and fails where a migration defines the function in a body it can't read.
- The fixture's `ask=` serves any code A33's pattern allows; an unknown one says today's words (e2e).
- An ask blocked mid-session: every send already reads the list again (`ConversationComposer` invalidates `LISTS`), so the hint says why from that send. No product change; a guard case with a new lever, `allowance=runsOut`, which fails when that read is removed.
- The composer's «Ask Sophia» is described by the reason (`aria-describedby` to the hint's words) where she won't answer. A phone, which hid the whole hint, now shows the reason alone, without the keys; a desktop looks as before.
- Left for Luis: `replyEndWords`' grouping of `cleanup_capacity` and `context_assembler_unbound`.
