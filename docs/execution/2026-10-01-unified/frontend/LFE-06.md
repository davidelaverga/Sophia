# LFE-06 — Make all three resources and their work visible and controllable

**Track:** Coordinate · **Primary implementation owner:** Luis · **Product:** Davide · **Operator:** Codex only for an approved batch.  
**Status:** new work-package instructions; current source is described below, not reset to “not started.”  
**Launch:** [Luis’s coding session](../launch/LFE-06_LUIS.md).

## User result and current source

Current work UI and replay primitives exist; the owner-resource and Paperclip integrations are new SCM work. Do not expose upstream administration in the browser.

**Required sources:** C01; P07; R03; resolve in [source register](../sources/REGISTER.md). Read the actual latest branch before writing. Historical proposed destinations do not establish that a module exists.

## Dependencies and ownership

**Preparation:** LFE-00. UI fixtures can begin with versioned contract examples and honest simulation labels.

**Live feature prerequisites:** No other LFE feature prerequisite; use the backend capabilities below. Relevant service/data capabilities: **SCM-01, SCM-02, SCM-03**, bound in [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md). Real integration, authority and source checks remain required; a mocked service never closes live acceptance.

Luis owns frontend code, interaction logic, client bindings, relevant unit/browser tests and integration review. He may implement an assigned linked API/data slice; this is not a frontend-only prohibition. One writer owns shared contracts/migrations per merge window. Davide owns runtime/authority/provider decisions. Existing PR authors retain their scope until a deliberate handoff. A coding agent’s name does not replace the human owner.

## Existing and proposed code destinations

- `apps/studio/src/features/resources/ [new]`
- `apps/studio/src/features/work/ [existing; extend]`
- `apps/studio/src/features/work/attention/ [proposed]`
- `apps/studio/src/api/coordination.ts [proposed; validated contracts]`

## Goal sessions

### LFE-06.1 — Bind identity and readiness

Render Davide Codex, Davide Claude and Luis Claude as separately enrolled resources. Show owner, native route, host availability, actual model/effort where observed, current assignment, freshness and supported controls. Two sessions from one account must not show duplicated independent allowance.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-06.2 — Show actual capacity

Use each applicable window, reset and source age. Unknown is not 100 percent; a forecast reset is refresh-pending until observed. Separate account availability from project contribution/reserve and API spending. No arithmetic across different providers’ percentages.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-06.3 — Surface the exact action owner

A persistent action names owner, native session, requested operation and state. Initial action opens the correct native destination; no unsupported Approve button. Opening/seeing a card does not resolve it. Preserve deny, expired, superseded and unknown outcomes.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-06.4 — Connect guidance and controls

Use current assignment IDs and epochs for guidance, Hold and Stop. Show recorded/queued/native-observed/result-checked distinctly. Stop remains available during quota exhaustion or a permission wait; connection loss never becomes a fabricated successful stop.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-06.5 — Prove two-user operation

Exercise both members and three real resources under SCM, then reconnect the observer. Browsing or having the input floor does not change project-edit or account-owner rights.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

## API and state contract

Use [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md) and [the interaction contract](../architecture/03_STUDIO_AND_MEDIA.md). Studio uses Sophia’s authenticated API and validated current DTOs; it does not connect to provider/Paperclip/Omnigent administration. Proposed DTO/operation names are binding targets until the assigned backend exposes them. Do not invent a live endpoint from a filename or bypass a missing operation with direct database writes.

Keep server decisions and receipts separate from local view, unsent drafts, media state and viewer attention. Preserve exact work/source/request identities on mutations. Unknown outcome remains unknown and is reconciled with the same operation key. Opening a view, reading a card or holding the microphone grants no work/account authority.

## Acceptance cases

| ID | Scenario | Required observation |
|---|---|---|
| RES-01 | Two Claude sessions use the same owner account | Capacity is accounted once; roles/sessions remain individually inspectable. |
| RES-02 | Quota/window/host observation absent | Show unknown or stale and its age, never full capacity or executing. |
| RES-03 | Luis views Davide’s owner-only request | He can inspect authorized context but cannot answer it using its URL. |
| RES-04 | Stop while native action waits | Control is admitted independently; late native answer cannot restart stopped work. |
| RES-05 | Worker idle or observer disconnected | No false completion, product acceptance or worker-restarted animation. |

All cases in this new track start **not run**. Attach fixture, source-integration, live-native and hosted evidence separately. Every behavioral fix needs a regression that fails without it. Check the actual Studio on desktop and phone; no requirement is satisfied solely by TypeScript compilation.

## Checks, release and stop condition

Follow actual repository checks: `pnpm toolchain:check`, frozen-lock install, affected unit tests, `pnpm lint`, `pnpm format:check`, typecheck/contracts checks and `pnpm --filter @sophia/studio run build`. Run affected DB/native tests through their existing harness when those boundaries change. Do not weaken Linux/Mac runtime identity tests to hide a known Windows-only incompatibility; record platform and reproduce only applicable baselines.

No hosted write, new paid route, deploy or schema mutation is authorized by this file. Prepare the exact Codex operation request in [ownership and handoff](../04_SEQUENCE_AND_OWNERSHIP.md). Preserve existing privacy and versioned guide assets. Stop the implementation session at one useful tested slice or a precise dependency; do not wait indefinitely for another agent.

**Excluded:** No browser-held Omnigent/Paperclip admin token, provider credentials, generic API proxy or resource count presented as productivity.

**First action:** Build resource/action/status fixtures against SCM-02’s contracts while its adapters are implemented; retain the existing project feed.

**Product completion:** the specified real user result is exercised on the intended route, with the cases above and the underlying retained goal’s criteria. Fixture-ready, source-ready, merged, hosted-verified and product-accepted remain different statuses. A frontend work package shares evidence with its parent SCM/S1/S2 goal; it does not create a second operational task controller or demand duplicate acceptance ceremonies.
