# Current source and decision ledger
**Snapshot: 3 October 2026. Planning instructions, not applied code.**

## Scope and precedence

The target is `davidelaverga/Sophia`, not the older `Sophia-Agent`/DeerFlow application. The installed `docs/execution/2026-10-01-unified/` v2.0 is the forward planning authority. Current code, actual contracts, accepted owner decisions and in-flight ownership remain binding. The older April/August Python/LangGraph maps supplied in project context do not describe the current implementation and are not used as code destinations here. [S01–S03]

## What changed since the preceding demo review

The previous review inspected #63 before merge at `df4b6f0068fe187bd6e9870b6e029338beafffea` and main `12d5dd2d5acba6cd92072042a25e176284ccc6a2`. This packet re-read main at `c8dd5aa975fb8f0a872e32a89d7d674a356e79f2`; #63 has merged. Later source now contains meaningful repairs. Do not ask Luis to redo them. [S01, S04–S09]

| Earlier finding | Current inspected source | Treatment now |
|---|---|---|
| Grandchildren omitted | `groups()` recursively visits items and retains otherwise unvisited items. | Preserve; regression-test deep, missing-parent and cyclic input. Live service rejects invalid dependency graphs rather than treating fallback rendering as authority. |
| Missing decision revision/expiry | `PlanDecision.revision` exists; `actionable()` checks proposed state and expiry. | Preserve; add exact work/plan/candidate bindings and durable operation keys. |
| Selecting any session with the same work ID | Named assignment lookup now precedes the work-ID compatibility fallback. | Preserve progress; live projection must carry exact assignment, attempt and generation. Do not use the compatibility fallback for live ambiguous records. |
| Every wait attributed to account owner | Open RequiredAction records can now name the actual respondent. | Preserve; generalize to product decisions, dependencies, capacity and connection waits, including multiple waits. |
| Optimistic Recorded | Shared `SessionActs.useActs()` begins at Sending. | Preserve; add explicit admission, delivery and execution-settlement receipts. |
| Task switching leaks state | Task actions are keyed by item and shared state suppresses late older acts; Ask ignores late earlier answers. | Preserve; test same-session/new-assignment reuse, reconnect and persistent operation identity. |
| Candidate trigger hides extra dependency | `relation()` now includes candidate and additional blockers. | Preserve; ensure both remain accessible on touch/keyboard. |
| Uncertain choice allows a different choice immediately | Decision only permits retrying the same choice after an unknown result. | Preserve; retry with the **same operation key**, and reconcile before a new answer. |

These are source observations, not a claim that this packet ran the application's tests.

## Remaining selected delta

1. Separate accepted plan definition from live execution observations; bind the goal and its criteria explicitly.
2. Replace the success implications of `finished | checked` and the Done lane with actual item completion policy and evidence. Add an accessible closed-work disclosure.
3. Use per-action, per-viewer availability instead of blanket executor-owner-only steering. Keep account/native approvals owner-bound.
4. Extend the shared command UI through held/stopped/uncertain outcomes. The current Stop confirmation still promises work ends “at once”; remove that promise.
5. Add exact result/check entry points and retain the last usable result during revision.
6. Keep an accepted plan visible while a replacement is proposed; new activity does not increment plan revision.
7. Replace the artificial 45 ms word reveal with actual received chunks or immediate completed text. Keep the already-added stale-answer protection.
8. Connect a source-review task through Paperclip, not a parallel custom task scheduler.

## Three resolved product choices

**Plan identity:** each first-release plan belongs to one `goal_id`; it also records `goal_revision`, `criteria_ref`, `mission_revision`, its own ID/revision and source manifest. This corrects a gap in the planning schema. The new name `sophia.work.plan.v2` avoids pretending the strict v1 accepts new fields.

**Assignment commands:** the reusable service is SCM-03, with resource qualification in SCM-02. WBC-02 implements only the minimum dsh Hold/Resume/Stop portion necessary for its own safe lifecycle. Full shared native guidance/peers remain SCM-03; capacity reasoning is SCM-05; SCM-06 consumes those capabilities.

**Ask Sophia:** a contextual task entry into the shared Sophia conversation, not another chatbot and not a prompt sent straight to the worker. WBC-01 prepares its UI port; WBC-02 leaves it unavailable. A later bounded SCM-03/04 binding supplies the thin `/work/{id}/questions` facade and actual shared response. A plain current Contribution is discussion only.

## Active work to protect

The latest PR collection still lists SMC-M03/#32 as open. It owns research/report/Knowledge development, the specialist registry and its reserved contract/migration sequence. Its current description selects a first Markdown-only release without requiring the renderer or byte store. That is a PR-reported direction, not hosted verification. Refresh #32 and issue #31 before touching its paths or reserving IDs. [S10]

WBC-02 produces a bounded **text source-review result**, not a new research engine, PDF renderer, living-brief generator or artifact-store replacement. Source text is authoritative; introduce only the small source/result accessor required by the accepted Source abstraction. Obtain an explicit integration handoff for M03-owned reader/registry changes. Do not cherry-pick an arbitrary part of its migrations.

## What this packet does not assert

No actual Paperclip integration packages are present in the inspected main package listing; its new package destinations remain proposed. The inspection found `contracts`, `domain`, `dsh-bundle`, `persistence`, `test-support` and `ui`. Branch work not visible in that listing must be refreshed before launch. [S11]

The runtime manifest pins dsh `0.2.0-rc.2` and a development model route, but contains historical readiness text. Treat the pin as source evidence and actual deployed state as an operator verification task—not a reason to replay old cutovers. [S12]

The two new missions and their tests have not been executed. No deployment or paid-call authorization is granted by these documents.


## Final source recheck

Final main recheck: `2c13747cbea08f937ca133769dab17f5d559f5c0` (PR #70). Its inspected diff adds the existing type token to the Resources/Tasks search fields, counts form-field text in the type-scale check, and updates the handoff/rules. It does not change the work, decision or action contracts inspected at `c8dd5aa975fb8f0a872e32a89d7d674a356e79f2`. Preserve this follow-up too; start from current main, not an old review branch. [S19]
