# The mark and her light on paper

> 2026-10-11 · Luis: «Hay que mejorar el modo claro. Aquí está el logo de branding en light mode» (the finalists
> artifact: Umbral on paper is ink `#16151B` for you and halo-deep `#8468EE` for Sophia; the brand note said the same on
> 2026-10-04, `brand-umbral.md`, and `favicon.svg` already switches to them under a light scheme). No API change.

## What was measured (the pane, `?theme=light`)

- The mark in the bar, on sign-in and in the guest room (`Mark.tsx`) fills its halves with `--warm` and `--core`, which
  on paper are the light theme's brown `#965328` and navy `#2f2566`: not the brand's paper colours. Sophia's half keeps
  a violet drop-shadow at rest (`0 0 2px` at 0.45) and a stronger one live; on paper it reads as a smudge under a navy
  shape. Home's formed light (`Threshold.tsx`) draws the same two halves with the same two tokens.
- Her light on paper (`:root[data-theme='light'] .light`) is one radial of the halo at 0.3 → 0.12 → 0 by 46 %: a flat
  lavender disc with no core, where the room's canvas has a bright centre. The report (informe-ui-premium §1) called
  it «una página en blanco con una mancha».
- The favicon's light block names `#16151B` and `#8468EE`: the tab and the bar disagree in light.

## What changes

- **Two tokens for the mark's inks**, `--mark-you` and `--mark-sophia`: in the room `var(--warm)` and `var(--core)` as
  today; on paper `#16151b` and `#8468ee`, the brand's paper colours, the favicon's. `Mark` and the threshold take the
  tokens; nothing else changes shape or size.
- **The halo on paper**: at rest none (the brand's paper mark carries no glow); live, a soft `0 0 3px` of halo-deep at
  0.5, so «live» still shows. The threshold's breathing keeps its keyframes (they use `--halo-rgb`, already the
  paper's violet).
- **Her light on paper gets a core**: white at the centre (0.95), the halo at 0.34 by 8 %, 0.12 by 22 %, gone by 46 %:
  a light with a bright heart on paper, as the canvas has in the room, within the same radius as before.

## Not in this PR

- The primary press stays the deep core (`#2f2566`): halo-deep with white or ink text falls under 4.5:1.
- The warm paper (`#fbf8f3`) stays (informe-30 §2.5 chose the report's paper); the finalists' tile paper `#F6F5F8`
  is the kit page's, not the Studio's.

## Checks

- `e2e/light-mark.spec.ts`: on sign-in, the room and Home in light, every mark half computes the paper inks
  (`rgb(22, 21, 27)` and `rgb(132, 104, 238)`), Sophia's half has no filter at rest and a halo-deep shadow live; the
  favicon's light block names the same two colours; her light's background on paper starts white at the centre. In the
  room the halves still compute the warm and the core.
- `pnpm format`, `pnpm lint`, `pnpm typecheck`; measured in the pane before the push.
