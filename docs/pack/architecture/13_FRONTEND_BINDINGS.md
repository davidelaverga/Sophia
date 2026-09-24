# 13 — From the actual Studio reference to production components

The reference is now bundled at [UI source](../references/Sophia_Studio_V1_Evolved_V2_R1.html), SHA-256 `f3879d9e3d43bdfe5f14fc1472908614b0d17d054a8ae013a80a63166f1ddc23`. It is an offline explanatory application with scripted provider outcomes, not a production frontend. The map below refers to its actual named functions/actions. [UI-01]

## 1. Preserve the room, replace the fixture controller

Use React/Vite with one `StudioShell`, not Omnigent's admin UI as the product. Keep the reference's artifact-centered composition, dark/violet visual language, compact Sophia dock, contextual discussion, quiet work pulse and expandable evidence. Keep the current-work controls reachable without crowding the artifact.

The original eight explanatory chapters, actor-switcher, scenario presets and fake “provider completed” buttons do not ship as real controls. Their useful cases become tests and development stories. The walkthrough's **show this in the workspace** behavior becomes documentation/demo navigation, not a requirement that real users follow a tutorial before starting work.

## 2. Concrete route and component map

| Reference source/function | Production destination | State/API binding |
|---|---|---|
| `renderRoom`, `v2StudioStage`, `v2LensBar` | `features/studio/StudioShell.tsx`, `LensSwitcher.tsx` | Project snapshot + local URL/view state. A lens switch makes no work command. |
| `v2Converse`, `contextPanel`, `renderConversations` | `features/discussion/ProjectThread.tsx`, `ContextPanel.tsx`, `ConversationHistory.tsx` | Contributions and version-linked discussion; posting a comment does not retask a worker. |
| `v2Explore`, `v2Directions`, `v2Preview` | `features/explore/ExplorePane.tsx`, `DirectionGallery.tsx`, `PreviewStage.tsx` | Versioned direction/assets/candidate records and real image jobs. |
| `v2Build`, `v2SourceInspector`, `v2DownloadBundle` | `features/source-editor/SourceWorkspace.tsx`, `SourceEditor.tsx`, `ExportSource.tsx` | Exact source snapshot, expected-base patches, build jobs and export manifest. |
| `renderPulse`, `v2WorkSummary`, `workStatus` | `features/work/WorkPulse.tsx`, `WorkDetails.tsx` | Current assessment, observation freshness and underlying evidence; no tool-count percent-complete. |
| `v2RequestBody`, `requiredBridges` | `features/attention/HumanActionCard.tsx`, `NeedsYou.tsx` | One HumanAction ID across Studio, Work, Activity and return. |
| `v2AmendmentBody`, `amendment.*` cases | `features/review/ReviewIntentComposer.tsx`, `AmendmentReceipt.tsx` | Reviewed preview/version → change/preserve brief → lead → delivery/result stages. |
| `v2ChecksBody`, `checkCandidate`, `candidate.accept` | `features/review/CandidateChecks.tsx`, `AcceptancePanel.tsx` | Trusted check report for exact source; acceptance command stays distinct. |
| `optionalBridge`, `bridge.dismiss` | `features/attention/CooperationCard.tsx` | S2 opportunity plus viewer-specific attention; dismissal never grants work authority. |
| `captureGuide`, `restoreGuide`, `view`, `saveViewer` | `features/studio/SharedFocus.tsx`, `viewer-state.ts` | Shared focus revision separate from local lens, source selection, draft and scroll. |
| `invoke`, `mic`, `finishExchange` | `features/voice/SophiaDock.tsx`, `RoomAudio.tsx` | Actual room token/exchange/input floor; playback cancellation is not work cancellation. |
| `renderKnowledge`, `packet` | `features/knowledge/ProjectBrief.tsx`, `UsedForThisWork.tsx` | Current accepted records and context-manifest provenance/coverage. |

The detailed action crosswalk is machine-readable in [frontend bindings](../frontend/bindings.json). Production data must not use fixed reference IDs such as `W1`, `H1`, `B1`, `C2` as global identifiers.

## 3. State has three owners

**Server/project state:** current mission, goals, decisions, pending actions, source versions, attempts, actual engineer observations, shared focus and authorized room state.

**Local viewer state:** lens, selected candidate for inspection, inspector tab, scroll, optional-card prominence, unsent comment and unsaved source changes. It is keyed by user+project and survives a server resnapshot without being mistaken for accepted work.

**Media state:** input/output tracks, playback queue, connection epoch and per-person consent. The media bridge—not React component mounting—owns the provider session. Closing an inspector cannot tear down a build or voice room.

Use one TanStack Query server cache and a pure SSE projection reducer. The reducer does not perform network calls or accept a candidate. It emits a `needsSnapshot` signal when sequence order cannot be established; the controller obtains a new snapshot and reconciles local drafts. Keep cursor values as decimal strings/BigInt internally.

## 4. S1 screen-by-screen behavior

### Enter a project

The return view shows the actual last accepted source, current goals and unresolved owner actions. “Continue existing work” offers selected context import and the owner's repository/resource links; it does not promise live access to every ChatGPT/Claude Project. Choosing a resource does not transfer ownership to the guide.

### Speak and keep working

Joining gets a room-scoped LiveKit token from the API. The dock distinguishes mic-to-room, Sophia listening state, current speaker/follow-up window and work running in the background. A concise button or voice instruction can stop speech without stopping the goal. Full operational controls live in the work details, not as seven permanently visible audio buttons.

