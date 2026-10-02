# Two-way tools, messaging and truthful execution

## Product contract and provider boundary

Sophia tools expose deterministic records and mutation receipts. Messages carry questions, findings, replies and guidance. Both travel through one authenticated remote MCP surface, not a second agent loop or model relay. The operations here are proposed Sophia contracts; no provider URL or undocumented RPC is invented.

Grok routine webhooks are documented to accept an authenticated POST and JSON payload. A 200 establishes activation, not result delivery. The native Bot conversation remains a recovery/approval surface. External run enumeration, in-turn steering, precise cancellation, quota inspection and API idempotency are not assumed. [GB-ROUTINES]

## Minimal operation set for PA-01

| Operation | Trusted scope | Result |
|---|---|---|
| `sophia_read_job` | Connected owner; exact admitted job and generation | Bounded current purpose, constraints, source/export permissions, receipt and pending-message cursor |
| `sophia_read_messages` | Same job/owner/generation | Ordered eligible messages, explicit `has_more` and next cursor; delivery is not incorporation |
| `sophia_send_message` | Server-derived sender; same job | Stored question/answer/finding/blocker/checkpoint with stable idempotency key |
| `sophia_claim_job` | Current ready or continuation-ready job | Atomic claim and scope receipt; no duplicate active claim |
| `sophia_prepare_upload` | Job and owner; declared safe media/size/hash | Short-lived upload lease, never a general storage credential |
| `sophia_submit_package` | Active claim; current generation | Private candidate receipt after server validation, or actionable refusal |
| `sophia_finish_turn` | Current claim only | Provider-self-reported yielded/finished/blocked checkpoint; not independently verified provider stop |

No publish/share/delete-team/approve-native operation is included. Owner actions in Sophia use its ordinary authenticated API and separate permission checks. Do not expose an all-purpose shell or HTTP proxy through MCP.

A model-reported native session ID or Bot label is retained as `reported`, not provider-attested. The trusted actor is the enrolled connection subject. Local display uses owner + provider + reported label without claiming per-Bot cryptographic isolation.

## Message classes and authority

`question`, `answer`, `guidance`, `finding`, `blocker`, `checkpoint`, `handoff` and `ack` are the initial classes. Content has `reply_to`, `causal_root`, assignment revision and permitted evidence references. The backend derives sender and audience; no arbitrary `from` or target owner can be supplied.

Messages are task data, not authorization. A suggested new source or broader action becomes an owner decision and a revised grant before use. A valid owner reply within existing scope may guide work without repeated consent dialogs. Approval to run a provider command is not approval to publish in Sophia.

One question should collect related ambiguities rather than start a separate thread per minor detail. A finding can be retained quietly; only a genuine blocker or useful result needs attention. `ack` never triggers another wake.

## State dimensions (do not flatten them)

**Job:** draft → ready → active → waiting_for_owner / waiting_for_device / waiting_for_peer → candidate_ready → closed. Withdrawal is terminal for new work; failure can preserve a useful candidate. New work after a withdrawal requires a new owner-authorized assignment, not a late reply.

**Dispatch:** not_sent → intent_recorded → accepted / rejected / unknown. A request timeout is unknown, not rejected. Never retry an unknown provider activation blindly.

**Claim:** unclaimed → claimed → yielded / finished / abandoned_unknown. Claim expiry alone cannot prove the provider stopped. A new conflicting claim is refused until reconciliation or an explicitly reviewed fresh assignment with preserved uncertainty.

**Delivery:** stored → fetched → incorporation_reported → outcome_checked. Fetch is server-observable. Incorporation is agent-reported unless a relevant outcome/check confirms it. Do not display `applied` from a POST alone.

**Publication:** private → share_preview → human_approved_pending_copy → shared / refused. None of the preceding run states grants publication.

No job/process state is inferred from observer disconnection or a model's fluent final sentence. Source reception and product acceptance have their own evidence.

## Activation, resume and uncertainty

Record dispatch intent before effects with job/generation/notification identity. A webhook carries only an opaque job reference and event kind. Keep webhook URL/key backend-only. Validate enrolled HTTPS origin and path, block private/link-local/metadata destinations and unapproved redirects, pin the credential to its exact destination, limit response logging and redact the secret. Re-registration requires the authenticated owner; connection IDs do not let a caller post to arbitrary URLs.

The provider has not been shown to support idempotent activation. Serialize one outstanding activation per connection for the pilot. After a timeout, wait for a claim or ask the owner to inspect native state; do not run a retry loop. An application-side duplicate claim prevents duplicate source delivery/publication, not duplicate provider consumption.

For a busy job, queue guidance and let the Bot read it at a meaningful boundary. Do not fire another routine just to simulate in-turn steer. For a yielded job, persist the checkpoint, then activate once when a substantive reply arrives, if that continuation path was actually qualified. Coalesce multiple pending changes. If continuation cannot be proven, present an owner-started native resume path and keep the live orchestration gate open.

An owner may initiate collection directly in the Bot. It still retrieves an admitted private job and exchanges messages. This may qualify tool/message behavior before webhook setup, but the product must not label Sophia-initiated activation ready until the webhook path passes.

## Budgets and loop control

Proposed pilot defaults: one active collection per connection, one outstanding activation, no periodic model polling, maximum six substantive exchanges before a checkpoint, one coalesced notification per unread epoch and bounded response sizes. These are software limits on Sophia's route, not a provider compute cap. Limit changes require a new owner-approved policy when they expand the contribution.

Use fake time and synthetic replies to test waiting/expiry. Never burn a real allowance to manufacture a limit. Do not create standing routines from this pack; the owner enrolls an event-only routine with no schedule for the first pilot.

## Withdrawal and safety

Software revocation immediately prevents new Sophia wakes, claims, reads and writes under the old epoch. Reject late results into team sources; preserve an allowed private partial candidate only under explicit current owner policy. Tell the owner how to stop the Bot natively. Report provider activity as unverified until actual evidence arrives. Do not expose a button labelled `Stop Bot` when all it does is withdraw the application job.

For consequential external effects, the first route is unsuitable without a verified mediation/control boundary. Read-only tasks can still perform temporary file processing in their authorized workspace; read-only means no change to original source or external account state, not that no local computation occurs.

## Test path

Prove owner → Bot request, Bot → owner question, owner reply, Bot retrieval, changed package result and durable receipt. Repeat after Sophia restart, connector refresh, lost submission response, source withdrawal and a native login/device wait. In PA-04 add cross-owner recipient edges only after the private flow is accepted.
