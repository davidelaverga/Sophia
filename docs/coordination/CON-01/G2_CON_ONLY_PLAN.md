# CON-01 G2: the smallest CON-only source plan (proposed)

**What this is.** A plan of the source CON-01 can write before any shared owner, window or base is bound, asked for by Codex in CX-0113. It names each file, its exact call sites and its tests. **Nothing here is written yet.** Each step, if Codex accepts it, becomes its own immutable pin with a fail-before and an after, early-published on its own ref before its broad gates, as the S3 corrections were.

**Read at:** the combined candidate `3b9363dc` (S1 `bf2ce190…`, S2 `e136626d…`, S3 `ea80fbcc…`, N4 `4b591f60…`; 0048 `e3684304…`) and the binding map at `18827e09` (§8.3, §8.5, §8.8). Line references `NNNN:L` are migrations; `s3:` and `s4:` are the S3 and N4 candidates.

## 1. What counts as CON-only

Only files CON-01 already owns and no other writer touches:
- the review candidates `db/candidates/con01-*.sql`, which sit outside `db/migrations` so no runner applies them, take no number and grant nothing new;
- `packages/persistence/src/conversation-*.ts` and their tests. These modules are imported only by their tests today, not from `packages/persistence/src/index.ts` (a shared file, §2 of the binding map), and they stay that way;
- `docs/coordination/CON-01/*`.

**Not CON-only, and so not in this plan:** every file §2 below lists. No owner, window or accepted base is bound for any of them (§8.8's Q1–Q11 are unanswered; G2_IMPACT_INVENTORY §7.1 still names none).

## 2. The plan: two steps

### Step A. The source-key index, on S3's own table

**Why.** `conversation_reply_sources` has only its primary key, `(project_id, reply_id, attempt, kind, ref_id)` (s3:104). Every lookup by source scans the whole table: CC-0110 measured 5,556 buffers, about 25 ms, at 250,003 rows, against 3–4 buffers with the index. Binding map §8.3 binds the index with the source hook; the index alone is CON-only and has callers today. The hook does not.

**The change.** One statement in `db/candidates/con01-s3-conversation-reply-context.sql`, after the table (s3:100-107):

```sql
CREATE INDEX conversation_reply_sources_by_source ON sophia.conversation_reply_sources (project_id, source_id);
```

**Its call sites, now:**
- `conversation_source_out`'s dependency query, `FROM sophia.conversation_reply_sources s WHERE s.project_id=p_project AND s.source_id=p_source` (s4:394-400);
- the foreign key `(project_id, source_id) REFERENCES sophia.source_objects` (s3:106). PostgreSQL checks the referencing rows by those columns when a source row's key would change or the row would be deleted.

**Held, later:** the source hook's probe (§8.3). It is not written here.

**Tests (L1, disposable PostgreSQL):**
- **N2's footprint** (`conversation-assembly.db.test.ts:102-110`, `ADDED_INDEXES`) gains the index. Nothing else is added or changed.
- **N4's suite** gains one plan test. It records many dependencies in the target project, analyzes, then runs `conversation_source_out`'s dependency query under `EXPLAIN (ANALYZE, BUFFERS)`, in its custom and generic plans, for a source with three dependencies and for one with none. Each must plan on the index with bounded buffers.
- **Fail-before:** the same test against `3b9363dc` shows a sequential scan.
- **Unchanged:** every existing N4 and N2 outcome, the five suites, and the composed N2 + N4 run's three intended differences.

### Step B. A refusal of an answer that can't be published, in N4

**Why.** Binding map §8.5 (CC-0118, CC-0120, CC-0121) ends an answer that publication can't take as `failed`, without calling publication: an empty one (`answer_empty`), one longer than 16,000 characters as PostgreSQL counts them (`answer_too_long`), or one that isn't storable (`answer_invalid_text`). Publication raises on the first two (`length(p_text) BETWEEN 1 AND 16000`, s4:342). Its item is content-free, so nothing raises inside an observation batch. N4 can publish an answer (`conversation_publish_answer`, s4:335-383), but it has no way to end a running reply as `failed` without one. Without that, the refusal would have to be written into a shared function's body (capture's reply branch). Step B gives it a CON-owned entry point instead.

**The change.** One function in `db/candidates/con01-s4-reply-fences.sql`:

```
sophia.conversation_refuse_answer(p_reply uuid, p_attempt integer, p_reason text) RETURNS jsonb
```

- **Reasons:** only `answer_empty`, `answer_too_long` and `answer_invalid_text`; anything else raises `invalid_input`.
- **Locks:** publication's own, under READ COMMITTED: `conversation_fences_locked(p_reply, p_attempt, true)` (s4:174), so it serializes with publication, the check, the claim and a withdrawal exactly as publication does.
- **Attempt:** it acts only through the reply's live attempt, the rule `b5c47582` bound for `source_out`.
- **A running request** at that attempt ends `failed` with the reason and `settled_at`. The function itself writes no message, answer row, suppression or receipt. Usage is not its business: it was recorded when the item was stored.
- **The governed cleanup that move triggers is required, not avoided** (CX-0114). Like every move into a terminal state, the move to `failed` fires S3's `conversation_context_reply_scrub` (s3:400-409). Through `conversation_context_scrub` (s3:374-381), it takes each context of the reply to body NULL, with `scrubbed_at` and `scrubbed_by = 'reply_ended'`, and nulls its recorded messages' text hashes. Ids, seqs, revisions, source hashes and the context hash stay, as S3's governed metadata. No trigger is disabled, bypassed or reordered to change that.
- **Anything else** returns its current state unchanged, with no error. That covers a request already terminal (`cancelled` by a withdrawal stays `cancelled`), a stale attempt, and a replay.
- **Privileges:** publication's pattern, SECURITY DEFINER with `search_path=pg_catalog,sophia`. It joins N4's revocation list, so EXECUTE is revoked from PUBLIC, `sophia_api`, `sophia_worker` and `sophia_conversation_assembler` (s4:455-469), and only its owner can execute it. It stays dormant like N4's other entry points.

