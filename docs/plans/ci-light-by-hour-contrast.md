# Her light by the hour, read at 4.5:1

> 2026-10-22 · From `ci-personal-fixture-clock.md` (#477), its Limits and its review: given no hour, the personal and
> Home fixtures stand at noon, so the contrast, ink and light checks read only the day's light; only `personal.spec`'s
> «moments» ask by hour, and the night field's longer «Still up? Write to Sophia…» is no longer checked for contrast or
> fit on a phone. Luis 2026-10-22: «Procede con tu recomendación, el lote con 1, 2 y 3»; earlier «Lo que no se mide, no
> se puede mejorar». Then, on the findings below, Luis 2026-10-22: «Atenuar su luz en papel» and, for the night line at
> 320 px, «Dejarlo así»; on the 40 % captures, «Luz al 70 %». One change the person sees: her light on paper is softer.

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
- After the review: the pixel check at 0.7, 10/10, and at a temporary peak of 1, red 10/10, «"day (4.46)"» desktop and
  «"day (4.48)"» phone (`nlc-r2-a`, `nlc-r2-peak1-red`); the arrival check red 5/5 then green 5/5 (`nlc-r2-a`,
  `nlc-r2-arrive-green`); this spec, `ink`, `light-mode`, `personal`, `phone-fits`, `app-auth`, 229 passed, 1 skipped
  (`nlc-r2-green`); whole-repo `oxlint`, `tsc`, Prettier.
- The paper light, test first: the pixel check (`4ded49c4e`), red «"day (4.47)"» desktop and «"day (4.50)"» phone
  (`pw-logs/nlc-paper-red.txt`); at 0.7 (`00e7d0e5e`): the pixel check `--repeat-each 5`, 10/10 (`nlc-paper70-x5`);
  this spec, `ink`, `light-mode`, `personal`, `phone-fits`, 174 passed, 1 skipped (`nlc-after70-green`), through the
  guard. Before that, at 0.4 (`b1cf2c144`): the pixel check `--repeat-each 5`, 10/10
  (`nlc-paper-x5`); this spec, `ink`, `light-mode`, `personal`, `phone-fits`, 174 passed, 1 skipped
  (`nlc-after-green`); `glow`, `room-literals`, `launch`, `css-motion` unit files, 19/19; `oxlint`, `tsc`, Prettier on
  the sheet and the spec.

## Luis's decisions (2026-10-22)

- **«Atenuar su luz en papel», then «Luz al 70 %».** On paper her light breathes at 0.7 of the room's, every hour
  (`personal.css`: `--ambient-peak` on `.c3-ambient` under `:root[data-theme='light']`, read by its opacity and its
  breath's keyframes; unset, it is 1, so the dark room's light is as it was). `--text-sec` is untouched. 0.4 came first
  (`b1cf2c144`), the step that held every band at 4.6 or more; on its captures the light all but vanished, and Luis chose
  70 % (`00e7d0e5e`), the day divider at about 4.54:1 (4.53 on a desktop, read again at the true peak, below): above
  the 4.5 floor, without the 4.6 margin.
- **Guarded by a pixel check** (`personal-light-by-hour.spec.ts`, «on paper, at a talk's start…», desktop and phone):
  the probe made light. For each of the four hours on paper, the talk at its start (`?all=1`, the list at its top, not
  `scrolled`), the first day's words made transparent (no transition to fade them back), her breath paused through its
  animation halfway through its own keyframes and checked to stand at `--ambient-peak` (1 unset), the grain off; paper
  checked applied; a screenshot, and under each line of the words
  (`Range.getClientRects`, so a wrapped divider's hairlines are not inside) the darkest pixel against the words' ink, by
  `contrastOf`, with at least one pixel read. Floor 4.5:1. About 3 s a row.
- **After the independent review (no P1):** the first version held the breath by restyling its duration and delay,
  which keeps the animation's start time, so the phase held depended on how long the light had been on the page:
  over five loads at each of eight waits it held 0.49 to 0.70 of a 0.7 peak (`scratchpad/light-by-hour/hold-0.7.txt`),
  and at the trough a light back at full strength could pass. Now held by the animation itself: 0.7 at every wait
  (`1fbcbc2c7`). The numbers below are read again that way; the first table read up to 0.02 high.
- **Before and after** (the check's own reading, the darkest pixel, the breath at its true peak; values printed by a
  temporary edit of its floor, never committed; 0.4 as first read, with the old hold):

  | Paper, talk at its start | Night | Morning | Evening | Day |
  | --- | --- | --- | --- | --- |
  | desktop, light at 1 (before) | 4.54 | 4.53 | 4.52 | **4.46** |
  | desktop, at 0.4 (declined) | 4.64 | 4.63 | 4.62 | 4.61 |
  | desktop, at 0.7 (kept) | 4.59 | 4.57 | 4.56 | 4.53 |
  | phone, light at 1 (before) | 4.57 | 4.54 | 4.53 | **4.48** |
  | phone, at 0.4 (declined) | 4.65 | 4.63 | 4.63 | 4.61 |
  | phone, at 0.7 (kept) | 4.61 | 4.57 | 4.57 | 4.54 |
  | dark desktop, every step | 6.68 | 5.78 | 6.22 | 6.56 |
  | dark phone, every step | 6.69 | 5.89 | 6.27 | 6.58 |

  With no light at all the divider reads 4.70: at 0.7 her light takes 0.09 to 0.17 from it, where it took 0.13 to 0.24.
- Captures, paper, desktop, the talk at its start, the breath held at its peak (session scratchpad `light-by-hour/`):
  `before-paper-<hour>-desktop.png` (light at 1), `after40-paper-<hour>-desktop.png` (0.4, declined) and
  `after-paper-<hour>-desktop.png` (0.7, kept), for day, evening, morning and night. At 0.7 her light is a visible
  violet wash under the head, a little quieter than before.
- **Her light arriving from Home** (review P3): it rose to full strength, then dropped to its breath as the motion was
  dropped: on paper from 1.00 to 0.52 in one frame. It now rises from nothing into the breath as it is (an implicit end
  keyframe in `usePlaceMotion.ts`): 0 to 0.52, then the breath. Guarded in `app-auth.spec.ts` (paper, Enter from Home,
  her light's opacity at every frame, no drop over 0.15); red first 5 of 5, «Received: 0.482345» (`1f7e6d653`), then
  `0e1931bc9`.
- **«Dejarlo así».** At 320 px the night line wraps to two and the field grows one line, at night only: kept as it is.

## Limits

- **The scan rows cannot see her light.** `lowContrast` holds the inks and the night's words to 4.5:1 over the space's
  ground at each hour; the gradient is measured by the pixel check alone, and only for the first day's words at a
  talk's start on paper, the place it was lowest. Elsewhere it rests on the probe above.
- The pixel check reads the breath held at its peak, not a frame of the running breath; it measures a screenshot, so it
  needs the fixture's fonts loaded and nothing arriving (it waits for both).
