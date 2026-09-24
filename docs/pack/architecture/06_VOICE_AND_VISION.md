# Gemini 3.8 Live, the room and selected visual context

**Decision:** Google Gemini API, `gemini-3.8-live`, `@google/genai` 2.24.0, raw LiveKit RTC. Normal Live is the first voice route; Extended Thinking is an extension, not a silently substituted mode. [GG-01, G-01–G-06, LK-01–LK-04]

## 1. Responsibility split

LiveKit carries participant audio/video/data and authenticated participant identity. Sophia's media bridge joins as one server-side participant, receives the permitted tracks, maintains a Google Live session and publishes one Sophia audio track. The browser never receives Google's long-lived API key.

Gemini Live handles conversational reasoning and selected visual grounding. It can call a small tool set. The text guide and project technical lead run on dsh; only requests that need those roles go there. Both routes use the same eligible project ContextPacket and domain action API. There is no compulsory STT → dsh → TTS pipeline for every sentence, and no second LiveKit Agents project brain.

## 2. Four independent lifecycles

| Lifecycle | Begins | Ends | Must not imply |
|---|---|---|---|
| Room participation | authorized person joins | leaves room | cancel all project work |
| Sophia exchange | explicit invocation + input floor | end exchange / revoke | stop independently admitted jobs |
| Provider connection | bridge connects to Google | GoAway, error or close | loss of accepted project decisions |
| Audio output | response generation/playback | interruption or drained output | goal completed |

Durable work has its own lifecycle outside this table. Keep its IDs on tool calls and result events. A provider `turnComplete` is a conversational boundary, not project acceptance.

## 3. S1 input routing

Both humans can talk in the LiveKit room. The bridge sends audio to Google only from the current admitted-input owner while the exchange is open and that participant permits the route. Input ownership has an epoch and a trusted track binding. During handoff, finish or cancel the current input segment, advance the epoch, then admit the new track; do not blend two people into one unlabelled command.

Start with an explicit invoke button and follow-up exchange; voice-triggered invocation can use an admitted transcript/window, but a quoted name is not a hard command. S2 adds full consented discussion following and richer invocation testing. Raw ambient audio is not sent merely because everyone joined the room.

The command actor is the authenticated participant bound to the admitted utterance. A model-generated name, speaker guess or text field never grants account authority. Ambiguous overlap or an unbound tool request becomes clarification, not an inferred approval.

## 4. Audio pipeline

Receive the selected microphone stream, resample to **mono signed 16-bit PCM at 16 kHz**, and send bounded chunks through `sendRealtimeInput` with `mimeType:'audio/pcm;rate=16000'`. Do not pass an Opus/WebM blob and label it PCM. Keep input buffering bounded; expose a gap instead of pretending dropped input was heard. [G-02]

Google audio output is handled as PCM at its declared rate, with the initial route using **24 kHz mono**. Publish through `AudioSource(24000, 1, 200)` and a `LocalAudioTrack`; 200 ms is Sophia's selected queue target, not an upstream guarantee. Feed short frames with backpressure. The raw RTC example establishes this publishing path. [LK-01, LK-03]

At barge-in or Stop Speaking, increment the playback epoch, stop accepting old-generation audio, call the actual `AudioSource.clearQueue()` and discard pending bridge output. Clear client-side queued output as applicable. A small already-transmitted device/network tail can still be audible; measure it rather than claiming zero-latency cancellation. A reconnect cannot replay an old buffer into a new exchange.

Do not close the entire dsh project because speech was interrupted. Cancel the affected Live conversational operation and reconcile any admitted tool separately.

## 5. Google session setup

Create one Live session per active room exchange on the bridge, using `ai.live.connect({model, config, callbacks})`. Configuration decisions:

- `responseModalities: [AUDIO]`; enable input and output transcription for attribution and user-visible continuity.
- Explicit non-blocking behavior on work-admission/status tools. Do not rely on a model-specific default.
- Enable `contextWindowCompression`; initial policy trigger 25,000 tokens, target sliding window 8,000, encoded with the exact SDK field types.
- Enable `sessionResumption: {}` on a fresh connection; retain the latest valid handle on the bridge. Resume only into the same eligible room/exchange/context scope.
- Do not set proactive audio to false: current 3.8 guidance says proactivity is permanent. It is not our permission or privacy mechanism.
- Do not attach an Extended Thinking configuration to normal 3.8 Live. Record the actual configured model and returned usage.

The generic session-management examples still name an older model. This plan selects 3.8 explicitly; connection behavior and account capability are exercised in S1-05 rather than inferred from an old sample. [G-01–G-05]

## 6. Small tool surface, shared domain authority

| Tool | Returns immediately or boundedly | Long work path |
|---|---|---|
| `project_status` | current project/goal snapshot | none |
| `read_selected_source` | exact eligible text/component facts | deeper retrieval job when needed |
| `start_research` | admitted work ID | dsh research worker |
| `start_image_job` | admitted image job ID | Google/OpenAI image adapter |
| `start_prototype` | admitted work ID | native prototype profile + isolated workspace |
| `ask_technical_lead` | admitted question/review ID | dsh lead |
| `submit_review_intent` | source-bound intent/command receipt | lead → correct worker |
| `control_work` | accepted/rejected control command | route-specific Hold/Stop/reconcile |

