# The palette knows: what waits on you first, then what you used last

Luis, 2026-10-12: «Making it smart… Continúa». Third move of `evaluacion-2026-10-12/informe-inteligencia.md` (#3).

## What was measured

On the fixture's Tasks (`/room.html?demo=1&place=work`, 1280), ⌘K with nothing typed lists the same twelve rows in the
same order every time: Home, Your projects, Go to Studio, Go to Conversations… then This view, then Do
(`commands.ts:98`, the groups' order). The board under it shows «1 decision for you» and a task waiting on the viewer;
neither is in the palette, and a command used a moment ago is as far down as it always was.

## What changes

- **«For you» first.** A new group, `you`, leads the palette. The board offers one command for each thing waiting on the
  viewer there: «Decide “Ship the retry before the report pane’s review…”» (opens the decisions on its first choice) and
  «“Implement the PDF retry” waits for you» (opens its sheet), the same sources as the line after an answer
  (`next-up.ts`). Off the board, nothing is offered in it: the group is not shown.
- **«Recent» next, with nothing typed.** The last three commands run from the palette, the newest first, if they are
  offered now, each row labelled «Recent» instead of its group; then the rest in the groups' order, those three left
  out. Typing ranks as before: what was used last never outranks what the words name.
- What was used is kept in the browser (`localStorage`, guarded: blocked storage keeps nothing and breaks nothing), by
  command id, five at most. «For you» commands are not kept: they name things that pass.

## Checks (written first)

- `commands.test.ts`: with nothing typed, «For you» first, then the recent ones offered now (newest first, three at
  most, labelled «Recent»), then the rest by group without them; typed, the ranking as before with each row's group.
- `palette-recent.test.ts`: kept newest first, five at most, a command once; unreadable storage reads as none.
- `e2e/palette-knows.spec.ts`: on the board's page with its shell's own ⌘K (`work.html?viewer=davide`; one host, as in the app, Codex on #264; the room's
  fixture has no viewer id, so nothing there is anyone's «for you»), the first rows are «For you», the viewer's decision
  then the task waiting for them, and Enter opens the decision on its first choice; in the room, a view gone to from the
  palette comes back first as «Recent» on the next opening.

## Left

- Tab to complete the typed words to the first row's (the palette's field), and the needs of other projects (Home's
  list, A15) in «For you» from anywhere in the project.

## After the review (Codex on #264, round 2)

- A decision is offered only where the board can take an answer (`onDecide` present): a read-only proposal or an
  unavailable board offers none.
- The fixture's second `CommandsHost` (`palette=1`) is gone: the page's ProjectShell mounts the one host, as the app
  does; the spec reads each command once.
