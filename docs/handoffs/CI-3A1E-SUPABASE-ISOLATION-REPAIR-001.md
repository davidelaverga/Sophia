# CI-3A1E-SUPABASE-ISOLATION-REPAIR-001: attempts 1 and R1

Goal and attempt: CI-3A1E-SUPABASE-ISOLATION-REPAIR-001. A CI repair for published `3a1e3538`, not a product goal.

- **Attempt 1** (Root105): frozen tree `9ab6d627`. The independent review returned CHANGES_REQUIRED with findings
  F01–F04.
- **Attempt R1** (Root106): its successor, described here.

Human owner / executor resource: Davide (repository owner); a Claude Code cloud session as implementation worker.  
Native session: not applicable (no native account or session is involved).  
Starting worktree/commit:

- **R1:** new worktree `/home/user/sophia-r106-ci-ownership-r1` on branch `inc04-r07-ci-ownership-r1-001` at
  `3a1e3538639cf3f9afc705d572cda0b0c5746e24`, tree `4fa110e2`. It starts from the exact six 9ab6 bodies, whose
  temporary tree reproduces `9ab6d627`.
- **Attempt 1:** its worktree, `/home/user/sophia-r105-supabase-repair`, stays frozen.

Ending commit/tree and changed files: uncommitted. The stage handback records the R1 tree.

## Trigger

Two failures on the first CI of `3a1e3538`, both before any product assertion:

1. **Live auth on local Supabase.** In the PR lane (job 133160439252, run 43826175983), `supabase start` could not bind
   host TCP 54322 ("address already in use"). `pnpm test:supabase` never ran. The push-lane job 133160421592 passed.
   - The log shows the collision, not who held the port. Nothing here identifies that holder.
   - The `ci.yml` comment names an outgoing connection in the ephemeral range as one possibility. That is a
     hypothesis.
2. **runtime-unit.** Push job 133160421579 and PR job 133160439147 had 19 tests cancelled: 5 `before` hooks of
   `tests/unit/c2b-sdk-patches.test.mjs` could not find `.artifacts/runtime/node_modules/.pnpm`. `pnpm check` ran
   `pnpm test` before `pnpm artifacts`.

## Behavior (R1)

### Developer path

Unchanged. Without `SOPHIA_SUPABASE_ISOLATION`, `scripts/supabase-local.ts` runs the same commands on the committed
config (`sophia-next`, 54321/54322). `supabase/config.toml` is not edited.

### CI start

CI sets `SOPHIA_SUPABASE_ISOLATION=<run id>-<run attempt>`. It is checked before any effect. The attempt then does the
following, in order.

1. **Claims its workdir.** It creates `$RUNNER_TEMP/sophia-supabase-<id>` exclusively. A workdir that already exists is
   refused untouched.
2. **Picks host ports.** One block of ten in 20000–31999, below the ephemeral range: read from
   `/proc/sys/net/ipv4/ip_local_port_range`, or Linux's default 32768–60999 where unreadable.
   - Each block's ports are bound once and released. At most 8 blocks are tried.
   - A busy listener is never touched.
   - The probe is not a reservation: a port taken after it still fails `supabase start` (TOCTOU, non-atomic).
3. **Writes its project copy:** `supabase/config.toml` with `project_id = "sophia-ci-<id>"` and the chosen ports, plus
   the signing keys.
   - Every override must land exactly once.
   - No default port may remain active.
   - The config may hold no multi-line strings, which a line-based override could misread.
4. **Establishes known absence.** It runs `docker ps -a -q`, `docker volume ls -q` and `docker network ls -q`, each
   with `--filter name=sophia-ci-<id>`.
   - Only all three exiting 0 with empty output counts as known absence.
   - An exit that is not 0 or did not run, as with no daemon, denied permission or a missing client, is UNKNOWN.
   - Any output means resources with that name exist, a whole or partial stack.
   - UNKNOWN or existing means no start and no stop. Only the attempt's own files are removed.
   - The name filter matches substrings, so it can over-match (for example attempt `1` against `10`). Over-matching
     refuses; it never adopts.
5. **Takes ownership, then starts.** Only after known absence does it write its ownership record and call
   `supabase start`. From that point the attempt owns what a start under its unique project id creates, including a
   partial stack. A new directory, or an attempted start, is not ownership by itself. Another process that used the
   same unique id between the queries and the start is not excluded (TOCTOU).
   - The record is `sophia-owner.json`: version, id, project id, ports, and the sha256 of the config.
