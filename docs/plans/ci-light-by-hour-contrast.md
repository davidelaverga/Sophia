# Her light by the hour, read at 4.5:1

> 2026-10-22 · From `ci-personal-fixture-clock.md` (#477), its Limits and its review: given no hour, the personal and
> Home fixtures stand at noon, so the contrast, ink and light checks read only the day's light; only `personal.spec`'s
> «moments» ask by hour, and the night field's longer «Still up? Write to Sophia…» is no longer checked for contrast or
> fit on a phone. Luis 2026-10-24: «Procede con tu recomendación, el lote con 1, 2 y 3»; earlier «Lo que no se mide, no
> se puede mejorar». Tests only; nothing the person sees changes.

## Measured

- **Her light has four bands** (`places-view.ts` `lightOf`): morning from 05:00, the day from 11:00, evening from 18:00,
  night from 22:00 to 05:00. The space carries it as `data-hour`; `personal.css` gives each its own `.c3-ambient`
  gradient (the day's from `--halo-rgb`, the other three literal colours), and at night the field asks «Still up? Write
  to Sophia…» (`PersonalComposer.tsx` `NIGHT`). Nothing else on the page changes by hour: no ink, no ground.
- **Home has no light by the hour.** Only its greeting's words follow the hour (`Places.tsx`, `greeting`); `data-hour`
  and the hour's gradients are Personal's alone. The noon words «Good afternoon» are the longest of the three, so the
  noon fixture already measures Home's widest greeting. No Home row here.
- **The contrast helper composites background colours only** (`e2e/contrast.ts`, `contrastOf`: the grounds up the
  tree). Her light is a gradient (`background-image`) in a sibling of the words (`.c3-ambient`, under `.c3-head` and
  `.c3-body`), so the helper never sees it, at any hour. What it reads by hour is what changes in colour by hour: here,
  nothing but the night placeholder's words.
- **What the light takes, from the page's pixels** (a probe, not committed: words made transparent, the breath held at
  its peak `opacity: 1`, the grain off; each text's ground read from a screenshot under its box; the median pixel, the
  lowest in brackets; scripts and output in the session's `scratchpad/light-by-hour/`). The lowest text in the space:

  | Where | Night 23:30 | Morning 07:30 | Evening 19:30 | Day 14:00 |
  | --- | --- | --- | --- | --- |
  | Helper (colours only), dark, desktop and phone | 6.72 | 6.72 | 6.72 | 6.72 |
  | Helper, dark, notes open (`Oct 21`) | 4.95 | 4.95 | 4.95 | 4.95 |
  | Helper, paper, desktop and phone | 4.70 | 4.70 | 4.70 | 4.70 |
  | Pixels, dark desktop, as loaded | 6.72 | 6.43 (6.36) | 6.54 | 6.68 |
  | Pixels, dark phone, as loaded | 6.71 | 6.20 (6.07 p10) | — | 6.65 |
  | Pixels, paper desktop, as loaded | 4.70 | 4.62 (4.60) | 4.62 (min) | 4.61 (4.59) |
  | Pixels, paper phone, as loaded | 4.64 (4.57 p10) | 4.59 (4.55 p10) | — | 4.56 (4.50 p10) |
  | Pixels, paper desktop, talk at its start | 4.57 (4.56) | 4.56 (4.55) | 4.53 (4.52) | **4.50 (4.47)** |
  | Pixels, paper phone, talk at its start | — | 4.59 (4.55) | 4.58 (4.53) | 4.54 (4.50) |
  | Pixels, dark, talk at its start (lowest) | 6.69 | 5.84 desktop, 5.93 phone | 6.27 | 6.56 |

  The lowest is always the day's divider («Yesterday · Where you began», `--text-sec`, the label size): on paper her
  light takes up to 0.23 from it, most by day, where it sits right under the head (`?all=1`, the list at its top, the
  first divider 18 px under it). By day on a desktop it reads at 4.50 at the median, 4.47 at its lowest pixel, at the
  breath's peak. The dark room keeps a wide margin (5.78 lowest). The `—` cells were not reached (the phone run of the
  talk at its start timed out after its evening rows; the evening phone row as loaded was read by lowest pixel only,
  where a wrapped divider’s hairline lies inside its box: 4.23 on paper, 5.46 dark, a probe artefact, not the ground).
- **The night placeholder fits on the phone the checks run at** (390 px: the field's room is 236 px, the words 173 px;
  360 px: 206). At 320 px (room 166) it wraps to two lines and the field grows from 40 to 60 px (`field-sizing:
  content`): nothing is cut, but the line is one line taller at night only (the day's «Write to Sophia…» stays on one).

## What changes

- **A check, `e2e/personal-light-by-hour.spec.ts`:** for night (23:30), morning (07:30), evening (19:30) and the day
  (14:00, the control), in the dark room and on paper, on a desktop and a phone, the space as loaded and with its notes
  open: every word in the space reads at 4.5:1 (`lowContrast`, as `personal.spec` measures the space), the night's
  «Still up?» included. And on the phone, the night placeholder fits its line, and the field stands as high as by day.
- `lowContrast` stays as it is. A peak bound was tried first (the gradient's first stop laid over the space's ground for
  every text under the light) and dropped: it fails texts the light never reaches at that strength (`Oct 21` in the
  notes, 4.13 by the bound, 4.95 in the pixels), so it would be a wrong check, and no threshold is lowered to pass it.

## Checks

- Control mutants, never committed (`pw-logs/nlc-control-red2.txt`): the night placeholder in `--text-4` at
  `data-hour='night'` only, and a longer night line («Still up? Write a few words to Sophia…»). The new check fails the
  four night rows, «"Still up? Write a few words to (1.99)"» dark and «(2.11)» on paper, and the fit at «Expected: <= 236
  Received: 259»; its other 12 rows pass, and so do `ink.spec`'s and `light-mode.spec`'s Personal rows, which read noon.
- Green: the new check `--repeat-each 2`, 34/34 (`nlc-green2`); with `personal-any-hour`, `ink.spec` and
  `light-mode.spec`, 69 passed, 1 skipped (`nlc-green1`); `personal.spec`, `phone-fits`, `home-any-hour`, 114/114
  (`nlc-neighbours`). Whole-repo `oxlint --type-aware`, `tsc --noEmit`, Prettier on the spec.

## Limits and findings for Luis

- **The check cannot see her light.** It holds the inks and the night's words to 4.5:1 over the space's ground at each
  hour; what the gradient takes is measured only by the probe above. A pixel check in the repo would need screenshots
  per text (and the grain held off): heavier than the rest of `contrast.ts`, so left as a choice.
- **By day on paper, the first divider at the top of a talk reads at 4.50:1 at its median, 4.47 at its lowest pixel,
  at the breath's peak** (evening 4.53, morning 4.56, night 4.57). It is the day's light, the one every check now sees
  but none composites. Not fixed here: it is a choice between her light on paper (`.c3-ambient`, Personal's) and the
  divider's ink (`--text-sec`, the kit's), not a measured slip inside the kit.
- **At 320 px the night line wraps to two** (above). Its copy, or an ellipsis, is a word for Luis.
