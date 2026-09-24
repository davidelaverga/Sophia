# Source-to-implementation atlas

The exact source identities and read coverage are in [source-register.json](source-register.json). **Reuse** means the existing mechanism remains in the runtime. **Adapt** means Sophia implements the stated boundary using that source as the reference. **Extract** requires moving a verified dependency closure and retaining its license. A donor's existence is not implementation evidence for Sophia.

## 1. DeepSeek: boot and lifecycle

| Source and actual mechanism | Sophia destination | Decision and required work | Proof |
|---|---|---|---|
| DSH-01 root `package.json` | root toolchain and runtime unit | Node 24; pnpm 11.7.0; source pin 46a7f68…; record artifact/lock identities | clean second install/build reproduces the selected unit |
| DSH-02 architecture; DSH-03 `app-boot/README.md` | execution-host runtime supervisor | Launch `dsh --profile sophia-runtime`; do not call a custom root boot tree from the API | actual process uses selected profile and required-service handshake |
| DSH-19 manifest types; DSH-20 SDK bundle manifest | `packages/dsh-bundle/package.json`; installed profile | `dsh.profile.bundles` names base then Sophia; `dsh.bundle.patch` names the bundle patch | installed manifest passes the actual loader; no guessed fields |
| DSH-04 base patch; DSH-05 SDK patch syntax | `config/dsh/`; bundle patch | Retain core mechanisms; disable HMR and specified telemetry/upload rows; all row config replacements are whole replacements | dump configuration plus actual outbound request inspection |
| DSH-06/07 SDK client/protocol | runtime transport decision | Do not use stock SDK as the complete work-control interface; it lacks mid-turn cancel at this pin | use public Agent cancellation in S1-03, not an invented RPC |
| DSH-08 public core; DSH-09 types; DSH-10 service | `dsh-bundle/src/control-bridge.ts` | Bind create/resume/send/steer/cancel/maintenance/dispose to typed leased commands | real mid-tool Stop, boundary steer, duplicate and restart cases |
| DSH-11 checkpoint policy | bridge receipt settlement | Retain checkpoints before pre-step/tool boundaries; add external correlation as a session extension event | delivery survives process restart and receipt loss |
| DSH-12 tool cookbook | `dsh-bundle/src/tools/` | Native defineTool schemas and guarded execution; host-derived actor/agent identity | forbidden call remains forbidden inside PTC |
| DSH-13 preset registry | versioned role registry | Versioned role IDs and bundle version; resume never silently upgrades a historic role | incompatible resume is rejected or explicitly reconstructed |

Profile compatibility is not established by `engines.dsh` alone. App-boot's actual admission examines relevant peer dependencies against the runtime version. Keep the exact dsh peer in the bundle and test the installed composition. Plugin load warnings can leave a process alive without Sophia's required services; our readiness must check those services explicitly. [DSH-03, DSH-19, DSH-20]

## 2. DeepSeek: capabilities without another harness

| Source | Preserve | Sophia adaptation |
|---|---|---|
| DSH-14 `llm-deepseek/README.md` | native Messages route, prepared config snapshot, provider usage/error normalization | explicit `deepseek-flash`; role efforts low/high within off/low/high/max; API-key reference; disabled session-log/package-inventory contributions |
| DSH-15 `llm-pi-ai/README.md` | provider-neutral route catalogs and adapter interface | future approved text routes enter one catalog; no ambient consumer OAuth in project containers; models list replacement handled deliberately |
| DSH-16 `agent-team.md` | native teammate identity, durable mailbox, receipt dedupe, boundary steer/wake, task revision | project authority remains outside; native tasks are execution projections, not product goal acceptance; write scopes remain advisory |
| DSH-17 `llm-replay/README.md` | recorded-stream replay, cancellation/failure fixtures | test the real loop without repeated live calls; use explicit role bindings/fixtures for concurrent external teams, not first-call-order assumptions |
| DSH-18 `ptc-runtime-node/README.md` | fresh sandboxed Node runtime, async host bindings, bounded output, cleanup | bounded programmatic research/aggregation; keep source-building jobs in separate no-secret task containers; do not call this a persistent kernel |

The lead's five-minute review is a durable application job. It does not become a dsh reminder that disappears with a process. A native worker can use dsh goal continuation, but the same execution route has only one continuation owner. Domain effects still pass the application's current grant and idempotency checks.

## 3. Google and LiveKit

| Source | Destination | Exact binding |
|---|---|---|
| G-01 model catalog; GG-01 SDK manifest | models.json; media bridge | `gemini-3.8-live`; `@google/genai` 2.24.0; no substitution with Extended Thinking |
| G-02 Live API | `google-live.ts`, `audio-pipeline.ts` | audio input/output conversion; selected JPEG video frames; independent processing of message fields |
| G-03 tools; G-06 FunctionResponse types | `tool-router.ts` | NON_BLOCKING declarations; `scheduling` and `willContinue` at response top level; finish admission with actual job ID; later job completion is a project event |
| G-04 session management; G-05 best practices | `room-session.ts`, context policy | bounded compression, GoAway/resumption, clean cold context; proactivity is not a permission/identity classifier |
| LK-01 `audio_source.ts` | `playback-epoch.ts` and audio source | `captureFrame`, `clearQueue`, `waitForPlayout`, `close`; stale generation/epoch suppression added by Sophia |
| LK-02 manifest; LK-03 publish example | raw RTC room bridge | `Room`, `AudioSource`, `LocalAudioTrack`, scoped access token, room publication/cleanup; no AgentSession brain |
| G-07/08 image and Interactions docs | `creative/src/images/google.ts` | `interactions.create`, `store:false`, `response_format`, parse actual model-output images |
| OA-01/02/03 image cards and guide | `creative/src/images/openai.ts` | direct Images generation/edit and dated snapshots; no text-agent model hop needed |

