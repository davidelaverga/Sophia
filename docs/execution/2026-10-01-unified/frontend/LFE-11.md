# LFE-11 — Extend consented voice, selected vision and hands-free navigation

**Track:** Cooperate · **Primary implementation owner:** Luis · **Product:** Davide · **Operator:** Codex only for an approved batch.  
**Status:** new work-package instructions; current source is described below, not reset to “not started.”  
**Launch:** [Luis’s coding session](../launch/LFE-11_LUIS.md).

## User result and current source

The current Gemini/LiveKit path and shared room controls exist. Discussion-following, broader navigation and video inspection require explicit capability additions, not a rewrite of the room.

**Required sources:** P14; P07; R03; resolve in [source register](../sources/REGISTER.md). Read the actual latest branch before writing. Historical proposed destinations do not establish that a module exists.

## Dependencies and ownership

**Preparation:** LFE-00. UI fixtures can begin with versioned contract examples and honest simulation labels.

**Live feature prerequisites:** LFE-08 Relevant service/data capabilities: **S2-05, B-PARTICIPATION**, bound in [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md). Real integration, authority and source checks remain required; a mocked service never closes live acceptance.

Luis owns frontend code, interaction logic, client bindings, relevant unit/browser tests and integration review. He may implement an assigned linked API/data slice; this is not a frontend-only prohibition. One writer owns shared contracts/migrations per merge window. Davide owns runtime/authority/provider decisions. Existing PR authors retain their scope until a deliberate handoff. A coding agent’s name does not replace the human owner.

## Existing and proposed code destinations

- `apps/studio/src/features/voice/ [extend existing]`
- `apps/studio/src/features/studio/ [registered navigation targets]`
- `apps/media-bridge/src/participation/ [backend proposed]`
- `apps/studio/src/features/review/ [selected visual source]`

## Goal sessions

### LFE-11.1 — Keep invocation complete and simple

Ordinary direct conversation remains on the existing Gemini route. Add navigation intents only for actual registered destinations/objects; viewing, discussing, sharing focus and changing work stay distinct effects.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-11.2 — Prove a navigation result

“Open the latest report” resolves exact eligible artifact/version and intended viewer. The application returns a rendered/location receipt or truthful failure before Sophia says it opened it. A second participant’s lens stays local unless they explicitly follow shared focus.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-11.3 — Add opt-in discussion following

Use authenticated track attribution and per-person consent; represent silence/card/admitted speech separately. No default retention of ambient transcripts, psychological profiling or hidden voice identity. Withdrawing consent or guest changes affects the actual media input path.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-11.4 — Validate media and control combinations

Test EN/IT/ES correction, negation, numbers, overlap, barge-in and reconnect. A selected image/video segment has visible looking status and immediate Stop Looking. Neither ending visual input nor speech interruption becomes Stop work.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

## API and state contract

Use [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md) and [the interaction contract](../architecture/03_STUDIO_AND_MEDIA.md). Studio uses Sophia’s authenticated API and validated current DTOs; it does not connect to provider/Paperclip/Omnigent administration. Proposed DTO/operation names are binding targets until the assigned backend exposes them. Do not invent a live endpoint from a filename or bypass a missing operation with direct database writes.

Keep server decisions and receipts separate from local view, unsent drafts, media state and viewer attention. Preserve exact work/source/request identities on mutations. Unknown outcome remains unknown and is reconciled with the same operation key. Opening a view, reading a card or holding the microphone grants no work/account authority.

## Acceptance cases

| ID | Scenario | Required observation |
|---|---|---|
| VOICE-01 | Quoted or negated wake/name | No unconditional action or speech command. |
| VOICE-02 | Open an artifact for this viewer | App confirms location/identity; other member navigation unchanged. |
| VOICE-03 | Revoke looking/listening then reconnect | Old frames/audio or cached context cannot silently become newly authorized input. |
| VOICE-04 | Question while background work completes | One meaningful notice at an appropriate boundary; no duplicate speech from tool/UI/event. |

All cases in this new track start **not run**. Attach fixture, source-integration, live-native and hosted evidence separately. Every behavioral fix needs a regression that fails without it. Check the actual Studio on desktop and phone; no requirement is satisfied solely by TypeScript compilation.

## Checks, release and stop condition

Follow actual repository checks: `pnpm toolchain:check`, frozen-lock install, affected unit tests, `pnpm lint`, `pnpm format:check`, typecheck/contracts checks and `pnpm --filter @sophia/studio run build`. Run affected DB/native tests through their existing harness when those boundaries change. Do not weaken Linux/Mac runtime identity tests to hide a known Windows-only incompatibility; record platform and reproduce only applicable baselines.

No hosted write, new paid route, deploy or schema mutation is authorized by this file. Prepare the exact Codex operation request in [ownership and handoff](../04_SEQUENCE_AND_OWNERSHIP.md). Preserve existing privacy and versioned guide assets. Stop the implementation session at one useful tested slice or a precise dependency; do not wait indefinitely for another agent.

**Excluded:** No new cascade fallback, always-listening consent assumption, guessed emotion control or mandatory Jev service.

**First action:** Add one concrete voice-navigation target to the current application action registry and prove its UI receipt before expanding coverage.

**Product completion:** the specified real user result is exercised on the intended route, with the cases above and the underlying retained goal’s criteria. Fixture-ready, source-ready, merged, hosted-verified and product-accepted remain different statuses. A frontend work package shares evidence with its parent SCM/S1/S2 goal; it does not create a second operational task controller or demand duplicate acceptance ceremonies.
