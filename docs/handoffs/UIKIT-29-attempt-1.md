# Implementation-session handoff

Goal and attempt: UIKIT-29 (her light breathes on paper, the trace writes in the paper's inks, Home's light blends as
ink; informe-ui-premium §8 move 2; Luis: «Procede con los arreglos»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/light-breath` from `ui/light-fills` at
`4a55180b` (+ `e8954db1`, the fills spec typed; stacked on PR #250 → #249 → … → #220; the base retargets as each
merges)
Ending commit/tree: `8257d14bec7c` (tree `2667cbabcd42`), the last commit of `ui/light-breath`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 11 files changed against
`ui/light-fills` at that commit: `e2e/light-breath.spec.ts`, `e2e/light-mark.spec.ts`, `src/app/theme.css`, `src/app/theme.ts`, `src/features/light/SophiaLight.tsx`, `src/features/light/engine.ts`, `src/features/light/trace.test.ts`, `src/features/light/trace.ts`, `src/features/personal/personal.css`, `docs/handoffs/UIKIT-29-attempt-1.md`, `docs/plans/light-breath.md`. The review notes below name the commit of each later change.

## Outcome

- On paper the halo lives on `.light::after` and breathes: 6 s ease-in-out alternate, scale 1 → 1.04 about the
  light's centre, opacity 0.92 → 1; none under reduced motion. The trace canvas sits above it (`z-index: 1`).
- The trace writes in the paper's inks on paper: the edge in the theme's halo at 0.22, the thread from the warm to the
  violet, the head a violet glow composited `source-over`; in the room, exactly as before (`ROOM_INKS`). The engine
  is told by `SophiaLight`, which follows the root's `data-theme` through a `MutationObserver` (`usePaper`).
- Home's and Talk's light on paper is laid on the page unblended: the halo carries its own paper inks (round 4
  below; the first delivery blended `multiply`).
- Also on this branch's base: the fills spec of #250 typed (`e8954db1`): its luminance took a tuple with undefined
  channels under `noUncheckedIndexedAccess`; my last typecheck there had run before the hoist. Checked here.
- Unverified: the Playwright run (the local guard); CI is the run on record.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm --filter @sophia/studio typecheck`: clean; `trace.test.ts` 4 pass.
- Measured in the page, the first delivery (pre-fix, superseded below): the halo starting at 0.95, `.light-trace` at
  `z-index: 1`, Home blending `multiply`.
- As delivered: sign-in in light, `.light` with one running animation `paper-breathe`; the halo on `::after` at
  `z-index: -1`, starting `rgba(255, 255, 255, 0.96) 0px` (the recalibration, `7cc21a73`); `.light-trace` at
  `z-index: auto` (it paints over the halo by order); Home and Talk on paper unblended (`normal`), the formed mark's
  pixels the brand's `#8468ee` with and without needs; sign-in in the room, no CSS animation and no pseudo-element halo.

## Decisions and changes

- A pseudo-element and not an animation on `.light` itself: the canvases inside must not scale with the halo, and
  the trace must stay crisp over it.
- Inks by palette, not by a second draw path: one `drawHandoff`, one `drawWorkLine`, the inks a parameter; the
  room's values are the ones that were inline.

## Remaining obligations

- Watch CI; the independent review (Codex) with no P1/P2 before merge. The base is `ui/light-fills` until #250 merges.

## Next bounded action

Informe-ui-premium §8 move 3: the room's stage as lit paper and «has the floor» at 4.5:1 (UIKIT-30).

## Post-review (Codex on #251)

- `9519350b`: the light isolates its stacking and the halo sits at `z-index: -1` inside it, behind the formed mark and
  the trace; `3d59aadd`: the spec reads the stacking (the light takes no pointer events). `f7a74c2b`: on paper the
  element’s own background is `none`, so the dark fallback radial (no WebGL) no longer paints under the halo.

- `7cc21a73`: the halo recalibrated after Luis’s eye (a soft heart and a deeper rim; `light-breath.md`, «After Luis’s eye»).

## Post-review (Codex on #251, later round)

Measured, not changed: the mark on Home draws `#8468ee` as the brand's ink (pixel read of a screenshot), because the
light's group blends inside the side column's own stacking context (`.hw-side`, z-index 1, see-through), where there is
no paper to blend with. The blend on the light's canvases alone was tried in `7e33fbe3` and taken back (the `::after`
halo and its `-1` layering are the group's; light-breath.spec reads the group's blend). The mark outside the group is
left in the design note for the day the blend reaches the paper.

## Post-review, round 4 (Codex on #251)

- On paper Home's and Talk's light is unblended (`mix-blend-mode: normal`). The `multiply` on the light's group either
  reached nothing (inside the side column's stacking context, with needs) or tinted the formed mark with the paper
  (Home without needs: `#8468ee` drew as `#8265e3`, as Codex said; a control run reads zero brand pixels then). Talk's
  room `screen` no longer reaches paper either.
- light-breath.spec reads the mark's pixels from a screenshot on Home without needs, with needs, and in Talk: the
  brand's violet, none of the tinted shade; and the blend `normal`. The evidence above is split into the first
  delivery and the state delivered.
