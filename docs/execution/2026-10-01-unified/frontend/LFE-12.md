# LFE-12 — Complete connected context, exports and project-level continuity

**Track:** Later retained · **Primary implementation owner:** Luis · **Product:** Davide · **Operator:** Codex only for an approved batch.  
**Status:** new work-package instructions; current source is described below, not reset to “not started.”  
**Launch:** [Luis’s coding session](../launch/LFE-12_LUIS.md).

## User result and current source

Notion/Supabase/Vercel management connectors were deliberately deferred. Current native engineers retain their authorized service access; the new product UI must not block that path.

**Required sources:** P15; P19; C01; resolve in [source register](../sources/REGISTER.md). Read the actual latest branch before writing. Historical proposed destinations do not establish that a module exists.

## Dependencies and ownership

**Preparation:** LFE-00. UI fixtures can begin with versioned contract examples and honest simulation labels.

**Live feature prerequisites:** LFE-02, LFE-05, LFE-09 Relevant service/data capabilities: **S2-06, S3-04, B-CONNECTORS**, bound in [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md). Real integration, authority and source checks remain required; a mocked service never closes live acceptance.

Luis owns frontend code, interaction logic, client bindings, relevant unit/browser tests and integration review. He may implement an assigned linked API/data slice; this is not a frontend-only prohibition. One writer owns shared contracts/migrations per merge window. Davide owns runtime/authority/provider decisions. Existing PR authors retain their scope until a deliberate handoff. A coding agent’s name does not replace the human owner.

## Existing and proposed code destinations

- `apps/studio/src/features/connections/ [new]`
- `apps/studio/src/features/return/ [extend]`
- `apps/studio/src/features/export/ [new]`
- `packages/source-connectors/ [backend scope]`

## Goal sessions

### LFE-12.1 — Scope the visible connections

Show selected pages/projects/environments, actual owner, expiry and read versus effect capabilities. A first-party connector does not become a second accepted mission/source store or duplicate the native engineer’s credentials.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-12.2 — Refresh without rewriting decisions

Implement selected Notion intake/publication, then qualified Supabase/Vercel management views. A refresh proposes relevant changes with source coverage; it does not silently overwrite current accepted choices. Unsupported vendor Project sync stays explicit import/handoff.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-12.3 — Export something another engineer can use

Export selected actual source, asset/version manifest, accepted decisions, tests, remaining work and unresolved external effects. Distinguish user artifacts from private execution logs. Report omitted/inaccessible content and protect revoked sources.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-12.4 — Complete the return view

Integrate state-of-build and source freshness, meaningful cycle-close lessons with Accept/Edit/Reflect and no-change outcomes. Keep the panel/project controls stable while data refreshes.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

## API and state contract

Use [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md) and [the interaction contract](../architecture/03_STUDIO_AND_MEDIA.md). Studio uses Sophia’s authenticated API and validated current DTOs; it does not connect to provider/Paperclip/Omnigent administration. Proposed DTO/operation names are binding targets until the assigned backend exposes them. Do not invent a live endpoint from a filename or bypass a missing operation with direct database writes.

Keep server decisions and receipts separate from local view, unsent drafts, media state and viewer attention. Preserve exact work/source/request identities on mutations. Unknown outcome remains unknown and is reconciled with the same operation key. Opening a view, reading a card or holding the microphone grants no work/account authority.

## Acceptance cases

| ID | Scenario | Required observation |
|---|---|---|
| CONN-01 | Source connection expired | No scraping or alternate-account fallback; existing permitted work remains understandable. |
| CONN-02 | Export excludes private/ineligible material | Coverage is disclosed, no false complete archive claim. |
| CONN-03 | Refreshed page conflicts with accepted direction | Proposal and conflict, not silent acceptance. |
| CONN-04 | Source forgotten after derived knowledge exists | Eligibility narrows and derived display is corrected; cleanup status is truthful. |

All cases in this new track start **not run**. Attach fixture, source-integration, live-native and hosted evidence separately. Every behavioral fix needs a regression that fails without it. Check the actual Studio on desktop and phone; no requirement is satisfied solely by TypeScript compilation.

## Checks, release and stop condition

Follow actual repository checks: `pnpm toolchain:check`, frozen-lock install, affected unit tests, `pnpm lint`, `pnpm format:check`, typecheck/contracts checks and `pnpm --filter @sophia/studio run build`. Run affected DB/native tests through their existing harness when those boundaries change. Do not weaken Linux/Mac runtime identity tests to hide a known Windows-only incompatibility; record platform and reproduce only applicable baselines.

No hosted write, new paid route, deploy or schema mutation is authorized by this file. Prepare the exact Codex operation request in [ownership and handoff](../04_SEQUENCE_AND_OWNERSHIP.md). Preserve existing privacy and versioned guide assets. Stop the implementation session at one useful tested slice or a precise dependency; do not wait indefinitely for another agent.

**Excluded:** No requirement to finish connectors before team coordination, no new knowledge vendor or automatic external publication.

**First action:** Start with the smallest retained source-refresh and export workflow needed by a real team, after the creative/coordination episode is usable.

**Product completion:** the specified real user result is exercised on the intended route, with the cases above and the underlying retained goal’s criteria. Fixture-ready, source-ready, merged, hosted-verified and product-accepted remain different statuses. A frontend work package shares evidence with its parent SCM/S1/S2 goal; it does not create a second operational task controller or demand duplicate acceptance ceremonies.
