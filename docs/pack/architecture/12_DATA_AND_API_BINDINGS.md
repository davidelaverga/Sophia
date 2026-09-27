# 12 — Persistent records, authorization, commands and API

**Sophia-owned design, not an upstream schema.** This chapter binds the Part 1 logical records to the initial SQL and the OpenAPI contract. The SQL is an executable migration candidate; PostgreSQL/Supabase execution has not occurred in this environment. Do not mark the database milestone complete from a text/schema check.

## 1. Choose one authoritative representation

Accepted product state lives in Postgres. Source and artifact bytes live in private object storage. dsh logs and native vendor histories are execution evidence. Readable briefs/wiki pages are projections and knowledge, not competing mutable mission stores.

The API is Fastify. It verifies Supabase Auth JWTs against the configured issuer/audience and resolves membership from current database records. The browser never receives a database administrative credential, an Omnigent delegate or a provider key. The AI models have no SQL socket or unrestricted SQL tool.

Use the private `sophia` schema, not an automatically exposed table namespace. `sophia_secrets` holds encrypted connection material and is not exposed to the normal API query role. Supabase Auth remains the identity service; the product does not implement passwords.

## 2. Role model

The migrations create `sophia_api` and `sophia_worker` as NOLOGIN, non-superuser, non-BYPASSRLS roles. Deployment provisions separate login principals and explicitly grants the appropriate role. Do not use the migration-owner connection in application services.

For a user operation, acquire one database connection, begin a transaction, set the verified actor with `set_config('sophia.actor_id', actor, true)`, and execute the operation under `sophia_api`. The final `true` makes this transaction-local; connection-pool reuse must not inherit a prior actor. Actor identity is not accepted from an arbitrary JSON body.

Membership helpers are narrowly written SECURITY DEFINER functions with a fixed search path and no public EXECUTE. They avoid recursive membership RLS and return only the decision needed. Write functions independently recheck membership/role, target project and current revisions. Models cannot call them directly.

**Boundary:** a trusted API process can set its transaction actor; this is not an unforgeable defense against a compromised API or arbitrary SQL injection. Parameterized SQL, route-level validation, restricted roles, secret isolation and service authentication remain required. RLS protects accidental cross-project access and enforces ordinary query scope; it is not a substitute for the application boundary. Supabase service-role keys bypass RLS and are excluded from the normal user query path. [DB-01]

A worker's global job claim is a narrow definer operation available only to `sophia_worker`. Native agents and generated applications do not receive that role. Trusted worker services call domain services with the job's verified project/actor/grant and recheck at effect dispatch.

## 3. Canonical keys and revisions

Own IDs are UUIDs. Native IDs are opaque strings in their adapter namespace. API sequences are **decimal strings**, because database BIGINT must not be rounded through JavaScript Number. Local counters and small contract revisions remain validated safe integers.

| Identity/version | Changes when | Does not mean |
|---|---|---|
| `projects.mission_revision` | Accepted project frame changes | A worker turn ran. |
| `projects.audience_revision` | Membership/sharing changes | Every member agrees with a proposal. |
| `projects.eligibility_revision` | Source/memory use is revoked or reclassified | Remote copies have all been erased. |
| `goals.revision` | Outcome/criteria/scope changes | Ordinary progress. |
| `goals.state_revision` | A lifecycle state changes | The accepted outcome or criteria changed. |
| `goals.authority_epoch` | Hold/Stop/Resume or a new operational mandate fences prior work | Native engines enforce this number themselves. |
| `execution_bindings.id` | A particular attempt/resource/session binding is established | Another session with the same title is equivalent. |
| `source_objects.sha256` | Actual source bytes differ | A ZIP filename changed. |
| `artifact_versions.id` | A new candidate is frozen | It is accepted. |

All cross-object foreign keys that bind project-scoped records include `project_id`. An unrelated project's goal, source, assignment or preview cannot be inserted merely because its UUID exists.

## 4. Initial physical model

The migration groups are an implementation slice, not a database per concept:

