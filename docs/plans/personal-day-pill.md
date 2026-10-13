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

- `e2e/personal-day-pill.spec.ts` (1440×900, the fixture's yesterday and today): the «Today» divider placed 20 px
  under the list's top hides the pill; placed above the top, the pill is back and says «Today».
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; the Personal
  specs through the guard when it allows, CI otherwise.
