# INC-05 — Voice continuity and founder release

**Outcome:** Davide and Luis can use the delivered connections, Explore path, natural composer, repository mission, and resource controls in Sophia. Voice can retrieve permitted work evidence, ask the existing project manager a bounded question when permitted, and deliver an authorized follow-up. A mission completes at a verified application release.

**Delivery owner:** Codex coordinator. **Implementers:** Claude Code workers; Claude Code design specialist for significant voice-stage/UI changes. **Verification:** one independent Codex thread, first as source reviewer and then as deployment/in-app tester. Automatic Codex review remains required after every PR push.

**Normative dependencies:** [domain/authority](../contracts/01_DOMAIN_AUTHORITY_AND_FUNDING.md), [runner protocol](../contracts/02_RUNNER_AND_SESSION_PROTOCOL.md), [intake/events](../contracts/03_INTAKE_ALLOCATION_AND_EVENTS.md), [design approval](../operations/DESIGN_APPROVAL.md), [deployment and verification](../operations/DEPLOYMENT_AND_VERIFICATION.md).

## 1. Entry criteria and scope

The typed work reader, project-manager inquiry/follow-up operations, and exact mission identities from INC-02/03 must work before voice is allowed to invoke them. INC-04 supplies current resource selection and policy. A microphone widget is not proof that the native session path is ready.

Qualify the actual deployed voice path and its tool/admission boundary. The roadmap's operational record identified a voice-test-harness mapping gap, not proof that ordinary voice was universally unavailable. Resolve that specific mapping for this mission. Do not resurrect a historical Python/LangGraph harness or hold earlier native/API releases behind unrelated voice tests.

This mission implements source-grounded voice continuity, bounded work narration, and the two-founder release. It does not introduce a new voice model platform, broad relational-state classifier, camera/screensharing implementation, native-session migration, or whole-application redesign. Existing supported media can remain available; unimplemented capabilities cannot be represented by working-looking controls.

## 2. Requirements

### INC05-R01 — Qualify the actual runtime boundary

Record the deployed voice route/version, session/connection identity, authenticated actor mapping, allowed tools, selected payer, available input/output observations, and reconnect behavior. Where a fallback voice path exists, identify it separately and test only the capabilities this release promises on that path.

The voice runtime receives narrow Sophia operations, not an environment-wide T3 credential or native provider token. The same server admission, source authorization, resource policy, and controls apply to typed and voice requests. An Explore API preference does not silently change the voice provider or its payer.

### INC05-R02 — Commit each spoken request once

Bind a submitted spoken request to one authoritative input identity, actor, project/conversation, audience, voice session, and connection epoch. Partial captions and revised recognition text must not each create actions. If the runtime can issue a tool request before final transcript text, correlate it to the same submitted utterance and operation identity.

Deduplicate retries by that identity, not by matching text: a user may legitimately say the same words twice. Reconnect and repeated tool delivery return or reconcile the earlier receipt. The model does not choose an authenticated actor by guessing a speaker's name or voice. If the actual room path cannot establish sufficient authority for a consequential request, retain it for the authenticated user to resolve through the existing app controls.

### INC05-R03 — Build a bounded, authorized work digest

Read a current projection containing mission goal, phase, manager/assignment state, accepted evidence, pending decisions, recent relevant follow-ups, current exact artifact/release references, and observation time. Select only work the requester can access; do not dump native histories or unrelated project records into voice context.

Keep live-call participants distinct from the audience entitled to read retained content. Both the requested source and the intended response channel must permit disclosure. Credentials, unrelated private threads, hidden reasoning, and raw private account records never become narration material.

### INC05-R04 — Use the shared operation families

Voice invokes the existing `work_read`, `manager_inquiry`, and `manager_followup` families, plus the separately authorized ordinary answer/Explore/Build/control paths when qualified. These are internal action families, not a promise of newly named public HTTP endpoints.

Start an inquiry with retained evidence. If it answers the question, respond with its freshness and basis. Distinguish an observed state, a project-manager statement, and independently verified release evidence. A manager saying “finished” cannot be voiced as “deployed and tested” without those records.

### INC05-R05 — Ask the manager only when a fresh inquiry is allowed

When the retained context cannot answer a material question, submit one bounded question to the existing project manager if the current mission/control/design state, resource grant, tools, and allowance permit a fresh turn. Preserve the original requester, audience, question ID, exact work target, and return channel.

