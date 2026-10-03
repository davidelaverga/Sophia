# Luis, keep the board. We are making its promises real.

The goal rail, dependency threads, next checkpoint and task sheet are the direction to keep. This is **not a redesign request**. The next work separates two things: finishing what the interface means, then connecting it to real managed work.

**Mission 1:** one follow-up UI PR. **Mission 2:** one real Paperclip-managed source review through our existing dsh backend. The broader three-resource team, smart allocation and application co-review follow on their existing missions.

## First, the source moved forward

PR #63 has merged. The latest source inspected for this packet is **`c8dd5aa…`**, which also contains later follow-ups and the work type-scale consolidation. We are not asking you to fix the old snapshot again. A final recheck also found merged PR #70 at `2c13747…`, which puts the search fields on that same type scale. Preserve it; the inspected semantic changes below are unaffected.

The source now includes recursive task rows, decision revision and expiry handling, better assignment lookup, actual request-based waiting owners, Sending before Recorded, shared session-action state, task-keyed actions and protection against an older Ask answer arriving late. **Keep those improvements and their tests.**

The remaining work is the meaning and binding around them: completion evidence, exact live assignments, shared work rights, command settlement, real results and one conversation behind Ask.

## What stays

Keep the **one-goal-at-a-time rail**, the compact board and sheets, **NEXT**, the on-demand threads of light, keyboard navigation, restrained motion and the side-by-side relationship with the room. The board remains a way to understand the work, not another administrative product users must manage.

Keep the fresh typography and the account/model settings that clearly apply to the **next run**. Keep the small Claude greeting too: local, occasional and silent, with reduced motion respected. It should not make a model call or pretend two agents exchanged a message.

## Your three questions — settled

### 1. Does a plan name its goal or only the mission revision?

**Both. `goal_id` is correct.** Keep the mission revision and add the goal/criteria revision the plan serves. Also retain the plan's own ID/revision and its source references.

Think of them this way: the **goal** identifies the outcome, the **criteria** define success, the **mission revision** identifies the accepted wider direction, and the **plan revision** identifies this route toward the goal.

We are also separating the **plan definition** from the **live board view**. A new session report changes the live view; it does not create another accepted plan revision. When the lead proposes a replan, the current accepted plan stays visible until the replacement is accepted.

This was a genuine gap in our planning schema. It is not something the frontend should have to guess.

### 2. Are per-assignment commands in SCM-06?

**Their reusable implementation is SCM-03.** SCM-02 supplies connected resources and their verified controls. SCM-04 handles project-level planning decisions. SCM-05 adds capacity warnings and safe handover. SCM-06 uses those capabilities during candidate review.

The first backend mission adds only the dsh Hold/Resume/Stop subset needed to control its one real task. It does not claim all native engineers can already do the same.

One product correction: **work authority is not account ownership**. When Davide contributes a Codex session to the project, an authorized builder such as you can guide the assigned project work within his contribution mandate. That does not let you answer his native credential request, change his personal reserve or use unrelated sessions.

The backend returns each action's availability and reason. The task sheet renders that decision instead of making every control owner-only. Account-management controls in Resources keep their appropriate owner restrictions.

### 3. Should Ask Sophia use the room chat or its own route?

**One shared Sophia conversation, with a contextual task entry point.** A thin `/work/{id}/questions` route is the selected facade. It is not a second chatbot and does not send the user's question directly to the coding worker.

Keep the task sheet open. Attach the exact work, plan and result context. One question and one answer can appear in the sheet and link to the same shared conversation entry; we do not generate the answer twice.

The current ordinary Contribution endpoint is discussion-only. A guessed `ask_sophia` field would not implement invocation. We will bind the proper use case later. For now, Mission 1 prepares the port and truthful states, and Mission 2 leaves live Ask unavailable.

Asking a question never silently enables the microphone, takes the floor, approves a decision or steers work. When the shared conversation cannot receive it, keep the draft and provide the explicit current text-chat entry.

## The remaining UI changes

### Make the lane headings match the real work

Keep four columns, with these meanings:

| Lane | What it tells the person |
|---|---|
| **Active** | Work is underway, waiting, held, under review or needs changes. Its chip explains which. |
| **Up next** | It has not started. Show the actual conditions needed to begin. |
| **Unassigned** | No execution owner is assigned. A missing connection alone does not mean unassigned. |
| **Complete** | This item's declared completion requirements have been satisfied. |

A generated candidate awaiting a required review stays **Active — Ready for review**. A review can be Complete and say the implementation needs changes. That does not move the implementation to Complete.

Stopped, cancelled and failed work goes into a visible **Closed work** disclosure with its reason—not a success lane and not nowhere. A repaired item can remain Active with the required correction.

We are not adding four new backend lifecycle states. These are compact presentation categories over the operational evidence.

### Put the actual result beside the controls

When the task has a real result, put **Open result** or the supported **Review candidate** action in the sheet. It opens the exact source/version and relevant checks. No invented URL, no placeholder pretending to be a result.

When a revision fails, keep the previous usable result available and mark it correctly. This is what brings people back from managing the work to evaluating and improving it.

The first native source reviewer should read **Sophia · Source reviewer**. It does not need a fake Claude account or a made-up subscription balance to fit the tiles.

