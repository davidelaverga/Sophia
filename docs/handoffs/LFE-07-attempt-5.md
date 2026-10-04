# Implementation-session handoff: LFE-07, attempt 5 (the Codex P2s on #77)

- **Goal and attempt:** this attempt fixes the three Codex P2s on #77, the card of a review that proposes a change (LFE-07.2, slice 2).
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-07/card-p2s` from main `f18590a`, 2026-10-04.
- **End:** content commit `44522d8`; its checks ran on it.
- **Writable scope:**
  - `PlanBoard.tsx` and `ReviewResult.tsx`;
  - the work fixture (`odd-id=1`) and its checks;
  - LFE-07's records.

  **No contract changed.**

## Outcome

- **A decision's id is any string.** The board found the decision to focus with an id put inside a CSS selector. An id holding quotes or brackets, which the decision schema allows, threw, and the board went blank. It now compares ids directly, and no id enters a selector.
- **A card closed by a later review gives the focus back.** A live update that replaced the review unmounted the focused card, and the focus fell to the page. It now goes back to the pill when the pill is still there (a later review that proposes a change), as Escape and Close already do, without scrolling the page. When a routine end takes the pill away too, there is nothing in the slot to return to, and the focus stays on the page.
- **An expired decision is said expired.** A proposal waiting on a decision past its expiry used to read "Waits on Davide's decision", even to Davide. Now it reads "Its decision expired before it was answered.", to everyone.

## Evidence

- **Tests first:** 3 browser checks failed on main's code, each for the reason it names:
  - the odd id: the board threw, so the choice was never found;
  - the focus after a later review: it was on the page, not the pill;
  - the expired decision: it was attributed to someone.
- **Code review:** no P1 or P2. Its P3s:
  - the focus no longer scrolls the page;
  - the case where the pill goes too is now said above.
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 666, plus the 5 known Windows failures. `test:browser --repeat-each=2`: 336 of 336, before the review's one-line `preventScroll`; `work.spec.ts --repeat-each=2` after it: 118 of 118.
