# LFE-14 — Connect an owner assistant and cooperate privately

**Implementation owner:** Luis · **Backend/privacy/provider owner:** Davide · **Phase:** Optional personal contribution

## Current state

Extend the selected personal candidate without creating a second global store or requiring a production Companion. All assistant messages are private.

## Dependencies

Preparation: LFE-00. Live: PA-00, PA-01, PS-01, LFE-01. UI fixtures can start early and remain labelled.

## Sessions

### LFE-14.1 — Connection and capability cards

Show actual owner/provider, enrolled role/skill version and capability-specific readiness. Secure setup stays outside model-visible text. Explain native account steps and known billing/control limitations; no zero-setup claim.

### LFE-14.2 — Private job conversation

Render purpose, selected scope, questions/replies/guidance, meaningful blockers and candidate state under one job identity. Fetched/incorporated/checked labels reflect evidence. The team call never announces private messages.

### LFE-14.3 — Recovery and device behavior

Preserve unsent guidance, cursor and returned candidates across reconnect. A closed view does not cancel work; revoke/withdraw is explicit. Show native action/dependency and safe return to the provider instead of unsupported approval controls.

### LFE-14.4 — Prove isolation and accessibility

Exercise two owners/admin, cache clearing on lock, keyboard/focus, phone layout, denied reads and normalized errors. No shared SSE, unread badges or trace metadata leaks.

## Code destinations

- `apps/studio/src/features/personal/assistant-connections/ [proposed]`
- `apps/studio/src/features/personal/jobs/ [proposed]`

## Acceptance

- `LFE-14-PAUI-01` — Lock during private response: Personal job content/cache clears from this view and no team notice is emitted.
- `LFE-14-PAUI-02` — Unknown wake: Show uncertainty and native inspection, not a duplicate automatic trigger or Running success.
- `LFE-14-PAUI-03` — Owner reply lost: Same-key retry preserves typed content and correct job; no copied response in team chat.
- `LFE-14-PAUI-04` — No Companion: Private job messaging works as an explicit work thread; personal AI conversation remains unavailable.

## Session execution and acceptance

Read the actual checkout, repository rules and [current baseline](../02_CURRENT_BASELINE.md). Use a separate worktree and one nominated writer per affected file/contract/effect. Inspect existing and candidate source before creating a path. Preserve current generated contracts, native bridge, role registry and byte/source service; do not reproduce them under a new name.

A local fixture can unblock interface development, but only the actual intended route closes live acceptance. Record fixture-ready, source-ready, integrated, hosted-verified and product-accepted separately. This document assigns no production deployment, schema write, new account, provider call, paid fallback or schedule. Operational effects use [the exact request protocol](../operations/WORKING_PROTOCOL.md).

Use affected repository checks and a failing regression for changed authority/privacy behavior. Run browser checks for visible interaction, SQL/RLS checks for data boundaries, and real native/provider crossings when that is the claim. A mock or passing schema does not prove live behavior. Keep commands/exit codes and actual source/configuration identity. Hand back one useful slice or a precise blocker using [the session handoff](../operations/HANDOFF_TEMPLATE.md); do not keep a coding session waiting for an absent person.

## Capability gate clarification

LFE-01 supplies the integrated owner-private shell, lock/cache and auth behavior. Do not wait for a generative Companion or every personal-space enhancement before enabling a qualified private job inbox. PA-00/01 supply the actual connection/message/job operations. This is a capability-level dependency, not a full-track serial gate.
