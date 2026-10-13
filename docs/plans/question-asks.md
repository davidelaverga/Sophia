# A question asks Sophia too: «?» with «Ask Sophia» off, Tab turns it on

Luis, 2026-10-12: «Procede». Fifth move of `evaluacion-2026-10-12/informe-inteligencia.md` (#5).

## What was measured

In a conversation, with «Ask Sophia» off (the chip unlit, «To the team only» under the field), a message that ends in a
question mark goes to the team alone: nothing in the field notices it is a question. Turning her on is a press on the
chip, or Tab to reach it and Space; most people send first and notice after.

## What changes

- **The field notices.** Words that end in «?» (or «？»), with «Ask Sophia» off and nothing held, show the same key cap
  as the next ask («Tab» in the field, beside the chip); its tip says «A question: Tab asks Sophia too», and the field's
  description says it to a screen reader.
- **Tab turns «Ask Sophia» on** (`questionKey`, pure, in `packages/ui` beside `nextAskKey`): the words stay, the focus
  stays in the field, the key cap goes, and «Sophia will answer» shows under the field; Enter sends. Without a question
  mark, with her on already, with a modifier, or while composing, Tab is Tab.
- One key cap at a time: the next ask's at the empty field, this one once words are written.
- `NextAskHint` takes its description as given (`description`), so both say what Tab does in their own words.

## Checks (written first)

- `next-ask-key.test.ts`: `isQuestion` (the end's «?», after spaces; «？»; none in the middle); `questionKey` asks only
  for a plain Tab at a question with «Ask Sophia» off.
- `e2e/question-asks.spec.ts`: «Ask Sophia» off, a question typed: the key cap stands; Tab turns her on with the words
  and the focus kept, and Enter sends with her asked (her answer comes); no question mark: no key cap, Tab leaves the
  field; her on already: no key cap.

## Left

- The same in a task's «Ask about this task…» field and the personal space, with the next-ask piece (informe #4).
