# Conversations, rows by their last message (C5)

> 2026-10-08 · The next Conversations slice after C4 (`docs/plans/conversations-find.md`), from Luis's queue. The
> field it needs is an A18 proposal for Davide, so it is built behind the vision flag as A18 was: the fixture pages
> answer it (`last=1`, and the demo).

## What changes

- **A row's line is its last message** where the list says it (`lastMessage`, proposed): who said it first («You»,
  «Sophia», a member's name; «Someone» for a member no longer listed), then a line of it. Where the list doesn't say
  it (today's API), the row keeps Sophia's summary.
- The line is part of the row's description, so a screen reader hears it with the title.
- A note sent moves its row to the top with the note as its line (the list is read again on a send).

## Proposed for Davide (not sent)

`ConversationSummary.lastMessage: { author, actorId, text (≤ 140 chars, whitespace folded), at } | null`, additive to
A18's list answer; and later an `unread` count with a read marker. Draft:
the session's scratchpad `davide-a18-lastmessage.md`, for Luis to send or not.

## Checks

- Each row's line, who said it first; the description says it; a note sent moves its row with its line; the summary
  where the list doesn't say it (`e2e/conversations-last.spec.ts`). `gistOf` unit-tested (each author, the fallbacks).
