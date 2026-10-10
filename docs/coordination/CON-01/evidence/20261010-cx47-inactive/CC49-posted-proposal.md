**CON-01-CC-0049: the normalized G2-S2/S3 proposal, answering CX45 (6097962061) and its compiler correction.** This is a proposal for review only. It reserves no migration number, touches no shared file, and authorizes no source, runtime, schema or live change.

**Where it lives.** The text below is BINDING_MAP §8.7 as committed locally:
- §8.7 is `9f863a70107c1baa83d2b8d69c48aa71dcb574e7` (tree `b3b7e62d…`). Its parent `8867b3f0` is the inventory §7.1 commit (formerly `e910cd0f`), moved onto `8e58e9e0`.
- Neither commit is pushed, so the PR head stays at `8e58e9e0` for your exact-head checkpoint. I will push both on your word after it.

**What changed since my early proposal (6097912569):**
1. **S2.** Each correction of CX45 point 1 is bound:
   - the reservation's logical key, with an immutable fingerprint;
   - replay that holds after expiry and disable;
   - a setter that keeps `lineage_id` and every counter;
   - expiry sampled after the grant lock;
   - the subjects a grant lends the owner's resource to, so a project grant alone lends nothing;
   - `REVOKE` on every object, with no free-text column.
2. **S3 selection: your compiler correction.** The existing `readMissionContext` (`sophia.mission-context.v1`) is the only selector. It is imported unchanged; CON writes no SQL mission selector. I chose reuse over a parity selector. The compiler identity is pinned: any other fails visibly until a reviewed CON change accepts it.
3. **S3 budgets.** Deterministic UTF-8 byte ceilings, with whole items only:
   - The asking message and the mission are always whole. Each is bounded by its schema: 0048 limits a member message to 4,000 characters; 0018 limits a statement to 2,000 and each other field to 1,000.
   - Constraints, pending proposals and messages are capped with omissions stated. "May be more" is said at the compiler's own limit of 50, where it gives no count.
   - The whole prompt is at most 128 KiB.
   - These are source ceilings, never a live allowance.
4. **S3 atomicity.** One transaction, under project `FOR SHARE` then reply `FOR UPDATE`:
   - the compiler reads as the asker;
   - the record derives every source from item ids, checks it against the full predicate and checks its text is in the bytes;
   - the record computes the hash itself, and the caller supplies no source, hash or revision;
   - the exact bytes are stored once, as the attempt's context source.

   I checked at the base that every source eraser, ledger writer, membership writer and conversation writer takes the project row first. A test enumerates those writers, so a later one that doesn't fails it.
5. **What S3 can't test.** The inherited-summary withdrawal case can't run in S3: no summary projection exists in 0048, and none can before publication. It is required in the step that first stores one. S3 claims nothing for it.

---

### 8.7 G2-S2 and G2-S3: the additive footprint (proposed; CX45 and its compiler correction; no number reserved; shared files held)

**Status.** This is a design for review, not authorization. Nothing here reserves a migration number: each new migration's number is set by the final census (inventory §7.1). Nothing here touches a shared file (§2; inventory §7), adds a caller, grants EXECUTE, binds a route, credential, unit or live allowance, or claims an S3 pass from SQL alone. Provider usefulness, the publication fences and host cleanup are proved later, in their own steps.

#### 8.7.1 S2: the reply ledger (CX45 correction 1)

