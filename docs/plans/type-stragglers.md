# The work views keep to the type scale

> 2026-10-07 · From the measured audit behind `docs/plans/tertiary-ink.md`. The scale is #69's: label 10.5, small 12,
> body 13, title 14, and the headings above them.

## The finding

Sizes from before the scale were left in the shared CSS: 13.5 px on the bar's crumbs and the project's name, 12.5 px notes («Sophia joins when asked.», «Nothing carried in yet»), an 11 px avatar letter and mono lines, a
10 px key. Updates' title was 18 px where the other views say theirs at 20.

## What changes

- In `theme.css` and `artifacts.css` (not the personal space, which keeps its own editorial scale): 12.5 → small,
  13.5 → body, 11 and 10 → label, as tokens; the page's base stays at 13.5 px (the personal space, Home and sign-in
  inherit it); Updates' title at 20 px like the other views.

## Checks

- The room, Knowledge, Updates and Conversations: every size on the scale or a heading's (`e2e/type-scale.spec.ts`).
