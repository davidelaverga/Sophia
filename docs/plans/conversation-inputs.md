# Conversation inputs — versioned automatic input retained without effects (INC03-CC-002 S01a)

Source slice for INC03-S01 (pack v2 `modules/INC-03_NATURAL_COMPOSER_AND_CONTINUITY.md` INC03-R01/R02/R04/R12,
`contracts/03_INTAKE_ALLOCATION_AND_EVENTS.md` C03-R01/R02/R05, `contracts/01_DOMAIN_AUTHORITY_AND_FUNDING.md` C01-R15,
read at docs commit `c43701ab`). It is **not** automatic routing, not an assessment, not an HTTP surface and not a
composer. In S01a nothing here was reachable from a request. S01b (below, "The HTTP boundary") adds the two routes,
amendment A49, the regenerated contract outputs and the persistence export, all off by default.

Lease: migration `0095` and seven new files (this plan, the handoff, `db/migrations/0095_conversation_inputs.sql`,
`db/tests/0095_conversation_inputs.sql`, `packages/persistence/src/conversation-inputs.ts` and its two `*.db.test.ts`).
No existing file is edited, and 0095 replaces no function: `start_conversation`, `send_conversation_message`,
`conversation_ask`, `conversation_ask_capability`, `conversation_prior` and `conversation_redact` keep their bytes, and
a test fingerprints all six before and after the migration.

## What exists (read at `7079989c`)

Retargeted unchanged onto the root-selected r14 observer head `25117228`: between the two bases only the observer's
policy, CLI, tests and docs differ, none of which this slice reads or is read by; every seam below is the same bytes.

| Seam | Behaviour |
|---|---|
| `start_conversation` / `send_conversation_message` (0063) | Actor from `sophia.actor_id()`; project row `FOR UPDATE` (send: `conversation_locked`, project row then conversation row); `conversation_writer` (admin/editor now, 42501); `p_ask IS NULL` → 22023; semantic of digests; `conversation_prior` (same → prior receipt, different → 23505, redacted → 40001); `conversation_open` (55000); append; `conversation_ask` when asked; request row with `message_id`; `conversation_moved`. |
| `conversation_ask` (0071) | With an enabled current grant naming the asker, an admitted assembler and a ready runtime: a **pending** reply, a work attempt, an execution binding, a `create` command and a `native.create` outbox row, in the same transaction. Otherwise a blocked reply with its reason. Legacy `askSophia:true` is therefore a real funded native admission, not a no-effect baseline. |
| Withdrawal / erasure | Body and author name nulled; replies reaching it cancelled; `conversation_redact` replaces the `semantic_request` of every request whose `message_id` names a withdrawn message with `{"redacted":true}`, so a retry under that key is 40001. |
| Reads | RLS `is_member` (active membership) and conversation `open`; `conversation_requests` has no grant at all. |
| HTTP | `askSophia` required boolean; omitted, `null` or non-boolean is 422 (no coercion). Not exercised here: no API file is added and no API compatibility is claimed. |

## The new boundary

Two new `SECURITY DEFINER` writers, `EXECUTE` to `sophia_api` only, `search_path=pg_catalog,sophia,pg_temp`, every
identifier qualified:

- `sophia.start_conversation_input(p_project uuid, p_key text, p_contract text, p_title text, p_text text, p_name text)`
- `sophia.send_conversation_input(p_conversation uuid, p_key text, p_contract text, p_text text, p_name text)`

`p_contract` is required and must be exactly `automatic_v1`; `NULL` or anything else is 22023 `Invalid request`.
There is no boolean and no default: a missing contract is never read as automatic, and the legacy writers never
create an input. The TypeScript callers take the contract as a literal-typed argument and check it before the query.

### Order (lock order and current authority)

1. Actor: `sophia.actor_id()`, else 42501. Never a parameter.
2. Lock: start locks the project row; send uses `conversation_locked` (project row, membership re-read, then the
   conversation row). Same order as the legacy writers, so a legacy and an automatic write in one project serialize
   and cannot deadlock against each other.
3. Current writer: `conversation_writer` (admin or editor, active, now), else 42501 — before any earlier request is
   read, so a revoked writer's retry is refused.