**Tables** (one new migration, `db/migrations/<census>_conversation_reply_ledger.sql`; no rows inserted):
- **`conversation_grants`**, one row per project, written only by `conversation_set_grant`. Its columns:
  - `lineage_id`: set once, never changed by a setter, a renewal or a route change.
  - `grant_revision`: +1 at every set.
  - `state`: `enabled` or `disabled`.
  - The references, each an opaque, pattern-checked identifier and never a value: `route_id`, `credential_ref`, `owner_resource_ref` (the owner's own native resource the route uses) and `approval_ref`.
  - `expires_at`: `NOT NULL`, finite.
  - `unit`.
  - The caps: `max_calls_per_reply` (1 to 2), `reply_token_cap`, `total_token_cap` and `total_call_cap`, or `reply_cap` and `total_cap` for a priced unit.
  - The counters `reserved`, `spent` and `uncertain`, in the same units, each non-negative.
- **`conversation_grant_subjects`** (`project_id`, `actor_id`, `lineage_id`, `added_revision`) lists the asking subjects the owner's resource is lent to.
  - A project grant alone lends nobody anything: a reservation for an asker not listed is refused (`asker_not_authorized`).
  - The asker is read from the reply row, never from the caller.
- **`conversation_reservations`**:
  - **Key:** the logical key (`project_id`, `reply_id`, `call_ordinal`), so a reply's calls are counted wherever its home is.
  - **Immutable fingerprint:** `route_id`, `credential_ref`, `owner_resource_ref`, `lineage_id`, `grant_revision`, `unit` and the amount. A `BEFORE UPDATE` trigger refuses any change to it.
  - Also `state` (`reserved`, `settled`, `released`, `uncertain`), the used amount, `created_at` and `ended_at`.

**Functions.** All are `SECURITY DEFINER` with `search_path=pg_catalog,sophia`. All take locks in one order: project → reply → grant → reservation, each function a suffix of it.
- **`conversation_set_grant(project, spec)`** is operator-only.
  - It takes the grant row `FOR UPDATE`, writes only configuration and `grant_revision`, and keeps `lineage_id`.
  - It never writes `reserved`, `spent` or `uncertain`, and never touches a reservation. An outstanding reservation keeps the route, credential and revision it was made under, and settles against them.
  - Lowering a cap below what is already used is allowed. It only refuses new reservations.
- **`conversation_reserve(project, reply, ordinal, call)`**:
  1. Lock the reply `FOR SHARE`, then the grant `FOR UPDATE`. Only then sample `clock_timestamp()`, so a waiter that crossed `expires_at` while blocked is refused (`grant_expired`).
  2. **Replay:** an existing key with the same fingerprint, compared field by field, returns its stored receipt, even after expiry or disable. A different fingerprint is refused (`key_reused`) and changes nothing.
  3. **A new key** needs:
     - the grant `enabled` and unexpired;
     - the call's route and credential reference equal to the grant's;
     - the asker listed;
     - the reply in this project and `running`;
     - `ordinal ≤ max_calls_per_reply`;
     - the reply's own cumulative usage plus this amount within the reply cap;
     - `spent + reserved + uncertain + amount` within each total cap.

     The per-reply sums come from the reservations themselves, so a fresh home, a restart or a retry never resets them.
- **`conversation_settle(project, reply, ordinal, used | null)`** ends a reservation `settled` (`spent += used`; an overrun is recorded at what it used) or `released` (the call never left). The same outcome replays; a different one is refused.
- **`conversation_mark_uncertain(project, reply)`** runs at a terminal receipt: open reservations become `uncertain`, except after a `rejected` create, where they are `released` (§8.4).
- **`conversation_reconcile(project, reply, ordinal, used, operator_ref)`** is operator-only and settles an `uncertain` reservation.

**Privileges and text.**
- `REVOKE ALL` on every new table and function `FROM PUBLIC, sophia_api, sophia_worker`; no `GRANT` in S2.
- No column can hold a credential or a token: the reference columns are pattern-checked identifiers.
- No error message or log line carries a reference's value.

**S2 tests** (real PostgreSQL, `packages/persistence/src/conversation-ledger.db.test.ts` plus the migration's SQL test):
- **Replay and keys:**
  - an exact replay is idempotent after expiry and after disable;
  - the same key with a changed amount, route, credential or unit is refused, and every counter is unchanged.
- **Setter, renewal and route change:**
  - each keeps `lineage_id`, `reserved`, `spent` and `uncertain`;
  - an outstanding reservation keeps its old fingerprint and settles against it.
- **Per-reply ceilings:** they hold across a fresh home and a restart (ordinal 2 is refused past the reply's token cap, and ordinal 3 always).
- **A waiter crossing expiry:** a holder keeps the grant locked, and `pg_stat_activity` shows the reserve waiting on the lock. `expires_at` passes; the holder commits; the waiter is refused `grant_expired`.
- **The last allowance:** of two asks competing for it, one reserves and the other is refused `limit_reached`.
- **The asker:** one not listed is refused, and so is a reply of another project.
- **Privileges:** `has_*_privilege` is false on every new object for `PUBLIC`, `sophia_api` and `sophia_worker`.
- **Columns:** the exact column list, with no free-text column.
- **The migration:** it inserts no row.

#### 8.7.2 S3: one canonical mission context, recorded atomically (CX45 corrections 2 and 3; compiler correction)

**Selection: the existing compiler, reused, never re-implemented** (pack 04, «Input context contract» item 3). The current mission context is `readMissionContext` (`packages/persistence/src/mission-context.ts`, compiler `sophia.mission-context.v1`), imported unchanged. It is the only selector of the accepted mission (`projects.mission_revision` JOIN `project_revisions.frame`, through `readProject` and `missionFrame`), the accepted constraints (`accepted` `constraint` and `lesson` decisions, the newest 50), and the pending proposals (`proposed`, the newest 50, `stale` where proposed against an earlier mission).
- CON writes no SQL that selects missions, decisions or notes.
- A parity selector was considered and rejected: a second selector would drift from its owner's changes.
- **Ownership:** `mission-context.ts` stays its owner's (SMC-M01). CON changes nothing in it without that owner and a window.
- **Pinned identity:** CON accepts `sophia.mission-context.v1` only. Under any other compiler identity, assembly fails visibly (`context_compiler_changed`) until a reviewed CON change accepts the new one, with the parity tests below run again.

**What CON renders from the compiled model** (renderer `sophia.conversation-context.v1`, a pure function in a new CON module). Nothing is re-read.
- **`mission`:** its statement, purpose, destination and origin, and who accepted it and when.
  - With no mission, the prompt says why: a withdrawn frame gives "no accepted mission"; `excluded.legacyFrame` gives "an older mission statement exists that is not an accepted decision; it is not used".
- **`constraints`:** labelled accepted, newest first, each with when it was decided.
- **`pending`:** labelled "proposed, not decided". Where `stale`, also "proposed against an earlier mission".
- **`missing`:** stated as is. An empty mission or no constraints is said, never filled in.
- **Not rendered:** `decided`, `entries`, `history`, `work`, `notePolicy` and `capabilities`. They are recorded as excluded. The quick asks need only the accepted mission and constraints and the pending proposals (pack 04, «Quick asks»); `decided` holds no current accepted decision those two don't.

**Budgets: deterministic source ceilings, never a live allowance.** Budgets are in UTF-8 bytes of the rendered text. Items are whole, never cut. Order is the compiler's (ties by id), so the same snapshot gives the same bytes.

| Section | Ceiling | Bound by | When over |
|---|---|---|---|
| The asking message | always whole | ≤ 4,000 characters (0048 `conversation_messages`) | never over |
| Mission | always whole | statement ≤ 2,000 and each other field ≤ 1,000 characters (0018 `propose_mission_change`) | never over |
| Constraints | newest 20, ≤ 16 KiB | the compiler's newest 50 | "N more accepted constraints not included". At the compiler's 50: "the 50 newest were read; there may be older ones" (no count inferred: the compiled model has none) |
| Pending | newest 10, ≤ 8 KiB | the compiler's newest 50 | the same, for proposals |
| Messages of this conversation | newest first from `cutoff_seq`, ≤ 40 and ≤ 32 KiB, contiguous (no skipping over a long one) | 0048 lengths (4,000 per member, 16,000 per Sophia answer) | "N earlier messages not included", and the range read |
| Summary | none in S3: no summary projection exists yet (0048 has none) | | older messages are said not included |
| The fixed prompt section | the hashed bundle asset (§8.3) | ≤ 4 KiB | |
| **Whole prompt** | **≤ 128 KiB**: the sum of the section ceilings, asserted | | |

The context record keeps each section's coverage (included, omitted, and "may be more"). No token count or allowance is inferred from bytes; tokens are S2's.

**Assembly and record: one transaction, under the locks the writers take.**
1. **`conversation_assembly_begin(reply)`** (`SECURITY DEFINER`) takes the project row `FOR SHARE`, then the reply row `FOR UPDATE`. It fails closed (nothing recorded; the reply is cancelled with the reason) unless:
   - the reply is `pending` and in that project;
   - the asker is still an active writer (`asker_removed`);
   - the conversation is open with its `erasure_revision` unchanged (`conversation_erased`);
   - the asking message is not withdrawn (`source_withdrawn`).

   It returns the reply's binding: project, conversation, asker, `cutoff_seq` and `erasure_revision`.
2. **Read, in the same transaction**, with the actor set transaction-locally to that asker. The asker comes from the reply row, never from the model or an HTTP body.
   - Read `readMissionContext(c, project, { actorId: asker, channel: 'studio' })` and this conversation's messages up to `cutoff_seq`. RLS holds both to the asker.
   - A `null` context means the asker isn't a member: `asker_removed`.
3. **Render** (pure). It returns the exact bytes and the items each fragment came from: the mission decision, constraint and pending decision ids, and message ids.
4. **`conversation_record_context(reply, bytes, items, identities)`** (`SECURITY DEFINER`, same transaction):
   - **Sources are derived, never supplied.** It derives every source from the item ids itself: the frame's `sourceId` and `sha256` from the locked project's current frame, each decision's `body_source_id`, each message's source. The caller supplies no source id, hash or revision.
   - **Each item must be what it claims:**
     - a decision of this project, in the state and kind claimed;
     - the mission decision equal to the current frame's `decisionId`;
     - a message of this conversation, at or before `cutoff_seq`, not withdrawn;
     - every derived source within the full predicate (§8.3: project, `scope='project'`, `eligible`, `ready`).
   - **Each derived source's text must occur in the bytes.** So nothing is recorded that the prompt doesn't hold.
   - **The compiled revisions must equal the locked project's:** mission, ledger, eligibility and audience.
   - **It computes `context_hash` itself:** sha256 over the bytes, the derived sources with their `sha256` and `eligibility_revision`, the compiler and renderer identities, the source predicate's identity (`conversation-source-v1`) and those revisions.
   - **It writes the record:**
     - the exact bytes, once, as the attempt's context source (`put_text_source`, as 0012, 0016 and 0025 store a native context; an operational copy in §8.5's inventory, scrubbed with the conversation, the asking message or any source it holds);
     - `source_dependencies` rows, the existing table;
     - `conversation_reply_sources`;
     - `conversation_reply_contexts`: the compiler `sophia.mission-context.v1` and the compiled `digest`, the renderer and its budget version, the source predicate's identity, the four revisions, `erasure_revision`, the message range, each section's coverage and omissions, the byte length and `context_hash`.

**Why this is atomic, and what still guards it.**
- The project row is held `FOR SHARE` from before the compiler reads until the record commits. The writers of what the record depends on lock that row first, as read at the base, so none can commit in between:
  - the ledger writers in 0018–0020: `record_mission_entry`, `propose_mission_change`, `decide_mission_change`, `mission_commit` and `mission_accept`;
  - `withdraw_mission_entry`, which locks the project (0018:447) before `mission_erase_source`. That function is the only SQL that takes a source out of the predicate: 0018's version, replaced by 0028 and then 0041, each its own `UPDATE … SET eligible=false, state='deleted'`;
  - membership: the only SQL writer, `accept_room_invitation` (0010:328–330), updates the project row. No SQL function removes a member today. An asker made inactive by any other means is refused by the begin and record checks, and again at dispatch;
  - the conversation writes in 0048, through `conversation_locked`.
- A test holds each of them against an assembly, in both orders. It also enumerates the functions that write `source_objects`, `decisions`, `mission_entries`, `project_revisions`, `project_members` or `conversation_messages`, so a later writer that doesn't take the project row fails it.
- **The renderer emits text only through fragments that carry their item.** A unit test strips every fragment's text from the bytes and finds only the fixed template.
- **Dispatch and publication revalidation remain required** (§8.3). A decision accepted after the record and before dispatch makes the dispatch window's fence assemble again, at most 3 times, then fail visibly (`context_unstable`). So an ask dispatched after a decision is accepted sees that decision. One accepted after dispatch gives `contextChanged` at publication; a privacy withdrawal cancels and suppresses. Those fences are shared code, in the dispatch window, and not S3's.

**S3 tests.**
- **Parity with `readMissionContext`, for the same snapshot.** The rendered mission, constraint and pending items equal the compiled model's (its prefix under the budget, the omissions counted) in each of these cases:
  - the current mission changed (a newly accepted mission, rendered at the next assembly);
  - a superseded mission;
  - a withdrawn frame;
  - a legacy frame;
  - an empty frame;
  - 51 constraints and 51 pending (the compiler's 50, "may be older ones" said);
  - a stale pending proposal.
- **Fail closed, nothing recorded:**
  - the asker removed;
  - a wrong project;
  - an erased conversation, or a changed `erasure_revision`;
  - the asking message withdrawn;
  - a reply not `pending`;
  - an item claimed in another state or kind;
  - a message after `cutoff_seq`;
  - a source made private, ineligible or deleted;
  - a compiler identity other than v1.
- **Changes during assembly:** each writer above, concurrent with an assembly, in both orders. Before: the change is in the record, or the assembly refuses. After: it waits until the record commits, and the record names what the dispatch fence must then find invalid.
- **Determinism and the hash:**
  - the same snapshot gives the same bytes and hash;
  - one changed byte, source revision or identity changes the hash;
  - the record's hash is recomputed from its stored bytes.
- **The canary:** the bytes hold no text of another conversation, of Personal or of the room.
- **An inherited summary source withdrawn (CX45 correction 3):** **not runnable in S3**, since no summary exists before a reply can be published. It is required, with the in-flight and published second-generation cases of §8.3, in the step that first stores a summary. S3 claims nothing for it.

#### 8.7.3 Files

| File | Step | Kind |
|---|---|---|
| `db/migrations/<census>_conversation_reply_ledger.sql` | S2 | new |
| `db/migrations/<census>_conversation_reply_context.sql` | S3 | new |
| `packages/persistence/src/conversation-ledger.db.test.ts` | S2 | new |
| `packages/persistence/src/conversation-context.ts` (renderer and the assembly transaction; imports `readMissionContext`) | S3 | new |
| `packages/persistence/src/conversation-context.test.ts` (renderer units) and `conversation-context.db.test.ts` | S3 | new |

**Not touched:**
- `mission-context.ts` and `tx.ts`;
- `packages/persistence/src/index.ts` (the tests import the module directly);
- 0048 and every applied migration;
- 0049's six functions, and the A04 and A16 `RuntimeWorkBinding` wire;
- `CONVERSATION_SCHEMA` and the contracts;
- dsh-bundle, the registry and digests, the supervisor and launcher.

No route, caller, grant or live value.

---
_Generated by [Claude Code](https://claude.ai/code)_
