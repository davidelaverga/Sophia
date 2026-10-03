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

## Remaining obligations

- **Davide (SCM-04):**
  - serve the plan, with the four proposed fields or his own;
  - say whether a plan names its goal, or only its mission revision.
- **Luis:** evaluate this UI.
- **Next:** 07.2, Review work progress.
