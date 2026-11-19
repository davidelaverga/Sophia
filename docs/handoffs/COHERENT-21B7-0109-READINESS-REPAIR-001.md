# COHERENT-21B7-0109-READINESS-REPAIR-001: /ready requires 0109's tracked-call boundary

Session: SAME Routing17, `session_01FGXfrGsUA6jNm3sxRoSro2`.
Worktree `/home/user/Sophia-r07-readiness-0109-001`, new branch `inc04-r07-readiness-0109-001`, from published PR519 head `21b7c83f21d6aa6191d7f3bc561bac75bc25ed5b` (tree `e6726f1636718b0f9d7e65a86b89bb6d82fec6f0`), which stays unchanged.
Stage A only: no commit. Commit, ordinary and publication are later, separate Root grants.

## 1. ACK and plan (written before any code or test edit)

**The finding.** Automatic review 5911393845, comment 4578920073 (P1), at `apps/api/src/app.ts:648` on 21b7.

- `/ready` requires the core schema and 0105, but nothing of 0109.
- On a database migrated through 0108 with 0105, this API therefore reports ready.
- Yet every maintained model-call wrapper now sends a `tracked_v1` reserve and refuses a reply without its `binding`. Only 0109 adds that binding: `research_call_ack`, which `research_call_reply` folds into the reserve reply.
- The research and runtime routes are served whatever the switches say, so all those calls would be refused on an instance that says it is ready.

**Source facts.**

- `schemaReady` (app.ts) checks `REQUIRED_SCHEMA` and `ATOMIC_ADMISSION_SCHEMA` (0105) unconditionally, and the other parts only when their switch is on.
- `db/migrations/0109_research_call_evidence.sql` is one transaction (`BEGIN` … `COMMIT`). It creates `sophia.research_call_ack(uuid,uuid)` and the table `sophia.research_call_identities` that function reads.
- The reserve wrappers that 0109 replaces return the binding through those objects. Their presence therefore marks exactly that 0109 is installed.

**Repair (exactly three paths).**

1. **`apps/api/src/app.ts`.** A `TRACKED_CALL_SCHEMA` predicate (those two catalog lookups, each false when missing) is required unconditionally, right after the 0105 part. A missing 0109 answers the usual 503 `{ready:false, reason:'schema'}`.
   - Unchanged: `/health`, the other parts, the switches, auth, `checkRoleSafety`, routes and contracts.
   - Nothing of 0110 or later is required. This does not qualify the separate SDK producer.
2. **`apps/api/src/readiness.db.test.ts`.** A new case on its own disposable database: every migration before 0109, as written (all core through 0108, 0105 included).
   - Before 0109: `/ready` is 503 schema with the switches off and with each applicable switch on (API contributions, owner-runner admissions, voice qualification, conversations with a byte store), and `/health` stays 200.
   - Then 0109 is applied as written, and the same APIs are ready. No reservation, provider or model call is made.
   - Every existing case is unchanged.
3. **This handoff.**

**Checks, recorded outside the tree.**

- Toolchain: Node 24.21.0, pnpm 11.7.0, umask 022.
- A fail-before of the new case against 21b7's app.ts, the candidate passing, and a mutant without only the 0109 part failing the same assertion.
- `pnpm format:check`, `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test` and `pnpm artifacts` (VERIFY).
- The entire readiness DB file, serially, on an own disposable PostgreSQL 16 (127.0.0.1:55579), stopped afterwards with a guarded normal stop.

**Not in Stage A.** No migration, amendment, GEN, SDK, Map, record, dependency, profile, flag, route or payer change. No `pnpm check`, commit, publication, PR action, bot or CI action. All approval holds remain.

## 2. What changed

**`apps/api/src/app.ts` (+13).**

- A `TRACKED_CALL_SCHEMA` constant: `to_regprocedure('sophia.research_call_ack(uuid,uuid)')` and `to_regclass('sophia.research_call_identities')`, both present.
- `schemaReady` requires it unconditionally, right after the 0105 part.
- A missing 0109 now answers 503 `{ready:false, reason:'schema'}`.
- Nothing else in readiness, `/health`, the routes or the switches changed.

**`apps/api/src/readiness.db.test.ts` (+74).**

- A new `describe('readiness across 0109')` with its own disposable database: every migration before 0109, as written.
- It runs before the 0043 walk. Its database installs 0070, and 0070 refuses a second installation in the cluster while another database holds one. So it is made and dropped while the file's own database is still at 0042.
- Before 0109, `/ready` is 503 schema with the switches off, and with API contributions, owner-runner admissions, voice qualification, and conversations with inputs and a byte store each on. `/health` stays 200.
- After 0109 is applied as written, each of them is ready.
- The existing 0043 walk and the 0044 store case are unchanged.

The checks on this candidate are recorded outside the tree, with their commands, exits and executed file hashes: the fail-before against 21b7's app.ts, the mutant without only the 0109 part, the static checks, unit, VERIFY, the whole readiness DB file, and the cluster's lifecycle.

## 3. Results (Stage A, 15 November 2026 UTC)

Every final check below ran serially on the same executed files: `app.ts` sha256 `51e28e87…`, `readiness.db.test.ts` `3b175a8c…`, this handoff `ba6db9fd…`, identical before and after each run. Only this section was appended afterwards.

| Check | Result |
| --- | --- |
| `pnpm format:check`, `pnpm lint`, `pnpm build`, `pnpm typecheck` | exit 0 |
| `pnpm test` (whole unit profile) | 5,313 passed of 5,380, 67 skipped, 0 failed or cancelled |
| `pnpm artifacts` (VERIFY only) | 8 of 8 identities match, nothing recorded |
| Entire `readiness.db.test.ts` on own PG 16 at 55579 | 3 of 3 passed, 0 skipped |

**Causal controls (entire file, same test).**

- With 21b7's `app.ts`, the new case fails: "switches off, without 0109" is 200 `{ready:true}` instead of 503 schema. Both existing cases pass.
- The mutant that removes only the 0109 part fails at the same assertion.
- The candidate passes.

**Retained earlier attempts.**

- The first `pnpm lint` failed on the new test. A shadowed `pool` and a helper inside the describe were repaired without changing any assertion.
- The first entire-file run cancelled the new case in its setup. 0070 refused a second installation while the 0043 walk's database held one, so the new describe now runs before that walk.
- The earlier name-filtered fail-before and mutant runs gave the same failure.

The cluster was stopped normally, guarded by identity. Its data and secrets are retained.
