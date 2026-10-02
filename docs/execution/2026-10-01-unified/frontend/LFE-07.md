# LFE-07 — Let people review the lead’s plan, steer and reallocate intelligently

**Track:** Coordinate · **Primary implementation owner:** Luis · **Product:** Davide · **Operator:** Codex only for an approved batch.  
**Status:** new work-package instructions; current source is described below, not reset to “not started.”  
**Launch:** [Luis’s coding session](../launch/LFE-07_LUIS.md).

## User result and current source

SCM-04/05 define operational planning and capacity-aware amendments. This frontend package implements those outcomes, not another scheduler.

**Required sources:** C01; P07; P18; resolve in [source register](../sources/REGISTER.md). Read the actual latest branch before writing. Historical proposed destinations do not establish that a module exists.

## Dependencies and ownership

**Preparation:** LFE-00. UI fixtures can begin with versioned contract examples and honest simulation labels.

**Live feature prerequisites:** LFE-06 Relevant service/data capabilities: **SCM-04, SCM-05**, bound in [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md). Real integration, authority and source checks remain required; a mocked service never closes live acceptance.

Luis owns frontend code, interaction logic, client bindings, relevant unit/browser tests and integration review. He may implement an assigned linked API/data slice; this is not a frontend-only prohibition. One writer owns shared contracts/migrations per merge window. Davide owns runtime/authority/provider decisions. Existing PR authors retain their scope until a deliberate handoff. A coding agent’s name does not replace the human owner.

## Existing and proposed code destinations

- `apps/studio/src/features/work/planning/ [new]`
- `apps/studio/src/features/work/guidance/ [new]`
- `apps/studio/src/features/resources/ [shared]`
- `packages/coordination/src/ [backend source; no duplicate frontend logic]`

## Goal sessions

### LFE-07.1 — Show the smallest useful plan

Display outcome, scope, next checkpoint, selected team/roles, dependencies and reserved decisions. Keep assumptions distinct from accepted choices, without mandatory probability scoring. Edits address exact plan revisions.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-07.2 — Make progress review tangible

Review work progress creates or joins the actual bounded lead review and immediately shows a pending receipt. Its result distinguishes observation, interpretation, uncertainty and proposed intervention. Routine continue updates last-reviewed quietly; material changes show evidence and a way to challenge.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-07.3 — Implement the capacity warning

Bind warning to the exact pending amendment, affected resource/windows, observation age and current contribution grant. Actions: Confirm steer, Let project lead reassign, Cancel amendment. Confirmation accepts a risk, not a hard-limit override, paid overage or another owner’s reserve.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-07.4 — Explain a handover rather than hide it

Show destination selected, source saved, old writer settling, remaining scope assigned and destination verified. A ready alternative is not automatically authorized. Let the host choose transfer only added work, bounded support, next-boundary handoff or waiting for reset; the UI never decides the strategy itself.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

## API and state contract

Use [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md) and [the interaction contract](../architecture/03_STUDIO_AND_MEDIA.md). Studio uses Sophia’s authenticated API and validated current DTOs; it does not connect to provider/Paperclip/Omnigent administration. Proposed DTO/operation names are binding targets until the assigned backend exposes them. Do not invent a live endpoint from a filename or bypass a missing operation with direct database writes.

Keep server decisions and receipts separate from local view, unsent drafts, media state and viewer attention. Preserve exact work/source/request identities on mutations. Unknown outcome remains unknown and is reconciled with the same operation key. Opening a view, reading a card or holding the microphone grants no work/account authority.

## Acceptance cases

| ID | Scenario | Required observation |
|---|---|---|
| PLAN-01 | Click Review twice while one review is active | Join the existing review reason; no duplicate expensive task. |
| PLAN-02 | Confirm an old warning after candidate/scope changes | Re-evaluate or refuse the stale amendment; no quiet approval of new scope. |
| PLAN-03 | Select reassignment with old writer stop uncertain | Show uncertainty and preserve source; no claim another writer safely owns it. |
| PLAN-04 | Lead sees no useful intervention | No attention card or spoken interruption is manufactured. |
| PLAN-05 | Account reserve would be exceeded | Ask the actual owner or offer eligible alternatives; Confirm steer alone cannot consume it. |

All cases in this new track start **not run**. Attach fixture, source-integration, live-native and hosted evidence separately. Every behavioral fix needs a regression that fails without it. Check the actual Studio on desktop and phone; no requirement is satisfied solely by TypeScript compilation.

## Checks, release and stop condition

Follow actual repository checks: `pnpm toolchain:check`, frozen-lock install, affected unit tests, `pnpm lint`, `pnpm format:check`, typecheck/contracts checks and `pnpm --filter @sophia/studio run build`. Run affected DB/native tests through their existing harness when those boundaries change. Do not weaken Linux/Mac runtime identity tests to hide a known Windows-only incompatibility; record platform and reproduce only applicable baselines.

No hosted write, new paid route, deploy or schema mutation is authorized by this file. Prepare the exact Codex operation request in [ownership and handoff](../04_SEQUENCE_AND_OWNERSHIP.md). Preserve existing privacy and versioned guide assets. Stop the implementation session at one useful tested slice or a precise dependency; do not wait indefinitely for another agent.

**Excluded:** No mandatory Jev service, model-based bookkeeping, native usage credit “team wallet” or fixed vendor hierarchy.

**First action:** Use SCM-04’s review/plan result fixtures and SCM-05’s exact steer decision schema; own the user-facing interaction and tests.

**Product completion:** the specified real user result is exercised on the intended route, with the cases above and the underlying retained goal’s criteria. Fixture-ready, source-ready, merged, hosted-verified and product-accepted remain different statuses. A frontend work package shares evidence with its parent SCM/S1/S2 goal; it does not create a second operational task controller or demand duplicate acceptance ceremonies.
