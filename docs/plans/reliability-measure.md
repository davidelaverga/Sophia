# Reliability, measured: one script, a before and an after

> 2026-10-19 · source: the reliability baseline (`evaluacion-2026-10-19/fiabilidad/linea-base.md`, §4 «Métricas a
> adoptar» and its proposed script) · Luis 2026-10-19: «quisiera trabajar en la fiabilidad y resiliencia. Ahí
> tendríamos que también medir. Lo que no se mide, no se puede mejorar» and «Procede con el script de medición y el
> lote R1». Tooling and a measuring suite only: nothing the person sees changes.

## What it is for

Every R1 change (5xx retried, silent reads, feed reconnect, write timeouts) needs a number before and after. The
baseline measured CI by hand with `gh` and proposed the fixture metrics without running them. This branch makes both
a command anyone can repeat, on the same definitions, so the after is comparable with the before.

## The command

`node scripts/reliability-report.mjs <mode> [--out <dir>]`, from the repository root, Node only, no new dependency
(`yaml` is already the root's). Each mode writes its section of `<dir>/reliability.json` (default
`reliability-report/`, ignored by git) and keeps the other mode's; `<dir>/reliability.md` is the short table, printed
too.

- `--ci [--since <ISO>] [--repo <owner/name>]`: reads GitHub Actions through `gh run list` and `gh run view --json
  jobs` (every attempt, `--attempt n`) on `davidelaverga/Sophia`, from `--since` (default: 7 days back) to now. Each
  completed run's jobs are kept in `.reliability-cache/` (ignored), so a second run asks only for new runs. Failed
  room jobs also read their Playwright run summary (the `github` reporter's notice, through `gh api …/annotations`).
- `--fixture [--run]`: collects what the `@reliability` Playwright suite wrote. Without `--run` it prints the exact
  command to run the suite first; with `--run` it runs it (`playwright test -c playwright.reliability.config.ts
  --workers=2`). On Luis's machine the suite runs through the machine guard instead (the handoff has the `pw.ps1`
  line); the script then only collects.

## The metrics (baseline §4)

**From CI** (`--ci`):

