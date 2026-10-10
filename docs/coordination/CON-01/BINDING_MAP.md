# CON-01 binding map (G0)

**Mission:** CON-01, saved project conversations ([pack](../../missions/2026-10-09-con01-conversations/README.md), [01 mission](../../missions/2026-10-09-con01-conversations/01_MISSION.md), [03 contract](../../missions/2026-10-09-con01-conversations/03_CONTRACT_AND_RETENTION.md), [04 runtime](../../missions/2026-10-09-con01-conversations/04_RUNTIME_AND_CONTEXT.md)). **Coordination:** [README](README.md). This file binds the pack's proposals to the code at the base: what exists and is reused, what is new and reserved, and what Davide decides. It is G0's deliverable and Codex's review object for the binding. A later change is recorded in §14 with its reason, in the commit that makes it.

**State: proposed, revision 6.**
- Codex's review [CX-0002](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088652493) of revision 1 (`b00d07f`) requested five corrections; revision 2 (`c703b2d`) made them.
- Codex's recheck [CX-0003](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088757330) reviewed G1 at specification level and asked for two more G2 privacy corrections; revision 3 makes them (§8.3, §14).
- Revision 4 binds the option C impact inventory ([G2_IMPACT_INVENTORY.md](G2_IMPACT_INVENTORY.md)) into §8.2.
- Codex's review [CX-0009](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6089780887) of revision 4 asked for two lifecycle bindings; revision 5 makes them: receipts settle what capture cannot (§8.2.1), and observation ingestion is privacy-fenced (§8.2.2).
- Codex's review [CX-0012](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6090136849) of revision 5 found its uncertain-create path incoherent (a late publication promised, but refused by ingestion, capture and hello). Revision 6 binds one policy: **an uncertain or failed create is terminal and fails closed** (§8.2.1).
- Nothing in G2 is frozen until Codex rechecks it.
- G1 (§4–§6) is implemented locally behind disabled switches; Codex accepted its SQL correction at L1 within G1 scope ([CX-0007](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6089616601)).
- G2 (§8) follows option C as the review's architectural direction. It still waits for the inventory's review, Davide's D-6 and B-1, and the shared-window acknowledgments.

Status words: **built** (in this branch, with tests), **planned** (not built; named so nobody invents it), **owner** (Davide decides; this file only proposes).

## 0. Recovered state (observed 2026-10-09 UTC, this session)

