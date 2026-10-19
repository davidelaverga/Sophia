# Try again's focus and the light's context: follow-ups to #416 and #454

> 2026-10-19 · two Codex P2s left on merged PRs, from the follow-up list (`seguimientos-p2.md`): «Move focus after a
> successful retry» on #416 ([view-boundary](view-boundary.md)) and «Release contexts when renderer setup fails» on
> #454 ([light-webgl-room](light-webgl-room.md)). Luis 2026-10-18: «Todo trabajo nuevo que hagas ten en cuenta nuestro
> cuello de botella actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir
> trabajando». Both are small and apart, so one PR. Studio only; no API, no CSS.

## What was measured

- **#416, Try again.** `ViewFailed`'s Try again only sets `{ failed: false }`. The view draws again in place of the
  fallback, and the pressed button goes with it. Nothing gives the focus on, so a keyboard lands on the page's body and
  starts again from the top. `view-boundary.spec.ts` presses it with a pointer and reads the heading, never the focus.
- **#454, a light that doesn't compile.** `createLightRenderer` takes the canvas's WebGL context before it compiles the
  light. A shader that doesn't compile, or a program that doesn't link, throws inside `setUp`. The catch warns and
  returns `null` with the context still held. The only `loseContext` is the returned renderer's `release`, so the
  engine, holding `null`, can never give that context back. Each turn to dark mounts a new canvas (`SophiaLight`), so
  on such a GPU each paper/dark toggle leaves one more context alive until its canvas is collected. Browsers cap live
  contexts and drop the oldest past it. `engine.test.ts`'s fake context always compiles.

## What changes

- **`ViewFailed.tsx`:** Try again remembers that it was pressed. Once the view has drawn again, the view's heading
  takes the focus: its first `h2`, the title every view has (view-titles.md), given `tabIndex={-1}` if it has none, as
  Places does on a move. Codex names the heading first, and a screen reader then says which view came back. A view that
  draws no heading yet gives the focus to its content (`main[data-content]`), as «Skip to content» does. The flag is
  dropped on the next update whatever happened, so a retry that fails again, then a move to another view, takes no focus
  from the link that was pressed.
- **`renderer.ts`:** the catch gives the context back (`WEBGL_lose_context`) before it returns `null`. The room keeps
  its CSS glow as before. A second engine on the same canvas (StrictMode) gets the lost context, fails the same way and
  keeps the glow, as it already did, because that GPU can't compile the light.

## Checks, written first

- **`view-boundary.spec.ts`:** Resources fails to draw (`resources=crash`), is healed, and Try again is pressed by the
  keyboard (focus, Enter). The view draws, and the focus is on its heading («Resources», `#resources-title`). Red today:
  the body.
- **`engine.test.ts`:** a canvas whose fake context refuses the shader (`getShaderParameter` false), then one that
  refuses the link (`getProgramParameter` false), each handed over turning dark: the box keeps `data-fallback`, and
  each context taken is given back (`lost === true`). Red today: `false`.

## Limits

- After the redraw the focus doesn't go back to Try again's place in the page. It goes to the top of the view, where a
  move to it starts too.
- A retry that fails again leaves the fallback where it was. Whether the focus stays on Try again then is React's to
  keep (it reconciles the same fallback), and the check reads it but this change doesn't add anything for it.
