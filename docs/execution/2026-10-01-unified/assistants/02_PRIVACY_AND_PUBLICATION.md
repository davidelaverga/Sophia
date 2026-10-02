# Personal ingestion, exact sharing and revocation

## Domain objects and ownership

These are proposed application records. Bind them into the actual generated contracts and persistence layer; do not create a parallel production database from these examples.

| Record | Owner/audience | Important properties |
|---|---|---|
| AssistantConnection | Personal owner only | Provider account subject, scopes, status, capabilities, credential references, revocation epoch; Bot label is display metadata |
| PersonalCollectionJob | Personal owner only | Purpose, selected collection scope, expected output, expiry, allowance policy, controller kind and generation |
| AssistantMessage | Same job audience | Trusted sender, reply/causal ID, kind, bounded content, permitted attachment references, sequence and delivery facts |
| KnowledgePackageVersion | Personal owner only | Immutable manifest, selected byte references/hashes, source coverage, findings, uncertainties, validation and retention |
| SharePreview | Owner only | Exact sanitized snapshot, destination, displayed version/hash, attachment list and expected membership/policy revision |
| SharedContribution | One project | Its own immutable published snapshot, attribution, permitted provenance, active/withdrawn state; never a read-through into private storage |
| PublicationReceipt | Owner plus project-safe projection | Exact approved digest, human actor, destination, policy/source revisions, operation key and result |

Jobs/packages are asynchronous work. Do not insert fake personal conversation turns that the unimplemented Companion cannot answer. Reuse PR35 owner-only persistence and PR32 storage/parser primitives only after explicit integration; personal object paths, caches and authorization remain distinct from project reports.

## Authorization boundary

Derive owner identity from verified session/OAuth credentials. Job IDs, actor fields, provider run IDs, email addresses and Bot display names are not authorization. Check owner, connection, job, grant revision, status and expiry on every request. For externally supplied IDs return the same non-enumerating denial shape whether the object is missing or belongs to someone else.

The Bot credential may retrieve its assigned job, exchange its permitted messages and submit a private candidate. **It cannot publish to a team, choose another owner, add a team member, grant itself sources, or approve a share.** Those operations require an authenticated human account and the application's current project policy. A natural-language message, a tool argument named `approved`, or a native provider approval is not Sophia publication consent.

Project membership does not authorize exporting all project data to the owner's assistant. A collection job receives either the owner's own purpose description or a separately approved, minimal project-context snapshot. Mark that outbound disclosure with recipient, content hash, permitted use and grant. A member's access to employer/client documents is not blanket permission to copy them to a personal provider.

## Storage and all derived surfaces

Use owner-constrained reads and writes at the database boundary. Object-store keys and signed URLs are issued only through authorized readers; never rely on unpredictable URLs alone. Keep personal data out of team SSE/snapshots, shared search, vector indexes, cache keys and result notices. Request/error logging defaults to IDs/codes, not raw message bodies, filenames or provider errors that can echo content.

No team model receives private material to summarize it. Personal review assistance, if enabled, is a separate owner-scoped invocation with no team conversation memory. Do not send private job text to a shared Paperclip company even when only staff would see it. Initially `controller_kind=sophia_personal_job` owns private lifecycle; the team Paperclip scheduler has no entry. One controller per job remains the invariant. PA-04 uses Paperclip only for explicitly shared project work, not for private collection.

The privacy curtain is a device presentation control, not provider revocation. Hide and clear rendered personal content when it closes; do not cancel approved background collection merely because a view unmounts. No private push body or ARIA announcement is exposed in a team call. Unlocking reauthenticates the same person; it does not change the global session to another identity.

## Package ingest and validation

The assistant prepares a report plus a source manifest, not a full-account archive. Coverage records requested, searched, actually read, omitted, inaccessible, duplicate and unsupported material with reasons. Distinguish original source, user note, earlier model report, recall and new inference. A recollection is not elevated into verified evidence by summarization.

Proposed pilot caps: 32 sources per package; 16 attached files; 25 MiB per file and 100 MiB total; 16 KiB per message; 512 KiB normalized text report; 8 KiB wake-free assignment summary. These are Sophia design limits, not provider entitlements. Large material is paged/staged explicitly, never silently truncated or automatically made public.

Upload to a single-purpose temporary object lease bound to owner/job/generation, maximum size and expected digest. Verify actual size, media type and SHA-256 before admission. Reject path traversal, active HTML, executable archives, decompression bombs and unsafe remote fetch URLs. Stage unknown files for safe inspection; never execute an imported script or let a package name mutate storage paths. Reuse the data-only report parser. Disable unapproved remote images and tracking loads. A cloud path or provider chat URL is not proof that bytes were received.

Keep package versions immutable. Edits produce a new version. An assistant-reported hash is checked against stored bytes; it is not trusted merely because it has the right shape. Retain useful partial results with explicit missing coverage.

## Exact share transaction

1. The owner selects the version, content/attachments and destination. Build a separate team-safe snapshot; remove unselected source bodies, private paths, account identifiers and hidden metadata. Selected summaries with non-shared evidence disclose that verification is limited.
2. Show exactly that snapshot and its attachments in the sharing preview. Compute a digest on canonical selected bytes plus disclosure metadata. No stale or invisible selection may be included.
3. On Share, recheck same human, current project membership/export/import policy, source eligibility, expected package version, preview digest and operation key. Do not re-run a model between preview and commit.
4. Record approval, target contribution and publication outbox atomically. Keep target invisible until all authorized bytes exist and verify. For a separate object store, use an idempotent staged-copy worker and transactional final publication; never announce success before the source reader can serve the complete version.
5. A lost response reconciles under the same operation key; same key/different payload is conflict. Return one receipt. Sharing does not accept a mission proposal or spawn research automatically.

A changed package or share selection invalidates the previous preview. Membership removal between preview and commit refuses publication. The project receives a snapshot with its own controlled lifecycle, not a foreign key that allows arbitrary private-version reads. Physical byte dedupe, if later introduced, must retain separate authorization references and non-leaking deletion semantics.

## Updates, withdrawal and erasure

Private edits never auto-update project content. Explicit updates generate a new share preview and version. An owner may withdraw a shared contribution under the existing project rule; future source/context reads are fenced immediately. Relevant Sophia-owned workers and derived summaries are invalidated/rebuilt using the actual source dependency contract. For externally hosted Bots, fence future reads/publication and show that provider-retained copies may remain.

Deleting a private package or erasing personal data does not silently remove an already shared project version. Offer the separate withdrawal action and enumerate active shares without exposing another owner's records. Revoking a connection blocks new tool access and wakes, retains only necessary control/erasure tombstones and does not claim native computer shutdown. Native provider conversation deletion is a separate owner action.

**Proposed retention:** incomplete upload objects expire within 24 hours; terminal personal job message/source-inventory content defaults to 30 days unless the owner keeps it; received packages remain until owner deletion; identifier-only dedupe/erasure records follow a separately reviewed minimum retention. Deadlines are implementation policy proposals, not running schedules. PA-01 must implement deterministic cleanup and fake-clock tests before accepting private data; a real timer has its own deployment authorization.

## Required leakage tests

Test two owners plus a project administrator, direct API/object reads, list counts, search/embeddings, SSE, cache keys, notifications, error responses, tracing, exports, a team model retrieval, and a call/lock transition. Test a secret-looking source title and excluded attachment. Private staging cannot pass merely because its main screen is hidden.
