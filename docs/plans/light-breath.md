# Her light breathes on paper, and the trace writes in ink

> 2026-10-11 · Luis: «Procede con los arreglos», informe-ui-premium §8 move 2: on paper her light is one still CSS
> radial (`getAnimations()` on `.light`: 0 in light, where the room's WebGL canvas breathes and moves), and the trace
> canvas keeps drawing the room's warm-white strokes, which paper cannot show. No API change.

## What was measured

- `:root[data-theme='light'] .light` paints the halo as a background: still, by construction. The room's light is a
  WebGL canvas (`.light-gl`, hidden on paper) whose springs breathe; the one living element of the product stops in
  light.
- `trace.ts` draws the room's edge in the halo at 0.07, the floor's thread from warm `243 220 200` to violet
  `196 180 255`, and its head as a white glow composited `lighter`: light added over the void. On paper, `lighter`
  whitens the page and the warm-white thread vanishes; `.light-trace` stayed visible in light with nothing it could
  show.
- Home masks its light and blends it `screen` (`.places .hw-light .light`), which adds light: on paper the halo
  cannot darken the page, so it reads as a faint lightening at best.

## What changes

- **The breath on paper**: the halo moves to `.light::after` (the same radial, white heart and all), which breathes
  6 s ease-in-out, alternate: scale 1 → 1.04 about the light's centre (50 % / 42 %), opacity 0.92 → 1. Under
  `prefers-reduced-motion: reduce`, no animation (the room's engine already stands still there). The trace canvas sits
  above the halo (`z-index: 1`) so the floor's thread passes over the heart.
- **The trace in paper inks** (`inksFor(paper)` in `trace.ts`, pure and tested): on paper the room's edge is the halo
  `109 91 208` at 0.22, the thread runs from the warm `150 83 40` to the violet `85 70 184`, and its head is a violet
  glow composited `source-over`. The engine takes `setPaper(paper)`; `SophiaLight` follows the root's `data-theme`
  (`usePaper`, a `MutationObserver` on the root, so the account menu's change reaches a running light).
- **Home's light on paper blends `multiply`**: ink laid on the page, so the halo around the formed mark darkens the
  paper the way the room's halo lightens the void. The white heart multiplies to nothing, as it should behind the mark.

## Checks

- `trace.test.ts`: the paper inks are the theme's violet and warm with `source-over`; the room's are unchanged;
  `drawWorkLine` strokes with the inks it is given.
- `e2e/light-breath.spec.ts`: on sign-in and the room in light, `.light` carries one running animation on its
  pseudo-element and none under reduced motion; the halo (now on `::after`) starts white at the centre; the trace
  canvas is above it; on Home in light the light blends `multiply`; in the room `.light` carries no CSS animation (the
  canvas breathes instead).
- `light-mark.spec` reads the halo from the pseudo-element. `pnpm format`, `lint`, `typecheck`; measured in the pane.

## After the review (Codex on #251)

- The halo's pseudo-element painted after the light's children, and only the trace had been lifted: on Home and after
  the sign-in's threshold forms, the white heart painted over the formed mark. The light now isolates its stacking and
  the halo sits at `z-index: -1` inside it, behind every child (the formed mark, the trace); the trace's own lift goes.
  `light-breath.spec` reads the halo's layer and hits the mark through its centre on Home.
