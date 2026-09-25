# S1-05A — Make the shared room a real Sophia conversation with durable work

**Version:** 1.0 · **Prepared:** 25 September 2026 · **Implementation state:** not started.

**Human goal owner:** Davide. **Implementation lead:** Claude Code under Davide's existing development authority. **Integration/UX reviewer:** Luis. **Operations executor:** separately initialized Codex, only for explicitly authorized hosted operations.

**Target:** `https://github.com/davidelaverga/Sophia`. **Inspected integrated baseline:** `studio/qol@29a570c33feb97a6bc04ea357c84087a47c9b055`. **Inspected main:** `01d9117bdcf9ec8ee18cd5414aa08ee4f24265a3`. Reconcile newer changes before editing; never start from old main and reconstruct Luis's stack manually.

## 1. User outcome

Davide and Luis join the existing Studio room, explicitly open an exchange with Sophia, take turns speaking and hear the same real Gemini response. They can share a selected screen with Sophia deliberately. One asks Sophia to draft an implementation brief from the project and two agreed inputs. The request is admitted once and runs on the real configured dsh worker while conversation continues. The returned brief appears in the project and is announced once when appropriate. They can inspect, steer, Hold or Stop the work without confusing those actions with ending speech.

This is a useful, bounded internal product episode. It is not merely a media echo demo and not the full completion of images, prototypes, external engineering, memory or project leadership.

## 2. Original specifications retained and amended

Read the frozen [S1-02](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/docs/pack/delivery/goals/S1-02.md), [S1-03](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/docs/pack/delivery/goals/S1-03.md), [S1-04](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/docs/pack/delivery/goals/S1-04.md), [S1-05](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/docs/pack/delivery/goals/S1-05.md), [voice contract](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/docs/pack/architecture/06_VOICE_AND_VISION.md) and [data/API bindings](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/docs/pack/architecture/12_DATA_AND_API_BINDINGS.md). Read the actual A01–A03 amendments and Luis's S1-04A handoff at the execution checkout.

The exact changes are in [GOAL_SPEC_AMENDMENTS.md](GOAL_SPEC_AMENDMENTS.md). This goal adds the missing integration and a partial S1-05 acceptance episode. It does not rewrite `docs/pack/`, renumber old goals, remove their unmet criteria, or count a fixture run as their live completion.

## 3. Baseline and operating rules

1. Recover current refs, active worktrees, PR bases, checks and owners. Start a dedicated `claude/s1-05a-room-to-work` branch from the agreed cumulative baseline. Preserve Luis's visual/UI work, A01–A03, all applied migrations and the merged runtime recovery fixes.
2. Review/land the existing stack with Luis in dependency order. This spec does not authorize blind merging of drafts. Work may proceed on the dedicated branch while review completes; shared writes must have an explicit owner.
3. Keep Node **24.21.0**, pnpm **11.7.0** and the current runtime unit unless an explicit compatibility change is approved. Use frozen install; refresh recorded digests only for intentional reviewed source/dependency changes.
4. Preserve the current S1-03 development model route. Application model choice is not the coding agent used to implement it. Real paid tests require an explicitly recorded owner allowance and a provider credential on the authorized execution host, never a credential copied into Claude's transcript.
5. No work on old Sophia-Agent, broad schema reset, destructive down-migration, vendor credential import, auto-deploy bypass or unreviewed framework upgrade.
6. Record a single S1-05A goal with checkpoint handoffs. New chats are new attempts, not fresh scope or spending authority.

## 4. Checkpoint A — Reconcile the hosted baseline and contracts

**Claude:** inspect the cumulative diff, existing amendments, runtime protocol, migrations and deployment runbooks. Prepare the integration branch and an exact source/contract crosswalk. Do not change production.

**Codex:** using the operator protocol, inspect the actual API/Studio deployment IDs/commits, migration ledger/checksums, Render branch/auto-deploy mode, LiveKit readiness and necessary owner settings. Start read-only. Luis's report that `29a570c3` and 0009–0011 are deployed is the comparison baseline, not a command to reapply them.

