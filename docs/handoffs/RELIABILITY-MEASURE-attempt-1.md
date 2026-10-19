# Implementation-session handoff

Goal and attempt: RELIABILITY-MEASURE (the reliability baseline's §4 «Métricas a adoptar» and its proposed script,
`evaluacion-2026-10-19/fiabilidad/linea-base.md`), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-1`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-1`, branch `reliability/measure` from the local
`group/follow-ups-5` (`56c61c61e`, stacked on #468; not pushed)
Writable scope: this worktree only (`scripts/`, `tests/unit/`, `apps/studio/e2e/reliability/`, the Playwright configs,
`docs/plans`, `docs/handoffs`); no Studio or API code.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` and `.claude-guards/safe-run.ps1`, two
workers); `gh` against `davidelaverga/Sophia`.
Existing authority: Luis 2026-10-19, «quisiera trabajar en la fiabilidad y resiliencia. Ahí tendríamos que también
medir. Lo que no se mide, no se puede mejorar» and «Procede con el script de medición y el lote R1».
Ending commit: the branch's last commit; code last changed at `2991b58ca`. Against `56c61c61e`: `.gitignore`,
`scripts/reliability-report.mjs`, `scripts/lib/reliability.mjs`, `tests/unit/reliability-report.test.mjs`,
`apps/studio/e2e/reliability/{measure,setup}.ts` and `{writes,reads,transient}.spec.ts`,
`apps/studio/playwright.reliability.config.ts`, `apps/studio/playwright.config.ts` (one `testIgnore`),
`apps/studio/tsconfig.json` (the new config), `docs/plans/reliability-measure.md`, this record.

## Outcome

- `node scripts/reliability-report.mjs --ci [--since <ISO>]` reads a window of GitHub Actions through `gh` and writes
  `reliability.json` and a short table: M10 flakes per job (a commit whose same job failed and passed; failed room
  jobs with one failing test, from the Playwright summary), M11 the room job's p50/p90 per day and part (`whole`,
  `1/2`, `2/2`, `n/3`) with its margin to the limit read from `ci.yml`, M12 main's green share and red hours.
- `--fixture` collects what the `@reliability` suite wrote: M1 (a keyed write's answer under held replies), M2
  (unknown outcomes resolved by resending under the key), M6 (failed reads per view: visible or silent), M7 (502/503
  HTML pages cured without a press, on the Studio app). M3/M4 (and M5, M8, M9) are listed as not measurable yet.
- The suite is out of the room job and the normal local run: `playwright.config.ts` ignores `e2e/reliability/`; only
  `playwright.reliability.config.ts` runs it.
- The baseline is saved in `evaluacion-2026-10-19/fiabilidad/medicion-antes.md` (+ `medicion-antes.json`), with the
  exact commands to take the «after».

## Evidence

- Plan: `docs/plans/reliability-measure.md` (`65a804f45`, as built in `30d7d7b76`).
- **Written first** (`751ea1895`): 15 unit checks of the arithmetic against a stub module; 0 passed, each failing on
  «Error: scripts/lib/reliability.mjs: not written yet». Implemented in `c9ed374bf`: 15/15.
- **Found while measuring, written first each time:**
  - `9b8131fa0`: a room job that only gathers its three parts (`echo "The room's three parts"`) counted as a room run;
    red on «Expected values to be strictly equal: actual: false, expected: true» (`isRoomGate(gate)`). Fixed in
    `2e9cee8c4`: on a 6-hour window the room's failures went 11 → 1, flakes 2 → 0, and the `whole` median 0.1 min →
    no row.
  - `c5b7446e9`: a job cancelled in the queue (no steps) read as a timeout once its clock passed the limit; red on
    «actual: 'timeout', expected: 'superseded'». Fixed in `2991b58ca`: the media bridge's 283 «timeouts» in the week
    went to 0 (superseded), the room's 10 stayed.
- **Kept out of the room job:** before the `testIgnore`, `playwright test --list` held the 5 new tests (2,288 in all);
  after, 2,283 and none of them; `-c playwright.reliability.config.ts --list` lists only its own.
- **Through the guard:** the whole suite at `a68057204` (`pw-logs/rel-before-fixture.txt`): 25/25 scenarios ran in
  3.2 min. Neighbours with the normal config (`pw-logs/rel-neighbours.txt`): `project-conversation-writes` and
  `room-discussion`, 40/40.
- Unit: `node --test tests/unit/reliability-report.test.mjs` 17/17. Whole-repo `oxlint --type-aware`, `tsc --noEmit
  -p apps/studio`, Prettier on every touched file (the `scripts/**/*.mjs` and `tests/` files with the repository's
  settings, though `.prettierignore` leaves them out): clean.
- **The baseline numbers** (`medicion-antes.md`): CI over 2026-10-12 → 10-19 17:33 UTC, 2,442 runs: room flake 2.9 %
  (21/726), 98 of 146 room failures on one test, room failure share 18.9 %, room p90 46.0 → 82.8 min from 10-12 to
  10-18 (margin 44.0 → 7.2 min), 10 timeouts, main green 71.3 % (159/223), main red 46.8 h in 20 spans. Fixture:
  M1 15/15 definitive, the Studio's overhead p50 16 ms / p95 50 ms; M2 5/5 resolved, none written twice; M6 4 visible,
  12 silent, 2 not reached; M7 3 of 6 cured alone.

## Decisions and changes

- **M6 fails only the part's own reads**, not the whole outage: with the whole outage the feed's «Reconnecting» would
  stand for every view. Each scenario first loads a control, so lines a part always says («…why it couldn’t», a Try
  again that is always there) are not taken for a failure; the first run without controls had 3 such false «visible».
- **M7 runs on `app.html`**, not a fixture page: the fixture pages build `new QueryClient()`, whose default retries
  every failure 3 times whatever `retry` says, so only the app has the `retryRead` gap 2 is about (the baseline's §1.1
  states `retryRead` as the default everywhere; it is the app's only).
- **M10's flake is rerun-confirmed**; the single-test count beside it is the unconfirmed half. Timeouts are not flakes.
- **M12 reads only the `ci` workflow**; a commit's state is its latest attempt; red time runs from a red commit's end
  until a newer commit (or a rerun) ends green.
- `gh` is asked four at a time, again after a 5xx (2, 4, 8 s) and after a minute on a rate limit: the first weekly
  report hit both (one HTTP 502 among ~2,500 requests; GitHub's limit after 1,600 at eight at a time).
- The script and its lib are `.mjs`, as asked; `scripts/**/*.mjs` and `tests/` sit outside the lint and Prettier
  gates by the repository's rule, so they were formatted by hand with its settings and kept to small functions.

## Remaining obligations

- M3/M4 wait for `reliability/feed-reconnect`'s stream levers; M5 (re-join), M8 (expired token) and M9 (version
  probe) have no scenario yet.
- ContinuityChoice is not reachable in any fixture (note policy fixed at `capture: 'off'`): a fixture parameter would
  let M6 reach it.
- The baseline proposes publishing `reliability.json` as a CI artifact for a time series: not done (it would add a
  job; the room job's length is the bottleneck).

## Next bounded action

- After R1 merges locally: run the suite through the guard on the R1 head and `--fixture`, and `--ci` on a window of
  the same length after R1; put the tables beside `medicion-antes.md` as `medicion-despues.md`.
- Luis: say when to push (with the next group PR); merge on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository, the baseline and GitHub
  Actions' run data.

## After R1 (the coordinator's request: the «after», and M3/M4)

- **M3/M4 added on this branch**, test first: `57413e9bb` (the report's feed summary, red on «actual: {}» against the
  stub), `47380b9af` (`summarizeFeed`, `e2e/reliability/feed.spec.ts`, the report's rows; 18/18 units). Levers are
  pulled by name, so the spec compiles and runs on a page without them and records «not run»
  (`pw-logs/rel-feed-before.txt`: 4/4 ran, every case `lever: false`).
- **Runs** through the guard, each on a local throwaway branch in this worktree (no other worktree touched):
  `reliability/measure-on-r1` = `group/reliability-r1` + this branch (`pw-logs/rel-after-fixture.txt`, 29/29), and
  `reliability/measure-on-levers` = this branch + `4c7462a21` (the feed's levers, no fix) for the feed's «before»
  (`pw-logs/rel-feed-levers-before.txt`, 4/4). On `group/follow-ups-5` itself the feed scenarios can't run: it has no
  lever to end the stream.
- **Before → after:** back online 6,927 → 24 ms; stream ended 1,055 → 873 ms; silenced 25.9 → 26.2 s; gap 54 → 48 ms;
  M7 3/6 → 5/6 (Knowledge's reports now retried; Updates' «since» keeps `retry: false`); M6 4 → 5 visible (the goal
  sheet's owner and date; the rest judged decorative by `silent-reads`, the archived line left to the archive branch);
  M1 and M2 unchanged. Write-up: `evaluacion-2026-10-19/fiabilidad/medicion-despues.md` (+ JSON).

## Honest when partial (Codex's two P2s on #470)

Branch `reliability/measure-honest` from `origin/group/reliability-r1` (`0b2202a38`); not pushed. Both findings held
when checked against the code before any change.

- **A failed suite published a whole report** (`measureFixture`, «The suite exited N; collecting what it wrote», exit
  0). Also true without `--run`: the script never knew how many scenarios the suite has. Plan `9b37306a9`.
  - Written first `84fbc7a14`: the script on a fake suite (2 M7 scenarios, 1 M2; `RELIABILITY_SUITE` and
    `RELIABILITY_RESULTS` added so the test never runs the real suite); red on «AssertionError: the script exits
    non-zero · actual: 0».
  - Fixed `103c5adcc`: each metric's scenarios are counted from `playwright test … --list` against the records that
    came back. A failed suite marks every metric incomplete; a short collected run, only the metrics it is short of.
    Incomplete metrics give «n of N scenarios wrote results» and no summary; the script still writes the file and
    exits 1. On this worktree's last results (a feed-only run): M3/M4 published, M1/M2/M6/M7 «0 of 2/3/18/2», exit 1.
- **M12 had no state at the window's start** (`listRuns` lists runs *created* from `--since`).
  - Written first `35e226bff`: fixed runs, main red at −2 h, green at 5 h of a 10-hour window; red on «red hours from
    the window’s start: 7» (expected 5).
  - Fixed `bb2a1cb72`: `--ci` also reads main's 20 newest `ci` push runs created before `--since` (`--created
    "<since"`); `mainHealth(runs, now, since)` walks them for the opening state, counts only the window's red time and
    commits, and `redSince` keeps its true start. On GitHub: `--since 2026-10-18T01:00:00Z` now opens with 1.34 red
    hours (b328ce9 failed at 00:46), counted as 0 before; from 00:00 the run created 23:46 and ended 00:46 opens a
    1.57-hour span.
- **The room tests that failed most were ranked by `file:line`** (the coordinator's request, from a week's report:
  `press-answers.spec.ts:128` «×32» was 13 pages under one line, mostly already fixed).
  - Written first `98dc85fbd`: fixed failures (one file and line, two titles; week-old and recent dates) against a
    stub; red on «Expected values to be strictly deep-equal: + actual - expected · + []».
  - Fixed `c9a9a778e`: `rankFailedTests` counts each failed test by its full title, with its last failure and its
    failures in the last 48 h, recent first; the report's table replaces the «specs that failed most» line.
  - `--ci` on the week 2026-10-12 21:55 → 10-19 21:55 UTC (1,471 runs; 81 failed room jobs with a summary). Top 5
    (in the last 48 h / in all / last failed): `home-needs-refusal.spec.ts:111` «needs · semantic: its own read
    refused (401, malformed body)…» 4/4, 10-19 16:53; `personal-day-pill.spec.ts:16` «the day pill steps aside…» 2/6,
    10-17 23:46; `personal-day-pill.spec.ts:32` «the pill stepped aside leaves the accessibility tree…» 2/6, 10-17
    23:46; `personal-day-pill.spec.ts:78` «the days’ menu closed with Escape…» 2/5, 10-17 23:46;
    `mentions.spec.ts:577` «closing the chat cancels a pending retry of a failed seen write» 2/2, 10-19 09:36.
    press-answers, resources and home-phone-needs are out of the top 10. Same window: room flake 3.2 % (17/536), 57
    of 81 failures on one test, main green 80.7 % (146/181), main red 41.5 h in 17 spans.
- Checks: `node --test tests/unit/reliability-report.test.mjs` 21/21; whole-repo `oxlint --type-aware` clean; `tsc
  --noEmit -p apps/studio` clean; Prettier (repository settings, `--ignore-path ""`) on the three touched `.mjs`
  files clean. No E2E: no spec or Studio code changed.
- **Decided:** per metric rather than the whole section (the finding allows either), so a deliberate one-spec run
  (`feed.spec.ts` for M3/M4) still publishes what it measured; it exits 1 all the same. Limit kept in the plan: runs
  before the window are read by their latest attempt only.
- **Next:** Luis decides when this joins #470 (push with the group); the coordinator answers the two Codex threads and uses the new top 5.