| Group | Physical tables | Important ownership |
|---|---|---|
| Team and accepted direction | `projects`, `project_members`, `project_revisions`, `decisions` | Member/role-controlled; accepted state read directly. |
| Pursuit and engineers | `goals`, `goal_dependencies`, `executor_resources`, `work_attempts`, `execution_bindings` | Owner resources remain distinct even on one host. |
| Durable communication | `commands`, `project_events`, `outbox`, `native_observations` | Commands precede effects; observations cannot accept work. |
| Required input and review | `human_actions`, `review_intents`, `review_intent_preserve_sources`, `lead_reviews` | HumanAction resolver is the exact owner; review criteria remain bound. |
| Source and outputs | `source_objects`, `artifacts`, `artifact_versions`, `previews`, `source_dependencies` | Private-to-owner/project scope and candidate/stable separation. |
| Work and learning | `jobs`, `knowledge_pages`, `context_manifests`, `usage_records` | Job/context scope and lineage; unavailable usage is null. |
| Attention and room | `cooperation_opportunities`, `viewer_attention`, `room_state` | Optional invitation is not a required permission. |
| Connection metadata | `execution_connections` and private credential material | Personal upstream delegation, never a vendor token. |

The SQL supplies typed identity/status/foreign-key/index columns and JSONB only for evolving, validated payloads. The API OpenAPI/JSON Schemas constrain those payloads. Do not use a free-form `payload` to smuggle a different actor, project or authority into a handler.

## 5. Atomic command admission

`admit_goal_command` is the executable core example. Lock ordering is project → goal → command/queue state, used by every mutating operation to avoid incompatible lock orders.

```text
BEGIN
  require current authenticated project membership and editor/admin authority
  lock project and goal
  find this actor's idempotency key
    same semantic hash → return original receipt
    different hash → conflict
  validate expected goal revision and authority epoch
  validate the body source belongs to this project and is eligible to this actor
  for Hold/Stop: fence old work and retire unsent normal deliveries now
  insert command with its accepted revision/epoch
  allocate project sequence and append metadata event
  insert deterministic outbox records: one per native cleanup target, otherwise one lead action
COMMIT
return receipt
```

The semantic request includes kind, target, expected revisions and body reference. The supplied SQL constructs normalized JSONB itself and compares semantic equality for idempotency. A canonical SHA-256 may additionally identify the request in application diagnostics, but a caller-supplied checksum does not decide equality. Repeated admission does not send a second native prompt. A revoked member cannot retrieve even an old receipt by retrying an idempotency key.

Control calls are not queued behind a model response. Hold/Stop fence dispatch immediately in the database. Native cleanup runs outside the transaction. The control outbox is permitted to stop the captured old binding while ordinary old-epoch prompts are no longer eligible. This exception is for cleanup, not new work.

The initial SQL command function covers `steer`, `request_review`, `hold`, `stop` and `resume`. More complex dispatch, decision, image and publication handlers use their own typed domain operations; they are not falsely implemented by a generic JSON insert. This boundary is reflected in the coverage manifest.

## 6. Leases, uncertain effects and crash recovery

Use `FOR UPDATE SKIP LOCKED` to claim bounded batches. A lease provides scheduling ownership, not evidence that an external effect never happened. Distinguish:

- `pending`: no dispatch has started; safe to claim under current authority.
- `dispatching`: attempt began; a process crash requires reconciliation.
- `acknowledged`: upstream accepted; native/result observation may still be missing.
- `outcome_unknown`: insufficient evidence; no automatic duplicate send.
- `settled`: the specific intended result/termination was observed.
- `superseded` or `denied`: no new work is permitted through that delivery.

The SQL claim function **does not reclaim `dispatching` as pending**. A separate reaper marks expired dispatches outcome-unknown. Purely local deterministic jobs may retry from immutable input. Provider writes, native prompts, deployments and rotating-token refreshes do not inherit that rule.

Record operation IDs, native IDs and evidence references before marking settlement. Job completion and provider-call completion are separate. A process can crash after a model provider charged it; retry accounting includes the first attempt when observable and marks unknown cost otherwise.

## 7. Snapshot plus replayable SSE

The browser receives a consistent project snapshot and `cursor` from one database transaction. It then subscribes to `/api/v1/projects/{id}/events?after=<cursor>`. The API replays authorized events, emits SSE `id` as the project sequence, then tails newly committed events. Reconnection uses the last applied cursor, not the last socket packet received.

Events are safe routing/projection metadata plus references; private uploaded/native content is fetched through separate authorized reads. A hidden/private event can advance the cursor through a minimal `cursor.advanced` frame without exposing its content. The server must never claim there is a gap merely because it filtered a private payload.

The reducer ignores duplicates, refuses to apply an out-of-order gap, requests a resnapshot when needed, and keeps local unsaved editor state separate. It does not clear a HumanAction on a toast dismissal. Membership is rechecked during replay and before subsequent publication; revocation closes the stream. Previously delivered bytes cannot be recalled.

