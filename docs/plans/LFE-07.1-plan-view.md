# LFE-07.1: the smallest useful plan, in Tasks

> 2026-10-03 · Luis · design note before code · goal: [LFE-07](../execution/2026-10-01-unified/frontend/LFE-07.md) §07.1, with SCM-04 G2

## What it shows

LFE-07.1 asks for the plan the technical lead made: outcome, scope, next checkpoint, team and roles, dependencies, and the decisions it reserves. Assumptions stay apart from accepted choices, and any later edit names the plan revision it changes.

## Where

It goes in **Tasks** (`view="work"`), under the goal it serves. It is not a separate screen (`07_STUDIO_VOICE_AND_ARTIFACTS`: "a supporting Work view, not a replacement screen full of agent avatars"). It speaks the Tasks view's language:

- the `view-head`;
- the goal's ruled row, with its controls, which stay as they are;
- a `view-subhead` "Plan", with its revision and state;
- the work pulse on the right.

## The view, top to bottom

1. **The goal**, as today. It carries the outcome and its criteria.
2. **Plan · r2 · Accepted**, or Proposed, which reads as not accepted yet. Superseded and withdrawn plans aren't shown.
3. **Next checkpoint:** one line, the next meaningful point (SCM-04's "understandable next checkpoint").
4. **Its work, one ruled row per item:**
   - the purpose;
   - who does it, from the item's assignment: the owner's picture, their tool's logo and the session's role, as Resources shows them. A person is shown by name. "Unassigned" is said as such;
   - when it starts: "Starts now", "After *Implement the PDF retry*", or "When its candidate is ready";
   - what its session reports: Working, Waiting or Queued. Nothing is shown before it starts;
   - a child (the review of a build) sits under its parent. A blocker is said as "After …", never drawn as nesting.
5. **Assumed:** what the plan takes as true but nobody accepted, apart and quieter.
6. **To decide:** each reserved decision, with who decides it and its choices. The choices are read, not pressed, in this slice. Nothing looks clickable that doesn't act.

There are no percentages, timers or invented progress.

## Data

`sophia.work.plan.v1` (`contracts/coordination/work-plan.schema.json`) carries the revision, the state, and the items with their assignee, blockers, parent and activation. It doesn't carry the outcome, the checkpoint, the assumptions or the reserved decisions, though `06_LEAD_RECIPES` §3 puts the last two in the plan.

The Studio reads the schema as it is, plus a proposal for SCM-04:

- `goal_id`;
- `next_checkpoint {label, item_id}`;
- `assumptions [{id, text}]`;
- `decisions`, using `decision.v1`'s shape plus a `question`.

The outcome is the goal's. Who does an item comes from the resource whose session has that work as its assignment (LFE-06's `Session.assignment.workId`).

## Revised after Luis's evaluation

The first version was "all mixed", so the view now has one thing to read first:

1. the goal in two lines;
2. the plan's head, with a tally of where its tasks stand;
3. the next checkpoint;
4. what waits on someone's decision, raised;
5. one line per task, ordered by what moves, with a mark, where it stands, and who does it as a picture with a tool badge;
6. Assumed and Decided folded into one line.

Hovering a task lights what it waits on. The details and the measurements are in the [handoff](../handoffs/LFE-07-attempt-1.md).

## Out of this slice

Editing or accepting the plan, Review work progress (07.2), the capacity warning (07.3) and handovers (07.4) are not here.

## Checks

These run on a new fixture page, `work.html`: the real `ProjectShell` on Tasks, over a labelled plan.

- **Order and nesting:** the rows come in plan order, and the child sits under its parent.
- **Wording:** the assignee and the start condition are said in words.
- **Plan state:** a proposed plan says it isn't accepted. A superseded one is hidden.
- **Assumed and To decide:** each is in its own section, with the decider named.
- **No dead affordances:** nothing that doesn't act looks like a button.
- **Phone width:** the view holds at phone width.
