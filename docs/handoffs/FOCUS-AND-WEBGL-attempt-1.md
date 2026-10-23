# Implementation-session handoff

Goal and attempt: FOCUS-AND-WEBGL (Codex P2s on #416 and #454, from the follow-up list `seguimientos-p2.md`; Luis
2026-10-18: «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en un pr,
excelente o como veas, que alivie la presión pero hay que seguir trabajando»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-8`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-8`, branch `polish/focus-and-webgl` from `origin/main`
(`b89a5a962`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no CSS, no fixture change.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-18, as quoted above: local only until he says; merges on green with no open P1 once
pushed. Both follow-ups are small and apart, so the branch is one PR.
Ending commit/tree: `2ea2782274f3` (tree `21799318f428`), the last commit of `polish/focus-and-webgl`'s own that changes
code (the next commit touches only this record). 5 files changed against `b89a5a962` at that commit:
`e2e/view-boundary.spec.ts`, `src/features/light/engine.test.ts`, `src/features/light/renderer.ts`,
`src/features/studio/ViewFailed.tsx`, `docs/plans/focus-and-webgl-follow-ups.md`.

## Outcome

- Try again on a view that couldn't be drawn no longer drops the focus on the page. Once the view draws again, its
  heading takes the focus. If it still fails, the new Try again takes it.
- On a GPU that hands the light a WebGL context but can't compile its shader or link its program, the context is given
  back as the renderer gives up. The room keeps its CSS glow as before, and turning dark again no longer leaves one
  more context alive each time.

## Evidence

- Plan: `docs/plans/focus-and-webgl-follow-ups.md` (`c14c771f8`; the retry that fails again added in `231868424`, as
  the first run found it).
- **#416, written first** (`231868424`; the spec is the same at `a2bd64e84`, where it ran): `view-boundary.spec.ts`
  failed its two new checks and passed its other three. Drawn again: `Expected: "resources-title"`,
  `Received: "BODY"`. Still failing: `expect(locator).toBeFocused()`, `Received: inactive` on the new Try again. React
  mounts the fallback anew when the boundary catches again, so the plan note's first guess, that React would keep the
  fallback and its focus, was wrong. Fixed in `369f26f2a`.
- **#454, written first** (`bd73c16dd`): unit `engine.test.ts` 11 passed, 1 failed:
  `AssertionError: the context its shader failed in, given back`, `false !== true`, with `data-fallback` already set.
  A probe with the shader's assertion taken out failed on the link the same way (`the context its program failed to
  link in, given back`, `false !== true`). Fixed in `2ea278227`: 12/12.
- **At `369f26f2a`:** `view-boundary`, `skip-link`, `view-titles`, `crash-feedback`, `goal-address` and
  `focus-visible`: 42/42.
- **At `2ea278227`:** `light-webgl`, `light-work`, `light-room-paper`, `light-mode`, `light-live`, `light-stage` and
  `view-boundary`: 49/49. Unit: `features/light` (6 files) and `features/studio` (7 files) all pass. Typecheck and
  Prettier clean on every file touched.
- **Type-aware lint (whole repo):** one error, not on this branch:
  `useProjectRoom.ts:599 max-lines-per-function` (`useRoomConnection` 61 lines of 60). It came with `origin/main`
  `b89a5a962` (the #467 merge), and this branch doesn't touch that file. #468 removes a line from that function, which
  brings it back to 60. The files this branch touches lint clean.
- **Captures** (throwaway spec, deleted): 1280 × 800 dark and 390 × 844 light, reached by Tab, in
  `scratchpad/polish-focus-and-webgl/`. Still failing, the new Try again has the focus and shows its ring. Drawn
  again, `#resources-title` has it and shows its ring (`:focus-visible`, 2 px outline). Nothing scrolls sideways at
  either size (`scrollWidth − clientWidth` 0).

## Decisions and changes

- **The heading, not the main:** Codex names the recovered view's heading first. Places gives the focus to a place's
  heading on a move, and a screen reader then says which view came back. The first `h2` in the boundary is every
  view's title (view-titles.md). It gets `tabIndex = -1` if it has none, as «Skip to content» does for the content. If
  no heading is drawn, the content (`main[data-content]`) takes the focus, as the skip link's does.
- **One update only:** the press is remembered until the update it brings, then dropped, so a later move to another
  view keeps the focus on the link that was pressed.
- **The context is lost in the renderer's catch**, not kept as a handle in the engine: nothing else needs it. A
  StrictMode second engine on the same canvas gets the lost context, fails the same way, and keeps the glow, as it
  already did on that GPU. That follows from the WebGL spec, where a lost context's `createShader` and `getExtension`
  return null; the unit fake doesn't model a lost context, so no check runs it.

## Remaining obligations

- The whole-repo lint stays red on `main` until #468 (or another change) shortens `useRoomConnection`.
- After the redraw the focus goes to the top of the view, not back to where Try again stood. A move to a view starts
  there too.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository and the Codex comments on #416
  and #454 (read only).
