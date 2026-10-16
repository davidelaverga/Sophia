# The browser job's limit, raised to 90 minutes

> 2026-10-16 · CI. The browser job («The room in Chromium, on its fixture page») ran past its 60-minute limit and was
> cancelled.

## Measured

- About 1,710 checks now.
- A quiet runner takes about 45 minutes: #382 ran 1,707 in 45.0, #384 1,705 in 44.7.
- A busy runner was cut off at 60 after 1,584 checks (#399's run, job «exceeded the maximum execution time of 1h0m0s»).
- No retries are configured, so the time is the suite's own.

## Why it matters

- A job cut off is **cancelled**, not failed, so what its unrun checks would have caught is never said.
- Today five PRs reached main with no finished browser job. One of them, #383, broke `room-passage-task.spec.ts`
  (fixed in #407).
- The merge watcher now waits on a cancelled check. A cut-off job therefore blocks the merge rather than letting it
  through, which is right, but it blocks it on every busy afternoon.

## Change

- `timeout-minutes: 90` for the browser job only, with the measures in its comment.
- Sharding would halve the wall time, but it would change the required check's name. It stays a later choice.
