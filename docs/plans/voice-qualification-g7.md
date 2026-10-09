# Voice qualification evidence for the Studio G7 episode: `sophia.voice-qualification.v1`

**Status:** source only. It is off by default, and nothing here enables it. Enabling it needs all three:
- an operator grant through the migration owner (migration 0046);
- `SOPHIA_VOICE_QUALIFICATION=on` on the API. Off, its default, the API passes no grant on to the bridge, runs no guard, serves neither route below, names no grant on a room token, and needs nothing of 0046 to be ready;
- `SOPHIA_VOICE_EVIDENCE=on` on the media bridge. A bridge with it off opens no provider connection for an exchange whose assignment names a grant (it says why, voice unavailable): that grant's spend would have no bound there.

All three belong to the owner's batch, never to this change. The contract is amendment A15; where this page and migration 0046 differ, 0046 holds.

**Deploy order, in the owner's batch.** Each step needs the one before it, and turning it off goes back in reverse:
1. deploy the media bridge and the Studio built from this change: a bridge from before it would take a grant's assignment and connect with no bound, where this one declines it while `SOPHIA_VOICE_EVIDENCE` is off;
2. apply 0046;
3. `SOPHIA_VOICE_QUALIFICATION=on` on the API: its readiness needs 0046's functions (`VOICE_SCHEMA`), and from then on assignments name a grant, which the bridge declines;
4. `SOPHIA_VOICE_EVIDENCE=on` on the bridge: it reserves and records against the API's routes, which step 3 registered.

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
- **Retention:** evidence rows expire 24 h after they are written, and expired rows are deleted (`sophia.voice_evidence_expire()`) by the worker's periodic pass (`dispatchOnce`, at least every 2 s, on the worker's login), whatever `SOPHIA_VOICE_QUALIFICATION` says and whether or not a bridge reports; the guard deletes them too. Nothing else of 0046 expires: the exchanges' counters and the connections' charges are the durable bound and the audit of what a grant spent, the recorded calls are the canonical join from a task to its exchange, and the grants are the operator's record. None of them holds speech, a digest or a timing of anyone's input.
- **No credential appears** in a receipt, a log or an API answer.

## The gate (I0)

**The grant.** `sophia.voice_qualification_grants` holds one operator grant per project at a time. It is created only through the migration owner's `sophia.voice_qualification_grant(project, principal, run_binding_sha256, approval_ref, max_exchange_seconds, max_provider_connections, max_usage_tokens, ttl_seconds)`. No member and no service role may call it.

| Field | Meaning |
|---|---|
| `principal_actor_id` | the synthetic account. It must be an active editor or admin of the project (Create needs editor). |
| `run_binding_sha256` | the Lab run's binding hash (`test_run_id`, `cleanup_obligation_id`, scenario). It is not secret, and the product never sees what it hashes. |
| `approval_ref` | the owner's approval it rests on. |
| `max_exchange_seconds` (60–1800) | the hard length of an exchange opened under the grant. |
| `max_provider_connections` (1–10) | the provider connections the exchange may open, the first one included, whichever bridge session or process opens them; a reservation past it is refused, and the exchange ends. |
| `max_turns` (1–200) | the provider generations, whatever started them, counted as they are reserved; the last one allowed runs to its end, and the next is refused, which ends the exchange (one started unasked past it ends it too). |
| `max_output_tokens_per_turn` (64–8,192) | one generation's output cap; the bridge sets it as the session's `maxOutputTokens` and cuts a generation that passes it. |
| `max_usage_tokens` (1,000–5,000,000) | what the exchange may have cost: for each reserved connection, the greater of what was charged to it (each generation it started, at its worst case) and what the provider reported of it (`usageMetadata.totalTokenCount`, cumulative per provider session), summed. The exchange ends once that sum, plus the latest connection's last prompt size (the context the next generation bills again) and one generation's output cap, would reach it; a generation is refused when, with its charge, that would reach it, so a generation granted is never cut for usage. |
| `expires_at` | the grant's end: at most 2 h after it is made. |
| `revoked_at`, `revoke_reason` | `sophia.voice_qualification_revoke(project, grant, reason)`, owner only. |

