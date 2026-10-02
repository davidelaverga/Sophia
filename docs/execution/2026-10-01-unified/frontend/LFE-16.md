# LFE-16 — Expose qualified computer reviews and project peers honestly

**Implementation owner:** Luis · **Backend/privacy/provider owner:** Davide · **Phase:** Later optional assistant expansion

## Current state

These are optional additional contributor capabilities after private import. Native three-engineer controls are not replaced.

## Dependencies

Preparation: LFE-00. Live: PA-03, PA-04, LFE-15, LFE-08. UI fixtures can start early and remain labelled.

## Sessions

### LFE-16.1 — Computer capability selection

Distinguish cloud browser, local files, desktop-proxied network and optional local GUI. Bind exact preview/account scope; unsupported controls remain absent.

### LFE-16.2 — Evidence-backed findings

Show exact candidate/journey, actual artifacts, reproduction and limitations. Do not turn a screenshot into source-verification or a blanket pass.

### LFE-16.3 — Peer conversation projection

Show assigned roles and relevant authorized findings/questions over shared work IDs, no private jobs or raw provider logs. Prevent admin impersonation and hidden payer changes.

### LFE-16.4 — Removal and uncertainty

Race removed membership, late messages and stale candidate; maintain current access and previous useful output. Stop requested versus remote stopped remain distinct.

## Code destinations

- `apps/studio/src/features/review/ [shared]`
- `apps/studio/src/features/resources/ [shared]`

## Acceptance

- `LFE-16-RVUI-01` — Wrong preview: Reject or label stale target; do not attach findings to latest by default.
- `LFE-16-RVUI-02` — Local device offline: Show waiting for local dependency without marking unrelated cloud work stopped.
- `LFE-16-RVUI-03` — Private question in peer feed: Reject at server; no metadata hint leaks through unread state.
- `LFE-16-RVUI-04` — Withdraw external job: Label application withdrawal, not verified provider process cancellation.

## Session execution and acceptance

Read the actual checkout, repository rules and [current baseline](../02_CURRENT_BASELINE.md). Use a separate worktree and one nominated writer per affected file/contract/effect. Inspect existing and candidate source before creating a path. Preserve current generated contracts, native bridge, role registry and byte/source service; do not reproduce them under a new name.

A local fixture can unblock interface development, but only the actual intended route closes live acceptance. Record fixture-ready, source-ready, integrated, hosted-verified and product-accepted separately. This document assigns no production deployment, schema write, new account, provider call, paid fallback or schedule. Operational effects use [the exact request protocol](../operations/WORKING_PROTOCOL.md).

Use affected repository checks and a failing regression for changed authority/privacy behavior. Run browser checks for visible interaction, SQL/RLS checks for data boundaries, and real native/provider crossings when that is the claim. A mock or passing schema does not prove live behavior. Keep commands/exit codes and actual source/configuration identity. Hand back one useful slice or a precise blocker using [the session handoff](../operations/HANDOFF_TEMPLATE.md); do not keep a coding session waiting for an absent person.
