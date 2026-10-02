# SCM-07 — Continue the project between sessions without losing authority

**Milestone:** D · **Depends on:** SCM-06  
**Human backend/runtime owner:** Davide · **Frontend implementation/integration:** Luis · **Implementation resource:** scoped Claude Code · **Operator/independent reviewer:** Codex under separate authority
**Launch:** [Claude](../launch/SCM-07_CLAUDE.md) · [Codex](../launch/SCM-07_CODEX.md)

## Outcome

The project continues inside a reviewable standing mandate, handles sleeping/offline resources and returns a useful current summary with the next human decision.

## Entry and existing machinery

The founder episode is useful and controls/owner grants are proven. A standing mandate and any outbound channel must be explicitly configured. Reading this pack does not create a schedule.

**Reuse:** Paperclip dependency/wake/wait machinery, Sophia source eligibility/decisions, resource observations and the existing result-notice path.

**Required sources:** S03, S04, S07, P03, L02, L03; resolve in [the source register](../sources/REGISTER.md). Read the applicable [architecture](../00_START_HERE.md) and [operations protocol](../operations/WORKING_PROTOCOL.md).

## Destination ownership

- `packages/coordination/src/mandates/`
- `packages/coordination/src/return-context/`
- `packages/paperclip-plugin/src/`
- `apps/studio/src/features/work/attention/`
- `apps/api/src/voice-status.ts (extend bounded projection)`

New paths above are proposed destinations. Check the actual checkout before creating them. One nominated writer owns shared generated contracts and fresh migration IDs. Keep frozen pack contents and unrelated active branches intact.

## Goal sessions

### SCM-07-G1 — Standing mandate

**Build:** Define scope, duration, resources, remaining allowance, allowed automatic transitions, required reviews and notification policy. Display/edit/revoke through an authorized decision.

**Handback:** No unlimited keep-working permission; expiration prevents new effects and never resets cumulative spend.

### SCM-07-G2 — Durable waiting and useful activation

**Build:** Bind dependencies, owner action, resource reconnection and observed quota reset to one eligible continuation path. Coalesce unchanged blockers and avoid recurring model status polling.

**Handback:** A sleeping host is a routable wait, not silent execution; cancellation and source revocation survive all wake triggers.

### SCM-07-G3 — Return context and selective attention

**Build:** Assemble current mission/results/decisions from records, respecting present membership and eligibility. Show one actionable next step; send an optional outbound notice only under configured recipient/channel consent.

**Handback:** New exchange uses accepted facts rather than a generic opener or stale private native history.

### SCM-07-G4 — Outage and eligibility rehearsal

**Build:** Restart Paperclip/Sophia observer, revoke a source, remove a participant and reconnect an owner host using controlled fixtures plus one bounded real return episode.

**Handback:** No cross-user data resurrection, duplicate writer/notification or hidden work restart.

## Prompt and skill delta

Guide overlay reads the bounded return projection and asks for one real pending decision. It must not claim memory or completion beyond the eligible records.

A tool’s declaration, backend authorization and effective runtime visibility must agree. Adding a prompt mention is not implementing a capability. New role/configuration changes are hashed/versioned and exercised through the current native registry.

## Acceptance cases

| ID | Case | Required result |
|---|---|---|
| SCM-07-T01 | Mandate expiry | New work is denied after expiry; in-flight effects settle according to the declared policy. |
| SCM-07-T02 | Host reconnection | Same binding reconciled before any new native attempt. |
| SCM-07-T03 | Source/member narrowing | Affected stored packet/native history is not resumed with ineligible content. |
| SCM-07-T04 | Notification dedupe | One notice per meaningful event/recipient; revoked access prevents delivery. |
| SCM-07-T05 | No raw chat dependency | Return summary works without ephemeral typed history; does not retain it secretly. |
| SCM-07-T06 | Stop survives wakes | Timer, reset, peer reply and reconnect cannot resurrect cancelled work. |

All cases start **not run** in this pack. Add exact candidate, configuration, evidence and result when executed. A synthetic fixture proves only its labeled boundary; it is not a real provider/native/hosted result. Existing tests must remain green on the actual combined candidate.

## Operations handoff

Use virtual time for mandate/quiet-hour/reset scenarios. A real notification or background pilot requires explicit recipient/channel and bounded schedule authority, recorded separately.

The request must name exact source/artifacts, target, allowed effects, migration hashes/order where applicable, remaining allowance, expiry and recovery. Credentials are secret-store references only. Every effect’s actual result is a receipt, not an optimistic checklist tick.

## No-go / exclusions

No unbounded unattended campaign, new communication provider by assumption, ambient recording or private-history synchronization.

## Stop condition

One leave/return episode advances useful authorized work and recovers current project meaning without exposing private records or manufacturing a new session’s history.

Use the [handoff template](../operations/HANDOFF_TEMPLATE.md). Keep pending gates explicit and stop the implementation session at a meaningful boundary; no artificial wait to manufacture long-duration evidence.


## v2.0 integration obligations

Use the current source, A10/A11 reservations through 0031 at inspection, and single M03 specialist/byte/report contract. Luis implements the mapped frontend; no second registry or report UI. Personal Bot jobs are not stored in a team Paperclip company. This goal and its LFE package share acceptance evidence, not duplicate operational ownership.
