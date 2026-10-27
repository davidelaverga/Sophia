# Handoff: Next up's Enter waits for the focus, however slowly CI draws

Goal and attempt: CI-NEXT-UP-FLAKE (the room flake `e2e/next-up.spec.ts:29`, 2 failures in the week to 2026-10-26,
`scripts/reliability-report.mjs --ci`; Luis 2026-10-26: «Procede con el lote de los tres flakes», earlier «arregla tú los
de Davide» and «Lo que no se mide, no se puede mejorar»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-1`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-1`, branch `ci/next-up-flake` from `origin/main`
`624441362` (through #485); not pushed
Writable scope: this worktree only (`apps/studio/e2e`, `apps/studio/fixtures`, `NextUp.tsx` for one marker, `docs/plans`,
`docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `pw.ps1` and `.claude-guards/safe-run.ps1`, two workers); CI as
the run on record.
Existing authority: Luis 2026-10-26, the quote above; local only, nothing pushed.
Ending commit: the branch's last commit; code last changed at `9f32a19dd`. Against `624441362`:
`apps/studio/e2e/next-up.spec.ts`, `apps/studio/src/features/work/planning/NextUp.tsx`,
`apps/studio/fixtures/work-live.ts`, `apps/studio/fixtures/work.tsx`, `docs/plans/ci-next-up-flake.md`, this record.

## Outcome

- **The flake was already fixed on main by Davide's lane:** `63430578b` (2026-10-25, on main through #482) waits for
  the focus on the line's press before Enter. Both CI failures (runs 39328633002 and 40188885090, room part 2) were at
  the earlier wait: after Enter, `getByRole('dialog')` «element(s) not found». No failure since.
- **That fix is now proven and guarded:** a slow-frames case (`slowFrames`, frames 125 ms late, CI's rate) runs the same
  steps; without the focus wait it fails every time, with it it passes every time. The steps moved into
  `opensTheNamedTask`; the test at `:29` keeps its title and all its checks.
- **Where the Enter went:** the page's body (probe, below), as `63430578b` assumed but could not see on CI.

## Evidence

- Plan: `docs/plans/ci-next-up-flake.md`.
- CI logs (`gh run view <id> --log-failed`, 13 failed runs of the week read; only these two failed in next-up):
  `next-up.spec.ts:37:23`, `expect(locator).toBeVisible() failed … getByRole('dialog') … element(s) not found`.
- Red, control commit `98e81ccf8` (the focus wait removed, never on the branch), `-Grep Enter -Repeat 10`
  (`pw-logs/nextup-control-red.txt`): the slow case 10 failed with the same error, the case at the machine's rate 10
  passed.
- Probe, commit `f7e4d9420` (never on the branch), `-Repeat 3` (`pw-logs/nextup-probe-focus.txt`):
  `document.activeElement` at the Enter was `BODY` 3/3 in the slow case, `BUTTON.text-button` 3/3 at the machine's rate.
- Green at `f5509aed9`: the whole spec `--repeat-each 20` through the guard, 160 passed
  (`pw-logs/nextup-green-x20.txt`); neighbours `palette-knows` and `work`, 214 passed
  (`pw-logs/nextup-neighbours4.txt`). Whole-repo `oxlint --type-aware` exit 0, `tsc --noEmit -p apps/studio` clean,
  Prettier on the spec. No unit file touched.

## Decisions and changes

- **Test only, one commit, no failing pair:** the fix was already on main; the bite of the new case is shown by the
  control commit, as in `CI-LIGHT-BY-HOUR-CONTRAST`.
- **No product change:** the focus one frame after the words is NextUp's design (it waits for the disabled choice to
  drop the focus); the test waits for that condition, not a duration.

## Remaining obligations

- CI is the run on record.

## The two other timed waits (coordinator's follow-up, same day)

- **«focus moved … stays there»:** the check now waits for the line to say its frame has looked where the focus is
  (`data-settled`, added to `NextUp.tsx` test-first: `3355a78aa` red, «unexpected value "null"», then `d7a5bd146`).
  Before, a NextUp that always took the focus passed the old check 10 of 10 at 8 frames a second (control `49880b647`,
  `pw-logs/nextup-focus-vacuous.txt`; 10 of 10 failed at the machine's rate). Now the same mutant fails it 20 of 20,
  both rates (control `64adceb12`, `pw-logs/nextup-focus-control-red.txt`).
- **«answering the one it names…»:** `toHaveCount(0, { timeout: 250 })` gave way to an answer held on its way
  (`decide=held`, `workFixture.releaseDecision()`, `9f32a19dd`): the line is checked gone while the answer is
  unrecorded, then back once released. Control `7ab8703fa` (the line kept as the answer goes) fails it 10 of 10, «Expected:
  0 Received: 1» (`pw-logs/nextup-held-control-red.txt`). One commit, test and lever: the product already passes.
- Green at `9f32a19dd`: the spec `--repeat-each 20`, 160 passed (`pw-logs/nextup-r2-green-x20b.txt`); `palette-knows`
  and `work`, 214 passed (`pw-logs/nextup-r2-neighbours.txt`, finished before the guard saw Aion 2 open); whole-repo
  `oxlint --type-aware` exit 0 (the fixture's `controls` and `Tasks` held at 60 lines by spreading `decisionAnswers`),
  `tsc`, Prettier, `next-up.test.ts` 8/8.

## Next bounded action

- Luis: say whether this joins the next batch with the other two flakes. Pushed only on his word; merges on green with no
  open P1.
- Source IDs consulted: none from the source register. The work read this repository and the CI logs only.
