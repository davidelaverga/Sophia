# Design specialist and significant-UI approval

**Owner of the decision:** Davide.  
**Implementer:** dedicated Claude Code design specialist.  
**Scope:** Sophia's production UI changes in this delivery programme.  
**Related:** [delivery protocol](DELIVERY_AND_REVIEW.md), [deployment verification](DEPLOYMENT_AND_VERIFICATION.md), [baseline](../references/BASELINE_AND_SOURCES.md).

## 1. Outcome and boundaries

Improve the application incrementally while completing real missions. The design specialist uses the current Studio, its design system and production behaviour as the starting point. Earlier images and prototypes are references for particular improvements; they are not a mandate to replace the application shell or launch another standalone prototype programme.

**UI-R01 — Preserve the requested direction.** Deliver a useful production component or workflow improvement connected to the current mission. Keep Personal/private and project/shared boundaries, one natural composer, clear voice entry, truthful resource state, exact artifact versions and understandable ongoing work. A visual refinement cannot introduce a new claim about funding, authority, audience or verification.

**UI-R02 — Scope the approval correctly.** Davide approves significant changes to Sophia's own UI delivered here. Future customer artifacts and unrelated repositories use their own authority rules; this protocol does not make Davide their approver. It also does not make all backend work wait for a design decision.

## 2. Qualify Impeccable before using it

The inspected reference is `pbakaus/impeccable@924bbd194d02e5e15a227e75b5901fb0d7a4ecad`, skill/package version 4.8.1, Apache 2.0. The upstream skill explicitly distinguishes refinement from redesign and gives application surfaces an Operate mode focused on task completion, consistency and restraint. Missing DESIGN.md alone does not imply a new design system. [I1][I2]

**UI-R03 — Pin and inspect the actual installation.** During INC-00, select the reviewed source/package and record skill version, engine version/digest where available, installation location, dependency/lock changes and installed hook commands. The documented command is `npx impeccable install --providers=claude --scope=project`; this unversioned example is not itself a complete source/engine pin. Use a verified pinned package or upstream-supported pinned-source installation and record what was installed. Do not run an unreviewed self-update as a design-task side effect. Preserve unrelated tool settings and applicable repository instructions.

Review the skill and selected playbook, then use the existing app dev/preview workflow. Useful commands for this programme are critique, audit, distill, layout, clarify, adapt, harden and polish. Init/document may capture established context; they must not restart an already answered product questionnaire or replace current decisions with generic taste rules. Upstream detectors support judgement; the accepted Sophia brief wins over generic aesthetic warnings.

**UI-R04 — Keep worker permissions intact.** The current Impeccable README documents a live-mode Apply fallback that can launch Codex/Claude with permission checks bypassed and inherited environment. This programme uses ordinary code edits and preview verification. If live mode is deliberately enabled later, use its supported `IMPECCABLE_LIVE_COPY_AGENT=chat` or `off` configuration and verify the actual startup environment; do not use that fallback. Inspect installed hooks before unattended use because hooks can run/download the engine independently of model-command approval. No production overlay injection or CSP weakening is part of this work. [I1]

This pack records the setup requirement; it does not claim that Impeccable has been installed.

## 3. Establish the incumbent design contract

**UI-R05 — Inspect the actual surface first.** Read applicable AGENTS/CONTRIBUTING rules, current components, tokens, CSS and behaviour. Record the production/development build inspected, route, viewport and relevant states. Reconcile PRODUCT.md/DESIGN.md with existing equivalents; avoid creating competing sources of truth. Do not infer “empty” or “available” from a fixture, a stale snapshot or a slow request. [S1]

For each assignment write a small surface brief:

- User task and what currently gets in the way.
- Affected component/routes and intentionally bounded change.
- Existing accepted behaviours and visual constraints.
- State transitions: normal, empty, loading, slow, refused, offline, retry, active work and narrow viewport as applicable.
- Keyboard/focus/screen-reader behaviour and interactions displaced or covered by the change.
- Connection to the mission's real backend contract and relevant acceptance IDs.

Use Studio primitives before adding replacements. Prefer a short clear action and optional detail over repeated explanatory labels. Preserve reachable microphone/leave controls when the room loses data. A layout change must not start/stop work or broaden readership. The existing Studio rules already require rendered browser verification and explicit state coverage. [S1]

## 4. Decide whether the change is significant

