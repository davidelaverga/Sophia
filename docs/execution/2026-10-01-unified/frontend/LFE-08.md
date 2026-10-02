# LFE-08 — Review the actual app and steer a precise change

**Track:** Coordinate/create join · **Primary implementation owner:** Luis · **Product:** Davide · **Operator:** Codex only for an approved batch.  
**Status:** new work-package instructions; current source is described below, not reset to “not started.”  
**Launch:** [Luis’s coding session](../launch/LFE-08_LUIS.md).

## User result and current source

Actual report viewing is under PR32; application co-review remains new. The first review can use an existing real source-linked app before the complete native prototype platform is ready.

**Required sources:** C01; P07; P09; resolve in [source register](../sources/REGISTER.md). Read the actual latest branch before writing. Historical proposed destinations do not establish that a module exists.

## Dependencies and ownership

**Preparation:** LFE-00. UI fixtures can begin with versioned contract examples and honest simulation labels.

**Live feature prerequisites:** LFE-06, LFE-07 Relevant service/data capabilities: **SCM-06, B-PREVIEW**, bound in [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md). Real integration, authority and source checks remain required; a mocked service never closes live acceptance.

Luis owns frontend code, interaction logic, client bindings, relevant unit/browser tests and integration review. He may implement an assigned linked API/data slice; this is not a frontend-only prohibition. One writer owns shared contracts/migrations per merge window. Davide owns runtime/authority/provider decisions. Existing PR authors retain their scope until a deliberate handoff. A coding agent’s name does not replace the human owner.

## Existing and proposed code destinations

- `apps/studio/src/features/review/ [new]`
- `apps/studio/src/features/source-editor/ [shared if available]`
- `apps/studio/src/features/artifacts/DocumentViewer.tsx [PR32; adapt shared identity, not all DOM behavior]`
- `apps/studio/src/features/voice/ [existing controls]`

## Goal sessions

### LFE-08.1 — Open a verifiable candidate

Use a team-owned isolated preview origin with explicit frame policy and a narrow message bridge. Retain source/base, deployment/preview identity, known mocks and checks. An arbitrary URL blocked by frame policy opens through a truthful separate tab, not header stripping.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-08.2 — Resolve the target with the person

Selection carries expected origin/window/nonce/preview/source version and available exact text or file/element evidence. Vision helps layout, not authority. Clarify material ambiguity and gather clustered feedback; a clear authorized command need not require five confirmation clicks.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-08.3 — Send change and preservation together

Create one ReviewIntent with changed targets, preserved behavior/style, criteria revision and contributor. The lead maps it to current work. Received/delivered/observed/checked are separate; the user retains the old useful preview.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-08.4 — Review returned evidence

Inspect actual source diff and relevant runtime/rendered checks. Candidate-ready, independent-review-passed, accepted and deployed remain separate. Barge-in, Stop Looking and End exchange do not silently cancel the build; a result never reopens an ended exchange.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

## API and state contract

Use [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md) and [the interaction contract](../architecture/03_STUDIO_AND_MEDIA.md). Studio uses Sophia’s authenticated API and validated current DTOs; it does not connect to provider/Paperclip/Omnigent administration. Proposed DTO/operation names are binding targets until the assigned backend exposes them. Do not invent a live endpoint from a filename or bypass a missing operation with direct database writes.

Keep server decisions and receipts separate from local view, unsent drafts, media state and viewer attention. Preserve exact work/source/request identities on mutations. Unknown outcome remains unknown and is reconciled with the same operation key. Opening a view, reading a card or holding the microphone grants no work/account authority.

## Acceptance cases

| ID | Scenario | Required observation |
|---|---|---|
| REV-01 | Selection from wrong iframe origin or stale preview | Reject the selection as authority; no dispatch to a new candidate. |
| REV-02 | Say “the one below” and then correct it | Resolve a real current target before the requested change is sent. |
| REV-03 | Ask to preserve primary interaction while changing a secondary action | Returned candidate is checked for both; no unconditional surgical claim. |
| REV-04 | New candidate fails checks | Previous accepted/useful preview remains available. |
| REV-05 | Typed feedback has asynchronous tool continuation during room voice | Correct recipient and mode persist; private text is not spoken into shared audio. |

All cases in this new track start **not run**. Attach fixture, source-integration, live-native and hosted evidence separately. Every behavioral fix needs a regression that fails without it. Check the actual Studio on desktop and phone; no requirement is satisfied solely by TypeScript compilation.

## Checks, release and stop condition

Follow actual repository checks: `pnpm toolchain:check`, frozen-lock install, affected unit tests, `pnpm lint`, `pnpm format:check`, typecheck/contracts checks and `pnpm --filter @sophia/studio run build`. Run affected DB/native tests through their existing harness when those boundaries change. Do not weaken Linux/Mac runtime identity tests to hide a known Windows-only incompatibility; record platform and reproduce only applicable baselines.

No hosted write, new paid route, deploy or schema mutation is authorized by this file. Prepare the exact Codex operation request in [ownership and handoff](../04_SEQUENCE_AND_OWNERSHIP.md). Preserve existing privacy and versioned guide assets. Stop the implementation session at one useful tested slice or a precise dependency; do not wait indefinitely for another agent.

**Excluded:** No claim of guaranteed arbitrary-repository surgical editing; no dependency on inventing new image-generation capability for the first application review.

**First action:** Bind the first real app preview and selection contract with the technical lead/backend owner, then implement review against that exact source.

**Product completion:** the specified real user result is exercised on the intended route, with the cases above and the underlying retained goal’s criteria. Fixture-ready, source-ready, merged, hosted-verified and product-accepted remain different statuses. A frontend work package shares evidence with its parent SCM/S1/S2 goal; it does not create a second operational task controller or demand duplicate acceptance ceremonies.
