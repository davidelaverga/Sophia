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
