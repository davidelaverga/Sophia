# CON-01 binding map (G0)

**Mission:** CON-01, saved project conversations ([pack](../../missions/2026-10-09-con01-conversations/README.md), [01 mission](../../missions/2026-10-09-con01-conversations/01_MISSION.md), [03 contract](../../missions/2026-10-09-con01-conversations/03_CONTRACT_AND_RETENTION.md), [04 runtime](../../missions/2026-10-09-con01-conversations/04_RUNTIME_AND_CONTEXT.md)). **Coordination:** [README](README.md). This file binds the pack's proposals to the code at the base: what exists and is reused, what is new and reserved, and what Davide decides. It is G0's deliverable and Codex's review object for the binding. A later change is recorded in §13 with its reason, in the commit that makes it.

**State: proposed.** Nothing here is frozen until Codex's G0 review. G1 (§4–§6) is settled enough to implement against, behind a disabled-by-default switch. G2 (§8) is a proposal with one open structural choice (§8.2). It is not implemented until that choice is reviewed.

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
| Runtime unit (G2) | `sophia-runtime-con01-dev`, `previous_unit: sophia-runtime-wbc02-dev` | A role, its preset, its route and its prompt section change the bundle |
| Role / task kind / route (G2) | `sophia-conversation-v1`, `conversation_reply`, `conversation-luna-v1` (**owner** for the route, payer and caps, §8.4) | No existing role fits: `sophia-brief-v1` is the retired brief's |
| New source paths | `packages/persistence/src/conversations.ts`; `apps/api/src/routes/project-conversations.ts` (a new file, so #190's edits to `routes/conversations.ts` never conflict); `apps/api/src/conversations.db.test.ts`; `packages/persistence/src/conversations.db.test.ts`; `db/tests/00NN_conversations.sql`; `apps/studio/src/api/conversations.ts` (the four calls moved out of `vision.ts`); `docs/coordination/CON-01/`, `docs/progress/CON-01.md`, `docs/handoffs/CON-01-attempt-*.md` | Feature modules stay branch-local |

## 2. Shared files and one writer at a time

| Shared file | Other writer in flight | CON-01's change | Order |
|---|---|---|---|
| `packages/contracts/openapi/openapi.json`, `src/generated-types.ts`, `src/generated/validators.*`, `scripts/generate-validators.ts` (`EXPORTS`) | #190 (A15) | A16 only, regenerated with `pnpm --filter @sophia/contracts generate`. Never hand-merged: whichever lands second merges `main` and regenerates | Whoever lands second |
| `apps/api/src/app.ts` | #190 | Registers `projectConversationRoutes` only when `SOPHIA_CONVERSATIONS=on`, and adds a `CONVERSATION_SCHEMA` readiness check that is required only when it is on (the `STORE_SCHEMA` pattern, `app.ts:164`). `REQUIRED_SCHEMA` is untouched | As above |
| `packages/persistence/src/index.ts` | #190 | One export line | Trivial merge |
| `apps/worker/src/runtime-dispatch.ts` | #190 | None planned. G2 dispatch is SQL. If that changes, it is announced first | — |
| `capture_native_result`, `dispatch_runtime_outbox` (`CREATE OR REPLACE`, last at 0042) | none open (0046 replaces only `media_assignments`) | G2, only under §8.2 option B or C: replaced from 0042's body with one added branch, every other branch byte-identical, and a diff test against 0042's text | Announced in the issue before writing; one writer |
| `config/specialists.json` + schema enum, `packages/dsh-bundle` (`control-bridge.ts`, `role-registry.ts`), `cordis.patch.yml`, `config/runtime-unit.json`, both `specialists.generated.ts`, bundle lock and digests | none open (owner: Davide, LFE-00 map) | G2: one additive role, preset and route. The whole current roster is kept; `pnpm artifacts:record` runs once, on the combined candidate | Single writer window, announced |
| `apps/studio/src/app/route.ts`, `features/studio/ViewNav.tsx`, `ProjectShell.tsx` (Luis's shell) | Luis | Replace the `VISION` gate on the Conversations tab only with a conversations gate (§9). No visual change | Luis is asked in the issue before the edit |
| `apps/studio/fixtures/*` (fixture pages) | Luis, #196 | The fixture pages keep answering under their URL switches, with A16 shapes | After #196 |
| `docs/DESTINATION_MAP.md`, `docs/README.md`, `docs/missions/README.md` | #190 (DESTINATION_MAP rows) | Rows added | Trivial merge |

## 3. The UI proposal (A18) mapped to the real contract (A16)

The four operations keep their paths and meanings (pack 03 §1). A16 adds fields; it does not rename them. Everything is generated: the Studio's hand-written checks for these four calls move from `vision.ts` to `api/conversations.ts`, using the generated validators. Every other `vision.ts` proposal (A12 meetings, A13 recaps and search, A14 focus, A16/A17 reviews and tasks, A19 origins, A20 replies) stays as it is, gated by `VISION`.

| UI proposal (vision.ts) | A16 (this mission) | Notes |
|---|---|---|
| `GET /api/v1/projects/{projectId}/conversations` → `{ conversations }` | → `ConversationList { conversations, more, policy, capability }`, newest activity first, at most 200 | `policy` and `capability` are new (§5, §9). `more` says when the list was capped |
| `ConversationSummary` `id, title, summary, lastAt, contributors, sophia, openQuestions, output, lastMessage?` | Same fields, plus `revision`, `summaryCoverage` and `questionsCoverage` (`ProjectionCoverage`) | `contributors`: writers of messages that are not withdrawn, never readers. `sophia`: a published reply exists. `lastMessage.text`: the opening, ≤140 code points, from a message that is not withdrawn. `output`: always `null` in this slice (§10) |
| `GET /api/v1/conversations/{id}/messages?before=` → `{ messages, before }` | → `ConversationMessagePage { conversationId, messages, before }`, at most 50, oldest first | `before` is opaque and bound to its conversation (§4) |
| `ConversationMessage` `id, author, actorId, name, text, at` | Same, plus `seq`; `text` becomes `string \| null` (null once withdrawn), and `withdrawn: { at } \| null`; a member's message gets `ask: ConversationReply \| null`; Sophia's gets `replyTo: { messageId, replyId }` | Correlation is on the records (§7), not on time |
| `POST /api/v1/projects/{projectId}/conversations` `{ title, text, askSophia }` → `{ conversation, message }` | Same body → 202 `ConversationStarted { conversation, message, sophia, reply }` | `sophia: 'asked' \| 'not_asked'`; `reply` is the request when asked |
| `POST /api/v1/conversations/{id}/messages` `{ text, askSophia }` → `{ message, sophia }` | Same body → 202 `ConversationMessageSent { message, sophia, reply }` | |
| — | `POST /api/v1/conversations/{id}/messages/{messageId}/withdrawal` (Idempotency-Key) → 202 `ConversationWithdrawal` | The minimum erasure control (§6) |
| — | `POST /api/v1/conversations/{id}/erasure` (Idempotency-Key, admins) → 202 | Erases a whole conversation, title included (§6). **owner** D-3 |

Limits (exact, as the API's Ajv counts code points, `ucs2length.ts`, and as SQL `length()` counts characters in UTF-8): title 1–120, text 1–4000 after trimming, page 50, list 200, an opening of 140 (line breaks kept; the Studio shows it on one line). Unknown body properties are refused (Fastify's `removeAdditional: false`), so a client cannot send an actor, author, name, project or reply target.

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

**Idempotency** (CX-0001's namespace). The key namespace is (project, actor, key). The stored semantic request is `{operation, conversationId (send, withdraw, erase), titleSha256, textSha256, askSophia}`, with SHA-256 of the trimmed text and never the text.
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
- **Notice (proposed copy):** shown above the composer before a person's first message in the project, and reachable afterwards from the conversation's context disclosure. *"Messages here are saved for this project and can be read by its members. Asking Sophia sends the conversation to the project's approved model. Live room audio is not saved here."* The final words follow the policy as accepted; they do not promise zero provider retention or absolute deletion.
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
- **Native copies (G2).** The reply's create payload in `runtime_commands`, its `native_observations` and its result are scrubbed by the G2 withdrawal hook (§8.5).

## 7. Reply correlation in the Studio (G3, with G1's records)

The wait is keyed by `ConversationReply.id`, not by time.
- The view's `asked` entry becomes `{ replyId, messageId, here }`.
- The wait ends only when the asked message's `ask.state` is terminal: `answered` with its `answerId` listed, or `failed` / `cancelled` / `blocked`, each said as such.
- A Sophia message settles only the request named in its `replyTo.replyId`.
- `answeredAfter` and every time-based settlement are removed. An unrelated Sophia message, or a reply to another ask, settles nothing (A09).
- A late reply lands in the conversation it was asked in, whichever is open. It never touches the draft, the held message or another conversation's wait (A11, A22).

## 8. One read-only native reply path (G2, proposed; not implemented before review)

### 8.1 What is reused, and what is not

| Need | Reused | Not reused |
|---|---|---|
| Queue to the runtime | `runtime_instances`, `runtime_commands` (one per outbox row), its receipts, the bridge's long poll, journaling, the deterministic session, epoch fencing, `reconcile_runtime_outbox` (nothing resent blind) | — |
| Dispatch | `claim_runtime_outbox` leases and `dispatch_runtime_outbox` (one added branch, §8.2) | The retired brief's admission (`admit_native_task`, 410 stays), its `draft_brief` job kind and its role `sophia-brief-v1` |
| Result | `native_observations` and the turn end, with a capture branch that publishes into `conversation_messages` (§8.3) | `put_text_source` for the answer: not a project source, so no Knowledge or research reader can find it |
| Readiness | `runtime_unavailable` (reported ready and seen within 90 s), `role_runtime` (advertised role and route) | — |
| Accounting | `reserve_research` / `end_research_reservation` serialization and states (settled, released, uncertain), and the source-review precedent: its own grant, plus an allowance row with its own policy (§8.4) | Any research or design allowance |

### 8.2 The execution container: open choice (Codex and Davide)

Today, every native session belongs to a `work_attempt`, which belongs to a `goal` (`work_attempts.goal_id NOT NULL`, `outbox.goal_id NOT NULL`, wire `RuntimeWorkBinding.goalId`). CX-0001 rules out a goal hidden from the task board by a filter, and so does this file. Three options:

- **A. A goal per reply, filtered out.** Rejected.
- **B. A separate reply lane:** `conversation_reply_runs` plus its own runtime command queue and a bridge poll for it. It touches no shared table, but it is a second delivery path in the bridge, close to a parallel scheduler.
- **C (recommended). An attempt owned by a reply request instead of a goal.**
  - `work_attempts.goal_id` becomes nullable, with a new `conversation_reply_id` and `CHECK(num_nonnulls(goal_id, conversation_reply_id) = 1)`. The same applies to `outbox.goal_id`. `commands.goal_id` is already nullable.
  - Every task reader joins attempts to goals with an inner join, so it never sees a reply attempt: there is no goal to filter.
  - Controls (Hold, Stop, steer) are goal-scoped and cannot reach a reply attempt. A reply is cancelled by withdrawal, conversation erasure or the reply switch (§11), each through its own fenced function.
  - The wire binding gains an optional `conversationReplyId` and allows `goalId: null` only together with it: a reviewed runtime-wire change. The bridge already keys sessions, queues and fencing on `attemptId` (`control-bridge.ts:666`).
  - One fresh native session per reply (`sophia-<attemptId>`), never reused, so no withdrawn text survives in a later reply's native history.

  C costs a reviewed change to three shared tables and the two `CREATE OR REPLACE` functions. Its gain: one delivery path, and nothing hidden.

### 8.3 Context, correlation and publication (either option)

- **Admission** (with the message, in the send's transaction) records the request: who asked, the message, `cutoff_seq` (the asking message's seq) and the project's `eligibility_revision` / `ledger_revision`. It writes the execution rows only if the project's grant allows a reply (§8.4) and a runtime advertising `sophia-conversation-v1` and its route is ready. Otherwise the request is `blocked` with its reason (`no_grant`, `runtime_unavailable`, `replies_disabled`), and nothing else is written. There is no hidden retry.
- **Assembly at dispatch** (`conversation_reply_statement`) reads, at that moment and under the project:
  - this conversation's messages up to `cutoff_seq` that are not withdrawn: the newest 40, plus the current summary with its coverage when older messages exist. Truncation is said in the prompt and recorded on the request;
  - the current `MissionContext` facts: accepted mission and constraints with their decided time, and pending proposals marked as not decided;
  - the request's own text, attributed;
  - the prompt section (pack 04, the exact paragraph), installed as a hashed bundle asset.
  
  Nothing from another conversation, Personal or the room is read. Assembly records the `erasure_revision` it read and the attempt's `context_hash`.
- **Publication** happens at capture, in one transaction, only if all of these hold:
  - the request is still `running`;
  - the asker is still an active writer;
  - the conversation is `open`;
  - its `erasure_revision` equals the assembled one;
  - the final assistant message is complete (`turn/end` `completed`).
  
  Then capture inserts one Sophia message (`reply_id` = the request, `replyTo` its message), sets the request to `answered` with `answer_id`, and emits `.reply_changed`.
  - Otherwise the request ends `cancelled` (`source_withdrawn`, `asker_removed`, `conversation_erased`) or `failed` (`turn_error`, `max_tokens`, `blocked`), and nothing is published.
  - If the mission's `ledger_revision` moved meanwhile, the reply is published with `contextChanged: true`. The Studio says "Written before the project's decisions changed" (pack 04: never as an unqualified statement of a replaced decision). It is never re-run automatically.
- **Exactly once.** One request has one attempt and one outbox row. Restart, reconnect and replay read state; they never admit. An uncertain dispatch stays `outcome_unknown` until `reconcile_runtime_outbox` decides, against the same allowance (A12, A13). Asking again is a new message and a new request.

### 8.4 Role, route and spend (owner D-4)

- **Role** `sophia-conversation-v1`, family `conversation`, task kind `conversation_reply`, outputs `["text"]`:
  - `native_tools: []`; `workflow`, `peer` and `raw_host_shell` false; no skills; no references; no image input.
  - It mounts no tools, and inherited framework tools are hidden by `setupFor` (`control-bridge.ts:599-618`), as for `sophia-brief-v1`. The effective tool list is captured from a live create in the integration test and recorded.
  - It cannot create work, accept a decision, edit a source, use an account or reach another attempt (D3, A16, A19).
- **Route** `conversation-luna-v1` (proposed): the approved development model (openai `gpt-6-luna`, Davide 2026-09-24), effort medium, an output cap of 4,000 tokens, priced in `runtime-unit.json` so every call is metered, and the payer is the route's credential. **Not the default route** (unmetered) and **not** a research or review route.
- **Grant.** A per-project `conversation_grants` row (`state`, `reply_cap_usd`, `total_cap_usd`, `approval_ref`) set by an operator function. No row means `blocked` / `no_grant`.
- **Allowance.** One allowance per reply request (policy `conversation-reply-v1`, `max_searches = max_reads = 0`, at most 2 model calls). Reserved before the call, settled from reported usage, and uncertain until reconciled. A fresh session, a retry or a deploy never resets it.
- **Owner D-4:** the route itself, the payer, the per-reply cap (proposed $0.10) and the total for the test project (proposed $5), the approval reference and the expiry.

### 8.5 Native copies and erasure

A reply's prompt exists in `runtime_commands.body.payload.text`, in `native_observations` (assistant text) and in the runtime host's session journal.
- The G2 withdrawal hook scrubs the first two for every reply whose `cutoff_seq` covers the withdrawn seq. Immutability triggers on those tables are checked before 0049 is written.
- The host journal is outside the database. Its retention is the runtime host's and is disclosed (§5), not claimed erased.

## 9. Studio binding (G3)

- **The four calls** move to `apps/studio/src/api/conversations.ts`, with generated A16 types and validators. Query keys lose their `'vision'` prefix and keep `accountOf(identity)` (the token subject, #189), so CON-01-T05 holds.
- **The tab.** It is shown when `CONVERSATIONS` is set: a new build flag `VITE_SOPHIA_CONVERSATIONS=1`, separate from `VISION`, which production never sets. The fixture config sets both. **owner/Luis** D-5.
  - The list's `capability` decides the rest at run time: Start and the composer only when `capability.write`; Ask Sophia's default and a blocked notice from `capability.ask`.
  - `capability` comes from a read before anything is written, so no client calls a write the server would not serve. A switched-off API answers the list with 404, and the view says "Conversations aren't available here yet", never "No conversations".
- **Kept as they are:** the panes, focus and scroll rules, held writes with one key per intent, per-conversation drafts, the read errors (each pane fails separately), the A08 Accept / Decline / Propose controls, and the mobile single screen.
- **Added:** the saved-text notice (§5), "Withdraw" on one's own message and an admin's "Remove", coverage words ("Not assessed", "No recorded questions yet", "Covers messages 1–N; newer since"), a reply's terminal states in words, and `contextChanged`.

## 10. Output references

No CON-01 path writes a conversation–output association, and new artifacts are out of scope. `output` is therefore always `null` in A16, and the db test asserts it. The Studio's existing rendering of a non-null output (`OpenConversation.tsx:246-269`) is kept for a later association. CON01-A21's positive arm is recorded as **not applicable, with reason**, unless Codex or Davide names an existing association source to bind.

## 11. Rollout, rollback and reader compatibility

| Switch | Effect off | Effect on |
|---|---|---|
| API env `SOPHIA_CONVERSATIONS` | No A16 route. `/ready` needs nothing from 0048, and the previous API stays ready on a migrated database | Routes are served. `/ready` requires 0048's functions (`CONVERSATION_SCHEMA`) |
| `conversation_settings.state` per project | No row: reads answer an empty list with `capability.write=false`, and writes are refused | `enabled`: writes. `read_only`: reads, withdrawal and erasure still work; new conversations and messages are refused |
| `conversation_grants.state` (G2) | Asks are recorded as `blocked` / `no_grant` | Asks are admitted |
| Studio `VITE_SOPHIA_CONVERSATIONS` | No tab | Tab |

**Deploy order** (for Codex's batch): 0048, then the API with the switch on, then settings for the test project only, then the Studio. G2 follows: 0049, the runtime unit, then the grant.

**Rollback:** first the grant, then settings to `read_only`. The data is kept: no table is dropped, and governed reads, withdrawal and erasure stay available (A29). Disabling a reply never revives it.

## 12. Tests written first (mapped to the acceptance ids)

**G1, real PostgreSQL:**

| File | Cases |
|---|---|
| `conversations.db.test.ts` (persistence) | atomic start incl. a failure injected after the conversation insert (A01); lost-reply retry returns the same ids (A02, A03); a changed title, text, ask or target under an old key (A04); viewer write refused, viewer read allowed; outsider, revoked member and guest-less outsider refused on list, page, cursor, replay and withdrawal (A05); a forged actor, name, author, project or reply field refused at the schema (A06); concurrent equal-time sends get distinct seqs, and pages have no gap or duplicate; another conversation's cursor refused (A07); askSophia=false adds zero rows to goals, attempts, commands, jobs, outbox and allowances (A08); askSophia=true before G2 is `blocked` (A10); withdrawal removes the body from pages, contributors, `lastMessage`, `sophia`, projections and replies; replay after withdrawal refused (CON-01-T04); erasure; settings off and `read_only` |
| `apps/api/src/conversations.db.test.ts` | the same crossings through the real routes and Ajv, including 404 with the switch off and the readiness split |
| `db/tests/00NN_conversations.sql` | RLS: a direct `SELECT` as `sophia_api` under another actor sees nothing; no write grant on any table |

**G2:** a stub-provider integration through the real API, worker, bridge and dsh (`tests/support/mock-llm.mjs`, labelled L1), covering:
- two conversations' assembled prompts contain only their own messages (T01);
- the effective tool list is empty (A16, A19);
- a hostile request text stays text;
- a late result after a withdrawal is refused (T04, A18, A25);
- runtime unavailable or no grant is `blocked` (A10);
- a restart and an uncertain dispatch (A12, A13);
- two pending asks and an unrelated message (A09);
- a long transcript stays within its window (A28).

**G3:** the existing browser suites against fixtures with A16 shapes, plus a real-API browser run (the local stack, `scripts/dev-stack.ts`), at 390, 1000 and 1440 px.

## 13. Decisions for Davide (owner) and open questions

| Id | Decision | Proposal |
|---|---|---|
| D-1 | Saved-text policy `conversation-text-v1` (§5) and its notice | Accept as written, for the test project first |
| D-2 | Replies that read a withdrawn message | Suppress them too (§6 step 2) |
| D-3 | Admin conversation erasure in this slice | Include (§3, §6). It is small, and a title is saved text too |
| D-4 | Reply route, payer, caps, approval and expiry (§8.4) | `conversation-luna-v1`, $0.10 per reply, $5 total on the test project, with a date-bound approval |
| D-5 | The Conversations tab's gate (§9), with Luis | A dedicated build flag; `VISION` unchanged |
| D-6 | Execution container (§8.2), with Codex | Option C |
| Q-1 | Moderation by editors (pack 03 §3 says editors/admins) | Admins only: every writer is an editor here, so editor moderation would let any writer erase anyone |

## 14. Changes to this file

| When | Change | Why |
|---|---|---|
| 2026-10-09 | First version (G0) | — |
