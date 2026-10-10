# A Done with no reply, checked without racing the feed

> 2026-10-10 · Luis: «Fix flaky Done-with-no-reply room task test». A test's fix only: no product change.

## What was found

- `e2e/room-passage-task.spec.ts`, «a Done with no reply says so, and Try again records it once», failed about one
  run in five, on `main` too: either the row already said «Done by you.» where «Not confirmed. Try again.» was
  expected, or it said «Not confirmed» and then its Try again was gone before the press.
- Why: the test makes the task with `fixture.taskBy(null)`, which records it and moves the project's feed. The feed's
  move reaches the page asynchronously (an event, then the snapshot read, then the tasks read again). Meanwhile the
  Tasks tab, opened at once, reads the tasks itself and shows the row, so Done can be pressed before the feed's read.
  That read then comes after the Done was recorded (its reply lost, the record kept) and brings the task done: the
  row settles, rightly, as «Done by you.», with no Try again to press.
- The product is right: a press with no reply is settled by its own record when a read brings it (as a review's is,
  `room-review`, «a press of mine with no reply is settled by its own record, as the feed brings it»).

## What changes

- The test waits for the feed's read of the new task (a tasks read past the count before it) before it opens the tab
  and presses Done. After that nothing moves the feed: a reply lost moves nothing, and Try again replays the same
  record. What it checks is unchanged: «Not confirmed. Try again.», then «Done by you.», one `task:done` recorded.

## Checks

- Under the machine's guard (1 worker, low priority), the fixed test repeated 25 times: 25 passed. The old test (from
  `main`, `0ccc344d`), repeated the same way as the control: 15 of 25 failed, at both steps described above.
