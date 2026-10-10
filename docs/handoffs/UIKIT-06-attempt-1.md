# Implementation-session handoff

Goal and attempt: UIKIT-06 (the kit's seventh piece: `Card`, one surface), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/kit-card` from `ui/kit-menu` at `e0c65b5b`
(stacked on PR #227 → #224 → #223 → #222 → #221 → #220; the base retargets as each merges)
Ending commit/tree: `01a8afaf` (tree `9b7a46a6926e`): 15 files, 5 new (`Card.tsx`, `card-class.ts`,
`card-class.test.ts`, `e2e/card-scale.spec.ts`, `docs/plans/card-scale.md`). The commit after it adds only this
handoff.

## Outcome

- `@sophia/ui` exports `Card` (any of `div`, `li`, `article`, `section`, `button`, `a`; `kind` base or tile; `live`
  when it answers, a button or a link by default), `CardCover`, and the pure `cardClass` / `CARD`.
- One `.card` surface in `theme.css` (the plane, the 1 px edge, the radius and padding of its kind) with one answer
  for every live card (hover, pressed, focus-visible) and `.card-cover`.
- The four cards render through `Card`: the board's research card (`WorkCard`, `DesignCard`: `li`), the board's
  tiles (`TaskTile`: `button`, tile), the resource tiles (`ResourceTile`: `button`), the Knowledge cards
  (`KnowledgeReports`: `li`, live, with `CardCover`). Their CSS keeps only what is theirs.
- Unverified here: the Playwright run of `card-scale.spec.ts` (the guard keeps refusing a browser run beside the
  open game); CI is the run on record for it and for the board's, Knowledge's and Resources' own specs.

## Evidence

- `pnpm format:check`, `pnpm lint` (type-aware), `pnpm typecheck`: clean (Node 24.21.0 from `~/.sophia/node`).
- `node --test "packages/ui/src/**/*.test.ts" "apps/studio/src/**/!(*.db|*.live).test.ts"`: 1048 passed (1046 + the
  2 of `card-class.test.ts`).
- The spec's measure, run in the page (the browser pane, 1280×800, served on 5197), after the change:
  - Board: the research card `li.card.task.work-card`, 12 px, `1px solid rgba(236, 235, 241, 0.08)`, `rgb(18, 17,
    24)`, 14 px, no pointer cursor; seven tiles `button.card.card-tile.live.task-tile`, 8 px, the 1 px edge in the
    line (the waiting and working tiles in their own colour), 10 × 12, the plane (the free tile see-through and the
    complete one stepped back, as before: their own), the transition now `border-color, background-color,
    transform, …`. Under the pointer the complete tile's edge reads `rgba(236, 235, 241, 0.14)`, its plane the 3 %
    mix, and it keeps its 2 px lift.
  - Knowledge: six `li.card.live.report-card`, 12 px, the edge, the plane, `8px 8px 14px`, pointer cursor; each cover
    `8px · 1px line · rgb(11, 10, 15)`. Under the pointer the first card's edge reads `--line-2` (was `--line-3`).
  - Resources: two `button.card.live.resource-tile`, 12 px, 14 px, the plane, the rim kept; the waiting tile's edge
    its amber; under the pointer the Codex tile's edge reads `--line-2` and its plane the mix.
  - The `.card*` rules as the page holds them: `.card`, `.card-tile`, `.card.live` (cursor, the three transitions),
    `:hover` (`var(--card-edge-hover, var(--line-2))`, the 3 % mix), `:active` (the 6 % mix, `translateY(0.5px)`),
    `:focus-visible` (the halo ring), `.card-cover`.
- Before the change: the research card `0px none` of edge over `--glass` at 0.74, 12 × 14; the tile `border: 0`
  with an inset edge of 0.06 white, `scale(0.99)` pressed; the Knowledge card lighting to `--line-3`; the resource
  tile already on the surface (it was the model).
- Seen in the pane: the board (tiles and research card), Knowledge, Resources, each at rest and one card hovered.
- Not measured in the pane (a hidden pane fires no mouse down): the press's half pixel and the keyboard's ring; both
  are rules the page holds (above) and the spec asserts them in CI.

## Decisions and changes

- `Card` is polymorphic (`as`) and names no layout: the research card stays a grid, the tile a two-column grid, the
  resource tile a flex column; the kit gives the surface and the answer only.
- The tile's state edges move from an inset shadow to the border (`--edge` colours `border-color`), so the kit's one
  edge is the tile's edge too; a tile with a state keeps it under the pointer (`--card-edge-hover: var(--edge,
  var(--line-2))`), a tile without lights to the line.
- The tile keeps its 2 px lift on hover (the board's depth); the kit's press (half a pixel down) replaces its
  `scale(0.99)`.
- The Knowledge card's padding is named with the card (`.card.report-card`), so it outweighs the surface's 14
  whatever the order the sheets load in (the lesson of #223).
- The goals' list, home's rows, the conversation and meeting rows are rows, not cards; the stage's `.tile` is a
  person's video. None moves.
- `CardProps`' optional props admit `undefined` explicitly (`exactOptionalPropertyTypes`): a caller spreading its own
  props (the resource tile's `className`, `data-*`) type-checks.

## Remaining obligations

- Watch CI for `card-scale.spec.ts` and the board's, Knowledge's and Resources' specs; fix in this PR what the pane
  did not see (the press and the ring above all).
- The independent review (Codex) with no P1/P2 before merge. The base is `ui/kit-menu` until #227 merges.

## Next bounded action

UIKIT-07: `Skeleton` with the empty states (informe-30 §2.1: «todas las vistas cargan y vacían igual que Resources»).
