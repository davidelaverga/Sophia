# Conversations: starting one is writing (C8)

> 2026-10-08 · The third of C6–C9 after Luis's «¿vale 30 dólares?» look at Conversations, stacked on C7
> (`conversations-decide.md`). No API change: A18's start still takes a title, a first message and «Ask Sophia».

## What reads as unfinished

- «New conversation» is a form: «QUESTION» and «FIRST MESSAGE» in mono capitals, two boxes to fill before Start
  wakes, and nothing to start from.
- The project already knows what waits for a decision (the context's «Still open»); starting a conversation about one
  of them means typing it again.

## What changes

- **One question, then go.** The question is the one field that matters: «What do you want to figure out?». The
  first message is optional («Context, if it helps»); left empty, the question is the first message. Start wakes as soon as
  there is a question; Enter in the question starts it.
- **Start from what's open.** Under the question, up to three of the project's proposals waiting (the brief's
  `pending`, the same read as the context, newest first, only those that fit a question's 120 characters) as
  presses: one fills the question. None waiting, none shown.
- **Quiet labels.** Sentence case in the app's sans, as the rest of the view (C9 does the rest of the view's labels).
- Held writes stay as they were: with no reply, Start sends the same intent again under its key, never twice.

## Checks (written first)

- `new-conversation.ts`: the ask from the fields (an empty first message is the question), ready with a question only,
  the starters (pending only, three at most, none already the question).
- The form: one question starts a conversation whose first message is the question; a starter fills the question; the
  labels are not mono; the form keeps to the app's sizes and reads at 4.5:1.
