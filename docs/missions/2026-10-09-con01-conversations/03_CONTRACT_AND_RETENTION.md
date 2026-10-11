# Conversation contract and saved-text policy

## 1. Source proposal retained

The following are **existing A18 UI proposals**, read in `vision.ts`, not advertised here as installed APIs:

| Operation | Request | Existing response |
|---|---|---|
| List | `GET /api/v1/projects/{projectId}/conversations` | `{ conversations: ConversationSummary[] }`, newest activity first |
| Read page | `GET /api/v1/conversations/{id}/messages?before=…` | `{ messages: ConversationMessage[], before: string|null }`, oldest first within the page |
| Create | `POST /api/v1/projects/{projectId}/conversations`, Idempotency-Key; `{ title, text, askSophia }` | `{ conversation, message }` |
| Send | `POST /api/v1/conversations/{id}/messages`, Idempotency-Key; `{ text, askSophia }` | `{ message, sophia: 'asked'|'not_asked' }` |

`ConversationSummary`: `id`, `title`, nullable `summary`, `lastAt`, actual `contributors[{actorId,name}]`, `sophia` (answered, not merely asked), `openQuestions`, nullable exact `output{artifactId,versionId,versionNumber,title}`; optional `lastMessage` with author, actorId, name, opening text and time. Existing proposal caps the opening at 140 characters and the title at 120; preserve the repository's exact Unicode/counting rule, or specify and test it explicitly at G0.

`ConversationMessage`: `id`, `author: member|sophia`, nullable `actorId` and `name`, `text`, `at`. Server derives the human actor. Null IDs never merge distinct human authors. Sophia attribution comes from a trusted runtime result, never a browser-supplied author field.

The mission retains these operation meanings and uses generated validation. Additions below must be reviewed and generated, not cast onto the old response. Move only implemented conversation calls off the global vision fixture path; do not enable A12/A14/A19 or other unimplemented features along with them.

## 2. Necessary additive semantics

These are **mission requirements**, not pre-existing fields. Choose the final schema with the current contract owner at G0:

- A stable server-generated conversation-local ordering key and opaque pagination cursor. Timestamp alone is not a tie-breaker or permission boundary. Cursor use is authorized against its conversation/project before lookup.
- A response-request identity linked to the exact admitted human message and conversation, with truthful pending/running/complete/failed/cancelled/blocked state, and the final assistant message identity when it exists. The exact enum must reuse compatible current lifecycle vocabulary; no conflicting universal lifecycle.
- A trusted `replyTo`/response correlation on the assistant result. **“Any Sophia message later than the submission timestamp” must not settle an unrelated pending question.**
- Summary and open-question projection coverage: covered message sequence/range, source/context eligibility revision, generation time, and missing/partial/current/stale/unavailable status. A summary is not a canonical decision. Unchanged eligible older summaries may be marked stale; privacy-invalid summaries must be suppressed, not shown with a warning.
- Applicable saved-text policy identity and explicit capability state. Storage availability and inference availability are separate. Human messages may be retained when replies are unavailable, but the response request must be visibly blocked or not admitted, never falsely progressing.
- Bounded source references for eligible accepted decisions and exact output versions. The backend validates references; generated prose cannot mint authority.

No API number, migration number, route alias or runtime preset ID is allocated by this document. G0 records the actual generated contracts and reservations. New state must describe distinct facts, not duplicate the canonical message content elsewhere.

## 3. Proposed saved-text policy for this mission

This is a product/technical policy proposal to record with Davide before live activation; it is not a legal-retention conclusion.

**What is retained:** only submitted text in named project conversations, successful published assistant replies, their governed source references, explicit user actions and the minimum delivery/evidence metadata needed for correctness. Unsent drafts remain per-account/per-conversation client state under the existing UI behavior. Do not add cloud draft syncing in this mission.

**Audience:** current eligible project members, including read-only viewers. Personal content is not imported automatically. All conversations inside the team project are team-visible under that project's rules; this mission creates no private mode inside a team project.

