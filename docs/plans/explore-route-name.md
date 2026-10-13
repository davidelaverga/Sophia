# Explore: a candidate's route named whole

> 2026-10-13 · Luis: «Procede con las mejoras», after `informe-vistas-20.md` finding 6. Findings 4 and 5 were looked at
> again and need no change: `.page` already keeps 120 px under the last row, so nothing stays under the floating «Join
> the room»; each meeting's row says its length in words, and its bar only compares them (`aria-hidden`).

## What was measured

- At 1440 the direction's four tiles are about 230 px wide; «OpenAI Flare» beside «Outcome unknown» is cut to
  «OpenAI Fl…» (`.candidate-route` shrinks and ellipses). On a phone (≤ 560 px) the route already takes its own line.

## What changes

- **On every width the foot wraps instead of cutting**: the route keeps its whole name (it no longer shrinks; an
  ellipsis stays only for a name wider than the tile) and the state's tag goes under it when both don't fit.

## Checks

- `e2e/explore.spec.ts`: at 1440, every tile's route is drawn whole (its text not wider than its box).
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`; CI for the browser suites.
