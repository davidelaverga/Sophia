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
- `SOPHIA_VOICE_EVIDENCE` is on (default off);
- the assignment carries `qualification`;
- the floor holder is the grant's `principalActorId`.

**Sending.** Each receipt has a per-exchange sequence `seq` (1–99,999, in the write, not the receipt), and a resend with the same `seq` and body is idempotent; another body under the same `seq` is refused (409 `idempotency_conflict`). Every receipt carries `kind`, `schema: 'sophia.bridge.voice_qualification.v1'`, `grantId`, `runBindingSha256` and `atMs`; A15's schemas refuse any other field. Sending never blocks audio: a failed send is retried, then dropped and counted.

| Kind | When | Fields (beyond grantId, runBindingSha256, seq, atMs) |
|---|---|---|
| `input_window` | from the first 16 kHz chunk forwarded to the provider for the principal, until the turn completes, is interrupted, hands off, pauses or closes | windowSeq, inputEpoch, providerSession, connection, startedAtMs, endedAtMs, endReason, chunkCount, sampleCount, nonzeroSampleCount, audibleChunkCount, rms, peak, droppedSamples, sampleRate=16000, pcmDigestAlgorithm=`sha-256-chain-v1`, pcmSha256Chain, rawAudioExcluded=true |
| `input_turn` | the provider's turn for that window ends | windowSeq, turnOrdinal, inputTranscriptionObserved (boolean), transcriptChars (**a count only**), finished, attributedToHolder, modelResponded, toolCallCount, outcome (`answered`, `no_user_turn_observed`, `interrupted`, `connection_lost`) |
| `provider` | setup, ready, recovering, unavailable, closed; usage updates | phase, providerSession, connection, resumed, model, instructionSha256, bridgeCommit (or null), connectionsOpened, turns, usageTokens (or null), lastPromptTokens (or null). The guard holds the last four to the grant. |
| `output_reply` | a reply ends | replyOrdinal, turnOrdinal, providerSession, connection, receivedAtMs, firstPlayedAtMs, endedAtMs, terminal (`played`, `stopped`, `interrupted`, `recovered`, `closed`), samplesReceived, framesPlayed, nonSilentFramesPlayed, rms, peak, durationMs, playedDigestAlgorithm=`sha-256-chain-v1`, playedSha256Chain (over the 20 ms frames handed to the room track) |
| `session_closed` | the session closes | providerClosed, windows, turns, replies, toolCalls, typedMessages, transcriptRetained=false, reason (`ended`, `lost`, `guard`) |
| `guard` | written by the API when the guard ends an exchange | reason (`deadline`, `expired`, `revoked`, `connections`, `usage`) |

**`sha-256-chain-v1`** is the Lab's own algorithm. Start from 32 zero bytes; for each frame `i` from 1: `chain = sha256(chain ‖ sha256(frame bytes) ‖ uint32be(i))`.

On this transport the chain covers **the PCM the bridge forwarded or played**. It is **never** comparable to the Lab's source WAV or the browser's frames: the Opus path is lossy, and the input is resampled. The Lab reconciles input by ordinal and envelope only (`pcm_reconciliation: envelope_only`), and must not compare chains for equality.

**Reading them.** `GET /api/v1/exchanges/{exchangeId}/qualification-evidence` is answered only to the grant's principal, with their own JWT. It returns the one grant covering the exchange (its limits and deadline, what was reported against them, why the guard ended it) and the receipts kept, bridge receipts in `seq` order then the service's guard receipt. Anyone else, or an exchange under no grant, gets 422 `not_found`, as the API's other reads do. An API with voice qualification off does not serve the route.

## Studio receipts (page only, never stored)

**When they are emitted.** Only when the room-token answer carries `qualification`, which the API adds only for the grant's principal while the grant is active. The Studio then dispatches `window` `CustomEvent('sophia:voice-qualification', {detail})`.

**The detail** has `schema: 'sophia.studio.voice_qualification.v1'`, `grantId`, `runBindingSha256`, `atMs`, `event`, and:

| event | fields |
|---|---|
| `mic_published` | trackSid, trackId: the published microphone's `MediaStreamTrack.id`. The Lab compares it with the track it issued, which resolves "actual acquired track". |
| `mic_unpublished` | trackSid |
| `sophia_playback` | phase (`play`, `playing`, `pause`, `waiting`, `ended`, `emptied`), trackSid, mediaTimeMs. Only from `audio[data-sophia-room-audio="sophia"]`; no other participant's element is observed. |

## Deployed identities (I6)

| Component | Where | Source |
|---|---|---|
| API | `GET /health` → `{ok, commit}` | `RENDER_GIT_COMMIT` (40 hex), or null; served whether or not voice qualification is on |
| Bridge | `provider` receipts' `bridgeCommit` | same |
| Studio | `<meta name="sophia-build" content="<commit>">`, only when the build sets `VITE_SOPHIA_COMMIT` | — |

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

## What stays unavailable (typed, never forged)

| Item | Status |
|---|---|
| Browser→provider PCM frames | `unsupported`: no browser provider socket exists |
| Equality of the Lab's PCM chain and the product's | `unsupported`: lossy Opus |
| A canonical transcript with content | `not_supported_by_product_privacy_model` |
| Provider output transcription fragments | not recorded (text) |
| An output-leg audio artifact | not recorded |

The Lab's legacy Gemini scenarios stay typed `unsupported` for this target.
