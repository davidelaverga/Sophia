# The next ask: the field proposes what comes next, Tab takes it

Luis, 2026-10-12: «Making it smart… como en Claude, que al terminar un task la barra propone lo siguiente y Tab lo
acepta». First of the moves in `evaluacion-2026-10-12/informe-inteligencia.md` (#1, with the shared piece).

## What was measured

On the fixture at 1280: in a conversation, «Sum it up» pressed and answered, the field offers the same three quick asks
it offered before («Sum it up · What’s still open? · What did we decide?», a fixed list in `ConversationComposer.tsx`),
and its placeholder stays «Continue this question with the team». Sophia's answer had just said nothing was decided,
with one question open in the conversation and one proposal («Map first, list second») waiting in the context pane: the
next ask was there to read, and the field offered the one just made.

## What changes

- **A suggestion in the field, once Sophia has answered.** When the newest message is hers and the field is empty, the
  field's placeholder is the next ask (one, never a list) and a key cap «Tab» stands in the field beside «Ask Sophia».
  **Tab** (or → at the empty field's end) puts the words in the field, with «Ask Sophia» on: the person reads, edits or
  sends with Enter; nothing is sent by a key that only accepts. **Esc** puts it away: the field is quiet until her next
  answer (the next suggestion does not take its place at once, which would nag), and a suggestion put away does not
  come back in that conversation while the page lives. Typing hides it (the placeholder is gone with the first letter);
  with words in the field Tab is Tab again.
- **Which ask** (`next-ask.ts`, pure, a node test): from what the Studio already holds, in this order, the first that
  was not asked lately in this conversation (the viewer's last six messages, compared without case or end punctuation)
  nor put away:
  1. a proposal waiting in the brief: «Should we go with “Map first, list second”?», *because it is proposed and not
     decided*;
  2. «What’s still open?» while the conversation has open questions, *because 1 question is open here*;
  3. «What did we decide?» while the brief has accepted decisions, *because the brief has 4 decisions*;
  4. «Sum it up».
  A summary covers what was decided (her summary says it): once «Sum it up» was asked, «What did we decide?» counts as
  asked. Nothing fits: no suggestion, the placeholder as it was. Saying nothing beats guessing.
- **The quick asks stop repeating.** The row shows the three asks less any asked lately and less the one in the field,
  in the same order; it keeps its height when it empties, so the thread never jumps.
- **Why, on asking.** The key cap's tip says the reason in words («Because it is proposed and not decided»); the field
  is described by the suggestion and «Tab puts it in the field», for a screen reader.
- **The shared piece** (`packages/ui`): `nextAskKey` (pure: which key accepts, which puts away, and only at an empty
  field with a suggestion) and `NextAskHint` (the key cap with its tip and its description). Home, a task's sheet and
  the personal space take the same piece next (informe-inteligencia #4).

## States

- Sophia asked and not yet answered: no suggestion (the newest message is the viewer's).
- A message held unconfirmed, or a refusal standing: no suggestion (the field has its own note to say).
- A viewer (no field): nothing.
- Before the brief is read: the conversation's own asks only (open questions, a summary); the proposal joins once read.

## Honest about its source

The suggestion comes from the state the Studio reads (the thread, the conversation's open questions, the brief); it is
never presented as Sophia's words. When the service returns a `next` with her answer (a small amendment, as A15 was),
the same piece shows it, its reason hers.

## Checks (written first)

- `next-ask.test.ts` (studio): the order; nothing while the newest message is the viewer's; nothing asked lately or put
  away comes back; a summary covers the decisions; the quick row less the asked and the suggested.
- `next-ask-key.test.ts` (ui): Tab and → accept only at an empty field with a suggestion; Esc puts it away there;
  modifiers and composition leave the key alone.
- `e2e/next-ask.spec.ts`: opened on a conversation whose newest message is the viewer's, no suggestion; «Sum it up»
  answered, the placeholder is the proposal's ask, the key cap stands, the quick row holds no «Sum it up»; Tab puts the
  words in the field with «Ask Sophia» on and the focus kept, Enter sends them; Esc puts it away and it stays away; with
  words written Tab leaves the field.

## Left

- Home, a task's sheet, the personal space (informe #4); «Next» after resolving something (#2); the palette (#3).
- `next` from the service (an amendment), and Sophia's own reasons.