Before any release-related push or merge can trigger a stale deployment, request a bounded operator action to disable the old auto-deploy path or rebind it to the explicitly approved integration source. The target after stack integration is the reviewed main/release commit, not today's old main. Keep auto-deploy off during the alignment release; deploy exact approved commits. Record this as a temporary release procedure, not a new permanent environment policy.

Register new schema and wire changes as reviewed contract amendments after A03, and append new SQL migrations after the actual current ledger. Reserve names/numbers with Luis before parallel authors create them. Do not mutate A01–A03 or migrations 0001–0011 to make hosted state fit.

**Checkpoint evidence:** current source graph; agreed writable scope; actual hosted tuple or explicitly unavailable fields; amendment inventory; operator request/receipt IDs. Unknown settings do not block ordinary local implementation.

## 5. Checkpoint B — Close the real API ↔ dsh boundary

### 5.1 Use the transport the code already implements

The canonical private runtime namespace for this goal is **`/v1/runtime/*`**, matching `packages/dsh-bundle/src/transport.ts`. Public user operations remain under `/api/v1`. Do not duplicate both namespaces or introduce another root agent loop.

Implement these exact server operations:

| Operation | Required behavior |
|---|---|
| `POST /v1/runtime/hello` | Authenticate the registered runtime instance, project, lease, protocol version and runtime unit; return authorized bindings, current authority and replay cursor. |
| `GET /v1/runtime/commands` | Deliver eligible commands after the acknowledged cursor, bounded long poll, preserving per-attempt order. Hold/Stop controls do not wait for a model turn. |
| `POST /v1/runtime/receipts` | Validate and idempotently persist actual native receipt stages; reject foreign binding/session/runtime references. |
| `POST /v1/runtime/observations` | Persist authorized observations and native sequence references once; project event sequence remains its own decimal-string namespace. |
| `POST /v1/runtime/ready` | Record readiness for this instance/lease and any unrecovered bindings. Ready means bridge/service readiness, not complete product readiness. |

Create canonical schemas in the product contract package; the bundle imports/generated-validates them rather than retaining a divergent local copy. Validate responses too, replacing the transport's unchecked type assertion. Keep fixture-service tests, but add tests against the real Fastify application and database.

Machine authentication must be explicit and separate from a Supabase member JWT. Do not add a broad unprotected `/v1/*` exception to the current route-auth checks. A narrowly scoped runtime capability may address only its bound project/attempts. The secret value stays on the service/execution host. Native observations never impersonate a member or grant themselves acceptance.

### 5.2 Reuse existing persistence and cancellation semantics

Implement the actual dispatch worker using the existing outbox/job/attempt/binding records and current lock order. Recheck actor/grant, source eligibility, goal revision, authority epoch, runtime unit and lease at dispatch. An ineligible queued row gets an explicit terminal denial/supersession outcome; it must not remain a repeatedly claimed pending row.

A dispatch whose outcome is uncertain is reconciled, not resent as a fresh prompt. Preserve service-side desired state and native observations separately. The existing journal, queued command ordering, replayed incorporation receipts and stop-settlement fixes must retain their regression tests.

Hold closes work admission/continuation and cancels active native execution while retaining the agreed pending input. Stop fences old work and prevents late completion from publishing or resuming it. Releasing a browser connection or ending voice does neither.

### 5.3 Admit one useful native task through the application

Add a new, explicitly documented product operation:

`POST /api/v1/projects/{projectId}/native-tasks`

This route is **proposed by this goal**, not an already-existing API. Its first supported kind is `draft_brief`. It accepts validated substantive input and expected project state under an idempotency key, derives the actor from authentication, and creates the ordinary goal/attempt/binding/job records atomically. It must not bypass S1-02 with raw seed SQL or a special demo-only execution path.

The initial brief input consists of the current accepted project facts and specifically shared contributions. Construct a small source-bound context manifest for these inputs. No broad personal memory, corpus ingestion, vector index or arbitrary SQL capability is required. Empty or absent facts stay unknown. Mark this as the seed context compiler, not completion of S1-08.

Use the existing scoped role mechanism with only the tools needed for this task. The result is Markdown with: intended outcome, retained decisions, proposed next implementation step, open questions and cited input IDs. Capture it from the actual run, store it as a source-backed result using existing records, and show a result card in the Studio. This is a candidate brief, not an accepted roadmap or proof that implementation is complete.