4. Contract: exactly `automatic_v1`, else 22023.
5. Text: `conversation_text` (trimmed, bounded) for title and body.
6. Semantic: `{operation, conversationId (send), interactionContract:'automatic_v1', contractVersion:1, titleSha256
   (start), textSha256}` — what was asked, never server-resolved context. A legacy semantic has `askSophia` and no
   contract, so the same key across legacy and automatic conflicts (23505), as do start↔send and changed text.
7. Replay: `conversation_prior` under the existing operation (`start`/`send`). Same key and semantic → the original
   receipt, even after later messages or after the project was made read-only (legacy ordering: replay before the
   open check). Redacted → 40001.
8. Open: `conversation_open` (55000 when off or read-only); a send to an erased conversation → 22023 not found.
9. Write: the conversation (start), the member message (`conversation_append`), the receipt, the
   `conversation_requests` row (with `message_id`, so withdrawal redacts it), the input row, and the existing
   `conversation_moved` event (`conversation.started` / `conversation.message_recorded`). One transaction.

Nothing else: no `conversation_ask`, reply, work attempt, execution binding, command, outbox, runtime command,
reservation, allowance, grant, inference, provider or notification.

### The input record (`sophia.saved_conversation_inputs`)

Named outside `sophia.conversation_%` on purpose: `conversation-runtime.db.test.ts` compares every `conversation_%`
table with the sealed CON-01 candidates and lists later tables by name (0084 added its own there). A
`conversation_inputs` table failed that comparison (shown with and without 0095); editing that existing test is outside
this slice's lease, and the name `saved_conversation_inputs` keeps the existing suite unchanged and passing.

| Column | Value | Why |
|---|---|---|
| `id` | new uuid | the stable input id; returned in the receipt; not a second request key |
| `project_id`, `conversation_id`, `message_id` | server | the one original member message (unique per input) |
| `actor_id`, `idempotency_key`, `operation` | server / client key | correlate to the `conversation_requests` row (foreign key); one input per request |
| `interaction_contract`, `contract_version` | `automatic_v1`, `1` | the input contract only; no routing-policy version until a real assessment exists |
| `origin` | `text` | only typed text in this slice |
| `audience_kind`, `settings_policy`, `settings_revision` | `project_members`, current settings | server-resolved audience; never caller-supplied, never expanded |
| `message_seq`, `conversation_revision`, `erasure_revision`, `writer_role` | after the append | context **references** only, not a frozen manifest or hash |
| `structured_mentions`, `reply_target`, `addressing_basis` | `{}`, `NULL`, `none` | no trusted addressing was supplied; `@text` is never read |
| `state` | `recorded` | the only state in this slice |

No body, title, digest, summary or native history is stored on the row: the text lives once, in the message, and its
digest once, in the request's semantic, which the existing withdrawal path redacts. The row survives withdrawal and
erasure as id metadata.

Reads: RLS for `sophia_api`, `is_member(project_id)` and the conversation `open` (as messages); `SELECT` granted to
`sophia_api` only; no insert, update or delete grant to any login; nothing to `sophia_worker` or the assembler.
Reading this metadata grants no source access and no execution and does not widen the message's audience.

### Receipt

`{conversationId, messageId, inputId, interactionContract:'automatic_v1', contractVersion:1, input:'recorded',
effect:'none'}`. It claims recording only: not received by Sophia, accepted, verified or work started.

## States and crossings

| State / crossing | Expected |
|---|---|
| automatic start / send, enabled, current writer | message + request + input + receipt + event; zero reply/attempt/binding/command/outbox/runtime/reservation rows, even with a grant, assembler and runtime that make legacy `true` admit |
| same key, same semantic, later messages exist | the original receipt; no second message or input |
| same key, changed text / legacy↔automatic / start↔send | 23505, nothing written |
| two connections, same key and semantic | one message, one input, identical receipts |
| two connections, same key, different text | one write, the other 23505 |
| writer demoted to viewer or removed, new write or retry | 42501 |
| viewer, non-member, member of another project | write 42501 / not found; non-members read no input rows |
| member removed after writing | reads none of the project's inputs |
| settings read-only | new write 55000; an existing key replays its receipt |
| contract `NULL`, `''`, `automatic`, `legacy_explicit_ask` | 22023, nothing written |
| message withdrawn / conversation erased | message text gone (existing path); request semantic redacted; retry 40001; input row keeps ids only; erased conversation's inputs leave reads |
| worker or assembler login calls the writers or writes the table | permission denied |
| legacy false / true / `NULL` | unchanged: no input; true admits as before; `NULL` 22023 |
| no payer, no assessment route | the input is still recorded (it needs neither) |