- **M10 · flake rate per job.** A *flake* is a commit (head SHA) whose same job both failed and passed: a rerun of a
  failed job that passes, or the push run and the PR run of one commit that disagree. Rate = flaky (SHA, job) pairs /
  decided pairs (at least one success or failure). Timeouts are not flakes (they are the suite's length, M11).
  Per job family: the room's shards (`… (1/2)`, `… (2/2)` since #468, `…, part n of 3` on some branches) are one
  family, each shard judged on its own. Also per job: success, failure, timeout and superseded counts, the failure
  share of the decided ones (as the baseline's table), and for failed room jobs the number of failed tests from the
  Playwright summary: a job that failed on one test of ~2,000 is the flake signature; the tests that failed most are
  listed, each by its full title (see «Honest when partial»).
- **M11 · room job duration.** Median, p90 and maximum of the successful room jobs per day and per part (`whole` or
  the shard), with the margin of p90 to the job's `timeout-minutes`, read from `.github/workflows/ci.yml` (the job
  whose name, without its `${{ … }}`, starts with «The room in Chromium»; GitHub's 360 if it has none). Timeouts per
  day are counted beside it.
- **M12 · main green.** Of the `ci` runs on `main` (push), the share of commits whose latest attempt is green, and the
  hours main stayed red: main is red from the moment a red commit's run ends until a newer commit's run (or a rerun
  of that commit) ends green. A newer commit that is already green is not turned red by an older one ending later. A
  window that ends red counts until now, and says since when. Only the `ci` workflow: `paperclip-image` runs on some
  paths only.

**How a job's end is read.** GitHub marks a job that reached its `timeout-minutes` as *cancelled*, like a run
superseded by a newer push. The script calls a cancelled job that ran for at least its limit a **timeout**, and only a
shorter one **superseded**. Without this the baseline found 9 timeouts hidden among 90 «cancelled» runs. A rerun of
failed jobs lists the carried-over ones again under new ids with the same times: each job is counted once (same
name, start and end).

**From the fixture** (`--fixture`, the suite `apps/studio/e2e/reliability/*.spec.ts`, every test tagged
`@reliability`): measured in the page with `performance.now()`, written by each spec as JSON samples into
`apps/studio/reliability-results/` (and attached to the test). The specs **measure and report**: they assert only
that their scenario ran, never today's numbers.

- **M1 · a keyed write's answer.** Time from the press to a definitive answer on screen while the reply is held and
  let through `D` ms later (`D` = 0, 250, 1,000, 2,500): the room's chat (`holdMessages`/`releaseMessages`) and a
  project conversation's message (`send=slow`, 1.5 s). p50/p95 of the total, p50/p95 of the overhead past `D`, the
  share within 5 s.
- **M2 · unknown outcomes resolved.** A keyed write whose reply is lost (`loseNextContributionReply`, `send=lost`,
  `start=lost`) says it isn't confirmed; sent again under its key, does it resolve, and is it written once? Share
  resolved, any written twice, and the time from the second press to the answer.
- **M6 · failed reads that show versus fall silent.** A sweep (`reads.spec.ts`): the 7 views and the baseline's 11
  silent reads, each opened with its own reads failing as the fixture's outage fails them (a fetch that rejects),
  **narrowed to those reads**, so the snapshot and the feed keep working and only what the part reads fails (with the
  whole outage the feed's «Reconnecting» would stand for every view). Once the page's retries are over (5 s with no
  new failure), the part either shows the failure, an alert or a «couldn’t / can’t be read / didn’t load / Try again»
  line **that the same part didn't show with nothing failing** (each scenario first loads a control), or falls
  silent. A part whose read never went out is «not reached», not counted. ContinuityChoice is not reached: no fixture
  sets a note policy that asks for consent.
- **M7 · transient errors cured alone.** A read answered 502 or 503 with an HTML body (a proxy's page, not the API's
  contract) once (502) or twice (503), then 200: does the view come back without a press, and how long after the
  first error? Three reads (the conversations list, Knowledge's reports, Updates' «since you last looked»), **on the
  Studio app itself** (`app.html`, `work=lost`): the fixture pages build a plain `new QueryClient()`, which retries
  every failure three times whatever its `retry` says, so only the app has the real `retryRead` (`account-cache.ts`)
  that gap 2 is about. A control load first proves each view shows what the check looks for.
- **M3/M4 (feed recovery, gaps)** use the stream levers `reliability/feed-reconnect` adds (`dropStream`,
  `stallStream`, `gap`), in `feed.spec.ts`: from the lever to the header's «Up to date» through «Reconnecting» (M3:
  the stream ended ×3, silenced ×1) or «Catching up» (M4: a skipped sequence ×3), and from the network back to «Up to
  date» after the feed's third refused ask. On a page without the levers each scenario is recorded as not run, and
  M3/M4 stay listed as not measurable. M5, M8 and M9 wait for their levers.

## Kept out of the room job

The suite lives in `e2e/reliability/`, which `playwright.config.ts` ignores (`testIgnore`), so neither CI's room job
(`playwright test --shard`) nor the normal local run picks it up. Only `playwright.reliability.config.ts`, which the
script uses, runs it: the same two fixture servers, one desktop project, `grep: /@reliability/`.

## How to run it again, and read it

- **CI:** `node scripts/reliability-report.mjs --ci --since <ISO> --out <dir>`. Compare a window after a change with
  one before it of similar length. A week is about 2,500 run attempts: the first report takes a few minutes (four
  requests at a time, waiting out GitHub's rate limit), later ones read the cache.
- **Fixture:** from `apps/studio`, `pnpm exec playwright test -c playwright.reliability.config.ts --workers=2` (on
  Luis's machine through the guard, `pw.ps1 … -Specs "-c playwright.reliability.config.ts"`), then `node
  scripts/reliability-report.mjs --fixture --out <dir>`. Same suite, same scenarios: run it on the code after R1 and
  put the two tables side by side.
- **Reading it:** M1's total is mostly the hold the scenario puts on the reply; its *overhead* is what the Studio
  adds. M6 counts parts, not severity: a silent members list in a picker and a silent board weigh the same. M7's
  «back» can come from another read of the same path already on its way (a second part of the page reading it), not
  only from a retry: the table lists the errors each read saw.

## Checks (written first)

- **Unit** (`tests/unit/reliability-report.test.mjs`, in `pnpm test`): percentiles (interpolated between closest
  ranks), rates of nothing, shard names in both namings, a cancelled job at its limit read as a timeout, carried-over
  jobs counted once, flakes, the job table, the Playwright summary, the room minutes and margin per day and part, the
  limit read from the workflow, main's red hours (a rerun, a late older commit; already red as the window opens, a run
  begun before it), the room's failed tests by full title and recency, the four fixture summaries, and the script
  itself on a fake suite (failed partway, collected short, whole).
- **The suite** runs once on this branch (the code before R1) and its numbers are the baseline; it is not part of any
  normal run. Kept out: before `testIgnore`, `playwright test --list` held its 5 first tests (2,288 in all); after,
  2,283 and none of them, and the reliability config lists only its own.
- **Found while building, tested first:** on branches that split the room in three, a job with the room's name only
  gathers the parts (`echo "The room's three parts"`) and fails in seconds when one fails. Counted, it made 10 of 11
  room failures in a 6-hour window, two false flakes and a 0.1-minute median. A room job counts only if it runs the
  Playwright suite (`isRoomGate`).

## Honest when partial (Codex on #470)

> 2026-10-19 · two P2s on #470, both verified against the code before any change. Luis: «Lo que no se mide, no se
> puede mejorar»; a number taken from half a run, or from half a window, is worse than none.

- **A failed suite published a whole report.** With `--fixture --run`, a suite that exited non-zero (a timeout, a
  browser crash, a failed scenario) was only logged («collecting what it wrote»): the report was built from the
  records some tests had written and the script exited 0, so a before/after could compare a full run with a third of
  one. The same hole stands without `--run` (the guard path on Luis's machine): the script never knew how many
  scenarios the suite has. Now the report counts each metric's scenarios from the suite's own listing (`playwright
  test … --list`: every title path starts `Mn · `, a describe's or the test's; «Total: N tests» proves the listing
  whole) against the records each metric wrote (each scenario writes one, at its end). **Per metric**, as the finding
  allows: when the suite exited non-zero, every metric is **incomplete** (a scenario can fail after writing its record,
  so the records can't say which); otherwise a metric with fewer records than scenarios is. An incomplete metric keeps
  its samples and «n of N scenarios wrote results», and gives no summary (no percentage, no p50); the whole ones are
  published as before. The file is still written; the script exits 1 whenever any metric is incomplete. A deliberate
  run of one spec (only `feed.spec.ts`) so publishes M3/M4 and marks the rest «0 of N». A listing that fails leaves N
  unknown; the suite's exit still decides. The suite command and the results folder can be pointed elsewhere
  (`RELIABILITY_SUITE`, `RELIABILITY_RESULTS`) for the script's own test, which runs a fake suite.
- **M12 had no state at the window's start.** `--ci` lists runs *created* from `--since`, so main's state at that
  moment was unknown: if main was already red, the red time until the first green in the window counted 0, and a run
  created before `since` that ended inside the window was missed. Now `--ci` also reads main's 20 newest `ci` push
  runs created before `since` (`gh run list --branch main --event push --created "<since"`), latest attempts only.
  `mainHealth(runs, now, since)` walks every end in time, so the state at `since` is the one the earlier runs left,
  then keeps only the red time inside the window (a span that began before it counts from `since`; `redSince` keeps
  its true start) and counts in the green share only the commits created in the window. M10 and M11 still read the
  window only.
- **The room tests that failed most were ranked by `file:line`** (the coordinator, from a week's report). One `test(`
  line can stand for many pages: `press-answers.spec.ts:128` «×32» was 13 pages under one line, 31 of the 32 «on the
  work space» on 10-12/13 and already fixed; `resources.spec.ts:461` (×18, all 10-12) and
  `home-phone-needs.spec.ts:79` (×16, all 10-16) were fixed days before too, and led the list. Now each failed test is
  counted by its full title (the summary's line: project, file and line, title path), with its last failure (the
  failed job's start) and how many of its failures fall in the 48 hours before the report's end. The list (top 10)
  is ordered by those recent failures, then by all of them, then by the latest, so a test fixed days ago sinks.

## Limits

- M12's runs before the window are read by their latest attempt only: an earlier attempt of one of them that ended
  red before `since`, rerun green after, is not seen as red at the start.
- `scripts/**/*.mjs` and `tests/` are outside the repository's lint and Prettier gates (S1-01's runtime-unit areas);
  these files are formatted with the repository's Prettier settings anyway.
- M10 sees only what reruns and double runs show: a flake on a commit nobody reran is a plain failure. The
  single-test count is the other half of the signal.
- The fixture numbers are the page's, with no network: they measure what the Studio does with an answer, not the
  API's latency.
- **Against the baseline (§1.1):** «a read is retried 3 times by `retryRead`» holds in the app only. The fixture pages
  (`room.html`, `home.html`, `work.html`) build `new QueryClient()` with no defaults, so TanStack's own rule retries
  every failure three times, `retry: 'never'` or not. No fixture-page check can see gap 2; M7 runs on the app for that
  reason, and a check of R1's retry fix belongs there too.
- GitHub's API limit (5,000 requests an hour) is shared with every tool on the machine; a first weekly report spends
  about half of it.
