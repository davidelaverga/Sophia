# Nothing found: ask Sophia instead

Luis, 2026-10-12: «Procede». Seventh move of `evaluacion-2026-10-12/informe-inteligencia.md` (#7).

## What was measured

In the fixture, a search that finds nothing ends there: Knowledge says «No reports match these filters.» with «Clear the
filters», and Search says «Nothing in this project matches “…”.» The words typed were a question the project's Sophia
could take; the page offered no way to hand them to her, and the person types them again elsewhere.

## What changes

- **Knowledge**, words typed and nothing matching: beside «Clear the filters», «Ask Sophia about “retention”».
- **Search**, nothing matching: under its line, the same press.
- **The press** opens Conversations with a new conversation's form, its question the words searched and «Ask Sophia»
  on, the field focused as the form opens; nothing is sent until Start. A form whose words are on their way (held) keeps
  them: the press only shows it. A viewer, who cannot start one, is shown Conversations.
- Offered only where it leads somewhere: inside a project's shell, with Conversations in the project's views (the vision
  flag, `VISION`); elsewhere nothing is offered (no dead affordances).
- `Arrival` (project-go.tsx) gains `{ view: 'conversations'; ask }`, taken once as the others are; `useAskSophia()` is
  the press's way there, null where it would lead nowhere.

## Checks (written first)

- `e2e/ask-instead.spec.ts`: Knowledge, words matching nothing: the press, and Conversations' form with the words as the
  question and «Ask Sophia» on; Search, the same from its empty answer.

## Left

- Tasks' search (it dims rather than empties), and Home's needs and the personal space (another place's Sophia).
