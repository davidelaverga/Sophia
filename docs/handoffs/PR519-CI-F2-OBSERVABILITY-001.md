# PR519-CI-F2-OBSERVABILITY-001: an optional TAP record of `test:integration` in CI

## 1. ACK and plan (written before any code)

**Session.** SAME Native1, Claude Code session `session_01FGXfrJoUMojmJSW3H7XfoG`.

**Base.**

- A new, normal, signed sole child of exact `805523a1d07532a47345bb040a03a2deb26228f5`, tree `41cf9f99452c018ccf6faee25dabf71d561bb246` (PR519-CI-PAIRING-REPAIR-001, sole child of d3e).
- On its own branch and worktree, `inc04-ci-f2-observability-001`.
- 805523a1 stays frozen as this candidate's input. d3e, its CI history, and every older ref, packet and checkout stay as they are.

**Goal.**

- When d3e's CI hit F2 (a partial case failing and a 30-minute job timeout), the only record was the spec text in the job log, which is cut off when the job is killed.
- This slice gives `test:integration` an **optional** second report: TAP written to a file under the runner's temporary directory, uploaded whether or not the check passes.
- It is **presentation only**. It is not a causal fix for F2. F2's cause stays **UNKNOWN**.
- The TAP lines exist only for the test events Node actually emitted and flushed before the process ended. A hard kill or a platform loss can still leave the file short, or leave it unuploaded.

**Authority.** Root's explicit LOCAL lease for exactly six paths, despite d3e's CI being red. There is no publication, merge or deploy authority. Root also grants **docs/SOURCE_MAP.md write ownership** for a new §2t only. Host18 relinquished further Map writes and keeps its §2s on its own branch, which this candidate does not adopt.

**The lease: six paths.**

| Path | Starting state (805523a1) | Change |
|---|---|---|
| `package.json` | blob `118531cd…`, 2371 B | Only `scripts.test:integration`, which now delegates to the new runner. The `check` chain and every other field are unchanged. |
| `scripts/test-integration.mjs` | absent | A small runner: the same Node flags (`--test --test-concurrency=1 --test-timeout=180000`), the literal glob `tests/integration/**/*.test.mjs`, and the caller's extra arguments after it. See below. |
| `.github/workflows/ci.yml` | blob `2760c7b2…`, 11552 B | `runtime-unit` only: a step creating `$RUNNER_TEMP/sophia-ci-diagnostics`; the `pnpm check` step gaining the report path and a 25-minute step limit (the job keeps 30); and an `always()` upload of only that TAP file, short retention, with the existing `actions/upload-artifact@043fb46d…` (v7.0.1) pin. |
| `tests/unit/ci-workflow.test.mjs` | blob `e9e3d9d0…`, 10481 B | All 15 existing cases kept; the preservation baseline revised for exactly these diagnostics; new controls on the workflow and on the runner itself. |
| `docs/handoffs/PR519-CI-F2-OBSERVABILITY-001.md` | absent | This file |
| `docs/SOURCE_MAP.md` | blob `cfa715c3…`, 95936 B | A new additive §2t before §3: the Node 24.21.0 reporter, destination and stream lines, the upload action's inputs, and GitHub's step-timeout syntax |

**What the runner does.**

- **Normal mode** (no report variable) is unchanged: one `node --test` run with exactly today's flags and glob.
- **Report mode.** Only when `SOPHIA_INTEGRATION_TAP` names an absolute `.tap` path whose directory already exists, it pairs spec → stdout with TAP → that file.
- **Child process.** It runs Node through `process.execPath`, with inherited stdio and environment. It runs once. It passes on the child's exit code, re-raises a terminating signal, and fails on a spawn failure.
- **What it never does:** add `NODE_OPTIONS`, skip, filter, retry, force-exit, or create directories.

**What does not change.** No GEN, dependency, lock, SDK, runtime, config, profile, SQL, Studio, test case or test helper. No change to Git or SDK versions, the reverse patch, the partial case, or the usage-provenance test.

**Checks, in order.**

