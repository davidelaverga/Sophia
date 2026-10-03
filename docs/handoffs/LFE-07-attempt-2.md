# Implementation-session handoff: LFE-07, attempt 2 (Codex's P2s on the lead's plan board, from #63–#64)

- **Goal and attempt:** this is the second half of Codex's P2s on #62–#66, after Resources' (#67).
  - It takes the 18 on the plan's board. 14 still applied on main `a453255`.
  - #9 and #15 were fixed already. #11 and #14 were obsolete, because the list view they named is gone.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `follow-ups/tasks-p2s`, stacked on `follow-ups/resources-p2s` (#67), 2026-10-03.
- **End:** content commit `e81cfcb`; its checks ran on it.
- **Writable scope:**
  - `apps/studio/src/features/work/`;
  - the work fixture and its checks;
  - a note on `ProjectShell`'s `plans`;
  - `Session.assignment.id` in `resource.ts`.

  **No contract, schema or API changed.** Proposed for SCM-04/01:
  - `PlanDecision.revision`;
  - `Session.assignment.id`.

  The board and the rail take an optional `actions`.

## What each finding became

- **The plan:**
  - every item, however deep, each once, even one in a loop of parents (#10);
  - a review that also waits on others says both (#12);
  - recorded and queued are said apart (#20);
  - the session is found by the assignment the plan names, and never one that names another (#18).
- **Waiting (#13):** a task waits on someone only when an open request of its session, for this work, names them. Otherwise it is "Waiting".
  - The tile, the sheet, the rail's "for you" (`forYou`) and the while-away phrases follow this.
  - "What happens if I say yes?" is offered only to that person.
- **Decisions:**
  - an answer names the decision's own revision, and a revised decision starts afresh (#16);
  - past its expiry, a decision is read, not answered, and calls no one: no amber pill, no "for you" (#17);
  - after an answer not confirmed, only the same choice can be tried again (#19).
- **The goals:**
  - a goal without a plan keeps its row (#21), and the "nothing answers" note shows only when nothing is listed;
  - a followed `#task-` address clears a search that hides its goal (#27), never a search typed after.
- **The sheet:**
  - a guidance draft belongs to its task (#23);
  - Sophia's answer is the latest question's (#24).
- **What was seen** is kept per plan: a new plan for the goal reads its own (#25).
- **Checks steadied:** two checks failed only under the full suite's load.
  - The freshness ring now runs on the page's clock.
  - The decision check waits for the page's first paint.

## Evidence

- **Browser checks:** 9 new:
  - expired;
  - unknown;
  - unplanned;
  - the draft;
  - the staggered answers, on the page's clock;
  - replan;
  - a followed address under a search;
  - say-yes only for the one it waits on;
  - the search note.

  2 updated: the answer's revision 4, and the clock. `test:browser --repeat-each=2` passes 272 of 272.
- **Unit checks:**
  - the tree;
  - both relations;
  - waiting on whom, including a request of other work;
  - recorded;
  - the session by the named assignment, not a replaced one;
  - `actionable`;
  - `forYou`.
- **Mutations:** 19 each made a check fail.
- **Independent review:** no P1, 2 P2, 5 P3. All are fixed:
  - **P2:** the replaced session; an expired decision still calling.
  - **P3:**
    - the search note;
    - say-yes;
    - a request of other work;
    - the staggered check on the page's clock;
    - a comment's place.
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 653, plus the 5 known Windows failures.

## Remaining obligations

- Whoever wires real plans into `ProjectShell` passes the open requests (`actions`). The note on `plans` says so.
- **Davide:** `PlanDecision.revision` (decision.v1 has it) and `Session.assignment.id` (SCM-01/04).
