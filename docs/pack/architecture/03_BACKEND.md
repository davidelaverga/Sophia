# Backend, records and command processing

**Concrete Sophia contract; new implementation.** The table/route names in this chapter are ours, not claims about upstream dsh or Omnigent. S1-02 implements the minimum transaction path. Part 2 supplies complete SQL/RLS migrations and the generated OpenAPI artifact.

## 1. Application modules

Fastify handles authentication, project membership, command validation, API responses and SSE. Domain services own goals, permissions, artifacts and acceptance. A SQL-backed worker claims durable jobs and outbox entries. A projector makes screen-ready views from accepted state and observations. None of these components needs a model to count rows, route an owner-bound permission or determine whether a command ID was already admitted.

Use Supabase Auth JWT verification against the configured issuer and audience. Project membership is checked from application records on each operation. Browser membership and native-engineer account ownership are distinct. Service processes use separate scoped machine credentials. Do not ship the Supabase service role to a browser or generated application.

## 2. Minimum record groups

| Group | Records and required fields |
|---|---|
| Team | `projects(id, title, mission_revision, seq)`, `project_members(project_id, actor_id, role, membership_revision, active)` |
| Decisions | `project_revisions`, `decisions(id, project_id, kind, status, author, evidence_refs, expected_revision)` |
| Work | `goals(id, project_id, revision, outcome, criteria, dependencies, state)`, `work_attempts(id, goal_id, source_revision, role_revision, state, authority_epoch)` |
| Resources | `executor_resources(id, project_id, owner_id, host_binding, harness_kind, capabilities, availability)`, `execution_bindings(attempt_id, resource_id, native_session_id, continuation_owner)` |
| Commands | `commands(id, project_id, actor_id, idempotency_key, target, expected_revision, authority_epoch, payload_hash, state)` |
| Events | `project_events(project_id, seq, event_id, type, actor/source, refs, payload, visibility, occurred_at)` |
| Delivery | `outbox(id, command_id, destination, state, lease_owner, lease_until, attempts)`, `native_observations(binding_id, native_id/seq, kind, payload_ref)` |
| Human input | `human_actions(id, native_request_id, fingerprint, owner_id, work_id, action_kind, status, expires_at, evidence_ref)` |
| Review | `review_intents(id, actor, preview_id, source_revision, change, preserve, target_evidence, state)`, `lead_reviews(id, cause, cursor, decisions, evidence_refs)` |
| Assets | `source_objects(id, owner/scope, hash, mime, storage_ref, eligibility_revision)`, `artifact_versions(id, parent, source_bundle, state, checks, accepted_at)` |
| Jobs | `jobs(id, project_id, kind, source_refs, authority_epoch, state, lease, attempt, result_ref)`, `job_effects(id, provider, request_id, state)` |
| Context | `knowledge_pages`, `knowledge_claims`, `source_dependencies`, `context_manifests` |
| Attention | `cooperation_opportunities`, `viewer_attention` and `room_state`; required actions remain their own durable records |
| Resource use | `usage_records(attempt/job, provider, model, measured_units, billing_class, estimate, observed_at)` |

These are logical record groups. Do not implement one database or service per noun. JSONB is appropriate for evolving typed payloads, but identity, ownership, sequence and state need indexed columns and constraints.

## 3. Atomic admission

For any effectful command:

```text
BEGIN
  authenticate actor and lock the current target/version
  verify membership, grant, expected revision and remaining allowance
  recover same idempotency key; reject same key with different payload
  insert command
  append project event and advance project sequence
  insert dispatch outbox entry
COMMIT
return command ID + admitted state + current projection cursor
```

Lock sequence allocation and event insertion in the same project transaction. Never return a durable success before commit. Read-only requests do not need this machinery. A clear small edit within authority is not a reason to ask for a second generic confirmation.

Provider operations happen outside the database transaction. An outbox worker uses `FOR UPDATE SKIP LOCKED` and bounded leases. A lease expiry does not prove a remote request failed. Reconcile the provider/native operation before retrying an uncertain effect. Every result writes back against the command and authority epoch that caused it.

## 4. API groups

All paths below are **new Sophia endpoints**, prefixed `/api/v1`.

