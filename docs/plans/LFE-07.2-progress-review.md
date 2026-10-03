# LFE-07.2: a progress review you can see, in Tasks

> 2026-10-03 · Luis · design note before code, revised after its independent review and Luis's choice · goal: [LFE-07](../execution/2026-10-01-unified/frontend/LFE-07.md) §07.2, with SCM-04 G3

## What the spec asks

"Review work progress creates or joins the actual bounded lead review and immediately shows a pending receipt. Its result distinguishes observation, interpretation, uncertainty and proposed intervention. Routine continue updates last-reviewed quietly; material changes show evidence and a way to challenge" (LFE-07 §07.2).

The lead's recipe adds four rules (`06_LEAD_RECIPES_AND_REVIEW` §4–5):

- the answer is an admitted review, never an immediate verdict;
- a manual review is never dropped;
- the reviewer may conclude "insufficient evidence";
- an unfunded review is said as awaiting review, not as success.

PLAN-01 joins a review already running instead of starting a second one. PLAN-04 makes up no attention when there is nothing to do.

## One button: the goal's Request review

The goal already has **Request review**, beside Hold and Stop (`WorkControls`, `GoalCommand.request_review`). It is wired to the live API:

- it says its pending receipt at once ("Sending review request…", then "Sent");
- it retries an unknown outcome with the same key;
- it shows only to editors and admins.

A second "Review progress" on the board would ask for the same thing twice, so Luis chose to keep **one button** (2026-10-03). LFE-07.2 makes what follows the request visible instead.

## Three slices, one pull request each

1. **The review, said (this note's first PR):** the goal's quiet line shows the review that is running, joined or awaiting, and how the last one ended. A routine end stays in that line (PLAN-01, PLAN-04).
2. **The result (done in attempt 4):**
   - a card in four parts: observed, reading, unsure and proposed;
   - each Observed line is led by its evidence (what kind, how long ago it was observed) and ends with what it was;
   - a result from an older revision says so, and its proposal is only read;
   - it shares the slot under the bar with the decisions, one at a time;
   - a proposal waiting on the viewer's own open decision opens it. One waiting on someone else's names them.
3. **Challenge:** the coordination contract has no command kind for it yet. It is proposed as `context_update`, with `caused_by_command_id` set to the review.

## The goal's line

The line sits after the plan's revision, on the goal's second line (`PlanNext`). It is quiet, in the small size.

- **Running:** a pinging dot, which stays still under reduced motion, and one of:
  - "The lead is reviewing · asked by you 20 s ago";
  - "asked by Davide 3 min ago";
  - "· scheduled".

  If the review is of an older revision, it ends "· of r1". There is only ever one review running: asking while one runs joins it (PLAN-01). The request's own receipt is Request review's.
- **Awaiting:** "Awaiting review: the project's allowance is spent. Davide can extend it." It is shown in amber, and the request still stands.
- **Ended:**
  - "Reviewed 12 min ago · no change";
  - "· not enough to tell until *the retry passes*";
  - "· a change proposed" (its card opens from the pill in the board's bar);
  - "The last review didn't finish".

  None of these makes a card or a `role=status` announcement (PLAN-04).
- **Before the first review:** nothing.

## Data (a proposal for SCM-04)

- **The request:** today Request review sends `GoalCommand.request_review`, which is live.
- **The binding target:** the contract already names the right route, `requestProgressReview` (`POST /projects/{id}/progress-reviews`, S1-11).
  - It takes `{goalIds, questionSourceId, expectedMissionRevision}` and returns a pending `AcceptedJob`.
  - It "coalesces scheduled/event/manual review while retaining the manual question": that is PLAN-01's join.
  - The API doesn't implement it yet.

  When it does, Request review should switch to it, so its receipt becomes the job's pending state. No new request shape is proposed.
- **Read shapes on the plan:**
  - **`WorkPlan.active_review`:** `{review_id, plan_revision, state: 'running' | 'awaiting_allowance', asked_by | null, asked_at, allowance_owner | null}`. `asked_by` is null for a scheduled review.
  - **`WorkPlan.last_review`:**
    - `{review_id, plan_revision, completed_at, checkpoint {label} | null}`;
    - `outcome` is one of `no_change`, `insufficient_evidence`, `recommendation` or `failed`.

The fixture answers the goal's command (`fixture-api`'s command route) as the lead would:

- with no review running, it starts one, which ends after 2 s as `review=` says: `no-change` (the default), `insufficient` or `failed`;
- with one running, it joins it;
- `review=running`, `scheduled`, `old` and `awaiting` open with a review in that state.

## Not in this slice

- Scheduled reviews and their interval (SCM-04's timer).
- Asking Sophia for a review by voice or chat.
- The result card and Challenge (slices 2 and 3).

## Checks

- **Asked:** the line says the lead is reviewing, asked by you, with its dot. A routine end leaves only "Reviewed … · no change", with no `role=status`.
- **Each ending:** insufficient names its checkpoint, and failed says it didn't finish.
- **PLAN-01:** asked while Davide's review runs, it is still that one review, still named as Davide's, and one command was sent.
- **Who and which:** a scheduled review, a review of an older revision, and one awaiting its allowance are each said as such.
- **Reduced motion:** the dot is still.
- **Phone:** the line wraps whole.
- **Type:** the board stays on the type scale.
