# Implementation-session handoff: LFE-06, attempt 26 (an address at open, and a Tab stop that stays on its tile)

- **Goal and attempt:**
  - the Codex P2 on #71;
  - the Resources check that failed once in #71's CI ("a dragged tile becomes the Tab stop").
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `fix/address-at-open` from main `62bffd2`, 2026-10-03.
- **End:** content commit `aa1af30`; its checks ran on it.
- **Writable scope:** `GoalList.tsx`, `TileGrid.tsx`, `work.spec.ts`, `resources.spec.ts` and LFE-06's records. **No contract changed.**

## Outcome

- **The address the page opens with waits for its plan too.**
  - Before, `GoalList` started with the page's own address already counted as handled.
  - So if the page opened on `#task-…` before its plan had arrived, and a search was typed meanwhile, the search never gave way and the task never opened.
  - Now no address is handled until its task is on a plan.
- **The Tab stop is a tile, not a place.**
  - `TileGrid` kept its one Tab stop as an index. In the Attention order the tiles re-sort by themselves, for example when a request is answered, and the index then pointed at another tile. The focus stayed on one tile while the Tab stop moved to another.
  - The same index is the likely cause of the intermittent CI failure. It was never reproduced, so this is not proven. The likely path: a live update lands between a drop and its deferred reorder (a View Transition), and the dragged tile loses the stop.
  - Now the stop is kept by the tile's id. A tile moved by drag or by Alt and an arrow stays the stop, so the effect that followed the move is gone.

## Evidence

- **Tests first:** both new checks failed on main's code, each for the reason it names:
  - "an address the page opens with waits for its plan too, the search giving way";
  - "the Tab stop is a tile, not a place: when the tiles re-sort by themselves it stays on the same one" (on main, the stop went to Davide · Codex).
- **Mutations, each killed:**
  - the page's address counted as handled at mount;
  - `TileGrid.tsx` back to main;
  - the drag not setting the stop;
  - the arrows starting from the stop instead of the focus.
- **The intermittent failure:** it did not reproduce locally, even 40 times over 12 workers. The fix removes the index it depended on. The original check still runs as it was.
- **Independent review:** no P1 or P2. Fixed from its P3s:
  - the drag test pressed the tile, which focuses it, so it did not prove the drag's own setter. A new check drags without taking the focus, as Safari and Firefox on a Mac do;
  - the arrows now start from the tile with the focus, not from the Tab stop, so a drag elsewhere can't split them;
  - the flake's cause is said as likely, not proven.
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 655, plus the 5 known Windows failures. `test:browser --repeat-each=2`: 288 of 288.
