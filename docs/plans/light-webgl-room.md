# Only the room holds a WebGL light

> 2026-10-17 · Luis approved branches 1 to 9 of the light-mode plan (informe-claro §6, row 4, finding D24): «se crea un
> contexto WebGL "high-performance" que nunca dibuja». Studio only, no API change, the dark room drawn as before.

## What was measured

- `LightEngine`'s constructor creates the renderer on every page (engine.ts:197): `getContext('webgl', {
  powerPreference: 'high-performance' })` (renderer.ts:107), the light's program compiled, a buffer filled. On paper the
  canvas is `display: none` (theme.css:150) and `draw` skips it (no `offsetParent`, engine.ts:330), so that context
  never draws a frame. It is asked for on sign-in, Home, Talk and the room alike.
- Turned paper, a running light keeps its context live: `setPaper` only switches the trace's inks, and `dispose`
  only unbinds a buffer. That is on purpose for `stop()`: StrictMode and fast refresh start a second engine on the
  same canvas, and a lost context could not draw there (renderer.ts:145).

## What changes

- **The canvas comes and goes with the room.** `SophiaLight` renders `.light-gl` only while the page is dark; the
  engine is built with its box and trace alone, and `setPaper(paper, glCanvas)` creates the renderer on the room's
  canvas or lets it go.
- **Turned paper**, the old canvas leaves with its context, which is given back at once (`release`:
  `WEBGL_lose_context`), not when the browser collects the canvas. **Turned dark**, a new canvas gets a new context,
  sized to the box as it arrives (no resize comes for a box that kept its size); the next frame draws it, and a
  blank canvas under `screen` shows nothing until then.
- `stop()` is unchanged: the context stays with its canvas, so StrictMode's second engine draws on the same one.
- `data-fallback` follows each try in the room: set when WebGL is missing, taken away when a later canvas has it.
  Paper never asks, so it never marks.
- The dark room is drawn by the same renderer from the same springs: only the moment it is created moves, from the
  constructor to the `setPaper` that follows it in the same effects pass, before any frame.

## Checks, written first

- `engine.test.ts` (the page stood in for: a WebGL context that counts frames and says whether it was given back, the
  box, its observer, the frames): on paper no context while frames run, even handed a canvas; in the room one, at
  0.55 of an 800×600 box once measured, drawing; turned paper it is given back and nothing is drawn; turned dark a
  second context on the new canvas, sized at once, drawing; told the same twice it keeps what it holds, live;
  stopped, a second engine reuses the same canvas's context; without WebGL `data-fallback`, gone once a canvas has
  it. Each rule's mutant (create on paper, no release, no sizing, `stop` releasing, no mark, no same-canvas guard)
  fails at least one case. At the test commit the six cases fail first on the constructor's new signature (a
  TypeError): the red phase is that change; the mutants are what show each assertion bites.
- `e2e/light-webgl.spec.ts`: sign-in, Home and the room on paper give a light canvas 0 WebGL contexts; the dark room 1,
  live, drawing, its canvas at one of the renderer's qualities on both axes (a control, green before the change too);
  dark → Light from the account menu leaves 0 live, → Dark makes a second, live, drawing at the box's size (a canvas
  never sized keeps the browser's 300×150).
- Still green: `light-mode.spec` (no WebGL frame on paper; the theme chosen in the menu), `light-breath.spec` (the
  paper halo over a set fallback), `light-stage.spec`, `light-mark.spec`, `home.spec`, `signin.spec`.

## Limits

- Turned dark again, the renderer starts at its first quality (0.55); a slow device steps down again as before.
- `:root[data-theme='light'] .light-gl { display: none }` stays: theme.css is edited in parallel by branches 5 to 9,
  and the rule covers the moment between the root's change and React's render.
- A device without WebGL asks once each time the page turns dark; a shader that fails to compile warns each time.
- A light stopped while dark (its page left) still leaves its context to the canvas's collection, as before.
- The e2e counts need WebGL in the test browser (Playwright's Chromium on SwiftShader).
