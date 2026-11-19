# INC04-S03-COHERENT-002 — one coherent join of the CLI repair, model-report consumer and usage producer

Goal and attempt: INC04-S03, task `INC04-S03-COHERENT-002`, attempt 1 (a NEW local integration candidate).  
Human owner / executor resource: Davide (owner); SAME Routing17 Claude Code implementation worker, session `session_01FGXfrGsUA6jNm3sxRoSro2`. No new role.  
Native session: none; no native, provider or account session is used.  
Starting worktree/commit: new worktree `/home/user/Sophia-inc04-s03-coherent-002`, new branch `inc04-s03-coherent-002`, at exact published `e62c4ad58ea277e3845fc5c66940eaad38070a7c` (tree `6f5bf3e94d05600338ed234ec68b8d34ed4fd907`), with 0 status lines.  
Ending commit/tree and changed files: one normal signed octopus merge commit, with ordered parents [e62, 9444, 0a8d]. Its own identity is recorded in the external packet after signing, not here (a self-reference cannot be written). 33 paths change against e62: the 32 imported paths plus this handoff.

## 1. ACK and plan (sent to root before any effect)

**Inputs.**
- Task `a49fe204…424b` (9,703 B) and context `114f8254…c774` (1,187,608 B). All 12 SUMS lines verify, and the task copy is byte-equal.
- Read:
  - the prospective union proof `6c0e2d8f`: tree `b4874c6d`, 4,247 leaves, 318 whole-baseline paths, 36 pairwise-disjoint delta paths from af82 (CLI 4, B2 20, C1P+R1 12), and 32 paths fresh against e62;
  - the accepted PREs, each with its root adoption: e62 `d0a57808`/`173fe19d`, B2 `d664155e`/`b266fba0`, and C1P-R1 `f3758238`/`be3fe870`;
  - the C2 retry adoption `9abefb70`, as context only;
  - the e62 publication reconciliation `7b72a06f`;
  - AGENTS.md and the session-handoff template.

**The three exact inputs.**

| Input | Commit | Tree | Parent | Source |
|---|---|---|---|---|
| CLI (published) | `e62c4ad58ea277e3845fc5c66940eaad38070a7c` | `6f5bf3e9…` | sole af82 | 4 paths |
| B2 consumer (local) | `9444df971017c0f390c87ca79a1cf64c8d745692` | `158a6cb4…` | sole af82 | 20 paths, including 0108 |
| C1P-R1 (local) | `0a8d036a933fc2d0b7be09f514529f2643f2df9c` | `aca6e9ba…` | sole d996 `d9963bbf…` (tree `f6d02163…`, itself sole af82) | 12 paths from af82 |

C1P-R1 was imported from its EARLY bundles only:
- the C1P bundle (`b20c77f3…`) requires af82;
- the R1 bundle (`17cb5088…`) requires d996.

Both went into NEW private refs `refs/coh002/c1p-d996` and `refs/coh002/c1p-r1-0a8d`, with `--no-write-fetch-head --no-tags`. The commit, tree, ordered parents and rehash all verified. FETCH_HEAD and every pre-existing ref are byte-unchanged. The failed d996 ordinary stays failed and is not relabelled.

**Join.**
- ONE `git merge --no-commit --no-ff 9444df97… 0a8d036a…` from e62. Git's octopus strategy ("Trying simple merge with" each head) reported "Automatic merge went well".
- `MERGE_HEAD` is [9444, 0a8d], with 0 unmerged entries.
- The staged tree is **exactly `b4874c6dca41d96bfa82d06b3d66f60fd159630e`**. All 36 fixed sources match the proof in mode, blob, stage 0, bytes and SHA-256; there are 4,247 leaves, and 32 paths differ from e62.
- No conflict policy, manual merge state, rebase, reset, cherry-pick, squash, amend or alternate strategy.

**Scope.**
- Exactly one path beyond the fixed union: this handoff. That gives 4,248 leaves and 319 whole-baseline paths.
- The existing three handoffs (`INC04-S03.md`, `INC04-S03A-CLI-NUMERIC-R1.md`, `INC04-S03A-R07-C1P.md`) are byte-exact inputs.
- No production, test, schema, SQL, GEN, SOURCE_MAP, lock or config edit. No guard is relaxed and no case is skipped. No C2 source.