For simultaneous team conversation, participant identity comes from authenticated media tracks. Gemini's inference about a voice is not identity. S1 admits one input floor; S2 adds separate per-track transcription for discussion-following. The requested Google vision path observes selected work; the controlled browser-testing path verifies application behavior. They are complementary, not interchangeable.

## 4. Omnigent: owner-operated native sessions

**Selected platform, not a second project brain.** Keep Omnigent pinned and behind `execution-adapters/src/omnigent`. Sophia's frontend does not carry an admin token. Two specific inspected boundaries control the implementation:

**OM-01 — `_host_launch.py`, `resolve_host_launch`.** Host ownership and session owner authority are checked before runner launch. Therefore each owner authorizes starting/adopting the resource, after which the bridge acts under a narrow session grant. Do not modify the global check merely to let the technical lead launch on another person's host.

**OM-02 — `QUEUE_STEER_DESIGN.md`.** Codex-native uses active-turn steer RPC; Claude-native uses its managed terminal path with timing limits. A draft waiting in browser localStorage is not a durably admitted project command. Sophia stores admitted amendments server-side and tracks provider acceptance separately from incorporation. The adapter reports actual capabilities; it does not copy a single optimistic boolean into a promise of safe steer.

**Remaining binding audit is explicit:** enumerate current session creation/adoption, sharing, durable history, live feeds, native identities, permission events/resolution and cancellation from the pinned OpenAPI/route implementations. Map each to the chosen native runner. Run one positive and one adverse owner case per operation. This is the first work in S1-09 and the main subject of Part 2; the endpoint matrix is not fabricated here.

## 5. Buzz: delivery discipline and human floor

**BZ-01 — `crates/buzz-acp/src/base_prompt.md`.** Adapt the useful message policy into Sophia's peer skill: explicit recipient identity; reply-to the current message; publish a result, blocker or meaningful question; callback on completion; suppress empty acknowledgements. Do not copy the whole prompt, global memory practices, public-channel assumptions or its product identity.

**BZ-02 — `desktop/src-tauri/src/huddle/human_floor.rs`.** Its HumanFloor delegates to a playback coordinator and carries a floor epoch plus permission outcome. Reimplement the narrow epoch pattern around raw LiveKit audio: entering human floor revokes stale agent output; clearing the local output queue does not end the engineering task. Copying a Rust handle alone would not bring its playback dependencies or create the required TypeScript media behavior.

**BZ-03 — `crates/buzz-acp/src/acp.rs`.** Its pending permission ID and responded flag address a double-answer/cancellation race. Use the same invariant in Sophia's HumanAction adapter: fingerprint the exact request; emit one response; reconcile timeout/cancel before sending again. Persist the application request state because a process-local flag alone is insufficient after restart.

Do not install Buzz's relay, Nostr identity, forge, or mobile stack. Its useful mechanisms enter existing Sophia boundaries instead of creating a parallel product/event authority.

## 6. QM: scoped messages and completion recovery

**QM-01 — `docs/persistent-subagent-sessions.md`.** A durable `send_message` does not automatically start a turn; follow-up work and selected completion wakes are separate. Its completion acknowledgement occurs after inbox insertion and required wake succeed; a sweep retries unfinished returns. Sophia adopts that separation in the peer adapter and SQL outbox: delivery, wake and result handling have separate evidence, with idempotent recovery. Native dsh peer mail keeps its native mechanism.

**QM-02 — `src/harness/harness.ts`.** Use the typed-contract discipline around read-only work, runtime choice, silent output and pending approvals. Sophia's adapter contract stays small and project-scoped; do not copy OAuth/token fields into the user-facing resource model or treat all capabilities as uniformly supported.

**QM-03 — `src/resolution/sharing-access.ts`.** Its source selection checks actor, origin, current membership and posture. Sophia uses equivalent checks at retrieval/dispatch, but does not import the open posture that can carry a speaker's personal sources into a shared room. We choose deliberate exact-excerpt release.

## 7. Existing Sophia and design/testing donors

**OLD-01 — `create_pdf_artifact.py`.** The inspected opening defines a modest deterministic PDF tool and imports ToolRuntime/thread helpers. It is not evidence that a complete standalone rich renderer can be copied unchanged. S1-13 extracts the rich renderer's actual closure and replaces runtime path injection at the job interface.

**OLD-02 — `build_mutation.py`.** Retain the previous audit's expected source/component version and authorized mutation findings as the S2 extraction starting point. Source/registry/outbox transaction behavior must be tested on the new persistence route before claiming exact editing.

**OLD-03 — `build_deck_from_slides.py`.** This path and blob are verified. Its full compiler closure remains to inspect: tool wrapper, slide/source model, rendering dependencies, object paths and output registration. This is a specific unresolved extraction, not a license to substitute a simplistic deck generator and claim reuse.

**IM-01 — Impeccable.** Keep design intent/product truth separate from surface style; use selected critique/audit guidance for prototypes. Do not let generic anti-pattern rules silently redesign Luis's established Sophia interface. The v0.2 README audit is retained; exact installed skill dependencies and license notices are Part 2 work.

**TEST-01/02 — Playwright and Storybook.** Adopt Playwright for actual preview assertions/traces and Storybook/MSW for component scenario control in S2. Neither supplies dsh conversation replay or establishes API behavior from a mock. Keep the three evidence types labelled.

## 8. License and upgrade record

No third-party source code was copied into this documentation pack as an implemented module. Before extraction, record exact files, source SHA, license/NOTICE obligations, local changes and maintenance owner. Pin donor versions at the package/adapter boundary. A newer interesting donor is an extension candidate, not a reason to replace the selected architecture mid-goal.
