# Voice qualification evidence for the Studio G7 episode: `sophia.voice-qualification.v1`

**Status:** source only. It is off by default, and nothing here enables it. Enabling it needs:
- an operator grant through the migration owner;
- `SOPHIA_VOICE_EVIDENCE=on` on the media bridge.

Both belong to the owner's batch, never to this change.

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
| `max_usage_tokens` (1,000–2,000,000) | the provider tokens reported (`usageMetadata.totalTokenCount`, cumulative per provider session, summed across sessions); past it, the exchange ends. |
| `expires_at` | the grant's end: at most 2 h after it is made. |
| `revoked_at`, `revoke_reason` | `sophia.voice_qualification_revoke(project, grant, reason)`, owner only. |

**Which exchanges a grant covers.** An exchange is under a grant when it is in the grant's project and was opened while the grant was active, that is, before it expired or was revoked. A grant never covers an exchange opened before it.

**The guard (server-side, Lab-independent).** `sophia.voice_qualification_guard()` runs in the API's write transaction on every bridge presence report (every 5 s while the bridge is in the room), every assignment poll and every evidence write. It ends an exchange under a grant, as End would (ended_by null, event `room.exchange_qualification_limit`), at the first of these:
- `now ≥ least(expires_at, opened_at + max_exchange_seconds)` (`deadline`, or `expired`);
- the grant is revoked (`revoked`);
- connections reported exceed `max_provider_connections` (`connections`);
- tokens reported reach `max_usage_tokens` (`usage`).

It writes a `guard` receipt with the reason. Ending the exchange removes it from the bridge's assignments: the bridge's long poll wakes on the event, and its session closes, including the Gemini connection. **If the Lab dies, the exchange still ends at its deadline.** The bridge also stops forwarding input at the deadline itself (defence in depth).

**The binding.** Every receipt carries `grantId` and `runBindingSha256`. The Lab checks the hash equals its own run's binding: a receipt from another run, grant or project is a mismatch, and the harness fails.

## Bridge receipts (I1–I5), over `POST /v1/media/evidence`

**Recording conditions.** The bridge records only while all of these hold:
- `SOPHIA_VOICE_EVIDENCE` is on (default off);
- the assignment carries `qualification`;
- the floor holder is the grant's `principalActorId`.

**Sending.** Each receipt has a per-exchange sequence `seq`, and a resend with the same `seq` and body is idempotent. Sending never blocks audio: a failed send is retried, then dropped and counted.

| Kind | When | Fields (beyond grantId, runBindingSha256, seq, atMs) |
|---|---|---|
| `input_window` | from the first 16 kHz chunk forwarded to the provider for the principal, until the turn completes, is interrupted, hands off, pauses or closes | windowSeq, inputEpoch, providerSession, connection, startedAtMs, endedAtMs, endReason, chunkCount, sampleCount, nonzeroSampleCount, audibleChunkCount, rms, peak, droppedSamples, sampleRate=16000, pcmDigestAlgorithm=`sha-256-chain-v1`, pcmSha256Chain, rawAudioExcluded=true |
| `input_turn` | the provider's turn for that window ends | windowSeq, turnOrdinal, inputTranscriptionObserved (boolean), transcriptChars (**a count only**), finished, attributedToHolder, modelResponded, toolCallCount, outcome (`answered`, `no_user_turn_observed`, `interrupted`, `connection_lost`) |
| `provider` | setup, ready, recovering, unavailable, closed; usage updates | phase, providerSession, connection, resumed, model, instructionSha256, bridgeCommit (or null), usageTokens (or null) |
| `output_reply` | a reply ends | replyOrdinal, turnOrdinal, providerSession, connection, receivedAtMs, firstPlayedAtMs, endedAtMs, terminal (`played`, `stopped`, `interrupted`, `recovered`, `closed`), samplesReceived, framesPlayed, nonSilentFramesPlayed, rms, peak, durationMs, playedDigestAlgorithm=`sha-256-chain-v1`, playedSha256Chain (over the 20 ms frames handed to the room track) |
| `session_closed` | the session closes | providerClosed, windows, turns, replies, toolCalls, typedMessages, transcriptRetained=false, reason (`ended`, `lost`, `guard`) |
| `guard` | written by the API when the guard ends an exchange | reason (`deadline`, `expired`, `revoked`, `connections`, `usage`) |

**`sha-256-chain-v1`** is the Lab's own algorithm. Start from 32 zero bytes; for each frame `i` from 1: `chain = sha256(chain ‖ sha256(frame bytes) ‖ uint32be(i))`.

On this transport the chain covers **the PCM the bridge forwarded or played**. It is **never** comparable to the Lab's source WAV or the browser's frames: the Opus path is lossy, and the input is resampled. The Lab reconciles input by ordinal and envelope only (`pcm_reconciliation: envelope_only`), and must not compare chains for equality.

**Reading them.** `GET /api/v1/exchanges/{exchangeId}/qualification-evidence` is answered only to the grant's principal, with their own JWT. It returns the grants covering the exchange (limits, deadline, how it ended) and the receipts in `seq` order. Anyone else gets 404.

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
| API | `GET /health` → `{ok, commit}` | `RENDER_GIT_COMMIT` (40 hex), or null |
| Bridge | `provider` receipts' `bridgeCommit` | same |
| Studio | `<meta name="sophia-build" content="<commit>">`, only when the build sets `VITE_SOPHIA_COMMIT` | — |

A missing identity is typed unavailable by the Lab, never guessed.

## Joins the Lab makes (existing, unchanged)

`projectId` → `room.id` (the LiveKit room) → `exchangeId` and `inputEpoch` → the command key `live:<exchangeId>:<generation>:<callId>` → `research_tasks.exchange_id`/`job_id` → `design_tasks.published_version_id` → the artifact version → its downloaded bytes' SHA-256.

All are read by the principal through the member API (snapshot, events, native tasks, artifacts).

## What stays unavailable (typed, never forged)

| Item | Status |
|---|---|
| Browser→provider PCM frames | `unsupported`: no browser provider socket exists |
| Equality of the Lab's PCM chain and the product's | `unsupported`: lossy Opus |
| A canonical transcript with content | `not_supported_by_product_privacy_model` |
| Provider output transcription fragments | not recorded (text) |
| An output-leg audio artifact | not recorded |

The Lab's legacy Gemini scenarios stay typed `unsupported` for this target.
