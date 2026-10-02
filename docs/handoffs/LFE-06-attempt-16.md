# Implementation-session handoff: LFE-06, attempt 16 (arranging the tiles by hand)

- **Goal and attempt:** Luis wants to drag the tiles, so he can put two Claude Codes together.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/arrange`, stacked on `lfe-06/windows-once` (#59) at its tip, 2026-10-02.
- **End:** content commit `33c7476`; its checks ran on it.
- **Writable scope:**
  - `apps/studio/src/features/resources/`: the new `TileGrid.tsx` (the grid, taken out of the panel, with its keys, buddies and dragging), plus `order.ts`, `prefs.ts`, the panel, the tile and the stylesheet;
  - their tests and LFE-06's records.

  **No contract, schema or API changed.**

## Outcome (UI)

- **Drag a tile onto another and it takes its place:** before it when moving back, after it when moving on. The tiles glide to their new places.
  - The dragged tile fades where it was, and the one it will replace shows a quiet dashed edge.
  - The view switches to **Custom**, a fourth order in Sort: the viewer's own.
  - Two Claude Codes brought together greet.
- **Alt and an arrow** move the focused tile the same way, by one, or by a row with up and down. Alt with Home or End moves it to an end. Arranging never needs a pointer, and the moved tile stays the grid's Tab stop. A status says "Moved Luis · Claude Code to 2 of 5".
- **The order is kept per viewer, in this browser,** with the filter and the order (`prefs.ts` gains `custom`). A resource not yet placed comes after, by attention.
- **Arranging within a filter keeps the hidden tiles where they were.** The move is made in the whole order, not just the shown part.
- **Touch screens:** HTML drag and drop doesn't work there. Alt and the arrows do, with a keyboard.

## Evidence

- **Unit tests:** `placed` (before when moving back, after when moving on, nowhere to go) and the custom order (placed first, the rest by attention); `prefs` keeps `custom` and drops what isn't an id. 37 pass.
- **Browser checks:** `test:browser --repeat-each=2` passes 138 of 138. That is 69 checks, 51 for resources, three of them new:
  - drag onto another: its place, Custom, the status, the greeting, kept over a reload;
  - Alt with an arrow and Alt with Home: the tile moves and stays focused and the Tab stop; without Alt only the focus moves;
  - arranging within a filter keeps the hidden ones.
- **Eight mutations** each made their check fail:
  - a drop arranging nothing;
  - a drop not allowed;
  - the order not kept;
  - the view not switching to Custom;
  - Alt moving only the focus;
  - the moved tile not the Tab stop;
  - hidden tiles moved with the shown;
  - a dropped tile on the wrong side.

  A first mutation, "the focus lost when its tile moves", survived. The focus call was redundant: React moves the same element, which keeps the focus. The call was removed, and the check now asserts what matters, the Tab stop.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 600 pass, plus the 5 known Windows failures.

## Next bounded action

- Every LFE-06 mutation, run together against the top of the stack. Then Luis's approval and the merges.
