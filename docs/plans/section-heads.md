# A view's section heads, one step above the body

> 2026-10-11 · Luis: «Dale, sigue con las cabeceras de sección a 15–16», the second half of informe-ui-premium §3
> movement 2 (the triad: the view's title, its section heads, its body). UIKIT-24 set the title at 28; the heads stayed
> at the kit's title step, 14 px, one pixel above the body. No API change.

## What was measured (the pane at 1440, every 14–16 px word on the views)

- At 14 px, weight 600, on the 20 px leading, under a view's 28 px title: Goals' `h3.goal-title` (3), the work space's
  `h3.view-subhead` («Research from Sophia»), Knowledge's `button.report-card-title` (6) and its `h3` «Connections»
  (`.connections > h3`), Resources' `span.resource-tile-name` (3), Conversations' `h2` «Conversations»
  (`.conv-list-head h2`). These head a section or a tile: the heads.
- Also at 14 px but not heads: a task tile's title (`.task-tile-title`, 500: a card in a lane), the plan's next step
  (400), Updates' recap lines (400), Sophia's messages in a conversation (400), the mission statement (600, a sentence),
  the mark's word. They all take `--type-title` or a literal 14 and they stay: the token is the body's title step and
  reaches inputs and messages too, so the token does not move.
- The ramp already holds 15 (`type-scale` SCALE; the sheets' titles), and 15 on 20 is on the grid.

## What changes

- **One token for the heads**: `--type-head: 15px`, on the 20 px leading, weight 600 as every heading. The triad on a
  view reads 28 · 15 · 13; 16 was the other candidate and is the personal space's voice size, so 15.
- **Where**: the six selectors measured above (`.goals .goal-title`, `.goal.compact .goal-title`, `.view-subhead`,
  `.report-card-title`, `.connections > h3`, `.resource-tile-name`, `.conv-list-head h2`). Nothing else: a task tile,
  a message, a statement and an input keep the title step.
- Heights: a Knowledge tile's title keeps `min-height: 24px` and two clamped lines (20 → 40 px, as before); a goal's
  head grows by one pixel of glyph, not of line.
- **Five sizes on Tasks** (Codex on #248): with the heads at 15 the board held six (10.5 · 12 · 13 · 14 · 15 · 28),
  and CONTRIBUTING caps a screen at five. A task tile's title is a card in a lane, not a head: it takes the body's
  size and keeps its weight (13/500); the plan's next step (`.plan-next`) takes the body too; the decision's question
  (`.plan-ask-question`) heads its block and takes the heads' step at 400 (15/20). The board reads
  10.5 · 12 · 13 · 15 · 28 on both Tasks fixtures. CONTRIBUTING's scale line now names the heads' 15 and the view's 28.

## Checks

- `e2e/section-heads.spec.ts`: on Goals, Tasks, Knowledge, Resources and Conversations every head computes
  `15px/20px 600`, and on each view a head is larger than the body (13) and smaller than the view's title (28).
- The pinned scales that hold a head: `work` (`.goals`: 14 stays for the task tiles, 15 joins), `resources`
  (`.resources`: measured after the change), the knowledge and conversations lists gain 15.
- `pnpm format`, `pnpm lint`, `pnpm typecheck`; measured in the pane before the push.
