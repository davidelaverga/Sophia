# INC04-R07-COHERENT-004 R2 — the outside-block control owns its fixture

SAME Routing17 (`session_01FGXfrGsUA6jNm3sxRoSro2`). Stage A only, uncommitted.

- **Base and predecessor.** Base `2a5b134866257a1aadbd3eb86657fb1c74cafdcd`. Immediate predecessor: the frozen R1 tree `65cbbfcea2606ee4b520fc31bd407f7f93ed077b`, whose full DB passed (2,102 of 2,102) but whose source review stayed CHANGES_REQUIRED for C4R1-F01.
- **Scope.** Exactly two paths change relative to 65cb: `packages/persistence/src/conversation-runtime.db.test.ts` and this handoff.
  - The selection test and the R1 handoff are unchanged.
  - No production, SQL, SDK, lock, GEN, Map or record change. The 0112 financial work stays excluded.

## C4R1-F01

R1's new outside-block control (the real-PostgreSQL proof that `runtime_hello` changed outside the reviewed FENCE-HELLO block is still refused) has two gaps:

- It created its baseline database and connected its two owner clients **before** its cleanup `try`. A rejected connect skipped all cleanup, including a baseline already made and a client already connected.
- Its `finally` ended the clients and dropped the baseline **one after another**, so one rejected step skipped the rest.

No leak was observed, and no production code is involved.

## Repair

A small helper owns the fixture for that control:

- The baseline is acquired first. Each client counts as owned before its `connect()`, and the connects run inside the boundary.
- Cleanup then always attempts every owned client's `end()` (all of them settle), and only after that the baseline drop, whatever an earlier step did.
- The body's or setup's own error is rethrown unchanged. A cleanup failure is never swallowed:
  - alone, it is the error;
  - with a primary error, both are raised together, the primary first.

The control's body is unchanged: the same assertions, rollback, metadata equality, seven-function comparisons and exact restoration. The pinned FENCE-HELLO recognition and every other test are untouched.

**Two finite failure-path controls:**

- **A real rejected second connect.** The second client names a database that does not exist on the same server. PostgreSQL's own refusal surfaces, the body never runs, the first client is actually ended, and the baseline is gone.
- **A SYNTHETIC end failure** after a real end, together with a body error. Both errors are raised, the other client is still ended, and the baseline is still dropped.

## Checks and holds

- **Recorded outside the tree:** focused runs and controls on an own PostgreSQL 16 (55607), then on the frozen candidate the final serial statics, build, contracts, VERIFY, full SQL and full DB.
- **Holds.** No commit until separately assigned after acceptance. No ordinary, push, PR, CI or publication. All governance and approval holds remain.