**Which exchanges a grant covers.** An exchange is under a grant when it is in the grant's project and was opened while the grant was active, that is, before it expired or was revoked. A grant never covers an exchange opened before it.

**The durable bound (server-side).** The bound is the exchange's, held by the API, never a bridge session's: a session that replaces a lost one, or a restarted bridge, starts from the exchange's true counts. Under a grant, the bridge reserves before it spends, through `POST /v1/media/qualification-reserve` (`sophia.media_voice_reserve`, under the exchange's row lock):
- `connection`, before it opens a provider connection: refused past `max_provider_connections`; otherwise the connection's durable ordinal, which its receipts name;
- `generation`, before it sends what can start one, on a reserved connection, with a charge: refused past `max_turns`, or when, charged, the exchange's next turn could pass `max_usage_tokens` (the guard's own rule below). So the guard never cuts a generation it granted;
- `unasked`, when a generation nobody asked for started (its output arrived while no generation was paid for, a reservation still in flight included): it is already spent, so it is counted and charged whatever the limits, and the exchange ends if they are now reached;
- `spend`, a top-up of a reserved connection's input allowance, before the bridge sends input the allowance does not cover (below): a charge only, which counts no generation and opens no ordinal. It fits by the generation's budget rule alone (refused when, charged, the exchange's next turn could reach `max_usage_tokens`), and a refusal ends the exchange (`usage`) as the others do;
- `stop`, when the bridge's own bound (or the deadline) stopped the session: it reserves and records nothing, is sent whoever holds the floor, and ends the exchange (`bridge`), once; an exchange already ended answers it the same.

The charge is the bridge's worst case for the generation (the context again and its output twice), with the text it sends (a tool response, a notice, a typed message) and, for the generation input asks for, what fills the connection's input allowance; a top-up's charge is what fills it again. Connections and generations (`turns`) are durable counters only a reservation adds to; each connection keeps what was charged to it and what the provider reported of it.

**Charge ahead.** What the bridge sends is paid for on the API before it is sent, never after (Codex P1 on PR #190: input folded into the next charge was lost with a process that died before it, and a restart reserved against a total that lacked it). Each provider connection holds an input allowance prepaid on the API:
- the generation input asks for fills it up to 4,000 tokens: about 95 s of speech with its transcription, or about 13 s with a camera frame each second, so most spoken turns never top up;
- each 100 ms chunk of audio takes its tokens (32 a second) and its transcription's (10 a second: 30 characters, about twice a fast speaker), each frame 258, and Sophia's words their tokens. The holder's transcription follows audio already sent, so it is paid with that audio; what the provider transcribes beyond it comes out of the allowance;
- a chunk the allowance does not cover waits (as for a generation's reservation, in order, behind the speaker's chunks already waiting) while a `spend` top-up fills it again; a frame it does not cover is dropped and counted (`qualification.frame_dropped`), never sent unpaid, and a top-up is asked for so a later frame may go; a debt (a transcription past what was prepaid) is topped up at once. A top-up refused stops the session, whoever was waiting.

So at every instant the exchange's committed amount is at least what every process has sent: a crash loses only allowance already paid for, never spend nobody paid for, and a replacing session or a restarted bridge reserves against a total that holds all of it. A leftover allowance is forfeit with its connection; the API may hold at most one allowance per connection more than was spent, which only ends an exchange earlier. None of this relies on the provider's usage reports, which reach the API only in receipts recorded while the principal holds the floor. A reservation that does not fit ends the exchange as the guard would, with its reason, and so does a limit the guard would end it at. An exchange that has ended reserves nothing (409). A receipt names only a reserved connection (otherwise 422).

**The guard (server-side, Lab-independent).** `sophia.voice_qualification_guard()` runs in the API's write transaction on every bridge presence report (every 5 s while the bridge is in the room) and every assignment poll; every evidence write and every reservation checks the same limits for its own exchange alone, under its locks. It ends an exchange under a grant, as End would (ended_by null, event `room.exchange_qualification_limit`), at the first of these:
- `now ≥ least(expires_at, opened_at + max_exchange_seconds)` (`deadline`, or `expired`);
- the grant is revoked (`revoked`);
- connections reserved exceed `max_provider_connections` (`connections`);
- generations reserved pass `max_turns` (`turns`; only one started unasked takes them there);
- the next generation could pass `max_usage_tokens` (`usage`, the rule above).

A bridge whose own bound stopped its session (its `session_closed` receipt says `guard`) ends the exchange too (`bridge`), for good.

**Locks.** A reservation, a receipt and the guard lock an exchange's project before the exchange, as `control_exchange` and every other writer do (0003): ending an exchange emits the project's event, so taking the exchange first was a deadlock against a member's control of it, and a receipt that ran the guard for every exchange while holding its own was a deadlock against another exchange's receipt. The guard skips a project or an exchange another transaction holds, never waiting on it, in a fixed order (project, exchange); that transaction checks its own exchange under its locks, and the guard's next run takes up what is left. Skipping is what keeps the guard out of a deadlock; the order only makes its locks predictable.

It writes a `guard` receipt (service, seq 0) with the reason. The guard runs only in an API with voice qualification on. Ending the exchange removes it from the bridge's assignments: the bridge's long poll wakes on the event, and its session closes, including the Gemini connection. **If the Lab dies, the exchange still ends at its deadline.** The bridge also stops forwarding input at the deadline itself (defence in depth).

**The binding.** Every receipt carries `grantId` and `runBindingSha256`. The Lab checks the hash equals its own run's binding: a receipt from another run, grant or project is a mismatch, and the harness fails.

## Bridge receipts (I1–I5), over `POST /v1/media/evidence`

**Recording conditions.** The bridge records only while all of these hold:
- `SOPHIA_VOICE_EVIDENCE` is `on` (default off: `off`, unset or empty; any other value stops the bridge's start, and `bridge.start` logs `voiceEvidence`);
- the assignment carries `qualification`, naming the same grant;
- the floor holder (the assignment's `inputActorId`) is the grant's `principalActorId`.

An input window opens only for the principal's own forwarded audio; the provider's phases are recorded only while the principal holds the floor. A reply opens, and a tool call or a response counts, only while the principal holds the floor and the generation answers them, as it was asked for, fixed when its first output arrives. A tool response's continuation answers the speaker of the calls. A result notice answers no one. Any other generation answers the floor's attribution (ExchangeState: the holder whose forwarded audio or typed message started it). Sophia's answer to another member is never recorded, even when the floor moves to the principal while it still arrives (the move takes effect at the turn's end), and even when the principal's open microphone is forwarded before the continuation of that member's tool round. A notice is never recorded either, and a reply that began unrecorded stays so to its end. What opened under the principal ends with its own receipt, whatever ends it (a handoff ends its window; a reply to the principal still playing after the floor moved ends with its receipt). Nothing is recorded of a session the principal never held the floor in, not even its close. Off, or without a grant, the bridge sends the API and the provider exactly what it sent before.

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
| `provider` | setup (as each connection opens), ready, recovering or unavailable (a connection lost or replaced), closed (the session closes); usage (a connection's reported total grew) | phase, providerSession (a UUID per provider session; a resumed connection keeps it), connection (the durable ordinal its reservation returned), resumed, model, instructionSha256, bridgeCommit (or null), connectionsOpened (the highest ordinal this session holds), turns (provider generations this session saw end: completed, cut by barge-in, or lost after output), usageTokens (this connection's highest `usageMetadata.totalTokenCount`, or null), lastPromptTokens (its newest `promptTokenCount`, or null). The API keeps usageTokens and lastPromptTokens as that connection's; its own counts are the reservations'. |
| `output_reply` | a reply ends: played out, or cut | replyOrdinal, turnOrdinal, providerSession, connection, receivedAtMs, firstPlayedAtMs, endedAtMs, terminal (`played`, `stopped`, `interrupted`, `recovered`, `closed`), samplesReceived, framesPlayed, nonSilentFramesPlayed (a nonzero sample), rms, peak (of the frames played), durationMs (framesPlayed × 20), playedDigestAlgorithm=`sha-256-chain-v1`, playedSha256Chain (over the 20 ms frames handed to the room track) |
| `session_closed` | the session closes, or the bridge's bound stops it; recorded when anything of the session was | providerClosed, windows, turns (provider generations), replies and toolCalls (of the principal's turns), typedMessages (while the principal held the floor), transcriptRetained=false, reason: `ended` (the exchange ended or moved away, the API's guard said so, or the bridge stopped), `lost` (the room was lost), `guard` (the bridge's own bound or the deadline) |
| `guard` | written by the API when the guard or a refused reservation ends an exchange, or a bridge's own stop does | reason (`deadline`, `expired`, `revoked`, `connections`, `turns`, `usage`, `bridge`) |

**The bridge's bound** (`qualification.ts`: `qualification-ledger.ts` for the API's reservations, `qualification-reserve.ts` for its own first check). A session under a grant, with `SOPHIA_VOICE_EVIDENCE=on`, holds itself to the grant whoever holds the floor (it records nothing for this):
- the provider's setup carries `maxOutputTokens` = `maxOutputTokensPerTurn` (only under a grant; otherwise it names no cap);
- every spend is first checked in the bridge, at once and without the network (a refusal there never waits on the API), then reserved on the API (the durable bound above): a provider connection before it opens (the first, a reconnection, a replacing session's, a restarted bridge's); a generation before what can start one is sent (the first input after a turn ended, a tool response, a notice, a typed message); a generation that starts unasked (a WHEN_IDLE continuation, a second tool round) as its output arrives; input before it is sent, from the connection's prepaid allowance (charge ahead, above);
- while a generation is being reserved, or the allowance topped up, the holder's input waits (at most 5 s of it, the oldest dropped first) and goes on in order once granted; a tool response, a notice or a typed message is sent once granted, if it still may be; a frame is dropped and counted;
- an answer refused (4xx) or missing after three attempts (after 0.25 and 1 s, each with 3 s to answer) is a refusal (`unconfirmed`): the bridge fails closed;
- audio, frames and text sent, transcription received and usage reported are counted. A generation whose output passes the per-turn cap is cut;
- the `deadline` is checked on every tick (100 ms) and before anything is sent.

When the bound says stop (`usage`, `turns`, `connections`, `output`, `deadline`, a guard reason from the API, or `unconfirmed`):
- the bridge sends nothing more to the provider and closes it for good;
- it stops what is playing, and reports Sophia unavailable with the reason;
- it tells the API (`stop`), which ends the exchange (`bridge`) if a refusal had not already, whoever holds the floor and whether or not anything was recorded;
- while the principal holds the floor, it records the provider's close and `session_closed` (`guard`), which ends the exchange the same way.

Nothing of this runs without a grant: an exchange under none waits on no reservation. The bound is conservative: a tool response's reserve and its continuation's each count, and a reservation whose answer was lost and is asked again may count twice; either only ends an exchange earlier.

**`sha-256-chain-v1`** is the Lab's own algorithm. Start from 32 zero bytes; for each frame `i` from 1: `chain = sha256(chain ‖ sha256(frame bytes) ‖ uint32be(i))`. A frame's bytes are its 16-bit samples, little-endian: on input, each 100 ms chunk forwarded (1,600 samples at 16 kHz); on output, each 20 ms frame played (480 samples at 24 kHz). A window or reply with no frame has the 32 zero bytes.

On this transport the chain covers **the PCM the bridge forwarded or played**. It is **never** comparable to the Lab's source WAV or the browser's frames: the Opus path is lossy, and the input is resampled. The Lab reconciles input by ordinal and envelope only (`pcm_reconciliation: envelope_only`), and must not compare chains for equality.

**Reading them.** `GET /api/v1/exchanges/{exchangeId}/qualification-evidence` is answered only to the grant's principal, with their own JWT. It returns the one grant covering the exchange (its limits and deadline; the connections and generations reserved; usageTokens, what the provider reported, each connection's highest report, summed; committedTokens, what the exchange may have cost, the figure the budget holds; the latest connection's last prompt size; why it ended) and the receipts kept, bridge receipts in `seq` order then the service's guard receipt. Anyone else, or an exchange under no grant, gets 422 `not_found`, as the API's other reads do. An API with voice qualification off does not serve the route.

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
- A provider call id reused for another call (another tool, or another input epoch, under the same key) is refused before anything runs: the call is answered `refused`, `not_started:idempotency_conflict`, nothing is admitted, and the call that holds the key keeps what it recorded. Run unrecorded, its command would link to that call.
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

It is also `null` for a call not answered yet (`answeredAt: null`), since whatever it admits may not have committed.

**End is a durable boundary for the calls.** The service records a call under the exchange's project lock and its row lock (the project, then the exchange, as End takes them), reading the exchange's state under them and holding both until it commits. An End and a recording therefore serialize:
- A recording that passed its checks first makes End wait. The call is listed after End, unanswered until the API answers it.
- A recording after End is refused (40001) and nothing is listed.

So once End has committed, no call can still appear. The API's answer (`media_answer_live_call`) only marks a recorded call answered: it reads no state and takes no lock of the exchange, so a call recorded before End is still answered after it. A replayed call stays the one entry it was. Another member's calls and another exchange's calls are never listed. An exchange outside the caller's projects is 422 `not_found`, and an id that is not a lowercase canonical UUID is 422 `invalid_request`.

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

**What a withdrawal reached.** With voice qualification on, the detail of a research, design or review task (`GET /api/v1/projects/{projectId}/native-tasks/{taskId}`) carries `withdrawnSourceIds`: the sources its attempt drew on that are withdrawn now, in order (`task_withdrawn_sources`, 0046). It is omitted for any other kind of task and with voice qualification off, and it is not on the snapshot. A task outside the caller's projects is 422 `not_found`.
- The set is the attempt's consumed closure (`attempt_consumed_sources`, 0033), the very closure a withdrawal revokes work by (`research_revoke_source`, 0028; `design_revoke_source`, 0041), less every source in it that is still an eligible, ready project source. For a research task it is its manifest: question, inputs, base, and what they drew on. For a design or an edit it is the report version it lays out, and through it the research that wrote it, with that research's inputs.
- A mission note's version is a source. `record_note` writes the note's text as a source (`put_text_source`), and the member's own receipt (`POST /api/v1/projects/{projectId}/mission/entries`, operation `record_note`) names it as `sourceId`, which is the entry's `source_id`. `start_research` with `inputSourceIds: [sourceId]` makes it an input of the research manifest (`source_dependencies`), so the closure of the research, and of every design of its report, holds it. A correction is a new version that depends on the old one. Forgetting the note (`withdraw_note`, preview then withdrawal) erases every version in its reach (`mission_erase_source`: not eligible, state deleted), and its receipt names the note's `sourceId`. The voice tool `record_mission_note` answers the model only the entry's id, never a `sourceId`.
- It is computed live, never stored. A task that had ended before the withdrawal lists the source as well: it proves what the task drew on, not what ended it. The Lab matches its note's `sourceId` against it, and also reads that the task was live just before the withdrawal and failed with the revocation's reason after it.
- What a withdrawal ends: only work still under way. A research task pending or running is revoked and rebuilt without the source; a design, an edit or a review under way fails with the reason `revoked: a source the report drew on was withdrawn` (its attempt `revoked`) and its session is stopped. A published design, the report's published versions, and a research task that already finished are untouched. A task already Stopped (cancelled) is not ended again: after Stop there is nothing left to end.

**The G7 episode's lifecycle, as the product runs it** (observed on real PostgreSQL through the API's routes, `apps/api/src/voice-episode.db.test.ts`, no provider; states verbatim):
1. The principal records note N through their own route: receipt `record_note`, `sourceId` S.
2. `start_research` by voice (guide v1.3, `outputs: ['markdown','html']`, `inputSourceIds: [S]`): the call lists `native_task` with the research task R, answered `admitted`; R names the exchange. Once R's report publishes (version 1), R reads `result_ready` with `research.html: {state: 'designing', designTaskId: D}`. D is the first design: `design.state: 'designing'`, mode `create`, `design.researchTaskId: R`, phase `running`, and the goal is `running` with only the design under way. D names no exchange: it was created by the publication, and it is joined through R.
3. Hold by voice on D (R's goal): the call lists `hold`, answered `ok`; the goal is `holding`, then `held` once the runtime has checked the native stops, which go to both the design's session and the research's. D reads phase `held`, still `designing`. Resume: the call lists `resume`, answered `ok`; the goal is `running` at once, and D reads phase `running` once the resumes are delivered, again to both sessions.
4. There is no edit while the first design is live: `revise_html_page` is refused with `not_started:no_html_page` ("That report has no designed HTML page to revise."), because the page exists only once D publishes. D publishes the page as version 2 (`self_review_only` without a reviewer): D is `published` and the goal is `completed`, with nothing under way.
5. The edit, by voice (`revise_html_page` on R, sections `['s2']`): answered `admitted` with its task X. The call lists `native_task` with X, and X names the exchange: the edit's design task, inserted under the call's key in the transaction the API marked for that call, links the call to X's command (`live_call_design_edit`), as a command under the call's key does. A member's own edit, under any key, links to no call. X is a design in mode `edit`, `designing`, phase `running`, on the same goal, which is `running` again. X has `design.researchTaskId: R`, and its actor is the principal. There is one design of a page at a time: another edit is refused with `not_started:invalid_state` ("A design of this page is already under way"). So the first design and an edit are never live together. At the withdrawal, the live design the episode can have is either D (but then the page never publishes, and Create shows no page) or X after D published. The episode uses X.
6. N forgotten while X is live: the receipt is `withdraw_note`, with `sourceId` S. X reads phase `failed`, reason `revoked: a source the report drew on was withdrawn`, `design.state: 'failed'`, `withdrawnSourceIds: [S]` (the attempt is `revoked`). R stays `result_ready`, D stays `published`, and the goal is `completed` at once, with nothing under way. One native stop for X's session follows; checking it changes nothing more.
7. Stop by voice on X after that is refused: `not_applied:ended_without_report` ("Not applied. This work ended without a result; the report is still at version 1. Nothing was changed and nothing is waiting."). Underneath, the goal is `completed`: the principal's own Stop through `POST /api/v1/projects/{projectId}/commands` is 409 `invalid_state`, "Goal already terminal or stopping". The call lists no command (answered `refused`), and X and the goal are unchanged.
8. The Stop sub-episode, a second research by voice on a new question, so a new goal:
   - Pending: phase `queued`, goal `ready`. Stop by voice is listed as `stop`, answered `ok`; the goal is `stopping`, then `stopped`. The job is `cancelled`, reason `stopped`, phase `stopped`, and no native stop was needed, since no session was started.
   - Running (its create delivered): phase `running`, goal `running`. Stop is listed as `stop`, answered `ok`; the goal is `stopping`, then, once its one native stop is checked, `stopped`. The job is `cancelled`, reason `stopped`.

   Each of these research tasks names the exchange, and each Stop is its own call with its own command.

**The G7 order the product supports**, then:
1. note;
2. Create with HTML, drawing on it, with Hold and Resume while its design runs;
3. the page published;
4. an edit by voice;
5. the note forgotten, which ends the edit;
6. Stop on a separate, voice-created research while it is pending or running.

A Stop on the withdrawn goal is refused and certifies nothing.

What proves each effect:
- **The withdrawal.** X read before (phase `running`, `design.state: 'designing'`) and after (phase `failed`, exactly the revocation's reason, `withdrawnSourceIds` holding the note's `sourceId`), together with the `withdraw_note` receipt. No call admitted a stop between the two reads.
- **Stop.** Its call's `stop` command on the sub-episode's goal, then the goal `stopped` and the task's phase `stopped` (job `cancelled`, reason `stopped`).
- **Telling them apart.** An end by Stop is phase `stopped` with reason `stopped`; an end by withdrawal is phase `failed` with the revocation's reason. A Stop on work that had already ended admits no command.

All of these are read by the principal through the member API (snapshot, native tasks, the exchange's calls, artifacts, live presence, evidence).

**Status codes the Lab must expect** (this API's convention for every member read):
- an object that is missing, or not the caller's, is 422 with `{code: 'not_found'}`;
- a route the API does not serve (voice qualification off) is 404;
- 401 and 403 are authentication and authorization.

## Not verified here

- That Gemini Live's `usageMetadata.totalTokenCount` is cumulative per provider session, as this contract and the bound assume. No provider call was made. If it is per turn, `usageTokens` under-reports; the durable bound still holds each connection at no less than what was charged to it (each generation at its worst case), and the turn, connection and per-turn output limits and the deadline hold either way.
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
