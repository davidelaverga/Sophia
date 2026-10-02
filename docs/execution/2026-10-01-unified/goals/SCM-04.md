# SCM-04 — Give the project a planning and review technical lead

**Milestone:** C · **Depends on:** SCM-03  
**Human backend/runtime owner:** Davide · **Frontend implementation/integration:** Luis · **Implementation resource:** scoped Claude Code · **Operator/independent reviewer:** Codex under separate authority
**Launch:** [Claude](../launch/SCM-04_CLAUDE.md) · [Codex](../launch/SCM-04_CODEX.md)

## Outcome

Sophia turns accepted direction into a reviewable work plan, chooses a small suitable team, reviews evidence during execution and proposes material replans while keeping human decisions explicit.

## Entry and existing machinery

Task/peer/control contracts are live-qualified. Existing mission context and decisions remain canonical. Preparation of read-only review tools may begin before SCM-03 acceptance, but live team planning uses its qualified path.

**Reuse:** Mission proposal/decision/confirmation functions, M02 preset identity, core Paperclip issues/blockers/assignment/wakes and the user’s shared steering policy.

**Required sources:** S03, S04, S05, S12, P03, L03; resolve in [the source register](../sources/REGISTER.md). Read the applicable [architecture](../00_START_HERE.md) and [operations protocol](../operations/WORKING_PROTOCOL.md).

## Destination ownership

- `packages/coordination/src/planning/`
- `packages/coordination/src/reviews/`
- `packages/dsh-bundle/src/tools/`
- `packages/dsh-bundle/src/role-registry.ts`
- `config/supervision.json (versioned current config)`
- `apps/api/src/mission-tools.ts (shared work operations)`
- `apps/studio/src/features/work/`

New paths above are proposed destinations. Check the actual checkout before creating them. One nominated writer owns shared generated contracts and fresh migration IDs. Keep frozen pack contents and unrelated active branches intact.

## Goal sessions

### SCM-04-G1 — Small versioned execution recipes

**Build:** Bind lead-review, lead-replan, worker-task and independent-review to real tools, context and model/effort choices. Reuse the standard native loop and inherited budget. Do not broaden the old identity-only presets silently.

**Handback:** Effective requested/resolved/observed configuration and restricted tools can be audited on one run.

### SCM-04-G2 — Plan and work graph

**Build:** Create a compact plan revision from accepted mission/evidence, with explicit deliverables, dependencies, source scope, optional coordinator, resources and reviewers. Accept material scope through existing decisions before dispatch.

**Handback:** One plan generates actual single-assignee issues, correct blockers and an understandable next checkpoint.

### SCM-04-G3 — Manual and periodic progress review

**Build:** Implement Review work progress plus coalesced scheduled reviews under a standing allowance. Liveness checks stay deterministic; semantic review examines evidence and can return no-change/insufficient evidence.

**Handback:** A manual review is not dropped; unchanged timer ticks cause no gratuitous model work; a real contradictory result produces a useful recommendation.

### SCM-04-G4 — Independent review and decision routing

**Build:** Use a separate read-only review issue and exact candidate/criteria refs. Avoid the review dependency deadlock. Route owner permission, product acceptance and reserved deployment to their named deciders.

**Handback:** Adverse findings complete the review but do not accept the implementation; pending decisions have actual owners/actions.

### SCM-04-G5 — Bounded replan

**Build:** After a meaningful failed hypothesis, propose a revised approach with retained evidence, scope/cost implications and affected assignments. Deliver accepted local changes without unnecessary paraphrase.

**Handback:** One justified replan changes remaining work only; no discarded attempt history, duplicate writer or allowance reset.

## Prompt and skill delta

Use literal prompts/technical-lead.md, prompts/coordinator.md and prompts/independent-reviewer.md. Version a small guide capability overlay only when its actual API tools exist; keep current mission-lifecycle skill behavior.

A tool’s declaration, backend authorization and effective runtime visibility must agree. Adding a prompt mention is not implementing a capability. New role/configuration changes are hashed/versioned and exercised through the current native registry.

## Acceptance cases

| ID | Case | Required result |
|---|---|---|
| SCM-04-T01 | Mission versus command | Discussion/proposal alone creates no unauthorized execution. |
| SCM-04-T02 | Parent versus dependency | Parent grouping alone does not block; cancelled prerequisite does not satisfy success dependency. |
| SCM-04-T03 | Review deadlock | Reviewer can assess candidate before implementation terminal completion; no circular wait. |
| SCM-04-T04 | Adverse reviewer verdict | Review task done; implementation requires changes; no false product acceptance. |
| SCM-04-T05 | Timer/no-change | Repeated unchanged due events are coalesced without repeated model calls. |
| SCM-04-T06 | Manual review | Explicit review is honored or truthfully blocked, never discarded by Jev. |
| SCM-04-T07 | Recipe restore | Changed/missing configuration holds rather than uses an unrecorded default. |
| SCM-04-T08 | Replan cap | Caps and cumulative allowance survive new sessions and accepted revisions; no repeated unchanged proposal spam. |

All cases start **not run** in this pack. Add exact candidate, configuration, evidence and result when executed. A synthetic fixture proves only its labeled boundary; it is not a real provider/native/hosted result. Existing tests must remain green on the actual combined candidate.

## Operations handoff

Verify effective runtime composition and actual model identity on one bounded lead episode, then one review/replan episode under the remaining approved allowance. No deployed production change is an implicit result of accepting the plan.

The request must name exact source/artifacts, target, allowed effects, migration hashes/order where applicable, remaining allowance, expiry and recovery. Credentials are secret-store references only. Every effect’s actual result is a receipt, not an optimistic checklist tick.

## No-go / exclusions

No permanent AI hierarchy, no workforce optimizer, no universal emotional state, no mandatory Jev service, no native review-card claim without external-adapter qualification.

## Stop condition

One accepted small plan, real multi-resource execution, independent review and one evidence-based local revision are useful to Davide/Luis without turning conversation into a project-admin form.

Use the [handoff template](../operations/HANDOFF_TEMPLATE.md). Keep pending gates explicit and stop the implementation session at a meaningful boundary; no artificial wait to manufacture long-duration evidence.


## v2.0 integration obligations

Use the current source, A10/A11 reservations through 0031 at inspection, and single M03 specialist/byte/report contract. Luis implements the mapped frontend; no second registry or report UI. Personal Bot jobs are not stored in a team Paperclip company. This goal and its LFE package share acceptance evidence, not duplicate operational ownership.