Wire the designed `submitContribution` route to persist attributed discussion. Discussion never silently starts work. An explicit voice or UI request for the brief uses the new admission service. The same explicit client intent is not admitted twice after retry/reconnect.

**Checkpoint evidence:** real API/database/native-runtime test; authorized and denied cases; one real-model brief without fixture service; correct delivery/incorporation/result states; a local fault-recovery run. Paid evidence remains pending until the owner authorizes it.

## 6. Checkpoint C — Add the real room media bridge

### 6.1 Chosen provider path

Use **Gemini API `gemini-3.8-live`** and the pack's pinned **`@google/genai` 2.24.0**, with **raw LiveKit RTC**. Add the server SDK versions recorded by the source register, verify the actual package APIs, and commit exact dependency pins. Do not add LiveKit Agents as a second project brain, switch to Vertex, or substitute Extended Thinking silently.

Ordinary dialogue uses Live directly. dsh receives bounded delegated work. Expose only implemented tools: project status, eligible selected-source read, brief admission and current work controls. Do not register image, prototype or full technical-lead tools that can only return placeholders.

### 6.2 Exchange and membership are not the same state

Reuse A01 room/floor records and existing token routes. Implement the already-designed exchange-start route and explicit end/stop-speaking/stop-looking controls through reviewed schemas. A room join does not start Google input or recording.

Bind every admitted utterance to project, authenticated member, room/exchange, input epoch and track identity. A model-provided name is not identity. Track handoff settles/cancels the current input generation before the new holder is effective. An older completion retains its original actor or is rejected; it is never reassigned to the new speaker.

Viewer members may publish in the human room and invoke an authorized **read-only** exchange. All work admission and controls independently require the appropriate editor/admin/current grant. Guest identities cannot acquire project-read or work authority.

### 6.3 Guest-safe first behavior

Preserve the guest room feature. Before admitting a guest into a room with a project-aware exchange, quiesce that exchange, stop new Google input, clear queued Sophia output and receive the bridge's stopped-output acknowledgement. Only then issue the guest token. If the bridge is unreachable, do not claim the protected output is muted and issue the token anyway.

While any guest is present/admitted for the current room audience, project-aware Sophia remains paused; human audio/video/screenshare continues. When the room is member-only again, resuming Sophia requires explicit member action. A later guest-safe conversational context is an extension, not a workaround inside this goal.

Never use ordinary LiveKit subscription permission as permission to disclose the entire project's stored context. Use trusted room presence and admission state rather than a client claiming that all guests left.

### 6.4 Media details

- Forward only the admitted member's microphone stream: mono signed 16-bit PCM at 16 kHz. Do not relabel Opus/WebM as PCM.
- Publish one shared Sophia audio track at the provider's declared output rate (initial route 24 kHz mono), with bounded buffering and backpressure. Record interruption-tail observations; do not promise zero latency.
- Stop Speaking/barge-in increments playback generation, clears server/client queues and rejects stale output. It does not cancel the brief job.
- Room camera/screenshare remains for humans by default. “Show Sophia this” explicitly selects a source/track/target. Forward at most the latest frame per second with capture time, observation epoch and source/preview identity where available. Do not forward room screen audio as user instructions.
- Stop Looking fences future frames and related analysis, across reconnect. Exact text/source reads supplement pixels for precise values.
- Process multi-field Google messages without dropping tool calls, cancellations, transcriptions, audio or resumption updates.
- Finish brief-admission tool calls promptly with a real work ID. `scheduling` and `willContinue` remain top-level `FunctionResponse` fields; long results arrive through project events, not an hours-long pending tool call.
- Resume only into a matching eligible room/context scope. Cold rebuild uses current permitted records; reconnect never replays a job-admission effect.

### 6.5 Truthful UI integration

Retain Luis's light engine, typography, layout and dock. Change its production input to an explicit state projection: unavailable, connected/idle, input admitted, responding, actually playing, background work, recovery. Use existing animation names internally where convenient; visible labels must match observed state.

