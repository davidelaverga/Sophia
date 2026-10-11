# Every leading on the 4 px grid, three weights

> 2026-10-10 · Luis: «sigue y encólalas, terminarlas todas». Informe-30 §2.2: «Rejilla de 4 px: 10.5/16 · 12/16 ·
> 13/20 · 14/20 · 16/24 · 20/24 … Pesos 400 · 500 · 600. Quitar 300 y 700». The sizes already keep to a scale
> (`type-scale.spec.ts`, docs/plans/type-places.md); this closes the leadings and the weights. No API change.

## What was measured

- One leading rule, `body`'s `1.5`, and sixteen others by hand (1 · 1.02 · 1.1 · 1.2 · 1.25 · 1.3 · 1.35 · 1.4 · 1.45 ·
  1.5 · 1.55 · 1.6 · 1.65, 20 px, 24 px, 48 px), most as ratios: on screen the body's 13 reads at 19.5, the small 12 at
  18, the label 10.5 at 15.75, a paragraph at 20.15 or 21.45, a title at 18.9. On Conversations 24 combinations of
  size, leading and weight; on Tasks 22; on Resources 12; on Home 9 (informe-30: «ocho interlíneas para tres tamaños»).
- Weights: 300 (the breadcrumb's bars), 480 (Home's rows), 560 (two `strong`s), 700 (a lane's count and the report
  page's own headings and table), beside 400 · 500 · 600 and the greeting's 440.

## What changes

- **Leading tokens in `theme.css`**: `--lh-small` 16 (labels and small), `--lh-body` 20 (body and titles, 15 too),
  `--lh-head` 24 (16, 18, 20). The page's base reads `var(--type-body) / var(--lh-body)`.
- **One rule for every size**: `* { line-height: round(down, 1.55em, 4px) }`, set per element, so each size finds
  its own step on the grid (10.5 and 12 → 16, 13 and 14 → 20, 15 → 20, 16 and 18 → 24, 22 → 32); a rule that names
  a leading still wins. The headings at 20 name 24 (`--lh-head`), the screen title 32.
- **Every leading written by hand goes**, or goes onto a token: 27 ratio lines removed in the Studio's sheets, 34
  `font` shorthands carry `/ var(--lh-small)` or `/ var(--lh-body)` (a shorthand without a leading resets it to
  `normal`, so it must say). The personal thread's two voices keep 24 by name (15/24, 16/24: their reading leading).
- **Weights**: the breadcrumb's bars 300 → 400 (and 15 → 13), Home's rows 480 → 500, the two `strong`s 560 → 600, the
  lane's count 700 → 500. The greeting keeps 440.
- **Sizes off the scale that no view measured**: `.mono` and two notes at 11.5 → 12; Explore's 11.5 and 12.5 → 12.
- Kept, said so: a report's page (`.md`: its own ramp, 17/1.6 serif, a document's), a PDF's text layer, the
  greeting's 1.02 (display), glyphs sized to their circles (avatars, the stage's initial, a `pdot`), the project
  name centred in its 48 px bar.
- `type-scale.spec.ts` grows: on the same views and places, every visible word's leading is 16, 20, 24 or 32 px (or
  its box's own height, a line centred in a bar) and its weight 400, 500 or 600 (the greeting's 440 apart).
  `type-sizes.ts` gives the measure (`typeOff`).

## States

- No behaviour changes. Boxes of fixed height centre their words as before; a label that stood on its own line
  (a section's name, a date) is 16 px tall where it was 10.5 to 12.6: the rhythm under it moves by a few pixels.

## Checks (written first)

- The spec's measure before the change on Conversations: 19.5, 18, 15.75, 20.15, 21.45, 16.8, 10.5, 13.65, 12.6 px
  of leading; 300 on the bars. With the change: 16, 20, 24, 32; 400 · 500 · 600.
- Mutant, with the control passing: the `*` rule removed, every ratio returns and the measure reports it; a shorthand
  without its leading, `normal` and the measure reports it.
- `pnpm check` clean.

## Left

- The combinations per screen (Conversations 24, Tasks 22) come down with the leadings (three steps where there were
  nine) but not to the informe's eight: sizes × weights × mono stay above it where a view mixes labels, data and
  words. Counted in the handoff, not gated.
- A report's page keeps its own typography; it is a document, not the Studio's chrome.
