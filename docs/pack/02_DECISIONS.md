# Decisions that govern implementation

**Authority:** current user directions → this pack's explicit implementation choices → v0.2 → older research. These are architectural decisions, not proof that an integration has shipped. Changing one requires a short decision amendment explaining the dependency impact.

| ID | Decision | Reason and consequence |
|---|---|---|
| D01 | Create a new `sophia-next` monorepo. Keep existing Sophia as a donor and live legacy product. | No in-place completion of the old middleware/Builder control architecture. No destructive migration in the bootstrap. |
| D02 | Node 24 and pnpm 11.7.0; ESM TypeScript for the new application. Pin dsh source to `46a7f68…`, version `0.1.7-rc.1`. | Matches the inspected upstream toolchain. The exact Node patch and OCI digest are frozen during S1-01; they are not fabricated here. |
| D03 | Start the official `dsh` CLI with `sophia-runtime`, stacking dsh-base and our bundle. | Use the supported launcher and actual plugin boundaries; no custom root agent loop. [DSH-01–DSH-05] |
| D04 | Use a Sophia Cordis control plugin over the public Agent API, not the stock SDK as our complete control transport. | Stock SDK cannot express our mid-turn Stop. The new bridge maps typed commands to actual lifecycle operations. [DSH-06–DSH-10] |
| D05 | One project-scoped dsh runtime container/home at a time; separate per-task build containers. | Project recovery and model history remain isolated. A room visit does not own project lifetime. Raw user build scripts never run inside the API or media service. |
| D06 | Fastify API, Supabase Auth/Postgres/Storage, SQL jobs/outbox and replayable SSE. No Redis or second workflow engine in S1. | One small application authority; no writable Git plan mirror competing with accepted database state. |
| D07 | Custom React/Vite Studio; retain the actual V2-R1 visual/semantic reference. | Do not expose the dsh web UI or Omnigent dashboard as Sophia's product. Lenses remain local views over common records. |
| D08 | LiveKit Cloud for the room; raw `@livekit/rtc-node` in a Sophia media bridge. Do not install LiveKit AgentSession as another reasoning runtime. | Keep transport, speaker identity and media lifecycle while owning the Gemini connection and tool rules. [LK-01–LK-04] |
| D09 | Google Gemini API (not Vertex for this first route), `gemini-3.8-live`, `@google/genai` 2.24.0. | Explicit latest user decision. The inspected FunctionResponse generator property is not supported in Vertex; the chosen API avoids pretending parity. [GG-01, G-06] |
| D10 | Live is the conversational voice model; dsh guide is the text route; both use the same context compiler and action API. | No compulsory dsh call for every spoken sentence. Long reasoning and engineering go to dsh/engineers; one visible Sophia, not two simultaneous narrators. |
| D11 | S1 voice uses an explicit admitted-input floor and open exchange. S2 adds consented per-participant discussion following. | Reliable attribution comes from authenticated tracks, not guessing a voiceprint or trusting a name spoken by a model. |
| D12 | Selected visual frames through Live; exact text through scoped artifact/source tools. No whole-desktop control for coordination. | Observation, precision, edit authority and execution are separate. |
| D13 | DeepSeek V4.1 Flash via `deepseek-flash` is the native research/prototype/lead baseline. Low effort for routine work; high for lead alignment and difficult work. | Preserves the user's workhorse direction. Alias identity is recorded, not described as an immutable model snapshot. [DSH-14, DS-01] |
| D14 | Google Flash Image default; OpenAI Sunburst first comparison; Google Pro and OpenAI Flare available in the experiment catalog. | Two actual adapters, immutable assets, explicit comparison choice; no automatic all-model fan-out. |
| D15 | Google image jobs use Interactions with `store:false`; OpenAI uses the direct Images API. | Avoid unnecessary hosted conversation state and a second text model merely to request an image. [G-07, G-08, OA-03] |
| D16 | Omnigent is a pinned native engineer bridge; owner-started/adopted sessions on the two Macs in S1. | All three resources are included, without granting the central service arbitrary cross-owner host launch. [OM-01] |
| D17 | Peer messages use a Sophia durable mailbox and narrow MCP-facing tools; adapters wake/deliver through supported native mechanisms. Native dsh teams use their own mailbox. | No screenshot loop, no permanent coordinator polling, no required lead-model relay. A2A federation is an extension, not a prerequisite. |
| D18 | Five-minute coalesced semantic review while relevant work is active, plus events and manual review. | Initial real supervision now; timers do not invent evidence or permission requests. One continuation owner per route. |
| D19 | S1 co-review creates a source-bound change/preserve amendment. Exact component-edit enforcement is S2. | Makes early review valuable without misrepresenting instruction-based preservation as surgical enforcement. |
| D20 | Native prototype source is React/TypeScript/Vite; reuse compatible components/assets during handoff. | Luis works in Preview/Source/Diff. Target repository mismatch is an explicit integration issue, not silent screenshot recreation. |
| D21 | Render hosts public API and Omnigent. One private Docker execution VM hosts the runtime supervisor, media bridge and isolated jobs. Vercel hosts the static Studio. | Long-lived media and isolation have a concrete home. The added VM is an explicit operating cost; no unsupported Docker-in-Render assumption. |
| D22 | Accepted state in Postgres; source objects and scoped Markdown knowledge; direct lookup plus Postgres text search first. | Mem0 is not the source of current project authority; no initial provider/vector migration is required. Personal memory import is separate. |
| D23 | Selective ChatGPT/Claude import and chosen local repository/session bindings in S1; explicit send-to-Sophia tool trial. | No undocumented reverse Projects API or whole-account scrape. |
| D24 | Learning begins with one accepted lesson used in the next relevant brief. | Procedure candidates are compared and promoted later. Forecast scoring is optional; no-change is legitimate. |
| D25 | Notion/Supabase/Vercel management connectors are S2 additions; existing native engineer tools deploy in S1. | Product persistence is not postponed. Shared deployment ownership is still required even when credentials already exist. |

