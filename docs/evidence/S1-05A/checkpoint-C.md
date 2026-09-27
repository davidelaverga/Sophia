# S1-05A checkpoint C: the room media bridge and a truthful room

**Recorded:** 2026-09-25, S1-05A attempt 1 (Claude Code). **Base:** checkpoint B on `studio/qol@29a570c3`. Everything here ran in this container on Node 24.21.0, pnpm 11.7.0, PostgreSQL 16.13 and the pinned `livekit/livekit-server:v1.13.7` image. **No Gemini key and no owner allowance were present. Google was never called: every Gemini Live connection below is a labelled fake (`FakeLive`). None of this is live-model or two-human evidence (cases A05 and A06 stay open).**

## What now works

- **Exchange ≠ room** (amendment A06, migration 0013). Joining the LiveKit room starts nothing. A member explicitly asks Sophia in (`POST /api/v1/rooms/{roomId}/exchanges`). The exchange has its own lifecycle (open, paused for a guest or a departed holder, ended) and three epochs that only move forward:
  - **input:** who may address her. It reuses the amendment A01 floor.
  - **playback:** Stop Speaking.
  - **observation:** Show Sophia this and Stop Looking.

  The controls are End, Stop speaking, look, Stop looking and Resume. None of them touches work. Opening and resuming refuse while trusted LiveKit presence lists a guest, or while presence cannot be read.
- **Four things kept apart.**

  | What | Where it lives | Who may |
  |---|---|---|
  | Room speech | LiveKit | Every member; viewers now publish (amendment A06, flagged for Luis) |
  | AI input | The floor holder's microphone only, bound to an input epoch | The floor holder |
  | Work authority | Checked per tool call under the speaker's own role | Editors and admins; a viewer's `start_brief` is refused |
  | Guest access | The lobby | Guests never hold the floor or reach project reads |
- **The media bridge** (`apps/media-bridge`): raw LiveKit RTC (`@livekit/rtc-node` 1.1.0) ↔ Gemini Live (`@google/genai` 2.24.0, Gemini API, `gemini-3.8-live`, explicit config; see [SOURCE_MAP §2b](../../SOURCE_MAP.md)). One session per exchange, driven by assignments the API long-polls to it.
  - **Input.** Only members' microphones are subscribed: never a guest's, never screen audio. The SDK resamples them to 16 kHz mono. Only the admitted holder's audio is forwarded, and only while the provider is ready, the exchange is open, no guest is present and no handoff is settling. A handoff ends the old stream (`audioStreamEnd`) and waits for the old turn to finish, up to 1.5 s, then cancels it.
  - **Output.** One `AudioSource(24000,1,200)` track, fed with backpressure. Stop Speaking and barge-in move the playback generation, call `clearQueue()` and drop the rest of the interrupted turn. Output at any other rate or format is refused, never relabelled.
  - **Tools.** Only the four implemented tools are declared, all NON_BLOCKING: `project_status`, `read_selected_source`, `start_brief` and `control_work`. Each call is bound to the input epoch whose audio the turn answered, and the API acts for that speaker under their own role. A call that cannot be attributed, or that arrives while paused, gets a question back and is never executed. A call from a replaced connection is never answered. Idempotency keys include a connection generation that stays unique across bridge restarts.
  - **Vision.** Only the source a member chose is subscribed. At most one still a second, latest only, epoch-checked at send, downscaled and JPEG-encoded.
  - **Recovery.** On GoAway or a close, stale output stops. The next connection resumes with the latest handle once it is ready. A handle that fails twice is dropped, and the cold start says so in its instructions. Repeated failure reports `unavailable`.
  - **Guests.** A guest, or anyone whose standing the API did not sign, pauses input and output locally at once. The API is told through presence and pauses the exchange. The bridge acknowledges a quiesce request only after it has actually closed input and cleared output.
  - **Holder departure.** Reported `left` at once, which pauses the exchange. If the holder is still gone after 5 s, `gone` clears the floor by compare-and-set in the database. A holder who returns within the grace does not silently reopen listening: Resume is explicit.
  - **Results.** A finished brief is announced once, as an unattributed system turn, when Sophia is idle and the room is member-only. It is recorded so it is not announced again.
  - **Observed state.** Published as `sophia.*` participant attributes (no content) and as presence to the API. The API's snapshot shows voice as `unavailable` after 20 s without a report.
