# The room as lit paper

> 2026-10-11 · Luis: «Procede con los arreglos», informe-ui-premium §8 move 3: in light the room's stage is a cream
> rectangle with an ellipse in it; in the room it is a void with grain and a light. And «has the floor» reads 4.11:1 on
> paper, under the 4.5 the light-mode spec promises. No API change.

## What was measured (headless captures `light-mode/room-light.png`, `room-call-light.png`; the pane)

- `.room-stage` has no surface of its own: on paper it is the page's `#fbf8f3` to its edges, and her light (now with a
  heart and a breath) is the only thing on it. The other views keep a faint trace of the halo from above
  (`.shell:not([data-view='studio'])`); the studio shell has none.
- `.presence[data-floor] .role` is the warm at 0.85; on paper that is `rgba(150, 83, 40, 0.85)` over `#fbf8f3`,
  4.11:1 at 12 px. The warm at full reads 5.6:1.

## What changes

- **Lit paper under the stage**, on paper only: `.room-stage::before`, a layer behind everything on the stage, with
  the halo reaching the edges as a soft field (`rgb(var(--halo-rgb) / 0.06)` at the light's centre, 0.025 by 60 %,
  gone at the corners) over a warm vignette (`rgb(var(--warm-rgb) / 0.05)` from the edges inward, nothing by 55 %).
  The stage reads as a surface the light sits on, not a hole in the page. In the room nothing is added: the void, the
  grain and the canvas are the room.
- **«has the floor» at the warm's full ink on paper**: `:root[data-theme='light'] .presence[data-floor] .role`
  takes `var(--warm)` (5.6:1); the room keeps 0.85 (the warm at 0.85 on the void reads 10:1).

## Checks

- `e2e/light-stage.spec.ts`: in the room in light `.room-stage::before` carries the two gradients and sits behind the
  light (`z-index: 0`, the light above); the floor's role at `rgb(150, 83, 40)` reads 4.5:1 or more on the paper; in
  the dark room `.room-stage::before` has no background and the role keeps the warm at 0.85.
- `pnpm format`, `lint`, `typecheck`; measured in the pane; a headless capture of the room in light for the handoff.
