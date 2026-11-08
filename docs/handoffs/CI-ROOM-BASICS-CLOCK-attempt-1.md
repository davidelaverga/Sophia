# Implementation-session handoff

Goal and attempt: CI-ROOM-BASICS-CLOCK (the CI flake `room-basics.spec.ts:18`, «basics · the dock says how long the
call has run», which failed on main's CI for the #482 merge and left main red for about 10 h; the session's reliability
report, `ci-2026-10-26/reliability.md`; Luis 2026-10-26: «Procede con el lote de los tres flakes», earlier «arregla tú
los de Davide», and «Lo que no se mide, no se puede mejorar»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-2`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-2`, branch `ci/room-basics-flake` from `origin/main`
`624441362` (everything through #485 merged; not pushed)
Writable scope: this worktree only (`apps/studio/e2e`, `docs/plans`, `docs/handoffs`); no product code, no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard); CI as the run on record.
Existing authority: Luis, the quotes above; local only, nothing pushed.
Ending commit/tree: `7bbedb123`, the last commit that changes code; the next one adds only this record. Files changed
against `624441362`: `apps/studio/e2e/room-basics.spec.ts`, `docs/plans/ci-room-basics-flake.md`, and this record.

## Outcome

- **The test was wrong, not the product.** CI's log shows the dock reading 1:06 right after the 65 s jump, then 1:07
  to 1:10, one a second: the product counted right, but the page's clock kept running in real time
  (`page.clock.install()` alone), so the runner's own seconds between the call going live and the jump landed on the
  call's time.
- **The page's clock now stops before the page opens** (`pauseAt`, a second past where `install` put it) and moves
  only as the test moves it. The room's join-on-open timer (`useJoinOnOpen`, a `setTimeout(0)`) is let go with
  `runFor(1)`, and the test waits for «Leave the room» before it reads 0:00. The assertions are unchanged: 0:00,
  exactly 1:05 after 65 s, «In the call for 1 minute».
- **New slow-runner case**: the same steps with 1.5 s of the runner's own time between 0:00 and the jump. Both cases
  share one helper (`callClock`); the original title is kept, so the reliability report still tracks it (its line moves
  from 18 to 37).

## Evidence

- **CI log** (run 40320260093, job 121563091283, «The room in Chromium, part 2 of 3», `db56fe0e1`; the run's other
  red job is the gate over the three parts): `room-basics.spec.ts:24`, `expect(locator).toHaveText(expected)`,
  `Expected: "1:05"`, `Received: "1:10"`; polls read `1:06` ×5, `1:07`, `1:08` ×2, `1:09`, `1:10` ×2.
- **Written first and failing** (`a4ccf300e`, `pw-logs/rb-flake-red.txt`, again in `pw-logs/rb-flake-try1.txt`): the
  slow case failed both times with `Expected: "1:05"`, `Received: "1:10"`, polls from `1:06` up to `1:10`, CI's
  signature.
- **Fix `7bbedb123`.** Green through the guard:
  - both clock cases with `-Repeat 20`: 40/40 (`pw-logs/rb-flake-green-1.txt`, before the commit, same tree);
  - the whole spec with `-Repeat 20`: 80/80 (`pw-logs/rb-flake-green-2.txt`);
  - `room-basics`, `host-controls` and `room-captions` (the room specs that also install the clock) once: 40/40
    (`pw-logs/rb-flake-green-3.txt`).
- **The join-on-open timer is real** (a probe, not committed, `pw-logs/rb-flake-probe-norun.txt`): with the clock
  paused and no `runFor(1)`, «Leave the room» never shows (`toBeVisible`, element not found): the call does not join
  until the test lets its timer go.
- Whole-repo `oxlint --type-aware` (exit 0), `tsc --noEmit -p apps/studio` (exit 0), Prettier on the spec and the
  plan: clean.

## Decisions and changes

- **Pause before the page opens, not after the call is live.** Pausing after leaves an unknown gap between the call
  going live and the pause on the clock, so 0:00 and 1:05 could not both be asserted exactly. Paused before, the call
  goes live at a time the test set.
- **The slow case is a separate test**, as in `ci-home-needs-refusal-flake.md`: one case proves the clock holds
  however slow the runner, the other keeps the original title.

## Remaining obligations

- CI is the run on record.

## Next bounded action

- Luis: say whether this joins the next batch. It is pushed only on his word and merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository, the reliability report and CI's
  logs only.