### Explore to prototype

A direction contains exact asset IDs and source references. Selecting it retains alternatives and opens a runnable prototype candidate. `Preview / Source / Diff` are views of the same source identity. Luis uses a bounded lazy-loaded CodeMirror 6 editor for the permitted files, not a full browser desktop IDE. The implementation locks the chosen dependency versions in S1-01.

On takeover, hold the affected writing goal and wait for the source-write boundary before enabling save. Opening the source tab alone does not hold work. A save creates a new source candidate with expected file hashes. A worker result against the older base goes to a conflict view; it never overwrites Luis's draft.

### Review the real application

The S1 supported preview is a team-owned, source-linked app on an isolated origin with explicit framing permission and a narrow message bridge. The assigned engineer fixes preview-only framing configuration; Sophia does not strip third-party headers. Arbitrary external sites are not promised as embeddable in S1. An incoming selection must match the expected origin, window, preview ID, nonce and displayed source version. DOM selectors are evidence about a target, not authority to modify files.

Store viewport, selected element/crop, exact readable text when available, source/preview IDs, the user's requested change and preservation list. Only consequential ambiguity asks for clarification. A clear request can create the review intent and hand it to the technical lead in one interaction.

The UI keeps “requested,” “sent,” “seen in candidate” and “checked” distinct. During revision, the previous usable preview remains available. A failed image/build candidate is not promoted to fill an empty screen.

### See the engineers and act

Work details show the exact three owner resources, role, current task, actual model when known, last observation and pending native action. Do not use color alone to distinguish working, waiting, disconnected and assessed progress. A native session's `idle` is not a verified goal completion.

A native permission alert names the owner/resource/operation and opens the correct native surface. S1 does not render an unsupported Approve button. S2 adds only the supported schema-bound response path. A resolution with unknown native verdict is labelled “resolved in the native app; decision not reported.”

“Review work progress” starts the same lead procedure as the periodic heartbeat and immediately shows a pending receipt. The click does not create another reviewer while one is active; its reason joins the existing review. Material lead decisions are visible with evidence and a way to challenge them; no-change reviews update last-reviewed time quietly.

## 5. S2 attention and mobile bindings

Routine changes update Work Pulse. Required HumanActions remain persistent and owner-addressed. Cooperation opportunities are optional, tied to an exact captured milestone or important choice, with a relevance window and an authorized no-response continuation.

Use one PWA/web-push notification route. The notification carries a minimal deep link, not sensitive command text or a bearer token. The mobile page authenticates again, fetches the **current** action and shows its fingerprint/source before responding. Push delivery is not guaranteed; the durable action remains in the inbox.

Mobile supports current status, preview review, comment, manual review, steer, Hold/Stop and supported approval. Native login/OS prompts remain explicit handoffs. A stale tap after Stop or after request supersession does not execute the earlier approval.

The card presenter reads `HumanAction` or `CooperationOpportunity`; it does not write native actions from lifecycle events. Reading/marking seen updates only `viewer_attention`. The server computes whether the underlying request is resolved.

## 6. Source-backed scenario testing

The reference's `V2.emit` switch is test inspiration, not a real backend. Map its adversarial cases to server-backed tests:

| Reference case | Product test |
|---|---|
| `source.import` / `source.reconcile` | Concurrent human source update preserves candidate and requests reconciliation. |
| `human.stale` | Wrong request fingerprint cannot answer a new permission. |
| `work.observation_stale` | Stream loss becomes observation unavailable, not a fabricated human blocker. |
| `work.stop` then `human.native` | Late native resolution cannot resume a stopped goal. |
| `asset.fail` / `asset.retry` | Failed generation leaves accepted asset unchanged. |
| `amendment.deliver` / `amendment.observe` / `amendment.check` | Receipt stages are evidence-linked, not one optimistic tick. |
| `candidate.check` / `candidate.accept` | Candidate checking does not become product acceptance. |
| Local `view.*` actions | A second viewer's navigation remains unchanged. |

S2 uses Storybook for component states, MSW for controlled service responses and Playwright for whole-app workflows. Fixed dsh replay remains a separate runtime test. Story fixtures are labelled simulated; release evidence exercises real APIs and actual returned source.

## 7. Accessibility and performance acceptance

Keyboard focus returns to the invoking control after a modal closes. Focus is not stolen by each streamed event. Required requests use persistent accessible headings; routine stream updates are not all ARIA announcements. Users can inspect a historical candidate without losing the live result bridge. Touch targets remain usable on the mobile viewport and controls are not hidden behind hover-only interactions.

The code editor and heavy preview inspector load on demand. Stream events patch the appropriate query/projection rather than rerendering the whole room. Preserve a bounded in-memory event tail; history pages are paginated. Throttle transient visual updates separately from durable receipts. No timer-based animation implies progress that the backend has not assessed.

## 8. Implementation proof

S1-04, S1-07, S1-09 and S1-12 share the canonical request/result IDs before parallel work. Their integrated episode must show two real users in different local lenses, voice during a background job, Luis's source edit surviving a stale worker result, an owner-specific native request, a manual review and an actual returned application amendment.

Part 2 includes a tested pure projection reducer and protocol fixtures, not a functioning React/LiveKit product. The bundled reference still labels simulated operations. The source-to-component map reduces design ambiguity; it does not convert the fixture to production by renaming its buttons.