## The HTTP boundary (S01b, amendment A49)

S01b is a blocked development slice, built on native repair4 `a528ab84` plus the 17 API paths of `409d4f75` and these
seven files (starting tree `7f67fe88`). No prefix is accepted. It adds the HTTP boundary for 0095's writers and changes
neither 0095 nor its persistence callers.

| Route | Body (closed) | 202 |
|---|---|---|
| `POST /api/v1/projects/:projectId/conversation-inputs` | `ConversationInputStart` `{interactionContract:"automatic_v1", title, text}` | `ConversationInputStarted` `{conversation, message, input, cursor}` |
| `POST /api/v1/conversations/:conversationId/inputs` | `ConversationInputSend` `{interactionContract:"automatic_v1", text}` | `ConversationInputRecorded` `{message, input}` |

- **Input reference.** `ConversationInputRef` is `{id, interactionContract:"automatic_v1", contractVersion:1,
  state:"recorded", effect:"none"}`. The conversation and message are the A33 DTOs, read back under the writer in the
  same transaction, and the start's cursor is read as for `ConversationStarted`. No digest, semantic, settings, role,
  key or `askSophia` reaches a response, and the receipt has no `sophia` or `reply`.
- **Identity.** The actor is the verified token's subject (`withActor`), and the name is the token's (`nameActor`).
  Path ids must be lowercase canonical UUIDs (the A49 parameter carries the server's pattern; anything else is 422).
  They reach SQL as typed uuids, and the replay semantic uses the conversation's own id, never the path spelling.
- **Refused fields.** `askSophia`, `actorId`, `name`, `audience`, `origin`, `mentions`, `replyTo`, `selection`, `context`,
  `projectId`, any other field, and a missing or other contract are refused with 422 before anything runs.
  `@name` and quotations in the words stay words: addressing stays empty with basis `none`. Trusted mentions, reply
  targets and selections are S01c.
- **Error codes** are the existing mapper's:
  - 403 `forbidden`: not a member, not a writer now (a retry included), or a viewer.
  - 422 `not_found`: a conversation the caller cannot see, including after removal.
  - 403 `conversations_closed`: conversations off or read-only. Read-only still replays a kept receipt.
  - 409 `idempotency_conflict`: other words or title, the other operation, or a legacy key used here and back.
  - 409 `request_erased`: the message was withdrawn or the conversation erased.
- **Switches.** The routes exist only when the API is built with both `conversations` and `conversationInputs`, and
  both are off by default; `server.ts` and the environment set neither. `conversationInputs` without
  `conversations` makes `buildApp` throw.
- **Readiness.** Off, `/ready` requires nothing of 0095. On, `/ready` requires 0095's two writers, and a database
  without them answers the routes `projection_unavailable` (503) with no database message.
- **Legacy A33** routes, schemas and source are unchanged. Legacy true still asks; false is quiet; omitted, `null` and
  non-boolean values are 422. An automatic body on a legacy route, or a legacy body here, is 422.
- **No effect.** No reply, attempt, binding, command, outbox, runtime command, reservation, mention, attention or
  notification follows. A recorded input is not routed, answered, assessed or admitted.

## Not proven here

Routing, mentions, attention, an assessment, funded Answer/Explore/Build, HTTP compatibility, the composer, voice,
personal/private audiences, app acceptance. Answer and Explore need funded API admission; native dispatch needs a
qualified INC02 route. S01b adds the HTTP boundary only, on an unaccepted development prefix: personal or voice inputs,
mentions, reply targets, selections (S01c), assessment, reads and waits (S02), Answer/Explore/Build/manager/control, the
composer and founder acceptance are not done here.

**Current annotation (INC01 coherent composition).** The Switches line above says that `server.ts` and the environment
set neither switch. More exactly: `server.ts` wires `conversations` from `SOPHIA_CONVERSATIONS` (on, off or unset) and
never sets `conversationInputs`, so `server.ts` never mounts the automatic-input routes. Wording only; no behaviour
changed.