| Endpoint | Meaning |
|---|---|
| `GET /projects/:id/snapshot` | Current permitted project view plus cursor |
| `GET /projects/:id/events?after=...` | Authenticated SSE replay followed by live updates |
| `POST /projects/:id/contributions` | Attributed text/voice contribution; does not itself mean a decision |
| `POST /projects/:id/commands` | Admit typed work/decision/control command |
| `POST /projects/:id/progress-reviews` | Manual technical-lead review, coalesced with current pending review |
| `POST /projects/:id/room-token` | Room-scoped LiveKit token after membership/consent checks |
| `POST /rooms/:id/exchanges` | Start or end an admitted Sophia exchange |
| `POST /rooms/:id/input-floor` | Expected-epoch input ownership transition |
| `POST /projects/:id/source-imports` | Begin selected import; initial private staging |
| `GET /imports/:id/manifest` | Included, omitted, unsupported and conflicted source items |
| `POST /imports/:id/publish` | Publish selected reviewed project context |
| `POST /projects/:id/resources` | Register/adopt an owner-bound native session resource |
| `GET /resources/:id/status` | Capability and availability view; never a secret dump |
| `GET /human-actions/:id` | Current exact request and authorized responder |
| `POST /human-actions/:id/responses` | S2 supported approval/answer route; never “seen = approved” |
| `POST /projects/:id/review-intents` | Bind change/preserve instruction to actual source/preview |
| `GET /artifacts/:id/versions` | Candidate/accepted version history |
| `POST /workspaces/:id/patches` | Luis's expected-base source edit |
| `POST /workspaces/:id/builds` | Controlled build job against a frozen source bundle |
| `POST /assets/image-jobs` | Admit image generation/edit/explicit comparison |

The media bridge calls the same use-case functions as these endpoints through machine authentication plus a verified interaction envelope. It cannot choose a user from a tool argument.

## 5. Events and projection

Use stable `event_id`, monotonically ordered project `seq`, occurrence time, producer, audience and causation references. Domain events include `command.admitted`, `work.started`, `human_action.required`, `amendment.delivered`, `candidate.available`, `review.recorded`, `version.accepted`, `work.stop_requested` and `work.settled`. These names are the initial Sophia vocabulary.

A projection is a read model. It cannot set a check to passing, resolve a permission or accept a candidate during rendering. One HumanAction ID drives the work row, owner card, Needs You view and return summary. Reading/dismissing an attention item changes only the viewer's attention state.

Initial page load obtains snapshot and cursor in a consistent transaction. Subscribe after that cursor, dedupe event IDs and apply events in order. A gap or expired replay range triggers a new snapshot. SSE is not trusted as the only database; network disconnect is not work cancellation. Enforce audience on every replay, not only at subscription creation.

## 6. Five-minute review scheduling

Store `next_review_at`, last reviewed event cursor and current pending-review key on the project work controller. The worker polls due jobs; the clock is not a model loop. An active project gets a review every five minutes. Important events and the manual button can move a review earlier. Coalesce multiple requests and retain all trigger reasons.

A review receives changed evidence and current state, with selective access to earlier attempts. Known unchanged permission/rate-limit/offline states get a cheap status reconciliation; they do not trigger expensive repeated diagnosis. A timer must not invent a blocker from silence. Material lead decisions append an event immediately; a no-change decision updates last reviewed without forcing a spoken interruption.

## 7. Hold, Stop and effects

Hold fences new dispatch for the affected scope, asks the native route to settle/cancel appropriately and retains resumable context. Stop revokes that work epoch, cancels outstanding eligible jobs and pending peer wakes, clears native queued input through its supported control and prevents stale publication. Result evidence may still arrive and be recorded after Stop.

External side effects may already have occurred. Track `not_sent`, `sent`, `confirmed`, `uncertain`, `compensated` separately. A stopped model is not proof that a deployment was rolled back. No automatic new attempt starts until the owner's current instruction and uncertain effects have been reconciled.

## 8. Initial schema/recovery checks

S1-02 proves duplicate admission returns one command; a payload collision fails; a source-version conflict is explicit; unauthorized project reads/writes fail; snapshot/SSE replay converges; and crash after outbox claim does not produce a fabricated completion. S1-09/10 extend these tests to real native receipts and permissions.

Full migrations, index sizing, per-table RLS and machine-token implementation are the next artifact pass. The chosen storage, ownership and transaction semantics above are settled. Do not start a competing Git-backed authority while waiting for the SQL files.
