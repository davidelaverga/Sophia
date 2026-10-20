# Implementation-session handoff

Goal and attempt: CI-PRESS-ANSWERS-IN-CALL (the reliability baseline's gap #1, the room job's flakes,
`evaluacion-2026-10-19/fiabilidad/linea-base.md` §2.2 and §5; the most frequent flaky spec per
`scripts/reliability-report.mjs --ci`; Luis 2026-10-19: «quisiera trabajar en la fiabilidad y resiliencia. Ahí
tendríamos que también medir. Lo que no se mide, no se puede mejorar» and «Arranca R2 en paralelo»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-5`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-5`, branch `ci/press-answers-flake` from
`origin/group/reliability-r1` `0b2202a38` (PR #470; not pushed)
Writable scope: this worktree only (`apps/studio/e2e`, `apps/studio/fixtures`, `docs/plans`, `docs/handoffs`); no
product code, no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard); CI as the run on record.
Existing authority: Luis 2026-10-19, the quotes above; local only, nothing pushed.
Ending commit/tree: `7062a9276`, the last commit that changes code; the next one adds only this record. Files changed
against `0b2202a38`: `e2e/press-answers.spec.ts`, `fixtures/fixture-api.ts`, `fixtures/room.tsx`,
`docs/plans/ci-press-answers-in-call.md`, and this record.

## Outcome

- **The test was wrong, not the product.** «On the room in a call» listed the presses once the room's Invite showed and
  read each by its place in that list. Since #466 the call joins a tick after the shell's first effects. On a loaded
  runner the dock was still out of the call at the listing, then swapped «Check audio and video» for the call's
  controls. The panel toggles after it (Chat, People, Brief) moved down the list. The sweep then read other presses for
  the ones under the pointer: the four CI named.
- The sweep in a call now waits for Leave in the dock, as the lit states' and lit stage's dock checks do. Once the call
  is live, every press there answers.
- **New lever `token=late`**: the room token answers 1.5 s late. The in-call sweep uses it, so every run meets the order
  CI met by chance.
- **The report's top three, read in the logs** (`.reliability-cache` annotations, by test title, not `file:line`):
  - `press-answers.spec.ts:128` (32): 31 «on the work space», 1 «on the room», all on 10-12/13, the spec's first days,
    before `892bef716` and `8aa10e77f`. None is the in-call page, which only fails since #466 (here: #470).
  - `resources.spec.ts:461` (18): «arrow keys move across the tiles», all on 10-12, fixed by `b3676be54` (tiles counted
    while still rising in). Later failures that day are branches not yet rebased.
  - `home-phone-needs.spec.ts:79` (16): «crossing 860 px leaves a focus outside the list», all on 10-16, fixed by
    `f374b5288` (a live `.hw-col button` locator).
  - Neither of the other two shares this cause, and both are already fixed: no commit pair for them.
- **Where this differs from the brief:** the brief takes the 32 as this test's. The report counts by the `test(` line,
  which the sweep's 13 pages share; the 32 are an older page's, already fixed. The in-call failure is new.

## Evidence

- CI log (job 118215336621, `gh api repos/davidelaverga/Sophia/actions/jobs/118215336621/logs`; `gh run view --job`
  refused while the run's second attempt ran): «Expected - 1 / Received + 6» with `button.device-open «Check audio and
  video»`, `button.round «Chat»`, `«People»`, `«Brief»` (the 6 counts lines).
- Not reproduced by load here: a probe found the call live when Invite showed 16 of 16 times (8 at 1×, 8 at a 6× CPU
  throttle). The sweep at a 4× throttle passed 10 of 10 (`pw-logs/paper5-press-repro-t4.txt`).
- Reproduced by holding the token 1.5 s (a scratch spec, then the committed lever): 5 of 5 failed with the same four
  presses (`pw-logs/paper5-press-repro-late.txt`).
- **Written first and failing** (`32fe15c31`, `pw-logs/paper5-press-red.txt`): 5 of 5 failed, each «Received + 6» with
  the four presses above.
- Fix `7062a9276`. Green through the guard:
  - the in-call sweep with the token late, `--repeat-each=30`: 30/30 at `7062a9276`
    (`pw-logs/paper5-press-green30-final.txt`; also 30/30 before a lint rename in the lever, `paper5-press-green30.txt`);
  - `press-answers` whole, `light-states`, `light-stage`, `device-check` (uses `failToken`, whose branch moved),
    `dock-header`: 62/62 (`pw-logs/paper5-press-neighbours.txt`).
- Whole-repo `oxlint --type-aware` (0 diagnostics), `tsc --noEmit -p apps/studio`, and Prettier on the three touched
  non-docs files: clean.

## Decisions and changes

- **The lever stays on the in-call address**, rather than a second test with it: the sweep costs ~20 s, and the room job
  is the bottleneck. The late token costs 1.5 s, and every run proves the wait.
- **Leave in the dock as «live»**, the same signal `light-states.spec.ts` uses (`e7940b963`). The other pages keep
  their `DRAWN` parts.
- **No change to how the sweep reads presses** (by place in a list made once). Tagging each press would turn this
  failure into «gone» rather than fix it. Waiting for the page to settle is the fix.

## Remaining obligations

- The sweep's other failures in the report's window were not chased: sign-in's «Terms» and «Privacy notice» (2, on
  10-16) and Home's listening microphone (4, on 10-13). None since.
- `reliability-report.mjs` ranks by `file:line`. A loop's tests then share one line and the oldest failures weigh the
  same as today's. Ranking by title and showing the last date would have pointed straight at «on the work space,
  fixed». A candidate for the report itself, outside this change.
- CI is the run on record.

## Next bounded action

- Luis: say whether this joins the R2 batch. It is pushed only on his word and merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository, the baseline and CI's logs only.
