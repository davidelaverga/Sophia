# LFE-10 — Add enforced targeted editing and executable UI scenarios

**Track:** Precision · **Primary implementation owner:** Luis · **Product:** Davide · **Operator:** Codex only for an approved batch.  
**Status:** new work-package instructions; current source is described below, not reset to “not started.”  
**Launch:** [Luis’s coding session](../launch/LFE-10_LUIS.md).

## User result and current source

SCM-06 review-to-steer does not complete exact mutation or scenario testing. These retained S2 goals need a dedicated deliverable and the source services underneath it.

**Required sources:** P10; P11; P07; resolve in [source register](../sources/REGISTER.md). Read the actual latest branch before writing. Historical proposed destinations do not establish that a module exists.

## Dependencies and ownership

**Preparation:** LFE-00. UI fixtures can begin with versioned contract examples and honest simulation labels.

**Live feature prerequisites:** LFE-04, LFE-08 Relevant service/data capabilities: **S2-02, S2-03, B-MUTATIONS**, bound in [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md). Real integration, authority and source checks remain required; a mocked service never closes live acceptance.

Luis owns frontend code, interaction logic, client bindings, relevant unit/browser tests and integration review. He may implement an assigned linked API/data slice; this is not a frontend-only prohibition. One writer owns shared contracts/migrations per merge window. Davide owns runtime/authority/provider decisions. Existing PR authors retain their scope until a deliberate handoff. A coding agent’s name does not replace the human owner.

## Existing and proposed code destinations

- `apps/studio/src/features/review/ [extend]`
- `apps/studio/.storybook/ [new if not introduced earlier]`
- `packages/scenarios/ [new]`
- `tests/preview-e2e/ [new]`
- `packages/artifacts/src/mutations/ [backend proposed destination]`

## Goal sessions

### LFE-10.1 — Make the promised edit boundary visible

For supported UI/HTML/slide-source components, bind exact base/targets/protected source. For imported flattened files, offer inspection or explicit conversion rather than a lossless native-edit claim. Shared CSS/API changes require an expanded impact decision.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-10.2 — Connect isolated revision and publication

Stage only allowed writable source where the format supports it; validate entire diff, sibling hashes and meaningful rendered behavior before CAS publication. Binary packaging metadata or legitimate page shifts are not source-preservation failures.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-10.3 — Expose scenarios as scenarios

Add Storybook where useful and MSW-controlled loading/empty/failure/success states tied to the candidate. Make simulated services explicit. Keep test tooling out of the production user’s critical path.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-10.4 — Join visual observation to executable evidence

Run Playwright against the real preview; store source/deployment identity, assertions, console/network and trace. A timestamped video observation can inspire a test, but dsh replay or a mock service cannot satisfy the integrated behavior criterion.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

## API and state contract

Use [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md) and [the interaction contract](../architecture/03_STUDIO_AND_MEDIA.md). Studio uses Sophia’s authenticated API and validated current DTOs; it does not connect to provider/Paperclip/Omnigent administration. Proposed DTO/operation names are binding targets until the assigned backend exposes them. Do not invent a live endpoint from a filename or bypass a missing operation with direct database writes.

Keep server decisions and receipts separate from local view, unsent drafts, media state and viewer attention. Preserve exact work/source/request identities on mutations. Unknown outcome remains unknown and is reconciled with the same operation key. Opening a view, reading a card or holding the microphone grants no work/account authority.

## Acceptance cases

| ID | Scenario | Required observation |
|---|---|---|
| EDIT-01 | Edit one component with protected sibling source | Only authorized source changes; actual checks catch shared-style behavioral regression. |
| EDIT-02 | Stale expected base | Candidate conflict, never overwrite; retain manual draft and valid preview. |
| SIM-01 | Scenario success uses mocked persistence | Display simulation label; not accepted as real database behavior. |
| SIM-02 | Recorded agent/model replay passes | Evidence stays runtime-replay, not fresh provider/UI application proof. |

All cases in this new track start **not run**. Attach fixture, source-integration, live-native and hosted evidence separately. Every behavioral fix needs a regression that fails without it. Check the actual Studio on desktop and phone; no requirement is satisfied solely by TypeScript compilation.

## Checks, release and stop condition

Follow actual repository checks: `pnpm toolchain:check`, frozen-lock install, affected unit tests, `pnpm lint`, `pnpm format:check`, typecheck/contracts checks and `pnpm --filter @sophia/studio run build`. Run affected DB/native tests through their existing harness when those boundaries change. Do not weaken Linux/Mac runtime identity tests to hide a known Windows-only incompatibility; record platform and reproduce only applicable baselines.

No hosted write, new paid route, deploy or schema mutation is authorized by this file. Prepare the exact Codex operation request in [ownership and handoff](../04_SEQUENCE_AND_OWNERSHIP.md). Preserve existing privacy and versioned guide assets. Stop the implementation session at one useful tested slice or a precise dependency; do not wait indefinitely for another agent.

**Excluded:** No whole-artifact regeneration merely because target resolution was ambiguous, no unsupported arbitrary-file editing guarantee.

**First action:** Choose one supported source-backed prototype component, implement its revision and one failing/passing application scenario end to end.

**Product completion:** the specified real user result is exercised on the intended route, with the cases above and the underlying retained goal’s criteria. Fixture-ready, source-ready, merged, hosted-verified and product-accepted remain different statuses. A frontend work package shares evidence with its parent SCM/S1/S2 goal; it does not create a second operational task controller or demand duplicate acceptance ceremonies.
