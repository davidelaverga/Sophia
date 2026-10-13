# Next up, as the page knows it (Codex P2s on #263)

Luis, 2026-10-12: «atiende los P2 en PRs pequeñas». Fourth follow-up to the kit stack's open Codex P2s. This one: the
board's «Next up» line (docs/plans/next-up.md) pointing at a decision already answered, or taking the focus.

## What was measured

Five threads on #263:

- 4249599274: the board's own list of answered decisions resets when the board is drawn anew (another goal and back),
  though the page's answer memory (answers.ts) keeps the answer: Next up can name a decision already recorded.
- 4251419090: two answers in flight, the second recorded first: Next up names the first, its choices disabled.
- 4249599280: a line already up stays through the next answer's write; the line naming the decision being answered
  holds while its choice is disabled.
- 4250191553: the line takes the focus from anywhere in the decisions, including another decision's choice the person
  moved to during the write.
- 4251419101: a task in a closed lane (stopped, cancelled, failed, superseded) with the viewer's request pending is left
  out: Next up says nothing waits, or moves on to the review.

## What changes

- **`answeredHere`** (pure, `next-up.ts`): the decisions answered in this visit are the board's recorded ones and any
  the page's answer memory holds `recorded` or `sending`; not confirmed or refused, still to answer. Next up and the
  palette's «For you» both read it.
- **`waitingFor`** (moved to `next-up.ts`, pure): the tasks with the viewer's request pending, in the board's lane order,
  then those in a lane it does not show.
- **The write** (`useNextUp`'s `decide`): the line goes as an answer's send starts, and the line for what is next comes
  once it is recorded.
- **The focus** (`NextUp`): taken only from the page's body or the disabled choice, never from another control the
  person moved to.

## Checks (written first)

- `next-up.test.ts`: `answeredHere` leaves out recorded and on-their-way answers, not unknown or refused ones;
  `waitingFor` counts a closed task after the board's lanes.
- `e2e/next-up.spec.ts`: focus moved to another decision during the write stays there; answering the decision the line
  names, the line goes at once and comes back naming what is next. Both failed before the change.
