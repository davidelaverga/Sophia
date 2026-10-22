# Handoff: her light by the hour, read at 4.5:1

Goal and attempt: CI-LIGHT-BY-HOUR-CONTRAST (the Limits and review of `docs/plans/ci-personal-fixture-clock.md`, #477:
with the fixtures at noon, the contrast checks read only the day's light, and the night field's «Still up?» was no
longer checked; Luis 2026-10-22: «Procede con tu recomendación, el lote con 1, 2 y 3»; earlier «Lo que no se mide, no se
puede mejorar»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-2`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-2`, branch `ci/night-light-contrast` from
`origin/group/follow-ups-9` `f922d1a50` (#477, since merged to main as `a66d10381`); not pushed
Writable scope: this worktree only (`apps/studio/e2e`, `apps/studio/src/features/personal/personal.css` after Luis's
decision, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `pw-direct.ps1`: Wow open, Aion 2 not); CI as the run on record.
Existing authority: Luis 2026-10-22, the quote above, and on the findings «Atenuar su luz en papel», «Dejarlo así» and, on
the 40 % captures, «Luz al 70 %»;
local only, nothing pushed.
Ending commit: the branch's last commit; code last changed at `0e1931bc9`. Against `f922d1a50`:
`apps/studio/e2e/personal-light-by-hour.spec.ts` (new), `apps/studio/e2e/app-auth.spec.ts`,
`apps/studio/src/features/personal/personal.css`, `apps/studio/src/features/personal/usePlaceMotion.ts`,
`docs/plans/ci-light-by-hour-contrast.md`, this record.

## Outcome

- **A new check reads each of her lights** (`e2e/personal-light-by-hour.spec.ts`, 17 rows): night 23:30, morning
  07:30, evening 19:30 and the day 14:00 as control, dark and paper, desktop and phone, notes closed and open: every word
  in the space at 4.5:1 with the repo's `lowContrast`, the night's «Still up?» included; on the phone, the night line
  fits its field and the field stands as high as by day.
- **No measurement fails the check.** The lowest word the helper reads is 4.70 on paper (the day dividers and the
  field's words, every hour) and 4.95 in the dark (the notes' `Oct 21`).
- **Home has no light by the hour:** only its greeting's words follow it, and noon's «Good afternoon» is the longest. No
  Home row.
- **On paper her light is softer (Luis: «Atenuar su luz en papel», then «Luz al 70 %»).** It breathes at 0.7 of the
  room's, every hour (`--ambient-peak`); the dark room and `--text-sec` are untouched. The first day's words at a talk's
  start now read 4.53 to 4.61:1 at their darkest pixel in every band, desktop and phone (4.46 by day before), guarded
  by a pixel check in the same spec (two more rows, desktop and phone, floor 4.5). 0.4 was tried first (4.61 at the
  lowest) and declined: on its captures the light all but vanished.
- **After the independent review (no P1):** the pixel check now holds her breath at its peak through the animation
  itself (the restyled delay held 0.49 to 0.70 of a 0.7 peak, by how long the light had been on the page); her light
  arriving from Home rises into its breath instead of snapping from 1.00 to 0.52 on paper; the check asks for paper,
  for pixels read, and lets nothing fade back in. Decisions dated 2026-10-22 (they read 2026-10-24).
- **The 320 px night wrap stays** (Luis: «Dejarlo así»).
- **Said plainly: the helper cannot see her light.** It composites background colours; the hour's light is a gradient
  in a sibling of the words (`.c3-ambient`). Measured instead by a pixel probe (not committed), see Evidence.

## Evidence

- Probe, words transparent, breath at its peak, grain off, ground from a screenshot under each text
  (`scratchpad/light-by-hour/zz-pixel.spec.ts`, output `pixel2.txt`, `pixel3.txt`): median ratio, lowest pixel in
  brackets. Lowest text in the space, always the day divider on paper:

  | Paper | Night | Morning | Evening | Day |
  | --- | --- | --- | --- | --- |
  | desktop, as loaded | 4.70 | 4.62 (4.60) | 4.62 | 4.61 (4.59) |
  | desktop, talk at its start | 4.57 (4.56) | 4.56 (4.55) | 4.53 (4.52) | 4.50 (4.47) |
  | phone, talk at its start | — | 4.59 (4.55) | 4.58 (4.53) | 4.54 (4.50) |

  Dark: 5.78 at the lowest (morning, the first divider at the top of a talk). Full table in the plan note.
- Fit (`scratchpad/light-by-hour/fit.txt`, `fit-320.png`): night words 173 px; room 236 at 390 px, 206 at 360, 166 at
  320, where the line wraps to two and the field grows 40 → 60 px, nothing cut.
- Red, control mutants never committed (`pw-logs/nlc-control-red2.txt`): night-only `--text-4` placeholder and a longer
  night line: the four night rows fail («"Still up? Write a few words to (1.99)"» dark, «(2.11)» paper) and the fit
  («Expected: <= 236 Received: 259»); the 12 other rows and `ink.spec`'s and `light-mode.spec`'s Personal rows pass.
- Green: new check `--repeat-each 2` 34/34 (`nlc-green2`); with `personal-any-hour`, `ink`, `light-mode` 69 passed, 1
  skipped (`nlc-green1`); `personal.spec`, `phone-fits`, `home-any-hour` 114/114 (`nlc-neighbours`). Whole-repo
  `oxlint --type-aware` (exit 0), `tsc --noEmit -p apps/studio` (exit 0), Prettier on the spec. No unit file touched.

- Paper light at the breath's true peak (after the review), light at 1 → 0.7 (kept), the pixel check's darkest pixel.
  Desktop: night 4.54 → 4.59, morning 4.53 → 4.57, evening 4.52 → 4.56, day 4.46 → 4.53. Phone: night 4.57 → 4.61,
  morning 4.54 → 4.57, evening 4.53 → 4.57, day 4.48 → 4.54. Dark, the same at both: desktop 6.68, 5.78, 6.22, 6.56;
  phone 6.69, 5.89, 6.27, 6.58 (`pw-logs/nlc-r2-measure1`, `nlc-r2-measure07`). 0.4, read with the first hold: 4.61 to
  4.65 (`nlc-paper-after04`). The first hold read up to 0.02 high (`nlc-paper-before`, `nlc-paper-after07`).
- Hold, old against new (`scratchpad/light-by-hour/hold-0.7.txt`, five loads at each of 0, 150, 300, 333, 500, 700, 1000
  and 1500 ms): restyled delay 0.49 to 0.70; paused through the animation, 0.7 every time.
- After the review: pixel check at 0.7 10/10, at a temporary peak of 1 red 10/10 («"day (4.46)"», «"day (4.48)"»;
  `nlc-r2-a`, `nlc-r2-peak1-red`); the arrival check red 5/5 at `1f7e6d653` («Received: 0.482345», the frames
  «… 1.00 1.00 0.52 …»), green 5/5 at `0e1931bc9` (`nlc-r2-arrive-green`; its frames 0 → 0.52, then the breath); this
  spec, `ink`, `light-mode`, `personal`, `phone-fits`, `app-auth` 229 passed, 1 skipped (`nlc-r2-green`); whole-repo
  `oxlint` (exit 0), `tsc`, Prettier.
- Red at `4ded49c4e` (light at 1): «"day (4.47)"» desktop, «"day (4.50)"» phone (`nlc-paper-red`). Green at
  `00e7d0e5e` (0.7), through the guard: the pixel check `--repeat-each 5` 10/10 (`nlc-paper70-x5`); this spec, `ink`,
  `light-mode`, `personal`, `phone-fits` 174 passed, 1 skipped (`nlc-after70-green`); `glow`, `css-motion` 8/8;
  `oxlint`, `tsc`, Prettier. (At 0.4, `b1cf2c144`: the same, `nlc-paper-x5`, `nlc-after-green`.)
- Captures (scratchpad `light-by-hour/`): `before-paper-<hour>-desktop.png` (light at 1),
  `after40-paper-<hour>-desktop.png` (0.4, declined), `after-paper-<hour>-desktop.png` (0.7, kept), for day, evening,
  morning and night.

## Decisions and changes

- **`lowContrast` unchanged.** A `wash` option laying the gradient's first stop over the space's ground (a peak bound)
  was tried and dropped: it fails texts the light never reaches at that strength (`Oct 21`, 4.13 bound, 4.95 in pixels).
- **One pixel check, for the one place it was lowest** (the first day's words at a talk's start, on paper), after
  Luis's decision; not a general pixel scan. It pauses the breath halfway through its own keyframes and checks the
  light stands at `--ambient-peak`, and reads line by line so a wrapped divider's hairlines stay out.
- **Her arrival from Home ends on the breath:** one keyframe at offset 0 and no end of its own, so the animation ends on
  whatever the breath underneath is, dark or paper.
- **One knob, `--ambient-peak`:** the light's opacity and its breath's keyframes read it, 1 when unset; 0.7 on paper
  (Luis), after 0.4, which kept every band at 4.6 or more but all but hid the light.
- **The hour rows: test only, one commit**, no failing pair (nothing below 4.5:1 by the helper); their bite is shown by
  the control mutants. **The paper light: test first**, `4ded49c4e`, then `b1cf2c144` (0.4) and `00e7d0e5e`
  (0.7); the hold `1fbcbc2c7`; the arrival `1f7e6d653` then `0e1931bc9`.

## Remaining obligations

- The scan rows still cannot see her light; the pixel check covers only the first day's words at a talk's start.
- The probe's phone rows for the night at a talk's start were not reached (the pixel check now reads that row: 4.61).
- CI is the run on record.

## Next bounded action

- Luis: say whether this joins the next batch (#477 is merged), now with the softer paper light. Pushed only on his word;
  merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository only.
