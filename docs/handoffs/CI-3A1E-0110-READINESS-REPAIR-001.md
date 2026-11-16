# Implementation-session handoff

Goal and attempt: CI-3A1E-0110-READINESS-REPAIR-001 (Root79), attempt 1: the automatic review 5916589022 (P1, inline 4583163809 on `apps/api/src/app.ts` line 661) at head `3a1e3538639cf3f9afc705d572cda0b0c5746e24`.
Human owner / executor resource: Davide (owner); SAME Native1, a Claude Code implementation worker in a cloud container.
Native session: `session_01FGXfrJoUMojmJSW3H7XfoG`.
Starting worktree/commit: `/home/user/sophia-r79-0110-readiness` on `inc04-r07-0110-readiness-repair-001` at `3a1e3538…` (tree `4fa110e2…`), intake of public PR #519's head `inc04-s01b-coherent-001`.
Ending commit/tree and changed files: uncommitted. Exactly three paths: `apps/api/src/app.ts`, `apps/api/src/readiness.db.test.ts` and this file. The candidate tree (which includes this file) is recorded in the external handback.

## Outcome

`/ready` now requires migration 0110 (A58, observed call facts), whatever the switches say, as it already required 0105 and 0109.

- A database migrated only through 0109 answers 503 `schema`.
- With 0110 applied as written, the same APIs answer 200.
- Nothing of 0111 or later is required.

## The finding, verified against the exact source

The claim was: through 0109, `/ready` passes, but a qualified C2B call (`facts: observed_v1`) is refused before the provider call for want of `binding.facts`.

- `app.ts` at 3a (lines 610–617, 658–661) required 0109's `research_call_ack` and `research_call_identities`, and said "Nothing of 0110 or later is required here".
- 0110 at 3a (read for this repair) is one transaction. It:
  - adds `research_call_identities.facts_version` (`ADD COLUMN`, so 0109 cannot hold it);
  - creates `research_call_facts_version(jsonb)` (`CREATE FUNCTION`, not a replacement);
  - replaces `research_call_request` so that a tracked request's `facts: observed_v1` is kept, where 0109 ignored it;
  - replaces `research_call_ack` so that it echoes `facts` only when `facts_version = 2`.

  So **a database at 0109 never returns `binding.facts`**, whatever a reserve asks for.
- **Not re-read for this repair:** the wrapper's refusal (`bindingProblem`, `packages/dsh-bundle/src/control-bridge.ts`, blob `05a04695…`) and the runtime's qualification of the research and review routes. Those bodies are outside this task's read budget. Both remain the review's statement, consistent with the SQL contract above. They are recorded as a registered dependency, not as a fresh read.

## Decisions and changes

**States (written before the code).**

| Database | Before | After |
|---|---|---|
| through 0108 with 0105 | 503 | 503 (unchanged) |
| through 0109 | 200 (the defect) | **503 `schema`** |
| through 0110 | 200 | 200 |
| through 0112 (all) | 200 | 200 |
| through 0110 with a marker removed in the test's own synthetic database | — | 503 |

The 0043 walk, 0044 store and voice contrasts are unchanged. `/health` stays alive in every state. A failure is still `{ ready: false, reason: 'schema' }`, with no detail.

**Change.** A new `OBSERVED_FACTS_SCHEMA` holds 0110's two objects of its own: the `facts_version` column (from `pg_attribute`) and `research_call_facts_version(jsonb)`. `schemaReady` requires it as core, after 0109's `TRACKED_CALL_SCHEMA`.

**Preserved.**
- The order and every other part: 0105's atomic admission, 0109, the switches' parts, the companion check, the role-safety check and the readiness failure privacy.
- No migration, ID, contract, GEN, SDK, lock, config, SQL or UI change, and no Source Map edit (Routing17 holds the Map lease).

**Test (`readiness.db.test.ts`).** The "readiness across 0109" block now walks a realistic forward migration:
- through 0108: 503, as before;
- 0109 as written: still 503 for every switch set;
- 0110 as written: 200;
- then, in its own synthetic database only, each 0110 marker is renamed away (503) and restored (200).

## Evidence

**Toolchain and install.** Node 24.21.0, pnpm 11.7.0, `pnpm install --frozen-lockfile` against the owned store; lock `ca833c49…` unchanged.

**Static (restored final source).** Each exited 0:
- `prettier --check` on the three paths;
- `oxlint --type-aware` on `app.ts` and the test;
- `tsc --noEmit -p .` in `apps/api`.

**`readiness.db.test.ts` only** (`node --test --test-concurrency=1`), against an owned, private PostgreSQL 16.
- Every database phase ran behind an identity guard: boot, pid, argv, start, exe, cwd, pidfile, one listener and an authenticated port and data directory. Wrong-identity canaries were refused before anything ran.
- Final run: **4 tests in 2 suites, 4 pass**, 0 fail, cancelled, skipped or todo. The four tests are:
  1. through 0108 with 0105 → 503; 0109 applied → still 503; 0110 applied → 200. Five switch sets (off; API contributions; owner-runner admissions; voice qualification; conversations, inputs and a byte store), each with `/health` alive.
  2. 0110's `facts_version` column renamed away → 503, restored → 200; then `research_call_facts_version` renamed away → 503, restored → 200. The same five switch sets throughout.
  3. The existing 0043 walk, unchanged.
  4. The existing 0044 store contrast, unchanged.

**Causal controls.** Each mutated `app.ts` only, failed on an intended assertion, and was restored byte-exactly:

| Control | Mutation | Failed | First assertion |
|---|---|---|---|
| C0 | the exact 3a predicate (no 0110 requirement) | 2 of 4 | "switches off, with 0109, without 0110": actual 200, expected 503 (the reviewed defect) |
| C1 | column check dropped | 1 of 4 | "without the facts_version column" |
| C2 | function check dropped | 1 of 4 | "without research_call_facts_version" |

**Attempt history.**
- The first owned cluster (55621) passed the same 4/4 and C0–C2 before the machine restarted. Its process was lost with the boot; its normal stop is unproven, and its private data is retained untouched.
- The final run used a new owned cluster (55625), followed by one guarded normal stop: exit 0, process reaped, no pidfile, socket or listener; private data retained.
- Two automatic-check technical no-verdicts and one later boot loss each stopped work until Root resumed it. None was a denial.

## Remaining obligations

- **No commit, ordinary check, publication or thread resolution.**
- **Pending:** the SAME independent SOURCE_CORE review, then the normal commit and check workflow.
- **Source Map:** no row is needed for this repair (no new upstream file is relied on).
- **0111 and 0112:** not required by `/ready`; nothing inspected here proves they are.

## Next bounded action

Root and SAME review of this uncommitted three-path candidate; then a separately authorized commit, ordinary check and publication onto PR #519.
