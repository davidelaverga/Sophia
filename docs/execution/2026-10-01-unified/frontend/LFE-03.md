# LFE-03 — Make Explore a real image-direction workspace

**Track:** Create · **Primary implementation owner:** Luis · **Product:** Davide · **Operator:** Codex only for an approved batch.  
**Status:** new work-package instructions; current source is described below, not reset to “not started.”  
**Launch:** [Luis’s coding session](../launch/LFE-03_LUIS.md).

## User result and current source

Explore still displays a ComingLens. Google/OpenAI image jobs are a retained independent backend capability, not implemented by Paperclip.

**Required sources:** P08; P07; R04; resolve in [source register](../sources/REGISTER.md). Read the actual latest branch before writing. Historical proposed destinations do not establish that a module exists.

## Dependencies and ownership

**Preparation:** LFE-00. UI fixtures can begin with versioned contract examples and honest simulation labels.

**Live feature prerequisites:** No other LFE feature prerequisite; use the backend capabilities below. Relevant service/data capabilities: **S1-06, B-IMAGES**, bound in [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md). Real integration, authority and source checks remain required; a mocked service never closes live acceptance.

Luis owns frontend code, interaction logic, client bindings, relevant unit/browser tests and integration review. He may implement an assigned linked API/data slice; this is not a frontend-only prohibition. One writer owns shared contracts/migrations per merge window. Davide owns runtime/authority/provider decisions. Existing PR authors retain their scope until a deliberate handoff. A coding agent’s name does not replace the human owner.

## Existing and proposed code destinations

- `apps/studio/src/features/explore/ [new]`
- `apps/studio/src/features/studio/StudioShell.tsx [existing integration]`
- `apps/studio/src/api/images.ts [proposed client; contract first]`
- `packages/creative/src/images/ [backend scope]`

## Goal sessions

### LFE-03.1 — Build one gallery over real identities

Define DirectionGallery/DirectionDetail using asset and candidate IDs, source/version, state, actual provider/configuration when available, retained reference material and display permissions. The UI fixture explicitly says simulated; do not hard-code global IDs or manufacture images from placeholders.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-03.2 — Generate and compare intentionally

Bind the actual image-job use case. A clear authorized voice/text request can admit work; comparing vendors is an intentional request, not an automatic duplicate charge. Support queued/running/partial/refused/unknown/retry states and one stable command identity.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-03.3 — Select and carry forward

Select one candidate without deleting alternatives or regenerating it. An edit targets the chosen source image/version. Retain selected bytes/tokens/reference choices for the prototype handoff. Switching lenses does not accept the design or start a worker.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-03.4 — Close one creative episode

Show one real Google candidate and one real OpenAI candidate under the approved model routes, choose one and inspect an edited version. Backend/provider binding is Davide’s task; frontend comparison, storage identity display and a11y are Luis’s.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

## API and state contract

Use [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md) and [the interaction contract](../architecture/03_STUDIO_AND_MEDIA.md). Studio uses Sophia’s authenticated API and validated current DTOs; it does not connect to provider/Paperclip/Omnigent administration. Proposed DTO/operation names are binding targets until the assigned backend exposes them. Do not invent a live endpoint from a filename or bypass a missing operation with direct database writes.

Keep server decisions and receipts separate from local view, unsent drafts, media state and viewer attention. Preserve exact work/source/request identities on mutations. Unknown outcome remains unknown and is reconciled with the same operation key. Opening a view, reading a card or holding the microphone grants no work/account authority.

## Acceptance cases

| ID | Scenario | Required observation |
|---|---|---|
| IMG-01 | Select one of two returned alternatives | Exactly that asset is retained; selection triggers zero new generation calls. |
| IMG-02 | One provider refuses or times out | The other result remains usable; unknown outcome is reconciled before duplicate paid retry. |
| IMG-03 | Source image changes during edit | Stale edit is explicit; no overwrite of a newer chosen source. |
| IMG-04 | Phone comparison and keyboard selection | All choices and provenance are reachable without hover or color-only states. |

All cases in this new track start **not run**. Attach fixture, source-integration, live-native and hosted evidence separately. Every behavioral fix needs a regression that fails without it. Check the actual Studio on desktop and phone; no requirement is satisfied solely by TypeScript compilation.

## Checks, release and stop condition

Follow actual repository checks: `pnpm toolchain:check`, frozen-lock install, affected unit tests, `pnpm lint`, `pnpm format:check`, typecheck/contracts checks and `pnpm --filter @sophia/studio run build`. Run affected DB/native tests through their existing harness when those boundaries change. Do not weaken Linux/Mac runtime identity tests to hide a known Windows-only incompatibility; record platform and reproduce only applicable baselines.

No hosted write, new paid route, deploy or schema mutation is authorized by this file. Prepare the exact Codex operation request in [ownership and handoff](../04_SEQUENCE_AND_OWNERSHIP.md). Preserve existing privacy and versioned guide assets. Stop the implementation session at one useful tested slice or a precise dependency; do not wait indefinitely for another agent.

**Excluded:** No reopening of image-provider strategy, automatic vendor waterfall, or claim that a picture is a runnable prototype.

**First action:** Implement the gallery and selection fixture beside the real image contract work; replace ComingLens only when the visible state truthfully represents the configured route.

**Product completion:** the specified real user result is exercised on the intended route, with the cases above and the underlying retained goal’s criteria. Fixture-ready, source-ready, merged, hosted-verified and product-accepted remain different statuses. A frontend work package shares evidence with its parent SCM/S1/S2 goal; it does not create a second operational task controller or demand duplicate acceptance ceremonies.
