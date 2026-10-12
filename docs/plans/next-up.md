# Next up: after an answer, the board names what waits on you next

Luis, 2026-10-12: «Making it smart… Continúa». Second move of `evaluacion-2026-10-12/informe-inteligencia.md` (#2).

## What was measured

On the fixture (`/work.html?viewer=davide&review=material`, 1280): Davide answers his decision with the keyboard (the
first choice focused, Enter). The choice he pressed is disabled while the answer goes, so the focus falls to `body`
(read: `document.activeElement` is `BODY`, outside the board), and the only word is «Your choice is recorded. The plan
is updating.» Meanwhile a task on the same board waits for him (its sheet asks «What happens if I say yes?») and the
lead's review proposes a change in the bar: the next thing was there, and the page lost his place instead.

## What changes

- **A line under the bar once the viewer answers** (`NextUp`): «Next: “Implement the PDF retry” waits for you →», a press
  that goes there. It takes the focus as the answer goes (from `body`, or from inside the decisions, never from
  somewhere the person moved to meanwhile), so the keyboard continues with Enter.
- **What is next** (`next-up.ts`, pure, a node test), in this order, on this board:
  1. another decision of the viewer's still answerable here, not answered in this visit: «Next: decide “…”»; the press
     opens the decisions on its first choice;
  2. a task waiting for the viewer (its wait is theirs to answer), in the board's lane order: «Next: “…” waits for
     you»; the press opens its sheet;
  3. a review that proposes a change, waiting in the bar: «Next: the lead’s review proposes a change»; the press opens
     its card;
  4. nothing: «Nothing else here waits on you.», a status that holds the focus and leaves when the focus does.
- The line goes when its press is used, when the decisions' pill is pressed, or (nothing next) when the focus leaves
  it; another answer replaces it.
- Words cut at a word with an ellipsis past 48 characters, inside the quotes.

## Honest about its reach

This board only: what waits on the viewer elsewhere is Home's list (A15). A decision answered on another device is not
known to have been answered here until the board is read again; it may be named once more, and its press shows it
decided.

## Checks (written first)

- `next-up.test.ts`: the order; the answered and those answered in this visit left out; nothing next said; long words
  cut.
- `e2e/next-up.spec.ts`: answered by the keyboard, the focus is on the line's press, not on `body`; the line names the
  task that waits for the viewer; Enter opens that task's sheet; the pill closes the line.

## Left

- The same line after Allow or refuse in Resources and after «Mark as seen» in Updates, with Home's list as the source
  across projects (informe #2, the other two moments).