Qualify the inquiry's permitted effect at the runner boundary; a prompt saying “only answer” cannot grant extra repository-write authority. The inquiry is informational and must not create new implementation effects. Existing independently admitted work can continue within its own authority. Where the native route cannot enforce this distinction, use retained evidence or keep the question waiting until an appropriate inquiry route is qualified. Do not create a competing manager to obtain an answer.

Held or stopped work allows authorized retained-evidence reads but no new native inquiry turn or implicit resume. If evidence is insufficient, say that the question is waiting. An exhausted resource likewise cannot trigger a silent cross-payer query.

### INC05-R06 — Send guidance to the project manager

An authorized follow-up uses INC-03 interpretation and the existing manager's explicit queue operation. Voice does not steer implementation workers directly, issue a replacement plan as a second coordinator, or turn ordinary discussion into implementation without the required intent/target.

The original input and dispatch survive call termination. Show or speak only the receipt stage supported by evidence. Queued guidance is not applied code. Revisions requiring a significant Sophia UI decision remain subject to Davide's approval; a spoken preference can become the proposed change but cannot erase the delivery hold.

### INC05-R07 — Recheck audience when answers arrive

Correlate delayed results to the originating request and retained conversation. Before publishing or speaking, recheck current source access, membership, audience, live-call participants, and the active session/context. Never deliver into whichever room happens to be open when a background result arrives.

If the original audience is still authorized, retain the answer there. Speak it only when the current voice context and all listeners are permitted recipients and the answer remains relevant. Otherwise use a permitted silent indication or leave it in the original thread; do not disclose private content while explaining why it was withheld. New participants do not retroactively acquire access to a private inquiry.

### INC05-R08 — Keep call and mission controls separate

Barge-in stops Sophia's current speech response. Mute affects microphone input. Leaving the call ends that voice session. None of these events stops a build. A clear authorized “Stop this build” targets the known mission through the normal control path and fences new effects while native settlement is pending.

Show the actual control state: a recorded Stop request is not a confirmed stopped process. A browser close, network drop, reconnect, or voice-provider failure cannot reset mission authority, spending, or work identity. Returning to Sophia restores the durable status and available controls.

### INC05-R09 — Use one narration decision path

All background work narration enters one arbiter/projection with source event IDs, audience, expiry, relevance, and a deduplication key. Worker output, native completion, a voice tool result, and a UI update for the same event cannot each produce their own unsolicited spoken announcement.

Routine progress stays visual. A slow operation may have one useful acknowledgment; a decision, blocker, meaningful finding, or verified completion may justify a short spoken update. User speech preempts narration. Old updates expire or collapse into the latest meaningful state; do not read an accumulated event backlog aloud after reconnect.

Record planned/observed speech only to the extent the deployed path exposes it. A model-authored text artifact is not proof audio was heard. When playback acknowledgment is uncertain, do not blindly replay an announcement; retain the UI result and respond if asked. This avoids claiming impossible exactly-once acoustic delivery.

### INC05-R10 — Make retention truthful

Apply existing approved transcript/audio retention policy and disclose the actual behavior in the relevant call controls. Do not say “nothing is recorded” if a transcript, request, summary, or work receipt is retained. Distinguish raw audio storage from retained conversational/work records.

Use only the observations needed for qualification and debugging, with their existing access and retention controls. This mission does not introduce unrestricted audio collection or place sensitive call content into shared test evidence.

### INC05-R11 — Give an active call a clear place in the room

The production implementation should make starting and addressing Sophia obvious. In the affected room surface, an active call has a recognizable central stage: Sophia's presence, listening/speaking/connecting/error state, accessible microphone controls, stop-speech/leave actions, and the selected work context when useful. Keep detailed work and resources expandable.

Use the incumbent layout and design system; implement a bounded improvement instead of replacing the entire application. The voice indicator describes voice state only, not whether a repository agent is working. If camera or screen sharing is not supported by the current qualified media path, do not show a false active control or claim those capabilities shipped.

The specialist must implement loading, reconnect, denied microphone, muted, speaking, waiting-answer, and narrow-layout states that this path actually supports. Significant stage/navigation changes stop at the concrete design-review candidate for Davide before dependent UI work, merge, or activation continues.

### INC05-R12 — Complete both founders' real journeys

The final cohort record must include all four qualified native connections, real account-attributed results for each, and bounded repository work initiated or continued by each founder under their own qualified native bindings. A connection card or sign-in screenshot alone is insufficient. Two small sequential repository episodes or separate approved scopes are acceptable; an exhaustive provider-role permutation matrix is not required.

