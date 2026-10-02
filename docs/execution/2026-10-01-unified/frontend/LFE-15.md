# LFE-15 — Review personal knowledge and share exactly selected content

**Implementation owner:** Luis · **Backend/privacy/provider owner:** Davide · **Phase:** Optional personal contribution

## Current state

Use owner-only package versions and existing safe artifact components only with personal readers. Share is a real publication boundary.

## Dependencies

Preparation: LFE-00. Live: PA-02, LFE-14. UI fixtures can start early and remain labelled.

## Sessions

### LFE-15.1 — Inspect package and coverage

Show findings, source types/dates, original versus model claims, missing and contradictory material. Do not load remote tracking images or auto-index into team search.

### LFE-15.2 — Edit and preview exact share

Allow selecting/redacting text, attachments and metadata. Show the final sanitized version plus destination and hash-bound selection before confirmation. A newer private version invalidates an old preview.

### LFE-15.3 — Publish and verify receipt

Call human-only publication; handle pending-copy/conflict/denied/unknown. Announce shared only after target bytes/readers exist. The Bot has no equivalent control.

### LFE-15.4 — Correct and withdraw

Display private edit versus shared update, separate erasure/withdrawal, current access and cleanup limits. Test member removal and changed source between preview and commit.

## Code destinations

- `apps/studio/src/features/personal/packages/ [proposed]`
- `apps/studio/src/features/intake/ [shared publication presentation]`

## Acceptance

- `LFE-15-SHUI-01` — Unselected attachment: No name/preview/body of the excluded attachment enters project source or event.
- `LFE-15-SHUI-02` — Changed preview: An old approval refuses instead of publishing unseen edits.
- `LFE-15-SHUI-03` — Copy pending/fails: Show pending/failed and private original remains; project sees no partial package.
- `LFE-15-SHUI-04` — Owner deletes personal original: Explain independent shared copy and offer separate take-back; no claim of provider-global erasure.

## Session execution and acceptance

Read the actual checkout, repository rules and [current baseline](../02_CURRENT_BASELINE.md). Use a separate worktree and one nominated writer per affected file/contract/effect. Inspect existing and candidate source before creating a path. Preserve current generated contracts, native bridge, role registry and byte/source service; do not reproduce them under a new name.

A local fixture can unblock interface development, but only the actual intended route closes live acceptance. Record fixture-ready, source-ready, integrated, hosted-verified and product-accepted separately. This document assigns no production deployment, schema write, new account, provider call, paid fallback or schedule. Operational effects use [the exact request protocol](../operations/WORKING_PROTOCOL.md).

Use affected repository checks and a failing regression for changed authority/privacy behavior. Run browser checks for visible interaction, SQL/RLS checks for data boundaries, and real native/provider crossings when that is the claim. A mock or passing schema does not prove live behavior. Keep commands/exit codes and actual source/configuration identity. Hand back one useful slice or a precise blocker using [the session handoff](../operations/HANDOFF_TEMPLATE.md); do not keep a coding session waiting for an absent person.
