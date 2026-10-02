# LFE-04 — Let Luis build and edit runnable prototype source inside Sophia

**Track:** Create · **Primary implementation owner:** Luis · **Product:** Davide · **Operator:** Codex only for an approved batch.  
**Status:** new work-package instructions; current source is described below, not reset to “not started.”  
**Launch:** [Luis’s coding session](../launch/LFE-04_LUIS.md).

## User result and current source

Build still has a placeholder. The original plan assigns this capability to Luis and requires actual source handoff, not screenshot reconstruction.

**Required sources:** P09; P07; resolve in [source register](../sources/REGISTER.md). Read the actual latest branch before writing. Historical proposed destinations do not establish that a module exists.

## Dependencies and ownership

**Preparation:** LFE-00. UI fixtures can begin with versioned contract examples and honest simulation labels.

**Live feature prerequisites:** No other LFE feature prerequisite; use the backend capabilities below. Relevant service/data capabilities: **S1-07, B-PROTOTYPE**, bound in [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md). Real integration, authority and source checks remain required; a mocked service never closes live acceptance.

Luis owns frontend code, interaction logic, client bindings, relevant unit/browser tests and integration review. He may implement an assigned linked API/data slice; this is not a frontend-only prohibition. One writer owns shared contracts/migrations per merge window. Davide owns runtime/authority/provider decisions. Existing PR authors retain their scope until a deliberate handoff. A coding agent’s name does not replace the human owner.

## Existing and proposed code destinations

- `apps/studio/src/features/source-editor/ [new]`
- `apps/studio/src/features/explore/ [shared candidate selection]`
- `packages/creative/src/prototype-bundle.ts [backend integration]`
- `apps/execution-host/src/workspace-supervisor.ts [proposed; verify current execution home]`

## Goal sessions

### LFE-04.1 — Bind one supported source bundle

React/TypeScript/Vite is the retained first prototype stack; adapt its handoff to the target repo rather than claiming universal zero-rework integration. Bundle source, dependency lock, selected assets, design tokens, interaction states and explicit mock-service boundaries.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-04.2 — Implement Preview / Source / Diff

Use bounded lazy CodeMirror 6 for permitted files, not a new full IDE. The three views select one candidate. Opening Source is read-only and does not Hold work. Editing is an explicit writer takeover: ask the host to settle the affected writer before enabling save.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-04.3 — Save without losing another writer’s work

Submit a patch against exact file/base hashes. A conflict keeps Luis’s draft and the incoming candidate, with a compare/rebase choice. Build in the no-secret isolated service; a failed build never replaces the last useful preview. Selection and local drafts are not canonical acceptance.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-04.4 — Hand the implementation team actual source

Export a manifest and source package that builds fresh. Hand it to the technical lead with behavior, preserved design, service gaps and checks. Verify the returned app uses these components/assets rather than a re-created screenshot approximation.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

## API and state contract

Use [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md) and [the interaction contract](../architecture/03_STUDIO_AND_MEDIA.md). Studio uses Sophia’s authenticated API and validated current DTOs; it does not connect to provider/Paperclip/Omnigent administration. Proposed DTO/operation names are binding targets until the assigned backend exposes them. Do not invent a live endpoint from a filename or bypass a missing operation with direct database writes.

Keep server decisions and receipts separate from local view, unsent drafts, media state and viewer attention. Preserve exact work/source/request identities on mutations. Unknown outcome remains unknown and is reconciled with the same operation key. Opening a view, reading a card or holding the microphone grants no work/account authority.

## Acceptance cases

| ID | Scenario | Required observation |
|---|---|---|
| SRC-01 | Save while a newer worker candidate arrives | Expected-base conflict preserves both sources; no optimistic overwrite. |
| SRC-02 | Build script fails or attempts secret access | Confined build fails truthfully; previous preview and draft remain. |
| SRC-03 | Open Source then inspect another file | No work control, acceptance or shared-focus change occurs. |
| SRC-04 | Export and build in a fresh qualified workspace | Actual preview source, lock and assets reproduce; mocks remain clearly labeled. |

All cases in this new track start **not run**. Attach fixture, source-integration, live-native and hosted evidence separately. Every behavioral fix needs a regression that fails without it. Check the actual Studio on desktop and phone; no requirement is satisfied solely by TypeScript compilation.

## Checks, release and stop condition

Follow actual repository checks: `pnpm toolchain:check`, frozen-lock install, affected unit tests, `pnpm lint`, `pnpm format:check`, typecheck/contracts checks and `pnpm --filter @sophia/studio run build`. Run affected DB/native tests through their existing harness when those boundaries change. Do not weaken Linux/Mac runtime identity tests to hide a known Windows-only incompatibility; record platform and reproduce only applicable baselines.

No hosted write, new paid route, deploy or schema mutation is authorized by this file. Prepare the exact Codex operation request in [ownership and handoff](../04_SEQUENCE_AND_OWNERSHIP.md). Preserve existing privacy and versioned guide assets. Stop the implementation session at one useful tested slice or a precise dependency; do not wait indefinitely for another agent.

**Excluded:** No unrestricted shell in the browser, native credential exposure, arbitrary repository edit guarantee or dependency on finishing the entire management stack.

**First action:** Begin source/preview fixtures against the artifact identity from PR32; coordinate the sandbox and writer-takeover contract with Davide before live save.

**Product completion:** the specified real user result is exercised on the intended route, with the cases above and the underlying retained goal’s criteria. Fixture-ready, source-ready, merged, hosted-verified and product-accepted remain different statuses. A frontend work package shares evidence with its parent SCM/S1/S2 goal; it does not create a second operational task controller or demand duplicate acceptance ceremonies.
