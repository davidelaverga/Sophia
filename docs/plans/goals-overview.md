# Goals as an overview: progress, who's on it, what's in the way, grouped by state

> 2026-10-13 · Luis, on Goals after #300: «¿Enserio para ti goals vale 20 dólares? Lo noto sencillo… siento que
> pudiéramos hacer más visualmente». Shown a mock (`evaluacion-2026-10-13/goals-mock/`), then the scenarios: «Me gusta
> esa nueva dirección pero recuerda lo minimalista y prepara los escenarios… muchos goals, los estados… piensa outside
> of the box y en el quality of life del user». Builds what the API serves; what it doesn't is asked in #303.

## What was measured

- Goals (with #300) lists every goal as text: status, title, outcome, criteria, and for a planned goal «N of M tasks
  done» and «Open in Tasks». Every goal looks alike whatever its state; nothing says what stands in its way or who
  works on it; with many goals it is one long column.
- The served board already holds, per goal: each task's lane, its doer (person, agent), its pending waits by kind
  (decision, permission, other work, capacity) and whether anything waits on the viewer (`attention`).

## What changes

- **Grouped by state, in the order a person acts on them**: In motion (running, checking, holding, stopping), Ready,
  Paused (held, stopped), Done (completed, folded to one line that opens).
- **A goal in motion is a card**: its state, its title, its tasks as a bar by lane (the board's own colours) with «N
  of M done», what's in the way in one line («1 waiting on a permission · 1 blocked», amber; «Nothing in the way»,
  quiet), the faces of who's on it (three at most, then «+N»), and «Open in Tasks». A single goal in motion takes the
  row's width.
- **Ready and paused goals are rows**: their state, their title and one line («3 tasks planned», «No plan yet», «Held
  · 2 of 6 done»), and «Open in Tasks» where a plan exists.
- **Eight states, one word and one tone each**, and the line under them: Ready (planned / no plan yet), Running
  (progress), Checking (against its criteria), Holding (stops after its current step), Held, Stopping (finished work is
  kept), Stopped, Completed. Who held or stopped it, and when, waits for #303.
- **Many goals (more than six)**: a search (titles, outcomes, tasks and who does them) and filters with counts: All ·
  In motion · Needs you · Ready · Paused · Done. «Needs you» is the goals where something waits on the viewer.
- Minimal: no new colours, no icons beyond the faces; the card is the kit's card. Notes on a goal (the mission
  ledger's entries for its `goalId`) come next, in their own change.

## Checks

- `goals-glance.test.ts`: the group of each state, the line under each state, what's in the way summed by kind, the
  filters and the search.
- `e2e/goals-overview.spec.ts`: the demo's three goals in their sections (the running one a card with its progress and
  what's in the way, the ready one a row, the completed one folded and opened); nine goals (`work.html?goals=9&view=goals`)
  with a search and filters (Paused shows the held and the stopped goal, a search finds by outcome); «Open in Tasks»
  opens the goal's plan; on a phone the cards stack. It takes in `e2e/goals-progress.spec.ts` (#300), whose «N of M
  tasks done» line the card replaces; `views-goals.spec.ts` opens the folded Done before counting three goals.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; the Goals, Tasks and
  Home suites through the guard.
