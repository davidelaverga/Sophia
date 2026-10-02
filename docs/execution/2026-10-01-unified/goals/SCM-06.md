# SCM-06 — Review the real candidate together and unblock the right owner

**Milestone:** C · **Depends on:** SCM-05  
**Human backend/runtime owner:** Davide · **Frontend implementation/integration:** Luis · **Implementation resource:** scoped Claude Code · **Operator/independent reviewer:** Codex under separate authority
**Launch:** [Claude](../launch/SCM-06_CLAUDE.md) · [Codex](../launch/SCM-06_CODEX.md)

## Outcome

The team sees the actual versioned application candidate, gives precise change/preserve feedback and resolves supported owner actions from Sophia without replacing the living brief with an agent dashboard.

## Entry and existing machinery

SCM-04/05 operational contracts are stable. A canonical artifact/source publication and reader seam from SMC-M03 or an explicitly qualified equivalent must exist before new artifact writes. Select a real existing application feature; full image/prototype generation is not silently added to this mission.

**Reuse:** Living brief/conversation shell; current event/snapshot/voice machinery; SMC-M03 source identity, storage and artifact readers; owner-native request observations.

**Required sources:** S02, S05, S07, S08, L04; resolve in [the source register](../sources/REGISTER.md). Read the applicable [architecture](../00_START_HERE.md) and [operations protocol](../operations/WORKING_PROTOCOL.md).

## Destination ownership

- `apps/studio/src/features/work/`
- `apps/studio/src/features/mission/ (preserve current behavior)`
- `apps/studio/src/features/conversation/ (actual checkout path)`
- `apps/api/src/mission-tools.ts`
- `packages/coordination/src/reviews/`
- `packages/coordination/src/required-actions/`
- `apps/media-bridge/ (versioned tool-surface integration)`

New paths above are proposed destinations. Check the actual checkout before creating them. One nominated writer owns shared generated contracts and fresh migration IDs. Keep frozen pack contents and unrelated active branches intact.

## Goal sessions

### SCM-06-G1 — Artifact-centered work projection

**Build:** Extend current Work view with real phase, candidate, next checkpoint, resource and attention state. Keep main conversation and living brief unchanged; show last-known versus live data truthfully.

**Handback:** Desktop/mobile/keyboard/reconnect fixtures render without invented progress or focus theft.

### SCM-06-G2 — Exact change/preserve review

**Build:** Bind candidate/base/criteria and known targets. Gather clustered changes, resolve ambiguity, authorize once and dispatch as steer or next revision according to current state. Enforce checks appropriate to isolated component versus broader repo edit.

**Handback:** Only authorized scope changes; required visual/behavioral checks catch cross-component effects; previous accepted preview remains until new candidate passes.

### SCM-06-G3 — Qualified in-app owner actions

**Build:** Bind one supported Omnigent permission-resolution route to current native request fingerprint/owner. Leave browser/OS/login or unsupported requests in the native tool.

**Handback:** One real in-app permission decision reconciles correctly; wrong/stale/nonowner actions fail and Stop bypasses the wait.

### SCM-06-G4 — Voice/text parity

**Build:** Add the actual management tools to a new versioned guide overlay and matching API declarations. Keep typed recipient, deadline and continuation ownership through async results. Reuse one narration arbiter.

**Handback:** Voice remains conversational during work; text-only results never become shared audio; End does not reopen when a candidate arrives.

### SCM-06-G5 — Prototype-to-implementation handback

**Build:** For the selected candidate record prototype/source assets, design constraints, implementation files, checks, independent verdict and human decision. If the creative builder is not yet implemented, use an existing source candidate and label this narrower proof.

**Handback:** One actual accepted application change; no claim that images/prototype generation shipped just because coordination worked.

## Prompt and skill delta

Use prompts/guide-work-overlay.md as a new versioned proposal, not a byte edit to existing v1.1. Tools are conditionally exposed only when qualified. Preserve explicit consent and mission proposal/acceptance distinctions.

A tool’s declaration, backend authorization and effective runtime visibility must agree. Adding a prompt mention is not implementing a capability. New role/configuration changes are hashed/versioned and exercised through the current native registry.

## Acceptance cases

| ID | Case | Required result |
|---|---|---|
| SCM-06-T01 | Living brief regression | Manual edits win, side/full/mobile flows work and only saved changes trigger indicators. |
| SCM-06-T02 | Stale review target | Feedback against an obsolete candidate cannot silently modify a newer one. |
| SCM-06-T03 | Preservation scope | Source diff plus rendered/behavioral tests check meaningful preservation; prompt-only assertion is not proof. |
| SCM-06-T04 | Permission decision | Exact owner/request/fingerprint required; unsupported request stays native. |
| SCM-06-T05 | Typed tool continuation | Private text recipient stays private across WHEN_IDLE/asynchronous results; no shared audio leak. |
| SCM-06-T06 | No duplicate narration | UI update, event, tool response and result notice do not each speak. |
| SCM-06-T07 | End and background result | Result persists in project without reopening voice. |
| SCM-06-T08 | Reader-first publication | Populated artifact records cannot break snapshot; preview/download point to same immutable bytes. |

All cases start **not run** in this pack. Add exact candidate, configuration, evidence and result when executed. A synthetic fixture proves only its labeled boundary; it is not a real provider/native/hosted result. Existing tests must remain green on the actual combined candidate.

## Operations handoff

Confirm the artifact/renderer/effect host meets the existing SMC-M03 contract. Release exact matching API/bridge/Studio readers, then enable one pilot. No frozen asset rewrite or silent insecure renderer fallback.

The request must name exact source/artifacts, target, allowed effects, migration hashes/order where applicable, remaining allowance, expiry and recovery. Credentials are secret-store references only. Every effect’s actual result is a receipt, not an optimistic checklist tick.

## No-go / exclusions

No wholesale Studio replacement, raw chat retention, new vision provider, unqualified permission autopilot or full creative-platform expansion.

## Stop condition

Davide and Luis complete one real candidate review/revision with correct owner action, preserved unrelated work, no duplicate speech and explicit acceptance distinct from deployment.

Use the [handoff template](../operations/HANDOFF_TEMPLATE.md). Keep pending gates explicit and stop the implementation session at a meaningful boundary; no artificial wait to manufacture long-duration evidence.


## v2.0 integration obligations

Use the current source, A10/A11 reservations through 0031 at inspection, and single M03 specialist/byte/report contract. Luis implements the mapped frontend; no second registry or report UI. Personal Bot jobs are not stored in a team Paperclip company. This goal and its LFE package share acceptance evidence, not duplicate operational ownership.
