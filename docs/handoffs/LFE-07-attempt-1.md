# Implementation-session handoff: LFE-07, attempt 1 (the smallest useful plan)

- **Goal and attempt:** LFE-07.1, "Show the smallest useful plan", with SCM-04 G2.
  - Luis: after LFE-06, "vamos a work". He had asked where sessions get their assignment, and whether the lead's screen existed. It didn't.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-07/plan` from main `12d5dd2`, 2026-10-03.
- **Writable scope:**
  - `apps/studio/src/features/work/` (the new `planning/`, and `GoalList`'s plan slot);
  - `ProjectShell` (the `plan` slot);
  - `features/resources/resource.ts` (`WORK_STATE`, now shared by the sheet and the plan);
  - the fixtures (`work.html`, `work.tsx`, `work-data.ts`, and goals served by `fixture-api.ts`) and their checks;
  - CONTRIBUTING, and LFE-07's records.

  **No contract, schema or API changed.**

## Design first

[docs/plans/LFE-07.1-plan-view.md](../plans/LFE-07.1-plan-view.md) was written before the code: where the plan lives, what it shows, the data it reads and what this slice leaves out.

## Outcome (UI)

- **The plan lives in Tasks, under the goal it serves.** It uses the view's own language: the goal's ruled row and controls stay as they are, a `view-subhead` reads "Plan r2 Accepted", and the work pulse stays on the right. A proposed plan reads "Proposed · not accepted yet". A superseded or withdrawn one is not shown.
- **The next checkpoint** is one line.
- **Its work, one ruled row per item:**
  - the purpose;
  - who does it. An assignment is found through the session that has it (LFE-06's `Session.assignment.workId`), with the owner's picture, their tool's logo and the session's role. A person is shown as the Studio shows one, by picture or initial. "Assigned, not running yet" and "Unassigned" are said as such;
  - when it starts, until it has: "Starts now", "After “Implement the PDF retry”", "When “…” has a candidate", or "Ready for someone to take". Once it has started, its session's state says the rest: Working, Waiting or Queued;
  - a review sits under the build it reviews, with no rule between them and a short elbow. A blocker is said in words, never drawn as nesting.
- **What it assumes and what is decided stay apart:**
  - Assumed, with open marks;
  - To decide: the question, who decides, and the choices, read but not pressed;
  - Decided: who chose what.
- **Nothing in it acts,** and nothing looks like it does: no button, no link, no pointer.

## Data

The plan's data is `sophia.work.plan.v1` as it is. The Studio proposes four more fields for SCM-04: `goal_id`, `next_checkpoint`, `assumptions`, and `decisions` (decision.v1's shape plus a `question`). They are in `planning/plan.ts`. The outcome comes from the goal.

## Evidence

- **Browser checks:** seven, in `e2e/work.spec.ts`, one of them for the phone:
  - the order and the nesting;
  - who does each item and when it starts, in words;
  - each picture centred on its line's words (measured: a photo sat 2.7 px high and an initial 1.4 px low, on the line's baseline; now within 0.5 px);
  - Assumed, To decide and Decided kept apart;
  - nothing in the plan acts;
  - proposed and superseded plans;
  - a phone with no overflow.

  `test:browser --repeat-each=2`: 162 of 162. No request leaves the page.
- **Unit checks:** four, in `planning/plan.test.ts`.
- **Ten mutations** each made their check fail:
  - children not grouped;
  - a superseded plan shown;
  - a candidate wait said as "now";
  - who does it never found;
  - a running item still saying when it starts;
  - a person without their avatar;
  - a proposed plan said accepted;
  - something already decided asked again;
  - the plan above its goal;
  - the picture back on the baseline.
- **Gates:**
  - `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass;
  - `pnpm test`: 606 pass, plus the 5 known Windows failures.

## Luis's evaluation: "it's all mixed, I don't know where to look first"

Luis asked for a strict evaluation, then for the fix, keeping the app's premium look: icons and badges for contrast, quality of life, and micro-interactions such as the two Claude Codes greeting.

- **What was measured on the first version:**
  - one screen held about 177 words, 9 font sizes, 18 type styles, 6 colours, 4 tags, 5 pictures and 6 section labels, all at much the same weight;
  - the one thing that asked for action (a decision for Davide) sat at the bottom;
  - the plan ran 697 px under a 14 px heading, smaller than the goal's;
  - each task's state sat at a different place along its line;
  - "Implement the PDF retry" appeared three times;
  - "Tasks 1" counted goals.