1. Focused: the unit file, with real controlled Node fixtures (report off and on, success, failure, a late hang with bounded termination of the owned process group, signal forwarding, a spawn failure), and adverse workflow and runner variants.
2. Then format, lint, typecheck, contracts, build, `pnpm artifacts` (all 8 identities exact; no record), and the uid 65534 preflight.
3. Then one signed commit, EARLY, ONE ordinary on a new owned PG16 on 55537 if it is free, guarded cleanup, FINAL, HOLD.

## 2. What was done

**The runner, `scripts/test-integration.mjs`.**

- It exports `FLAGS` (`--test --test-concurrency=1 --test-timeout=180000`), `GLOB` (`tests/integration/**/*.test.mjs`), `REPORT_ENV` (`SOPHIA_INTEGRATION_TAP`), `integrationArgs`, `reportFlags` and `runNode`.
- **Arguments.** `node` gets the flags, then the report flags (only when asked), then the glob, then the caller's arguments unchanged.
- **The report path.** It must be absolute, end in `.tap`, and be in a directory that already exists. Otherwise the runner prints why and exits 2 without running anything.
- **The child.** It is started once, through `process.execPath`, with inherited stdio and environment. SIGINT, SIGTERM and SIGHUP are forwarded to it while it runs.
- **The outcome.** The child's exit code becomes this command's. A terminating signal is re-raised on this process. A spawn failure exits 1.

**The workflow, `runtime-unit` only.**

