# Implementation-session handoff: LFE-06, attempt 6 (subtle motion and interaction in the Resources view)

- **Goal and attempt:** Luis approved attempt 5's tiles and asked for subtle animation and interaction, "something subtle" that improves the UX/UI, like the animated bar in Claude Code.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/panel-ux` at `143c99c` (attempt 5), 2026-10-02.
- **End:** pending: the commit after the content commit fills it in.
- **Writable scope:**
  - `apps/studio/src/features/resources/`: the new `motion.ts`, the panel, the tile, the requests and the stylesheet;
  - the resource checks;
  - CONTRIBUTING and LFE-06's records.

  **No contract, schema, API or dependency changed.**

## Outcome (UI)

All of it builds on the app's own motion (`arrive`, the room's `ignite` ring, `SwapLabel`, the segmented thumb), with its `--ease` and durations of 140 to 400 ms.

- **A filter glides the tiles to their new places.** Every tile has its own `view-transition-name`. A tile that stays slides to its new place, and one that leaves or comes fades. Typing a search moves nothing, so each key stays instant. Browsers without View Transitions just update.
- **Tiles arrive one after another:** a 40 ms beat each, for the first eight.
- **Meters fill to their value as they appear.**
- **A tile's light follows the pointer,** in the tool's colour (Claude Code's orange, Gemini's violet; the app's halo otherwise), on its face and along its edge. The tile lifts 1 px under the pointer and presses in when clicked. This happens only where there is a pointer that hovers.
- **What waits keeps a slow pulse:** the room's ignite ring every 2.4 s, on the attention dot and on an open request in the sheet. When the waiting line appears, a light runs once along its words, then it rests.
- **Smaller touches:**
  - "Copy session id" crossfades to "Copied" (`SwapLabel`);
  - the sheet's sections arrive one after another;
  - the `/` key in the search steps aside while the search has the focus.
- **Reduced motion:** with it asked for, nothing animates and nothing glides. The same changes happen at once.

## Evidence

- `pnpm --filter @sophia/studio test:browser --repeat-each=2`: 78 of 78. That is 39 checks, 21 of them the resource checks, four of those new for motion:
  - a filter glides and typing doesn't;
  - every tile has its own glide name;
  - tiles arrive in turn, meters fill and what waits pulses;
  - the light follows the pointer;
  - reduced motion stills all of it.
- **Nine motion mutations** each made their check fail, every run on a fresh fixture server:
  - no glide;
  - typing glides;
  - one shared glide name;
  - a glide with reduced motion;
  - no stagger;
  - no fill;
  - no pulse;
  - the light not following;
  - reduced motion ignored.

  Attempt 5's twenty mutations still fail their checks.
- **A recording** of the view (loading, the light on a tile, the filters gliding, the sheet) shows a tile sliding from the third column to the first when Mine is chosen.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 578 pass, plus the 5 known failures on Windows, as on main.

## Decisions and changes

- **Nothing moves on its own except what waits.** Continuous motion is reserved for the one thing that needs someone.
- **The glide is for filters, not for typing.** A transition on every key would hold the screen still while someone types.
- **`motion.ts` holds the motion's logic,** so the components stay about what they show.

## Remaining obligations

- **Luis:** evaluate this UI before it merges.
- **Davide:** the resource and action shapes (SCM-01/02).

## Next bounded action

- Luis's notes on the motion. LFE-02.2 when PR32 is in `main`.
