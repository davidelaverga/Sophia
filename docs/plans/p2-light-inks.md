# Light mode's inks: hairlines, Sophia's glyph, the tab's mark (Codex P2s on #234, #249, #257)

Luis, 2026-10-12: «atiende los P2 en PRs pequeñas». Seventh follow-up to the kit stack's open Codex P2s. This one: what
light mode still drew in the room's inks.

## What was measured

- #234 4249607163: Home's line and the personal composer draw their only boundary in `--sheen-rgb` (white) at 12 %:
  on paper about 1.01:1, no line.
- #257 4249588427: on paper, Sophia's half of her mark (`#8468ee`) on her disc (`#c6bfe0`) is 2.3:1, under the 3:1
  floor marks are held to; the check read only the disc.
- #249 4249588107: with no valid theme stored on a light system, entry.js leaves `/favicon.svg` (light inks) while the
  app boots dark and then switches the icon.
- #234 4250210624 (the 2D traces in the room's inks on paper): already resolved on `main` by `2210cd6d` (UIKIT-29,
  `inksFor(this.paper)`); answered, no change here.

## What changes

- The two hairlines are drawn in the ink, `rgb(var(--ink-rgb) / 0.12)`, in both themes.
- On paper, Sophia's half of her mark on her disc takes `--core` (`#5546b8`): 4:1 on `#c6bfe0`.
- entry.js sets the tab's mark always: light only for a valid light choice, the room's otherwise.

## Checks (written first)

- `conversations-column.spec.ts`: Sophia's glyph half on her disc ≥ 3:1.
- `light-mode.spec.ts`: Home's line and the personal composer's hairline ≥ 1.1:1 on paper.
- `light-mark.spec.ts`: an invalid stored value on a light system: `/favicon-dark.svg` as the body begins (before the
  app's boot) and after.

## Left

- Not run on this host: the machine guard refused Playwright (free RAM under 6 GB with AION2 open). CI is the run on
  record.
