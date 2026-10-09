# Voice qualification evidence for the Studio G7 episode: `sophia.voice-qualification.v1`

**Status:** source only. It is off by default, and nothing here enables it. Enabling it needs all three:
- an operator grant through the migration owner (migration 0046);
- `SOPHIA_VOICE_QUALIFICATION=on` on the API. Off, its default, the API passes no grant on to the bridge, runs no guard, serves neither route below, names no grant on a room token, and needs nothing of 0046 to be ready;
- `SOPHIA_VOICE_EVIDENCE=on` on the media bridge.

All three belong to the owner's batch, never to this change. The contract is amendment A15; where this page and migration 0046 differ, 0046 holds.

**Why it exists.** Pack 03 G7 asks for a synthetic in-app voice episode: Create (HTML asked for by voice), a steer, leaving and returning, Hold, Resume and Stop. It is driven by the Voice Lab, which feeds synthetic audio into the Studio's own microphone path.

The legacy Lab proved input from a browser Gemini WebSocket, and this product has none: the browser sends Opus over WebRTC to LiveKit, and the media bridge decodes it and talks to Gemini on the server. This contract gives the Lab product-authored receipts for the legs only the product can see. It does so without changing the product's privacy model.

## Privacy rules (hold for every receipt)

- **No speech is retained:**
  - no transcript, caption text or typed text;
  - no hash of any text;
  - no audio, and no audio fingerprint except a SHA-256 chain over 16 kHz PCM the bridge already forwards. That chain cannot be inverted to audio.
- **Receipts carry only** numbers, booleans, enumerated words, UUIDs, hex digests and timestamps. The contract's JSON Schemas allow no free-text string.
- **Only the approved synthetic principal is recorded:**
  - the bridge records input only while the floor holder is the grant's principal;
  - the Studio emits page receipts only to the principal's own page, for its own microphone and Sophia's playback.
- **Retention:** evidence rows expire 24 h after they are written, and expired rows are deleted.
- **No credential appears** in a receipt, a log or an API answer.

## The gate (I0)

**The grant.** `sophia.voice_qualification_grants` holds one operator grant per project at a time. It is created only through the migration owner's `sophia.voice_qualification_grant(project, principal, run_binding_sha256, approval_ref, max_exchange_seconds, max_provider_connections, max_usage_tokens, ttl_seconds)`. No member and no service role may call it.

| Field | Meaning |
|---|---|
| `principal_actor_id` | the synthetic account. It must be an active editor or admin of the project (Create needs editor). |
| `run_binding_sha256` | the Lab run's binding hash (`test_run_id`, `cleanup_obligation_id`, scenario). It is not secret, and the product never sees what it hashes. |
| `approval_ref` | the owner's approval it rests on. |
| `max_exchange_seconds` (60–1800) | the hard length of an exchange opened under the grant. |
| `max_provider_connections` (1–10) | the provider connections a session may open, the first one included; past it, the exchange ends. |
| `max_turns` (1–200) | the provider generations, whatever started them; at it, the exchange ends. |
| `max_output_tokens_per_turn` (64–8,192) | one generation's output cap; the bridge sets it as the session's `maxOutputTokens` and cuts a generation that passes it. |
| `max_usage_tokens` (1,000–5,000,000) | the provider tokens reported (`usageMetadata.totalTokenCount`, cumulative per provider session, summed across sessions). The exchange ends once what was reported, plus the last prompt's size (the context the next generation bills again) and one generation's output cap, would reach it. |
| `expires_at` | the grant's end: at most 2 h after it is made. |
| `revoked_at`, `revoke_reason` | `sophia.voice_qualification_revoke(project, grant, reason)`, owner only. |

**Which exchanges a grant covers.** An exchange is under a grant when it is in the grant's project and was opened while the grant was active, that is, before it expired or was revoked. A grant never covers an exchange opened before it.

**The guard (server-side, Lab-independent).** `sophia.voice_qualification_guard()` runs in the API's write transaction on every bridge presence report (every 5 s while the bridge is in the room), every assignment poll and every evidence write. It ends an exchange under a grant, as End would (ended_by null, event `room.exchange_qualification_limit`), at the first of these:
- `now ≥ least(expires_at, opened_at + max_exchange_seconds)` (`deadline`, or `expired`);
- the grant is revoked (`revoked`);
- connections reported exceed `max_provider_connections` (`connections`);
- generations reported reach `max_turns` (`turns`);
- the next generation could pass `max_usage_tokens` (`usage`, the rule above).

