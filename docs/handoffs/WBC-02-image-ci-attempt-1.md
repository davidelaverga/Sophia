# Implementation-session handoff

Goal and attempt: WBC-02 (SCM-01), the isolated CI qualification of the Paperclip image (plan WBC-02-CC-0013, criteria CX-0032, scope CX-0035); attempt 1 of this slice  
Human owner / executor resource: Davide (decisions); Codex (review, deployment, testing); Claude Code in a cloud container (linux-x64), the only implementation writer  
Native session: this Claude Code session; no Sophia native session was created  
Starting worktree/commit: the held WBC-02 branch `scm-01/workboard-source-review` at exactly `29371f5a3703f4358563886407bc360df7c38603`, verified in this container; this slice's branch `scm-01/paperclip-image-ci` was cut from it  
Ending commit/tree and changed files: commit `7b15826a61e519ae91987eb8dcc186034fecbcd7`, tree `bac97abc57ee97482f1b6d2623197be7c2d2120e`: the last commit with code, and the one every check below ran on. The one commit after it changes only this file, to record that identity (`git diff --stat 7b15826` from it names this file alone). From the base, that code commit is the 34th: from `fecc2d2` (the three probe drafts of WBC-02-CC-0014) through the review rounds. Files: `.github/workflows/paperclip-image.yml`, `scripts/paperclip-{service-probe,probe-flow,probe-url,probe-http}.mjs`, `scripts/paperclip-image-{container,cgroup,home,redact,receipt}.mjs`, `tests/unit/paperclip-{image,image-home,probe-http}.test.mjs`, `docs/evidence/WBC-02/paperclip-image-ci.md`, one source-map row (`docs/SOURCE_MAP.md` PC-11, the upstream sign-up refusal) and this handoff. Nothing under `packages/`, `apps/`, contracts, migrations, `config/runtime-unit`, `deploy/` or `docs/progress/`

## Outcome

On a GitHub-hosted runner, a workflow builds the image from the pin's own build stage and Sophia's wrapper, then qualifies it under a 2 GiB cgroup with no swap, with a disposable database and home and synthetic credentials:

- **The container:** Docker's default capability set (none added or dropped), not privileged, published on loopback only, with each start healthy within 0–300 s on a monotonic clock.
- **The flow:** the installed plugin's whole flow runs through the service probe's `--url` mode: the host-name guard, the first admin and a board key, install and configuration, a signed commission and its resend, a signed Stop and its resend, the scheduled settle run, the lookup and the configuration digest.
- **Restart and recreation:** after a restart (from the review of `9ee7754`), and again after a recreation on the same volume and database with sign-up closed, the plugin, configuration and issue persist and the commission's resend is answered by that issue; after the recreation, sign-up is refused exactly as the pin refuses it.
- **Memory and home:** memory is read from the container's own cgroup at every phase, with every OOM counter. The home is scanned once per file by a paused, read-only scanner container, with complete coverage, and growing records may only append.
- **The receipt** validates recorded facts, never producer flags, and says `qualified` only when every check passed. The evidence is scrubbed and read again before it is uploaded, and only then.

**Acceptance.** Run 14 qualified `5446719`. Codex accepted that head in CX-0042: it downloaded the artifact and matched its SHA-256, re-assessed it 15/15, and refused eight adverse variants. Every later head is qualified only by its own image run. The runs are in [the evidence record](../evidence/WBC-02/paperclip-image-ci.md).

**Not verified:** Render's platform fit (including whether it narrows the capability set), a registry digest, a hosted disk, a real Sophia (its address is closed in the container), and the final combined head.

## Evidence

- **Image runs:** each run, with its receipt and artifact digest, is in [the evidence record](../evidence/WBC-02/paperclip-image-ci.md) through run 14. Later runs are in the PR's checks. The artifact store is unreachable from this container. The digests are those the upload action recorded, and Codex matched runs 2, 4 and 14 (CX-0040, CX-0041, CX-0042).
- **`pnpm check`, Node 24.21.0, at `37bae0e`:** exit 0.
  - Unit: 1581 pass, 0 fail, 1 skipped.
  - Integration: 86 pass, 0 fail, 2 skipped.
- **`pnpm check` at `7b15826`:** exit 0.
  - Unit: 1623 pass, 0 fail, 1 skipped.
  - Integration: 86 pass, 0 fail, 2 skipped.
- **Tests:** the receipt, scan, scrub, probe, runtime, time-budget, start-timing, health-answer, runtime-bound, restart-phase, probe-deadline, evidence-shape, trigger and packaged-file tests are in `tests/unit/paperclip-image.test.mjs`, `paperclip-image-home.test.mjs` (Linux only: it reads `/proc`) and `paperclip-probe-http.test.mjs`.
- **Mutations:** each mutation of those checks is caught; the counts per review round are in the evidence record.
- **Codex's independent checks at `5446719` (CX-0042):**
  - `pnpm check` exits 0;
  - the focused suites give 46/46;
  - the actual snapshot process runs with Docker stood in;
  - a private receipt mutation fails exactly its intended assertion.

## Decisions and changes

**Scope.** CX-0035 bounded the slice: the probe, the workflow and its helpers, their checks, and a separate CI evidence record. The held branch, main and #117 were not touched, and nothing was merged.

**Review rounds.** Each review round (CX-0036 to CX-0040, then each last-head review through `37bae0e`) was answered with tests and mutations on this branch, each recorded in the evidence record. Two decisions are worth recording here:

- **The capability set.** The run keeps Docker's default capability set rather than narrowing it. This qualification should not test a stricter runtime than the image will meet, and the stated scope was corrected and checked to match (the review of `9130676`).
- **The home scan.** The home is scanned by a paused, confined scanner container rather than on the runner (the review of `3db6ef9`).

**Authorization.** No new authorization was assumed or used: no deployment, registry push, paid probe, schema application, new infrastructure or secret. The workflow has `contents: read`, no `secrets.*` and no registry login.

## Remaining obligations

- **Image runs.** Each push to #119 starts its own image run on GitHub. A run in progress is never cancelled, and a newer push replaces only a pending one. Nothing else is active.
- **Credentials and data.** No credential is retained. The job's credentials are synthetic and removed at clean-up. Evidence artifacts are scrubbed and kept 30 days.
- **The held branch** stays at `29371f5` until Codex's notice that #117 and #119 are reviewed and can be brought in (CX-0026, CX-0033, CX-0034, CX-0042).
- **The final integration** merges latest main, now `7a4fa11d`, keeping what WBC-02-CC-0032 lists, and repeats this container check on the combined head. That is still owed.
- **Decisions D1–D4** remain Davide's. This slice authorizes nothing.

## Next bounded action

1. **Codex** reviews this head and its own image run.
2. **Codex**, once #117's final head is accepted, sends the incorporation notice for #117 and #119 on PR #107.
3. **Claude** then:
   - brings both into `scm-01/workboard-source-review`;
   - merges latest main with the resolution in WBC-02-CC-0032;
   - regenerates the artifacts;
   - runs the full gate and the image qualification on the combined head;
   - publishes it for Codex's review.

Never a merge to main or a deployment.
