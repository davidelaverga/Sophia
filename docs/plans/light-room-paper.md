# Her light on paper follows the engine, and stays lit while work runs

> 2026-10-17 · informe-25 (`evaluacion-2026-10-17/informe-25.md`), X1 and the measured part of X2, from Luis's «Sigue
> con la cola … y el nuevo informe-25». Studio only; the room in production.

## What was measured

- **X1:** on paper the room's halo was a fixed radial at 50 % 42 % of the room: the engine's springs (her place, her
  radius, her state) only reached the WebGL canvas, which paper hides. In a video call her violet showed in the gap under
  the viewer's tile, not in hers, and nothing said whether she listened, thought or worked.
- **X2:** on the dark page, with work running (the room's most-seen state) the shader drew her at 0.6 of her size and
  0.3 of her energy: core luminance about 0.18 against 0.6 at rest, reach about 55 px against 240. She read as off.

## What changes

- **`shape.ts` (pure):** `WORK` (size 0.9, energy 0.75, ember 0.35) and `shapeOf`, the shader's size and strength from
  the springs, without the page's intensity; `paperHalo` gives the halo's properties (`--lx`, `--ly`, `--lr` in px of the
  light's box; `--ls`, `--le`).
- **The shader** reads `WORK` instead of its own 0.6, 0.7 and 0.65: busy, a little narrower, never out.
- **The engine** writes the paper halo's properties on the light's box while on paper, only when they change; the canvas
  is still drawn only where it is displayed.
- **theme.css:** the paper halo takes its centre and its radius from the room (`--halo-at`: three of her radii times her
  size, at her place) and its strength (`filter: opacity`). Sign-in, Home and Talk keep their calibrated halo at
  50 % 42 %. The halo's box is never scaled, so no edge of it shows.
- **Not changed:** the room's work edge stays still (room-work-line.md, Luis 2026-09-30).

## Checks, written first

- `shape.test.ts`: busy keeps ≥ 0.75 strength and ≥ 0.85 size; the shader carries the same numbers, not 0.6 and 0.7;
  `paperHalo` for rest, work, think, a swell (capped at 1) and an ignite.
- `light-room-paper.spec.ts` (paper): in a video call the gallery's most violet point is inside her tile, desktop and
  phone; the halo's centre is her tile's centre and its radius three of hers; rest, work and think give size 1 / 0.9 / 1
  and strength 1 / 0.75 / 0.78.
- `light-work.spec.ts` (dark): with work running, core ≥ 0.45 and reach ≥ 160 px; rest (the control) ≥ 0.55 and ≥ 200.
- `light-breath.spec.ts`: the room's halo is a radius at her place; sign-in's is unchanged.

## Left, and for Luis

- **X1 is partial on states:** listen and speak read as rest on paper (her voice's amplitude reaches the light with X3),
  and think and work differ little. Paper keeps Luis's calibrated rest (light-breath.md), so the page's intensity is not
  applied there.
- **X2 waits on Luis:** (a) as here, lit, narrower, a touch of ember, the edge still; (b) the report's comet along the
  edge, which reverses room-work-line.md; or (c) a slow drift inside the light. And whether the still edge's alpha rises
  (about 1.07:1 today).
- On a phone the paper halo at rest is about 17 % tighter than the farthest-corner radial it replaces (desktop is the
  same within a pixel). In a video call the halo spills up to 0.09 alpha above her tile; it isn't clipped.

> 2026-10-17: on paper the halo became a solid orb; see `paper-orb.md`.
