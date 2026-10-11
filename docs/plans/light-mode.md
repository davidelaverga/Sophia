# A light page, on the report's paper

> 2026-10-11 · Luis: «sigue con §2.5 modo claro». Informe-30 §2.5: «El reporte HTML de demo ya define un papel coherente
> con la marca (`--paper #fbf8f3`, `--ink #1d1b22`, `--soft #5d5966`, `--line #e4dfd6`, `--accent #6d5bd0`, `--warm
> #c8794a`). Usar eso como tema claro … la luz de Sophia pasa a halo violeta sobre papel; la gente sigue cálida; el
> grano desaparece. Tokens a duplicar: 14; los acentos se oscurecen un paso para contraste». No API change.

## What was measured

- The Studio was dark only (`color-scheme: dark`, «The Studio is dark-only» in `theme.css`): 22 colour tokens and,
  beside them, **264 alphas written by hand** over the room's inks (`rgba(236, 235, 241, …)` 67 times, the halo 64,
  the warm 35, the halo's text 27, the amber 24, the teal 14, the rose 11, the void 10, white 10), the grain
  (`body::after`), and Sophia's light as a WebGL canvas blended with `screen` (which adds light: on paper it would
  vanish).
- A light theme by tokens alone would have left every one of those alphas dark-on-dark.

## What changes

- **The inks as channels** (`--ink-rgb`, `--void-rgb`, `--sheen-rgb`, `--halo-rgb`, `--halo-text-rgb`, `--core-rgb`,
  `--warm-rgb`, `--teal-rgb`, `--amber-rgb`, `--rose-rgb`): the 264 alphas become `rgb(var(--x-rgb) / a)`, the same
  colours in the dark room, one swap for a light page.
- **`:root[data-theme='light']`** (theme.css, by the tokens): the void is the paper (`#fbf8f3`), the plane `#f4f0ea`,
  the raised plane white, the ink `#1d1b22` and its steps at 0.74 · 0.64 · 0.34 (4.5:1 or more on paper, on white and
  on the plane: the third ink reads at 4.95), the lines at 0.1 · 0.16 · 0.24, the lift a white sheen; the accents a
  step darker for contrast on paper: halo `#6d5bd0` (4.9:1), its text `#5546b8` (6.7), the core `#2f2566` (12.6: the
  primary press and Sophia's mark), the warm `#965328` (5.6), the teal `#0f6b5b` (6.1), the amber `#8f5717` (5.6), the
  rose `#a8375a` (5.9). The grain goes; Sophia's canvas is hidden and her light is a violet halo on paper.
- **The choice** (`app/theme.ts`): dark, light, or the system's, kept on this browser (`sophia.theme`), shown as
  `data-theme="light"` on the root before the first paint (`bootTheme` in `main.tsx` and in each fixture page, which
  may ask for one in its address: `theme=light`); «system» follows the system's changes. The account menu offers the
  three (`Appearance`: radio items after «How privacy works»).
- `e2e/light-mode.spec.ts`: on eight fixture pages in light (sign-in, home, personal, the room, Conversations, Tasks,
  Knowledge, Resources): the root carries the theme, the body is paper, the grain is gone, no visible box keeps one of
  the dark room's planes, and every word reads at 4.5:1 or more (`lowContrast`, the repo's own measure); and the menu's
  choice is shown, kept and followed.
- The states the at-rest scan does not see carry their own tokens with a paper value (Codex on #234): `--core-hover`
  (a primary press hovered: white in the room, the deepest violet on paper), `--on-core` and `--on-warm` (the ink on
  those planes), `--warm-hover`, `--soon` (a note within the hour: the dark room's `#e8c48d`, the amber on paper),
  `--claude-ink`. `light-mode.spec.ts` measures the three Codex named at 4.5:1 or more.
- The choice is on the root before the first paint: `public/entry.js` (head-loaded, the CSP's own script) reads
  `sophia.theme` and sets `data-theme`; `entry.css` paints paper and the opening's ground with it. The spec opens the
  shell with the choice kept and finds the root light.

## States

- Dark (the room, as before: the channel swap computes the same colours), light (the paper), system (either, following
  the system). A press, a chip, a card, a menu keep their states in both: the alphas are the ink's.
- A report's page (`.md`) keeps its own typography; its colours are the tokens' and follow.
- Sophia's light: the canvas in the dark room, a halo on paper. The threshold mark's fills follow the tokens.

## Checks (written first)

- The spec's measure before the change: no `data-theme`, the body `rgb(5, 4, 8)`; a light page could not be asked for.
  With the change, measured in the page on the eight pages: paper, no grain, no dark plane left, no word under 4.5:1.
- Mutant, with the control passing: a light page with `--text-3` set back to 0.52, the measure names the third ink's
  words (3.5:1); the channels' swap removed from the light block, the measure names the hover planes and the lines.
- `pnpm check` clean.

## Left

- The report's own HTML page (`report-page.spec.ts`) already has a light and a dark scheme of its own; this does not
  touch it.
- The shadows (24 declarations, black at 0.3 to 0.6) read `--shadow-rgb` and `--shadow-k`: black at full in the
  room, the ink at a third of the strength on paper (a menu's 0.55 reads 0.19). `light-mode.spec.ts` reads the
  account menu's shadow in light.
- Informe-30 §2 is in with this: the kit (§2.1), the type scale (§2.2), the answers (§2.3), the widths (§2.4), the
  light page (§2.5).
