# The screen is used

> 2026-10-11 · Luis: «sigue con §2.4 anchos». Informe-30 §2.4: «Contenido máximo 1280 en vez de 1040 … Conversations:
> hilo con máximo 760 px centrado; a 1920 el panel sobrante va al contexto (300 → 360) … 1024: la nav del proyecto
> … nunca un texto cortado bajo un indicador». No API change.

## What was measured

- At 1920: a page's column is 1040 px wide at most (`.page`, `.updates`, the report pane's own sum), 925 of content
  between its gutters, centred at x = 493: 440 px bare at each side. The board's four lanes are 222 (tiles 218);
  Knowledge shows three cards a row (298). Conversations: the list 300, the thread's column 1320 with its content
  already at 760 centred (bubbles from 580 to 1340), the context 300 fixed.
- At 1024: the project's views (`.view-nav`) have 492 px for 528 of links; the row scrolls, but with no fade on a
  desktop (the fades were the phone's rules) «Resources» ends at a hard edge as «Resou».
- Not in this note: the informe's fifth lane («Blocked», when it exists: no lane yet), Home's right half (F2, a
  feature), the report pane's measure.

## What changes

- **`--content: 1280px`** in `theme.css`; `.page`, `.updates` and the report pane's padding read it. At 1920 a page's
  column is 1280 (1165 of content); the board's four lanes grow to 282 (tiles 278; the informe's 288 would need a
  narrower gutter), Knowledge shows four cards a row (279) from 1200 px of viewport.
- **Conversations' context grows with the screen**: its column is `clamp(300px, 300px + (100cqi − 1416px) / 2, 360px)`
  (the panes' container width): 300 up to 1416 (a list, a 760 thread with its 28 px sides, a context), 312 at 1440,
  360 from 1536. The thread's content stays 760 centred (at 1440 a first cut took half of what was spare and left the
  thread 744: the sides count).
- **The views' fades at any width**: the `data-more-start` / `data-more-end` masks move from the phone's rules to the
  row's; `ViewNav` already marks the ends and scrolls the current view into sight at every width.
- `e2e/widths.spec.ts`: at 1920 the page is 1280 and four lanes of 270 or more stand in it; Knowledge shows four cards
  of 260 or more a row; Conversations reads list 300, field 760, context 360; at 1440 the context is 312 and the field
  still 760; at 1024 the
  views scroll under a fade, the current one in sight, the row clear of the bar's end.

## States

- No behaviour changes. Under 1180 px of page the context is a panel over the edge, as before; the phone's one pane at
  a time as before.
- A report open beside a page narrows the page (`--report-w`): the column's maximum follows `--content` there too.

## Checks (written first)

- The spec's measure before the change: the page 1040, lanes 222, three cards a row, the context 300 at 1920 and
  1440, the nav at 1024 scrolling without a fade. With the change, the numbers above.
- Mutant, with the control passing: `--content` set back to 1040, the page measures 1040 and the measure reports it;
  the context's `clamp` replaced by 300, the 1920 and 1440 checks report 300.
- `pnpm check` clean.

## Left

- A fifth lane («Blocked») when the board has one; 288 px lanes would take a narrower gutter at 1920.
- Home's right half is the feature F2's («Needs you»), not a width.