At least one API contribution must be consumed by the other eligible founder, producing a real retained Explore result. Exercise natural addressing, an exact Explore-to-Build source link, visible/editable resource choices, ongoing-work inquiry, and a queued follow-up. At least one real voice inquiry and one authorized voice follow-up must return through the shared work path.

Use actual owner-authenticated flows. The coordinator or tester does not collect a founder's credentials or impersonate the other owner to mark the two-account cases passed. If an owner interaction is required, prepare the exact connection/test step and retain the remaining case as waiting until observed.

### INC05-R13 — Preserve release evidence and independence

Every required coding result needs the exact reviewed candidate, current pushed-head automatic Codex review, independent source review, applicable design approval, merge, deployment identity, and successful ordinary in-app test. A preview, build log, merged PR, and deployed verified outcome are different evidence stages.

The one independent Codex thread performs review and testing sequentially with separate records bound to their respective source and release. It must not author the fixes it then approves. Findings return through the coordinator to the assigned Claude Code worker or designer. Routine repairs remain in the mission; material design changes reopen the affected approval.

A failed app verification leaves the goal open. Record the failure, affected release, containment/rollback decision, and next repair owner. Do not change an adverse result to pass because a different scripted path worked.

### INC05-R14 — Roll out and recover by capability

Enable voice work reading first, then bounded fresh inquiry, then queued guidance, using the qualified typed operations underneath. Keep per-capability activation so a failing voice inquiry can be disabled while ordinary voice and typed work remain usable.

Rollback prevents new affected admissions while retaining requests, results, controls, native-session reconciliation, and private audience boundaries. It does not cancel running work by deleting a UI projection. Unsettled effects stay visible to their authorized owner until reconciled.

## 3. Implementation slices

| Slice | Deliverable | Exit |
|---|---|---|
| INC05-S01 | Current voice/runtime and test-harness mapping | Real route, identity, observations, and tool boundary documented |
| INC05-S02 | Authorized work digest/read operation | Source-grounded answer from real work, no fresh native turn needed |
| INC05-S03 | Bounded manager inquiry and queued follow-up | Correct thread/return identity, grant checks, and duplicate protection |
| INC05-S04 | Narration dedupe, audience changes, call/work controls | Focused adverse/reconnect cases pass |
| INC05-S05 | Incremental room voice-stage improvement | Working significant candidate approved by Davide |
| INC05-S06 | Founder release verification | Both-user native work, other-member API use, voice, and exact deployed evidence |

Source and UI work may proceed in parallel when file ownership is separate. Do not enable fresh voice effects before the relevant shared admission and runner operations pass. The coordinator can continue unrelated authorized work while a significant voice-stage design candidate awaits approval.

## 4. Founder release script

Use a named small project/repository and bounded owner-approved allowances recorded during INC-00/01. Keep the test content harmless and recognizable; do not intentionally exhaust a subscription.

1. Davide opens the production application, verifies his real native connections, and observes supported model/effort and truthful quota/unknown states.
2. Luis does the same for his distinct connections. Verify their histories and private resource information are not visible to each other outside the approved projection.
3. One founder permits a bounded API contribution to the shared project. The other requests qualified research/design through Sophia and receives its retained exact-version output.
4. An explicit natural request promotes the accepted source into a bounded repository mission. Inspect the actual manager/worker/verifier bindings and correct payer attribution.
5. Follow the mission in Sophia. Ask a work question through voice, then send an authorized voice follow-up to the existing manager. Observe truthful receipt stages and the resulting work record.
6. Interrupt speech and leave/rejoin the call. Confirm the repository mission continues and reconnect does not replay the instruction.
7. Complete the independent review, automatic review, applicable design approval, merge, deployment, and actual app test of the bounded capability.
8. Observe bounded repository work from the other founder under that founder's own bindings, producing real candidate output with corresponding review/release evidence where required by the mission.
9. Reload and revisit the conversation, goal, artifact, and release evidence. Verify continuity and run the relevant adverse cases below.

This sequence can span several small releases; it is not a demand that every capability land in one PR. Reuse valid observed evidence with its exact identity. Repeat a case only when the changed boundary invalidates it or a concrete risk remains.

## 5. Acceptance cases