6. **Checks the reported ports.** The API and DB ports must match the chosen ones before the URLs are handed on.

### CI cleanup

- **On any failure after ownership:** it runs `supabase stop --no-backup --workdir <own>` only, never `--all` and never
  a Docker removal. It removes the workdir only if that stop succeeded.
  - The outward error keeps the original failure and every cleanup failure (`AggregateError`, original first). That
    includes a failed stop, which keeps the workdir, and a failed removal.
- **`--stop`** (CI's `if: always()` step) acts only after every check below passes. Otherwise nothing is called and the
  contents are left as they were. If no workdir is left, it says so and exits 0.
  - The workdir is a real directory, not a link, owned by this user, holding exactly the record and `supabase/`.
  - `supabase/`, the config, the keys and the record are not links.
  - The record is complete and exact: version, id and project id match the attempt, and its ports are one valid block.
  - The config's sha256 matches the record.
  - The config is byte-identical to the committed config with that project and those ports applied.
  - A removal failure after a successful stop is an error, never a success.

### runtime-unit

`pnpm check` runs `pnpm artifacts`, which builds the deployed runtime and verifies its 8 recorded identities, before
`pnpm test`. All nine phases are kept in one `&&` chain. The SDK test is unchanged.

### Pinned workflow test

`tests/unit/ci-workflow.test.mjs` requires exactly one reviewed start step, immediately before `pnpm test:supabase`, and
exactly one reviewed stop step, immediately after it and last. It then removes only those verified occurrences before
d3e5ba9c's unchanged digest. A duplicate or moved stop fails.

## Limits

- **No live Docker:** this session has no daemon, so a real isolated `supabase start`, the Docker queries against a real
  daemon, and the CLI's actual workdir contents after start are NOT RUN.
  - The unit tests drive the script with an injected CLI and Docker runner, real TCP listeners and real filesystem
    fixtures. That is not live qualification.
  - The strict workdir check assumes the CLI writes only inside `supabase/`. If it writes more, `--stop` refuses to stop
    the attempt's own stack, which fails visibly; it does not adopt.
- **Not run:**
  - The full unit and integration suites, and the canonical `pnpm check` from a new worktree with no `.artifacts`, are
    later steps.
  - CI is not run, and earlier CI does not transfer.

## Evidence (R1)

Node 24.21.0 and pnpm 11.7.0. One `pnpm install --frozen-lockfile` from the owned store; the lock was unchanged.

- **Governing reads, before any R1 code:**
  - `AGENTS.md` (blob `f04a069d`) read whole in the R1 worktree.
  - `CONTRIBUTING.md` (blob `32d499d0`): the earlier whole read of the identical blob in the same session was reused,
    with recorded ranges and times.
- **Starting point:** the six 9ab6 bodies were copied from Git objects. A temporary index in the R1 worktree reproduced
  `9ab6d627`, with 4292 base rows retained.
- **Focused tests:**
  - `tests/unit/supabase-local.test.mjs`: 28/28. That is the 20 earlier cases, adapted to the Docker absence check,
    plus new F01, F02 and F03 controls.
  - `tests/unit/ci-workflow.test.mjs`: 28/28.
  - `tests/unit/c2b-sdk-patches.test.mjs`: 19/19, after one `pnpm build` and one `pnpm artifacts` from a worktree
    without `.artifacts`. That run exited 0 and all 8 identities match.
- **Statics:** Prettier, type-aware oxlint and `tsc` pass on the changed script. The first oxlint run reported one
  unsafe `any` assignment, which was fixed.
- **Mutation checks** on kept mirror copies; the unmutated mirrors pass 28/28.
  - Workflow and package: the six earlier mutants plus five new F04 mutants each fail exactly one test, on its intended
    assertion. The F04 mutants are a duplicate stop before the auth test, a moved stop, a duplicate stop at the end,
    another stop command before the auth test, and a duplicate start.
  - Script: each reverted F01–F03 fix makes 1 to 5 of the targeted tests fail:
    - unknown read as absence
    - existing stack ignored
    - absence not required
    - ownership taken before absence
    - no hash check
    - no effective-config check
    - stop without guard
    - removal error replacing the original
    - failed stop dropped

Not run: live Docker, the full unit and integration suites, the canonical check from a fresh worktree, and CI.
