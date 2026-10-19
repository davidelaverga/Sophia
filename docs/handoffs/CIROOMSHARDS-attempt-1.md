# Implementation-session handoff

Goal and attempt: the room's browser job finishes inside its limit again, attempt 1. Found while #468 waited; Luis chose
the split (2026-10-19, asked whether to split the job, raise the limit or leave CI alone: «Partir en dos»).
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ci`, branch `ci/room-job-shards` on `main` `b89a5a962`, 2026-10-19
Ending commit/tree: the change is one file, `.github/workflows/ci.yml`; this handoff is in the same commit.

## Outcome

`studio-browser` («The room in Chromium, on its fixture page») runs as two jobs side by side, «(1/2)» and «(2/2)», each
with Playwright's `--shard`, so each holds about half the checks and finishes in about half the time. `fail-fast` is off,
so a failing shard never cancels the other. The limit stays 90 minutes per shard; the steps, the suite and the criteria
are unchanged.

## Evidence

- #468, run 39250730413: the job was cancelled at 13:51:26 after 1 h 30 min, its last check passed being 2,002 of about
  2,180, with no failure.
- The limit's history in `ci.yml`: 30 → 45 (2026-10-07, CIROOMLIMIT, whose limitation said «shard the job rather than
  raise it» next time) → 60 → 90 (2026-10-16).
- The split, listed locally on the next group's branch: `playwright test --shard=1/2 --list` 1,142 tests, `--shard=2/2`
  1,141, of 2,283.

## Commands run

- `gh run view 39250730413 --job 118055748299 --log` (the cancellation above).
- `pnpm exec playwright test --shard=<n>/2 --list` (the split); `prettier --check .github/workflows/ci.yml`.

## Limitations and next action

- The check's name now carries the shard («… (1/2)», «… (2/2)»). No branch protection requires the old name (the
  protection endpoint answers 404), and nothing in the repo reads it.
- Each shard installs and starts its own fixture servers: about 3 minutes of setup each, run in parallel.
- Next: merge on green; the PR carrying this change runs sharded itself (pull_request runs read the PR's workflow).
