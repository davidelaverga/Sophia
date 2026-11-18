# INC04-R07-COHERENT-009-001: attempt 1

Goal and attempt: INC04-R07-COHERENT-009-001, attempt 1 (Root121, StageA). A LOCAL integration composing three
components and testing their composition. It is not INC-04 product acceptance.

- the W1 capacity-exposure custody and restrictive preview (Native `9dfeba7f`, tree `900e05aa`);
- the pure equivalent-tie repair (Root120 tree `3f5d3dc6`);
- the published C2 dimension-bound core and 0094 registry (`90a0af7e`).

Human owner / executor resource: Davide (repository owner); a Claude Code cloud session (Routing17,
`https://claude.ai/code/session_01FGXfrGsUA6jNm3sxRoSro2`) as integration worker.  
Native session: not applicable to this session. The Native component was committed by Native1 (its own trailer).  
Starting worktree/commit: new `/home/user/sophia-r121-coherent-009` on new `refs/heads/inc04-r07-coherent-009-001` at
`90a0af7eb3d4d376e9a0d63c0e05def18ee79b36` (tree `c2c2b887`).

- **Merge:** `git merge --no-ff --no-commit 9dfeba7f96ece540f904dfe3ac58adb988140148`, with prospective ordered parents
  `[90a0af7e, 9dfeba7f]`. It merged with no conflict (staged tree `178804c5`, exactly the Native 17 paths).
- **Intake:** `9dfe` arrived through a normal bundle fetch into `refs/heads/inc04-r07-w1-9dfe-intake-001`, with
  receiver closure verified.

Ending commit/tree and changed files: an UNCOMMITTED StageA tree. See Evidence.

## States, before the tests change

### Composition

- **Native 17 paths, exact from `9dfe`:**
  - the W1 adapter, its unit and HTTP tests;
  - migration 0114 and its SQL test;
  - the custody wrapper, its DB test and the CLI;
  - the snapshot and the preview route;
  - `app.ts`, readiness and the indexes;
  - the plan and handoff.
- **Pure 4 paths, exact Root120 bodies:**
  - `capacity-exposure.ts` (`d0d082fe`) and its test (`8ed9d4dc`);
  - the plan and the handoff.
- **Integration-owned paths:**
  - `apps/api/src/selection-exposure.db.test.ts` gets new HTTP regressions;
  - `docs/DESTINATION_MAP.md` gets the deferred rows;
  - this handoff is added.
- **Nothing else changes:** no application, runtime, contract, GEN, 0115, lock or artifact-record edit.

### What the new HTTP regressions must show (derived from the code, not yet run)

- **Why the pure fix should reach W1:**
  - W1's `windowVerdict` sends a `tie_bounded` reconciliation to `unproven`; it is `exhausted` only when the bounded
    ceiling is at most 0.
  - For a `known` tie it re-projects only the designated current reading.
  - With the old pure signature, a consumed tie between a complete reading and one with missing q was `known`. When the
    complete reading was the designated one, W1 then answered **unchanged**, and the preview admitted.
- **Expected outcomes**, each on the real preview through `buildApp`, the API role and PostgreSQL, with controlled
  synthetic identities, in a database of their own:

| Tie | Designated reading | Expected W1 outcome | Expected HTTP limitation |
| --- | --- | --- | --- |
| Consumed: q 0 against missing q | the complete one | unproven (`incomparable_tie`) | `not_verified`, `capacity_unproven` |
| Consumed: q 0 against missing q | the incomplete one | unproven | `not_verified` |
| Remaining: q 1000 against missing q, one open so-far 1000 effect | the complete one | unproven (`incomparable_tie`) | `not_verified` |
| Consumed: both q 0, identical projections | either | unchanged | `eligible` |

- **Arrangements:** the consumed mixed tie runs over both recorded orders and is repeated until both lexical id orders
  have occurred. A missing q is never 0: if it were, the two readings would be identical and the tie `known`.
- **Causal control:** only the old five-field signature, restored into `capacity-exposure.ts`. It must make the
  designated-complete consumed tie answer `eligible` and so fail the new HTTP assertion. Then the exact final source is
  restored.

### Composed checks

- **Toolchain and build:** Node 24.21.0, pnpm 11.7.0, one frozen install with the lock unchanged; format, type-aware
  lint and typecheck; the necessary build; all 8 artifact identities VERIFY, without recording.
