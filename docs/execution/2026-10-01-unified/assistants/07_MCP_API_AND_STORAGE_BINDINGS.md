# Proposed MCP, application API and storage binding

**Status:** proposed design target in this pack; not deployed OpenAPI, SQL or provider tooling. The implementation goal authors the next available contract amendment and migration only after refreshing A10/A11 reservations. Existing API prefix is read from the checkout; paths below are proposed relative resources, not a client-ready URL list.

## Application service map

| Proposed resource/operation | Caller | Transaction responsibility |
|---|---|---|
| personal/assistant-connections create/read/revoke | Authenticated human owner | Enroll verified subject/secret ref/capabilities; atomic grant epoch update and wake fence |
| personal/collection-jobs create/read/amend/withdraw | Authenticated owner | Immutable mandate revisions, source selection, allowance mode, one continuation owner |
| personal/collection-jobs/{job}/messages read/send | Owner or scoped connector | Owner/job authorization, ordered sequence, idempotency and reply validation |
| personal/knowledge-packages version/read/delete | Owner or submit-only connector | Validate byte manifest, immutable version, owner-only source readers, cleanup tombstones |
| personal/share-previews create/read | Human owner only | Materialize exact sanitized snapshot and selected metadata before consent |
| personal/share-previews/{preview}/publish | Human owner only | Recheck owner, target membership/policy, version/hash; receipt/outbox; no model in commit |
| projects/{project}/contributions read/withdraw | Project members / authorized source owner | Serve only published snapshot; current membership, withdrawal and derived eligibility |

MCP calls invoke those same application use cases after translating verified token subject to connection/job scope. Do not call HTTP handlers as authorization substitutes or expose the internal SQL service role to a provider. Reuse current OpenAPI generation and response validators. A missing deployed handler remains unavailable; the frontend cannot invent success from a schema example.

## Proposed persistent fields and indexes

Use `owner_id` as the personal partition key with RLS/role checks on all content-bearing tables. Keep `job_id`, `connection_id`, `generation`, `mandate_revision`, `request_key`, `payload_digest` and current grant eligibility. Unique keys include `(owner_id, request_key)` for human commands, `(connection_id, job_id, request_key)` for connector writes, `(job_id, sequence)` for messages and `(owner_id, package_id, version)` for packages.

Message receipts do not keep plaintext after owner erasure. Hashes of private words can also reveal information; erasure retains only opaque operation IDs/erasure fences necessary to reject stale retries, not content digests or source titles. Replay under an erased key returns the existing erased/revoked disposition and writes nothing.

Share metadata stores project-safe attribution separately from personal provenance. The project-facing record must not expose the private package's contents, list endpoint, hidden-source IDs or raw local path. An owner-only share mapping supports correction/take-back. Team views use the copied public manifest, not unrestricted joins into personal tables.

## Uploaded bytes

Use the existing Storage-only byte-store interface after M03 integration, with separate owner-bound logical namespaces and exact digest verification. Database authorization mediates lease creation and reads. Upload grants are single-purpose, time/size-limited and only write one target object. They are not provider credential custody. No native cloud path is accepted as a completed upload.

Enforce content validation before parse/index, safe data-only preview, attached-file coverage and explicit failure. Signed upload URLs may be used as scoped transport capabilities only when that flow is supported and not logged to shared transcripts; otherwise use direct capped tool content for the pilot. Do not ask for arbitrary custom secret headers in Grok's model-visible arguments.

## Fences and race order

For every effect: current connection/job eligibility → lock current owner/job record → dedupe under same key → compare expected revision/generation → perform or stage effect → record receipt/outbox → deliver. Withdrawal increments/fences the job before attempting optional remote notification. A provider callback received later cannot restore eligibility.

For publication with a separate object store, perform prepare/copy/verify/finalize with idempotent stages. Only the finalize transaction exposes the team snapshot and emits the project-safe event. Retry after lost response returns the same contribution. A failed copy emits no shared partial package. The original private package remains independent.

## Privacy-aware observability

Record codes, IDs, byte counts, capability/evidence class and elapsed time. Personal logs and job events have owner-level access; no private content in global analytics, LangSmith traces, public GitHub issues or Paperclip company comments. A provider error must be normalized before logging because it may echo the prompt or account name. Test errors and secondary indexes, not just happy-path RLS.

## Proposed schema files

[Connection](../contracts/personal-assistant/connection.schema.json) · [Job](../contracts/personal-assistant/job.schema.json) · [Message](../contracts/personal-assistant/message.schema.json) · [Package](../contracts/personal-assistant/package.schema.json) · [Share](../contracts/personal-assistant/share.schema.json).

These schemas constrain shapes. Server-side identity, membership, scope and transaction rules above remain mandatory even when a payload passes JSON Schema.
