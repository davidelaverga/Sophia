# Implementation-session handoff: LFE-06, attempt 14 (a last pass: quality of life, a little visual weight, two small delights)

- **Goal and attempt:** Luis asked for "a last pass of quality of life, visual oomph and an easter egg". On the way he added a detail: two Claude Code sessions side by side should greet, or look at each other.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/polish`, stacked on `lfe-06/capacity-line` (#57) at its tip, 2026-10-02.
- **End:** content commit `df68487`; its checks ran on it.
- **Writable scope:**
  - `apps/studio/src/features/resources/`: the new `ultra.ts` and `buddies.ts` (with its test), the panel, sheet, tile and stylesheet;
  - the checks and LFE-06's records.

  **No contract, schema, API or dependency changed.**

## Outcome (UI)

- **Step through the resources from the sheet.**
  - J and K, or the ‹ › buttons in its head (with their keys in the tip), open the next or previous resource without closing.
  - They follow the list as the viewer sees it: its search, filter and order. The last steps on to the first, and the address follows.
  - Each step turns the page: the sheet's arrival plays again and its mark pops in. The focus stays in the sheet, so J and K keep working after a button's press.
  - With one resource there is nowhere to step, and no buttons.

  To do this, the panel now holds the view (search, filter, order) instead of the tiles' list.
- **A little visual weight, kept quiet.**
  - The sheet's head takes a faint light in its tool's colour (7 %), as the app's pages take hers from above.
  - A meter in the red glows softly.
  - A tile's mark lifts by 5 % under the pointer.
- **Two Claude Codes side by side** (`buddies.ts`).
  - When two Claude Code tiles sit next to each other in a row, their marks greet: a hop and a wave. Then they rest leaning toward each other. Hovering one makes the other hop back.
  - Neighbours are measured as the grid lays them out, at its width. On a phone, one tile to a row, there are none. A mark between two Claude Codes greets both and leans to neither.
  - With reduced motion asked for, they only lean.
  - In the fixture, sort by Tool to bring Davide's and Luis's Claude Code together.
- **A secret** (`ultra.ts`). Typing "ultracode" on the view sends a wave of lavender dots across every tile, once: the ultracode bar's glint for everyone. It counts only outside any field, with no sheet open and the view on screen. It changes nothing. With reduced motion asked for, it is only said ("Ultracode, for everyone, for a moment.").

## Evidence

- **Unit tests:** `buddies.test.ts` (who looks which way; one between two; only the same row; only Claude Code). 35 pass in all.
- **Browser checks:** `test:browser --repeat-each=2` passes 132 of 132. That is 66 checks, 48 for resources, five of them new:
  - stepping by J, K and the buttons, through the shown list;
  - the head's light and the red glow;
  - the secret, never from a field, still with reduced motion;
  - the two Claude Codes greeting, answering, and still with reduced motion;
  - no neighbours on a phone.
- **Sixteen mutations** each made their check fail. Three survived first and showed weak checks or a real gap:
  - **The secret "heard from a field":** the check had filled the search without typing keys. It now types them.
  - **Neighbours "a row apart":** the check counted before the order had glided into place. It now waits for the order.
  - **The hover answer still moved with reduced motion:** a real gap, the answer's rule was stronger than the one stilling it. It is fixed, and the check hovers with reduced motion asked.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 598 pass, plus the 5 known Windows failures.

## Next bounded action

- Every LFE-06 mutation, run together against the top of the stack. Then Luis's approval and the merges, #51 to the top, each with no P1.