| ID | Procedure and required result |
|---|---|
| AC-05-01 | Identify the actual deployed voice route and map the test harness to it; retain real route/build evidence, not an old-stack substitute. |
| AC-05-02 | Ask about ongoing work through voice; answer from authorized retained evidence with correct work identity and freshness. |
| AC-05-03 | Ask a question requiring a fresh permitted manager inquiry; enforce its bounded read-only effect and return the answer to the originating request. |
| AC-05-04 | Send voice guidance during an active build; one explicitly queued manager follow-up, no direct worker steering, no manager replacement. |
| AC-05-05 | Replay partial/final utterance delivery, tool retry, and reconnect; retain one admitted operation while permitting two intentional repeated utterances. |
| AC-05-06 | Repeat a work question on held/stopped or relevant design-held work; retained read or waiting question, zero fresh native inquiry/resume. |
| AC-05-07 | Barge in, mute, and leave the call; speech/input/call state changes as intended while repository work continues. Separately verify targeted Stop and settlement. |
| AC-05-08 | Add a participant or switch rooms before an answer arrives; no private or wrong-room spoken disclosure. Retain only to the still-authorized original scope. |
| AC-05-09 | Revoke source/member access before delayed publication; withhold prohibited content, including summaries and explanatory snippets. |
| AC-05-10 | Emit duplicate completion paths and reconnect with a backlog; one relevant narration decision, no repeated event-by-event speech or false playback claim. |
| AC-05-11 | Deny microphone access or drop the voice connection; show usable recovery and truthful call state without losing the durable work/input. |
| AC-05-12 | Compare actual transcript/audio/work retention with UI copy; no false “nothing recorded” promise or sensitive content in shared evidence. |
| AC-05-13 | Verify the approved room-stage candidate, keyboard/narrow states, and supported controls; no simulated camera/screensharing claim. |
| AC-05-14 | Complete all four real owner-native qualifications and actual repository work initiated/continued by each founder under their own bindings. |
| AC-05-15 | Complete real shared API Explore initiated by the other eligible founder, exact-version promotion, and editable resource allocation. |
| AC-05-16 | Verify current pushed-head review, independent review, design approval if applicable, merge, deployment identity, and ordinary in-app success for required coding results. |
| AC-05-17 | Fail a relevant app acceptance step; goal remains open with exact adverse evidence and assigned repair, then close only after the corrected release passes. |
| AC-05-18 | Disable a voice-effect capability during active work and reload; no new disabled effect, preserved typed controls/reconciliation, and retained correct-audience evidence. |

## 6. Evidence, observability, and handback

Use the shared templates for source review, deployment/test, design approval, and acceptance. Link the founder/connection/account identity safely, operation ID, native session/turn, exact source, approved UI candidate, release identity, and observed app result. Record what was observed versus inferred. All cases start `not_run`; “waiting for founder sign-in” is not a pass.

Measure connection/reconnect success, time to first useful receipt and result, failed/duplicate dispatches, control settlement, waiting questions, withheld delayed outputs, and observed narration deduplication. Use the qualified deployment's actual timeout/allowance policy. Do not claim a latency or reliability target was met from a fixture or an unmeasured expectation.

## 7. Completion boundary

The final founder capability is complete only when the required changes are merged into main, deployed, and independently tested successfully in Sophia, with the required two-founder and voice evidence. A green automated suite alone cannot close it. Capabilities intentionally disabled or deferred remain explicit limitations.

The historical eighteen-capability umbrella remains broader than this release. This mission does not mark imports, broad deck/image workflows, generic native pooling, active handovers, new meeting media, or long-term learning engines complete.

## 8. Source grounding

- The attached **M06 — Voice Presence Controller** supplies useful one-narrator, source-event, work-digest, barge-in, and truthful-observation requirements. Its historical runtime topology must be revalidated rather than copied as current deployment fact.
- [Sophia runtime dispatch](https://github.com/davidelaverga/Sophia/blob/9d6902d6b07f42cb4ef725a2524814f386680759/apps/worker/src/runtime-dispatch.ts) and [control bridge](https://github.com/davidelaverga/Sophia/blob/9d6902d6b07f42cb4ef725a2524814f386680759/packages/dsh-bundle/src/control-bridge.ts) ground the retained control/admission semantics. The new voice-to-native operations remain proposed implementation.
- [T3 outside-agent access scope](https://github.com/pingdotgg/t3code/blob/ade473018d32003658b7d38693e083ee2e314bd8/docs/user/outside-agents.md) and [orchestration operations](https://github.com/pingdotgg/t3code/blob/ade473018d32003658b7d38693e083ee2e314bd8/docs/orchestration-v2/orchestrator-mcp-server.md) require the narrow Sophia gateway rather than direct broad voice-model access.
- [Impeccable's Claude Code skill](https://github.com/pbakaus/impeccable/blob/924bbd194d02e5e15a227e75b5901fb0d7a4ecad/.claude/skills/impeccable/SKILL.md) is a pinned design-work reference; the pack's design approval and repository permissions govern its use.
