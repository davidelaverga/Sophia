# Find in Personal: when nothing matches, ask Sophia

> 2026-10-13 · Luis: «sigue con los puntos 2–5», after `informe-personal-real.md`, finding 2.

## What was measured

- On the real stack, with a month of conversation, Find matches words as written: «Porto» finds the one day that says
  it, «vacation» says «No match» although that day speaks of «a week in Porto in spring». After «No match» there is
  nothing to do but change the words.
- Her week's look offers «Talk about it», which sends her a line at once (`actions.start`): a press that says what it
  sends, and sends it.

## What changes

- **«No match», with no earlier days left to read, offers «Ask Sophia»** beside the count (its name: «Ask Sophia about
  “vacation”»). Pressed, Find closes and the line «What did I tell you about vacation?» goes to her as yours, as «Talk
  about it» does. With earlier days still to read, «Look further back» comes first, as now.
- **Not offered while the space is locked** (no field to send from), so it is never a press that does nothing.

## Checks

- `conversation-view.test.ts`: `askAbout` says the line with the words as typed, trimmed.
- `e2e/personal-find-ask.spec.ts`: «vacation» shows «No match» and the press; pressing it closes Find and sends the line
  (the fixture's `sent`), shown as yours; with a match there is no press.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`.
