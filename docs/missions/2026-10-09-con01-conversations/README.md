# CON-01 — Saved project conversations
## Parallel mission · Claude Code implements · Codex reviews and operates

**Edition:** v0.1 · 9 October 2026  
**Product:** Sophia · `davidelaverga/Sophia`  
**Plan parent:** Unified Continuation v3.0, CON-01  
**Status:** executable mission specification; not installed, implemented, deployed, or product-accepted by this pack's authoring. No live operation or spending is authorized by the archive alone.

> A team can open two named conversations inside one project, contribute independently, ask Sophia for a real answer, and return later to the right discussion with current project context. No new agent manager, computer, or Paperclip issue is required just because someone starts a conversation.

## Assignment

| Responsibility | Owner |
|---|---|
| Product, architecture, retention decision, operation approval | Davide |
| Primary source implementation, including required API/runtime and existing Studio wiring | Davide's Claude Code |
| Continuous independent review, release preparation, authorized deployment, actual app verification | Davide's Codex |
| Existing Studio visual/interaction design and shared frontend coordination | Luis; do not redesign his conversation experience |

**This is the parallel conversation mission, not the next Paperclip/external-coding mission.** CTX-01 (task-specific “Ask Sophia”) follows separately. The existing conversation-level Ask Sophia and its three quick questions are in scope.

## Start here

1. Read [the mission](01_MISSION.md) and [current evidence/bindings](02_BASELINE_AND_BINDINGS.md).
2. Start **Codex now** using [its exact launch](launch/CODEX.md), not only when a PR is ready. Start Claude Code using [its exact launch](launch/CLAUDE_CODE.md). They may both inspect immediately; one implementer owns feature source.
3. Complete G0's binding and privacy review before freezing a migration or runtime integration. [Contract](03_CONTRACT_AND_RETENTION.md), [runtime behavior](04_RUNTIME_AND_CONTEXT.md), and [parallel ownership](05_COORDINATION_AND_OWNERSHIP.md) are required.
4. Work through [the slices](06_IMPLEMENTATION_AND_REVIEW_GATES.md). Use [acceptance](07_ACCEPTANCE_AND_EVIDENCE.md) and [operations/app test](08_OPERATIONS_AND_APP_TEST.md) from the outset.
5. Update the actual mission coordination record and handoff on every material boundary. [Templates](templates/README.md) provide the payloads; they do not create a scheduler or guarantee automatic notifications.

A convenient offline [reader](READER.html) is included. The Markdown files are the editable mission specification. [Sources](09_SOURCE_REGISTER.md) distinguish inspected code, retained plan, and proposed mission decisions. Original v3 CON-01 and its architecture excerpt are included byte-for-byte as `.original.txt` evidence under `references/`; their relative links describe the parent pack, not a second installation target.

## Release shape

Target **one focused feature PR**, with reviewable commits and staged evidence, not several independent rewrites. A separate deployment/evidence change may be needed under repository practice. If a shared-core change cannot safely fit, record the exact split and ownership before creating another branch; do not expand into a general chat platform.

Source work may begin in parallel with design and WBC-02. Runtime, schema, and shared Studio integration still have one writer at a time. Shipping this mission does not certify those other missions.

## First real proof

Two members, two conversations, a current accepted project constraint, an unrelated conversation-local detail, an actual dsh answer, a lost write reply, a return after restart, and one withdrawal. The real app—not a fixture page—must preserve the expected records, target, privacy and result.
