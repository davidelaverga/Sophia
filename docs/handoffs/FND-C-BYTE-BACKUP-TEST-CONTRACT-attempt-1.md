# Implementation-session handoff

Goal and attempt: FND-C-BYTE-BACKUP-TEST-CONTRACT-02 (the byte-backup test's progress precondition, corrected), attempt
1, and FND-C-BYTE-BACKUP-FIXED-CONTROL-03 (R-BB-3E76-1: the fixed base control)
Human owner / executor resource: Davide (assignment, relayed from P) / Claude Code lane C (transcript
`2ae2e877-b3cf-44a7-bccc-4db0d9846006`)
Native session: as above
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-17/sophia-byte-backup-contract`, branch
`foundation/byte-backup-contract-20261017`, from `94f0434f35c20d09d9d728bbb1c2adf6c064e323` (tree `96c92fd9…`)
Writable scope: `apps/api/src/byte-backup.test.ts` and this record. No product file.
Runtime unit: Davide's macOS host; Node 24.21.0, pnpm 11.7.0, prettier 3.9.9 (pinned, offline). No PostgreSQL, server,
port, GUI or network.
Existing authority: P's C-byte-backup-test-contract-packet-v1.txt and R's R-byte-backup-a521-proposal-disposition.txt,
relayed by Davide.
Ending commit/tree: the commit this record is in.

## What this is, and is not

- **A test-contract/precondition correction, not a product bug fix.**
  - The failing test raced the inner backup twice for one key, without the outer write-once claim the API puts first.
    It required one winner unconditionally.
  - The base quota worker fails closed on journal contention by design: no wait, no queue. So that precondition was
    never established.
- **B's original check stays FAIL, cause UNKNOWN.** That is the Q13 carry `pnpm check`: 3029 pass / 1 fail / 70 skip;
  `byte-backup.test.ts:79`, 0 winners of 2 in 64.57 ms. The rejection statuses were never recorded. Nothing here
  reproduces or explains it.
- **The rejected proposal a5219130** (a 1 s SQLite wait) is NOT a donor. Its own deadline control showed post-deadline
  charge and copy. None of its worker, test or handoff is here.
- **All product code is exactly base 94:** worker `73cfb030`, `byte-backup.ts` `e8240713`, `byte-backup-quota.ts`
  `1fafb2f1`, `byte-store.ts` `007396af`. Deadlines, interfaces, config, dependencies and contracts are unchanged.

## The two tests

1. **«admits exactly one of two concurrent puts of one fresh key through the write-once claim, with the winning
   bytes»**: the shipped composition.
   - Path: `writeOnce(withByteBackup(memory remote, diskByteBackup))`, with the real file system, quota worker and
     disk copy.
   - Claim: a LABELLED TEST-LOCAL FIXTURE, atomic in this process, standing in for the API's 0044 database claim. It is
     NOT a PostgreSQL concurrency test.
   - Assertions:
     - two callers, two claims, one granted, one inner backup, one upload;
     - stages exactly «fulfilled» and «outer claim 409»;
     - the winner's exact bytes on disk and remote; 0600 file, 0700 directory;
     - one reservation (1 byte), no temporary;
     - a later put of the key refused at the claim, with nothing replaced, charged or uploaded.
2. **«refuses a put whose journal another connection holds, uncharged and untouched, then admits it once»**: the
   DIRECT inner path on a healthy journal a first put initialized.
   - An INJECTED competing lock is held until the put under test settles, then released in `finally`, in three cases:
     SHARED, RESERVED, and the base control (a 100 ms caller deadline under a 300 ms RESERVED lock).
   - Each case must fail closed: the inner quota 503 (or the caller's deadline 503), with the key's reservation,
     copy, temporaries, remote and the whole journal accounting unchanged.
   - The SHARED and RESERVED cases must each be the inner quota 503, checked right after their own release.
   - The base control is FIXED (R-BB-3E76-1): the lock is released at 300 ms whatever happens.
     - It qualifies only on the worker's own capacity refusal before the caller's 100 ms deadline. The quota wrapper
       answers that only on the worker's exit (its one other answer is its 5 s timer), so nothing of that worker can
       follow the release. The untouched after-state is then checked.
     - Any other outcome (the caller's deadline first, another stage, 100 ms or more) FAILS as an inconclusive control.
       Its sanitized record includes an after-state observed after a bounded cleanup wait. That wait (the worker's own
       bound, before the volume is removed) is cleanup only: never qualification, never proof of the worker's exit.
     - The earlier version (3e767e96) instead held the lock to 5.5 s on a deadline-first outcome and passed. That was a
       different control, and it masked a late reservation/copy.
   - Then one declared put of that never-charged key succeeds, and a later one conflicts with the bytes unchanged.

Failures record each outcome's stage and timing, and the key's after-state. Never bytes, private paths, or messages
that name keys. Locks and database handles are closed through `finally` and `t.after`; no unawaited timer touches a
closed database.

## Evidence

- Focused: `byte-backup.test.ts` 17/17. With `byte-backup-quota.test.ts`: 24/24.
- Mutation: the claim fixture made non-atomic (check, yield, then mark). The exact-one test FAILS at its first
  assertion: both claims granted, two inner backups, one put fulfilled, one refused by inner quota 503. Restored
  byte-identically. This is a mutant of the claim, not a reproduction of B's failure.
- One ordinary `pnpm check` on the final tree: see the handback.
- **Fixed control (03)**, adverse witness: the rejected a5219130 worker (its 1 s wait, blob `47298335`) swapped in
  temporarily.
  - The 3e767e96 test PASSES under it (7.9 s, through its 5.5 s fallback): the masking.
  - The corrected test FAILS at the fixed control: «deadline 503» at 100 ms. Its after-cleanup observation shows a
    reservation and a local copy, no remote.
  - Both files were restored byte-identically. A mutant of the worker, not a reproduction of B's failure.

## Remaining obligations

- R reviews this delta. B, the sole integrator, carries the exact test delta to current C1 and then B2, without
  importing B2 into C1.
- Still owed elsewhere: B's common check and CI (including PostgreSQL 16), hosted Auth, Luis's UI acceptance, V.
- Distinct fresh keys can still meet quota contention in the product. That designed availability limit is unchanged.
  Any repair is a separate scope (it would cross the backup interface and the worker; see R's disposition).
