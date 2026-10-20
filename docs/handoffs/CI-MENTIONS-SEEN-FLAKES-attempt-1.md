# Implementation-session handoff

Goal and attempt: CI-MENTIONS-SEEN-FLAKES (the reliability baseline's «fallos reales» row, `mentions.spec.ts:577/582`
on `api/contribution-mentions`, `evaluacion-2026-10-19/fiabilidad/linea-base.md` §2.2; 2 of 2 in the week's ranking,
the last on 10-19 09:36 UTC; written in Davide's lane, #409; Luis 2026-10-20: «Procede con el próximo lote y arregla tú
los de Davide»; earlier «Lo que no se mide, no se puede mejorar»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-2`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-2`, branch `ci/mentions-seen-flakes` from `origin/main`
`9a6b03a73` (R1 #470, R2 #472 and group 6 #471 merged; not pushed)
Writable scope: this worktree only (`apps/studio/e2e`, `docs/plans`, `docs/handoffs`); no product code, no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-20, the quotes above; local only, nothing pushed.
Ending commit/tree: `033e60c52`, the last commit that changes code; `c2f2693f0` corrects the note, and the next one adds
only this record. Files changed against `9a6b03a73`: `e2e/mentions.spec.ts`, `docs/plans/ci-mentions-seen-flakes.md`,
and this record.

## Outcome

- **The recorded failures were already fixed.** Both CI failures (runs 39225403086 and 39231306711, #409's merge ref)
  are `pendingSeenRetry`'s `clock.pauseAt` refused, «Cannot fast-forward to the past», for both cases, every attempt:
  the pause aimed 1 ms past a time read, and Playwright adds an init script before it pauses. Davide's `f52ca7698`
  (13:29, after the last failure) pauses a second ahead. No CI run since has failed these tests: the failed runs to 10-20
  00:11 failed in `voice-meters`, `next-up`, `press-answers`, `home-needs-refusal` and `light-states`.
- **A second race stayed in the test, found in the code and fixed here.** The page sets the retry's timer only once it
  has read the 503's body (`callApi` → `toError` → `res.json()` → rejection → `seenRetries.retry` → `setTimeout`).
  The helper released the write and moved the clock without waiting for that read. Read after the clock's first 500 ms,
  the retry counts its second from there: the open case sees 1 write where it expects 2. The close case then passes
  without a pending retry to cancel.
- **The cases now wait for the read**, clock still stopped (`window.seenAnswerRead`, noted by the 503's `json()`).
  Between the read and the timer the client runs only promise steps, and the test's `page.evaluate` is a later task, so
  the retry is set before the clock moves. The 503's body now always comes 300 ms of real time late, so every run meets
  that order. What the cases assert is unchanged.
- **The product is right.** Closing the chat cancels the pending retry (`seenRetries.cancel` in the effect's cleanup);
  kept open, it goes at 1 s.
- **Where this differs from the brief:** the brief points at the clock install against the first write, the join tick
  (#466) and the close against the retry. The install comes before the page loads and the write is held until the
  clock stops, so there is no race there. The join doesn't matter here: neither case reads the dock (`chatToggle` is in
  the stage's corner in and out of the call). With `token=late` the call went live during or after the runs, and both
  cases passed 3 of 3. The close against the timer is the race above.

## Evidence

- CI logs (`gh api repos/davidelaverga/Sophia/actions/jobs/<job>/logs`): jobs 117972338243 and 117989707588 (part 2
  of 3), «Error: clock.pauseAt: Error: Cannot fast-forward to the past» at `mentions.spec.ts:566:20` for 577 and 582;
  jobs 118162890298, 118320838246 and 118341175460 since then: both ✓.
- Probe with `token=late` (scratch, not kept): the call out at the pause 6 of 6, live during or after the runs; 6/6
  passed (`pw-logs/paper2-mseen-latetoken-probe.txt`).
- **Written first and failing** (`43aac6d20`, `pw-logs/paper2-mseen-red2.txt`, `--repeat-each=5`): the open case 5 of
  5 «Expected: 2 / Received: 1» at `mentions.spec.ts:596`; the close case 5/5 passed.
- A first lever held the body with `AbortSignal.timeout`; Playwright's clock fakes that with the timers
  (`coreBundle.js`'s `fakeAbortSignal`), so the body never came while the clock stood still and the fix's wait timed
  out. The committed lever uses `scheduler.postTask`, which the clock leaves alone (console probe: body read 300 ms
  later, `pw-logs/paper2-mseen-debug2.txt`). The red commit was amended to that lever before the fix, and run again.
- Fix `033e60c52`. Green through the guard:
  - both cases, `--repeat-each=20`: 40/40 (`pw-logs/paper2-mseen-green20.txt`);
  - `mentions.spec.ts` whole and `home-needs-refusal.spec.ts`: 45/45 (`pw-logs/paper2-mseen-whole.txt`).
- Whole-repo `oxlint --type-aware` (exit 0), `tsc --noEmit -p apps/studio` and Prettier on `e2e/mentions.spec.ts`:
  clean.

## Decisions and changes

- **The slow answer stays in the helper**, as `token=late` stays on the in-call sweep: it costs 300 ms a case, and
  every run proves the wait.
- **The read is noted on the 503's own `json()`**, not on a product hook: the test changes nothing in the product. If
  the client ever reads error bodies another way, the wait times out at once, it doesn't pass silently.
- **The pause stays a second ahead** (Davide's `f52ca7698`). Playwright has no «pause now», and a clock stopped from
  the page's load would stop TanStack Query's `setTimeout(…, 0)` notifications too.

## Remaining obligations

- The pause is still a time read and a pause a second later: a runner that stalls more than a second between two
  protocol calls would be refused again. Not seen since `f52ca7698`.
- The close case takes 10-19 s on CI against 5-10 s for the open one (the clock's 2.5 s run with the chat closed). Not
  chased.
- CI is the run on record.

## Next bounded action

- Luis: say whether this joins the next batch. It is pushed only on his word and merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository, the baseline and CI's logs only.