**Its call site:** held. Capture's reply branch, in the shared `capture_native_result` (0049). It runs at `turn/end` (0023:45-46), finds the run's last `assistant/message` (the query at 0042:1747-1749), and calls this function when that item is `oversize`, `invalidText` or empty, or when there is none. There is nothing to publish then: the item carries no text. Until that branch exists, only the tests call it.

**Tests (L1, N4's suite):**
- A running reply refused with each of the three reasons: `failed`, the reason, `settled_at` set; no message, answer or suppression.
- **In the same cases, S3's cleanup:** every context of the reply has body NULL and `scrubbed_by = 'reply_ended'`, its recorded message hashes are NULL, and its context hash, ids and source hashes are kept, exactly as after any other terminal move. `conversation_context_reply_scrub` is enabled before and after (`pg_trigger.tgenabled = 'O'`). A replay changes nothing further: `scrubbed_at` is unchanged.
- A reason outside the three: `invalid_input`, and nothing changed.
- Publication's own bounds, pinned beside it (no change to it): 1 and 16,000 characters publish, as 16,000 U+0001 and as 16,000 characters outside the BMP (32,000 UTF-16 units); 0 and 16,001 raise `invalid_input`. These are the cases the refusal exists for.
- Replayed: the same state returned, with nothing changed.
- A withdrawal first, then the refusal: the request stays `cancelled`.
- A stale attempt, superseded at a new claim: nothing changed. This mirrors `b5c47582`'s controls.
- Against publication and against a withdrawal, each in both orders, under a held lock with the waiter seen in `pg_stat_activity` (the CX-0006 pattern): exactly one outcome, the other refused or a no-op.
- **Fail-before:** the tests against `3b9363dc` find no such function.
- **Unchanged:** publication's own bound (`length(p_text) BETWEEN 1 AND 16000`, s4:342) and every existing outcome.

### Order and gates

Step A, then Step B, each a separate commit and pin. Each is checked by the same gates as the S3 corrections:
- N4;
- N2 with N4 appended (its intended differences itemized);
- the five conversation suites at concurrency 4;
- every `*.db.test.ts`, on C.UTF-8 and ICU `en-US`;
- `pnpm test:sql` and `pnpm check`.

Neither step moves #211; that waits for Codex.

### Not proposed now

- **The reply schema as a SQL check** (`conversation_reply_observation_ok`). It is CON-only, but its only caller is the held ingestion branch (`runtime_record_observations`, 0049). It is written with that branch, so it isn't dormant code with no caller.
- **The relay, the projection and the launcher in TypeScript.** They belong to the runtime's files (below). A copy elsewhere would be a second implementation.

## 3. Held: excluded until their owner, window and base are bound

| Held file or object | Why it is held | Bound by |
|---|---|---|
| The source hook `conversation_source_hook` on `sophia.source_objects` (0001's table) | A shared schema change; the writer protocol | Q1–Q4, Q11; §7.1's window |
| 0049's replacements of `dispatch_runtime_outbox`, `capture_native_result` (their reply branches, Step B's caller among them), `native_delivery_ineligible`, `runtime_hello`, `apply_runtime_receipt`, `runtime_record_observations`; option C's shared columns (`work_attempts.goal_id` NULL, `conversation_reply_id`; bindings, commands, outbox) | Shared SQL and schema | Q6, Q10, Q11 |
| `conversation_executions` and its claim; `/v1/runtime/conversation/{claim,acknowledged,reserve,settle}` in `RUNTIME_ROUTES` (`apps/api/src/routes/runtime.ts:43-58`) | They key on option C's runtime rows, and the route set is shared | Q6, Q7, Q10 |
| `apps/execution-host/src/runtime-supervisor.ts`, `scripts/runtime-host.mjs` | The runtime writer's (WBC-02/SDD-01), not named | Q6, Q7 |
| `packages/dsh-bundle/src/{control-bridge,session-events,transport,protocol,retained-queue,role-registry,index}.ts`, `cordis.patch.yml`, `dist`, `runtime-wire*.generated.ts` | The runtime writer's; the bundle's bytes are recorded identities | Q6, Q7 |
| The reply launcher (new, in the runtime image), the reply profile under `config/dsh/`, `config/specialists.json`, `config/runtime-unit.json`, digests | The runtime writer, with Davide (LFE-00, the image) and the renderer's owner (the Landlock pattern) | Q7, Q8, Q9 |
| A16's regeneration: `packages/contracts/openapi/openapi.json`, `src/generated-types.ts`, `src/generated/validators.*` | Shared generated contracts; whoever lands second regenerates | §2 of the binding map; #190 |
| `apps/api/src/app.ts`, `packages/persistence/src/index.ts` | Shared with #190 | §2; the window |
| `scripts/add-member.ts` and any membership handler | Luis's | Q5 |
| The Studio's shell and fixture pages | Luis's (G3) | §9; Luis |

## 4. What stays as it is

- **The withdrawal policy:** the conservative one, pending the owner's choice (r4241643135). Nothing here narrows it.
- **The route:** none is bound (`no_grant`). The subscription connection and its capacity stay the existing owner-resource dependency, not a second harness, a collector or a general-inference fallback, and there is no pay-as-you-go path.
- **No runtime, provider, live or shared effect**, and no migration number.