**Runtime identity** (Node 24.21.0, pnpm 11.7.0, umask 0022, frozen install).
- `pnpm build` gives 0, and `pnpm artifacts` reproduces every identity.
- `pnpm artifacts:record` leaves `config/runtime-unit.json`, the profile lock and `pnpm-lock.yaml` byte-unchanged:

| Identity | Value |
|---|---|
| Linux | `sophia-tree-v2:sha256:c97621b4…` / 27,747 entries |
| Workspace lock | `7a500c03…` |
| Bundle archive | `cab29744…` |

These are C1P's reviewed values. B2 changes no runtime, bundle, config or profile file.

**Database.** An owned PG16 on 127.0.0.1:55527 (PID 1314), created after a census.
- SCRAM over TCP; the credential is a fresh 0600 file outside source and logs.
- Baseline: postgres, template0 and template1; role postgres; 0 memberships; 0 clients.
- The other clusters (55517, 55519, 55521, 55523, 55525) were not touched.

## 2. Outcome

The three accepted inputs are one source. Together they give:
- the CLI's exact-number boundary;
- B2's provider-reported model names, recorded through 0108;
- C1P's bounded usage contract, including the R1 cache-write adverse control.

A normal Git octopus produced them as a normal merge, with no intermediate integration commit and no conflict. Every check below ran on this combined source, so it crosses the join rather than citing each input's own results.

**Unchanged.** No user-visible behaviour changes beyond the three inputs' own accepted behaviour. The default-off 8c catalog with its verification erratum, the separate 9ed sign-in consequences and cancellation, and every flag are unchanged.

**Pending** (none of these is claimed):
- the ONE ordinary `pnpm check` on the signed head;
- the owned-PG cleanup;
- independent review;
- current-head CI.

## 3. Evidence

**Executed tree.** All focused checks ran on the staged tree `bb13cf4a90d1db64d8f9fc3cc369b8d89f43cea3`: the union `b4874c6d` plus §1 of this handoff. They ran in Git's merge state (`MERGE_HEAD` [9444, 0a8d]), with 0 worktree-to-index differences. The index and every tracked byte were identical before and after, with 0 untracked files. The signed commit differs from that tree only in this file, by appending §2 to §6.

| Check (owned PG16 on 55527; labelled fake providers) | Result |
|---|---|
| `runner-model-report.test.ts` | 14/14 |
| `t3-port-mapping.test.ts` | 36/36 |
| `owner-host-channel.test.ts` | 17/17 |
| `owner-host-port-proxy.test.ts` | 71/71 |
| `runner-gateway.test.ts` | 106/106 |
| `pnpm test:sql` | 107 migrations and 20 SQL test files, exit 0. Includes 0107 and 0108; 0103 is absent, as excluded |
| `runner-operations.db.test.ts` | 25/25 |
| `runner-dispatch.db.test.ts`, whole file | 138/138 |
| `capacity-observations.db.test.ts`, whole file | 12/12. Includes the CLI raw-lexeme record/replay, 19 refusals and the 0-connection boundary |
| `tests/integration/research-route.test.mjs` | 3/3. Includes the genuine cache hit, the unqualified cache-write extension settling uncertain beside a complete turn, and the foreign-route refusal |
| `tests/integration/usage-provenance.test.mjs` | 29/29 in 6 suites. Covers missing, partial and invalid usage (uncertain, never zero-filled), explicit zeros, `cache_write_tokens` 0 versus positive, and stream cut, 500 and Stop |
| `pnpm format:check`, `lint`, `typecheck`, `contracts:check` | each exit 0 |

**Totals.** 244 unit, 175 DB and 32 integration cases, each counted once, plus the SQL suite. There are 0 skipped, 0 todo, 0 cancelled and 0 failed. Every command's own exit is written in its raw log.

**Scope of the evidence.**
- The DB and integration cases ran against disposable PostgreSQL with synthetic fixtures.
- The integration crossings ran the deployed `.artifacts/runtime`, rebuilt from the frozen install. They used labelled local fake provider services, so no live account, provider, billing or native execution was involved.
- The B2 model-report replay and conflict, the C1P missing, partial and known-failed usage, and the CLI precision and no-DB-contact positives and adversaries all ran here, on the joined bytes.

The raw logs and their mapping to the executed tree are in the external EARLY packet.

## 4. Decisions and changes

- **The join.** A normal Git octopus, chosen because the 36 delta paths are pairwise disjoint and the root proof fixed the union. Parent order: e62 first (the published branch line), then 9444, then 0a8d.
- **What was added.** This handoff, and nothing else. The three existing handoffs and every imported blob are byte-exact.
- **Runtime identity.** It comes from C1P's reviewed config and lock. `artifacts:record` changed no byte.
- **Authorization.** No new authorization was used, and the impact is no wider than the lease.

