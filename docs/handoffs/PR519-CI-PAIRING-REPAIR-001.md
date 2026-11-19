# PR519-CI-PAIRING-REPAIR-001: a push and its pull request no longer cancel each other's `ci` run

## 1. ACK and plan (written before any other edit)

**Base.**

- This is a new, normal, signed sole child of exact d3e: `d3e5ba9c88379f3e697f66681c1dfc29379640f4`, tree `be3ff5d5f3e1d85bc23143bfc2726ff71016d964`, sole parent 548.
- It lives on its own branch and worktree, `inc04-ci-pairing-repair-001`.
- d3e, its CI runs (including the failed paired push run) and every older ref, packet and checkout stay as they are.

**The lease: exactly three paths.**

| Path | Change |
|---|---|
| `.github/workflows/ci.yml` (blob `aa2a7a54…`, 11269 B) | Only the `concurrency.group` key, which gains a `github.event_name` prefix, and its comment. `cancel-in-progress` is unchanged. |
| `tests/unit/ci-workflow.test.mjs` (new) | Regression checks on the actual workflow, using the existing `yaml` dependency |
| `docs/handoffs/PR519-CI-PAIRING-REPAIR-001.md` (new) | This file |

No other path is written.

**The cause (diagnosis `34114cfc…`, root-accepted).**

- Today a branch push and the pull request it updates both evaluate the group to `ci-<branch>`, and both have cancel-in-progress set.
- The PR event always arrives seconds after the push, so the PR run cancels the push run. GitHub's annotation on every cancelled job reads "Canceling since a higher priority waiting request for ci-inc04-s01b-coherent-001 exists".
- The aggregate job (`if: always()`) still runs in the cancelled run. It sees its parts `cancelled` and fails. That failed check run stays on the same head SHA.

**Decision (root, P1).**

- Every push and every pull-request trigger is kept. The two events get separate concurrency lanes: `ci-${{ github.event_name }}-<the existing key>`.
- Within one event, a newer head still cancels an older run. main keeps one group per commit, with no cancellation.
- **Not chosen:**
  - push on main only, which would drop checks for branches without a PR;
  - disabling branch supersession;
  - treating cancelled as green.

**Plan.**

1. Write this ACK.
2. Make the two-line `ci.yml` edit.
3. Write the test.
4. Run it, together with an adverse control: the same test against d3e's unchanged workflow must fail on the pairing case.
5. Then format, lint, typecheck, contracts, `pnpm artifacts`, and the uid 65534 preflight.
6. One signed commit, EARLY, ONE ordinary, FINAL, HOLD.

## 2. Cause, evidence and decisions

**Evidence.** It comes from the diagnosis packet `34114cfc…` (read-only, root-accepted). Its raw API bodies and job logs are kept there, not in Git.

| Head | Push run | PR run | Push run's aggregate |
|---|---|---|---|
| d3e | `43560063746`, created 05:08:29Z | `43560069515`, created 05:08:33Z | `132341571580` |
| e62 | `43548643417`, created 02:52:22Z | `43548789320`, created 02:54:04Z | `132306252441` |

- Every cancelled job of those push runs carries "Canceling since a higher priority waiting request for ci-inc04-s01b-coherent-001 exists".
- Both aggregates logged `PARTS: cancelled` and exited 1.
- All 8 ci head SHAs on PR519's branch show the same order: push first, PR 4–102 s later, and every push run ended `cancelled`.

**Precisions to the diagnosis packet.** That packet stays byte-for-byte as sealed; these correct how it reads.

- **The two e62 jobs.** At e62, Supabase and LiveKit were already `success` when their run was cancelled, and they **remain `success`** in the raw job list. Only the enclosing run ended `cancelled`. Those two jobs were not themselves cancelled, and their results were not erased.
- **Mergeability.** Both aggregate check runs stay visible on the e62 SHA: the push suite's failure and the PR suite's success. But PR519's `unstable` mergeability **cannot be attributed to the aggregate alone**. e62's operative SQL job also failed, and when d3e was read its other jobs were still pending.
- **Enforcement.** The public branch summary (`protected: false`, required checks off) and `rules/branches/main` (empty) are **not universal proof that nothing is enforced**. The full protection endpoint answered 403.

No security, CI or application gate is waived.

**Decisions.**

