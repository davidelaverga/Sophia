**CON-01-CC-0051: §8.7 revised for your five gaps in the review of CC-0049.** This is still a proposal: no migration number, shared file, caller, grant, or schema or runtime change. Schema finalization stays held for your review.

**Where it lives.** Locally, `fdd8382110e30081c56fce4efd4c9be9b507426d` (tree `9fc83d4a…`) on top of `73b41f93` (CC-0049's §8.7) and `8b72d7cc` (inventory §7.1). All three are moved, unchanged in content, onto the held head `ca6a0a61`. None is pushed; the feature head stays at `ca6a0a61`.

| Gap | What is now bound |
|---|---|
| (1) Message provenance and the context copy | **Message provenance.** `conversation_reply_messages` (reply, assembly, `message_id`, `seq`, sha256 of the body as read), plus the range and `erasure_revision`. 0048's messages have no source object.<br>**The copy.** The exact bytes are the record's own `body` column, not a source object; `source_dependencies` scrubs nothing derived, and 0041's `mission_erase_source` deletes only the source it names.<br>**The scrub.** Two additive `AFTER` triggers. One fires on a message `body` going `NULL`, which covers withdrawal and `erase_conversation` (0048:388). The other fires on a source leaving the predicate, or deleted. Each scrubs `body` and keeps the hash and ids.<br>**S3 tests:** author and admin withdrawal, conversation erase, and `withdraw_mission_entry`, each with a byte search of the record tables. Only the inherited summary stays deferred |
| (2) Order | The compiled lists are reversed to newest first (`created_at DESC, id DESC`) before the newest 20 or 10. Test: 51 items, some sharing a `created_at` |
| (3) Ledger | **Units:** `unit` is fixed per lineage, by trigger; a setter naming another unit is refused. `conversation_new_lineage` starts a lineage only with nothing `reserved` or `uncertain`, and the old lineage keeps its counters. A state table is bound.<br>**Replay:** compared with the stored original fingerprint, never the current `grant_revision`.<br>**Ordinals:** `CHECK 1..2` and ≤ max; a key that ended only replays, and none is ever reused (`calls_exhausted`) |
| (4) RLS, authority, verification | **Role:** a `NOLOGIN` `sophia_conversation_assembler`, a member of `sophia_api` (for its grants and RLS), not `BYPASSRLS`, owning nothing. It is the only grantee of begin and record, and no login role is a member in S3.<br>**Transaction:** `REPEATABLE READ` read-write, then `SET LOCAL ROLE`. `conversation-context.ts` opens it; `tx.ts` is unchanged.<br>**Verification:** exact fragments. The bytes are the fragments concatenated; templates are pinned per renderer version; an item is a pinned prefix, its exact database values and a pinned suffix. Seven forgery tests.<br>**Open for your review:** membership lends the role `sophia_api`'s write grants too, while policies of its own would edit others' RLS |
| (5) Atomicity | **The census:** the public entry points that lock the project, as distinct from the helpers. A census test covers every function granted to the API or worker roles that writes the listed tables.<br>**Membership revocation:** a future removal must lock the project `FOR UPDATE` and bump `audience_revision`.<br>**Post-lock rereads** in begin.<br>**Unknown commit:** an undispatched record whose revisions still hold is returned, else superseded and scrubbed. The record replays on the same `(reply, assembly, context_hash)` |

---

### 8.7 G2-S2 and G2-S3: the additive footprint (proposed; CX45, its compiler correction and the CC-0049 review; no number reserved; shared files held)

**Status.** This is a design for review, not authorization. Nothing here reserves a migration number: each new migration's number is set by the final census (inventory §7.1). Nothing here touches a shared file (§2; inventory §7), adds a caller, grants EXECUTE, binds a route, credential, unit or live allowance, or claims an S3 pass from SQL alone. Provider usefulness, the publication fences and host cleanup are proved later, in their own steps.

#### 8.7.1 S2: the reply ledger (CX45 correction 1)

**Tables** (one new migration, `db/migrations/<census>_conversation_reply_ledger.sql`; no rows inserted):
- **`conversation_grants`**: one row per project and lineage (`project_id`, `lineage_id`), at most one of them `current` (a partial unique index). Written only by the operator functions below. Its columns:
  - `lineage_id`: the allowance's identity. A setter, a renewal or a route change keeps it.
  - `unit`: fixed for the lineage. A trigger refuses any change to it. The counters and caps are in that unit only, so a priced amount is never added to a call or token count. A different unit is a new lineage (below).
  - `grant_revision`: +1 at every set.
  - `state`: `enabled` or `disabled`.
  - The references, each an opaque, pattern-checked identifier and never a value: `route_id`, `credential_ref`, `owner_resource_ref` (the owner's own native resource the route uses) and `approval_ref`.
  - `expires_at`: `NOT NULL`, finite.
  - The caps: `max_calls_per_reply` (1 to 2), `reply_token_cap`, `total_token_cap` and `total_call_cap`, or `reply_cap` and `total_cap` for a priced unit.
  - The counters `reserved`, `spent` and `uncertain`, in the lineage's unit, each non-negative. A lineage that is no longer current keeps its counters as they are.
- **`conversation_grant_subjects`** (`project_id`, `actor_id`, `lineage_id`, `added_revision`) lists the asking subjects the owner's resource is lent to.
  - A project grant alone lends nobody anything: a reservation for an asker not listed is refused (`asker_not_authorized`).
  - The asker is read from the reply row, never from the caller.
- **`conversation_reservations`**:
  - **Key:** the logical key (`project_id`, `reply_id`, `call_ordinal`), so a reply's calls are counted wherever its home is. `call_ordinal` is `CHECK BETWEEN 1 AND 2`, and at most the lineage's `max_calls_per_reply` when reserved.
  - **Immutable fingerprint:** `route_id`, `credential_ref`, `owner_resource_ref`, `lineage_id`, `grant_revision`, `unit` and the amount. A `BEFORE UPDATE` trigger refuses any change to it.
  - Also `state` (`reserved`, `settled`, `released`, `uncertain`), the used amount, `created_at` and `ended_at`.

**Functions.** All are `SECURITY DEFINER` with `search_path=pg_catalog,sophia`. All take locks in one order: project → reply → grant → reservation, each function a suffix of it.
- **`conversation_set_grant(project, spec)`** is operator-only and changes the current lineage.
  - It takes the grant row `FOR UPDATE`, writes only configuration and `grant_revision`, and keeps `lineage_id` and `unit`. A spec naming another unit is refused (`unit_is_fixed`).
  - It never writes `reserved`, `spent` or `uncertain`, and never touches a reservation. An outstanding reservation keeps the route, credential and revision it was made under, and settles against them.
  - Lowering a cap below what is already used is allowed. It only refuses new reservations.
- **`conversation_new_lineage(project, spec)`** is operator-only, with a new `approval_ref`. It starts a lineage in a unit of its own, and only when the current lineage has no reservation `reserved` or `uncertain`, so nothing outstanding is reassociated. The old lineage stays with its counters, no longer current. Nothing converts one unit into another.
- **The states:**

  | From | To | By | What happens |
  |---|---|---|---|
  | `enabled` | `disabled` | setter | no new reservation |
  | `disabled` | `enabled` | setter | only with `expires_at` still ahead |
  | any | the same, renewed | setter (a later `expires_at`) | same lineage, `grant_revision` + 1 |
  | any | the same, route changed | setter | outstanding reservations keep their fingerprint |
  | current lineage | closed | `conversation_new_lineage` | only with nothing outstanding |

  "Expired" is not a stored state: it is read at each reserve, after the lock. Settle, mark-uncertain, reconcile and replay work in every state.
- **`conversation_reserve(project, reply, ordinal, call)`**:
  1. Lock the reply `FOR SHARE`, then the grant `FOR UPDATE`. Only then sample `clock_timestamp()`, so a waiter that crossed `expires_at` while blocked is refused (`grant_expired`).
  2. **Replay:** for an existing key, the call is compared field by field with the stored original fingerprint (`route_id`, `credential_ref`, `owner_resource_ref`, `lineage_id`, `unit`, amount). The stored `grant_revision` stays as it was; the grant's current revision is not compared, so a renewal or a route change since doesn't break a replay. An equal call returns the stored receipt in its current state (reserved, settled, released or uncertain), even after expiry or disable. A different one is refused (`key_reused`) and changes nothing.
     - **No logical call is used twice.** A key that ended (settled, released or uncertain) only replays its receipt. A further call takes the next ordinal, and past the lineage's `max_calls_per_reply` it is refused (`calls_exhausted`). After an uncertain call, its ordinal is never reused.
  3. **A new key** needs:
     - the current lineage `enabled` and unexpired;
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
  - each keeps `lineage_id`, `unit`, `reserved`, `spent` and `uncertain`;
  - a spec naming another unit is refused;
  - an outstanding reservation keeps its old fingerprint and settles against it;
  - an exact replay after a renewal returns the original receipt, with its original `grant_revision`.
- **A new lineage:**
  - it is refused while a reservation is `reserved` or `uncertain`;
  - started after everything settled, it keeps the old lineage's counters as they were;
  - no amount crosses units.
- **Ordinals:**
  - 0 and 3 are refused by the check;
  - past `max_calls_per_reply`, `calls_exhausted`;
  - a released or uncertain key replays and is never reserved again.
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

**Budgets: deterministic source ceilings, never a live allowance.** Budgets are in UTF-8 bytes of the rendered text. Items are whole, never cut.

**Order.** `readDecisions` selects the newest 50 by `created_at DESC, id DESC`, then returns them ascending (`created_at, id`). CON reverses each compiled list to newest first (`created_at DESC, id DESC`, so ties are broken by id) before taking the newest 20 or 10. So the same snapshot gives the same bytes.

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

**Role and transaction.**
- **The role:** assembly runs as `sophia_conversation_assembler`, a `NOLOGIN` role created by S3's migration.
  - It is a member of `sophia_api`, for its `SELECT` grants and its RLS policies. It is not `BYPASSRLS` and owns no table, so RLS applies to every read the compiler makes.
  - It is the only grantee of `EXECUTE` on `conversation_assembly_begin` and `conversation_record_context`. In S3, no login role is a member of it, so there is no caller.
  - **Its cost, open for your review:** membership in `sophia_api` also lends it that role's `EXECUTE` grants, writes included. The alternative, RLS policies of its own on the compiled tables, edits other owners' policies, a shared edit, so it is not proposed here.
- **The transaction:** `BEGIN ISOLATION LEVEL REPEATABLE READ`, read-write, then `SET LOCAL ROLE sophia_conversation_assembler`. It is one snapshot, as the compiler assumes ("one connection, one REPEATABLE READ snapshot").
  - `conversation-context.ts` opens it itself. `tx.ts`'s `withActor` can't: its read mode is read-only, and it sets the actor before the first statement. `tx.ts` is unchanged.
  - Its first snapshot-taking statement is `conversation_assembly_begin`.
  - The actor is then set transaction-locally to the asker the begin returned.
  - A writer that committed between the snapshot and the lock makes the lock fail with `40001`. The assembly is retried, at most 3 times in all, then the reply fails visibly (`context_unstable`).
- **Tests check the role itself:**
  - `rolbypassrls` is false;
  - it owns none of the compiled tables;
  - a non-member actor reads a `null` context through it;
  - a login role that isn't its member is refused `EXECUTE`.

1. **`conversation_assembly_begin(reply)`** (`SECURITY DEFINER`) takes the project row `FOR SHARE`, then the reply row `FOR UPDATE`.
   - **Post-lock rereads:** after both locks are held, it reads again everything it decides on: the reply's state and project, the asker's active membership, the conversation's state and `erasure_revision`, and the asking message. It never decides on a value read before the locks.
   - **A record whose commit outcome wasn't known:** if the reply already has an undispatched record whose revisions still equal the project's, it returns that record and doesn't assemble again. If the revisions don't match, the record is marked `superseded` and its body scrubbed, and a new assembly follows. That counts toward the 3.
   - It fails closed (nothing recorded; the reply is cancelled with the reason) unless:
     - the reply is `pending` and in that project;
     - the asker is still an active writer (`asker_removed`);
     - the conversation is open with its `erasure_revision` unchanged (`conversation_erased`);
     - the asking message is not withdrawn (`source_withdrawn`).
   - It returns the reply's binding: project, conversation, asker, `cutoff_seq`, `erasure_revision` and the assembly number.
2. **Read, in the same transaction**, with the actor set transaction-locally to that asker. The asker comes from the reply row, never from the model or an HTTP body.
   - Read `readMissionContext(c, project, { actorId: asker, channel: 'studio' })` and this conversation's messages up to `cutoff_seq`. RLS holds both to the asker.
   - A `null` context means the asker isn't a member: `asker_removed`.
3. **Render** (pure). It returns the bytes and their ordered fragments. Each fragment is either a pinned template (by id) or one item: the mission decision, a constraint or pending decision, or a message, with the item's text as rendered.
4. **`conversation_record_context(reply, assembly, bytes, fragments, identities)`** (`SECURITY DEFINER`, same transaction):
   - **Exact fragment verification, not substring presence.**
     - **The bytes:** they must equal the fragments concatenated, every byte accounted for.
     - **A template fragment:** its text must equal the pinned string for that renderer version. The strings are stored in the migration, so any template change is a new renderer version.
     - **An item fragment:** its text must equal a pinned prefix for its kind, then the item's exact values read from the database under the locks, then a pinned suffix. The values are a decision's statement (with purpose, destination and origin for the mission), a message's body and author's name, and decided or sent times, written as `to_char(… AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`, which is JavaScript's `toISOString()`.
     - Any other byte, any unpinned template, or an item rendered with any other text is refused (`context_forged`).
     - Formatting is not selection: what is selected stays the compiler's (above).
   - **Project sources are derived, never supplied.** From the item ids, it reads under the locks the frame's `sourceId` and `sha256` from the locked project's current frame, and each decision's `body_source_id`. The caller supplies no source id, hash or revision.
   - **Messages have their own provenance.** 0048's `conversation_messages` has no source object, so each recorded message is a row of `conversation_reply_messages`: reply, assembly, `message_id`, `seq` and the sha256 of its body as read. Each also carries the range read (`from_seq`..`cutoff_seq`) and `erasure_revision`.
   - **Each item must be what it claims:**
     - a decision of this project, in the state and kind claimed;
     - the mission decision equal to the current frame's `decisionId`;
     - a message of this conversation, at or before `cutoff_seq`, not withdrawn;
     - every derived source within the full predicate (§8.3: project, `scope='project'`, `eligible`, `ready`).
   - **The compiled revisions must equal the locked project's:** mission, ledger, eligibility and audience.
   - **It computes `context_hash` itself:** sha256 over the bytes, the derived sources with their `sha256` and `eligibility_revision`, the recorded messages with their body hashes, the compiler and renderer identities, the source predicate's identity (`conversation-source-v1`) and those revisions.
   - **Replay:** a repeated call for the same reply and assembly with the same `context_hash` returns the existing record. A different hash for that assembly is refused.
   - **It writes the record:**
     - `conversation_reply_contexts` (reply, assembly): the exact bytes in its own `body` column; the compiler `sophia.mission-context.v1` and the compiled `digest`; the renderer and its budget version; the source predicate's identity; the four revisions; `erasure_revision`; the message range; each section's coverage and omissions; the byte length; `context_hash`; and `scrubbed_at` and `scrubbed_by`, both null until a scrub;
     - `conversation_reply_sources` and `conversation_reply_messages`.

**The context copy and its erasure.** The bytes are a persisted copy of message and mission text, so their erasure is bound and tested in S3.
- **Why not a source object:** they are not stored through `put_text_source`, because `source_dependencies` alone scrubs nothing derived. 0041's `mission_erase_source` deletes only the source it names, then calls the research and design revokers.
- **The scrub:** S3's migration adds two `AFTER` triggers. Each scrubs the body of every context that recorded the item: `body` becomes `NULL`, with `scrubbed_at` and `scrubbed_by`. The hash, ids and revisions stay, holding no text.
  - On `conversation_messages`, when `body` becomes `NULL`. This covers `withdraw_conversation_message` (`scrubbed_by = 'message_withdrawn'`) and `erase_conversation`, which nulls every body (0048:388; `'conversation_erased'`). That table is CON's own.
  - On `source_objects`, after an update that takes a row out of the full predicate, or a delete (`'source_withdrawn'`). It is additive; no mission, research or design function is replaced (§8.3).
- **A superseded record** is scrubbed at once (`'superseded'`).
- **What else is pending:** the dispatched create payload and the runtime's copies stay §8.5's inventory, scrubbed there.

**Why this is atomic, and what still guards it.**
- The project row is held `FOR SHARE` from before the compiler reads until the record commits. What serializes is each **public entry point** taking that lock. The helpers it calls (`mission_erase_source`, `put_text_source`, 0048's `conversation_append`) don't lock themselves; they rely on their callers. As read at the base, these public entry points lock the project row before their first write:
  - the ledger writers in 0018–0020: `record_mission_entry`, `propose_mission_change`, `decide_mission_change`, `mission_commit` and `mission_accept`;
  - `withdraw_mission_entry`, which locks the project (0018:447) before `mission_erase_source`. That function is the only SQL that takes a source out of the predicate: 0018's version, replaced by 0028 and then 0041, each its own `UPDATE … SET eligible=false, state='deleted'`;
  - membership: the only SQL writer, `accept_room_invitation` (0010:328–330), updates the project row. No SQL function removes a member today.
    - **The membership revocation protocol:** a future member removal must lock the project row `FOR UPDATE` and bump `audience_revision` before it changes `project_members`. The census below fails for any granted function that writes `project_members` without that.
    - An asker made inactive by any other means is refused by the begin and record checks, and again at dispatch;
  - the conversation writes in 0048, through `conversation_locked`.
- **The caller-chain census (a test).**
  - **Its scope:** every function with `EXECUTE` granted to `sophia_api` or `sophia_worker` that writes `source_objects`, `source_texts`, `decisions`, `mission_entries`, `project_revisions`, `projects`, `project_members`, `conversations` or `conversation_messages`, directly or through a helper.
  - **Its list:** each must appear on a reviewed list with the line where it takes the project lock. A function granted later that isn't on the list fails the census until it is reviewed.
  - **Concurrency:** a test holds each listed entry point against an assembly, in both orders.
- **Dispatch and publication revalidation remain required** (§8.3). A decision accepted after the record and before dispatch makes the dispatch window's fence assemble again, at most 3 times, then fail visibly (`context_unstable`). So an ask dispatched after a decision is accepted sees that decision. One accepted after dispatch gives `contextChanged` at publication; a privacy withdrawal cancels and suppresses. Those fences are shared code, in the dispatch window, and not S3's.

**S3 tests.**
- **Parity with `readMissionContext`, for the same snapshot.** The rendered mission, constraint and pending items equal the compiled model's (its prefix under the budget, the omissions counted) in each of these cases:
  - the current mission changed (a newly accepted mission, rendered at the next assembly);
  - a superseded mission;
  - a withdrawn frame;
  - a legacy frame;
  - an empty frame;
  - 51 constraints and 51 pending, some sharing a `created_at`: the compiler's 50 reversed to newest first, ties by id descending, then the newest 20 or 10, and "may be older ones" said;
  - a stale pending proposal.
- **The record refuses a forgery** (`context_forged`, nothing recorded):
  - bytes with an extra byte or line no fragment holds;
  - a fragment whose text differs from its item's database values by one character;
  - a template not pinned for the renderer version;
  - an item of another conversation or project;
  - a duplicated item;
  - a message after `cutoff_seq`;
  - an item claimed as another kind.
- **The copy's erasure, in S3:**
  - withdraw a recorded message, by its author and by an admin;
  - erase the conversation;
  - withdraw, through `withdraw_mission_entry`, a mission entry whose source a recorded decision cites.

  After each: the body is `NULL`, `scrubbed_by` is set, the hash and ids stay, and a byte search of the record tables finds none of the text.
- **Unknown commit:** a record committed whose answer was lost; begin then returns it, and assembles nothing new while the revisions hold.
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
- **The role:** RLS applies through `sophia_conversation_assembler` (the checks under «Role and transaction»).
- **An inherited summary source withdrawn (CX45 correction 3):** **not runnable in S3**, since no summary exists before a reply can be published. It is required, with the in-flight and published second-generation cases of §8.3, in the step that first stores a summary. S3 claims nothing for it.

#### 8.7.3 Files

| File | Step | Kind |
|---|---|---|
| `db/migrations/<census>_conversation_reply_ledger.sql` | S2 | new |
| `db/migrations/<census>_conversation_reply_context.sql` (the role, the record tables, begin and record, the two scrub triggers) | S3 | new |
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