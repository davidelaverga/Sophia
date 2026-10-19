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
  `prefers-reduced-motion: reduce`, no animation (the room's engine already stands still there). The trace canvas
  paints over the halo by order (`z-index: auto`; the halo sits at `z-index: -1` inside the light's stacking, as
  delivered), so the floor's thread passes over the heart.
- **The trace in paper inks** (`inksFor(paper)` in `trace.ts`, pure and tested): on paper the room's edge is the halo
  `109 91 208` at 0.22, the thread runs from the warm `150 83 40` to the violet `85 70 184`, and its head is a violet
  glow composited `source-over`. The engine takes `setPaper(paper)`; `SophiaLight` follows the root's `data-theme`
  (`usePaper`, a `MutationObserver` on the root, so the account menu's change reaches a running light).
- **Home's and Talk's light on paper is laid unblended** (`normal`; round 4 below): the halo's own paper inks make it
  read as ink; the room's `screen` stays the room's.

## Checks

- `trace.test.ts`: the paper inks are the theme's violet and warm with `source-over`; the room's are unchanged;
  `drawWorkLine` strokes with the inks it is given.
- `e2e/light-breath.spec.ts`: on sign-in and the room in light, `.light` carries one running animation on its
  pseudo-element and none under reduced motion; the halo (now on `::after`) starts white at the centre; the trace
  canvas is above it; on Home and Talk in light the light is unblended and the formed mark's pixels are the brand's violet; in the room `.light` carries no CSS animation (the
  canvas breathes instead).
- `light-mark.spec` reads the halo from the pseudo-element. `pnpm format`, `lint`, `typecheck`; measured in the pane.

## After the review (Codex on #251)

- The halo's pseudo-element painted after the light's children, and only the trace had been lifted: on Home and after
  the sign-in's threshold forms, the white heart painted over the formed mark. The light now isolates its stacking and
  the halo sits at `z-index: -1` inside it, behind every child (the formed mark, the trace); the trace's own lift goes.
  `light-breath.spec` reads the halo's layer and, on Home, that the formed mark is a positioned child above it (a hit
  test cannot say so: the light takes no pointer events).
- Without WebGL the engine marks `data-fallback` and the room paints its radial on `.light` itself; with the halo on the
  pseudo-element both painted together on paper. On paper the element's own background is `none`; the spec sets the
  mark and reads both layers.

## After Luis's eye (2026-10-11)

- «El halo morado se pierde un poco con el blanco»: the heart's white reached the halo at 0.34 with nothing between,
  and the halo read as a wash. Three calibrations captured headless (`light-mode/halo-signin-{A,B,C,D}.png`); D
  chosen: the heart fades (0.96 → 0.86 by 4 %) into a rim of the deep violet (`85 70 184` at 0.4 by 8.5 %), then
  the halo (0.44 → 0.24 → 0.1) thins to nothing by 48 %. B's rim was crisp and read as a disc; C's ink shadow under
  the heart did not show. Depth comes from the rim, not from a shadow.

## After the review (Codex on #251, later round)

Codex read that the light's multiply, set on `.light` as a group, blends the formed mark with the paper too, so
Umbral's `#8468ee` would draw as `#8265e3`. Measured as drawn (headless Chromium, the pixels of a screenshot of Home on
paper at 1280, `scratchpad/captures/probe-mark-pixels.cjs`): the mark's pixels are `#8468ee` and `#16151b` exactly,
none `#8265e3`. The reason is the stacking: on Home the light stands in the side column (`.hw-side`, `z-index: 1`,
see-through), its own stacking context, and a group blends only with what is painted below it in that context, which
there is nothing; the paper is the page's, outside it. So the mark is the brand's ink as drawn, and the multiply, for
the same reason, does not reach the page on Home either: the breathing halo (`.light::after`) carries its own paper
tints, which is what the eye gets.

Moving the blend onto the halo's layers alone (`.light > canvas`) was tried and taken back: the `::after` halo and its
`-1` layering belong to the light's group, and light-breath.spec reads the group's blend by design. The rule stays as it
was.

Left: the mark outside the light's group (a sibling of `.light` in SophiaLight, positioned by the same box), for the
day the blend is made to reach the paper (a paper backing on the column, or the light outside it): then the mark would
be tinted, and this is the clean way out. Across the four places the light stands, with their specs.

## After the review, round 4 (Codex on #251)

Home without what needs you puts the light straight under `.hw`, outside the side column's stacking context, and there
the group's `multiply` did reach the paper: the formed mark drew as `#8265e3` (a control run with the multiply restored
reads no `#8468ee` pixel in the mark). The blend is dropped on paper, for Home and Talk: the halo carries its own paper
inks, so it reads as ink unblended, and the mark draws as the brand's ink wherever the light stands. light-breath.spec
reads the mark's pixels in the three places.

> 2026-10-17: on paper the halo became a solid orb; see `paper-orb.md`.