- **What changes.** The group gains `github.event_name` as its first part: `ci-push-<branch>`, `ci-pull_request-<branch>`, and `ci-push-<sha>` on main. `cancel-in-progress` is unchanged.
- **What stays exactly as d3e had it:**
  - every trigger;
  - every job, check name, step, timeout, service and action pin;
  - the permissions;
  - the matrix and its `fail-fast: false`;
  - the aggregate's `needs`, `if: always()` and strict `test "$PARTS" = success`.
- **The trade-off, honestly stated.**
  - A push and its pull request now both run to the end, so runner usage for PR branches roughly doubles. In exchange, both the head (push) and the merge (pull request) are proven. No cost figure is claimed.
  - An older pull-request run is no longer cancelled by a newer *push*. It lasts until the next pull-request event for that branch, which normally follows the push within seconds.
- **Rejected:**
  - push on main only, which drops branch checks without a PR;
  - disabling branch supersession;
  - treating cancelled as success.

## 3. Checks before commit (Node 24.21.0, pnpm 11.7.0, frozen install, umask 022)

**`tests/unit/ci-workflow.test.mjs`.** It parses the maintained `ci.yml` with the existing `yaml` dependency. It evaluates `concurrency.group` and `cancel-in-progress` with a bounded **local model** of the expression forms they use: `||`, `&&`, `==` and `!=` on strings, compared case-insensitively. The model refuses any other syntax. It is not GitHub's scheduler.

The test has 15 cases:

- **Fail-before.** d3e's group puts a same-head push and PR in one group, with cancel set.
- **Pairing.** The candidate puts them in two groups.
- **Supersession.** A newer push cancels an older push, and a newer PR event cancels an older PR run.
- **The trade-off.**
- **Branches.** Different branches stay in different groups.
- **main.** Every commit is its own group, with no cancellation.
- **The model.** Unknown syntax is refused.
- **Pins:**
  - triggers, permissions, job IDs and check names, action pins and the matrix;
  - a digest of the whole parsed workflow with only the group set back to d3e's, equal to d3e's own `fc501764…`;
  - the aggregate's `needs`, `always()` and single step, plus the step's own shell text run under `bash -e`: it exits 0 for `success` and non-zero for `failure`, `cancelled` and `skipped`.

| Run | Result |
|---|---|
| The candidate | 15/15 |
| **Adverse:** the same test on d3e's unchanged `ci.yml` | 3 fail: same-head pairing, the trade-off, main's per-commit lane |
| **Adverse M1:** `cancel-in-progress: false` | 5 fail, including both supersession cases |
| **Adverse M2:** aggregate `if: !cancelled()` | Caught: the `always()` check and the digest |
| **Adverse M3:** cancelled parts pass | Caught: "parts cancelled" and the digest |
| **Adverse M4:** push on main only | Caught: the triggers pin and the digest |
| **Adverse M5:** a SHA-keyed group | 5 fail: pairing, both supersession cases, the trade-off, branch separation |

The adverse controls ran in an uncommitted export with the candidate test, and they are kept in the external packet.

**One earlier fix to the test, kept as history.** A first run of the controls showed the model threw on a literal YAML `false`, so every case failed for that reason rather than semantically. The model now returns a non-string field as-is, and every control failure is semantic.

**Other checks.**

- format, lint, typecheck, contracts and build: all exit 0.
- `pnpm artifacts`: every identity matches, and no record was written.
- uid 65534 preflight: node and the module imports work as uid 65534; the owned PG credential and its data are denied.

**Owned PG16 for the ordinary's integration crossings.**

- It is on 55533, created only after a census found the port free and the directory absent: pid 3596, argv sha256 `91edbfb4…`.
- This host has no IPv6 table, so the listener guard read IPv4 only.

## 4. Limitations

- **Not GitHub.** The test models the expressions, not GitHub's scheduler. A future authorized publication must observe the real same-head push and PR runs completing without cancelling each other. That cannot be qualified before publication.
- **d3e's CI.** It is untouched, and its failed paired push run stays failed. Its terminal record is Routing17's to collect.
- **Still open:**
  - Luis/EdX2C, RTA, the native owner, deployed auth, the real app, Personal 9e and the full mission;
  - default-off, 8c and the erratum, and the 9ed call-ending draft loss with its cancel. All unchanged.

The final candidate identity and the ordinary's result are in the external EARLY and FINAL packets, not in this file.