## Part 2 decisions and source-based refinements

| ID | Decision | Why it is now explicit |
|---|---|---|
| D26 | One owner-approved Omnigent device grant per founder; normal engineer accounts, separate operator admin. | The native host/session owner checks remain intact. A single machine subject is not both founders. [OM-01, OM-09, OM-10, OM-11] |
| D27 | Create a dormant session-scoped bundle, install assignment MCP, PATCH selected model/effort, then launch on the owner host and observe before prompting. | The native Claude adapter ignores per-turn tool/system-prompt injection. Exact multipart and JSON shapes differ. [OM-03, OM-04, OM-07, OM-12] |
| D28 | S1 external Hold is controlled native Stop plus retained project/source handoff; Resume creates a fresh configured native attempt. | Upstream Stop is non-sticky and its receipt is not settlement. Drain/fence/reconcile prevents late messages reviving work. [OM-05] |
| D29 | Native ambiguous writes become outcome_unknown, not automatic retries. Rotating-refresh uncertainty requires reconnection. | Native message correlation is not end-to-end deduplication; refresh reuse may revoke the grant. [OM-03, OM-09] |
| D30 | Private Postgres schema, non-admin API/worker roles, normalized command equality, target outbox records and decimal-string event cursors. | The product state outlives every native session. Reference SQL is a foundational candidate, not all service implementations. [DB-01, DB-02] |
| D31 | Actual Studio reference → production component/API map; one TanStack Query cache and a lazy CodeMirror source editor. | Preserve the product’s established experience without importing fixture outcomes as truth. [UI-01, UI-02] |
| D32 | Reuse the three audited JavaScript renderer kernels; remove Python ToolRuntime orchestration from that path. Preserve notes, source and preview PNGs. | Rich PDF and image-based PPTX are concrete capabilities. Native editable PPTX objects are not provided by this compiler. [OLD-03–OLD-09] |
| D33 | No automatic live Claude /model changes in S1/S2. Configure model/effort before launch and verify actual settings. | The audited adapter’s live switch changes the owner’s global future-session default. [OM-12] |
| D34 | S1 supported app preview is team-owned, source-linked and explicitly frame-enabled for Studio. | Fix the preview configuration through the engineer; do not strip a third party’s security headers. Remote browser takeover is later browser work. |

The direction is unchanged. Part 2 adds exact bindings and a tested local reference layer. Native account/session behavior, SQL/RLS execution, the production component implementation and deploy artifacts still need the finite implementation proof recorded in their goals.

## Resource policy

Start with a small declared catalog rather than an unrestricted model picker. DeepSeek native work uses the founder project's permitted sources. Google receives the chosen voice/vision/image material. OpenAI receives only sources authorized for that image experiment or engineering route. A model fallback that changes recipient/provider or payer requires an existing grant; a timeout does not confer one.

No fixed dollar price, cloud-plan entitlement or provider-policy certification is inferred from this document. S1-01 records actual packages/hosts; S1-05/06/09 exercise actual account routes. Spending ceilings are supplied by the owner's project settings, not fabricated by a model.