**Duration:** propose project-lifetime retention until explicit withdrawal/erasure, project deletion, or an already applicable shorter organization policy. Do not invent a numeric TTL or supersede a stricter installed policy. The activation record states the effective policy version, actual lifecycle and any backup retention limitation. No live saving is enabled while those facts remain unspecified.

**Controls:** propose that authors may withdraw their own message; project editors/admins may moderate or erase a conversation under existing project authority. Reuse an existing compatible erasure path; otherwise add the smallest authenticated operation and discoverable UI needed for these controls. Viewers cannot write or erase. Whole-conversation deletion is not a prerequisite for rename/archive/unread functionality. Do not let a member erase unrelated project records through this path.

**Disclosure:** show a clear saved-team-text notice before the first submission and make the current policy/controls reachable afterward. Proposed copy: “Messages here are saved for this project and can be read by its members. Asking Sophia uses the project's approved model route. Live room audio is not saved by this feature.” Final wording must match the effective policy and recipient rules; do not promise self-hosting, zero provider retention, or absolute deletion unless qualified.

**No backfill:** do not reconstruct old room chat, voice, captions, screenshots, telemetry or private assistant history. Existing deliberately saved notes remain separate sources. Typed text in a live room does not become a named-conversation transcript by implication.

**Downstream limits:** application erasure must cover operational storage and derived read paths. Backups and data already disclosed to a provider have their own retention and deletion limits; disclose rather than claim immediate universal destruction. Bodies, excerpts and secrets stay out of routine logs/metrics and public evidence.

## 4. Atomic admission, duplicate requests and failures

Create the conversation and its first human message atomically. When `askSophia=true`, atomically record or compatibly bind the response request and durable dispatch intention before acknowledging that it was asked. A failed admission cannot leave a phantom conversation or a worker with no originating message.

Namespace idempotency by authenticated subject, project/conversation, operation and canonical payload. An identical retry returns the established result after current read authorization. Reusing a key with a changed payload conflicts. Losing membership cannot be bypassed by replaying a formerly valid key.

Two simultaneous clients may submit text; each accepted message receives a unique ordered identity. A cancelled browser request is not proof that the write was cancelled. A received native result is not a new human message. Retry/rehydration cannot create a second response request or erase newer drafts.

`not_asked` creates no response obligation, model call, computer, operational issue, worker wake or paid summary job. `asked` means a durable answer request exists, not that the answer has succeeded. A published reply requires an actual accepted native result tied to this request.

## 5. Current eligibility and erasure

Authorize list metadata, snippets, message pages, summaries, context, source links and events. Eligibility filtering precedes counts and pagination. Mere possession of an ID, cursor, historical receipt or cached source is not read authority.

Withdrawal immediately makes the body and dependent generated projections ineligible, invalidates caches and any reusable native context containing it, and fences pending generation/publication that depends on it. Tombstones may retain minimal IDs needed for ordering and duplicate prevention; they cannot contain the erased text, its excerpt, a recoverable prompt or a supposedly harmless summary of it.

A refresh/reconnect performs current checks. Do not reuse an old provider session that still carries withdrawn content. If the current native path cannot selectively invalidate it, retire/rebuild that conversational context under the same request and allowance lineage before another answer. Do not reset budget or create a replacement writer merely by creating a fresh session.

Independently and explicitly accepted project decisions/notes have their own current retention policy. Withdrawing their conversation source does not silently reverse the decision or imply permission to retain a hidden copy of the original message. Preserve permissible decision identity and mark missing provenance according to the existing policy. Flag conflicts for explicit resolution.

An already delivered answer cannot be made unseen. Remove ineligible cached material on revalidation and do not resend it; keep the product claim about withdrawal bounded to what the system can enforce.

## 6. Preserve existing decision and output semantics

The existing conversation “Propose as decision” and context “Accept/Decline” use A08. Keep exact expected revisions, same-key retries, role restrictions and existing mission replacement rules. No auto-promotion from an apparent consensus, a summary, a generated list or a quick ask.

A generic mention of a report is not output creation. `output` refers only to a valid eligible artifact/version association. Do not overwrite source manifests to attach an unrelated historical output. Without an actual association it remains null. Rendering and navigation of existing linked outputs must be qualified; new artifact generation is outside this slice.