Omnigent's non-replayable stream is upstream of this layer. Repairing our UI after a disconnect does not mean every transient upstream event was recoverable. Preserve the adapter's observation-gap record. [OM-03]

## 8. Source privacy, correction and Forget

A selected import enters private owner scope first. Publishing it to the project is an explicit operation with an inventory of coverage and derived records. Old assistant advice stays source material; it is not an accepted decision by import.

A correction creates a new source/decision revision and invalidates derived context. Forget first removes future eligibility and advances the relevant eligibility revision. It then schedules purge of source bytes, extracted text, derived knowledge, controlled caches and affected runtime context copies. The effect is not limited to a UI hide flag.

A dsh session already containing the removed material cannot be resumed as if a new retrieval filter solved the problem. Mark it retired for inference, dispose it, remove the affected controlled log/offload/attachment material, and rebuild from current eligible records under a new runtime generation. Preserve minimal non-content lineage. The purge plan must consider inherited children and summaries.

External native sessions may already hold delivered content. Sophia blocks future use of those bindings and asks the owner to use the vendor's supported cleanup path; mark external deletion pending/unverified until evidence exists. Do not promise that removing a source from Sophia erases vendor logs, user copies or backups instantly.

## 9. Artifact publication is one transaction, not a model message

`publish_candidate` checks the candidate's project, declared source hash, validated state, current goal/revision/epoch and the expected stable head. The HTTP use-case transaction calls this primitive and records the new stable version and event atomically; the supplied SQL primitive does not by itself emit the publication event. A stale candidate cannot overwrite a newer human edit. A later failure leaves the previous stable version intact.

The validation report is source-bound and prepared by the trusted verification job. A `validated` database flag is not itself a browser test; that worker must have run and inspected the required checks. The UI says which checks ran, which were unavailable and which were human judgments. Goal acceptance remains a separate operation against the current criteria.

S1 implements version-safe candidates and review-to-steer. S2 adds component-restricted mutation on these same version records; no second artifact database is introduced.

## 10. HTTP decisions and schemas

`api/openapi.json` is the Sophia contract, **not Omnigent's OpenAPI with renamed paths**. `api/route-bindings.json` ties each operation to a Fastify file, service, records and goal. `api/generated-types.ts` is generated from the component schemas; `api/reference-client.ts` provides a typed client for the implemented reference subset.

Use `Idempotency-Key` for mutation admission, expected revision/epoch in bodies, and `application/json` errors containing a stable `code`, safe explanation, request ID and retry disposition. HTTP 400 is malformed input, 409 a version/idempotency conflict, 403 denied access, 422 invalid shape, and 503 unavailable capability. An admitted asynchronous operation returns 202 with a receipt; it does not return a fabricated finished result.

The public API distinguishes contribution, decision proposal, accepted decision, review intent, control command and permission response. A voice tool calls the same use-case service with the verified speaker envelope; its model-provided arguments cannot select a different actor.

Initial API error classes include `stale_revision`, `stale_authority`, `idempotency_conflict`, `source_ineligible`, `native_outcome_unknown`, `native_permission_required`, `native_capability_unavailable`, `connection_reauthorization_required` and `actor_context_required`.

## 11. Deployment and migration order

Apply the numbered SQL files in order, with the schema-owner migration role. They do not alter the existing Sophia production schema. Use a fresh database/schema for the new product first. Create login-role grants and secrets outside committed SQL. Run the supplied SQL tests in an isolated test database before applying to a shared environment.

The API and worker deploy after migrations and schema-version checks. Existing processes stop accepting new writes when their required schema version is incompatible. Roll back code only to a version that can read the current schema; destructive down-migrations are not the default recovery procedure. Restore backups in a separate environment before replacing data.

This pack checks file/schema integrity and executable TypeScript reference behavior. It does **not** claim PostgreSQL execution, Supabase RLS behavior, JWT integration, index performance or hosted migrations were tested. [Database README](../db/README.md) gives the next concrete commands and required evidence.

## Schema implementation notes

Preservation sources are normalized in review_intent_preserve_sources rather than an unvalidated UUID array. Previews bind their exact artifact version; a review intent’s composite foreign key cannot reference a preview of another version. Goal dependency edges use project-scoped foreign keys; the roadmap mutation handler must also reject cycles under the project lock. Event entityRevision is a projection revision allocated by the event writer; do not substitute the goal’s unchanged contract revision for a lifecycle change. All mutation handlers share the project-first lock order, including membership/revocation, validator writes and publication.
