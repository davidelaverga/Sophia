# INC04-R07-COHERENT-004 R1 — the two full-DB crossings, repaired without weakening their contracts

SAME Routing17 (`session_01FGXfrGsUA6jNm3sxRoSro2`). Stage A only, uncommitted.

- **Base.** `2a5b134866257a1aadbd3eb86657fb1c74cafdcd` (tree `55e0e275a86e3df5eebfa2289814d0c2c097a2ec`), which stays immutable failed history.
- **The failure being repaired.** The full DB profile on 2a5b ran 2,099 tests; 2 failed, both in existing tests that the composed changes crossed. That run is the fail-before.
- **Scope.** Exactly three paths: the two test files and this handoff. No production app, SQL, SDK, lock, GEN, Map, flag or record change. The 0112 financial work stays excluded.

## F1 — `apps/api/src/selection-installation.db.test.ts`

**The crossing.**
- The readiness repair (72ee) made migration 0109 unconditional for `/ready`: `TRACKED_CALL_SCHEMA`, after 0105.
- The F02 prefix "with 0104 and 0105, without 0106" is the migrations before 0106, so it has no 0109. It still expected `/ready` 200 with contributions off.
- On this source, that database is not ready on or off.

**Repair.**
- That prefix now expects 503 off, and the message names the cause: no 0109.
- Every other assertion of the loop stays as it was: refusal before SQL with no account, idempotency or command write; off 404; the preview refused. The comments are corrected.
- The optional-0106 intent is proven separately by a new case on a real full current schema: every migration as written, so 0105 and 0109 are present.
  - As the owner, only `sophia.selection_viewer_boundary_0106()` is dropped. That private marker is exactly what `/ready` and the contribution routes check for 0106 (`SELECTION_VIEWER_BOUNDARY`).
  - Everything else 0106 installed, including its replaced `selection_snapshot`, is still there. So this is "0106's readiness marker absent", not "every 0106 object absent".
  - The case proves the catalog first: the 0109 function and table are present, 0105's atomic admission is installed, and the marker is absent.
  - Then on the same schema: off 200, on 503, `/health` 200 unchanged; the contribution routes refuse before their SQL with no write; off 404; the preview refused.
- Nothing fakes 0109, and readiness is not loosened.

## F2 — `packages/persistence/src/conversation-runtime.db.test.ts`

**The crossing.**
- 0111 (the C3 fence, `d98e01b1`) redefines `sophia.runtime_hello` with three new lines directly after its project wait: the `-- 0111 FENCE-HELLO` comment, a re-read of the runtime instance, and the revoked refusal.
- The seven-function guard knew only the CON, RETIRE and S02A-FUND insertions.

**Repair.**
- The guard now recognizes ONLY that exact reviewed block in `runtime_hello`.
  - Its literal bytes are pinned, with their SHA-256 asserted.
  - It must appear exactly once, directly after its anchor line.
  - A missing, duplicate, moved or altered block is refused rather than stripped.
- All seven comparisons, ACL, security, config and owner, and every older insertion are unchanged. No baseline, hash or exemption changed.
- **New cases:**
  - Definitions derived from the real catalog, with the block removed, doubled, moved or altered, are each refused.
  - A real PostgreSQL control changes `runtime_hello` outside the block, inside an owner transaction, keeping its owner, ACL, security and config. The block is still recognized, but the guard rejects the body. After rollback, the exact original identity and a passing guard are verified.
- The unchanged 16-case fence suite runs in the full DB profile.

## Checks and holds

- **Recorded outside the tree:** exact toolchain, own private store, own PostgreSQL 16 on 55597, focused crossings and controls, then the final serial statics, build, VERIFY, full SQL and full DB on the frozen candidate.
- **Holds.** No commit until separately assigned. No ordinary, push, PR, CI or publication. All governance and approval holds remain.