## 5. Remaining obligations

- **The owned PG16 on 55527 (PID 1314).** It stays up for the ONE ordinary. Then only it is identity-revalidated and stopped normally; its data, logs and the 0600 credential custody are retained.
- **Private refs.** `refs/coh002/c1p-d996` and `refs/coh002/c1p-r1-0a8d` are kept as import evidence.
- **Pending:** the ONE ordinary, the FINAL, independent CORE/PRE review, and e62's own current-head CI and source FINAL. None is claimed. Any new finding or failure from the e62 CI is inherited.
- **Holds:**
  - GOV18 historical coverage is unproved, and SEC null remains UNQUALIFIED;
  - the paired push failures are unwaived;
  - Luis/EdX2C own human integration and merge;
  - RTA (source-exposed credentialed release, migration before traffic, all-producer cutover), the four native owner routes, real account and billing, deployed authorization, application acceptance, full R07, all 18 AC-04 cases, the full 134 real-app cases, and the Personal 9e owner hold;
  - Personal 9e, A3, A55 and 0103 are not included.
- **Limits of what is joined:**
  - the T3 patch stays inert;
  - B2 reports model names only, never accepted or effective settings, billing or a native installation;
  - D-C1P-1 (the positive cache-write extension) remains unqualified;
  - C2-P01 is accepted only with its six precisions, and P02 to P08 and the full C2B to C5 work and R07 are not implemented here.

## 6. Next bounded action

Root reviews this local candidate, with its EARLY and later its FINAL. No publication, push, merge to main, review request, comment, resolution, CI action, deploy, flag, account, provider or native effect is taken or implied by this handoff.

## 7. INC04-S03-CI-SQL-CLEANUP-001: ACK and plan (appended before any other edit)

Sections 1 to 6 above are unchanged from 548 and remain true as written for 548. This section and the ones after it record a separate, later, local repair candidate.

**Base.** A new, normal, signed sole child of exact `54801a654eca597e4554f3f9df067f73191700fc`:

- tree `a212b0ec90fe269a8faf07c7bad247f50b18c9f2`;
- ordered parents `[e62c4ad5, 9444df97, 0a8d036a]`;
- on its own branch and worktree, `inc04-s03-ci-sql-cleanup-001`.

e62, 9444 and 548 were imported from their supplied EARLY bundles into new private refs (`refs/intake/sqlclean-001/*`). For each bundle, SUMS and `git bundle verify` passed. FETCH_HEAD, the index and the worktrees were unchanged.

**Starting blobs, verified at 548.**

| Path | Starting blob |
|---|---|
| `apps/api/src/selection-installation.db.test.ts` | `60b16400cfcef3dba0f96c1b2e9d3148e1fb380d` (the same at af82, e62 and 548) |
| this handoff (append only; its 9974 bytes stay an exact prefix) | `462d8e8740a52d44797522f2e38f698f48436b85` |
| `docs/SOURCE_MAP.md` (append §2r; every old byte kept) | `8922b8fe51bcffa9601d9e21d7473ec3cd790337` |

**Root decision acknowledged: E62-SQL-F01.** The e62 CI job `132306277629` failed. All 13 subtests of this file printed pass, and then the file failed on an uncaught `terminating connection due to administrator command`.

- **The mechanism.** At the pinned `pg-pool` 3.14.0, `Pool.end()` resolves once its idle clients leave its own accounting, before their sockets close. The fixture then FORCE-drops its database, and the raw owner pool has no `'error'` listener.
- **What is not claimed.** Mapping the exact backend 4393 to its owner stays out of scope; it is not mapped. The old CI run stays FAILED, and this candidate does not turn it green.

**Plan.**

1. **The fix, in the test file only.** Register every pool the file owns before its first use, through the public `'connect'` event: each connected client's own `'end'` is recorded. Teardown then runs in this order: close the apps, end each pool, wait for every owned client's actual `'end'`, and only then drop the fixture database.
   - This covers all five teardowns (lines 167–171, 412–418, 493–498, 678–685, 808–815) and the API, worker and owner pools.
   - It includes clients the pool has already removed from its accounting.
   - The borrowed lock holder's `ROLLBACK` and `release` and all 13 existing assertions stay as they are.
   - Excluded: error handlers, ignoring `57P01` or messages, retries, skips, sleeps, longer timeouts, a FORCE removal, and any production, SQL, shared test-support, dependency, lock or GEN change.
