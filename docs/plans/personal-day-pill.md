# Personal's day pill steps aside for the day's own divider

> 2026-10-13 · Luis: «sigue con los puntos 2–5», after `informe-personal-real.md`, finding 4.

## What was measured

- Scrolling a month of conversation on the real stack, the pill at the top (`.c3-daypill`, 10 px down, 26 px tall)
  names the last day whose divider has gone above the list's top, while the next day's divider is already just under
  it: «SATURDAY» over «SUNDAY» (capture 01), «SEP 12» over «SEP 13» after Find (03). Two dates a line apart read as
  two that disagree.
- The list fades its first 68 px while it is scrolled (`.c3-convo.scrolled .msgs`, the mask from 30 to 68 px): the
  band under the pill where a divider is half drawn.

## What changes

- **While the next day's divider is inside that band, the pill steps aside** (`data-crowded`: faded out in 140 ms,
  not pressable); the divider names the day. Once the divider has gone above, the pill comes back naming it. The
  pill's day, its menu and the list's fade are otherwise unchanged.

## Checks

- `e2e/personal-day-pill.spec.ts` (1440×440, short enough for the fixture's yesterday and today to scroll past the pill): the «Today» divider placed 20 px
  under the list's top hides the pill; placed above the top, the pill is back and says «Today».
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; the Personal
  specs through the guard when it allows, CI otherwise.

## The focus when the pill steps aside (Codex P2 on #316)

- Measured: with the days' menu open, the divider came under the pill (a scroll or resize). Escape closed the menu and
  gave the focus back to the pill, which turned inert in the same render. In Chromium the focus stayed on an inert,
  hidden control that Enter can't reopen.
- Changed: the pill holding the focus as it steps aside hands it to the divider that crowds it. That divider names the
  next day and opens the same menu.
- Check: `personal-day-pill.spec.ts`, «the days' menu closed with Escape once the pill is crowded»: the focus is on the
  «Today» divider.