- "Prepare the diagnostics directory" runs `mkdir -p "$RUNNER_TEMP/sophia-ci-diagnostics"`.
- The `pnpm check` step keeps `run: pnpm check` and gains `timeout-minutes: 25` (the job stays at 30) and `SOPHIA_INTEGRATION_TAP: ${{ runner.temp }}/sophia-ci-diagnostics/integration.tap`.
- "Upload the integration TAP report" runs `if: always()`, `timeout-minutes: 3`, with `actions/upload-artifact@043fb46d…` (v7.0.1, the repository's existing pin). It uploads only that file, with `if-no-files-found: warn` and `retention-days: 7`.
- The dsh-source step after it is unchanged. It still runs only when everything before it succeeded.
- Unchanged: the event lanes, triggers, jobs, check names, permissions, matrix and the strict `always()` aggregate. No `continue-on-error` and no new permission, secret or service.
- **When the upload does or does not run.**
  - It runs whatever the check's result was, so it cannot turn a failed check green.
  - A missing file is a warning, not a pass.
  - A failure of the upload service itself would fail the job: an infrastructure fault, reported as such.

**`package.json`.** Only `test:integration` changed, to `node scripts/test-integration.mjs`.

**`docs/SOURCE_MAP.md` §2t.** It binds:

- the Node 24.21.0 docs (multiple reporters, paired in order; spec is the default);
- `utils.js` (file destinations are `createWriteStream(..., { flush: true })`, and reporter and destination counts must match);
- `tap.js` (event-by-event output, including `# Interrupted while running`);
- `junit.js` (buffers until the end, so it was not used);
- the upload action's inputs at the pin;
- GitHub's step and job `timeout-minutes`.

## 3. Checks before commit (Node 24.21.0, pnpm 11.7.0, frozen install, umask 022)

**`tests/unit/ci-workflow.test.mjs`: 28/28.** It runs the 15 existing cases, with two intentional revisions:

- the action pins now include the upload pin;
- the structure digest is computed with the group set back **and** `runtime-unit` set back to its 805523a1 steps. It equals d3e's and 805523a1's `fc501764…`, so nothing else in the workflow changed.

It adds 13 cases:

- **Workflow.** The check step's limit is 25 and the job stays at 30; the step and upload limits fit inside the job; nothing anywhere continues on error.
- **The prepare step.** It is run under `bash -e` with a temporary `RUNNER_TEMP` and creates only `sophia-ci-diagnostics`. The workflow's report variable is exactly the one the runner reads, and its path, evaluated, is accepted by `reportFlags`.
- **The upload.** It is exact (pin, `always()`, path equal to the check's, `warn`, 7 days), ordered after the check and before the dsh-source step, and that step has no `if`.
- **`package.json`.** Only `test:integration` changed (a digest of the rest equals 805523a1's), and the `check` chain is exact.
- **The runner's arguments.** Exactly 805523a1's flags and glob, the report flags only when asked, and the caller's arguments after the glob.
- **Refused report paths:** relative, not `.tap`, or a missing directory.
- **Real fixture suites,** each run in its own temporary project: one passing file in `tests/integration`, one nested, and one outside the glob. Each records its start and end; one that finds another still open fails.
  - **Normal mode.** Exit 0; both files run once, one at a time; nothing outside the glob runs; spec on stdout; no `.tap` written anywhere.
  - **An extra file argument.** It runs as well.
  - **Report mode.** The same run, spec on stdout, and TAP in the file (`TAP version 13`, `ok` lines and `1..2`).
  - **A refused report path.** Exit 2, nothing run.
  - **A failing test.** Exit 1 with and without the report. The TAP holds `not ok … canary fails with its own error` and the canary error.
  - **Fail, then hang, then end.**
    - The runner is started in its own process group.
    - The TAP file already holds the failure and the canary error **while the run is still going**.
    - The runner alone is sent SIGTERM. It forwards it, and Node's runner records `# Interrupted while running: …` and exits 1, which is not a pass.
    - The whole process group then empties **by itself** within a bounded wait. Cleanup sends SIGKILL to the group anyway and confirms the group is gone.
  - **`runNode`.** It passes on exit code 7, the SIGTERM signal, and ENOENT on a spawn failure.
- **Fixture isolation.** A fixture run drops `NODE_TEST_CONTEXT`. Otherwise the nested `node --test` acts as a child of this file's runner and runs nothing; the first run (log `10`) failed exactly that way. It also drops any outside report path.
- **Not F2.** A fixture shows what the record holds when a run fails, hangs and is ended. It is **not** F2 and does not explain CI's run.

**Adverse controls** (uncommitted export of 805523a1 plus the candidate files, one file changed per variant). Every one of the 15 fails at least one case:

| Area | Variants caught |
|---|---|
| Workflow | report not enabled; upload only on success; upload `continue-on-error`; `pnpm check \|\| true`; step limit raised to 30; upload of the whole workspace |
| Runner | exit masked; report ignored; a case filtered; concurrency dropped; no signal forwarding (caught only by the hang case's group-ends-by-itself check); runs twice; timeout raised |
| `package.json` | check chain drops integration; script not delegated |

The candidate passes 28/28 in the same export. One honest limit: the filter variant placed its flag after the glob, where Node reads it as another file pattern, so only the exact-arguments check caught it.

**Other checks.**

- format, lint, typecheck, contracts and build: all exit 0.
- `pnpm artifacts`: **all 8 identities match**, and no record was written.
- uid 65534 preflight: node runs, and the runner imports without running. The owned PG credential and data are denied.

**Owned PG16 for the ordinary.**

- It is on 55537: pid 6871, argv sha256 `9edf4cf9…`. It was created only after a census found the port free on IPv4 and the directory absent; this host has no IPv6 table.
- Its stop helper checks pid, argv hash, start time, cwd, `postmaster.pid`, PG_VERSION and the single listener **in the outer shell**, and exits 3 on any mismatch before the stop command.
- **Two wrong-identity controls** used a harmless canary in place of `pg_ctl`: one with a wrong argv hash, one with a wrong start time. Both were refused with exit 3, the canary was never written, and the server stayed up.

## 4. Limits, ownership and what stays open

**What the TAP file holds.** Only test events Node emitted and its stream flushed before the process ended. A hard kill, a lost runner or a failed upload can still leave no file, a short file, or no artifact. This slice does not show F2's cause, which stays UNKNOWN.

**Not touched:**

- Git or SDK versions, the reverse patch, the partial case or its expectations;
- the host-owned `usage-provenance.test.mjs`;
- Routing17's F1 candidate;
- Host18's C2A work and its §2s, which this candidate does not adopt.

**Still open:**

- d3e's CI stays FAILED (F1, F2);
- GOV21, SEC null, Luis/EdX2C, RTA, the native owner, deployed auth, the app, Personal 9e and the full mission.

8c default-off, the verification erratum, and 9ed's call-ending draft loss and cancel are unchanged.

The candidate's identity and the ordinary's result are in the external EARLY and FINAL packets.