- **Database:** a new owned PostgreSQL 16 on 55645, after two free censuses.
  - The full SQL corpus: every migration in order, including 0113 then 0114 (113 expected), and every SQL test (26
    expected).
  - The full DB corpus.
  - Expected counts are estimates, not evidence.
- **0110:** the `db/tests/0110` body stays closed to reading; the normal runner may execute it.

### Old negatives and limits that stay

- **Native:**
  - focused checks only, which excluded 0113;
  - signer trust UNKNOWN;
  - the fixture, foreign-key and role exceptions;
  - the C5 temporary-mutation scope exception;
  - the sampler limits;
  - the old unproven stop of 55621.
- **Pure:** strict arrays can conservatively restrict ties.
- **Provenance:** C007-PROV-F01 (`8e323389`, `b871a6ac`) and R112-E01.
- **Root110:** the global listener state is UNKNOWN.

## Evidence

Completed after the checks; every physical run bound the states-first version of this file (blob `1086065f`).

- **Intake:**
  - `git bundle verify` 0 against `b871`, then ONE fetch, rc 0, into the intake ref.
  - The raw commit recomputes to `9dfe`.
  - The inventory has 4309 leaves, equal to the supplied one; 17 of 17 pins match.
  - The range has 35 objects, equal to the expected set; the full closure has 0 missing.
- **Merge:** rc 0, no conflict. The staged tree `178804c5` (4319 leaves) is exactly the Native 17 paths, each with the
  `9dfe` blob.
- **Pure bodies:** the four were copied from their exact blobs; all four pins match.
- **New HTTP regressions:** three tests in their own database.
  - Prettier, type-aware lint and typecheck pass.
  - The first lint run refused one test at complexity 14. Its checks moved into a helper (`knownConsumed`).
- **Map:** five rows were appended (source only, inactive, no live qualification); the map test passes 3 of 3.
- **Statics:** one frozen install (lock `ca833c49` unchanged). Toolchain, format, repo-wide type-aware lint, build,
  typecheck and contracts all exit 0.
  - **`pnpm artifacts`: 8 of 8 match**, 0 mismatch, nothing recorded.
  - **`pnpm test` (the full unit glob): 5621 tests, 5554 pass, 0 fail, 67 counted skips.**
- **Owned PostgreSQL 16 on 55645:**
  - Two censuses found it free; postmaster pid 11059, start ticks 84619.
  - 8 of 8 auth and census expectations held, with stderr retained.
  - The positive identity check ran first; four wrong-identity canaries each returned 70.
  - The exit-7 canary's own handle exported 7 (inner 7, caller 7).

| Run (all inner / caller / tool) | Result |
| --- | --- |
| HTTP file, fixed source (0/0/0) | 12 of 12: the 9 existing W1 tests and the 3 new ones |
| HTTP file, **old signature only** (1/1/1) | **2 fail**. The designated-complete consumed tie answered `eligible` (expected `not_verified`): the old pure module admitted it through W1. The remaining tie fails on the server-side reason. The identical positive passes |
| HTTP file, exact final source restored (0/0/0) | 12 of 12 |
| Full SQL (0/0/0) | **113 migrations** in order (…0112, 0113, 0114); **26 of 26** SQL test files |
| Full DB (0/0/0) | **2187 tests, 565 suites, 2187 pass**, 0 fail, 0 cancelled, 0 counted skips |

- **Full DB coverage:** readiness, C2, W1 0114, before/after 0114 and the new coherent-009 suite pass. Five suites were
  omitted whole: four Q13/0084 owned-cluster suites and the scale probe.
- **Not displayed:** `db/tests/0110` ran in the full SQL corpus; its body was never displayed.
- **Stop:** readers absent, 0 client backends, canaries 70. ONE guarded stop: inner 0, caller 0; status 3. Reaped on poll
  3. Listener and Unix socket 0; socket file and pidfile absent. Data, logs and secrets are retained.
- **Resources:** 814 samples, 0 unknown, 0 guard events. Minimum available space 26.46 GB. `/tmp/sophia-*` grew to 285,
  retained.

## Remaining obligations

- SAME whole-candidate source review of this composition.
- Then, under separate dispatch, a merge commit and one fresh cold ordinary check.
- Host81's 0115/A59 runtime wiring is not included.
- All GOV, current-CI, Luis, RTA, Personal 9e, 8c default-off and erratum, 9ed, native, deployed-authorization and
  application holds remain.
- D1 is disabled and VoiceLab USER-SUSPENDED.

## Next bounded action

HOLD for SAME whole source review of the StageA tree.