- **Guest quiescence** (case A12, first half): a guest's room token is issued only after the bridge's acknowledgement, or when the LiveKit server itself shows no `sophia` participant. If neither can be confirmed, the guest waits (503): a token is never issued on the assumption that Sophia is muted.
- **Rehearsal for development:** `SOPHIA_LIVE_MODE=rehearse`, which `pnpm dev -- --voice rehearse` sets, replaces Gemini with a labelled stand-in (`rehearsal.ts`). It makes no Google call and needs no key, so the real room path can be exercised locally. `--voice live` uses Gemini with the developer's own key. `SOPHIA_DEV_DATABASE_URL` lets the synthetic backend use a PostgreSQL that is already running.
- **Studio:** the light and Sophia's line come from `sophia-view.ts`, a pure projection of what is observed:
  - the snapshot's exchange and voice;
  - the bridge's attributes;
  - whether her sound actually reaches this browser: her track subscribed, LiveKit hearing her, and autoplay not blocked. "Allow audio" appears when the browser blocks it.

  The light listens only while the bridge says the holder's audio is admitted, and speaks only while she is audible here. It is never set from the room merely being live (the old `mode={live ? 'listen' : 'rest'}` is gone). The dock asks her in and offers Stop speaking, Show Sophia your screen/camera, Stop looking, Resume and End. The observation indicator shows in the dock and in the mini dock on every view. Reduced motion and the no-WebGL fallback are the light's existing ones, and the status text stays in the `aria-live` line.

## Commands and results

| Command | Result |
|---|---|
| `node --test apps/media-bridge/src/*.test.ts` | 59 pass, 1 skipped: the real-LiveKit test (it needs `SOPHIA_TEST_LIVEKIT_URL`). The suite covers exchange model, audio framing, message dispatch, tool surface, vision, service client, assignment loop, and 31 RoomSession cases against labelled fakes |
| `pnpm test:livekit` | 1/1 against the real `livekit-server:v1.13.7` container with real rtc-node participants (an editor and a guest). Covered: the bridge lists both with their signed standing and excludes itself; the editor's 48 kHz stereo mic arrives at the bridge as 16 kHz mono; the guest's mic is never received; no screen is received before it is chosen; the editor hears Sophia's published track; the editor sees her attributes; the chosen screen arrives, and stops arriving after `watch(null)` |
| `SOPHIA_DISPOSABLE_DATABASE_URL=… node --test apps/api/src/media.db.test.ts` | 10/10: the real MediaBridge, RoomSession and HTTP client against the real API and PostgreSQL (LiveKit and Google faked) |
| `pnpm test:db` | 119 pass. That is the 100 from checkpoint B, plus 9 in `packages/persistence/src/exchange.db.test.ts` and 10 in `apps/api/src/media.db.test.ts`; `room.db.test.ts` and `rooms.db.test.ts` have 3 expectations changed by amendment A06 |
| `pnpm test:sql` | 13 migrations and the pack's SQL test pass |
| `pnpm test` | 189 pass (Studio voice suite: 19, including the new `sophia-view.test.ts`) |
| `pnpm check` | see the section below |

The `media.db.test.ts` crossing covers:
- capability-only media routes;
- an exchange refused when presence is unreadable;
- the bridge joining, and the snapshot turning `ready` only after the (fake) provider is ready;
- only the holder's audio forwarded;
- a spoken `start_brief` admitted once, for the holder, with a replayed call id admitting nothing new;
- an unbound speaker asked rather than acted for;
- Stop Speaking over HTTP reaching the bridge through the long poll and clearing output;
- a viewer holding the floor and reading status, with their brief refused;
- a guest's token issued only after the bridge acknowledged, and 503 without it;
- Resume refused while the guest is present and accepted after;
- holder departure pausing at once and clearing the floor only after the grace.

**One defect this crossing caught:** the bridge's room token carried an extra `roomId`, and the `MediaRoomToken` response schema refused every assignment once LiveKit was configured. The route now returns exactly the contract's fields.

## The room in a browser (REHEARSAL: no Google)

The dev stack, running on the local PostgreSQL:

`SOPHIA_DEV_DATABASE_URL=… node scripts/dev-stack.ts --voice rehearse`