It writes a `guard` receipt (service, seq 0) with the reason. The guard runs only in an API with voice qualification on. Ending the exchange removes it from the bridge's assignments: the bridge's long poll wakes on the event, and its session closes, including the Gemini connection. **If the Lab dies, the exchange still ends at its deadline.** The bridge also stops forwarding input at the deadline itself (defence in depth).

**The binding.** Every receipt carries `grantId` and `runBindingSha256`. The Lab checks the hash equals its own run's binding: a receipt from another run, grant or project is a mismatch, and the harness fails.

## Bridge receipts (I1–I5), over `POST /v1/media/evidence`

**Recording conditions.** The bridge records only while all of these hold:
- `SOPHIA_VOICE_EVIDENCE` is `on` (default off: `off`, unset or empty; any other value stops the bridge's start, and `bridge.start` logs `voiceEvidence`);
- the assignment carries `qualification`, naming the same grant;
- the floor holder (the assignment's `inputActorId`) is the grant's `principalActorId`.

An input window opens only for the principal's own forwarded audio; a reply and the provider's phases are recorded only while the principal holds the floor. What opened under the principal ends with its own receipt, whatever ends it (a handoff ends its window). Nothing is recorded of a session the principal never held the floor in, not even its close. Off, or without a grant, the bridge sends the API and the provider exactly what it sent before.

**Sending.** Each receipt has a per-exchange sequence `seq` (1–99,999, in the write, not the receipt). A resend with the same `seq` and body is idempotent; another body under the same `seq` is refused (409 `idempotency_conflict`). Every receipt carries `kind`, `schema: 'sophia.bridge.voice_qualification.v1'`, `grantId`, `runBindingSha256` and `atMs`; A15's schemas refuse any other field.
- The bridge numbers an exchange's receipts once per process, across the sessions that replace one another on it (a lost room). A new process starts again at 1: the numbers an earlier process used are refused (409), dropped and counted.
- Sending never blocks or delays audio. Receipts are queued (at most 1,000; past that, dropped) and sent one at a time, in order.
- A lost answer or a 5xx is sent again with the same `seq` and body, after 0.5, 2 and 5 s; then the receipt is dropped. A 4xx is dropped at once.
- A session's close waits at most 3 s for its queue; the rest is dropped.
- Each drop is logged (`evidence.dropped`: seq, kind, why, a running count), never its body; the close logs `evidence.closed` (sent, dropped).
- An answer `{ended: true}` closes the session at once, its provider connection included; the assignment poll then drops it.

| Kind | When | Fields (beyond grantId, runBindingSha256, seq, atMs) |
|---|---|---|
| `input_window` | from the first 16 kHz chunk forwarded to the provider for the principal, until the provider's turn completes (`turn_complete`), its barge-in (`interrupted`), a handoff, a pause, or the connection or session closes (`closed`) | windowSeq, inputEpoch, providerSession, connection, startedAtMs, endedAtMs, endReason, chunkCount, sampleCount, nonzeroSampleCount, audibleChunkCount (the bridge's audible floor), rms, peak (0–1 of full scale), droppedSamples (the input backlog's), sampleRate=16000, pcmDigestAlgorithm=`sha-256-chain-v1`, pcmSha256Chain, rawAudioExcluded=true |
| `input_turn` | with its window's end, from what the provider showed of the turn by then | windowSeq, turnOrdinal, inputTranscriptionObserved (boolean), transcriptChars (**a count only**), finished, attributedToHolder (the turn was the principal's, at that epoch), modelResponded, toolCallCount, outcome: `answered` (the turn completed, or a handoff came, after a response), `interrupted` (barge-in, or a pause after a response), `no_user_turn_observed` (no response by then), `connection_lost` (the connection or session closed) |
| `provider` | setup (as each connection opens), ready, recovering or unavailable (a connection lost or replaced), closed (the session closes); usage (a connection's reported total grew) | phase, providerSession (a UUID per provider session; a resumed connection keeps it), connection (its ordinal in the session), resumed, model, instructionSha256, bridgeCommit (or null), connectionsOpened, turns (provider generations ended: completed, cut by barge-in, or lost after output), usageTokens (each connection's highest `usageMetadata.totalTokenCount`, summed; or null), lastPromptTokens (the newest `promptTokenCount`; or null). The guard holds the last four to the grant. |
| `output_reply` | a reply ends: played out, or cut | replyOrdinal, turnOrdinal, providerSession, connection, receivedAtMs, firstPlayedAtMs, endedAtMs, terminal (`played`, `stopped`, `interrupted`, `recovered`, `closed`), samplesReceived, framesPlayed, nonSilentFramesPlayed (a nonzero sample), rms, peak (of the frames played), durationMs (framesPlayed × 20), playedDigestAlgorithm=`sha-256-chain-v1`, playedSha256Chain (over the 20 ms frames handed to the room track) |
| `session_closed` | the session closes, or the bridge's bound stops it; recorded when anything of the session was | providerClosed, windows, turns (provider generations), replies, toolCalls and typedMessages (while the principal held the floor), transcriptRetained=false, reason: `ended` (the exchange ended or moved away, the API's guard said so, or the bridge stopped), `lost` (the room was lost), `guard` (the bridge's own bound or the deadline) |
| `guard` | written by the API when the guard ends an exchange | reason (`deadline`, `expired`, `revoked`, `connections`, `turns`, `usage`) |

**The bridge's own bound** (`qualification-reserve.ts`, wired by `qualification.ts`). A session under a grant, with `SOPHIA_VOICE_EVIDENCE=on`, holds itself to the grant whoever holds the floor (it records nothing for this):
- the provider's setup carries `maxOutputTokens` = `maxOutputTokensPerTurn` (only under a grant; otherwise it names no cap);
- before anything that can start a generation (the first input after a turn ended, a tool response, a notice, a typed message), one generation's worst case is reserved: the context again and its output twice. A generation that starts unasked (a WHEN_IDLE continuation, a second tool round) takes its reserve as its output arrives;
- audio, frames and text sent, transcription received and usage reported are counted. A generation whose output passes the per-turn cap is cut;
- a connection past `maxProviderConnections` is never opened. The `deadline` is checked on every tick (100 ms) and before anything is sent.

When the bound says stop (`usage`, `turns`, `connections`, `output` or `deadline`):
- the bridge sends nothing more to the provider and closes it for good;
- it stops what is playing, and reports Sophia unavailable with the reason;
- it records the provider's close and `session_closed` (`guard`).

The session stays in the room until the API ends the exchange (its guard, from what was reported, or at the deadline). The bound is conservative: a tool response's reserve and its continuation's each count, so a tool round can cost one generation more than the provider ran.

**`sha-256-chain-v1`** is the Lab's own algorithm. Start from 32 zero bytes; for each frame `i` from 1: `chain = sha256(chain ‖ sha256(frame bytes) ‖ uint32be(i))`. A frame's bytes are its 16-bit samples, little-endian: on input, each 100 ms chunk forwarded (1,600 samples at 16 kHz); on output, each 20 ms frame played (480 samples at 24 kHz). A window or reply with no frame has the 32 zero bytes.

On this transport the chain covers **the PCM the bridge forwarded or played**. It is **never** comparable to the Lab's source WAV or the browser's frames: the Opus path is lossy, and the input is resampled. The Lab reconciles input by ordinal and envelope only (`pcm_reconciliation: envelope_only`), and must not compare chains for equality.

**Reading them.** `GET /api/v1/exchanges/{exchangeId}/qualification-evidence` is answered only to the grant's principal, with their own JWT. It returns the one grant covering the exchange (its limits and deadline, what was reported against them, why the guard ended it) and the receipts kept, bridge receipts in `seq` order then the service's guard receipt. Anyone else, or an exchange under no grant, gets 422 `not_found`, as the API's other reads do. An API with voice qualification off does not serve the route.

## Studio receipts (page only, never stored)

**When they are emitted.** Only when the room-token answer carries `qualification`, which the API adds only for the grant's principal while the grant is active. The Studio then dispatches `window` `CustomEvent('sophia:voice-qualification', {detail})`. It has no setting of its own. Without `qualification`, it adds no listener at all and dispatches nothing.

The token holds for the call it opened. A grant revoked or expired during that call still names the grant on its receipts; the next join asks for a new token.

**What the Studio does with them.** Nothing: no receipt is stored, sent to a server or logged. The detail is frozen. It carries only the grant's two fields (`grantId`, `runBindingSha256`), never anything else the grant holds. The receipts and their listeners load with the call (`apps/studio/src/features/voice/voice-qualification.ts`), never before.

**The detail** has `schema: 'sophia.studio.voice_qualification.v1'`, `grantId`, `runBindingSha256`, `atMs`, `event`, and:

| event | fields |
|---|---|
| `mic_published` | trackSid, trackId: the published microphone's `MediaStreamTrack.id`. The Lab compares it with the track it issued, which resolves "actual acquired track". |
| `mic_unpublished` | trackSid |
| `sophia_playback` | phase (`play`, `playing`, `pause`, `waiting`, `ended`, `emptied`), trackSid, mediaTimeMs. Only from `audio[data-sophia-room-audio="sophia"]`; no other participant's element is observed. |

`atMs` is the page's clock (`Date.now()`). Each receipt's keys come in the order above: schema, grantId, runBindingSha256, atMs, event, then the event's own fields.

**When each one comes, as LiveKit drives them.**
- `mic_published` comes when LiveKit publishes the local microphone: on joining, or the first time it is turned on in the call. Turning it off mutes it and does not unpublish it, so muting and unmuting emit nothing. No other source is reported (camera, screen, screen audio).
- `mic_unpublished` comes when LiveKit unpublishes it: when the call ends, however it ends (Leave, a lost connection, the server ending it).
- A full reconnection, LiveKit's fallback when resuming fails, unpublishes the microphone and publishes it again: `mic_unpublished`, then `mic_published`.
- The Studio has no in-call microphone switch. If LiveKit restarts the track in place (its default device changed), no new receipt comes, and `trackId` still names the track it published.
- `sophia_playback` comes from Sophia's element only. The room marks her element (`data-sophia-room-audio="sophia"`) as her track is subscribed, and every other voice's `member`.
  - Her element is observed from that subscription until her track is unsubscribed or the call ends.
  - A receipt also needs the element to be marked hers when the event comes.
  - LiveKit recycles a detached audio element for the next audio track attached, a member's or a later call's. So nothing of one subscription carries onto another track or into another call, with or without a grant.
  - What the browser fires for the detach itself (the pause and emptying LiveKit's `detach()` queues) comes after the subscription ended and is not reported.
  - `mediaTimeMs` is the element's `currentTime` in whole milliseconds: the element's own clock, not the bridge's.

## Deployed identities (I6)

| Component | Where | Source |
|---|---|---|
| API | `GET /health` → `{ok, commit}` | `RENDER_GIT_COMMIT` (40 hex), or null; served whether or not voice qualification is on |
| Bridge | `provider` receipts' `bridgeCommit` | same |
| Studio | `<meta name="sophia-build" content="<commit>">` in the page's head, only when the build sets `VITE_SOPHIA_COMMIT` | `VITE_SOPHIA_COMMIT` at build time (40 lowercase hex, as `RENDER_GIT_COMMIT`); any other value, or none, is no tag at all. No build in this repository sets it yet. |

A missing identity is typed unavailable by the Lab, never guessed.

## Joins the Lab makes

`projectId` → `room.id` (the LiveKit room) → `exchangeId` and `inputEpoch` → the native task the exchange's voice tool call created (`NativeTask.exchangeId`) → its output (`artifactId`, `resultSourceId`) → the artifact version → its downloaded bytes' SHA-256.

**`NativeTask.exchangeId` is canonical.** The service records each voice tool call of a grant's principal, in an exchange opened under that grant, as it binds the call to its speaker (`media_tool_speaker`). It records the tool the call named, under the key the API gives its command (`live:<exchangeId>:<generation>:<callId>`). It checks again that the exchange has not ended and that the actor held the call's input epoch (0046, `live_tool_calls`). Nobody else's call, and no call outside a grant, is kept.

The command a call admits is linked to it by the transaction that inserts that command. The API marks the transaction for that one recorded call of the speaker's (`live_call_admits`) before it admits, and a trigger links only a command inserted under the mark. Once the API has answered the call, after anything it admitted has committed, the service marks the call answered with the answer's status. The key never joins by itself:
- A member's own command never links, under any key, even the very key of a recorded call that admitted nothing.
- Nobody can mark another speaker's call.
- A retried call admits nothing new, so it links nothing new.
- A task created while the API's voice qualification was off does not get it.
- A task rebuilt from a voice-created one (`research_rebuild`, under its own `rebuild:` command) does not get it. The Lab follows the voice-created task, not its rebuild.

The snapshot and the task detail carry it only with voice qualification on.

**The calls that made each step.** `GET /api/v1/exchanges/{exchangeId}/calls` answers a member with their own recorded voice tool calls in that exchange, in the order the service recorded them (`seq`), and `readAt`, the moment it was read. Each entry has:
- the tool it named, and its input epoch;
- the command it admitted (kind, goal, the authority epoch it took, its state), and the task that command created;
- when the API answered it (`answeredAt`) and with what status (`outcome`).

The command is `null` for a call that admitted nothing:
- a read, or a clarification;
- a refusal: a Hold on work that is not running (already held, or held before the step) admits no command;
- a repeat that the work answered with what was already under way (`existingTaskId`).

It is also `null` for a call not answered yet (`answeredAt: null`), since whatever it admits may not have committed. A replayed call stays the one entry it was. Another member's calls and another exchange's calls are never listed. An exchange outside the caller's projects is 422 `not_found`, and an id that is not a lowercase canonical UUID is 422 `invalid_request`.

With `?after=<readAt>` from an earlier read, only calls whose recording began after that read are listed. A call already on its way at that read is never listed, whether or not it had committed. `seq` alone cannot say that: it is assigned when a row is inserted, not when it commits.

How the Lab certifies a voice step from it:
1. Wait until the previous step has settled: every call listed so far is answered, and the previous step's reply has ended.
2. Then, before the step's write-ahead, read the calls and keep `readAt` as the step's baseline. Pass it back verbatim; it is never compared as a millisecond time.
3. After the step, read `?after=<baseline>` until every call listed is answered. A timeout is not a pass.
4. Certify only if exactly one of those calls has a command, and that command is the expected one:
   - `native_task` with its `taskId` for create, answered `admitted`;
   - `steer`, `hold`, `resume` or `stop` on the created task's goal, answered `ok`.
5. Check the effect:
   - the command's state;
   - the goal's status in the snapshot;
   - for hold, resume and stop (which take a new authority epoch; a steer does not), an authority epoch higher than the previous of those;
   - a command id never certified by an earlier step.

Anything else is not a pass:
- no new call;
- an unanswered call;
- no call with a command, or more than one;
- another kind or goal;
- another outcome.

Neither is a task or command found elsewhere, whether in another exchange or from the principal's own request.

**The room as the bridge last saw it.** `GET /api/v1/rooms/{roomId}/live-presence` answers a member:
- whether they themselves are in the room (`selfPresent`);
- how many participants there are, and how many of those are guests;
- the bridge's voice and the live exchange;
- when the bridge last reported.

It answers nobody else's identity. `observed: false` (no report) or `fresh: false` (older than 15 s; the bridge reports every 5 s while it is in the room) proves nothing either way. A room outside the caller's projects is 422 `not_found`. The route exists only with voice qualification on.

Presence counts only when it is the principal's own: `fresh: true` and `selfPresent: true` on their own read. Counts, another member's read or a stale report prove nothing.

All of these are read by the principal through the member API (snapshot, native tasks, the exchange's calls, artifacts, live presence, evidence).

**Status codes the Lab must expect** (this API's convention for every member read):
- an object that is missing, or not the caller's, is 422 with `{code: 'not_found'}`;
- a route the API does not serve (voice qualification off) is 404;
- 401 and 403 are authentication and authorization.

## Not verified here

- That Gemini Live's `usageMetadata.totalTokenCount` is cumulative per provider session, as this contract and the bound assume. No provider call was made. If it is per turn, `usageTokens` under-reports, and so does the bridge's own bound once a report replaces its estimates of the generations the report covers. The turn, connection and per-turn output limits and the deadline hold either way.
- A `model` id outside A15's pattern (for example `models/…`) would have every provider receipt refused (422), dropped and counted. The default `gemini-3.8-live` fits.

## What stays unavailable (typed, never forged)

| Item | Status |
|---|---|
| Browser→provider PCM frames | `unsupported`: no browser provider socket exists |
| Equality of the Lab's PCM chain and the product's | `unsupported`: lossy Opus |
| A canonical transcript with content | `not_supported_by_product_privacy_model` |
| Provider output transcription fragments | not recorded (text) |
| An output-leg audio artifact | not recorded |

The Lab's legacy Gemini scenarios stay typed `unsupported` for this target.
