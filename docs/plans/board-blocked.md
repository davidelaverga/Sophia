# A fifth lane, Blocked, when something is

> 2026-10-11 · Luis: «sigue con los pendientes: … calle Blocked». Informe-30 named it among the board's gaps: a task
> that cannot start because other work is not done sat in «Up next» beside tasks that can, told apart only by a foot
> («After Implement the PDF retry»). No API change: the plan already says what blocks what (`blocked_by`).

## What was measured

- Four lanes: Active · Up next · Unassigned · Complete (closed work folded under them). `laneOf(row)` reads the
  status mark alone: queued and later → «Up next».
- In the demo plan, «Write the export's release note» (blocked by «Implement the PDF retry», which waits on Davide) sat
  in Up next with «Review the retry's candidate», which only waits for a candidate. Both read «Up next»; one of them
  cannot be next.
- A power user scanning for what to unblock had to read every foot in Up next.

## What changes

- **`laneOf(row, rows)`**: a row Up next whose `blocked_by` names an item in the plan that is not complete or closed
  stands in **Blocked**. A blocker outside the plan does not block (nothing is known of it: the board already names
  such a plan as not holding together). A candidate review (`candidate_ready`) is not blocked: it is sequenced, and
  reads «Reviews …».
- **The lane**: Active · Up next · Blocked · Unassigned · Complete, in the order of time; Blocked is shown only when it
  holds something (the board keeps its four lanes otherwise, and its measures). Its head wears the held mark; its tiles
  keep their foot («After …»), which says what each waits on. J and K, the arrows, the threads and the tile's glide
  between lanes follow, as they are written over `.lane`s.
- **The columns**: `.board-lanes` takes its count from `--lanes` (4 or 5); the 1000 px and 760 px breakpoints keep
  their 2 and 1.
- `work.spec.ts`: the lane test names five lanes, Up next without the release note, Blocked with it; the deep case the
  same; a new check that a plan without a blocker shows four lanes.

## States

- Empty: the lane is not shown (no «Nothing blocked» to read on every board).
- The blocker completes: the row glides from Blocked to Up next (its own view-transition name).
- A proposed plan (not operable): a blocked row stands in Blocked as well; nothing in it runs anyway.

## Checks (written first)

- `plan.test.ts`: a row blocked by an active item is in `blocked`; by a complete item, `next`; by an item outside the
  plan, `next`; a candidate review, `next`.
- `work.spec.ts` as above; the mutant with `laneOf` ignoring `rows` fails the lane test and the unit tests.
- `pnpm check` clean.

## Left

- A «why blocked» press on the lane head (open the blocker) is not here: the tile's foot and its thread already point
  to it on hover.