Do not select “listening” merely because the human room is live. Do not select “speaking” from received text while playback failed. Keep demo state controls in development fixtures only. Provide accessible text status and reduced-motion/non-WebGL fallback.

The composer sends a real attributed contribution or retains an explicitly labeled local draft. Local lens switches remain local. The mini dock persists across views. The selected screen/target and its observation indicator remain visible while the user navigates elsewhere.

**Checkpoint evidence:** two independently authenticated humans each receive a coherent audible response; the shared output is one Sophia; floor handoff and selected visual input are real; guest admission/read-only roles are exercised.

## 7. Checkpoint D — Close the existing access and recovery gaps

Extend the current lobby block/remove behavior without rewriting applied migrations. Database denial prevents new joins immediately. Provider removal becomes a durable, retried/reconciled obligation with a visible pending state. Do not treat the removal helper returning false as success, or rely on token expiry to disconnect an existing participant.

On trusted holder departure, stop forwarding immediately and reconcile the current floor. Use a five-second reconnect grace for clearing the holder; a reconnect during it does not silently reopen listening. Clearing is compare-and-set against the old holder/epoch. A stale callback cannot clear a newly transferred floor.

Keep member and guest scopes distinct in snapshot/SSE, transcript/result publication, room admission and model context. Do not put private content in generic presence broadcasts or public coordination messages.

During this goal, full public onboarding remains out of scope. Codex may provision the agreed founder accounts and separately enable the authorized anonymous-guest test route. Do not push local Supabase configuration to hosted or enable public project creation as a side effect of invitations.

## 8. Required acceptance cases

| ID | Case and expected evidence |
|---|---|
| A01 | Current stack baseline and hosted tuple are recorded; no old-branch automatic deployment can replace the approved API. |
| A02 | Actual Fastify/database runtime service exchanges hello/commands/receipts/observations with the real pinned dsh instance; foreign project/lease/unit is refused. |
| A03 | A member submits discussion and explicitly admits one brief task; retries return the same admission. No seed-only task path is used. |
| A04 | A real configured model produces a source-backed brief from the admitted inputs; result and actual usage/model identity are retained. |
| A05 | Davide and Luis each speak to real Gemini in the same room and hear one shared Sophia. Transcription and frame samples are retained only under the test's explicit scope. |
| A06 | A voice request starts the brief once while the participants continue talking. A worker result is surfaced once at an appropriate boundary. |
| A07 | A voice/text steer made during a bounded controlled tool step is delivered and incorporated at the supported native boundary; evidence distinguishes sent, delivered and incorporated. Reuse the actual S1-03 steer harness, not a fake UI receipt. |
| A08 | Hold/Stop during work and delayed provider/native replies cannot restart work or publish a new candidate under the stopped authority. |
| A09 | Stop Speaking clears old output without stopping independent work; End exchange leaves the job and human room intact. |
| A10 | Floor transfer preserves utterance actor; a stale departure or provider result cannot act as the new holder. |
| A11 | An explicitly selected screen is discussed; unselected camera/screen/audio is not forwarded; Stop Looking prevents later frames after reconnect. |
| A12 | Guest admission pauses project-aware AI before guest media access. Guest cannot read project records or admit work. Failed removal stays pending and is reconciled. |
| A13 | Viewer can converse/read permitted state but cannot start/control work or accept decisions. |
| A14 | Forced Google reconnect and one runtime restart preserve admitted work, current authority and result identity without duplicate admission. |
| A15 | UI status/light reflects actual media/work state, including unavailable microphone, provider and playback; development demos are not represented as real behavior. |

Fixture tests are appropriate for rare races and error paths. The positive user episode must use the actual API, database, room, provider and native runtime. Two browser tabs with simulated people do not establish two-human audio. Do not run a long soak, integrate every future creative tool or build a general notification platform as a condition of this goal.

Original S1-03/S1-05 requirements not covered here remain explicitly open. In particular, image/prototype job admission and full creative review remain with S1-06/S1-07/S1-12; S1-05 is not marked fully accepted just because this first integrated slice succeeds.

## 9. Code destinations and reuse

