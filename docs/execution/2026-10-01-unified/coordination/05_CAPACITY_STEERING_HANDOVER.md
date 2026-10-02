# Capacity-aware allocation, steer choices and safe handover

## 1. Three separate quantities

**Provider observation** describes an entitlement window; **owner contribution policy** describes what the project may consume; **Sophia commitment** estimates demand already assigned but not yet reflected. None is equivalent to another. This design operationalizes the capacity addendum [L02].

For the same window units only:

```text
planning_headroom = observed_remaining
                  - owner_reserve
                  - unreflected_commitments
                  - uncertainty_margin
```

Keep an unknown result when a term is unknown. Negative known headroom is ineligible for automatic assignment; it is not a license to override a reserve. Do not average percentages across vendors or invent a conversion from “one review” to quota. Check all applicable windows. Unknown model-to-bucket mapping is a limitation, not inferred by a similar display name.

## 2. Minimum policy first

SCM-02 provides observation and advisory selection. SCM-05 introduces ledgered commitments and reset-triggered reconsideration. An owner may permit bounded work when telemetry is unavailable, but the UI says usage unavailable and automatic allocation cannot pretend it is fully funded.

The deterministic policy removes routes lacking project permission, source/tool capability, host availability or an applicable usable allowance. The lead then selects a sufficiently capable route for the next meaningful checkpoint, using quality evidence, continuity cost, deadlines and available windows. No global optimizer is needed.

Default first implementation: one active attempt per contributed resource; no same-source concurrent writers; no automatic provider/payer fallback. Reconsider queued work first. Moving active work requires the benefit and safe-boundary evidence described below. More headroom alone is not a reason to move a nearly completed task.

## 3. Commitment reconciliation

Each commitment identifies account/window epoch, observation baseline, attempt, predicted remaining demand or unknown, reservation timestamp, expiry and reflected/uncertain state. New provider observations do not blindly subtract both the observed use and the original full commitment.

Where consumption is attributable, reduce the unreflected portion only by evidenced progress. Where other private account activity makes attribution unclear, invalidate/refit the estimate and increase uncertainty; do not assign that private use to Sophia or disclose it. Period rollover requires a newly observed window; retain the old commitment history, recompute remaining demand for pending work and never mint new spending authority.

A quota-reached event creates a routable wait or a reallocation proposal. It does not require a last model turn to summarize. Save source/checkpoint evidence continuously enough that a quota-exhausted worker can be replaced from records.

## 4. Pre-steer risk choice

A small correction can be delivered under the current grant. A materially larger request on a constrained or poorly observed resource creates one `SteerDecision` bound to the exact command, source/criteria/work revisions, target attempt, current grant and quota snapshot.

User-facing choices are **Confirm steer** and **Let project lead reassign**, plus dismiss/cancel. Confirmation acknowledges a risk, not a hard-cap override. A request exceeding owner-controlled contribution or extra spending goes to the owner separately. Silence does not choose a branch. Both buttons resolve the same pending decision atomically.

A warning may say “This change may outlast the available allowance” when the evidence supports that concern. It must not invent a calibrated probability. An alternative is named only after current eligibility checks. Stale telemetry is labeled explicitly.

**Stop, Hold and revocation never wait for this decision or a model.** The original accepted work can continue while a proposed amendment awaits choice unless the user holds it or it is now unsafe.

## 5. Reassign is a planning operation

The lead can transfer only the added scope, delegate a small independent subtask, finish the current checkpoint then hand over, use a qualified smaller configuration, or wait for a near reset. It cannot silently duplicate the entire active assignment or lower a required quality gate merely to use available quota.

New decisions retain the original mission, work ID, deadline, allowance consumed and unsuccessful attempts. A new runtime session is not a fresh budget. A confirmed quota reset changes observed availability, not project authorization.

## 6. Handover protocol

| Phase | Durable action | Advance condition |
|---|---|---|
| Proposed | Eligible destination, reason and target grant; reserve provisionally | Current actor/owner authority and candidate scope valid |
| Preparing | Request supported checkpoint; freeze base/patch/artifacts/tests/remaining work | A source snapshot exists without requiring a final model response |
| Fencing | Retire old sends and block new effects; stop/quiesce old writer | Native/host evidence of settlement, or enforced isolation of that exact source |
| Reconciling | Resolve outstanding deploy/migration/upload effects | Every relevant effect settled or explicitly excluded from automatic repeat |
| Transferring | CAS writer generation and bind new attempt | Exactly one effective writer; target owner grant rechecked |
| Continuing | Recipient verifies base, patch and obligations | Exact transferred source matches and only remaining work is commissioned |
| Completed | Publish handover receipt, release old commitment | New attempt confirmed; old cannot restart from delayed input |

A database reassignment alone does not revoke filesystem or OS write access. Owner-local processes with broader filesystem access cannot provide strong source fencing merely because the application record changed. For the pilot, require verified stop plus an immutable snapshot and a fresh isolated worktree; reject late old candidates at publication. If the old process still can modify the target source, pause the transfer and ask the owner rather than claiming an exclusive writer guarantee.

Retain uncommitted changes as a checked patch/bundle with base commit, file hashes and manifest. Do not carry unrelated native conversation or hidden reasoning. If preparation fails, keep the original useful candidate and a recoverable state; never auto-resume both attempts.

## 7. Timer and review behavior

Use provider-observed reset events or a bounded timer to refresh metadata, not an hourly generative query. On a confirmed material change, create one normal Paperclip reconsideration path. Apply hysteresis and minimum useful-work boundaries to avoid allocation oscillation. Deterministic timer tests use a fake clock; a live pilot need not wait several days.

Record warning acceptance/dismissal, interrupted-at-limit work, avoided unauthorized overage, handover defects, accepted outcomes, user effort and actual total cost where observable. Do not optimize for spending every remaining percentage before reset.


## Current continuation binding

This is the v2.0 normative integration specification. The current M02 runtime, PR32 registry/artifact work and Luis-owned side-panel implementation are described in [current baseline](../02_CURRENT_BASELINE.md). Local source/fixture work can proceed while only the relevant live dependency remains gated. Paperclip is not the first private Bot job store: owner-private messages/packages remain in Sophia until an exact human share. [Source namespace SCM](../sources/REGISTER.md); new code and provider behavior still require the listed goal acceptance.
