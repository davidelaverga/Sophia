# Technical lead, execution recipes and progress judgment

## 1. One accountable lead

Sophia remains one user-facing presence. The project technical lead is a dsh role activated for a bounded purpose. A coordinator is optional for a sufficiently complex work goal, not a permanent additional manager. Native internal children and separately owned operational assignments have different lifetimes; not every small dsh subtask becomes a Paperclip issue.

Ordinary conversation does not create operational work. A clear authorized work request can commission a bounded task; a meaningful roadmap change is proposed with its implications and accepted through the current decision family. A living-brief edit updates mission context but does not automatically restart every worker.

## 2. Initial recipe set

| Recipe ID (new Sophia design) | Procedure | Initial selection rule | Permitted result |
|---|---|---|---|
| `sophia-lead-review-v1` | Read current plan, material deltas, evidence and blockers; inspect selectively | Current qualified dsh model route, bounded scope; cheaper route only after qualification | Findings, no-change, targeted instruction or proposal within authority |
| `sophia-lead-replan-v1` | Diagnose conflicting results, compare a few alternatives and revise proposed plan | Existing approved reasoning route; wider budget requires allowance | Versioned plan proposal; not self-accepted scope |
| `sophia-worker-task-v1` | Execute one contract with checkpoints and evidence | Qualified dsh or contributed native resource | Candidate and remaining-work record |
| `sophia-independent-review-v1` | Inspect exact candidate/criteria independently | Read-only tools/context; resource chosen by capability, not vendor prestige | Evidence-bearing verdict and required changes |

Recipe IDs are not already shipped presets. Bind each to M02's public preset registry and immutable definition digest, or to the owner-native bundle, then record the resolved configuration. The listed model route is preserved as a baseline, not declared optimal. Role names alone do not determine how expensive an episode is.

Execution recipe = capability/preset version + model/effort + context policy + allowed delegation + output/check contract + cumulative resource policy. Effective prompt/skills, compaction behavior and permitted descendants belong in the same record. A new recipe cannot raise authority or reset cumulative allowance.

## 3. Plan shape

A `WorkPlanRevision` captures accepted mission/source revisions, useful deliverables, scoped work items, explicit dependency edges, optional coordinators, assigned resources, review responsibilities, current assumptions and proposed user decisions. Keep the first plan small enough to inspect. Expand after evidence, not to manufacture agents.

Paperclip has a single assignee per task. Represent two independent implementation areas as two actual work items with separate source scopes; do not put three assignees in one field. Distinguish parent grouping from blockers. A coordinator review must not be deadlocked behind the candidate it must review. [P03]

The source ledger is current truth. Preserved original expectations, later outcomes and failed hypotheses remain inspectable; accepted direction is not rewritten to pretend an unsuccessful attempt met the original target.

## 4. Progress review

Expose **Review work progress** in Studio and the same typed intent through Sophia. It returns an admitted review/available result, not a fabricated immediate assessment. A manual review cannot be dropped by a classifier.

Retain the initial five-minute active-project review policy from the existing direction as a configurable, explicitly authorized interval. Coalesce repeated due events, check whether relevant state changed, and do cheap liveness checks without a model. Semantic review needs a genuine reason: new candidate, failed check, contradictory evidence, missed checkpoint, required decision, repeated unsuccessful repair, material quota change or the user request. Do not invoke every worker on the timer.

A quiet agent may be productively diagnosing; a busy event stream may be repeating a dead approach. Review evidence and deliverables, not token count or elapsed time alone. The reviewer can conclude “insufficient evidence” and request a checkpoint rather than label the agent stuck with false certainty.

## 5. Bounded replan and recovery

Separate a transport retry, a native-history recovery, a content repair, a plan change and an output rendition. Retry only the failed layer. An upload failure should not buy another research run; a permission wait should not trigger a new agent; a syntax fix should not reopen the mission.

Initial policy defaults, subject to the actual work grant: at most one automatic content-repair cycle per candidate; at most two automatic replan proposals per work revision, then a human decision; no repeated unchanged blocker escalations. These are design defaults, not new spending allowances. Existing stricter caps win.

Review runs consume the same project resource envelope. When a required review cannot be funded, present awaiting review, not an unreviewed success. Preserve useful output and name what remains.

## 6. Human decisions and cooperation opportunities

A `DecisionRequest` records the target/revision, proposer, options, relevant evidence, named decider, expiry and consequence. Use the existing decision/confirmation machinery for accepted mission changes; add a typed operational subtype rather than creating an unrelated approvals app.

Required actions (owner permission, reserved deployment) differ from optional cooperation opportunities (taste, judgment, local knowledge). Sophia may say “Your judgment would help choose between these two interaction patterns” and show the actual candidates. Do not interrupt the room for routine tool messages or turn a voluntary invitation into a blocker.

Accepted local changes may be delivered through software without a lead call that only paraphrases them. Material conflicts or cross-dependency changes go to the lead. Shared-view control, input floor, project builder rights and resource ownership remain distinct. [L03]

## 7. Learning is later, records begin now

Record recipe/configuration identity, source and outcome references, selected allocation, decisions, repairs, usage basis and limitations. These records enable SCM-08; they do not authorize automatic prompt evolution. Protect the guide's identity/safety files and personal context. An individual project decision can guide that project now without waiting for a generalization experiment.


## Current continuation binding

This is the v2.0 normative integration specification. The current M02 runtime, PR32 registry/artifact work and Luis-owned side-panel implementation are described in [current baseline](../02_CURRENT_BASELINE.md). Local source/fixture work can proceed while only the relevant live dependency remains gated. Paperclip is not the first private Bot job store: owner-private messages/packages remain in Sophia until an exact human share. [Source namespace SCM](../sources/REGISTER.md); new code and provider behavior still require the listed goal acceptance.