| Destination | Action |
|---|---|
| `packages/contracts/amendments/` and generation inputs | Add reviewed runtime/media/role operations after A03; regenerate OpenAPI/types/validators. Do not hand-edit generated code. |
| `packages/dsh-bundle/src/protocol.ts`, `transport.ts` | Bind canonical schemas and validate both directions; preserve existing semantics/tests. |
| `packages/dsh-bundle/src/` role/tool modules | Add only the brief/context capabilities and current authorization checks needed here. |
| `apps/api/src/routes/runtime/` (new), runtime auth | Implement the real private bridge-service endpoints; explicit machine principal. |
| `apps/api/src/routes/conversations.ts` (new), `native-tasks.ts` (new) | Attributed discussion and typed brief admission using current product records. |
| `apps/api/src/routes/rooms.ts`, `access.ts`, `livekit.ts` | Exchange/media state, viewer separation, guest quiescence and real removal settlement. |
| `packages/persistence/`, `packages/domain/`, append-only `db/migrations/` | Reuse current locking/admission/state patterns; add minimal runtime/exchange delivery state absent today. |
| `apps/worker/src/runtime-dispatch.ts` (new) | Claim/reconcile native deliveries and access-cleanup jobs; no second reasoning loop. |
| `apps/media-bridge/` (new) | RTC/Google connection, input selection, output, tools, vision, resumption and presence projection. |
| `apps/studio/src/features/voice/`, `light/`, project feed/composer | Wire actual state and current commands into Luis's components. |
| `apps/execution-host/` | Connect existing supervisor to service bindings; isolated runtime execution and measured readiness. |
| Tests and `docs/evidence/S1-05A/`, `docs/handoffs/` | Regression/additional cases, source-bound live evidence and staged handoffs. |

Do not create a new project-state database, generic message broker, vendor credential proxy, execution-team product, or alternate voice reasoning layer for this goal.

## 10. Validation and release sequence

From the exact integration checkout, use existing commands:

```bash
pnpm install --frozen-lockfile
pnpm --filter @sophia/contracts generate
pnpm contracts:check
pnpm check
pnpm test:sql
pnpm test:db
```

Run the local Supabase suite through its existing setup; `test:supabase` requires the configured local env. Native/live tests run only with an approved key/allowance on the appropriate host. Do not edit test expectations or record new artifact identities merely to hide a mismatch. A known Windows-only failure is recorded with its actual scope; execute the supported Linux CI path rather than claiming it was fixed.

Claude runs local tests and prepares a candidate PR. Luis reviews shared contracts/UX and authorizes merge. Codex receives an immutable release request naming the approved commit and changed migration checksums. It dry-runs migrations, applies only missing authorized migrations, deploys exact compatible API/worker/media/Studio artifacts, then returns actual IDs and health evidence. Roll back code only to a schema-compatible version; no destructive schema reversal by default.

Final evidence records source commit/tree, runtime unit, contract/amendment digest, schema ledger, deployment IDs, actual model/SDK IDs, participants/test scope, usage/allowance, receipts and unresolved results. Secret values, raw private conversation and active invitation links stay out of Git/public comments.

## 11. Session handoffs and bounded completion

Use checkpoints A–D as work boundaries, not independent fresh goals. Each handoff states what actually works, exactly which acceptance cases passed, the next failing boundary, and the smallest useful continuation. A session may finish with implementation complete but operator execution pending; this is not full goal completion.

The final verdict is one of: **accepted integrated slice**, **candidate ready / hosted acceptance pending**, or **blocked at a named boundary**. Do not call the work complete from a green room screenshot, mock provider output or accepted asynchronous receipt.

Keep cross-device project listing, richer guest-safe AI context, full onboarding, next-stage notifications, image/prototype integrations and external engineer coordination in the named original/follow-up goals. This goal should make the existing room useful now, not absorb the entire sprint.

## 12. Launch and operations

Start with [Claude implementation launch](CLAUDE_CODE_LAUNCH.md). Initialize [Codex operator launch](CODEX_OPERATOR_LAUNCH.md) separately and use the [communication protocol](CLAUDE_CODEX_PROTOCOL.md).

A message is not an authorization escalation. When current tools or owner grants are missing, prepare the request and continue independent local work. Do not route a platform-denied operation through a different identity to defeat the denial.
