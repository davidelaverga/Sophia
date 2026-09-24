# Initial contracts

These are **Sophia-owned design contracts**, not upstream API signatures or finished SQL migrations. They make the first implementation slices agree on identity and transitions. Full database/RLS migrations and generated OpenAPI clients are the next installment.

## Identity and type boundaries

A `projectId` names a shared product context. A `goalId` names an intended outcome. An `attemptId` names one execution attempt. A `resourceId` names an owner-bound native or Sophia resource. A `nativeSessionId` is supplied by its runtime. A `commandId` names one durably admitted instruction; `providerCallId` only identifies a provider call. These are not interchangeable.

A `goalRevision` changes when the intended outcome or requirements change. A `stateRevision` changes on lifecycle transitions. An `authorityEpoch` fences stale work after Stop/revocation. A `sourceVersion` identifies the exact candidate being reviewed. Database sequence orders durable project events; local wall-clock timestamps are not a global ordering proof.

## Files

[record.schema.json](record.schema.json) checks the outer shape of command/event/context specimens. [examples.json](examples.json) contains clearly synthetic records. [interfaces.ts](interfaces.ts) is a concise specification of the new transport contract, not a compiled implementation or vendor SDK. IDs prefixed `example-` must never be copied as actual run identifiers.

## Admission and receipts

The HTTP client supplies `clientRequestId`, intended action, target and expected revisions. The server obtains the actor from authenticated identity, checks the current grant, and records command plus outbox in one transaction. It returns the recorded command ID. A retry with the same identity and payload recovers the same result; changed content using the same key is rejected.

Receipt stages are `admitted`, `delivered`, `incorporation_observed`, `checked`, plus `rejected`, `failed` and `outcome_unknown`. Not every adapter can prove every stage. A `delivered` receipt needs native transport/inbox evidence; model reassurance cannot provide it. A checked result names the exact source/version and check evidence.

## Runtime transport

The dsh bridge opens one authenticated outbound connection from its isolated runtime. `RuntimeCommand` frames carry project/attempt/epoch/command identity, never raw provider credentials. The receiver validates lease and epoch before touching the native Agent. Duplicate frames reconcile against prior correlation, not unconditional resending.

A `stop` or revocation fences further effects first, then settles cancellation. Lost settlement produces `outcome_unknown`. Native cancellation does not undo already sent external effects. Persistent traces retain minimal non-content audit facts; deleted private content is not copied into an immutable event payload.

## Context and source

A ContextPacket identifies accepted project/goal/source revisions and eligible evidence. Separate current instructions, history, hypotheses and source content. Source content cannot impersonate a system instruction. Native peers receive the smallest useful packet, not whole personal exports.

## Peer message

Peer envelopes carry sender and target assignments, message ID, optional reply-to, content references and work revision. Messages are task data. Delivery, wake, incorporation and completed action remain separate. No automatic broadcast to every agent; no acknowledgement-only model loops; Stop has priority over ordinary mail. [DSH-16, QM-01, BZ-01]

## Human action and co-review

HumanAction binds actual native request, fingerprint, owner, requested effect, affected dependency, expiry and observed resolution. A text steer does not answer it. The same HumanAction drives every screen.

ReviewIntent binds the actual preview/source/frame and contains `change`, `preserve` and the attributed user instruction. S1 hands it to the lead and assigned worker; S2 adds enforceable component mutation. Viewing or highlighting alone grants no write authority.
