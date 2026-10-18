# Implementation-session handoff

Goal and attempt: FND-B-R1-BROWSER-COMPLETION-01 with FND-B-R1-ACTIVITY-TIMING-01 (the R1 prefix's browser gate), attempt 1. One record for two changes: the browser job's deadline, and the slow activity case's clock.
Human owner / executor resource: Davide (merge; no merge authority held here; V serializes merges) / Claude Code session `local_cf492b49-c8d1-4ab7-b811-95eaefc2b61c` (Claude B) on Davide's Mac, coordinated by P.
Native session: none (a coding session, not a runtime attempt).
Starting worktree/commit: `sophia-home-focus`, branch `fix/home-breakpoint-focus` (#392), from `0a4e454100017df3a5a554ece08dac42211997b1`, with main at `e1cc4b4d4cdde2b2643ea40ebe32232040d0900d`.
Ending commit/tree and changed files: on #392, `bb0a44d6` (normal merge of main `e1cc4b4d`), `5dc65fa8` (the deadline) and `355039d96b1744102248208c0567478a8f8d2b7d` (the clock, tree `c983a8828a36e9fdefb60c1e4a1aa22b094a9ad2`, pushed). Changed by this attempt: `.github/workflows/ci.yml` (the `studio-browser` job only) and `apps/studio/e2e/project-activity.spec.ts` (one call and its comment). This record is carried into #387 by the integration that merges `355039d9`. Its own commit is sealed in B's private handback, since a commit cannot name itself.
Writable scope: those two files, and this record in #387's integration. No product, fixture, renderer, contract, migration or runtime change.
Runtime unit: none. The browser runs are local Playwright `1.63.0` on fixture ports 5198/5199, inside a slot P granted after C's release, and released after.
Existing authority: P's two packets above, and V's review of `355039d9` (clear). No merge, deploy or inference authority.

## Outcome

- **Deadline.** The `studio-browser` job's `timeout-minutes` goes from 60 to 90. On 2026-10-16 the full suite on two workers was cut off at 60 minutes before its end on #392, C1 and #393: 1,714 checks discovered on #392. The same tests, two workers, per-test bounds, assertions and retries are kept. This is a completion allowance, not a pass: a job cut off is cancelled, and nothing it would have caught is said.
- **Activity clock.** `project-activity.spec.ts:59` ("a slow read says it is reading, then why it takes long") failed in CI with the 30 s test timeout and an empty `status`, while the same case passed elsewhere. The one change is `page.clock.runFor(6500)` → `page.clock.fastForward(6500)`.
  - The product shows its slow note after a single 6 s `setTimeout` (`useSlow`). The fixture's held read (`?hold=activity`) never answers.
  - `fastForward` fires that timer once. `runFor` also runs every frame and interval of the room page over the 6.5 s of fake time.
  - The held read, the initial `Reading the activity…` assertion, the final slow-note assertion, the 30 s test bound and zero retries are unchanged. No product or fixture change.
- **Not shown:** the CI timeout itself was not reproduced locally (the baseline passed every local run). CI on the pushed head was pending when this record was written: it is NOT a pass.

## Evidence

Measured with a temporary, uncommitted probe: Node `performance.now()` around each phase, written in a `finally` so failures would also be recorded. Run from `apps/studio`, ports 5198/5199 checked free and no vite/Playwright process before and after:

1. Baseline: `PROBE_MODE=runFor CI=1 pnpm exec playwright test e2e/project-activity.spec.ts:59 --repeat-each=10 --retries=0 --workers=2`. Result: 10 passed.
2. Candidate: the same with `PROBE_MODE=fastForward`. Result: 10 passed.
3. With the probe removed and the change applied: `CI=1 pnpm exec playwright test e2e/project-activity.spec.ts --retries=0 --workers=2`. Result: 5 passed; the case took 1.7 s.

| mode, 10 runs each | outcome | open (ms) | initial status (ms) | clock step (ms) | final assertion (ms) | total (ms) |
|---|---|---|---|---|---|---|
| `runFor(6500)` | 10/10 pass | 1366–1884 | 4–39 | 4615–5209 (median 4943) | 3–52 | 6294–6932 |
| `fastForward(6500)` | 10/10 pass | 1436–1930 | 2–31 | 2–57 (median 4) | 3–25 | 1475–1940 |

All runs are kept; none were selected. Raw logs are kept privately by P's coordination (sha256):
- probe timings: `runFor` `b960c1ea…c058`, `fastForward` `96ba4d6dafbdf3f9dcef8fcded3154ff6c000e50b67571fa5e699b7e2c3537e4`;
- run output: `runFor` `d5824a07…1b87`, `fastForward` `1530ccbb…bb3`, final `ad0a5b2e…34c`;
- the failing CI job's log (job 117088952223): `a4e0d843…f6e0`.

Other checks on `5dc65fa8`: format, lint, typecheck and contracts pass; unit tests 2367 pass, 0 fail. On `355039d9`: studio typecheck, oxlint and prettier pass on the spec.

### Ancillary commands, exits and cleanup

Added in #389's integration, after the automatic review of `7730cd09` (comment 4299108398). The record at `355039d9` and `7730cd09` does not carry this section, and this addendum does not make those heads complete. Every command below is copied from the session's command log. A detail that was not captured is marked unavailable.

- **Gates on `5dc65fa8`**, from the worktree root with a clean tree:
  - `pnpm -s format:check`, `pnpm -s lint`, `pnpm -s typecheck`: each exit 0.
  - `pnpm --filter ./packages/dsh-bundle build`: its exit status is unavailable (the output was discarded and the status was not printed).
  - `pnpm test`: exit 0. 2437 tests: 2367 pass, 0 fail, 70 skipped.
  - `pnpm -s contracts:check`: exit 0.
- **Slot entry**, from the worktree root:
  - `lsof -nP -iTCP:5198 -iTCP:5199 -sTCP:LISTEN`: exit 1, no listener;
  - `pgrep -fl "vite|playwright"`: empty output.
- **Probe:** a Python edit replaced the case's body in `apps/studio/e2e/project-activity.spec.ts` with the probed body, which was never staged or committed. `PROBE_OUT` was a private scratch file, later copied to P's journal with the digests above. Before the candidate run, the same `lsof` exited 1; no process query was run at that point.
- **Runs:** the Playwright commands 1–3 above each exited 0, with Playwright's summaries reading 10 passed (37.2 s), 10 passed (11.3 s) and 5 passed. Each command gives one aggregate exit status, so a per-repeat exit status is unavailable. Per-repeat outcomes are the probe's `outcome` fields.
- **Probe removal and the change,** from `apps/studio`:
  - `git checkout -- e2e/project-activity.spec.ts`, then a Python edit of the one clock call and its comment.
  - `git diff` then showed only that change: one line removed, three added.
  - `pnpm -s exec prettier --check e2e/project-activity.spec.ts`: "All matched files use Prettier code style!".
  - `pnpm -s exec oxlint e2e/project-activity.spec.ts`: exit 0.
  - Then run 3.
- **Slot exit**, after run 3:
  - `lsof -nP -iTCP:5198 -iTCP:5199 -sTCP:LISTEN`: exit 1, no listener;
  - `pgrep -fl "vite|playwright"`: empty output;
  - from the worktree root, `pnpm -s --filter @sophia/studio typecheck`: exit 0.
  - Then the commit of `355039d9`. No process was killed. The CI=1 web servers were Playwright's own, started and stopped by each command.
- **Unavailable:** wall-clock start and end times per command, beyond the commit times of `5dc65fa8` (19:21:51 UTC) and `355039d9` (19:52:55 UTC). The idle state of the Mac was not measured during the runs.

## Decisions and changes

- **The test's clock, not the product's timer.** `useSlow` and the room page's timers are not changed. The case asserts one timeout, which `fastForward` serves exactly.
- **Ninety minutes for the browser job only.** No other job, matrix, worker count or test changes.
- **Limits:** the measurements were taken on an otherwise idle Mac. That `runFor`'s cost grows under CI load is consistent with the CI failure, but not proven to be its only cause. The empty value read at the CI timeout was not independently traced.

## Remaining obligations

- The required CI on the pushed heads (#392 run 38959571630, then #387's integration) is the evidence still owed. Any further failure is triaged, not re-run for a random green.
- The automatic review of `355039d9` asked for this record (comments 4298840138 and 4298840144). Those findings stand at `355039d9`; this record answers them in #387's integration, not on that head.
- Luis's open #407 makes the same two changes independently. The overlap is resolved once when either lands.

## Next bounded action

V reviews #387's integration with this record before its push; P sequences the merges, #392 then #387.
