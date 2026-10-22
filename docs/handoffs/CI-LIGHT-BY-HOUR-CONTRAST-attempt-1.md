# Handoff: her light by the hour, read at 4.5:1

Goal and attempt: CI-LIGHT-BY-HOUR-CONTRAST (the Limits and review of `docs/plans/ci-personal-fixture-clock.md`, #477:
with the fixtures at noon, the contrast checks read only the day's light, and the night field's «Still up?» was no
longer checked; Luis 2026-10-24: «Procede con tu recomendación, el lote con 1, 2 y 3»; earlier «Lo que no se mide, no se
puede mejorar»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-2`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-2`, branch `ci/night-light-contrast` from
`origin/group/follow-ups-9` `f922d1a50` (#477, open); not pushed
Writable scope: this worktree only (`apps/studio/e2e`, `docs/plans`, `docs/handoffs`); no API, no product code.
Runtime unit: Luis's Windows host (Playwright through `pw-direct.ps1`: Wow open, Aion 2 not); CI as the run on record.
Existing authority: Luis 2026-10-24, the quote above; local only, nothing pushed.
Ending commit: the branch's last commit; test last changed at `af762255d`. Against `f922d1a50`:
`apps/studio/e2e/personal-light-by-hour.spec.ts` (new), `docs/plans/ci-light-by-hour-contrast.md`, this record.

## Outcome

- **A new check reads each of her lights** (`e2e/personal-light-by-hour.spec.ts`, 17 rows): night 23:30, morning
  07:30, evening 19:30 and the day 14:00 as control, dark and paper, desktop and phone, notes closed and open: every word
  in the space at 4.5:1 with the repo's `lowContrast`, the night's «Still up?» included; on the phone, the night line
  fits its field and the field stands as high as by day.
- **No measurement fails the check.** The lowest word the helper reads is 4.70 on paper (the day dividers and the
  field's words, every hour) and 4.95 in the dark (the notes' `Oct 21`).
- **Home has no light by the hour:** only its greeting's words follow it, and noon's «Good afternoon» is the longest. No
  Home row.
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

## Decisions and changes

- **`lowContrast` unchanged.** A `wash` option laying the gradient's first stop over the space's ground (a peak bound)
  was tried and dropped: it fails texts the light never reaches at that strength (`Oct 21`, 4.13 bound, 4.95 in pixels).
- **No pixel check committed:** screenshots per text and the grain held off are heavier than `contrast.ts`; a choice
  for Luis.
- **Test only, one commit**, no failing pair: nothing measured below 4.5:1 by the helper, so no product fix. The check's
  bite is shown by the control mutants instead.

## Remaining obligations

- **Finding for Luis:** on paper, by day, the first divider at the top of a talk reads at 4.50:1 at its median, 4.47 at
  its lowest pixel, at the breath's peak (her light takes up to 0.23 from `--text-sec`'s 4.70). Fix is a choice: her
  light on paper (`.c3-ambient`) or the divider's ink (`--text-sec`). Not measured by any committed check.
- **Finding for Luis:** at 320 px the night line wraps to two lines (copy or ellipsis).
- The phone rows of the probe for the night at a talk's start were not reached (the run timed out after the evening).
- CI is the run on record.

## Next bounded action

- Luis: say whether this joins the batch after #477, and whether either finding gets a change. Pushed only on his word;
  merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository only.
