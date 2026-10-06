# WBC-02: the Paperclip image on GitHub-hosted CI (isolated, WBC-02-CX-0035)

The separate CI evidence record CX-0035 asked for. `.github/workflows/paperclip-image.yml` (on `scm-01/paperclip-image-ci`, PR #119) builds the pin's own build stage and Sophia's wrapper image for linux/amd64 from the exact candidate head. It then runs the image under a 2 GiB memory cgroup without swap, with a disposable database and home and synthetic credentials, and drives the installed plugin's flow through the service probe's `--url` mode, before and after a restart and a recreation on the same volume and database. It writes a credential-free receipt and uploads curated, scrubbed evidence.

This is development CI on a GitHub-hosted runner. It is not Render's platform fit, not a registry digest (each image ID is the local config digest; nothing is pushed), and not a real Sophia (its address is closed in the container). No deployment, paid probe, schema application, new infrastructure, secret or registry is involved.

## Runs

| Run | Head | Conclusion | Receipt | Evidence artifact |
|---|---|---|---|---|
| [37401512690](https://github.com/davidelaverga/Sophia/actions/runs/37401512690) | `2615dee` | success | v1, `qualified` 16/16 | none (the job log only; upload came with CX-0036) |
| [37402674257](https://github.com/davidelaverga/Sophia/actions/runs/37402674257) | `32bc34d` | success | v2, `qualified` 14/14 | `11385449858`, 17 files, 12,914 bytes, `sha256:dba2442fe5cc970dab7675ac71fdcecbb0389c06afec4d0be69b031541ddc14a` |
| [37403492614](https://github.com/davidelaverga/Sophia/actions/runs/37403492614) | `302f8af` | cancelled while pending, never started | — | — |
| [37404242301](https://github.com/davidelaverga/Sophia/actions/runs/37404242301) | `f5eeda9` | success | v2, `qualified` | `11387051256`, 13,702 bytes, `sha256:e4fbe03dc2ef544f6e62852bec58ea2b29ebd03dd4fec9bd7ef939133ea80f84` |
| [37405122704](https://github.com/davidelaverga/Sophia/actions/runs/37405122704) | `3db6ef9` | success | v2, `qualified` 14/14, home coverage complete | `11387298928`, 13,702 bytes, `sha256:aca8bc929a1dd7bd6ba591f3d1f67ab4de83a5136b5803d38f187e7690ba42c8` |
| [37405988173](https://github.com/davidelaverga/Sophia/actions/runs/37405988173) | `ae09294` | success | v2, `qualified` 14/14, home coverage complete | `11388081309`, 17 files, 13,702 bytes, `sha256:1c0fca8a6269ed137af8df5b54844e76b065423d5ab183cf23806b8777510af7` |
| [37408687699](https://github.com/davidelaverga/Sophia/actions/runs/37408687699) | `34bdf76` | success | v2, `qualified` | `11388318812`, 13,691 bytes, `sha256:ef1eefca96ad8f52a6eebc58e6eb4208987961785365b215a3be15890a05fa4c` |
| [37409325802](https://github.com/davidelaverga/Sophia/actions/runs/37409325802) | `5b3cdab` | cancelled while pending, never started | — | — |
| [37409376488](https://github.com/davidelaverga/Sophia/actions/runs/37409376488) | `215b276` | success | v2, `qualified` | `11389136762`, 13,668 bytes, `sha256:08594895bf8418673281e350ac4af9398edad2c302a63395b5c9342bcd574c83` |
| [37410660490](https://github.com/davidelaverga/Sophia/actions/runs/37410660490) | `08c2915` | success | v2, `qualified` | `11389458968`, 13,674 bytes, `sha256:797d0a678e0bb0289a8732f66b5787d17665e36fe1669003f8261e00dba515bf` |
| [37411363183](https://github.com/davidelaverga/Sophia/actions/runs/37411363183) | `9130676` | cancelled while pending, never started | — | — |
| [37412274372](https://github.com/davidelaverga/Sophia/actions/runs/37412274372) | `3c29dd1` | success | v2, `qualified` | `11390610730`, 14,361 bytes, `sha256:a9e37a56c325e8a42ec233ffd39ab65932ba6508e98a9746891b50985f3f5792` |
| [37412716894](https://github.com/davidelaverga/Sophia/actions/runs/37412716894) | `99010cd` | cancelled while pending, never started | — | — |
| [37413068600](https://github.com/davidelaverga/Sophia/actions/runs/37413068600) | `5446719` | success | v2, `qualified` | `11390168287`, 14,420 bytes, `sha256:809fd6e4be1ead0312fedadacd028cc826ceafb15293189ad8ce1523abbd40c1` |

- **What has qualified, and what has not yet.** Each run qualified only its own head, with that head's checks. The latest completed run here is run 14, on `5446719`, with every check through the review of `3c29dd1`. Codex accepted that head on its own run in CX-0042. The reviews of `5446719` and `37bae0e` changed the workflow's time budgets and when a start's time is taken, not a check (below). **The current head is not qualified until its own image run succeeds.** Every push to this pull request has its own image run, a commit that changes only this record included, because for `pull_request` events GitHub matches the workflow's `paths` filter against the pull request's whole diff. Runs after those listed here are in the pull request's checks.
- **Run 3** never started. The concurrency group (`cancel-in-progress: false`, CX-0038) keeps one pending run, and a newer push replaced it. No run in progress was cancelled.
- **The artifacts' digests** are the ones the upload action recorded. This session's network cannot reach the artifact store, so Codex downloaded the artifacts of runs 2, 4 and 14 and matched their zip SHA-256 to those digests (CX-0040, CX-0041, CX-0042).
- **Each receipt reflects the checks of its own head.** Runs 1 and 2 predate the 32bc34d review's corrections (step facts, growing records, the group-OOM counter: `302f8af`). Runs 1 to 4 predate the single-read home scan (CX-0040), and run 4's snapshot is the two-read listing CX-0040 found racy. Run 5 predates the scan's isolation from the runner (the review of `3db6ef9`). Runs 6 and 7 predate the scrub gate (the review of `34bdf76`). Run 9 predates the probe's secrets file (the review of `215b276`). Run 10 predates the exact sign-up refusal and the runtime and capability checks (the reviews of `08c2915`, `9130676` and `3c29dd1`). Run 12 predates the requirement that no capability is dropped (the review of `3c29dd1`). Runs 1 to 14 ran under the job's former 120-minute limit (the review of `5446719`); none came near it, and run 14's job took 14 minutes. Codex's re-assessment of run 2 and run 4 inputs under later verifiers is in CX-0040 and CX-0041: the later verifier reads their home as `unavailable` because the older snapshots lack the newer coverage fields. That is not a product failure.

## Runner

Ubuntu 24.04.5 LTS (runner image `ubuntu-24.04`, version 20260927.320.1), kernel 6.17.0-1022-azure, x86_64, 4 CPUs, 16,373,448 KiB of memory, cgroup v2 (`cgroup2fs`), Docker 28.0.4.

Disk available, of 154,894,188,544 bytes (runs 1 and 2; the 25 GB guard never fired):

| Point | Run 1 | Run 2 |
|---|---|---|
| start | 91,894,566,912 | 91,884,814,336 |
| after removing the unused preinstalled toolchains | 111,264,137,216 | 111,254,384,640 |
| after the pin's build stage | 100,333,867,008 | 100,325,232,640 |
| after the wrapper image | 92,944,482,304 | 92,966,895,616 |

## Images (linux/amd64)

| Run | Build stage (`paperclip-build:5edf55d`) | Wrapper (`sophia-paperclip:candidate`) |
|---|---|---|
| 1 | `sha256:1554e8b4…ac44`, 6,209,813,762 bytes | `sha256:cbf3963c522fdab10d514701d55b83be989f05f8eb182bb8c5ff744f96dadf6c`, 2,989,036,692 bytes |
| 2 | `sha256:fbf4cc15…9a84`, 6,209,813,660 bytes | `sha256:5efe3f2adf225f663f15665ab9891a810337451c88fb169e27a2e95e0181fabc`, 2,989,036,692 bytes |
| 4 | `sha256:d600c22b…48dc`, 6,405,395,958 bytes | `sha256:04a025cb737f218d15c86b5c90574cb1f0955bbf12393a86c43a6f4f27ab32ee`, 3,176,476,014 bytes |
| 5 | `sha256:60a15ddc…f3b4`, 6,201,667,541 bytes | `sha256:1da1f9f286f15b1225c040ac848f3c7777a96cb49ca1d1bb805af3816c411390`, 2,980,893,774 bytes |
| 6 | `sha256:90f73434…f3f5`, 6,201,667,399 bytes | `sha256:33bce8bb2881bc2fd09f98f80139be64060fc327fa86852be92aa94dfdbbd8c0`, 2,980,893,774 bytes |

- **Image IDs differ run to run.** The image is not byte-reproducible across runs.
- **Sizes changed in run 4.** Its build stage was 195,582,196 bytes (about 187 MiB) larger than run 1's, and its wrapper 187,439,322 bytes (about 179 MiB) larger. Runs 5 and 6 are back within 8.2 MB of runs 1 and 2. That difference is recorded here, not investigated.
- **Manifest.** Run 1's manifest SHA-256 is `f2f1f4904e89b919fdca4a62fdd59c821a5b40669848433bf65fdfbf8000697e`. In runs 1, 2 and 6, the image's own `verify-manifest` found 8 packaged files naming the candidate commit and the pin.
- **Build times.** The pin's build stage took about 8 minutes (run 1: 507.8 s, run 2: about 480 s); the wrapper took about 72 s.

## Health, memory, flow and home

**Seconds to healthy** (the bound is 300 s): run 1 took 14.4, 12.6 and 12.3 (first start, restart, recreation); run 2 took 12.3, 10.5 and 12.3; run 4 took 14.4, 10.5 and 12.3; run 5 took 14.4, 10.4 and 12.3; run 6 took 14.3, 10.5 and 12.3.

**Memory, runs 1 and 2.** In every phase of both runs:
- `memory.max` was 2,147,483,648 and `memory.swap.max` was 0;
- `oom` and `oom_kill` were 0, and `OOMKilled` was false;
- the cgroup was resolved from the container's own process.

Run 2 also recorded `oom_group_kill` as 0 in every phase, so this runner's kernel reports that counter. Peak and current bytes per phase:

| Phase | Run 1 peak | Run 1 current | Run 2 peak | Run 2 current |
|---|---|---|---|---|
| first:healthy | 769,675,264 | 769,327,104 | 772,460,544 | 772,055,040 |
| first:after-flow | 989,343,744 | 988,049,408 | 997,068,800 | 995,672,064 |
| first:idle | 996,950,016 | 830,963,712 | 1,003,405,312 | 840,118,272 |
| restart:healthy | 863,576,064 | 857,329,664 | 862,547,968 | 857,354,240 |
| recreated:healthy | 947,769,344 | 947,769,344 | 976,285,696 | 968,724,480 |
| recreated:after-flow | 955,617,280 | 955,617,280 | 976,285,696 | 971,653,120 |
| recreated:idle | 982,323,200 | 974,389,248 | 988,446,720 | 983,449,600 |

Run 4's highest observed peak was 1,054,007,296 bytes, under the same limit, with every OOM counter at 0 (CX-0041). Run 5's was 1,001,631,744 bytes (first:idle), with `oom`, `oom_kill` and `oom_group_kill` 0 in all 7 phases.

| Phase | Run 6 peak | Run 6 current |
|---|---|---|
| first:healthy | 770,134,016 | 770,129,920 |
| first:after-flow | 991,801,344 | 990,957,568 |
| first:idle | 1,001,336,832 | 845,705,216 |
| restart:healthy | 875,388,928 | 868,167,680 |
| recreated:healthy | 944,001,024 | 944,001,024 |
| recreated:after-flow | 948,338,688 | 948,338,688 |
| recreated:idle | 978,874,368 | 973,770,752 |

In run 6, every phase again had `memory.max` 2,147,483,648, `memory.swap.max` 0, every OOM counter 0 and `OOMKilled` false.

**The installed plugin's flow** passed in both phases of runs 1, 2, 4, 5 and 6. The receipts of runs 4, 5 and 6 also checked each step's recorded facts, across phases too; in runs 5 and 6, `unsupported` was empty in both phases.

- **First phase:**
  - host-name guard: the private name admitted, any other refused;
  - first admin, the private-mode claim, and a board key;
  - the plugin installed from its fixed path, ready, and configured;
  - the signed commission created, and its resend answered by the same issue (`existing`);
  - the signed Stop applied, its resend `already`, the issue `cancelled`;
  - the settle job run by the host's scheduler (`succeeded`);
  - the lookup;
  - the configuration's digest.
- **After the recreation, with sign-up closed:**
  - the same plugin ready again, with an unchanged configuration digest;
  - the same issue found, still cancelled;
  - the commission's resend answered by that issue;
  - a new sign-up refused (400; from the review of `08c2915` the probe and the receipt also require the auth's own code, `EMAIL_PASSWORD_SIGN_UP_DISABLED`);
  - the host-name guard again.

From the review of `9ee7754`, the same checks but the sign-up refusal also run straight after the restart, as phase `restart`, before the recreation; sign-up is still open then. The runs listed above predate this phase.

**The home** held 4 files in runs 1, 2, 4, 5 and 6. All 4 were still there after the recreation, with the same size and digest. None of them was a growing record. In run 5, the first with the single-read scan and the coverage fields, each snapshot listed and hashed 4 of 4 files, with none unread and no directory unread. Run 6 did the same through the paused, isolated snapshot (from `ae09294`): the container paused, the volume scanned read-only by a disposable scanner container, then unpaused, in about 0.3 s each time. The snapshot has no fallback, so a failed pause, scan or unpause would have failed the step.

## What the receipt checks

`scripts/paperclip-image-receipt.mjs` validates the recorded values themselves, never a producer's own flag. A check is passed, failed, unavailable or not reached, and the verdict is `qualified` only when every check passed:
- **Identity** against the run's own context. From the review of `896a92d`, the packaged files are recomputed from bytes the evidence keeps:
  - the build's manifest (`manifest.json`), its digest the one recorded, naming the pin, the candidate commit and a clean tree;
  - the image's copy of it (`image-manifest.json`), byte for byte the same;
  - every file under `/opt/sophia`, read once inside the image by the home scanner (`image-files.json`), confined and with complete coverage: each recorded file but the Dockerfile there with its digest, and nothing else but the manifest.
- **Each start** healthy within 300 s, judged from the health answer recorded (200 with the status `ok`), never the helper's own flag (from the review of `4c63217`).
- **Each memory phase** read exactly once, with every figure a number:
  - the limit 2 GiB and no swap;
  - peak and current within the limit;
  - no OOM event of any kind (`oom`, `oom_kill`, `oom_group_kill`, `OOMKilled`).
- **Each probe phase's required steps**, with what each observed checked within the phase and across phases (the same plugin, issue and configuration).
- **The home's persistence**, recomputed from two snapshots:
  - every file's size and digest compared;
  - growing records (logs, JSONL journals, `logs/`, `runs/`) may only have been appended to, which their prefix proves;
  - an unread value is unverified, never equal to another;
  - incomplete coverage is reported, never passed.

**The home snapshot** (from `ae09294`) pauses the container, the volume's only writer. It then scans the volume in a disposable container of the same image:
- the volume and the scan script mounted read-only;
- no network and no environment;
- every capability dropped but `DAC_READ_SEARCH`, and no new privileges.

Each file is read once, and only if its opened descriptor is the listed path. The container is unpaused afterwards, whether or not the scan succeeded.

The review rounds and their tests:

| Round | What it corrected | Tests and mutations |
|---|---|---|
| CX-0036 | producer flags trusted; OOM events without a kill; the 300 s bound; the adapter registry's bytes; no uploaded evidence | positive control and each counterexample; 10 mutations |
| CX-0037 | an idle timeout instead of an absolute deadline; responses cut short left pending | real loopback servers raced against a sentinel; 3 mutations |
| review of `32bc34d` | step facts unvalidated; growing records not proved; the group-OOM counter optional | 4 cases; 15 mutations, one equivalent |
| CX-0039 | absent digests equal; snapshot coverage not reported | 6 cases; 19 mutations |
| CX-0040 | counted and hashed in two reads; sizes not compared | real-directory scans with a truncation sentinel; 29 mutations in force |
| review of `3db6ef9` | the root scan could be led out of the volume | a swapped directory, a swapped FIFO, the pause and scan calls; 36 mutations in force |
| review of `34bdf76` | the evidence uploaded whatever the scrub did | the scrub through its command, a value left after rewriting, a link in the evidence, the workflow's gate; 4 mutations |
| review of `215b276` | the probe's own credentials (its passwords, session cookie and board key) unknown to the scrub | the flow against a stand-in server, the probe command with `--secrets`, the sink, credential-named fields, the workflow's wiring; 12 mutations |
| review of `9130676` | a negative start duration passed; the helper claimed no capability while Docker's default set applied | durations 0 to 300 s on a monotonic clock; the runtime Docker configured recorded and checked (not privileged, no capability added, not the host network, loopback only); 6 mutations |
| review of `3c29dd1` | a dropped capability still read as Docker's default set | no capability dropped either; `ALL`, `NET_RAW` and a missing list refused; 1 mutation |
| review of `08c2915` | any client error read as sign-up closed | the pin's own refusal required (better-auth 1.7.2: 400, `EMAIL_PASSWORD_SIGN_UP_DISABLED`), by the probe and the receipt; 404, 429, another 400 code and a 403 all refused; 3 mutations |
| review of `5446719` | the job's 120-minute limit sat below its steps' own budgets, so a slow step within its budget could end the job before the receipt, scrub, upload and clean-up | every step has its own budget (the two checkouts, the pnpm and Node set-up and the upload too), and the job's 270 minutes outlast their 252 plus set-up; 5 mutations |
| review of `37bae0e` | a start's time was taken after its log was read (up to a minute), so a start healthy near 300 s could read as over it | the time taken as the wait ends, before any diagnostics; the helper run against a stand-in docker whose log takes two seconds, its start still under one; 1 mutation |
| review of `f13801d` | the exact upstream sign-up refusal the probe and receipt rely on was not in the source map | `docs/SOURCE_MAP.md` PC-11: the pin's configuration, auth and handler lines and better-auth 1.7.2's `sign-up.mjs`, with the Sophia files that use them; documentation only |
| review of `3f92959` | a change to the root toolchain, lock or workspace, or to `packages/contracts`, started no image run, though the build installs, typechecks and bundles with them | the trigger names `.node-version`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `packages/contracts/**`; a test walks the bundled packages' workspace dependencies and holds the trigger to them; 7 mutations |
| review of `896a92d` | the packaged files passed on the identity step's two flags, and the manifests stayed on the runner | both manifests and a confined scan of `/opt/sophia` inside the image kept as evidence; the receipt recomputes the digest, the byte-identical copy, the pin, commit and clean tree, and every packaged file; a real tree scanned and changed; 11 mutations |
| review of `4c63217` | a start passed on the helper's `ok` flag with no health answer recorded; the runtime steps' budgets were shorter than what they run could take | the helper records the answer (status and reported state) and the receipt judges it, an `ok` without one incomplete; every runtime command under an explicit `timeout` above its own worst case, each step's budget their sum and a minute (33, 12 and 37 minutes), the job 315; 9 mutations |
| review of `9ee7754` | after `docker restart` only health and memory were checked, so a plugin that did not reload after a restart could still qualify | probe phase `restart` after the restart: the plugin ready again, the configuration unchanged, the same issue still cancelled, the resend answered by it, the host-name guard, held to the first phase's facts; sign-up left alone; the restart step 22 minutes; the receipt command run over a whole evidence directory, and without each of its files; 9 mutations |

Each mutation in force is caught. The scan tests read `/proc` and run on Linux only.

## Limits

- **Not production fit.** This is GitHub's runner, not Render's platform. The container ran with Docker's default capability set, none added or dropped: not privileged, not the host network, published on loopback only, which the receipt checks from what Docker recorded (from the review of `9130676`). Whether a hosting platform narrows that set is not tested here. The image ID is a local config digest, not a registry digest, and the image talked to no real Sophia.
- **No credentials.** The job's were synthetic, generated and masked in the job, and passed to Docker by name. The probe lists every credential it makes or is given (its passwords, session cookie and board key) in a file outside the evidence, and masks each in the log (from the review of `215b276`). The evidence directory is scrubbed of all of these, of fields named as credentials and of credential-shaped strings, then read again, before upload, and it is uploaded only when that scrub succeeded (from the review of `34bdf76`). The probe's state and secrets files and the full `docker inspect` are never uploaded.
- **Decisions.** The production decisions D1–D4 remain Davide's. This record authorizes nothing.
