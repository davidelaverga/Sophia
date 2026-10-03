# Implementation-session handoff: LFE-06, attempt 17 (Codex's P2s across the stack, fixed together)

- **Goal and attempt:** Codex reviewed #51 to #60 and left no P1, and twelve P2s on #53, #54, #55, #57, #58 and #60. Each is real and small, in code not yet merged. They are fixed here together, on top of the stack, so the stack merges clean.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/codex-p2s`, stacked on `lfe-06/arrange` (#60) at its tip, 2026-10-02.
- **End:** content commit `ccf95da`; its checks ran on it.
- **Writable scope:**
  - `apps/studio/src/features/resources/`;
  - the fixture (`refreshing=1`, `spendCredits()`, `swapRequest()`, window epochs);
  - the checks and LFE-06's records.

  **No contract, schema or API changed.** The Studio's window type gains the contract's optional `window_epoch`.

## The twelve, and what changed

| PR | Codex's P2 | Fixed |
|---|---|---|
| #53 | A tile's flash missed capacity changes without a percentage (a balance) and a new reset at the same percentage. | Its state now reads the headline window's id, value and reset, never the clock's words. |
| #53 | While loading with data in hand, the summary, the attention line and a linked sheet still spoke of it. | While reading, none of it is said or opened. |
| #53 | A request answered while another came to wait kept the count, so nothing flashed or replayed. | The tile and the attention line follow which requests wait (their ids), not how many. |
| #54 | History matched windows by reset time, not by the contract's `window_epoch`. | It matches by epoch when the readings carry one, by reset time otherwise. |
| #54 | The history's dot was placed against the whole figure, not the 24 px drawing. | It is placed in pixels within the drawing. |
| #54 | GPT names lost what followed the version (`gpt-4o` read "GPT-4"). | Every word is kept: GPT-4o, GPT-5 Mini, Gemini 2.5 Flash Lite, Grok 4 Fast. |
| #55 | GPT's bar came alive at max, not only at ultra. | Ultra, its own word, brings it alive. Max shares its place on the scale, not its look. |
| #57 | "readings in 3 h" ran from the first reading to now. | It runs from the first reading to the last (`spanOf`). |
| #57 | Removing the caption also removed it from the windows' own drawings. | A window's drawing in the list keeps its caption. The headline's is said in the line of facts. |
| #58 | On a narrow phone, four 40 px controls left the title too little room. | The head wraps, and its actions take their own line under the title. |
| #60 | A dragged tile didn't become the Tab stop. | It does, like a tile moved with Alt. |
| #60 | Alt+Home on the first tile (or Alt+End on the last) switched the view to Custom. | At an end, Alt moves nothing and changes no order. |

## Evidence

- **Unit tests:** history by epoch, `spanOf`, every GPT/Gemini/Grok word kept, GPT alive only at ultra. 39 pass.
- **Browser checks:** `test:browser --repeat-each=2` passes 148 of 148, that is 74 checks. Five are new, one per P2 family:
  - a moving balance and a swapped request flash;
  - nothing of the last read is said while reading;
  - a window's drawing keeps its caption, its dot on its line;
  - a dragged tile is the Tab stop and Alt at an end changes nothing;
  - on a 360 px phone the sheet's title stays whole, on one line.
- **Fourteen mutations** each made their check fail.
  - The phone check first passed without its fix: at 390 px the title still fit. It now runs at 360 px with Claude Code's longer title, and fails without the wrap.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 602 pass, plus the 5 known Windows failures.

## Next bounded action

- Every LFE-06 mutation together, against this top. Then Luis's approval, and the merges #51 to #61.