It ran the real API, worker, LiveKit container, media bridge and Studio. The one exception is the bridge's Live connection, which was `rehearsal.ts`: no Google call and no key. It reports ready and answers held-floor audio with a short chime.

Two Chromium contexts played the synthetic founders, Luis and Davide, with fake microphone and camera devices (Playwright, headless). What Sophia's line said at each step:

| Step | Luis | Davide |
|---|---|---|
| Before joining | "The room is ready" | |
| Joined, no exchange | "You have the floor" / "The floor is open" | |
| Luis presses **Speak with Sophia** | "Sophia is listening to you" | "Sophia is listening to Luis" |
| The chime reaches Davide's browser | | "Sophia is speaking", with Stop speaking offered |
| Stop speaking | back to "listening to you" | |
| End | "You have the floor" | |

A second run showed the observation indicator. Luis turned on his camera, pressed **Show Sophia your camera**, and "Sophia sees your camera" appeared in the dock. It stayed in the mini dock on the Goals view, and Stop looking removed it.

Screenshots are in [`rehearsal/`](rehearsal/). This proves the room's wiring and that the UI tells the truth about it. It is not evidence that Sophia hears or understands anyone.

The run found one layout defect, which came from my checkpoint B Converse lens. The lens body grew up over Sophia's line and hid the work note. The lens body now sits between the line and the dock, the empty "Nothing said here yet." is gone, and a long discussion scrolls inside the body.

## Mutation checks (each guarantee weakened once, then restored byte for byte)

| Mutation | Caught by |
|---|---|
| any member's audio forwarded, not only the holder's | 2 tests |
| Stop Speaking ignored by the session | 1 test |
| a timed-out handoff settle does not cancel the old turn | 1 test |
| an unattributed tool call executed as some member | 2 tests |
| a guest in the room not paused locally | 3 tests |
| a quiesce acknowledged without the pause applied | first **not caught**; added "never acknowledges a quiesce request while the exchange is open"; now 1 test |
| a slow result of a replaced connection answered on the new one | first **not caught**; added "a slow result for a call of the old connection is never answered on the new one"; now 1 test |
| the result notice attributed to the last holder | 1 test |
| holder `gone` sent without the 5 s grace | 1 test |

## Acceptance cases touched (see [progress](../../progress/S1-05A.md))

| Case | What this checkpoint shows |
|---|---|
| A05, A06 | **Pending.** The mechanics are proven against fakes; the real run needs an owner allowance, a Gemini key and LiveKit credentials on an authorized host. A06's "admitted once" and "surfaced once" are met against the fakes and the real API |
| A09 | Stop Speaking clears output and drops the rest of the turn; End closes the session; neither touches work. Met locally (fakes and the real API) |
| A10 | The utterance keeps its actor across a handoff; an unbound speaker is asked; a stale holder event is refused by compare-and-set. Met locally |
| A11 | Only the chosen source is subscribed and sampled; Stop Looking fences frames by epoch. The real LiveKit test shows an unchosen screen never arrives. "After reconnect" is covered because epochs come from the API on every assignment. The real-model discussion of a screen is pending |
| A12 | The first half is met locally: guest admission waits for the bridge's acknowledgement or trusted absence, and a guest pauses the exchange. Removal reconciliation is checkpoint D |
| A13 | A viewer holds the floor and reads status, and their `start_brief` is refused. Met locally |
| A14 | The Google half against fakes: GoAway and close recover with the handle, answer no stale call, and admit nothing twice |
| A15 | The light and line projection is unit-tested, and rendered in a browser with the rehearsal bridge: listening, speaking only once her sound reaches the browser, Stop speaking and the observation indicator. A real microphone, provider and playback failure on real devices is part of the live run |

## Decisions for review (Luis)

- **Viewers publish and may hold the floor (amendment A06).** Talking with Sophia is not a work grant; work still needs an editor. The following changed: `rooms.ts` (`canPublish` true for viewers), `transfer_input_floor`, `room-view.ts` (`listensOnly` removed, viewers can take and receive the floor), and the test expectations marked "Changed by amendment A06".
- The exchange is separate from the floor. Amendment A01's `transferInputFloor` is reused, and with an exchange live a transfer also moves the input epoch.
- A participant whose standing the API did not sign counts as a guest, at the bridge, in the database's presence and in the exchange routes.
- Sophia's line now counts background tasks with goals ("Working on N tasks…").
