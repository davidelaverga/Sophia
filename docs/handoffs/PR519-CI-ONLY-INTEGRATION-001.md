# PR519-CI-ONLY-INTEGRATION-001: ordinary integration of the reviewed CI repairs on published d3e

Goal and attempt: PR519 CI-only integration, task `PR519-CI-ONLY-INTEGRATION-001`, Stage A, attempt 1. This is a staged, uncommitted integration candidate.  
Human owner / executor resource: Davide (owner); Root coordinator; SAME Routing17 Claude Code implementation worker, session `session_01FGXfrGsUA6jNm3sxRoSro2`. No new role, no alternate executor.  
Native session: none; no native, provider or account session is used.  
Starting worktree/commit: new worktree `/home/user/Sophia-pr519-ci-only-integration-001`, new branch `inc04-pr519-ci-only-integration-001`, at `08475efe7f1f0c9b017b270bae6c6cfe6974d820` (tree `a7dfe54f`), with `a89a67ed84c4be6a8ca81b31f2276f0b65f9fbdb` merged by `git merge --no-ff --no-commit`.  
Ending commit/tree and changed files: none committed in Stage A. The pending ordered merge parents are [08475efe, a89a67ed]. The staged tree and the complete delta are in the external Stage A packet.

## 1. ACK and plan (written before any check)

**Dispatch.** This is Root's explicit Stage A dispatch. Later stages, starting with the signed merge commit and the canonical ordinary, each need a separate Root dispatch.

**Inputs.**
- Context zip `870baec1…41a6`: TASK, the independent dependency review `2b77510f…`, and the Root adoption `44b9f49e…`.
- Inert preparation transport `676149df…9010`, MANIFEST `fa334c6c…6a8b`: 26 regular members, no links, all sums OK.
- Its bundle `997a3cc5…` verifies against published d3e.
- All four commits exist locally, and each raw object is byte-equal to the packet's.

| Commit | Tree | Parent |
|---|---|---|
| d3e `d3e5ba9c` (published common base; PR519 head; main `61fbe1c6`) | `be3ff5d5` | `54801a65` |
| `805523a1` | `41cf9f99` | d3e |
| `08475efe` | `a7dfe54f` | 8055 |
| `a89a67ed` | `3e5ca025` | d3e |

**History.** Ordinary and history-preserving:
- the new branch starts at 08475, which contains 8055;
- a89a is merged with no commit, so the pending ordered parents are [08475, a89a];
- d3e is the common base, not a sole parent.

There is no squash, rewrite or synthetic replacement. 7998, f05a, 302a, c15 and every C2A-specific commit are excluded: none is an ancestor, and no delta of theirs is copied.

**Lease: exactly nine incoming paths plus this handoff.** Each incoming final body and mode must equal its component's blob.

| Path | From | Blob |
|---|---|---|
| `.github/workflows/ci.yml` | 08475 | `c44e26c4` |
| `docs/SOURCE_MAP.md` | 08475 (§2t only) | `06bfeff0` |
| `docs/handoffs/PR519-CI-F2-OBSERVABILITY-001.md` | 08475 | `6f0f2dce` |
| `docs/handoffs/PR519-CI-PAIRING-REPAIR-001.md` | 08475 | `4fbe6d45` |
| `package.json` | 08475 | `d2d15d63` |
| `scripts/test-integration.mjs` | 08475 | `bc7b985f` |
| `tests/unit/ci-workflow.test.mjs` | 08475 | `e8515ca6` |
| `apps/api/src/selection-observations.db.test.ts` | a89a | `0d6a6fda` |
| `docs/handoffs/PR519-CI-F1-MIGRATION-FIXTURE-001.md` | a89a | `92d3c2d5` |

**Not changed:** SDK, GEN, IDs, migrations, UI, config, runtime identity, lock or dependencies. SOURCE_MAP §2s and C2A content are excluded; a future C2A integration retains §2s and §2t under its own lease. If a conflict or unexpected delta appears, I stop rather than edit a reviewed body. (The merge completed automatically, with 0 conflicts.)