The bridge derives project, actor, audience and current target from trusted session state. Tools accept the user's substantive instruction, not arbitrary `owner_id` or provider credentials. Dangerous actions remain subject to their current grant, regardless of whether the instruction was spoken.

A tool call ID is scoped to the provider connection/exchange. Memoize `(exchange, connection generation, call ID, payload hash)` to prevent duplicate admission. A reused ID with changed arguments is a conflict. An already admitted long job outlives the provider call.

## 7. Non-blocking function response shape

The SDK's `FunctionResponse` has `id`, `name`, `response`, `scheduling` and `willContinue` at the **top level**. Do not put the last two inside the ordinary `response` object. `willContinue` is only meaningful for non-blocking calls and is not supported by Vertex; our first route is the Gemini API. [G-06]

For job admission, return the real work ID quickly and finish the function call:

```ts
session.sendToolResponse({
  functionResponses: [{
    id: call.id,
    name: call.name,
    response: { output: { status: 'admitted', workId, commandId } },
    scheduling: 'WHEN_IDLE',
    willContinue: false,
  }],
});
```

This is a protocol specimen, not a complete executable service. `workId` and `commandId` come from a committed API admission. Status and source tools also return structured failures rather than fabricated empty success.

For long completion, use the project event path and a fresh, current context update/notice; do not keep a tool generator alive for hours or answer an expired call after reconnect. A short active-connection multi-part tool may use `willContinue:true`, ending with false, but that is not the primary long-work mechanism.

Provider tool cancellation cancels undelivered/read-only work tied to that call. It does not silently roll back an independently admitted build. Explicit work cancellation uses `control_work` and current authority.

## 8. Message handling and narration

An incoming provider message can contain more than one meaningful field. Process tool calls, cancellations, transcription, resumption updates, GoAway, audio and turn completion independently; an `else if` chain can lose events. Persist only eligible normalized text/action records, not every raw transport frame.

A single Presence policy decides what a background result should do. S1 speaks a relevant result at an idle conversational boundary, otherwise shows a card/status update. Do not force a `turnComplete:true` context update into an active user exchange merely to announce a build; that can interrupt it. Coalesce routine result updates and preserve exact current work state.

S2 extends the same policy to optional milestone invitations and consented following. It does not give each lens or worker its own narrator.

## 9. Visual input

The first route observes the selected artifact/preview. An explicitly chosen browser screen/window share is a separate source with visible consent. Stream a bounded latest frame through `sendRealtimeInput({video:{data,mimeType:'image/jpeg'}})`; initial sampling is at most one frame per second. Drop stale queued video rather than delaying audio. [G-02]

Every frame has project, target, preview/source revision, capture time, crop/viewport and observation epoch. Tool reads of exact text must match that target. A more detailed still or Google multimodal analysis job is requested for small text/layout questions; the original visual observation is not treated as authoritative source text.

`Stop Looking` revokes that observation epoch across the Live frame route and associated screenshot jobs. No alternate browser tool silently reopens the same revoked observation. Already processed information cannot be erased from the provider's past; future use is fenced and a clean context is rebuilt when needed.

Visual review is not browser testing. In S1 the native engineer supplies a working preview and checks; S2 adds controlled Playwright exploration and scenarios. A model's statement that it saw success is labelled observation, not an executable assertion.

## 10. Reconnection

On GoAway, retain the latest valid handle and connection state, stop accepting stale output, reconnect and restore audio only after the new connection is ready. On unplanned closure, preserve application commands and attempt recovery. The generic documentation describes a two-hour resumption-handle validity window; do not turn that into a guaranteed product session duration. [G-04]

Cold recovery builds a compact packet from current accepted decisions, selected target, open obligations and permitted recent dialogue. It never replays raw private history from an old scope. Repeated reconnection does not rerun `start_image_job` or issue another engineering assignment. A failed voice route leaves text/status/work controls available and explicitly reports voice unavailable; it does not silently replace Gemini with another vendor.

## 11. First live acceptance episode

Two independently authenticated people hear the same Sophia. Each can take the input role and get a coherent response. One asks for an image/prototype; work is admitted once while conversation continues. A selected preview is visually discussed with correct source identity. Barge-in stops old audio without killing work. One forced provider reconnect preserves the work and does not duplicate a tool effect. Stop Looking halts new frames. Ending the exchange does not stop the engineering goal.

Retain actual model/SDK IDs, input/output counts, measured response latency, observed interruption tail and the tested session duration. This pack supplies the cases; it claims none has run.

## 12. Input-floor transfer boundary

Settle or cancel the current conversational generation before changing the input-floor epoch. A tool call already associated with an utterance retains that original actor/epoch; never reassign it to the new speaker. When attribution is unresolved, keep the request unadmitted and clarify. A new speaker may continue the same room Live session after that boundary, with current attributed context. There is one Sophia output stream, not one competing model per person.