- **What changed:**
  - **The goal** reads in two lines: its status beside its title, its outcome under them. Its criteria fold into "2 criteria". The goal count leaves the head.
  - **The plan's head:** PLAN r2 Accepted on the left, and on the right a tally of where its tasks stand, each with the same mark as its rows: "1 waiting · 1 working · 2 not started · 1 free".
  - **The next checkpoint** is the plan's lead sentence, at 15 px.
  - **What waits on a decision is raised above the tasks,** in the attention colour, with the decider's picture: "Davide decides", the question, and its choices, which are read, not pressed.
  - **One line per task,** ordered by what moves (what waits on someone first, what no one has last), with each child under its parent:
    - the mark: filled amber with a slow ping when the task waits on someone, filled teal while it works, hollow before it starts, dashed when no one has it;
    - the task;
    - where it stands, in its own column ("Waiting on Davide", "Working", "After …", "Once there is a candidate to review", "Free to take");
    - who does it: their picture with their tool's logo set on its corner like a badge, named on hover. A quiet ring stands for a session not running yet, a dashed one for no one.
  - **The micro-interaction:** hovering a task lights the tasks it waits on. Their row warms and their mark takes a lavender ring, the way the two Claude Codes notice each other in Resources.
  - **Assumed and Decided** fold into one quiet line, "2 assumed · 1 decided".
- **Measured after:**
  - the whole plan ends at 740 px, inside a 1068 px screen (it ran to 1028 px before);
  - 146 words;
  - its own type is 15, 13 and 10.5 px; the view title and tags keep the app's sizes.
- **Checked:**
  - ten browser checks and five unit checks;
  - the marks and the "where it stands" words each form one column;
  - each picture is centred on its line, measured at rest after the rows arrive;
  - the empty rings are whole: a capture showed them collapsed to slivers once a rule was dropped, and a check now measures them;
  - with reduced motion asked for, nothing moves.
- **Fifteen mutations** each made a check fail:
  - the plan order instead of what moves;
  - children not grouped;
  - a superseded plan shown;
  - "waiting" said as working;
  - a review waiting on nothing;
  - hovering lighting nothing;
  - something decided raised again;
  - the fold open from the start;
  - the criteria open over the plan;
  - "no one" and "not running" looking alike;
  - the ping ignoring reduced motion;
  - the status words out of their column;
  - the pictures off their line;
  - the empty ring collapsed.

  A rule that changed nothing measurable was removed.
- `test:browser --repeat-each=2`: 168 of 168. `pnpm test`: 607 pass, plus the 5 known Windows failures.

## Luis's notes: the choices are buttons, several plans, comments

- **Its decider answers a decision where it is raised.** Each choice is a button, and the decider sees "You decide" and when it expires (decision.v1 requires `expires_at`). Anyone else reads who decides and the choices, as words. Per `05_CAPACITY_STEERING_HANDOVER` and LFE-07 PLAN-02:
  - silence never chooses, so neither button is preselected;
  - one press answers the one pending decision, and both choices then wait;
  - the receipt is said: "Sent: Ship it now. It shows as decided once the lead records it.";
  - a decision that changed since it was read is refused ("Nothing was chosen: read it again"), and the choices can be pressed again. So can a reply that was never confirmed;
  - it shows as decided only once the plan records it: the raised decision leaves, and the folded line counts it.

  The panel takes an optional `onDecide`. The pack names the operation (`decide_work_request`, "resolve a work decision") but binds no route yet: that is SCM-04/06's.
- **Several goals each carry their own plan,** inside their row: the slot is `plans`, by goal id. Each plan folds to its tally from its name (PLAN r2), so a project with several goals stays readable.
- **Comments are not built here.** Per the pack, discussion lives in the project's thread, version-linked: "posting a comment does not retask a worker" (`13_FRONTEND_BINDINGS`). Guidance to a worker is a separate path, recorded, queued, delivered, then verified (`07_STUDIO_VOICE_AND_ARTIFACTS`). Proposed to Luis: a task links to its discussion in the room's thread.
- **Checked:**
  - five new browser checks: only the decider answers; one press; refused when stale; several plans, each folding to its tally; the chosen answer kept at full strength;
  - eight mutations each made their check fail:
    - anyone can decide;
    - the other choice can follow;
    - a refused answer locks the choices;
    - a refused answer said as sent;
    - no expiry said;
    - one plan under every goal;
    - folding hides the tally.

  `test:browser --repeat-each=2`: 174 of 174.

## Remaining obligations

- **Davide (SCM-04):**
  - serve the plan, with the four proposed fields or his own;
  - say whether a plan names its goal, or only its mission revision.
- **Luis:** evaluate this UI.
- **Next:** 07.2, Review work progress.