| Item | Observation | How |
|---|---|---|
| Base | `main` `4f7470c3ab7c158315934a11c8c620da663f4898`, tree `7d1472e3e61c707e6611015203ddec35f7ff5ce2` (#195). The pack's read anchor `695fe44` is four merges behind (#192 decide-on-its-way, #193, #194, #195): evidence, not a reset target | `git log` |
| Branch | `claude/con01-project-conversations` from that base | this session |
| Implementer | Claude Code cloud session `session_01KUDtFK9gWthsXSrepcLQz3`, attempt CON-01 attempt 1 | session |
| Reviewer | Codex session `01a1224a-32b4-7222-a017-50a277572d95`, worktree `codex/con01-review-attempt-1` at `4f7470c` (its kickoff, CON-01-CX-0001) | Codex's message |
| Planning authority installed | v2.0 unified continuation ([docs/execution](../../execution/README.md)). **The v3 parent pack is not installed:** no PR or branch installs it. Its CON-01 goal is retained as `references/v3/goals__CON-01.md.original.txt` in the installed CON-01 pack | `git ls-remote`, open PRs |
| PR #190 | **Not** "docs: install unified continuation v3" as the pack read it. It is draft **SDD-01 G7 voice qualification** (`sdd-01/voice-qualification-g7`, head `dfd74679`). It reserves **A15** and migrations **0046–0047**. It changes files CON-01 also touches: `openapi.json` and the generated contracts, `apps/api/src/app.ts`, `apps/api/src/routes/conversations.ts`, `packages/persistence/src/index.ts`, `apps/worker/src/runtime-dispatch.ts`, `docs/DESTINATION_MAP.md` (§2) | `get_pull_request`, `git diff --name-only` |
| Other open PRs | #196 (demo board fixture), #197 (Updates open-near). No file in common with CON-01's plan | `git diff --name-only` |
| Issues | No CON-01 thread existed. #105 is the historical proposal for four room APIs, where A18 was named. It is not this mission's queue and is not edited | `list_issues` |
| Amendment and migration namespace | `main` ends at A14 and `0045`. Every one of the 136 remote branches was read: the only IDs above those are #190's A15, 0046 and 0047 | `git ls-tree` over all heads |
| Existing conversation work | Luis's Studio feature (C1–C9: `features/conversations/`, 9 e2e specs) runs against A18 **UI proposals** in `apps/studio/src/api/vision.ts:446-590`, answered only by the fixture pages (`fixtures/fixture-api.ts`, `fixtures/conversation-writes.ts`). There are no tables or routes. `apps/api/src/routes/conversations.ts` serves A05 contributions and the retired brief (410), unrelated to A18 | read |
| Reply wait today | `conversation-list.ts:111-117` `answeredAfter`: any Sophia message later than the ask's server time settles the wait. Codex confirmed this independently (CX-0001). It is replaced by request correlation (§7) | read |
| Runtime unit | `sophia-runtime-wbc02-dev` (`built_not_ready`), dsh `0.2.0-rc.2` at `639ed015`. Roster: `sophia-guide-v1`, `-lead-v1`, `-research-v1`, `-prototype-v1`, `-review-v1`, `-brief-v1`, and specialists `sophia-research-md-v1`, `-research-pdf-v1`, `-html-designer-v1`, `-visual-review-v1`, `-source-review-v1` | `config/runtime-unit.json`, `config/specialists.json`, `role-registry.ts` |
| Native text-answer path | **None today sends a native answer into a user conversation.** Personal's companion is an in-process scripted rehearsal (`apps/api/src/companion.ts:5-7`; `server.ts` refuses it in production). Room "ask Sophia" is a contribution that starts nothing (`0012:34`). The nearest native chain (admit → outbox → worker → bridge → `capture_native_result`) belongs to the retired brief | read (§8) |
| Deployments | Not observed by this session. The latest record is Codex's, in [WBC-02-CC-0010](../WBC-02/WBC-02-CC-0010.md) §0 (2026-10-08/09): hosted ledger at **0036**, Render services with auto-deploy off, and a Studio uploaded by hand to Vercel. Codex revalidates read-only before any batch | records |
| Toolchain here | Node `24.21.0` (official tarball, SHA-256 verified) and pnpm `11.7.0`; `pnpm toolchain:check` ok; `pnpm install --frozen-lockfile` up to date. Docker is unavailable, so the PostgreSQL suites run against a local PostgreSQL **16.15** cluster through `SOPHIA_DISPOSABLE_DATABASE_URL` | commands |
| Baseline | `pnpm test:db` on `4f7470c`: **600/600 pass**, 0 fail, 0 skipped (88 s) | command |

## 1. Reservations (proposed; recorded in the coordination issue)

| Item | Reserved | Why |
|---|---|---|
| Contract amendment | **A16** `packages/contracts/amendments/A16-project-conversations.json` | #190 holds A15. The UI's "A18" is a proposal label from issue #105, not a backend number: it is not allocated, and neither are the UI's A16/A17/A19/A20 labels for other proposals (§3) |
| Migrations | **0048** `0048_project_conversations.sql` (G1: conversations, messages, reply requests, policy, withdrawal and erasure). **0049** `0049_conversation_replies.sql` (G2: reply execution, dispatch and capture, grant and allowance). **0050** for G3 projections if they don't fit 0049 | #190 holds 0046–0047. The runner applies pending files in name order and refuses missing applied files (`migrate.ts:124`). If CON-01 lands first, 0046–0047 still sort before 0048 on a fresh database. A database already at 0048 would apply 0046–0047 after it, so neither lane may depend on the other's objects. Neither does today: 0046 replaces only `media_assignments` |
| Events | Type `conversation.updated`, entity type `conversation`. Summary codes: `conversation.started`, `.message_recorded`, `.message_withdrawn`, `.erased`, `.reply_changed`. No body text in an event | The feed refreshes on any non-cursor frame (`feed-loop.ts:43`). The fixture's plan already names `conversation.updated` |
| Policy id | `conversation-text-v1` (§5) | Distinct from mission note policy, `personal`, and `source-review-v1` |
| Runtime unit (G2) | `sophia-runtime-con01-dev`. Its `previous_unit` is whatever `main` records at the integration window. `sophia-runtime-wbc02-dev` is `main`'s today, but it is not assumed to be the live predecessor: Codex observed six running bindings on `sophia-runtime-m03-dev` (CX-0002) | A role, its preset, its route and its prompt section change the bundle |
| Role / task kind / route (G2) | `sophia-conversation-v1`, `conversation_reply`, `conversation-luna-v1` (**owner** for the route, payer and caps, §8.4) | No existing role fits: `sophia-brief-v1` is the retired brief's |
| New source paths | `packages/persistence/src/conversations.ts`; `apps/api/src/routes/project-conversations.ts` (a new file, so #190's edits to `routes/conversations.ts` never conflict); `apps/api/src/conversations.db.test.ts`; `packages/persistence/src/conversations.db.test.ts`; `db/tests/00NN_conversations.sql`; `apps/studio/src/api/conversations.ts` (the four calls moved out of `vision.ts`); `docs/coordination/CON-01/`, `docs/progress/CON-01.md`, `docs/handoffs/CON-01-attempt-*.md` | Feature modules stay branch-local |

## 2. Shared files and one writer at a time

| Shared file | Other writer in flight | CON-01's change | Order |
|---|---|---|---|
| `packages/contracts/openapi/openapi.json`, `src/generated-types.ts`, `src/generated/validators.*`, `scripts/generate-validators.ts` (`EXPORTS`) | #190 (A15) | A16 only, regenerated with `pnpm --filter @sophia/contracts generate`. Never hand-merged: whichever lands second merges `main` and regenerates | Whoever lands second |
| `apps/api/src/app.ts` | #190 | Registers `projectConversationRoutes` only when `SOPHIA_CONVERSATIONS=on`, and adds a `CONVERSATION_SCHEMA` readiness check that is required only when it is on (the `STORE_SCHEMA` pattern, `app.ts:164`). `REQUIRED_SCHEMA` is untouched | As above |
| `packages/persistence/src/index.ts` | #190 | One export line | Trivial merge |
| `apps/worker/src/runtime-dispatch.ts` | #190 | None planned. G2 dispatch is SQL. If that changes, it is announced first | — |
| `dispatch_runtime_outbox`, `capture_native_result` (last at 0042), `native_delivery_ineligible` (0041), `runtime_hello` (0028), `apply_runtime_receipt` (0012), `runtime_record_observations` (0023), all `CREATE OR REPLACE` | none open (#190 at `0483d40`: 0046 replaces only `media_assignments`, 0047 adds a table) | G2, under §8.2 option C: each replaced from its latest body with only the named insertions (a reply-first branch, a `g.id IS NULL` guard, `runtime_hello`'s `UNION ALL`), and a diff test against that text | Announced in the issue before writing; one writer |
| A04's `RuntimeWorkBinding` (amended in A16), `packages/dsh-bundle/src/runtime-wire.generated.ts` and `runtime-wire-types.generated.ts` (from `packages/contracts/scripts/generate-runtime-wire.ts`), `packages/dsh-bundle/dist` | none open | G2: the binding becomes a `oneOf` of the goal binding (unchanged) or `{conversationReplyId}` (§8.2) | As the runtime row below |
| `config/specialists.json` + schema enum, `packages/dsh-bundle` (`control-bridge.ts`, `role-registry.ts`), `cordis.patch.yml`, `config/runtime-unit.json`, both `specialists.generated.ts`, bundle lock and digests | none open (owner: Davide, LFE-00 map) | G2: one additive role, preset and route. The whole current roster is kept; `pnpm artifacts:record` runs once, on the combined candidate | A public declaration is not ownership. Before any shared runtime replacement or artifact generation, the other lanes' owners (SDD-01/#190; WBC-02) acknowledge, and the exact current-`main` window is named in #198 |
| `apps/studio/src/app/route.ts`, `features/studio/ViewNav.tsx`, `ProjectShell.tsx` (Luis's shell) | Luis | Replace the `VISION` gate on the Conversations tab only with a conversations gate (§9). No visual change | Luis is asked in the issue before the edit |
| `apps/studio/fixtures/*` (fixture pages) | Luis, #196 | The fixture pages keep answering under their URL switches, with A16 shapes | After #196 |
| `docs/DESTINATION_MAP.md`, `docs/README.md`, `docs/missions/README.md` | #190 (DESTINATION_MAP rows) | Rows added | Trivial merge |

## 3. The UI proposal (A18) mapped to the real contract (A16)

The four operations keep their paths and meanings (pack 03 §1). A16 adds fields; it does not rename them. Everything is generated: the Studio's hand-written checks for these four calls move from `vision.ts` to `api/conversations.ts`, using the generated validators. Every other `vision.ts` proposal (A12 meetings, A13 recaps and search, A14 focus, A16/A17 reviews and tasks, A19 origins, A20 replies) stays as it is, gated by `VISION`.

| UI proposal (vision.ts) | A16 (this mission) | Notes |
|---|---|---|
| `GET /api/v1/projects/{projectId}/conversations` → `{ conversations }` | → `ConversationList { conversations, more, policy, capability }`, newest activity first, at most 200 | `policy` and `capability` are new (§5, §9). `more` says when the list was capped |
| `ConversationSummary` `id, title, summary, lastAt, contributors, sophia, openQuestions, output, lastMessage?` | Same fields, plus `revision`, `summaryCoverage` and `questionsCoverage` (`ProjectionCoverage`, §3.1) | `contributors`: writers of messages that are not withdrawn, never readers, in order of their first message, **at most 200** (A16's `maxItems`): the first to write, except that the reader, whenever they wrote there, is always among them (in the last place kept), so "Mine" and "You" stay true for them; at 200 the Studio says "and others" (PR #199 review `r4235097321`). `sophia`: a published reply exists. `lastMessage.text`: the opening, ≤140 code points, from a message that is not withdrawn. `output`: `null` for every conversation this slice creates (§10) |
| `GET /api/v1/conversations/{id}/messages?before=` → `{ messages, before }` | → `ConversationMessagePage { conversationId, messages, before }`, at most 50, oldest first | `before` is opaque and bound to its conversation (§4) |
| `ConversationMessage` `id, author, actorId, name, text, at` | Same, plus `seq`; `text` becomes `string \| null` (null once withdrawn), and `withdrawn: { at } \| null`; a member's message gets `ask: ConversationReply \| null`; Sophia's gets `replyTo: { messageId, replyId }` | Correlation is on the records (§7), not on time |
| `POST /api/v1/projects/{projectId}/conversations` `{ title, text, askSophia }` → `{ conversation, message }` | Same body → 202 `ConversationStarted { conversation, message, sophia, reply }` | `sophia: 'asked' \| 'not_asked'`; `reply` is the request when asked |
| `POST /api/v1/conversations/{id}/messages` `{ text, askSophia }` → `{ message, sophia }` | Same body → 202 `ConversationMessageSent { message, sophia, reply }` | |
| — | `POST /api/v1/conversations/{id}/messages/{messageId}/withdrawal` (Idempotency-Key) → 202 `ConversationWithdrawal` | The minimum erasure control (§6) |
| — | `POST /api/v1/conversations/{id}/erasure` (Idempotency-Key, admins) → 202 | Erases a whole conversation, title included (§6). **owner** D-3 |

Limits (exact, as the API's Ajv counts code points, `ucs2length.ts`, and as SQL `length()` counts characters in UTF-8): title 1–120, text 1–4000 after trimming, page 50, list 200, an opening of 140 (line breaks kept; the Studio shows it on one line). Unknown body properties are refused (Fastify's `removeAdditional: false`), so a client cannot send an actor, author, name, project or reply target.

### 3.1 `ProjectionCoverage` (bound before A16 is generated)

Each of a conversation's two projections, the summary and the recorded open questions, carries its own coverage.

**Fields:**
- `state`: one of `not_assessed`, `current`, `stale`, `unavailable` (meanings below).
- `complete`: boolean. True when the generation read every eligible message from the first through `throughSeq`. False when its window was truncated: **partial**.
- `fromSeq`, `throughSeq`: the range of messages the generation read. Null when `not_assessed`.
- `newer`: eligible messages after `throughSeq`.
- `generatedAt`: when it was generated.
- `replyId`: the reply whose answer produced it, which is its generation identity.
- `eligibilityRevision` and `ledgerRevision`: the project context it read.

**States:**

| State | Meaning | Words in the Studio |
|---|---|---|
| `not_assessed` | No projection exists: none was ever produced, or the last one was removed for privacy. `summary` is null, and `openQuestions` is 0 | "Not assessed yet" / "No recorded questions yet", never "No open questions" or "Everything resolved" |
| `current` | It read through the newest eligible message, at the project's current `ledgerRevision` | "Covers messages 1–N" (with "of the newest M" when `complete` is false) |
| `stale` | Still eligible, but `newer > 0` or the ledger moved since | "Covers messages 1–N; K newer since" |
| `unavailable` | The last generation attempt failed or was blocked. The previous eligible projection, if any, stays with its own range; otherwise this reads like `not_assessed` with the failure said | "Couldn't update: shows messages 1–N" |

**Removal for privacy.** A projection whose range includes a withdrawn message, or whose recorded project sources include one that became ineligible (§8.3), is **deleted** in that transaction. It goes to `not_assessed`, never `stale`.

**What triggers a generation.** Only an explicit ask: "Sum it up" (summary) or "What's still open?" (questions), through a reply that is already paid for. A list read, an open, a human-only message, a feed event or a tab switch never generates one (A17). New messages only make the state `stale` at read time.

**Race (A18).** A completion writes its projection only if its `throughSeq` is greater than the stored one's, and only if every message and source it read is still eligible at that moment. An older or invalidated completion writes nothing.

## 4. Records, authorization, idempotency and ordering (G1, migration 0048)

**Tables.** All carry RLS `FOR SELECT TO sophia_api USING (sophia.is_member(project_id))` and `GRANT SELECT` only. Security-definer functions are the only writers, revoked from PUBLIC and granted to `sophia_api` (the `0021` and `0018` pattern).

- `conversation_settings(project_id PK, policy, state 'enabled'|'read_only', approval_ref, revision, updated_at)`: the per-project switch. With no row, a project offers no new conversation or message: the cohort switch, the rollback switch and the policy acceptance record (§5, §11). It is set by an operator function `set_conversation_settings`, granted to no login, the `set_research_grant` pattern.
- `conversations(project_id, id, title NULL once erased, created_by, message_seq, revision, erasure_revision, state 'open'|'erased', policy, created_at, last_at)`, `UNIQUE(project_id, id)`.
- `conversation_messages(project_id, conversation_id, id, seq, author 'member'|'sophia', actor_id, author_name, body NULL once withdrawn, reply_id, withdrawn_at, withdrawn_by_role 'author'|'admin'|'source', created_at)`, `UNIQUE(conversation_id, seq)`. `CHECK((author='member')=(actor_id IS NOT NULL))` and `CHECK((body IS NULL)=(withdrawn_at IS NOT NULL))`.
- `conversation_replies(project_id, conversation_id, id, message_id, asked_by, state, reason, answer_id, cutoff_seq, created_at, settled_at)`: the reply request. G1 writes it as `blocked` / `replies_not_enabled`, because no execution path exists before G2 (A10's honest state).
- `conversation_requests(project_id, actor_id, idempotency_key, operation, semantic_request, receipt, created_at)`, PK `(project_id, actor_id, idempotency_key)`: the `mission_requests` pattern.

**Who.** The verified token subject is the actor (`withActor`, `tx.ts:101`, `set_config('sophia.actor_id')`). `author_name` is the verified token's name (`req.actorName`, the email, as `carry_personal_note` stores it), never the client's.
- Read: `sophia.is_member(p)`, any role (admin, editor, viewer).
- Write (start, send): `sophia.can_edit(p)` (admin or editor; viewers refused), the Studio's `role !== 'viewer'` rule.
- Withdraw own: the author, while an active member of any role.
- Withdraw any, or erase a conversation: `sophia.is_admin(p)`.

An outsider, a removed member or a guest gets `forbidden`, with no record fetched first. "Guest" is an invitation kind (0010), not a project role. A route for a conversation id first resolves its project under RLS, so an id a reader cannot see answers exactly as a missing one does.

**Idempotency** (CX-0001's namespace). The key namespace is (project, actor, key). The stored semantic request names the operation and every target and content digest, with SHA-256 of the trimmed text and never the text (CX-0002 correction 1):

| Operation | Semantic request |
|---|---|
| start | `{operation:'start', titleSha256, textSha256, askSophia}` |
| send | `{operation:'send', conversationId, textSha256, askSophia}` |
| withdraw | `{operation:'withdraw', conversationId, messageId}` |
| erase | `{operation:'erase', conversationId}` |

The key and the actor are the row's own key: the same key under another actor or project is another row, never a replay. The tests cover, under one key: a changed target (withdraw M1, then M2), a changed operation, a changed text or ask, another actor and another project.
- **Order inside each writer:** lock the project row, then check current authorization, then look up a prior request. So a revoked member's replay is refused before any receipt is read.
- An equal request returns the stored receipt. The receipt holds ids only; the route re-reads the records under the actor, so a withdrawn message comes back withdrawn.
- A changed request under the same key gets `idempotency_conflict` (409).
- A key whose message was later withdrawn has its semantic redacted to `{"redacted":true}`, the `mission_prior` precedent. A retry under it is refused (`request_erased`, 409), never re-executed.

**Ordering and pages.**
- `seq` is per conversation, taken by `UPDATE conversations SET message_seq = message_seq + 1 … RETURNING` under the conversation row lock. Two concurrent sends get distinct, ordered seqs; equal timestamps never decide order.
- `before` is base64url of `c1.<conversationId>.<seq>`. A cursor naming another conversation, or malformed, is refused (`invalid_request`, 422) before any read.
- A page reads `seq < before` newest-first `LIMIT 51`, returns 50 oldest-first, and sets `before` only when the 51st exists: no gap, no duplicate.

**Atomic start.** One transaction (one function, `start_conversation`) inserts the conversation, the first message (seq 1), the reply request when asked, the idempotency record and the event. A failure leaves none of them (A01).

**Human-only writes do nothing else.** `askSophia=false` writes the message, the request record and one feed event. It writes no reply request, job, outbox row, goal, command or allowance (A08). The db test counts rows in each of those tables before and after.

## 5. Saved-text policy `conversation-text-v1` (owner D-1)

This is pack 03 §3, bound to this code. It is a product and technical policy proposal, not a legal conclusion.

- **What is saved:**
  - the text members submit in a named project conversation (title and messages);
  - Sophia's published replies in it;
  - who wrote each and when, ids, order, reply requests and their states;
  - the idempotency records (digests and ids only).
  - Drafts stay in the browser's memory: today `talk-store.ts:54` keeps them in a `Map`, never in `localStorage`, and nothing changes that.
- **Who reads it:** the project's current members, viewers included. Membership is checked on every read. Nothing from Personal is imported. There is no private mode inside a team project.
- **How long:** for the life of the project, until withdrawn or erased. No numeric TTL is invented. A stricter organization policy, if one is named, wins.
- **Controls:** an author withdraws their own message; an admin withdraws any message or erases a conversation. Viewers neither write nor erase. These controls reach conversation records only.
- **Not backfilled:** no room chat, voice, captions, screenshots, telemetry or personal history becomes a conversation. A conversation is created only by Start.
- **Limits disclosed, not hidden:**
  - Hosted database backups keep their own retention.
  - Text sent to the model provider for a reply (G2) is under the route's provider terms.
  - A reply's runtime session journal on the runtime host keeps its prompt until host cleanup (§8.5).
  - A reply already delivered to a browser cannot be made unseen.
- **Notice (proposed copy):** shown above the composer before a person's first message in the project, and reachable afterwards from the conversation's context disclosure. *"Messages here are saved for this project and can be read by its members. Asking Sophia sends this conversation's recent messages and the project's accepted decisions to [the provider and model of the route Davide designates], under that provider's terms. Live room audio is not saved here."* Before activation, the bracket is replaced by the actual recipient, and the bounded runtime and provider retention limits are stated or linked (§8.5). The final words follow the policy as accepted; they do not promise zero provider retention or absolute deletion.
- **Activation:** no project saves text until `conversation_settings` names the accepted policy with an `approval_ref` (Davide's decision reference). With the API switch off, nothing is served at all.

## 6. Withdrawal, erasure and what depends on them (G1)

`withdraw_conversation_message(conversation, message, key)` does all of the following in one transaction:
1. Sets the message's `body` to NULL and records `withdrawn_at` and who withdrew it (author or admin).
2. **Suppresses the replies derived from it:** the reply to that message, and any Sophia reply whose context included it (`cutoff_seq ≥` its seq, §8.3). Their bodies are set to NULL with `withdrawn_by_role = 'source'`. **owner** D-2: the alternative keeps replies that only read it, with a disclosed limit. The proposal suppresses them, because a reply can quote what it read.
3. Fences open reply requests whose context includes it (`cutoff_seq ≥` seq): `cancelled` / `source_withdrawn`, and G2's capture refuses their late result (§8.3).
4. Deletes the summary and question projections that cover it. Suppressed, not shown "stale" (pack 03 §2).
5. Redacts the request records that wrote the withdrawn bodies.
6. Increments `revision` and `erasure_revision`, and emits `conversation.updated` / `.message_withdrawn`.

What remains is a tombstone: id, seq, author kind, actor id and time, with no name and no text. Reads after commit never return the body, an excerpt, a summary or a count that includes it: contributors, `sophia` and `lastMessage` are computed from messages that are not withdrawn. A refresh re-reads (the Studio's queries refetch on the feed). An old cached page is replaced, and a withdrawn body is never re-sent.

`erase_conversation` (admins) does the same for every message, sets the title to NULL and `state='erased'`, and hides the conversation from the list. Its ids remain so that replays and late results are refused.

**Out of this crossing's reach, and said so:**
- **Mission decisions.** A decision accepted through A08 from a conversation's words (C7) is the mission's own record, under its own policy. Withdrawing the message does not reverse it. The conversation keeps no link to it today, so nothing dangles.
- **Native copies (G2).** They are bound in §8.5: scrubbed in the database in the withdrawal's transaction, and purged from the runtime host by the retirement procedure.

**The other direction (G2):** a project source withdrawn through A08 suppresses the conversation answers, projections and native copies that read it (§8.3).

The G1 hooks are three internal functions that G2 and G3 replace with additions, never by editing 0048: `conversation_withdrawn_from`, `conversation_redact` and `conversation_ask`.

## 7. Reply correlation in the Studio (G3, with G1's records)

The wait is keyed by `ConversationReply.id`, not by time.
- The view's `asked` entry becomes `{ replyId, messageId, here }`.
- The wait ends only when the asked message's `ask.state` is terminal: `answered` with its `answerId` listed, or `failed` / `cancelled` / `blocked`, each said as such.
- A Sophia message settles only the request named in its `replyTo.replyId`.
- `answeredAfter` and every time-based settlement are removed. An unrelated Sophia message, or a reply to another ask, settles nothing (A09).
- A late reply lands in the conversation it was asked in, whichever is open. It never touches the draft, the held message or another conversation's wait (A11, A22).

## 8. One read-only native reply path (G2; D-6 and B-1 accepted as source design on 2026-10-10; not implemented; no live authorization)

### 8.1 What is reused, and what is not

| Need | Reused | Not reused |
|---|---|---|
| Queue to the runtime | `runtime_instances`, `runtime_commands` (one per outbox row), its receipts, the bridge's long poll, journaling, the deterministic session, epoch fencing, `reconcile_runtime_outbox` (nothing resent blind) | — |
| Dispatch | `claim_runtime_outbox` leases and `dispatch_runtime_outbox` (one added branch, §8.2) | The retired brief's admission (`admit_native_task`, 410 stays), its `draft_brief` job kind and its role `sophia-brief-v1` |
| Result | `native_observations` and the turn end, with a capture branch that publishes into `conversation_messages` (§8.3) | `put_text_source` for the answer: not a project source, so no Knowledge or research reader can find it |
| Readiness | `runtime_unavailable` (reported ready and seen within 90 s), `role_runtime` (advertised role and route) | — |
| Accounting | The semantics of `reserve_research` / `end_research_reservation`: a lock before the check, keyed reservations, and settled, released or uncertain. CON-01 keeps its own grant row as the aggregate, with its own reservations (§8.4) | Any research, design or review grant, allowance or table |

### 8.2 The execution container: option C, bound by the inventory (D-6)

Today, every native session belongs to a `work_attempt`, which belongs to a `goal` (`work_attempts.goal_id NOT NULL`, `outbox.goal_id NOT NULL`, wire `RuntimeWorkBinding.goalId`). A goal hidden from the task board by a filter is ruled out (CX-0001, CX-0002). The options:

- **A. A goal per reply, filtered out.** Rejected.
- **B. A separate reply lane:** its own queue and a bridge poll. It touches no shared table, but it duplicates the leases, journal, reconcile and epoch fencing the inventory shows are goal-independent ([inventory](G2_IMPACT_INVENTORY.md) §8).
- **C. An attempt owned by its reply request instead of a goal.** **Davide accepted it on 2026-10-10 ("Accept option C")**: each read-only attempt belongs to its conversation reply request, with no task and no goal.
  - This is source design only. It authorizes no live effect: OP-0001-r2 stays `draft_not_authorized` ([owner record](OWNER_DECISIONS_2026-10-10.md), published by Codex).

**The impact inventory is written:** [G2_IMPACT_INVENTORY.md](G2_IMPACT_INVENTORY.md), for Codex's review before any G2 code. It covers every reader, writer, constraint and wire field that assumes `goal_id`, `goal_revision`, `authority_epoch`, goal-owned context or `RuntimeWorkBinding.goalId`, in SQL and TypeScript.

**What it found:** every goal-reading SQL function **fails open** on a goal-less row. For example, `native_delivery_ineligible` (`0041:149`) compares `g.authority_epoch` and `g.status` inside `CASE WHEN`; with no goal both are NULL, nothing is true, and the row is delivered. So option C binds two rules together:
1. **Reply first.** Every crossing a reply attempt takes gets an explicit reply branch, evaluated **before** any goal read, with the reply's own fences.
2. **Fail closed elsewhere.** Every goal path a reply attempt must never take gets a guard at its top (`IF g.id IS NULL THEN` refuse, or deny the delivery). These guards are the only behavioural change to those functions.

**The schema and wire, as bound:**
- `work_attempts.goal_id` becomes nullable, with a new `conversation_reply_id` and `CHECK(num_nonnulls(goal_id, conversation_reply_id) = 1)`. The same applies to `outbox.goal_id`. `commands.goal_id` is already nullable.
- `work_attempts.goal_revision` becomes nullable, with `CHECK((goal_id IS NULL) = (goal_revision IS NULL))`.
- The `authority_epoch` columns stay NOT NULL. A reply attempt has **its own** epoch: 1 at admission, raised to 2 by `conversation_cancel`, which writes the `stop`. The bridge's existing stale-epoch rejection and capture's existing epoch rule then fence it.
- **Wire:** A04's `RuntimeWorkBinding` (amended in A16) becomes a `oneOf`: `{goalId, goalRevision}` exactly as today, or `{conversationReplyId}`. There is no `goalId: null`. The bridge reads only `attemptId` and `authorityEpoch`, so its behaviour for goals is unchanged; the generated wire and `dsh-bundle/dist` are rebuilt, and the artifacts are recorded once on the combined candidate.
- One fresh native session per reply (`sophia-<attemptId>`), never reused. Task readers join attempts to goals with an inner join and never see a reply attempt: there is no goal to filter.

**The six functions replaced in 0049** (from their latest bodies, with the named insertions only):
- **`dispatch_runtime_outbox`:** when `o.conversation_reply_id IS NOT NULL`, it runs `conversation_dispatch` and returns, before the goal lock. The reply's fences: the request is `pending` (only a `delivered` receipt makes it `running`, and a lease retaken after reconcile re-dispatches only a row that never got a runtime command, whose request is still `pending`), the conversation is open, the asker still writes, every recorded source satisfies the full predicate (§8.3), and the grant is enabled and unexpired (§8.4). After the goal lock, a `g.id IS NULL` guard denies.
- **`native_delivery_ineligible`:** a first `WHEN g.id IS NULL` refuses. Reply eligibility is its own `conversation_delivery_ineligible`.
- **`capture_native_result`:** the reply branch is matched on the attempt's `conversation_reply_id`, before any goal or job read; a `g.id IS NULL` guard follows it.
- **`runtime_hello`:** today it inner-joins `goals` (`0028:95-102`), so a reply binding would never be restored after a reconnect. It becomes a `UNION ALL` of the goal bindings (byte-identical) and every reply binding not yet `retired`, with the reply's epoch: `active` only while its request is `pending` or `running`, else `stopped` (§8.2.1).
- **`apply_runtime_receipt`** (`0012:464`): a reply branch first, keyed on the attempt's `conversation_reply_id`, before the goal and job reads (§8.2.1). It applies the same goal-independent updates (the command's answered stage, the outbox row, the `commands` row), then the reply's own transitions, and returns. Without it, a rejected create would leave the reply waiting forever (CX-0009), and a reply's `stop` receipt would reach `settle_native_control` with a NULL goal (a no-op there today, but a goal path a reply must not take).
- **`runtime_record_observations`** (`0023:20`): a reply branch for observations whose binding's attempt belongs to a reply, under the conversation writers' lock order, before the insert (§8.2.2). It is a text writer, so it is fenced like one. Goal observations take the unchanged path.

**Not edited, with the reason** ([inventory](G2_IMPACT_INVENTORY.md) §3): the `*_turn_end` functions and `design_input` (a reply has no job, so they cannot run); the `*_scope_of` functions (already fail closed without a job of their kind; a test asserts a reply's call to each is refused); `settle_native_control` and `admit_goal_command` (keyed by goal; `apply_runtime_receipt`'s reply branch returns before `settle_native_control`, and a reply is cancelled by withdrawal, erasure, a source out of the predicate, the grant switch or asker removal); the leases, reconcile and receipt recording (goal-independent, proved under the new lane, A12 and A13); goal triggers and `native_task_view`.

**Admission writes no job:** in the send's transaction, one attempt, binding, command and outbox row, and the request `pending`. Capture keys on the request.

**Preservation evidence:** a test reads each replaced function's `pg_get_functiondef` and asserts it equals its source text (0042, 0041, 0028, 0012 or 0023) with only the named insertions. The existing pinned and behavioural suites stay as they are (`0037_amendment_preservation.sql`, the PUBLIC-execute check, `runtime.db.test.ts`, the full `pnpm test:db` and the integration tests); the bridge's goal-binding fixtures gain a reply-binding twin. A role declaration or a setup flag alone does not qualify the assembled tools.

**Shared windows:** 0049, A04's binding, the generated runtime wire, `dsh-bundle/dist` and the runtime registry are shared files (§2). Each waits for the acknowledgment of #190's owner and the WBC-02/SDD-01 runtime owner, and a named `main` window ([inventory](G2_IMPACT_INVENTORY.md) §7).

#### 8.2.1 Receipts settle what capture cannot (CX-0009 correction 1)

Capture runs only on `turn/end` (`0023:45-46`). Some outcomes never produce one:
- the bridge rejects a command it cannot parse and returns without a session or a turn (`control-bridge.ts:651-665`);
- a create that throws answers `failed`, possibly after its session began (`control-bridge.ts:730`);
- a create, stop or retire whose outcome is not known answers `outcome_unknown`, or nothing at all (a lost lease, then `reconcile_runtime_outbox`).

So the reply branch of `apply_runtime_receipt` is a terminal path of its own. Receipts are already recorded once (`runtime_receipts` `ON CONFLICT DO NOTHING`), so a restart's replay applies nothing twice. Correlation runs through the runtime command (its attempt, then its reply), never through the wire binding a rejected command may lack.

| Receipt | Binding | Attempt | Reply request (visible) | Open reservation (§8.4) | Native copies (§8.5) |
|---|---|---|---|---|---|
| `create` `delivered` | `running` | `running` | `pending` → `running` | unchanged | — |
| `create` `rejected` | `settled` | `failed` | `failed`, `runtime_rejected`, terminal | none can be open (no call left); one found is `released` | `retire` written: the bridge answers `checked` where no session or journal exists |
| `create` `failed` | `lost` | `outcome_unknown` | `failed`, `runtime_failed`, terminal | `uncertain`, still counted against the total | `retire` written: the session may have begun |
| `create` `outcome_unknown` | `lost` | `outcome_unknown` | `outcome_unknown`, **terminal**: nothing is ever published for it | `uncertain`, still counted | `retire` written: nothing will be published |
| `stop` `checked` | `settled` | — | stays `cancelled` (set by `conversation_cancel`) | an open one (its call's `/settle` never came) becomes `uncertain` | `retire` written |
| `stop` `rejected` / `failed` / `outcome_unknown` | `stopping` | — | stays `cancelled`; its purge said pending | `uncertain` | retried at the next hello (§8.5) |
| `retire` `checked` | `retired` | — | its purge recorded done | — | gone from the host |
| `retire` not `checked` | unchanged | — | its purge stays pending, and says so | — | retried at the next hello |

What holds across the table:
- **No new attempt, ever.** An uncertain dispatch keeps its request, attempt and reservation. `reconcile_runtime_outbox` re-dispatches the same outbox row only when no runtime command was ever written; otherwise it waits for the receipt. Asking again is a new message.
- **Terminal and visible.** A `failed`, `cancelled` or `outcome_unknown` request says under its message that no answer came, and that asking again asks anew. None of them publishes anything, ever. The Studio reads `outcome_unknown` as ended, not as a wait (it reads it as open today, when no reply can reach it; G3 changes it with G2).
- **No late publication (CX-0012).** Revision 5 promised that a `turn/end` replayed after `outcome_unknown` could still publish. That is withdrawn: a request leaves `pending` or `running` only once, and nothing moves it back. So a late `turn/end` (a restarted bridge replaying its journal) reaches capture's reply branch, which refuses publication because the request is not `running`; its observations are stored scrubbed (§8.2.2). Withdrawal's scrubbing is never relaxed to recover an answer.
- **No receipt revives a reply.** A receipt that comes after a terminal state (a `delivered` after `outcome_unknown`, a second `failed`) is recorded but moves neither the request nor the binding: the request stays where it ended, the binding stays `lost` or `settled`.
- **Hello.** It lists every reply binding not yet `retired`, so a restarted bridge never resumes one: `active` only while the request is `pending` or `running`; `stopped` otherwise (`lost`, `settled`, cancelled, failed, uncertain), which the bridge disposes and never restores. The `retire` command stays queued until answered `checked`.
- **Spending, one rule (§8.4).** A receipt never settles a reservation: at a terminal receipt an open one becomes `uncertain`, except after a `rejected` create, where no call can have left and it is `released`. `uncertain` stays counted in `uncertain_usd` against the total, through restarts, fresh sessions and deploys, until an operator reconciles it from the usage recorded for the attempt (late observations' usage included, §8.2.2). Nothing resets it, and no reservation is made twice for one request.
- **States, as 0049 binds them.** Open: `pending`, `running`. Terminal: `answered`, `failed`, `cancelled`, `blocked` and `outcome_unknown`, each with `settled_at` set when it is entered. 0048 counts `outcome_unknown` as open (`settled_at` NULL, its open-requests index, and `conversation_withdrawn_from` cancelling it); G1 never produces that state, and 0049 changes the CHECK, the partial index and `conversation_withdrawn_from` (CON-01's own function, not a shared one) to this set. A withdrawal therefore cancels only an open request; one already terminal stays where it ended, while its scrubbing is unchanged (its observations scrubbed in place, its native copies retired, §8.5). The Studio reads the same set: `replyOpen` is `pending` or `running`, and `outcome_unknown` gets its words (G3, with G2).
- **Ask again.** A new message and a new request, with its own attempt and reservation. The uncertain one stays counted. Restart, reconnect and replay never re-dispatch a request: `reconcile_runtime_outbox` re-dispatches an outbox row only when no runtime command was ever written for it, and dispatch refuses a request that is no longer `pending`.

**Tests, receipt-only (no `turn/end` is ever sent):**
- a rejected create: the request ends `failed` / `runtime_rejected` and is said under its message; no second attempt, outbox row or runtime command; no reservation; one `retire`;
- a failed create with an open reservation: `failed`; the reservation `uncertain` and counted; still counted after a restart;
- an `outcome_unknown` create, then a bridge restart replaying the same session's `assistant/message` and a completed `turn/end` (CX-0012's reproducer), in two variants, still eligible and withdrawn before the replay: in both, nothing is published; the observations are stored scrubbed with their usage recorded; the request stays `outcome_unknown` (the withdrawn variant's text is gone either way); one `retire`; no second runtime command, attempt or reservation; `uncertain_usd` unchanged until the operator reconciles;
- a `delivered` receipt after `outcome_unknown`: the request and the binding stay where they ended;
- hello after each terminal state: the binding listed `stopped`, never `active`, until retired;
- `stop` `checked` with a reservation still open: it becomes `uncertain`, counted until an operator reconciles it;
- each terminal state sets `settled_at` (`outcome_unknown` included); a withdrawal of a message an `outcome_unknown` request read leaves the request `outcome_unknown` and scrubs its observations in place;
- each receipt replayed (a restart): applied once;
- a reply's `stop` answered `checked`, then `outcome_unknown`: the request stays `cancelled`; no goal row is read or changed, and `settle_native_control` is never reached;
- `retire` answered `checked`, and not answered at all: done, or pending and said so, then retried at hello.

#### 8.2.2 Observation ingestion is privacy-fenced (CX-0009 correction 2)

`runtime_record_observations` stores each observation's `data` (assistant text, compaction summaries) before capture, and an assistant message never calls capture. Scrubbing existing rows and retiring the host does not stop a buffered observation arriving afterwards from writing withdrawn text back. So ingestion is fenced like the other text writers.

**Lock order.** A batch that holds any observation for a reply attempt first takes the project row `FOR UPDATE`, then each involved reply request row `FOR UPDATE` in id order. This is the order every conversation writer uses: `conversation_locked` takes the project, then the conversation; withdrawal, erasure, suppression and the source triggers then cancel or suppress the requests. So ingestion and those writers serialize, in either order, and never deadlock against each other. Goal observations in the same batch take the unchanged path.

**What is stored, decided under those locks:**
- The request is `pending` or `running`, its conversation is open at the recorded `erasure_revision`, and nothing has suppressed it: the observation is stored as today.
- Otherwise (cancelled, failed, suppressed, answered, retired, or the conversation erased), the row is stored **scrubbed**. It keeps its `binding_id`, `upstream_key`, `type` and `native_seq`, so correlation and de-duplication hold. Its `data` keeps only usage: provider, model, the token counts, the text's length, and `scrubbed: true`.
- **Usage is never lost.** The `usage_records` row is written from the original observation before the text is dropped, keyed by `provider_call_id` as today. A call that happened is counted at its reported cost.
- A `turn/end` still goes to capture, whose reply branch refuses publication for a request no longer `running` and ends its accounting.

**Scrubbing is an update in place, never a delete.** The rows stay, so a batch replayed after a restart conflicts on `upstream_key` and can never re-insert the text. This applies to the withdrawal or suppression transaction (§8.5) and to publication: capture's publication transaction scrubs the attempt's observations too, so the answer's only text copy is its conversation message.

**Tests (real PostgreSQL, the stub provider, labelled L1):**
- withdrawal commits first, then a late `assistant/message` for that reply: stored scrubbed, usage recorded, request still `cancelled`;
- the observation is stored first, then the withdrawal: scrubbed by the withdrawal;
- each order under a held lock, the waiter observed in `pg_stat_activity` (the CX-0006 pattern);
- a delayed assistant message with no `turn/end` after cancellation: scrubbed, capture never called, request still `cancelled`;
- a delayed whole batch (messages, compaction and `turn/end`) after withdrawal: all scrubbed, nothing published, accounting ended;
- the same batch replayed after a restart: nothing re-inserted, no text restored;
- after publication, a late observation: scrubbed, and the answer stays the only copy.

### 8.3 Context, correlation and publication (CX-0002 correction 2)

**Admission** happens with the message, in the send's transaction.
- It records the request: who asked, the message, `cutoff_seq` (the asking message's seq), and the project's `eligibility_revision`, `audience_revision` and `ledger_revision`.
- It writes the execution rows only if the project's grant allows a reply (§8.4) and a ready runtime advertises `sophia-conversation-v1` and its route.
- Otherwise the request is `blocked` with its reason (`no_grant`, `grant_expired`, `runtime_unavailable`, `replies_disabled`). Nothing else is written, and there is no hidden retry.

**Assembly** happens at dispatch (`conversation_reply_statement`), reading at that moment and under the project:
- this conversation's messages up to `cutoff_seq` that are not withdrawn: the newest 40, plus the current eligible summary with its coverage when older messages exist. Truncation is said in the prompt and recorded;
- the current `MissionContext` facts: the accepted mission and constraints with their decided time, and pending proposals marked as not decided;
- the request's own text, attributed;
- the prompt section (pack 04, the exact paragraph), installed as a hashed bundle asset.

Nothing from another conversation, Personal or the room is read.

**The full source predicate** (CX-0003 correction 1). A project source may enter a prompt, and a prompt that read it may be dispatched or published, only while **all** of these hold for it at that moment:
- `project_id` is this project;
- `scope = 'project'` (never `private`: 0001's `source_objects.scope`, which native admission already requires in 0012);
- `eligible` is true and `state = 'ready'`;
- its `sha256` and `eligibility_revision` equal the values recorded at assembly, so a changed body or a re-eligibility is a different source revision;
- the project's `audience_revision` equals the one recorded at assembly.

Assembly records what it put in the prompt:
- **`conversation_reply_sources`:** one row per project source whose text was included, directly or through a summary (below), with `source_id` and the `sha256` and `eligibility_revision` read (the mission frame, each constraint and pending decision's source);
- the conversation messages read (`fromSeq`..`cutoff_seq`) and the `erasure_revision`;
- the project's `eligibility_revision` and `audience_revision` at assembly;
- the attempt's `context_hash`.

**Transitive dependencies through summaries** (CX-0003 correction 2). A summary projection keeps its own dependency set: every project source its generating reply read, each with its recorded revision, and the message range it covers.
- When a later request's prompt includes that summary instead of the old messages, its `conversation_reply_sources` inherits the summary's whole set, and its coverage keeps the summary's message range.
- Dependency is never inferred from what is visible in the current `MissionContext`: it is the recorded union, so a source that has since left the mission context still fences every answer that read it, at any generation.
- Reproducer, a **required test, not yet run** (no G2 code exists): R1 reads source S and produces summary P; S leaves the mission context; R2 reads P; S is then withdrawn, both while R2 runs and after R2 publishes. R2 is cancelled, or its answer suppressed. P is deleted. So is any later projection or answer whose set contains S.

**Revalidation** happens before dispatch (when assembled) and again at publication. The request must still be `pending` at dispatch (§8.2), and `running` at publication; the asker must still be an active writer; the conversation must be open with an unchanged `erasure_revision`; and **every recorded source must still satisfy the full source predicate** above, at its recorded revision.
- A privacy failure cancels the request (`source_withdrawn`, `source_out_of_scope`, `audience_changed`, `conversation_erased`, `asker_removed`). Privacy failures are: a withdrawn message, any source out of the predicate, a changed audience revision, or an erased conversation. The output is suppressed and never published, and its native copies are scrubbed and retired (§8.5).
- An ordinary replacement, where the ledger moved but every recorded source is still eligible (a new decision accepted, a proposal declined), still publishes. The reply carries `contextChanged: true`, and the Studio says "Written before the project's decisions changed". It is never re-run automatically.

**Publication** happens at capture, in one transaction. It requires every condition above plus a complete final assistant message (`turn/end` `completed`). It inserts one Sophia message (`reply_id` = the request; `replyTo` = its message), sets the request to `answered` with `answer_id`, and emits `.reply_changed`. Otherwise the request ends `cancelled` with the privacy reason, or `failed` (`turn_error`, `max_tokens`, `blocked`), and nothing is published. Partial streamed text is never published (A26).

**After publication**, an AFTER UPDATE OR DELETE trigger on `source_objects` fires on **any transition out of the full predicate**: `eligible` turning false, `state` leaving `ready`, `scope` becoming `private`, a changed `sha256` or `eligibility_revision`, or the row's deletion. Typical causes are A08 withdrawal through `mission_erase_source`, research revocation and a design source. An AFTER UPDATE trigger on `projects.audience_revision` does the same for every request recorded at an older audience revision whose answer is not yet published. Published answers stay with their own audience rule, which is the project's current members. For every conversation request whose `conversation_reply_sources` names that source (directly or inherited):
- an open request is cancelled `source_withdrawn`;
- a published answer is suppressed (`withdrawn_by = 'source'`);
- projections generated from it are deleted;
- its native copies are scrubbed and retired.

The triggers are additive: no mission, research or design function is replaced. Tested apart from the conversation-message race, each both in flight and after publication:
- withdrawal while the model runs, and after publication;
- a scope-only change to `private`;
- a changed body or hash;
- an audience change;
- the second-generation summary case above.

**Exactly once.** One request has one attempt and one outbox row. Restart, reconnect and replay read state; they never admit. An uncertain create leaves its request `outcome_unknown`, terminal and never published (§8.2.1); `reconcile_runtime_outbox` decides only the outbox row and never writes a second create; its spend stays counted until an operator reconciles it (A12, A13). Asking again is a new message and a new request.

### 8.4 Role, route and allowance (CX-0002 correction 4; revised for the 2026-10-10 subscription direction)

**Role** `sophia-conversation-v1`: family `conversation`, task kind `conversation_reply`, outputs `["text"]`.
- `native_tools: []`; `workflow`, `peer` and `raw_host_shell` false; no skills, references or image input.
- Inherited framework tools are hidden by `setupFor` (`control-bridge.ts:599-618`). The effective tool list is captured from a live create in the integration test and recorded.
- It cannot create work, accept a decision, edit a source, use an account or reach another attempt (D3, A16, A19).

**Route: none is bound, and none can be activated today.** Davide's 2026-10-10 direction is that replies use Davide's Claude Code and Codex subscriptions, not pay-as-you-go API keys. Revision 6's candidate, a priced `openai` API route, is withdrawn. **No API or pay-as-you-go fallback is authorized**, so no route of that kind is proposed here. Today's runtime has only API-key routes: three OpenAI routes, with keys passed by environment-variable name (`runtime-unit.json:56-70, 179-228`; `runtime-supervisor.ts:131-155`).

What the vendors document about the subscription paths:

| Path | Documented position | Fit with D-6 and B-1 |
|---|---|---|
| Claude subscription credentials used by the pinned dsh runtime (or any Sophia code) | Anthropic, [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance), «Authentication and credential use»: OAuth "is designed to support ordinary use of Claude Code and other native Anthropic applications"; developers "should use API key authentication"; "Anthropic does not permit third-party developers to … route requests through Free, Pro, or Max plan credentials on behalf of their users"; "developers may not collect, store, or intermediate Claude.ai credentials or session tokens" | **Incompatible with the pinned dsh route, in any topology.** dsh is not a native Anthropic application, and Sophia would store and route the token |
| The unmodified Claude Code binary hosted by Sophia, each user signed in with their own subscription | The same page, «Can customers offer Claude Code in their products?»: it requires the Commercial Terms and an unmodified binary; "Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf"; each end user authenticates with their own credentials. «Acceptable use»: Pro and Max limits "assume ordinary, individual usage" | **A documented use, but not B-1's route.** A user signing in to the unmodified binary with their own subscription is documented, locally or hosted under the Commercial Terms. It is a second harness, not B-1's existing pinned runtime. Davide's subscription could answer only Davide's own asks. A home deleted after every reply would need either an Anthropic sign-in per reply, which can't be done headless, or Sophia copying the token into each home, which is intermediation |
| ChatGPT sign-in tokens (the pinned pi-ai adapter ships an OAuth-only `openai-codex` provider that Sophia doesn't configure, and hand-declared routes can't express: `dsh-llm-pi-ai lib/index.js:794-795, 846-856`) | Official OpenAI pages, as Codex read them: `developers.openai.com/siwc/token-sharing-open-source` and its `self-hosted-vms` page, `developers.openai.com/codex-app-server`, and `learn.chatgpt.com/docs/app-server`. **Sign in with ChatGPT plan usage** is documented for open-source apps run by the user, locally or **on a remote VM**. That requires local OAuth for the same user and workspace, a distinct and stable VM host id, a secure transfer of that tool's registration, and a refresh owned by the VM. The pages also disclose that host-specific usage attribution and revocation for a transferred session are not yet available. Offering a paid or remotely hosted service is directed to OpenAI's partner process. Existing app-server authentication is a separate matter: it is never permitted for commercial or hosted services. **Not read here**: this container's network policy blocks `developers.openai.com`. Codex is publishing the exact cited review | **Remote location alone proves no incompatibility.** A user-operated open-source app on a self-hosted VM is a documented topology. Sophia offered as a paid or remote service is directed to the partner process. Today's hosted Sophia route is **unverified and unbound**: which of those topologies it is, and whether it meets the conditions, is not decided here. Nothing here copies a Codex global auth token or transfers a connection or credential; none is authorized |

**Consequence.** For the current hosted, pinned runtime, no reply route is bound, and asks stay `blocked` (`no_grant`). There is no fallback. G2's source, when it is built, is proven against the stub provider only (`tests/support/mock-llm.mjs`, labelled L1); none of it is built yet. Activation needs one documented, supported route for the topology it runs in, named with its documentation. This file asks Davide to approve none of the designs a vendor prohibits, and calls no subscription integration impossible for every topology.

**Grant (`conversation_grants`, one row per project, set by an operator function no login may call).** It is provider-neutral, so that the route can be bound later without a schema change:
- `state` (`enabled` / `disabled`), `route_id`, `credential_ref` (a reference, never a value; for a subscription route, an account the vendor's own flow signed in), `approval_ref`, and **`expires_at`** (required, finite).
- The allowance, in the route's own units:
  - `reply_cap` and `total_cap`, each with a `unit`. The unit is `usd` only for a priced route. Otherwise it is model calls and tokens: `max_calls_per_reply` (at most 2), `reply_token_cap`, `total_token_cap`, `total_call_cap`.
  - The counters `reserved`, `spent` and `uncertain`, in the same units, plus a `revision`.
  - A subscription route has no authoritative per-call price. The runtime's cost fields are "client-side estimates, not authoritative billing data" (Anthropic, [cost tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking)). So its allowance is never in dollars, and Sophia never shows an estimate as a cost (`config/models.json:117`, `exact_cost_claim_requires_usage_evidence`).

No row, a disabled grant or one past `expires_at` means a new ask is `blocked` (`no_grant`, `grant_disabled`, `grant_expired`). A model call already reserved before expiry is settled, and no new call is reserved after it.

**Reservation** (`conversation_reservations`; the `reserve_research` semantics without its tables), **keyed by the request**, never by a home or an attempt:
- **Serialized** by the grant row's `FOR UPDATE`. Two asks competing for the last of the total are decided under that lock: one reserves, the other is refused (`limit_reached`), and the reply fails visibly.
- **Checks:** the request's total + amount ≤ `reply_cap`, and `spent + reserved + uncertain + amount ≤ total_cap`.
- **Ending, one rule:** only two things end a reservation.
  - The bridge's `/settle` for that call ends it `settled` (from the call's reported usage; an overrun is recorded at what it used) or `released` (the call never left).
  - An operator's reconciliation ends an `uncertain` one, from the usage recorded for the attempt.
  - Nothing else settles: a receipt or a late observation never does. At a terminal receipt (§8.2.1) a reservation still open becomes `uncertain`, except after a `rejected` create, where no call can have left and it is `released`.
- **Uncertain** usage stays counted against the total until an operator reconciles it. A restart, a fresh home, a retry or a deploy never releases or resets it.

The bridge's `metered()` gains a `conversation_reply` account with its own runtime routes (`/v1/runtime/conversation/reserve`, `/settle`), scoped to the attempt's request. These are runtime-capability routes, as research's and review's are.

### 8.5 The attempt home and every copy (B-1, accepted 2026-10-10; CX-0002 correction 3)

**Davide's decision (source design, not live authorization):** "Throwaway harness home per reply", on the existing pinned runtime and admission machinery, with isolated writable runtime state and no new VM or harness. Sophia's saved conversation and project records are authoritative. Each answer assembles bounded, currently eligible context (§8.3). No native conversation history is reused across completed replies. The qualifications Codex relayed are bound one by one at the end of this section.

**Today's runtime, as read at `b9815b1`:**
- One long-lived dsh process per project: `runtime-supervisor.ts:176-183`.
- One process-global environment: `HOME=<root>/home`, `TMPDIR=<root>/home/tmp`, `DSH_HOME=<root>/dsh-home` (`:131-154`).
- Every attempt is an agent inside that process, session `sophia-<attemptId>` (`control-bridge.ts:829-832`).
- The bridge journals each command's content to `$DSH_HOME/sophia-bridge/<session>.jsonl` (`control-bridge.ts:970-977`; `session-events.ts:114-181`).
- dsh keeps its session logs under `$DSH_HOME/sessions/`.
- Nothing deletes per-session state. The command kinds are `create, resume, input, steer, hold, stop, inspect` (`0012:75`).

So a per-reply home cannot be had inside that process without switching a process-global home. It needs its own process.

**The reply child (bound design).** Goal attempts keep today's path unchanged. For a reply `create`, the project's bridge does not create an agent in its own process. It asks the supervisor for a **reply child**:
- **The same pinned runtime.** The same dsh launcher and bundle (`unit.runtimeDir`, `unit.launcherEntry`), the same profile digest, and a reply profile that loads only what `sophia-conversation-v1` needs. There is no new harness.
- **Its own environment, set once at spawn and never changed.** `HOME`, `TMPDIR`, `DSH_HOME` and `SOPHIA_WORKSPACE` all point under **`<root>/replies/<attemptId>/`**: `home/`, `home/tmp/`, `dsh-home/`, and `work/`, an empty directory. That directory is created fresh with mode 0700, only after the execution claim answered `first` (below). A directory already present then is a leftover: no child is started, the request is reconciled `outcome_unknown`, and the leftover is cleaned by steps 3–5. A home is never reused. The parent's and the supervisor's own environments never change.
- **No other credentials.** It receives only the reply route's credential reference, by name; none exists until a route is bound (§8.4). dsh's local credential store (`config/dsh/base-rows.reviewed.json:100-101`) is disabled in the reply profile.
- **Writes are contained by the operating system, not by convention.** Passing the child no other path is not isolation: it runs as the same user. The reply launcher applies a filesystem rule before it executes dsh:
  - read and write only in its own home;
  - read only on the runtime directory, the pinned Node executable and the system libraries;
  - nothing else, including other projects' roots and the project's own `home`, `dsh-home`, `work` and `workspace`.
  The mechanism is Landlock, which needs no privilege, or the equivalent the runtime owner names for the deploy host. **It is qualified on the actual host, not by kernel version** (CX-0030):
  - **ABI.** The launcher reads the host's Landlock ABI (`landlock_create_ruleset` with `LANDLOCK_CREATE_RULESET_VERSION`) and requires ABI 3 or later, so that truncation is handled too. It handles every filesystem right that ABI defines.
  - **Inherited descriptors.** A ruleset does not restrict descriptors already open, so the launcher closes every one except four before it restricts and executes: the prompt pipe (read), the observation pipe (fd 3), and stdout and stderr to the supervisor's diagnostics.
    - **Four is the pre-`exec` launcher boundary** (CX-0031), not the running process's total.
    - A test records the launcher's own `/proc/self/fd` at that moment, just before `exec`, and finds exactly those four.
    - The running Node and dsh then open their own: the session log and journal files, sockets to the API and the provider, and event-loop descriptors. All of them are opened under the ruleset.
    - A second test accounts for every descriptor of the running child by provenance: files inside the home, the four pipes, sockets, and event-loop objects. It finds no file descriptor inherited from before the restriction.
  - **Self-test.** After restricting itself, the launcher tries to create a file outside the home. If that succeeds, it refuses to start.
  - Where any of these fails, no reply child is started: the create is answered `rejected` (`containment_unavailable`), and asks stay inactive.
  This is a new launcher in the runtime image, so it is part of the shared-file request.
- **Read-only shared files.** The runtime directory, bundle and assets are read-only to the child under that rule, and their digests are checked before and after (the recorded artifacts).
- **The parent keeps no content.** The prompt goes to the child on a pipe, never in `argv`, the environment or a parent file. The parent journals no content for a reply. Its only durable record is the API's **execution claim** (below), which is content-free.
- **The child journals before it emits.** Each observation is appended to the child's journal in its home, and fsynced, before it is written to fd 3, a separate pipe from stdout and stderr, which the supervisor buffers as diagnostics (`runtime-supervisor.ts:76, 209-210`). The journal is therefore a superset of anything the parent forwarded, and it is the contained recovery record (crash recovery, below). The parent forwards through the existing observation route with the reply's binding and epoch, holding only memory.
- **Proposed implementation ceilings, not an allowance or a grant:** at most 2 reply children per project, and a 120 s deadline per reply. A third `create` is answered `rejected` (`runtime_busy`), so the request ends `failed`, visibly; asking again is a new ask.
- **An identity-bound lease.** The supervisor holds each child's process handle, and stops it through that handle. For the restart sweep only, a content-free lease file in the child's home records:
  - its pid;
  - its process start time (`/proc/<pid>/stat`, field 22);
  - the boot id (`/proc/sys/kernel/random/boot_id`);
  - its executable (`/proc/<pid>/exe`);
  - a random spawn nonce, also given to the child in its environment.
  A process is killed only when **all five** match the live process, and the signal goes through a handle bound to that process, never to a numeric pid (CX-0030). Checking five fields and then calling `kill(pid)` leaves a window in which the pid could be reused. The sweep therefore:
  1. opens a `pidfd` for the pid (`pidfd_open`);
  2. verifies the five fields from `/proc/<pid>`;
  3. confirms through that `pidfd` that the same process is still alive (signal 0);
  4. only then signals it through the `pidfd` (`pidfd_send_signal`).

  A process that died meanwhile answers `ESRCH`, and nothing else can be hit. Where `pidfd` isn't available on the host, nothing is signalled and the home is left unresolved. Any mismatch kills nothing, and the home is left unresolved and reported. No unrelated process is ever signalled. The child also exits when its control pipe closes.

**Every copy, and what governs it.** "Contained" means inside `<root>/replies/<attemptId>/`, deleted whole at cleanup.

| Copy | Where | How it is governed |
|---|---|---|
| dsh session log (history, user and assistant messages) | child `dsh-home/sessions/…` | Contained |
| The reply's journal (the prompt, and every observation before it is emitted) | child `dsh-home/sophia-bridge/<session>.jsonl` | Contained. It is the crash-recovery record, deleted only after reconciliation |
| The lease file | child home | Content-free (ids, times, nonce); contained |
| The execution claim | `conversation_executions` (0049, CON-01's own table) | Content-free: the attempt, the command, the claiming lease, the time and the outcome. Retained after the home is deleted and across restarts. It is the replay fence |
| dsh storages, attachments (none: no image input), startup logs | child `dsh-home/{storages,attachments,logs}` | Contained |
| Spill and temporary files, adapter caches | child `home/tmp`, child `home` | Contained |
| Credentials | the child's environment only; dsh's local store disabled | Never written to disk by Sophia |
| Pipes and the parent's relay buffer | parent memory | Transient: dropped at settlement. Never journaled or logged |
| Supervisor stdout/stderr buffer | supervisor memory | The child prints no conversation text; a test scans for the canary |
| Core dumps | — | Disabled for the child (`RLIMIT_CORE 0` in its launcher); a crash test asserts no `core*` file anywhere under `<root>` |
| The create payload (the prompt) | `runtime_commands.body.payload.text` | Scrubbed in place to a fixed marker and its length **at settlement** and at withdrawal or suppression. Nothing re-sends it after delivery (§8.2.1). If an immutability trigger forbids the update (checked before 0049), the prompt is not stored there at all and the child fetches it through a scoped runtime read |
| Assistant text and events | `native_observations` | Scrubbed in place at publication, withdrawal and suppression; late ones are stored scrubbed (§8.2.2) |
| Usage | `usage_records` | Usage only, no text |
| The answer | `conversation_messages` | The governed record: withdrawal and suppression (§6, §8.3) |
| API, worker, bridge and supervisor logs | process logs | Body-free (`companionFailure`, `diagnostics/sanitize.ts`); a test asserts no conversation text reaches any log line |
| The provider's own retention | the vendor | Disclosed (§5); not Sophia's to delete, and never called deleted |

**The execution claim: the replay fence (Codex, CX on `3c1158d`, P1).** The home can't fence a duplicate once it is deleted, and the parent journals no content. So the fence is a durable, content-free record in the database, consulted atomically **before any spawn**:
- **The claim.** On a reply `create`, the bridge calls `/v1/runtime/conversation/claim` with the command id, attempt, epoch and its lease. `conversation_execution_claim` inserts `conversation_executions(attempt_id PRIMARY KEY, command_id, lease_id, claimed_at)`, under the request's row lock, only while the request is `pending`, the epoch is current and the binding is active, with `ON CONFLICT DO NOTHING`. It answers `first` only if this call inserted the row. Otherwise it answers `refused` (`already_claimed`, `not_pending`, `stale_epoch`).
- **Only `first` spawns.** Any other answer, a lost answer, or the API being unreachable spawns nothing. The rules that follow:
  - A claim retried after a lost answer finds `already_claimed`, so nothing spawns, and the request is reconciled `outcome_unknown`: fail closed, never a second execution.
  - A duplicate `create` (buffered, re-delivered, or replayed after a restart), at any point (during execution, after success, failure or `outcome_unknown`, after `retire`, with or without its acknowledgment) is refused by the claim. It spawns no process and makes no model call, and it touches no reservation, since reservations are made per model call by the claimed execution only.
- **Retention.** The row is retained after the home is deleted and across restarts. It is never deleted by the runtime, and it holds no text.
- **What isn't the fence.** The outbox's one row per request is not this fence. It only keeps the database from dispatching twice.

**Lifecycle: settle, persist or keep, then clean.**
1. **The reply ends.** It ends by `turn/end`, a `stop` (withdrawal, erasure, a source out of the predicate, the grant switched off, the asker removed), the reply deadline (a `stop`; the request ends `failed`/`timeout`), or the child dying.
2. **Stop and reap.** The parent sends `stop`, then `SIGTERM` after a 2 s grace and `SIGKILL` after 5 s, through the supervisor's handle, and **waits for the exit**. Nothing is cleaned while the child lives.
3. **Reconcile against the contained journal.** The API's existing idempotent records are the content-free acknowledgments:
   - each observation by `upstream_key` (`native_observations`);
   - its usage by `provider_call_id` (`usage_records`);
   - each reservation's end by its call (`conversation_reservations`);
   - the terminal receipt, recorded once (`runtime_receipts`);
   - the request's terminal state.
   The parent reads the child's journal in the home and asks the API (`/v1/runtime/conversation/acknowledged`: keys and states only, no text) which of its observation keys are recorded. It sends those that are not. **A recovered observation never publishes:** it is stored scrubbed, with its usage kept, unless the request is still `running` and the turn ended in this same, uninterrupted run (§8.2.2, CX-0012). An open reservation becomes `uncertain`, and an operator reconciles it from the recovered usage. Nothing is re-run.
4. **Clean, only behind the full acknowledgment barrier** (CX-0030). Every one of these must be confirmed by the API, not only that the observation keys exist:
   - every observation key in the journal is recorded;
   - capture's result is committed: the publication, or its refusal with the reason;
   - the usage of every provider call the journal names is recorded;
   - each reservation of the request is ended `settled` or `released`, or is `uncertain` and counted;
   - the terminal receipt is recorded;
   - the request's terminal state is committed.
   `/v1/runtime/conversation/acknowledged` answers all six, by keys and states only, never text. Any one missing means no cleanup (step 5). The settlement's `retire` (a new runtime command kind: a reviewed change to `runtime_commands.kind` and the wire) then has the parent:
   - check the identity-bound lease (no live child);
   - check that the path is `<root>/replies/<attemptId>` and not a link;
   - delete it whole without following links;
   - verify it is gone;
   - only then answer `retire` `checked`.
5. **Otherwise the home stays, unresolved.** That covers a journal unreadable or torn beyond its last whole entry, an acknowledgment that can't be obtained, a lease that doesn't match, or a deletion or verification that fails. `retire` is answered `failed`, never `checked`. The purge stays pending, is said to be pending (§6's withdrawal answer: the runtime copy goes when the runtime next runs), and is retried at the next hello. No receipt ever says a copy is gone that isn't.

| Outcome | Path |
|---|---|
| Answered | `turn/end` → capture publishes → steps 2–5 |
| Failed (`turn_error`, `max_tokens`, `runtime_busy`, `timeout`, `containment_unavailable`) | Terminal receipt or capture refusal → steps 2–5 (no home, for a create rejected before the claim) |
| Cancelled | `conversation_cancel` raises the reply's epoch to 2 and writes `stop` → steps 2–5 |
| Bridge or supervisor restart | Every reply child's control pipe closes, and it exits. Before reporting ready, the supervisor sweeps `<root>/replies/*`. A live process matching all five lease fields is stopped; any mismatch kills nothing and leaves the home unresolved. Hello lists the reply binding `stopped`, and a request that was `running` ends `outcome_unknown` (§8.2.1). Then steps 3–5, recovering from the home's journal |
| Orphan (a child alive after its parent was killed) | It exits when its pipe closes. If it doesn't, the restart sweep stops it, identity-matched, before its home is touched |
| Crash after the child emitted a result or usage, before the API acknowledged it | The journal holds it (journal-before-emit). The restart path's step 3 delivers it scrubbed with its usage. If it can't, step 5 leaves the home unresolved |

**Withdrawal.**
- **Generation is fenced.** The epoch rises, `stop` is written, and the child is stopped (step 2). A later `create` for that attempt is refused by the claim (`not_pending`).
- **Publication is fenced.** Capture refuses a request that is not `running` (§8.3).
- **Execution settles** (steps 2–3), and the host copies go (steps 4–5), or stay reported as pending.
- **Late output restores nothing.** Anything the child emitted after the stop, live or recovered from its journal, is stored scrubbed with its usage kept (§8.2.2). It never reaches a page, and the home it came from is deleted.

**Fresh home and retry.**
- A home belongs to one claimed execution. An attempt has at most one claim, and a request has one attempt (§8.3, exactly once).
- The only re-dispatch is `reconcile_runtime_outbox` re-sending an outbox row for which no runtime command was ever written. Its `create` is the first to reach the claim. It runs for the **same request**, against the **same cumulative allowance**: reservations and publication are keyed by the request, and capture inserts at most one answer per request.
- An execution that may have started (a claim taken whose outcome is unknown, or a lost claim answer) is **uncertain**. It is reconciled (step 3) before anything else: the request ends `outcome_unknown`, its open reservation becomes `uncertain`, and it is never re-run.
- Asking again is a new message, a new request and a new claim.

**Codex's qualifications, each to its binding and test** (all L1: real PostgreSQL, the stub provider, the real supervisor, bridge and launcher). The canary scans are evidence, not exhaustive proof; containment rests on the operating system's rule and the traced writes.

| Qualification | Bound by | Test |
|---|---|---|
| An actual writable home per attempt | The reply child, `<root>/replies/<attemptId>/` | Two concurrent replies: each child's `/proc/<pid>/environ` has `HOME`, `TMPDIR` and `DSH_HOME` inside its own home, and its dsh session log and journal are found there |
| No process-global home switching under concurrency | The environment is set at spawn, per child; the parent's never changes | The parent's and the supervisor's `environ` are identical before, during and after two concurrent replies |
| Shared binaries and assets read-only | The launcher's filesystem rule; digests | A write by the child into `runtimeDir` fails (`EACCES`); the digests are unchanged after the replies |
| Unrelated mission homes untouched; every writable path contained or suppressed | The launcher's filesystem rule, qualified on the host (ABI 3 or later, every right handled, inherited descriptors closed, self-test); no content in the parent | The child's every file-writing call, traced (`strace -f`, the `open*`, `creat`, `rename*`, `unlink*`, `mkdir*`, `link*` families), lies inside its home. A write by the child into the project's `dsh-home` and into another project's root fails. A snapshot of those trees is unchanged, except the parent's content-free claim calls, which touch the database only. Where the rule can't be enforced: `rejected` `containment_unavailable`, and no child |
| Every session file, journal, temp file, cache, log and copy accounted for | The copy table above | A canary in the prompt and in the answer. After cleanup, a scan of every file under `<root>`, `/tmp`, the supervisor buffer, the API, worker and bridge logs, and every database table finds them only in `conversation_messages`, and only for an answered, unwithdrawn reply. Evidence, not proof |
| Stop and settle the process before cleanup | Step 2 | Cleanup's start is ordered after the child's exit (a test hook records both) |
| Persist the result, delivery and accounting first | Steps 3–4: the full acknowledgment barrier | The home exists until all six acknowledgments are confirmed, then it is gone. Each one withheld in turn (a capture not committed, a usage row missing, a reservation still open, the receipt missing, the request not terminal): the home stays |
| A crash after a result or usage, before its acknowledgment | Journal-before-emit; step 3 | Kill the parent, then the child, between the child's emit and the API's acknowledgment: after the restart, the observation is recorded scrubbed with its usage, nothing is published, and the home goes after. With the journal made unreadable: the home stays, `retire` `failed`, said pending |
| A durable replay fence, retained after cleanup and restart | The execution claim | The same `create` delivered again during execution, after success, after failure, after `outcome_unknown`, after `retire`, and after `retire` with its acknowledgment lost, and replayed by a restarted bridge. A claim answer lost, then retried. In every case: one spawn at most (the launcher's counter), the stub provider's call log unchanged by the duplicate, the grant's counters unchanged, one answer at most |
| Success, failure, cancel, timeout, restart and orphans | The outcome table | One test per row, each ending with no home and no canary, or with the home reported unresolved where the row says so. The orphan by `SIGKILL` on the parent |
| No unrelated process signalled | The five-field lease, signalled through a `pidfd` | A lease rewritten to name another live process (same command line, different start time or nonce): the sweep kills nothing and reports the home unresolved. A child that exits between the check and the signal: `ESRCH`, nothing else signalled |
| A cleanup failure is unresolved, never a deletion success | Step 5 | A deletion forced to fail: `retire` `failed`, purge pending and said so, retried at hello, never `checked` |
| Withdrawal fences generation and publication, settles execution, cleans copies; a late result cannot restore content | The withdrawal paragraph | Withdrawal mid-run, output arriving after the stop, and the same output recovered from the journal after a restart: nothing published, stored scrubbed, home deleted, no canary left |
| A fresh home or retry keeps the same Ask and cumulative allowance, reconciles an uncertain execution first, and cannot publish twice | The claim; the retry paragraph | A re-dispatched outbox row (no command written): the same request, the same reservations, one answer at most. A lost claim answer: `outcome_unknown`, no execution |

B-1's earlier options (file removal at the pinned layout, or a disclosed retention) are withdrawn. dsh `0.2.0-rc.2` still has no supported deletion of a persisted session: its store's `delete` is in memory only (`dsh-session lib/index.js:1771`). The home is deleted whole instead, so no undocumented layout is relied on. Backups and provider retention are disclosed separately (§5). Operational storage is never treated as a backup exception.

### 8.6 The owner-native resource connection, subscription figures, and the new test project (2026-10-10 direction)

**Two requests, kept apart.**
- **CON-01's read-only reply inference (§8.4).** A route for Sophia's own answers in a conversation. It is unbound for the current hosted, pinned runtime.
- **The owner-native resource connection Davide asked for: his Claude Code and Codex, connected through their subscriptions, with their remaining caps visible in Sophia.**
  - It already has a binding: `docs/pack/architecture/11_OMNIGENT_BINDINGS.md`. `davide-codex` and `davide-claude` are owner-operated native execution resources; "a resource is an owner-authorized native execution route, not an API key that turns a subscription into general inference"; "the native applications keep their own vendor authentication on the owner's host"; and Sophia "receives delegated access to our Omnigent server, not a Claude or ChatGPT OAuth token" (`:7`). It has an owner device grant per person and a project-scoped resource grant (`:13-27`).
  - Its ownership: SCM-01 to SCM-03 for the owner resources, and SCM-04 and SCM-05 for capacity (`execution/2026-10-01-unified/04_SEQUENCE_AND_OWNERSHIP.md:10`; `LUIS_FRONTEND_TRACK.md:43, 47`), under Davide with a scoped implementation agent, and Luis on the UI.
  - Today it is **proposal and fixture only**: the Resources tiles are fed by a fixture (`ProjectShell.tsx:154-157`), and no enrollment route is deployed.
  - **CON-01 depends on it and does not build it.** Davide's request is recorded as a dependency on that binding and its owners. It is not dismissed as a CON non-goal, and CON-01 builds no competing connection, collector or harness.
  - A connected owner resource is **not** CON-01's reply route. Using it for conversation replies would be subscription-as-general-inference, which the binding excludes.

**What Sophia may show about a subscription** (the Resources view, through that binding):
- **Attributed.** Each figure names the resource, the account it was read for, and when it was observed. Host-specific attribution of a transferred ChatGPT session is not available per OpenAI, so none is claimed.
- **Kept apart.** As `11_OMNIGENT_BINDINGS.md:181` already binds: "actual reported tokens, estimated dollar equivalent and subscription quota are different fields". Context use and Sophia's execution allowance for replies (§8.4) are separate again. Each has its own label.
- **Absent and stale said as such.** "An unavailable quota/cost is `null` with coverage, never zero" (`:181`). A figure not reported says "not reported". One older than its window, or than the source's stated freshness, says "as of" with its time. Nothing is extrapolated.
- **Only from a documented source.**
  - Anthropic documents one: the status line's optional `rate_limits.five_hour` and `rate_limits.seven_day` (`used_percentage`, `resets_at`), for Pro and Max, after the first response ([status line](https://code.claude.com/docs/en/statusline)). Its availability in headless runs is not documented, and none is inferred.
  - No OpenAI source is bound here.
  - The fixture never reaches production (WBC-01: "not a fabricated Claude/Codex account or quota").

CON-01 itself shows only the Sophia allowance for replies (§8.4), labelled as such. It runs no monitoring automation.

**The new test project.** The owner asked for a new project, not a seeded one. These are operations, each in OP-0001-r2, which stays `draft_not_authorized`:
- created through `POST /api/v1/projects` (`projects.ts:73-84`);
- its conversations enabled with `set_conversation_settings` (`0048:406-416`);
- two actual Sophia subjects as members. Davide asked for a **second synthetic actual Sophia account**. Codex found the creation path (the Supabase dashboard's Add user / Create user), and its setup draft is prepared. The live Studio signs in by email OTP, so the owner-controlled test mailbox, the roles and the subjects all **remain unbound**. No credential has been entered and no account created. They are bound in Codex's real-auth setup batch, with no fabricated JWT and no cohort (D-7);
- no grant until a route exists (§8.4).

## 9. Studio binding (G3)

- **The four calls** move to `apps/studio/src/api/conversations.ts`, with generated A16 types and validators. Query keys lose their `'vision'` prefix and keep `accountOf(identity)` (the token subject, #189), so CON-01-T05 holds.
- **The tab.** It is shown when `CONVERSATIONS` is set: a new build flag `VITE_SOPHIA_CONVERSATIONS=1`, separate from `VISION`, which production never sets. The fixture config sets both. **owner/Luis** D-5.
  - The list's `capability` decides the rest at run time: Start and the composer only when `capability.write`; Ask Sophia's default and a blocked notice from `capability.ask`.
  - `capability` comes from a read before anything is written, so no client calls a write the server would not serve. A switched-off API answers the list with 404, and the view says "Conversations aren't available here yet", never "No conversations".
- **Kept as they are:** the panes, focus and scroll rules, held writes with one key per intent, per-conversation drafts, the read errors (each pane fails separately), the A08 Accept / Decline / Propose controls, and the mobile single screen.
- **Added:** the saved-text notice (§5), "Withdraw" on one's own message and an admin's "Remove", coverage words (§3.1), a reply's terminal states in words, and `contextChanged`.
- **Advisory capabilities.** The list's `capability` decides only what is offered. Every write rechecks authorization, policy, settings and the grant in its own transaction, and a refusal is said as one (CX-0002).

## 10. Output references

No CON-01 path writes a conversation–output association, and new artifacts are out of scope. So `output` is `null` for every conversation this slice creates, and the db test asserts it (A21's negative arm, L1). No association is invented to make a positive test pass.

A21 is **not** closed as not-applicable (CX-0002). The existing linked-output rendering and navigation, a non-null `output` opening its exact version in the document viewer (`OpenConversation.tsx:246-269`), stays as it is and is tested through the existing fixture. That evidence is labelled L0. L2 proof needs an actual governed association, which no current source provides.

## 11. Rollout, rollback and reader compatibility

| Switch | Effect off | Effect on |
|---|---|---|
| API env `SOPHIA_CONVERSATIONS` | No A16 route. `/ready` needs nothing from 0048, and the previous API stays ready on a migrated database | Routes are served. `/ready` requires 0048's functions (`CONVERSATION_SCHEMA`) |
| `conversation_settings.state` per project | No row: reads answer an empty list with `capability.write=false`, and writes are refused | `enabled`: writes. `read_only`: reads, withdrawal and erasure still work; new conversations and messages are refused |
| `conversation_grants.state` (G2) | Asks are recorded as `blocked` / `no_grant` | Asks are admitted |
| Studio `VITE_SOPHIA_CONVERSATIONS` | No tab | Tab |

**Deploy order** (for Codex's batch): 0048, then the API with the switch on, then settings for the test project only, then the Studio. G2 follows: 0049, the runtime unit, then the grant.

**Rollback:** first the grant, then settings to `read_only`. The data is kept: no table is dropped, and governed reads, withdrawal and erasure stay available (A29). Disabling a reply never revives it.

### 11.1 A row's order: `messageSeq` and `lastMessage.seq` (CON-01-CC-0023, Codex's review)

A16 adds two optional fields:
- `ConversationSummary.messageSeq`: 0048's `message_seq`, the highest place any message of the conversation has taken, withdrawn ones included. It is 0 before any message.
- `ConversationOpening.seq`: the place of the message the row's opening is from.

Both are whole numbers from 0 (or 1 for `seq`) to 2^53 − 1. They are read from the same snapshot as the row (`SUMMARIES`), with no new SQL object and no migration.

How the Studio uses them (Codex's invariants, each with a unit test in `conversation-list.test.ts`):
1. **A local receipt that is accepted** moves the cached row's `messageSeq` to the receipt's `seq`, as well as setting `lastMessage.seq`. It makes up no `revision`, `lastAt` or coverage.
2. **A receipt is put on the row only when the row's `messageSeq` is below the receipt's `seq`**, even when `lastMessage` is null. Neither an equal place nor a cleared preview gives permission. When only one side says an order, the row's `lastAt` decides, and equal times keep the row.
3. **The exact tombstone cleanup** touches only that conversation's row, in the current account's list reads. Places are never compared across conversations or accounts. Since CON-01-CC-0025 it is a purge of the cache itself, not only of the screen (`withdrawn-purge.ts`, below).
4. **Covered shapes:** only one side ordered; an empty conversation (`messageSeq` 0, no opening); unsafe, fractional and negative bounds; receipts 3 then 2; m2 withdrawn and m3 said in the same millisecond.
5. **The local watermark is a lower bound on observed order, not proof that a message is still eligible.** The current successful list read, and the thread's own tombstone, win over it.

**Withdrawn words in cached list reads (CON-01-CC-0025; Codex's CX-0028 at `7969d40`, pack 03 §5).**
- A cache-level listener (`keepWithdrawnPurged`), installed once per QueryClient, runs on every `updated` event of a conversation list or thread read. It removes a row's opening from the cached list read when the same account's thread read for that conversation holds that message withdrawn.
- It replaces only the list read's data (`Query.setState`): its status, error, `dataUpdatedAt` and update counts stay. So a failing list read still says «This may be out of date».
- A list answer that set out before the withdrawal and lands after the thread's read is purged as it lands. So is a list read put back by a reverting cancel.
- **Who wrote there and Sophia's part (CON-01-CC-0026, PR #199 r4236040713).** The API lists only writers with a message not withdrawn, and says `sophia` only for an answer not withdrawn. So a list read that predates a withdrawal still names the withdrawn writer.
  - For such a withdrawal, the purge applies what a withdrawal here does (`rowWithdrawn`, the same as `listWithdrawn` except the opening): the summary goes; the writer goes unless the pages read still show words of theirs; Sophia's part goes unless they show an answer of hers.
  - It applies only to a withdrawal the list read may not have known, both conditions together:
    1. This view first saw the withdrawal after that read set out. Both are stamped from one counter, never a clock: `listReadSetsOut` in the list's query function, and the first sight in the thread read.
    2. The withdrawal is no older than the row's `lastAt` (one database clock). A withdrawal older than a message the row knows of was known to that read.
  - A list read that set out after this view saw the withdrawal is left as the API says it. That keeps a writer whose words are on pages not read here, and a summary.
  - **Residual, bounded:** a list read in flight when this view first sees a withdrawal on its first read of that thread is treated as possibly older. Its row loses, until the list is read again, a writer whose only remaining words are on pages not read, and its summary.
- **Proof preconditions, not guarantees.** The purge rests on the thread read as cached:
  - A thread read leaves the cache only after 5 minutes unread (the default `gcTime`), with its conversation's erasure (its row goes too), or with the whole cache (any identity change or sign-out clears it, `App.tsx`).
  - A list read is given up after `READ_TIMEOUT_MS` (30 s), and aborted once nothing observes it.
  - A list read that sets out after the thread read is gone sets out after the withdrawal, and the API never says withdrawn words.
- **Not claimed:** that the words are gone from every copy. This covers this Studio's query cache only, not the browser's HTTP cache, the network stack, memory not yet collected, the API's or a provider's copies.

**Reader before API.** A reader built from A16 before these fields rejects a row or opening that says them, because both schemas have `additionalProperties: false`. So the Studio ships with or before the API that says them, and rolling back the Studio means rolling back that API with it. A new Studio reads an older API: neither field is said, and it falls back to `lastAt`.

Whether any older CON-01 reader is enabled anywhere is **UNVERIFIED**.

## 12. Tests written first (mapped to the acceptance ids)

**G1, real PostgreSQL:**

| File | Cases |
|---|---|
| `conversations.db.test.ts` (persistence) | atomic start incl. a failure injected after the conversation insert (A01); lost-reply retry returns the same ids (A02, A03); a changed title, text, ask or target under an old key (A04); viewer write refused, viewer read allowed; outsider, revoked member and guest-less outsider refused on list, page, cursor, replay and withdrawal (A05); a forged actor, name, author, project or reply field refused at the schema (A06); concurrent equal-time sends get distinct seqs, and pages have no gap or duplicate; another conversation's cursor refused (A07); askSophia=false adds zero rows to goals, attempts, commands, jobs, outbox and allowances (A08); askSophia=true before G2 is `blocked` (A10); withdrawal removes the body from pages, contributors, `lastMessage`, `sophia`, projections and replies; replay after withdrawal refused (CON-01-T04); erasure; settings off and `read_only` |
| `apps/api/src/conversations.db.test.ts` | the same crossings through the real routes and Ajv, including 404 with the switch off and the readiness split |
| `db/tests/00NN_conversations.sql` | RLS: a direct `SELECT` as `sophia_api` under another actor sees nothing; no write grant on any table |

**G1 idempotency targets (CX-0002 correction 1):** under one key, withdraw M1 then M2 is refused as changed. So are a changed operation, text or ask; another actor's or another project's use of the same key is its own write.

**G2:** a stub-provider integration through the real API, worker, bridge and dsh (`tests/support/mock-llm.mjs`, labelled L1), covering:
- two conversations' assembled prompts contain only their own messages (T01);
- the effective tool list is empty (A16, A19);
- a hostile request text stays text;
- a late result after a conversation message's withdrawal is refused (T04, A18, A25);
- **a project source withdrawn through A08 while the model runs** cancels without publishing, and **after publication** suppresses the answer, its projection and its native copies (CX-0002 correction 2);
- the attempt home (§8.5): one per reply, deleted whole only after settlement and persistence; every row of §8.5's qualification table; a retired attempt is never resumed (correction 3);
- runtime unavailable, no grant, or an expired grant is `blocked` (A10);
- **two asks competing for the last of the grant's total**: one reserves, the other is refused; uncertain usage stays counted across a restart (correction 4);
- a restart and an uncertain dispatch (A12, A13);
- two pending asks and an unrelated message (A09);
- a long transcript stays within its window (A28);
- no conversation text in any log line;
- the receipt-only cases of §8.2.1 and the ingestion cases of §8.2.2;
- the preservation diff and behavioural checks of §8.2.

**G3:** the existing browser suites against fixtures with A16 shapes, plus a real-API browser run (the local stack, `scripts/dev-stack.ts`), at 390, 1000 and 1440 px.

## 13. Decisions for Davide (owner) and open questions

| Id | Decision | Proposal |
|---|---|---|
| D-1 | Saved-text policy `conversation-text-v1` (§5) and its notice | Accept as written, for the test project first |
| D-2 | Replies that read a withdrawn message | Suppress them too (§6 step 2) |
| D-3 | Admin conversation erasure in this slice | Include (§3, §6). It is small, and a title is saved text too |
| D-4 | Reply route, credential reference, allowance, approval and `expires_at` (§8.4) | **Open, and not askable yet.** Davide's direction (2026-10-10) is the subscriptions, with no API or pay-as-you-go fallback. No documented, supported subscription path fits D-6 and B-1 today (§8.4's table). This file proposes no route until one is named with its documentation |
| D-5 | The Conversations tab's gate (§9), with Luis | A dedicated build flag; `VISION` unchanged |
| D-6 | Execution container (§8.2) | **Accepted, 2026-10-10** (source design, not live authorization): option C, each attempt owned by its reply request |
| B-1 | Runtime host copies (§8.5) | **Accepted, 2026-10-10** (source design): a throwaway harness home per reply, on the existing pinned runtime, with Codex's qualifications, each bound in §8.5 |
| D-7 | The new test project's two actual Sophia subjects and their roles (§8.6) | Davide asked for a second synthetic actual account. Codex's setup draft is prepared. The mailbox (email OTP), the roles and the subjects **remain unbound**; they are bound in Codex's real-auth setup batch, not here |
| Q-1 | Moderation by editors (pack 03 §3 says editors/admins) | Admins only: every writer is an editor here, so editor moderation would let any writer erase anyone |

## 14. Changes to this file

| When | Change | Why |
|---|---|---|
| 2026-10-09 | First version (G0), revision 1 at `b00d07f` | — |
| 2026-10-10 | Revision 8, CX-0031 wording: the four inherited descriptors are the launcher's boundary just before `exec`; the running child's later descriptors are opened under the ruleset and accounted for by provenance | CX-0031 |
| 2026-10-10 | Revision 8, third part, CX-0029/CX-0030. Cleanup waits on the full acknowledgment barrier (every journal key, capture's result, the usage of every call, each reservation ended or uncertain, the terminal receipt, the request terminal), not on observation keys alone. The restart sweep signals through a `pidfd` after checking the five fields, and signals nothing where `pidfd` is unavailable. Landlock is qualified on the host (ABI 3 or later, every right handled, inherited descriptors closed, self-test) and fails closed. The stale "G2's source is built" sentence is corrected. D-7's setup draft is prepared; the mailbox, roles and subjects remain unbound | CX-0029, CX-0030 |
| 2026-10-10 | Revision 8, second part, Codex's subscription review. §8.4's OpenAI row: Sign in with ChatGPT plan usage is documented for a user-operated open-source app locally or on a self-hosted remote VM, under OpenAI's conditions; a paid or remote service is directed to the partner process; app-server authentication is a separate limit; remote location alone proves nothing; today's hosted route is unverified and unbound; no token copied, no transfer authorized. §8.6: the owner-native resource connection recorded as a dependency on `11_OMNIGENT_BINDINGS.md` and its SCM owners, not built by CON-01, and not CON-01's reply route; the display rules aligned with its `:181`; D-7's mailbox reference pending | Codex's subscription review |
| 2026-10-10 | Revision 8, Codex's checkpoint on `3c1158d`. (1) The replay fence: a durable, content-free execution claim (`conversation_executions`) consulted atomically before any spawn and retained after cleanup and restart; only `first` spawns, and a lost answer fails closed. (2) Crash recovery: the child journals before it emits; the API's idempotent records are the content-free acknowledgments; cleanup only when they cover the journal, else the home stays unresolved; recovered output never publishes. (3) A lease bound by pid, start time, boot id, executable and nonce, killing nothing on a mismatch; writes contained by the launcher's operating-system rule (Landlock or equivalent), failing closed where it can't be enforced. 2 children and 120 s labelled as implementation ceilings; the vendor rows corrected (Claude's binary is a documented use, not B-1's route; OpenAI's local and open-source usage is documented); D-7 bound in Codex's setup batch | Codex's checkpoint |
| 2026-10-10 | Revision 7: D-6 and B-1 accepted by Davide as source design (OP-0001-r2 stays `draft_not_authorized`), with the subscription direction. §8.2 records option C as decided. §8.4 leaves the route unbound with no API or pay-as-you-go fallback, states the vendors' documented positions and their exact incompatibility with D-6 and B-1, and makes the grant provider-neutral (allowance in the route's units, keyed by the request). §8.5 binds the reply child in `<root>/replies/<attemptId>/`, every copy and its governance, settle then persist then clean, an unresolved cleanup failure, the restart and orphan sweeps, and each of Codex's qualifications with its test. §8.6 sets the rules for subscription figures and the new test project, its subjects unbound (D-7) | Davide's decisions; Codex's qualifications and checkpoint; Anthropic's legal page, read 2026-10-10 |
| 2026-10-09 | Revision 6, normalized (Codex's note on `a247b78`): dispatch accepts only `pending`; `runtime_hello` lists every reply binding not yet retired; one rule ends a reservation (the bridge's `/settle` or an operator; a receipt or observation never settles; a terminal receipt makes an open one `uncertain`, `released` only after a rejected create), and the duplicated Spending line is gone; `outcome_unknown` is terminal with `settled_at`, 0049 changing 0048's CHECK, open index and `conversation_withdrawn_from`; tests for each | Codex, on `a247b78` |
| 2026-10-09 | Revision 6, CX-0012: an uncertain or failed create is terminal and fails closed. The late-publication promise is withdrawn; no receipt revives a reply; hello lists every reply binding not yet retired, `stopped` unless the request is `pending` or `running`; retire is written at once; uncertain spend stays counted until an operator reconciles it from recorded usage; restart-and-replay tests for an eligible and a withdrawn variant (§8.2.1, §8.3) | CX-0012 |
| 2026-10-09 | Revision 5, CX-0009's two lifecycle bindings: `apply_runtime_receipt` gets a reply branch, the terminal path for outcomes with no `turn/end` (rejected, failed, uncertain, stop and retire), with receipt-only tests (§8.2.1); `runtime_record_observations` gets a privacy-fenced reply branch under the conversation writers' lock order, storing late or disallowed observations scrubbed while keeping correlation and actual usage, with serial, concurrent, delayed, batch and replay tests (§8.2.2); scrubbing is an update in place, and publication scrubs too (§8.5); §8.3's reproducer is labelled a required test until it runs | CX-0009 |
| 2026-10-09 | Revision 4, the option C impact inventory bound (§8.2): goal paths fail open on a goal-less row, so reply-first branches and fail-closed `g.id IS NULL` guards are required together; `goal_revision` nullable with its CHECK; a reply's own epoch; the wire binding a `oneOf` (no `goalId: null`); `runtime_hello` a `UNION ALL`; the four replaced functions named, the rest not edited with reasons; admission writes no job; dispatch accepts `pending` or `running` | CX-0002, CX-0003, CX-0007 |
| 2026-10-09 | Revision 3, the two corrections of CX-0003: the full source predicate (project, `scope='project'`, eligible and ready, recorded `sha256` and `eligibility_revision`, unchanged audience revision) at assembly, dispatch and publication, with suppression on any transition out of it; and transitive dependencies through summaries, recorded as a union, never inferred from the current mission context (§8.3) | CX-0003 |
| 2026-10-09 | Revision 2, the five corrections of CX-0002 (correction 1 was already in 0048; the text now says it): every target in each operation's semantic request (§4); `ProjectionCoverage` bound (§3.1); project-source eligibility recorded, revalidated and enforced after publication (§8.3); the operational copies and their retirement, with B-1 (§8.5); a grant with expiry and serialized aggregate accounting, the effort left to Davide (§8.4); option C with the inventory required before G2 (§8.2); the notice names the actual recipient (§5); A21 not closed as N/A (§10); acknowledgment before shared runtime writes, and no assumed live predecessor (§1, §2) | CX-0002 |
