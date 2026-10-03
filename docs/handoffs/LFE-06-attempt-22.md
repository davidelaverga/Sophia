# Implementation-session handoff: LFE-06, attempt 22 (Codex's P2s on Resources, from #62 to #66)

- **Goal and attempt:** after #62–#66 merged under the no-P1 rule, Luis asked to fix the P2s Codex left on them.
  - Two read-only triages checked all 34 against main `a453255`. This pull request takes the 16 on Resources: 14 still applied, 1 was fixed already, and 1 was a doc.
  - The 18 on the plan's board go in their own pull request.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `follow-ups/resources-p2s` from main `a453255`, 2026-10-03.
- **End:** content commit `87482af`; its checks ran on it.
- **Writable scope:**
  - `apps/studio/src/features/resources/` and its fixture and checks;
  - `app/usePopover.ts` and `app/AccountMenu.tsx`: the Tab class;
  - `TaskActions.tsx`: an act names its work;
  - attempt 18's handoff.

  **No contract, schema or API changed.** Proposed for SCM-01/02:
  - `onEffort`'s third argument, a refusal;
  - `Session.assignment.epoch`;
  - an act's `workId`/`epoch`.

## What each finding became

- **Keyboard:**
  - **Escape** anywhere in the effort picker closes the picker, never the sheet (#2).
  - **Sort's options** are reached by the arrows, not Tab. Tab closes the menu and goes on from Sort (#8). The class is fixed in `usePopover`, so every menu does this; the account menu's items aren't Tab stops either.
- **Touch:** the effort bar and its scale reach 14 px past what they draw (#3, #5).
- **Effort:**
  - **While a change is underway,** the bar stays, read only and focusable: the focus stays on it, and the scale doesn't come back by itself (#4).
  - **A request its runtime refuses** says "Not accepted · nothing changed", then is let go (#1). The fixture has `refuseEffort`.
- **Requests:** one whose outcome isn't known heads "Not settled yet", not "Earlier requests" (#6).
- **Live:** the view's clock ticks each second while any session reports live, not only the first with a report (#26).
- **Acts:**
  - **Sending:** an act is "Sending…" until its runtime records it (#22).
  - **Its work:** an act names the work it was meant for (#28).
  - **The draft:** what was typed since the act went is kept (#29).
  - **Delivered:** says what was asked, never that it happened. "Delivered: asked to hold… Not seen holding yet." (#30)
- **While you were away:**
  - only the three said are marked (#31);
  - "back online" only from offline (#32);
  - a request is said answered only if resolved or denied, by its id, even when another came (#33);
  - superseded, expired or unsettled requests say nothing.
  - The glance is v2, and a v1 glance reads as a first visit.
- **Docs:** attempt 18's End line names each section's commit (#7). The panel's header no longer says it doesn't act.
- **Already fixed:** #0, the focus after the restart's question (`ConfirmButton`, #65).
- **Left open:**
  - an act whose runtime never answers stays "Sending…": honest, but with no timeout yet (#22's rest);
  - #1's receipts for accepted or unknown wait on the contract.

## Evidence

- **Browser checks:**
  - 5 new:
    - Escape in the picker;
    - a refusal;
    - Sort's Tab;
    - "Sending…" and the kept draft;
    - touch reach on a phone.
  - 4 updated:
    - the restart (bar read only, focus kept, no scale coming back);
    - the act's `workId`;
    - the delivered texts;
    - the v2 key.
- **Unit checks:**
  - the requests' heading;
  - `anyLive`;
  - a refused line;
  - answered by id (and nothing for superseded, expired or unknown);
  - back online from unknown;
  - the marks.
- **Mutations:** 19 each made a check fail. That is one per fix, and three more for the review's fixes.
- **Independent review:** no P1, 2 P2, 5 P3.
  - **P2, fixed:** the focus dropped when a change began; "answered" for superseded requests.
  - **P3, fixed:**
    - a comment's place;
    - the draft's reset;
    - Tab in every menu.
  - **P3, noted:** the refusal-identity case can't be driven by the fixture; "Sending…" has no timeout.
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 649, plus the 5 known Windows failures. `test:browser --repeat-each=2`: all pass but one run of a Tasks check that reads the real clock (`work.spec.ts:66`, from #63), which passes 10 of 10 alone; it is steadied in the Tasks follow-up.
