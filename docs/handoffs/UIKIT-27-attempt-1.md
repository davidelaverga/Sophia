# Implementation-session handoff

Goal and attempt: UIKIT-27 (the mark and her light on paper: the brand's paper inks for Umbral in light, no glow at
rest, a white heart for her light; Luis: «Hay que mejorar el modo claro. Aquí está el logo de branding en light mode»),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/light-mark` from `ui/section-heads` at
`06233b26` (stacked on PR #248 → #247 → … → #220; the base retargets as each merges)
Ending commit/tree: `694e44df` (tree `cef402770ecf`): 3 files: `theme.css` (tokens `--mark-you` / `--mark-sophia` in the room and on paper; the mark and the
threshold take them; the paper mark's glow at rest and live; her light's core on paper), `e2e/light-mark.spec.ts` (new,
5), `docs/plans/light-paper-mark.md`. The commit after it adds only this handoff.

## Outcome

- On paper the mark's halves are `#16151b` (you) and `#8468ee` (Sophia): the finalists artifact's paper colours, the
  brand note's, the favicon's. In the room nothing changes (the warm and the core). Home's formed light (the threshold)
  takes the same tokens.
- On paper Sophia's half carries no glow at rest; live, a soft `0 0 3px` of halo-deep at 0.5.
- Her light on paper has a white heart: `rgb(255 255 255 / 0.95)` at the centre, the halo at 0.34 by 8 %, 0.12 by
  22 %, gone by 46 % (the same radius as before).
- Not in this PR: the primary press keeps the deep core (halo-deep with text falls under 4.5:1); the warm paper stays
  (informe-30 §2.5). Unverified here: the Playwright run (the local guard); CI is the run on record.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm --filter @sophia/studio typecheck`: clean.
- Measured in the page (`signin.html?theme=light`): tokens `#16151b` / `#8468ee`; the halves compute
  `rgb(22, 21, 27)` and `rgb(132, 104, 238)`, Sophia's filter `none`; her light's background starts
  `rgba(255, 255, 255, 0.95) 0px, rgba(109, 91, 208, 0.34) 8%, rgba(109, 91, 208, 0.12) 22%`. On Home in light (`home.html?demo=1&theme=light`) the formed threshold computes the same two inks.

## Decisions and changes

- Tokens and not a light-only rule on each selector: the mark is drawn in three places (`Mark`, the threshold, and
  whatever comes next); one pair of tokens keeps them one mark.
- The brand's paper colours exactly (`#16151b`, `#8468ee`), not the theme's ink `#1d1b22`: the tab bar's favicon
  already shows them, and the bar and the tab must agree.

## Remaining obligations

- Watch CI; the independent review (Codex) with no P1/P2 before merge. The base is `ui/section-heads` until #248
  merges.

## Next bounded action

Light mode, the rest: a pass over the light pages with captures at a legible width (the pane scales 1440 down too far
in this session) for whatever else reads wrong on paper; then the queue (Hold/Stop as text buttons, the dock).

## Post-review (Codex on #249)

- The tab's mark follows the appearance shown, not only the system's: `favicon-light.svg` and `favicon-dark.svg` hold
  fixed inks, `applyTheme` points the SVG icon at the one shown and `public/entry.js` does so at first paint.
  light-mark.spec crosses both ways (Light on a dark system, Dark on a light one) on the shipped page.
