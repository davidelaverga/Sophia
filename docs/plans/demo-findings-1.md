# Demo findings, batch 1

> 2026-11-22 · Studio QoL. Six small findings from the test before the demo (findings 3, 9, 10, 11, 16, 17). One
> commit each, a test first for each that fails before the change. No API change, no new endpoint.

## #11 · «Sent.» stays after the invitation is cancelled

- Seen: Invite → Members, send, then Cancel invitation. «Sent.» (`InviteSheet.tsx`, `EMAIL.sent`) stays under «Send
  invitation» next to «1 closed».
- Why: `SentNote` reads only the send's own result (`useAdmission`); the list's later copy of that invitation is never
  asked.
- Change: the form is given the list, and `sentNoteShown` (access-view.ts) hides the note once the list's copy of the
  invitation it sent is cancelled (`revokedAt`). Not yet in the list (a refresh on its way): shown, as today. Same rule
  for a guest's emailed link (Guests tab).
- Test: unit, `access-view.test.ts`; e2e, `invite-members.spec.ts` (send, cancel: «Sent.» gone, «1 closed» there).

## #16 · «All 1 project»

- Seen: Home with one project ends its index with «All 1 project».
- Change: the closing link to Work shows only with two projects or more (`showsAllProjects`, places-view.ts). With one,
  its row already opens it. With none, «Start a project» as today. The arrow's alignment is left as it is: only the
  link that this hides was reported, and a change to it would be a separate look.
- Test: unit, `places-view.test.ts`.

## #17 · First run: two guides at once; Tasks' empty line

- Seen: while Home's first run shows its steps, the keys' tip («Tip: press ? to see the keys for this view.») shows in
  the corner too.
- Change: the first run's steps are marked `data-guide="shown"`, its held place (while it is decided)
  `data-guide="held"`. The keys' tip does not show while either is on screen, nor for the rest of the page once steps
  have shown (`keysTipShows`, keys-tip.ts): a tip that is not shown is not counted (`countShowing` runs only when
  shown), so its turn comes on a later visit. A held place that ends with no steps (an account with archived projects)
  holds nothing back after it, or such an account would never see the tip. While the projects are still read and the first run
  has not ended on this browser (`firstRunPending`, first-run.ts), Home itself carries `data-guide="held"`: the tip
  would otherwise show, and be counted, a moment before the first run comes (review P2-1). The place under the greeting
  is not held for it (`firstRunHolds` unchanged): Home's skeleton stays as before. The home fixture mounts the tip with
  `keys=1`.
- Seen: in an empty project, Tasks says «No goals yet. They'll come from your conversations with Sophia in the room.»
  `GoalList` draws both Goals and Tasks (`controls`), and `NoGoals` is that shared empty state.
- Change: under Tasks: «No tasks yet. Tasks start when a goal has a plan.» Goals keeps its line.
- Test: unit, `keys-tip.test.ts` (`keysTipShows`); e2e, `keys-tip.spec.ts` (first run on screen: no tip, nothing kept)
  and `views-goals.spec.ts` (Tasks' line).

## #3 · Hold: «Held» and «The status changes when Sophia confirms» together

- Read: Hold is admitted by the API (`admit_goal_command`): the goal moves at once to `holding`, and to `held` once the
  runtime confirms (demo-goals.ts; the demo settles it 600 ms later). The chip shows `goal.status` from the feed, so
  «Held» is the confirmed state, not an optimistic one. The line under the controls is the admission's own state
  (`useAdmission`), which never reads the goal again: it stays «Sent · Hold requested. The status changes when Sophia
  confirms.» after the status changed.
- Choice: the chip is right; the line is the stale one. Once the goal's status is where the command leads
  (`commandShown`, labels.ts: Hold → held, Stop → stopped, Resume → running or checking), the line goes: the chip
  already says it. While it is on its way (holding, stopping) the line stays as today. Request review leaves the status
  as it is, so its line is unchanged.
- Test: unit, `labels.test.ts` (`commandShown`); e2e, `goal-controls.spec.ts` (Hold in the demo: «Held», and no
  «when Sophia confirms»).

## #10 · An invitation refused on Accept leaves no way out

- Seen: signed in with another address in dev mode (no `otherAccount` check there), Accept fails with «This invitation
  is for another email address», and the only control is the same Accept.
- Change: a failed Accept shows the existing way home (`HomeLink`, «Go to Sophia», as the closed-link screens do). When
  the API's refusal is the address one (`wrongAddress`, access-view.ts: 403 «This invitation is for …», the words
  0010 raises and the API keeps), Accept gives way to `SignOutAs`, the same sign-out the Supabase branch offers before
  Accept.
- Test: unit, `access-view.test.ts` (`wrongAddress`); e2e, `join.spec.ts` with the join fixture signed in
  (`signed=outsider`) and its accept refused (`accept=other` | `accept=down`).

## #9 · Hold and Stop too small on touch

- Seen: at 390 px, Hold and Stop are 28 × 24 px and close together.
- Change: on a coarse pointer only, a goal's text presses (`.controls .control-row .text-button`) reach to at least
  44 × 44 px through their `::after` (centred, never less than 8 px past each side), and the row's gap is 16 px, twice
  that reach, so the two targets never meet. Nothing changes for a fine pointer.
- Test: e2e `goal-controls.spec.ts @phone` (each target at least 44 × 44, Hold's ends before Stop's starts); the CSS
  fences in `src/app` still pass.
