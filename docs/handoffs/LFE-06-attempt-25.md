# Implementation-session handoff: LFE-06, attempt 25 (an answer and an address that hold)

- **Goal and attempt:** the two Codex P2s left from #68, both in Tasks.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `fix/tasks-holds` from main `c8dd5aa`, 2026-10-03.
- **End:** content commit `5f14b56`; its checks ran on it.
- **Writable scope:**
  - `planning/answers.ts` (new) and `Decision.tsx`;
  - `GoalList.tsx`;
  - the plan's fixture page, `work.spec.ts`, and a unit test;
  - LFE-06's records.

  **No contract changed.**

## Outcome

- **An answer outlives the decision's component.**
  - Before, a choice on its way or not confirmed lived in the component's state. Closing the decisions, or choosing another goal and coming back, forgot it, and the other choice could then be sent before the first was resolved: deciding twice.
  - Now `answers.ts` keeps each answer by its decision's id and revision, and by who gave it, while the page lives. `Decision` follows it (`useSyncExternalStore`).
  - A revised decision has a new key, so it starts afresh, as before.
  - A reload reads the plan again and starts from it. Keeping answers across a reload is not in this change.
- **A followed address waits for its task's plan.**
  - Before, `GoalList` marked an address handled as soon as it was followed. If its task's plan came later, a search hiding that goal stayed, and the task never opened.
  - Now an address is handled once its task is on a plan (`followed.found`). A search typed while the address waits gives way too; one typed after it is handled is kept.
- **Fixture:** `later=1` (with `two=1`) holds the second goal's plan back until `workFixture.arrive()`.

## Evidence

- **Tests first:** both new checks failed on main's code, each for the reason it names:
  - "an answer not confirmed holds when the decisions close and open, and when another goal is chosen";
  - "a followed address whose plan arrives later still opens its task, the search giving way".

  A unit test of `answers.ts` covers the key by revision and by viewer.
- **Mutations, each killed:**
  - `Decision.tsx` back to its own state;
  - the address handled before its plan is found;
  - the key without its revision (unit).
- **Independent review:** no P1 or P2. Fixed from its P3s:
  - the address check waits a frame between following and the plan's arrival, so it cannot pass in one render;
  - answers are kept by viewer too;
  - the search that gives way is said;
  - a shadowed name is renamed.

  Noted for the real `onDecide`: a request that never settles now holds its decision at "Sending" until a reload, since a remount no longer resets it. It should time out to `unknown`.
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 655, plus the 5 known Windows failures. `test:browser --repeat-each=2`: 282 of 282.
