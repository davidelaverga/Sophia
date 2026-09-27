# Proposed goal-spec amendments — S1-05A alignment

**Baseline:** cumulative v0.4 Part 2 at `29a570c33feb97a6bc04ea357c84087a47c9b055`. **State:** proposed for acceptance with the next assignment. Existing A01–A03 are Luis's implemented contract amendments; the new entries below do not silently amend them.

## 1. Rule for source-of-truth changes

Keep `docs/pack/` byte-identical. Install this packet under `docs/alignment/2026-09-25/` or another explicitly recorded repository path. Add the new goal and current progress as repository-owned records; update the goal index/source/destination maps outside the frozen pack. Register reviewed JSON Patch amendments through the existing contract-generation machinery and append SQL migrations. Never edit deployed migration bytes or generated validators manually.

Before reserving a new amendment or migration number, refresh the branch and ledger. “After A03 / after 0011” describes the inspected ordering, not permission to collide with work that arrived later.

## 2. Exact old-to-new disposition

| Original goal or area | Retained | Adjustment | Evidence/closure rule |
|---|---|---|---|
| S1-01 | Exact toolchain, pinned dsh, artifact identity and composition gate | Reflect the actual new bundle/dependency identity after intentional changes; do not redo scaffolding | Existing evidence retained; new identity diff explained |
| S1-02 | Current JWT/DB/RLS/admission/snapshot/SSE/validator work | Add canonical private runtime protocol and the minimum actual job/discussion operations required by S1-05A | Production service tests are additional, not a replacement for current adversarial cases |
| S1-03 | Merged Agent bridge, journal, scoped roles, supervisor and Codex review repairs | Close actual API/dispatch/context binding; use real provider; validate transport payloads; do not run fixture service in production | Mark each original criterion separately; live acceptance remains open until demonstrated |
| S1-04 | Luis's shell, lenses, drafts, controls and room | Accept A01's earlier floor implementation; consume it in S1-05 instead of implementing another floor. Bind composer/presence to real events | Two-real-human room evidence required; simulated identities alone are not it |
| S1-04A | Links, invitations, lobby, sessions and A02/A03 | Add durable provider removal and explicit AI-audience behavior; retain decline/block semantics | Block denies new tokens immediately; pending disconnection is visible until reconciled |
| S1-05 | Gemini 3.8 Live, raw RTC, independent lifecycles, selected vision and recovery | Start with supported status/source/brief/control tools only; S1-05A provides first integrated episode | Full image/prototype criteria stay open for S1-06/S1-07 integrations |
| S1-06/S1-07 | Image generation and native UI prototypes | Plug into the real media/job/event path created here; no change to chosen provider direction | Remain their own goals |
| S1-08 | Imports, broader project memory/context and source eligibility | Reuse a minimal explicit-input context compiler from S1-05A; do not declare broader retrieval solved | Separate release cases remain |
| S1-09/S1-10 | Three contributed coding resources and live peer collaboration | Development-time Claude/Codex operator handoff is temporary tooling, not product implementation | Do not claim these goals complete from a successful manual handoff |
| S1-11 | Technical lead, periodic/manual review and replanning | Brief drafting does not constitute the complete PM or scheduler | Continue original goal after work path functions |
| S1-12 | Full preview co-review and review-to-steer | Reuse selected observation/source/authority semantics from this goal | No mechanically exact artifact-edit claim in S1-05A |
| S1-13 | v0.4 web/PDF and web/deck renderer direction | Do not restore older Python-renderer assumptions from pre-v0.4 notes | Independent renderer acceptance |
| S1-14 | Complete founder episode and relevant recovery/ownership checks | Early deployment is retained as evidence, not full release completion | Test integrated capabilities as they land |

## 3. New amendments to author

**Runtime service binding:** declare `/v1/runtime/*` separately from member APIs; bound machine principal, canonical command/receipt/observation/ready types, cursor translation, transport validation and runtime-unit compatibility. Changes belong in the existing schema-generation path and source map.

**Room/exchange participation:** separate member role, media publication, read-only AI interaction and work authority. Viewer human speech is allowed; work control still requires editor/admin/current grant. Guest project context remains forbidden.

**AI-audience transition:** project-aware output is quiesced before guest admission; active guest room means human-only operation until explicit member-only resume. Room presence and project audience revisions must not be conflated.

**Access settlement:** denial/block and actual LiveKit disconnection have separate states, a durable pending operation and reconciliation. Failed media removal cannot be returned as complete disconnection.

**Presence projection:** room connected, AI available, admitted listening, responding, playback and work are distinct. Production light follows observed state; demo controls remain development-only.

**Bounded native task:** explicit `draft_brief` admission via existing goal/attempt/job records; immutable input references, idempotency, actual output and current control authority. It is not a hidden arbitrary-shell endpoint or the complete planning system.

These amendments must be reviewed with Luis. The plan resolves the desired behavior; the implementing agent validates exact schema names and reuses existing fields before adding redundant records.

## 4. Named follow-ups, not next-goal blockers

A membership-scoped cross-device project-list endpoint; more complete onboarding; reusable guest-safe AI context; richer cooperation cards; automated peer wake-up infrastructure; broader route/model/skill optimization; exact component-preserving edits and full scenario testing. Keep these in the release graph, not in a new unbounded cleanup task.

## 5. Acceptance-status update

Create/update a repository progress record with separate fields for implemented source, tests, hosted evidence and human acceptance. Do not modify frozen `planning.json` to pretend the imported archive always knew the current state. Record the source pin and evidence that caused each status transition.

This packet itself creates no source changes, reviews, merges, deployments, migrations or approved operator grants.