**UI-R06 — Judge impact, not line count.** The following require Davide's review:

| Significant change | Examples in this programme |
|---|---|
| Navigation or lens meaning/placement | Changing how Converse, Explore and Build are reached or related |
| Composer interaction or conversation hierarchy | Removing the selector; addressing, routing receipts, audience controls, history layout |
| Resource permissions or choices | Connect/manage use, sharing grants, payer/model/effort selection, expanded all-role allocation |
| Voice/call stage or its transition to work | Entry into voice, stage dominance, call/work controls, retained-content explanation |
| Main page hierarchy or important workflow | Build mission status, accepted Explore source to repository work, decision placement |
| Reused patterns or broad visual identity | Shared panels, typography, palette, spacing/tokens across surfaces |
| Product promise | Wording/state that changes what is paid, private, sent, stopped, accepted or verified |

A routine defect repair that restores the approved behaviour or style can proceed under the current approved scope. Record why it is equivalent and show the final delta to the independent reviewer. When the repair changes interaction, meaning or visual hierarchy materially, reopen the design review. Do not label a redesign “bug fix” to bypass this gate.

## 5. Build a concrete candidate before asking

**UI-R07 — Complete authorized preparation first.** The specialist implements the bounded candidate, connects it to the actual contract or clearly labelled development boundary, checks the relevant states, and makes it inspectable before requesting approval. Do not stop at a written proposal or ask Davide to approve an unbuilt intention.

The review package contains:

1. Mission, design-change ID and exact source commit/tree.
2. Working preview URL or reproducible running dev build with precise route/setup.
3. Before/after captures of the affected desktop and narrow-screen states, free of secrets and unrelated personal content.
4. Short explanation of the task improvement and changed behaviour, including significant new states.
5. Relevant keyboard/focus, error, loading, permission and active-work observations.
6. Backend/fixture limitations stated honestly; links to real qualification where available.
7. Known gaps and a concrete decision: approve this candidate or request specified revisions.

The preview is the actual implementation branch. It is not a new detached full-application prototype. “Connected,” “verified,” “remaining quota” and similar claims in development must not imply a live capability when the view is using fixtures.

## 6. Persist the hold and enforce it

**UI-R08 — Durable review record.** Persist the proposed design change in the programme's mission/decision ledger. Bind it to existing work-control/admission records where supported; do not create a competing scheduler. Initial operational enforcement must work from the first significant candidate, even while later runtime integration is being built.

The minimum record contains:

| Field | Meaning |
|---|---|
| design_change_id, mission_id, revision | Stable scope and reviewed revision |
| author_thread_id, coordinator_thread_id | Actual accountable sessions |
| candidate_commit_sha, candidate_tree_sha | Source shown to Davide |
| affected_surfaces, design_scope_digest | Reviewed components/behaviour and a reproducible scope fingerprint |
| preview_reference, evidence_references | Reviewable candidate and before/after/state checks |
| significance, significance_reason | Significant or bounded restoration, with rationale |
| state | in_progress, awaiting_design_approval, changes_requested, approved, invalidated or withdrawn |
| requested_at, decided_at, decision_actor, decision_reference | Actual human decision, not model interpretation of sentiment |
| approved_scope, conditions | What approval covers and any requested boundary |
| final_candidate_sha, equivalence_record | Release candidate and verified delta from the reviewed source |

Unknown fields remain unknown. The record is a proposed contract, not an assertion that these exact database columns already exist.

**UI-R09 — Hold affected work.** Once the concrete significant candidate is presented, persist `awaiting_design_approval`. The designer stops that work. The coordinator stops dependent UI expansion, merging the affected change and promoting it to production. Read-only review, CI and preparing the existing decision evidence may continue. Unrelated authorized backend assignments may continue independently. Do not bundle held UI into a backend PR to evade the boundary.

**UI-R10 — Only explicit Davide approval releases it.** A named approval of the presented candidate or clearly delimited scope moves the record to approved. Reviewer acceptance, automatic review, green tests, elapsed time, quota resets, thread restart and a generic enthusiastic message do not. If the decision cannot be attributed or its target is ambiguous, retain the hold and resolve the narrow ambiguity. Do not ask for a redundant approval when the existing explicit decision already covers the same candidate/scope.