**Checks.**
- Node 24.21.0, pnpm 11.7.0, a frozen offline install, umask 0022.
- `tests/unit/ci-workflow.test.mjs`.
- The complete four-case `apps/api/src/selection-observations.db.test.ts`, run against a NEW owned PG16 on 127.0.0.1:55557 after a fail-closed census. It uses `SOPHIA_DISPOSABLE_DATABASE_URL`, with credentials only in the child environment.
- format, type-aware lint, build, typecheck; `artifacts` verify only.
- Each check gets its real inner exit and a separately archived caller exit.
- The causal old-failure evidence stays bound to its own component bytes; nothing is rerun for metadata.

**Then:**
1. the authenticated scoped census, the positive identity control first, the canaries, the normal `pg_ctl` stop, the reap, and data and secret retained;
2. the staged-source packet;
3. **HOLD.**

**Not in Stage A:** a commit, a full ordinary, push, PR change, main merge, deploy, activation, native, provider, billing, account or voice effect.

**Known limits.** F2's original cause is UNKNOWN, and diagnostics neither fix nor exonerate it. The old CI failures stay negative and are not waived. GOV21, SEC null, Luis, RTA, the native owner, the deployed app, Personal 9e, voice, 8c with its erratum, 9ed, and the f05a retry question all remain open.

## 2. Stage A outcome and evidence (appended after every check and the focus-PG stop)

**Integration.**
- `git worktree add -b inc04-pr519-ci-only-integration-001 … 08475efe`, then `git merge --no-ff --no-commit a89a67ed`: "Automatic merge went well", with 0 conflicts.
- HEAD stays `08475efe`, and MERGE_HEAD is `a89a67ed`.
- a89a's two paths are staged as they are in a89a, and this handoff is added.
- The seven 08475 paths are already present from HEAD.
- **Nothing is committed.** The staged tree and the full inventory and delta are in the external packet.

**Checks.** Each check ran against the staged integration tree, with Node 24.21.0, pnpm 11.7.0 and umask 0022. Each line gives the inner exit, then the separately archived caller exit.

| Check | Inner / caller | Result |
|---|---|---|
| `pnpm install --frozen-lockfile --offline` | 0 / 0 | — |
| `pnpm toolchain:check`, `format:check`, `lint`, `build`, `typecheck` | 0 / 0 each | — |
| `node --test tests/unit/ci-workflow.test.mjs` | 0 / 0 | tests 28, suites 5, pass 28, fail 0, cancelled 0, skipped 0 |
| `node --test --test-concurrency=1 apps/api/src/selection-observations.db.test.ts` | 0 / 0 | the complete four cases: tests 4, suites 2, pass 4, fail 0, cancelled 0, skipped 0. Three are in "scoped readings through the real preview (0107)"; the fourth is the installation case, "answers 503 for every role without 0107, then serves from the same app once the migrator applies it". |
| `pnpm artifacts` | 0 / 0 | 8 of 8 `match`, verify only, no record |

The DB test ran against a NEW owned PG16 16.15 on 127.0.0.1:55557 (pid 1186, start ticks 27207, argv sha `7fb35b19…`, listener inode 4190), created after a fail-closed census. Afterwards the cluster held only its default databases and no login role.

**Focus PG stop.**
- Authenticated scoped census: 0 other client backends.
- Positive identity control first, then 7 wrong-identity canaries refused.
- `pg_ctl` stop rc 0, status 3; reaped; no listener, pidfile or socket.
- Data and secret retained.

**Limits.**
- No commit and no canonical ordinary `pnpm check` in Stage A; the integration suite and the full unit set were not run here.
- These are composed focused checks, not parent-check borrowing. The old component checks stay bound to their own bytes.
- F2's cause stays UNKNOWN.
- The container restarted shortly before Stage A (uptime 137 s at 19:46Z).
