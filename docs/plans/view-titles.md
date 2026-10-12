# A view's title at the size of a title

> 2026-10-11 · Luis: «Procede», after informe-ui-premium §3 (movement 2) and §1: the five views of a project top out at
> 20 px while Home greets at 52 px; entering a project reads as entering another product. Measured in the pane at 1440:
> the largest type on Goals, Tasks, Knowledge, Updates and Resources is 20 px (one node each); 13 px carries the body.
> No API change.

## What was measured

- `.view-head h2` (Goals, Tasks, Knowledge, Resources) and `.updates > h2` are 20 px on the 24 px leading: the top of
  the headings' ramp (15, 16, 18, 20), the same size as a tile's initial and a sheet's title. Nothing on a view is
  bigger than its section heads by more than 6 px.
- Home's greeting is the one display size (`.hw-hello`, a line that grows with the screen: 52 px at 1440, 38 on a
  phone). The personal space and the room keep 16 px as their largest word on purpose: a conversation, not a page.
- The specs pin the views' scale as `10.5 · 12 · 13 · 14 · 20` (`type-scale`, `work`, `resources`, `updates-quiet`),
  and `typeOff` allows the 32 px leading already.

## What changes

- **One step above the ramp for a view's title**: `--type-view: 28px` on `--lh-view: 32px` (the grid's next line), the
  heading weight 600 and tracking −0.02em as every heading. Twice the title step (14), a little over half of Home's
  greeting, so Home → a project is a step down and not a fall.
- **Where**: `.view-head h2` and `.updates > h2`, the five views' first word. Not a sheet's title, not a tile's
  initial, not a conversation's name (18 px in its own head), not the Places column's head in the app shell (20 px,
  a column and not a page; out of this PR and said in the handoff).
- **The rule**: on each view, the title is the only text at 28 px and the largest; everything under it keeps the
  four text sizes and the headings' ramp.

## Not in this PR (named so it is not forgotten)

- The section heads at 15–16 px that informe-ui-premium §3 suggests: a tile's and a goal's title are the kit's
  title step (14 px, `card-scale`); moving them is a card decision, not a title one.
- The data under 11 px (keys, counts, chips, times) stays as UIKIT-19 settled it; the 9.5 px glyphs are initials in
  their circles, not text on the scale.
- The radii «leaks» the report lists (999, 2 and 1 px) are the kit's pills and hairlines; `chips-radii.spec` already
  fences them. No radii PR.

## Checks

- `e2e/view-titles.spec.ts`: on Goals, Tasks, Knowledge, Updates, Resources and the work space the view's title is
  28 px on 32 px at 600, and no visible text on the page is larger; on a phone the same.
- `type-scale`, `work`, `resources` and `updates-quiet` pin the new scale (`… 14 · 28`); nothing else at 20 px was on
  those views.
- Measured in the pane at 1440 and 375 before the push.