**UI-R11 — Revisions are bounded.** A request for changes authorizes the specific revision work. The specialist implements it and presents the revised significant candidate, returning to awaiting_design_approval. Withdrawal abandons that candidate without claiming acceptance. The coordinator retains prior versions and decisions rather than overwriting the evidence.

**UI-R12 — Check approval lineage at release.** Approval refers to the reviewed design scope, not merely a branch name. Backend-only commits can proceed without repeating the design conversation when the coordinator and independent reviewer record that the UI scope and behaviour remain equivalent. Any material visual/interaction/product-promise change invalidates that equivalence and needs a new concrete review. Final merge/promotion records the approved design revision and the actual shipped source identity.

## 7. Technical verification and final handback

**UI-R13 — Design and technical gates remain separate.** The specialist is an author. The one independent Codex reviewer/tester validates the actual source and later the deployed experience. Design approval does not replace every-push Codex review, current-head review, ordinary checks, accessibility/browser checks or actual app verification. Those checks do not replace Davide's decision.

**UI-R14 — Respect the component boundary during repairs.** The coordinator assigns one active writer to a shared UI component. Findings that reveal a broader component defect are repaired deliberately with the existing owner; avoid unassigned restyling throughout the app. Preserve approved language and token choices unless the assignment calls for changing them.

**UI-R15 — Hand back a usable result.** Return actual changed files/commit, preview, state observations, design decision status, applicable acceptance results and unresolved limitations. The coordinator includes the approved UI lineage in release evidence. After deployment the independent thread exercises the real controls and resource/privacy/error states, not only screenshot resemblance.

## 8. Acceptance examples

These cases begin `not_run` and cover the delivery gate as well as its eventual integration. A coordinator rehearsal proves the process only; it does not prove product runtime enforcement.

| ID | Scenario | Required observation | Evidence |
|---|---|---|---|
| AC-UI-01 | Specialist prepares a significant resource/composer change | Working candidate and relevant state coverage exist before Davide is asked | Exact source, preview and review package |
| AC-UI-02 | Significant candidate is awaiting a decision | Designer/dependent UI work, merge and promotion are held; unrelated backend assignment can continue | Durable decision record and attempted transition outcomes |
| AC-UI-03 | Coordinator or designer restarts while held | Same hold and candidate recovered; no approval inferred from restart | Resumed ledger and admission/operation record |
| AC-UI-04 | Technical review/CI passes before Davide responds | Design hold remains in force | Review results plus unchanged decision state |
| AC-UI-05 | Davide approves the exact candidate | Recorded actor/reference/scope enables only covered next steps | Explicit decision and transition record |
| AC-UI-06 | Significant revision follows approval | Old approval cannot authorize the material new UI; revised candidate is presented | Delta analysis, invalidation and new request |
| AC-UI-07 | Backend-only change or bounded approved-style repair follows approval | Evidence establishes equivalence; no unnecessary design cycle; technical checks still apply | Final diff, equivalence record and reviewer disposition |
| AC-UI-08 | Impeccable is installed for the specialist | Pin/engine/hook provenance recorded, existing settings preserved, no bypass live-mode fallback used | Installation manifest and inspected configuration |
| AC-UI-09 | Approved change reaches the application | Actual shipped UI matches approved scope and works at required sizes/states | Final release identity, design lineage and in-app observations |

## Sources

- [I1 — Impeccable setup and live-mode behaviour at the inspected pin](https://github.com/pbakaus/impeccable/blob/924bbd194d02e5e15a227e75b5901fb0d7a4ecad/README.md).
- [I2 — Impeccable Claude Code skill, refinement and Operate mode](https://github.com/pbakaus/impeccable/blob/924bbd194d02e5e15a227e75b5901fb0d7a4ecad/.claude/skills/impeccable/SKILL.md).
- [S1 — Sophia Studio contribution rules](https://github.com/davidelaverga/Sophia/blob/953e5dc3d4c88e491517f3f0d0eaa18216fea98f/CONTRIBUTING.md).

[I1]: https://github.com/pbakaus/impeccable/blob/924bbd194d02e5e15a227e75b5901fb0d7a4ecad/README.md
[I2]: https://github.com/pbakaus/impeccable/blob/924bbd194d02e5e15a227e75b5901fb0d7a4ecad/.claude/skills/impeccable/SKILL.md
[S1]: https://github.com/davidelaverga/Sophia/blob/953e5dc3d4c88e491517f3f0d0eaa18216fea98f/CONTRIBUTING.md
