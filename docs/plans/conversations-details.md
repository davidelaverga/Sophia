# Conversations: the details (C9)

> 2026-10-08 · The last of C6–C9 after Luis's «¿vale 30 dólares?» look at Conversations, stacked on C8
> (`conversations-start.md`). No API change.

## What reads as unfinished

- The context's parts are labelled in violet mono capitals («THIS CONVERSATION», «ACCEPTED DECISIONS», «STILL OPEN»),
  louder than what they label; Updates and Knowledge already dropped them.
- «and 2 more» under the accepted decisions is words: the two others can't be seen anywhere here.
- Under the field, «Sophia will answer» and «Enter sends · Shift+Enter, a new line» are mono, in the smallest size.
- On a phone the demo's label sits on the conversation's field (its place above the dock, C8 of Knowledge, lands on it).

## What changes

- **Labels in words:** the context's labels in the app's sans, sentence case, in the second ink; the hint under the
  field the same, at the small size.
- **«and 2 more» opens:** a press that shows every accepted decision (and every proposal waiting), «Show fewer» to fold
  them again; it says whether it is open (`aria-expanded`).
- **The demo's label steps away on a phone's conversations:** their field fills the phone's foot, where the label sat;
  there it hides, and everywhere else it keeps its corner. (Under the page's surfaces instead, it vanished everywhere:
  the panes are opaque.)

## Checks (written first)

- `conversation-list.ts`: every accepted decision, newest first, when all are asked for.
- The context's labels are not mono nor capitals; «and 2 more» shows five decisions and says it is open; «Show
  fewer» folds back to three.
- On a phone, with a conversation open, the demo's label is not shown; on Knowledge it still is.
