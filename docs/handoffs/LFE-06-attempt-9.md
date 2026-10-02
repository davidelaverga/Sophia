# Implementation-session handoff: LFE-06, attempt 9 (the Resources view feels live)

- **Goal and attempt:** the second of the three small PRs Luis asked for. The view stays true and says when something changes while it is open.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/live`, stacked on `lfe-06/identity-qol` (#52) at `3997fd0`, 2026-10-02.
- **End:** content commit `95c3277`; its checks ran on it.
- **Writable scope:**
  - `apps/studio/src/features/resources/`: the new `clock.ts`, the panel, the tile and the stylesheet;
  - `features/studio/ProjectShell.tsx`: an optional `resourcesWaiting`, added to the tab's count;
  - the resource fixture, now live: `addRequest()`, `setHost()`, `loading=1`;
  - its checks, CONTRIBUTING and LFE-06's records.

  **No contract, schema, API or dependency changed.**

## Outcome (UI)

- **Ages and countdowns move on.** The view's clock starts at the time the data was read and moves on with the page, once a minute (`useClock`). "resets in 55 min" becomes "54 min", and "2 min ago" becomes "3 min ago", without asking anything again. A new read starts it over.
- **A tile whose state changes says so once.** When its host, what waits or its capacity changes, its edge lights in its tool's colour and fades in 1.4 s. The clock's words moving never flash it. The flash is added beside the tile's arrival, never instead of it, so the arrival doesn't play again when the flash ends.
- **A request that comes to wait.** The tab's title counts it, and the light runs along its line in the attention row again. That row is a `role="status"`, so assistive technology hears it.

  The title belongs to `ProjectShell`, which already counts who waits at the door. It gains an optional `resourcesWaiting`, added to that count: "(2) Fixture project · Sophia". The panel never writes the title, so the two can't step on each other. Only requests waiting on this viewer count.
- **While the resources are read,** six placeholders hold the tiles' places with a light passing over them. The count shows "–" and the region is `aria-busy`. A status says "Reading the resources…".
- **Reduced motion:** no flash and no light on the placeholders, as with the rest of the view.

## Evidence

- **Browser checks:** `test:browser --repeat-each=2` passes 110 of 110. That is 55 checks, 37 for resources, five of them new:
  - the clock moves on, and a tick flashes nothing;
  - a request that comes to wait flashes its tile, counts in the tab and makes the light run again;
  - what waits on someone else doesn't count in this viewer's tab;
  - a host going offline flashes its tile;
  - placeholders while reading, still with reduced motion.
- **Eight mutations** each made their check fail, on fresh fixture servers:
  - the clock standing still;
  - a tick flashing the tile;
  - a change flashing nothing;
  - a flash that never rests;
  - the tab not counting the tools;
  - the light not running again;
  - no placeholders;
  - placeholders moving with reduced motion.

  "A tick flashing the tile" first survived: its check retried until the flash had faded. It now reads once, within the flash's time.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 587 pass, plus the 5 known Windows failures.
- **Not yet run:** attempts 5 to 8's 61 mutations against this branch. Some of their patterns moved (the tile's capacity is now its own component). They run before this merges.

## Codex's review of #52 (`3997fd0`), fixed here

Two P2s, fixed on this branch because only it has a load to wait for:

- **A sheet's address waited for nothing.** In production the resources arrive after the view opens. The fragment was checked against an empty list and dropped. It is now kept as it is (`linkedId`) and opens the sheet when its resource arrives. The fixture's `loading=1` now waits for `resourcesFixture.load()`, and the check loads with the address already there.
- **A refused copy passed in silence.** Both copies ("Copy link" and "Copy session id") share `useCopy`. When the browser refuses, they say so for four seconds, with what to do instead: "Couldn't copy: the link is in the address bar", "Couldn't copy: claude-worker". The check refuses the clipboard instead of granting it.

Two more mutations (the address checked before the resources, a refused copy in silence) fail their checks.

## Remaining obligations

- **Luis:** evaluate this UI before it merges.
- **Davide:** a live read of resources and actions to feed `now` and the data (SCM-01/02).

## Next bounded action

- Attempt 10: a dense list view, and grouping by owner.