### “For you” means you are actually needed

A worker on your Claude account may wait for Davide's product decision, your native permission, another worker's result or a reset. Those are different respondents and conditions.

Keep the request-based improvement already in source and extend it to typed pending decisions and waits. The backend supplies the actual responsible person. Add a small cross-goal attention link without changing the viewer's current goal automatically.

### Separate a request from its effect

You have already improved Sending and the delivery language. Keep that. The next step is to show the real effect after delivery:

| Moment | Suggested wording |
|---|---|
| Sending before a receipt | “Sending…” |
| Stop admitted but not settled | “Stop requested; waiting for the runtime to confirm.” |
| Runtime settlement is uncertain | “The stop was requested. Its runtime state is not confirmed yet.” |
| Verified stop | “Stopped. Completed work is kept.” |
| Human choice committed | “Your choice is recorded. The plan is updating.” |

Replace **“Ends its session's work at once.”** The request may need time to settle. Delivery is not proof that the process stopped, and it is not proof that guidance appeared correctly in the candidate.

The human's choice counts when the service commits it. The lead updates the plan afterward; it does not ratify whether the human decided.

Preserve operation identity through retries, navigation and reconnect. A new assignment reusing the same session must not inherit the previous task's draft or unresolved receipt. Unknown delivery keeps the original request key; it does not become a new submission.

### Keep freshness useful, and remove artificial waiting

The ring means **age of the last report**, not percentage complete or proof that a worker is stuck. Keep its readable timestamp and separate connection status. A long-running tool can be healthy without sending a new report every few seconds.

Ask's current full-answer Promise is followed by a timed word reveal. For the real path, show received chunks as they arrive, or show a completed answer immediately. Do not add a typing delay and call it streaming. Keep the stale-answer guard already added.

While you were away should favor meaningful results, blockers and decisions over log chatter. Keep the first seen-state behavior browser-local and say so. Opening or marking a card seen changes no work permission or decision.

## Mission 1 — one focused follow-up PR

**Suggested branch:** `lfe-07/workboard-readiness`.

This PR finishes the current Tasks slice, not all of LFE-07 or all your frontend work. Start from current main, preserve your recent fixes, and work through these five sessions:

1. Separate versioned plans from their current live view, with exact goal/assignment identity.
2. Correct lane/completion behavior, retain closed work and add the result port.
3. Render real respondent and per-action capability inputs, including shared builders and native Sophia work.
4. Complete request/receipt/settlement behavior without discarding your shared SessionActs implementation.
5. Prepare contextual Ask and verify phone, keyboard, active-call controls, attention and reduced motion.

Use the proposed schema and labeled fixtures. Do not register missing endpoints as live, modify a database, deploy production or load fixtures into the live data path. Davide/backend approves the shared contract before either lane diverges.

The acceptance walkthrough must include a rejected review, a stale decision, a delayed Stop, task navigation during a pending action and an unavailable service—not only the polished happy path.

## Mission 2 — the first real crossing

**Suggested branch:** `scm-01/workboard-source-review`.

The person chooses 1–3 eligible project sources and a goal. They review a small fixed source-review plan and its allowance. Their acceptance admits exactly one work item. Paperclip schedules it; our existing dsh bridge runs a bounded read-only reviewer. The result is retained as text/Markdown and opens from your task sheet.

The task must survive a lost reply or observer restart without a second execution. Hold/Resume/Stop and source withdrawal must remain real. The last result and truthful state survive refresh and reconnect.

This starts operational integration; it is not yet an autonomous technical lead making the full roadmap. It does not need a PDF renderer, a new artifact store or another voice runtime.

**Responsibilities are distinct:** Sophia owns purpose, human decisions, source sharing and effect permission. Paperclip owns admitted operational work. dsh performs the reasoning and tools. Your board shows their joined evidence. Omnigent returns in the next owner-native resource integration; it is not required for the first dsh review.

## What becomes live when?

| Capability | Mission 1 | Mission 2 | Retained next work |
|---|---|---|---|
| Plan/board/read semantics | Validated fixtures | Real source-review plan and task | General technical-lead planning |
| Open result | Exact source port/fixture | Real retained review text | Full app/prototype review |
| Human decision | Correct UI/receipt behavior | Exact plan admission | Broader reserved project decisions |
| Task controls | Correct capability and settlement behavior | Qualified dsh Hold/Resume/Stop | Owner-native guidance and peers |
| Ask Sophia | Contextual port and honest unavailable state | Still unavailable | Shared conversation binding |
| Account capacity | Preserve existing truthful display | No fake native account | Real collectors, warning and handover |
| Production | Unchanged | Separately approved pilot | Expanded qualified rollout |

## Who does what next?

**You own Mission 1 and the agreed Studio wiring in Mission 2.** Davide owns product/runtime/authority decisions and the backend contract. Claude Code implements the selected branch. Codex reviews independently and performs only the production/schema/provisioning/provider operations that Davide authorizes separately.

We use one shared coordination issue per mission, separate worktrees and one writer for shared files. We do not communicate by controlling one another's desktops. M03's research/report work stays on its existing history until there is an explicit handoff.

The goal is not another round of redesign. It is **one real plan, one useful result and controls people can trust—inside the UI you have already built.**