2. **A minimal committed drain control in the same file.** A pool built with a test-local `Client` subclass that holds `end()` until released. It shows `Pool.end()` resolving while the owned backend is still connected, the drain waiting for the actual end, and the backend gone afterwards. The hold is always released in a `finally`.
3. **External labelled controls,** on a fresh owned PG16 on 55529:
   - the old teardown order with the hold, then a FORCE drop: the uncaught error is reproduced;
   - the new drain with the same hold: no error, and the backend census is 0 before the drop;
   - error sensitivity: an unexpected termination of an owned idle client still surfaces as uncaught.
4. **Checks:**
   - the whole changed DB file;
   - format, lint, typecheck and contracts;
   - `pnpm artifacts` (no record, since this is a test and docs change only);
   - then one signed commit, EARLY, ONE ordinary, cleanup of 55529 only, and FINAL.

## 8. CI-SQL-CLEANUP-001 results (before commit; the ONE ordinary is pending)

### 8.1 The repair: three paths

**`apps/api/src/selection-installation.db.test.ts`.**

- **Registry.** `owned(pool)` registers each pool before its first use. Through pg-pool's public `'connect'` event it keeps a promise for each connected client's own public `'end'`. `clientsEnded` awaits all of them, bounded by the file's existing `within` helper, so a client that never ends fails the teardown loudly instead of hanging. `endOwned` ends the pools and then awaits `clientsEnded`.
- **The 12 pools.** All twelve the file opens (API, worker and owner, across the five suites) are now `owned(...)`. Every teardown runs: close the apps, then `endOwned`, then the FORCE drop.
- **The upgrade suite.** It ends and drains its API and worker pools before dropping their logins through the owner, then drains the owner before dropping the database.
- **Unchanged.** The borrowed lock holder's `ROLLBACK` and `release`, the seeding helpers' awaited `Client.end()`, and all 13 existing tests and their assertions. No error listener, catch, retry, skip, sleep or production change was added, and the FORCE drop stays.
- **One new committed control (the 14th test).** A pool built with a test-local `Client` subclass whose `end()` is held. It shows three things in order:
  1. `Pool.end()` resolves while the owned backend is still connected (census 1);
  2. the drain stays pending while the end is held;
  3. after release, the drain resolves and the census is 0.

  Order: `pool.end resolved`, then `owned client ended`, then `drop may run`. The hold is always released in a `finally`.

**`docs/SOURCE_MAP.md`.** A new §2r binds the exact pinned passages relied on: pg-pool 3.14.0 `index.js`, pg 8.23.0 `lib/client.js` and `lib/connection.js`, with full-file SHA-256 and line ranges. Nothing else in the file changes.

**This handoff.** It is append-only.

### 8.2 Checks (owned PG16 on 55529, Node 24.21.0, pnpm 11.7.0, frozen install, umask 022)

| Run | Result |
|---|---|
| The whole changed DB file, on the final source with §2r in place | 14/14: the 13 existing tests plus the new fence control. 0 skipped, 0 todo, 0 cancelled |
| **External labelled control `old`** (the 548 order, with a held close) | `Pool.end()` resolved with the backend still connected (census 1). The FORCE drop then raised an uncaught `57P01 terminating connection due to administrator command` on the pool, as in e62's CI. Exit 1. |
| **External labelled control `new`** (the candidate's order, same hold) | The drain stayed pending while held (census 1). After the actual end the census was 0, then the drop; no error within the observation window. Exit 0. |
| **External labelled control `sensitivity`** (the registry in place, an unexpected termination of an owned idle client) | Still an uncaught `57P01` on the pool. Exit 1. The fence hides nothing. |
| format, lint, typecheck, contracts, build | each exit 0 |
| `pnpm artifacts` | every identity matches; no record was written |
| uid 65534 preflight | node runs and the modules import. The 0600 credential and the data directory are denied. |

A first run of the three external controls exited 1 at a harness bug: my version print asked for `pg-pool/package.json`, which that package does not export. None of those runs reached a database. They are kept as history. The controls and their raw logs live in the external packet, not in Git.

### 8.3 Not claimed

- Which client owned the e62 CI's backend 4393 is unmapped.
- The e62 CI run stays FAILED.
- This candidate's own CI, independent review and any publication are separate.
- Every hold in §5 stands.
