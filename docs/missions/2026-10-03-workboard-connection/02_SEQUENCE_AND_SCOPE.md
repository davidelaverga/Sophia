# Sequence, aliases and scope

## One follow-up PR first

**WBC-01 is a new follow-up to merged #63.** Suggested branch: `lfe-07/workboard-readiness`. Suggested title: **LFE-07: make Tasks ready for real work state**.

Keep the rail, board, sheet, dependency lighting, current type scale, keyboard behavior, reduced-motion behavior and local icon greeting. Finish the selected semantics and fixture-facing contract in the same PR. Do not bundle a visual redesign, backend installation or all LFE-07 capacity/handover functionality.

## One first integration PR second

**WBC-02 is the first Paperclip/dsh crossing.** Suggested branch: `scm-01/workboard-source-review`. Suggested title: **SCM-01: one managed source review in Tasks**.

Its ordered commits are: pin/auth/binding; commission and idempotent core mapping; dsh review/result; read projection and Studio wiring; control/recovery; evidence and release instructions. These are checkpoints inside one focused integration PR, not six open-ended infrastructure missions.

Mission 2 can prepare its private service and adapter while Luis works. Its live/read-model integration uses the merged Mission 1 contract. One nominated backend owner approves shared contract semantics before either lane diverges.

## What each mission closes

| Existing reference | WBC-01 | WBC-02 | Remains afterward |
|---|---|---|---|
| LFE-07.1 | Board/read-model readiness on fixtures | One real plan/item projection | Full multi-resource plan lifecycle |
| LFE-06.4 / shared session acts | Common display semantics; scoped availability input | dsh task Hold/Resume/Stop only | Owner-native requests and controls |
| SCM-00 | Baseline documentation | Exact service/runtime binding | No replay of historical releases |
| SCM-01 | Prepared view and schemas | One source review, result, restart and Stop | Wider route qualification |
| SCM-03 | Shared-authority fixtures and question port | Only native dsh safety subset | Three-resource peers, active guidance, contextual Ask |
| SCM-04-G2 | Goal-linked plan definition | One deterministic source-review plan template | Generative roadmap/team selection |
| SCM-04-G3/G4/G5 | Honest placeholders/fixtures | Review result is not implementation acceptance | Lead review, material decisions, independent review arrangements and replans |
| SCM-05 / LFE-07.3–4 | Preserve current resource info; disabled future action | No allocation optimizer | Exact-amendment warning, Confirm steer / reassign, safe handover |
| SCM-06 / LFE-08 | Open result port and candidate identity | Open real review text | Full application co-review and change/preserve loop |
| SCM-07/08 | No additional scope | No additional scope | Standing mandates and evaluated learning |

## Next integrations after these two missions

1. SCM-02/03: connect the three owner-native resources and bind active peer/guidance delivery, genuine owner requests and task controls.
2. SCM-04: bind contextual Ask into the shared conversation, Review work progress, a small real lead plan, candidate-triggered independent review and one evidence-based replan.
3. SCM-05/06: add capacity-aware amendments/handover and review the actual application with preserved source.

This order is a delivery map, not permission to stop creative/research work. M03 and Luis's image/prototype track continue within their agreed file ownership.

## Ownership and operations

Luis owns the first PR and the agreed Studio portions of the second. Davide owns backend/product/runtime decisions. Claude Code implements the selected branch. Codex reviews independently and performs only separately authorized hosted operations. No two sessions edit the same checkout; use separate worktrees and a shared coordination issue. [Protocol](operations/CLAUDE_CODEX_PROTOCOL.md).
