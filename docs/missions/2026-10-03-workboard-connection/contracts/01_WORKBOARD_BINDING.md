# Shared binding contract — WBC-01 and WBC-02
**Design decision for these missions. Not an existing production API.**

## 1. Two objects, not a mutable plan full of logs

**WorkPlanDefinition v2** is the revisioned plan decision. It retains `plan_id`, `project_id`, `revision`, `mission_revision`, source manifest, acceptance decision and the original item's source/deliverable/criteria/recipe/review references. It adds explicit `goal_id`, `goal_revision` and goal `criteria_ref`. Each initial plan belongs to one goal. Cross-goal dependencies must be explicit; membership is never inferred from list placement.

**WorkBoardView v1** is the current viewer-authorized read projection. It joins accepted/proposed plan definitions to current assignment, waiting, source-result, review and permitted-action facts. A current/proposed plan can exist without any running session. A report-age tick or queue transition changes the view, not plan revision. A later next-checkpoint selection can be derived from the accepted plan without rewriting it.

The current strict v1 planning specimen rejects unknown fields. Do not send v2 additions under that v1 marker. WBC-01 keeps a documented conversion for old fixtures; WBC-02 creates a reviewed current OpenAPI amendment and generators for the real shape. The frozen planning pack remains unchanged.

## 2. Identity rules

| Identity | Meaning |
|---|---|
| Project ID | Authenticated sharing/record scope. |
| Goal ID + goal revision + criteria reference | Outcome and exact definition of success. |
| Mission revision | Accepted higher-level direction used for planning. |
| Plan ID + plan revision | Which planning decision a person is reading/accepting. |
| Plan item `id` / Sophia work ID | Stable obligation; in this binding they are the **same identity**, not parallel task IDs. |
| Assignment ID + generation | Current admitted responsibility and control generation. |
| Attempt ID / native session | Particular execution; changing attempt does not reset the goal/allowance. |
| Source/result version + hash | Exact bytes or source content being inspected. |
| Decision ID + revision | Exact question/choices/target accepted by a person. |
| Operation ID / idempotency key | The user's one submission, reused through uncertain delivery. |
| Project event cursor | Snapshot/replay boundary, not wall-clock order. |

The live projection must not fall back to the first session with a matching work ID. Missing/ambiguous identity means unknown and unavailable mutation. A native Sophia reviewer has no fictional personal subscription owner. Human assignees and owner-native assignees remain distinct.

## 3. Proposed view shape

See the executable [schema](work-board.schema.json) and [example](../examples/board-review-ready.json). It is intentionally a bounded read contract rather than a full copy of provider or Paperclip records.

```text
WorkBoardView
  project_id, snapshot_cursor, observed_at, coverage
  goals[]
    goal_id
    current_plan: WorkPlanDefinition | null
    proposed_plans[]
    next_checkpoint: {label, item_id} | null
    items[]
      work_id, lifecycle
      assignment: exact binding | null
      waiting_on[]: typed reason + actual respondent + reference
      activity: sanitized observation | null
      candidates[]: exact source/version/hash
      review: candidate-bound status + references
      completion: policy + satisfied/not_evaluated/not_satisfied + evidence
      available_actions[]: action + allowed/denied/unavailable + reason/boundary
    decisions[]: revision/target bound question and its recorded choice
```

`coverage=unavailable` is not proof the goal has no work. Preserve the last validated display while plainly marking staleness; remove it when access is revoked. `coverage=partial` names missing evidence through the bound status/notice, not a guessed complete view. This packet's schema models the minimum structure; the live amendment must include any existing required disclosure, pagination and access metadata.

## 4. Lane mapping — a pure display rule

Apply in this order:

1. A terminal unsuccessful disposition (`stopped`, `cancelled`, `failed`, `superseded`) goes to **Closed work** with a reason. A repair obligation is a separate retained live state, not a false success.
2. `complete` goes to **Complete only when its declared completion policy is satisfied with evidence**. Otherwise mark a projection inconsistency and do not display success.
3. Running, waiting, held, ready-for-review or changes-required work goes to **Active**, with exact chip/reason. Assigned work whose observations are unavailable stays visibly assigned/unknown; do not move it to Unassigned.
4. Genuinely unassigned planned work goes to **Unassigned**, with any unmet prerequisites.
5. Remaining not-started/queued planned work goes to **Up next**, with all start conditions.

For the bounded first result, a source-review task can complete after a valid review deliverable is stored under its declared policy, even when the review's findings are adverse. That completes the **review**, not the implementation it discusses. A feature requiring review remains Active while its candidate awaits that review.

A candidate-ready review trigger can coexist with other blockers. Parent nesting groups work; it is not an implicit blocker. Complete does not mean production deployed.

## 5. Per-action availability

The live service computes availability using the current project membership, resource contribution, work/assignment generation, route capability and current control state. The UI only renders it. The product policy is:

- Scoped builders can guide shared assignments within the contribution mandate, regardless of room guide or account ownership.
- Read-only viewers can inspect and ask within their readable scope, not retask.
- Native credential/permission answers, protected reserves and account changes remain owner-bound.
- Native Sophia workers use the applicable project mandate; no fictional resource owner is required.
- No contract field grants authority merely because the client sends it back.

`resource.controls` describes technical support; it is not user permission. `available_actions` may be allowed, denied or unavailable with a user-safe reason. Missing configuration or unknown native settlement is not an invitation to guess.

Task Stop suppresses future continuation and requests the actual execution stop. Resource disconnect, room leave and Stop speaking are different operations. A stale content revision should not trap the emergency control path behind a new LLM review. A stale assignment must not silently retarget another scope; the current goal/work Stop path remains explicit and usable.

## 6. Receipt dimensions

[Receipt schema](work-receipt.schema.json) separates:

**Admission:** whether the operation committed, was definitely rejected, or is unknown.

**Delivery:** not sent, queued, transport delivered, native consumed where observable, or unknown.

**Effect:** pending, held/stopped/resumed confirmed, human choice recorded, not applicable, or unknown.

Sending is a local state before a server receipt exists. A server receipt never fabricates Sending as durable acceptance. A lost response does not erase a previously established Recorded fact; it may make delivery/effect uncertain. Show the strongest supported facts without reducing them to one optimistic success bar.

| Situation | Copy |
|---|---|
| Before committed admission | Sending… |
| Guidance durably recorded | Guidance recorded; delivery pending. |
| Guidance delivered | Delivered to the session; not yet verified in the result. |
| Stop accepted/delivered | Stop requested; waiting for the runtime to confirm. |
| Actual settlement unknown | Stop requested. The runtime's state is not confirmed yet. |
| Stop settled | Stopped. Completed work is kept. |
| Hold settled | Held. Work and remaining allowance are retained. |
| Human choice committed | Your choice is recorded. The plan is updating. |
| Definite stale decision refusal | This decision changed. Nothing was chosen; review the current choices. |
| Choice outcome unknown | Checking whether your choice was recorded. Do not choose again yet. |

Durable receipt events carry the same operation ID and exact target. Repeated requests reuse the same idempotency key and request digest. A changed payload under the same key is a conflict. Keep all unresolved commands; a latest-command summary must not discard a previous unknown Stop.

## 7. Ask Sophia — one conversation, contextual entry

Selected future route: `POST /api/v1/projects/{projectId}/work/{workId}/questions`. It is a Sophia facade, not a Paperclip route and not implemented by WBC-01/02.

The request contains the question, operation identity and viewed plan/candidate references. The host resolves current readable context; it does not trust a client-authored task summary. One attributed conversation entry and one answer identity are shared between task sheet and room chat. Response chunks are actual received chunks; a completed answer is shown immediately, not replayed at an artificial typing speed.

Preserve the active exchange's input/floor/guest and privacy rules. Ask does not enable a microphone, force a floor takeover or create a second persona. When the conversation is unavailable, retain the draft and offer the explicit current text-chat entry; do not silently fall back to a separate paid model. A question can produce a proposal, but not an implicit work amendment.

The current `Contribution` path is discussion-only. An `intent: ask_sophia` property is not a substitute for implementing the new invocation use case. WBC-01 prepares callback/event types; a later SCM-03/04 integration implements the route. WBC-02 displays unavailable for it.

## 8. Event and attention behavior

Use the existing authenticated project stream. New semantic types may include `plan.revised`, `decision.resolved`, `assignment.changed`, `session.activity`, `work.result_ready`, and command observations. Bind every type through the actual current event amendment, not an unvalidated client event string.

Snapshot and stream share a cursor; gaps force resynchronization. Duplicates and old assignment generations cannot regress current state. Activity messages are sanitized/size-bound and coalesced; typed decision/control/result records are retained. No model call or full-project refetch for every activity tick. The backend and native collector distinguish reported time from observed time; the UI age indicator describes the observation actually available.

Mark seen is viewer attention only. Its first version is local to the browser, keyed by project/viewer/goal/plan and a seen event boundary. It does not accept a plan, dismiss another person's pending action or advance a task. No raw private text is persisted in a shared attention cache.

## 9. WBC-02 live subset and future-ready fields

Mission 2 implements one deterministic proposed/accepted review plan, real task observation, result, decision answer and dsh Hold/Resume/Stop. This is enough to exercise the shared view and receipt model.

Peer guidance, external native permissions, Ask Sophia, generative lead review, capacity reallocation and full application co-review remain unavailable. Future-ready fields must be empty/unknown or unavailable—not filled with fixtures in production.

The specs do not equate schema validation with authorization, referential integrity or correct state transitions. WBC-02 must test those relationships against real databases and runtime boundaries.
