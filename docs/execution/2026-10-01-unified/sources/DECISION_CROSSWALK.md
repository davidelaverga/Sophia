# Original decision crosswalk

Original wording is quoted here only to identify the clause. The current disposition is the forward instruction; do not treat this table as an archived startup checklist.

| ID | Original clause | Current disposition |
|---|---|---|
| D01 | Create a new `sophia-next` monorepo. Keep existing Sophia as a donor and live legacy product. | Achieved in davidelaverga/Sophia; do not create sophia-next again. |
| D02 | Node 24 and pnpm 11.7.0; ESM TypeScript for the new application. Pin dsh source to `46a7f68…`, version `0.1.7-rc.1`. | Runtime pin superseded by merged M02 dsh0.2.0-rc.2 at 639ed015397290b3745d163aafe02ffee4aa3f84; exact Node24.21.0 and pnpm11.7.0 retained. |
| D03 | Start the official `dsh` CLI with `sophia-runtime`, stacking dsh-base and our bundle. | Retained constraint; use current source and v2.0 implementation location. |
| D04 | Use a Sophia Cordis control plugin over the public Agent API, not the stock SDK as our complete control transport. | Retained constraint; use current source and v2.0 implementation location. |
| D05 | One project-scoped dsh runtime container/home at a time; separate per-task build containers. | Retained constraint; use current source and v2.0 implementation location. |
| D06 | Fastify API, Supabase Auth/Postgres/Storage, SQL jobs/outbox and replayable SSE. No Redis or second workflow engine in S1. | Existing admission/outbox retained. Paperclip is now the selected operational service for new managed work, not a second scheduler for old attempts. |
| D07 | Custom React/Vite Studio; retain the actual V2-R1 visual/semantic reference. | Current merged Luis Chat/Brief side panel supersedes earlier visual placement; custom React/Vite product retained. |
| D08 | LiveKit Cloud for the room; raw `@livekit/rtc-node` in a Sophia media bridge. Do not install LiveKit AgentSession as another reasoning runtime. | Retained constraint; use current source and v2.0 implementation location. |
| D09 | Google Gemini API (not Vertex for this first route), `gemini-3.8-live`, `@google/genai` 2.24.0. | Retained constraint; use current source and v2.0 implementation location. |
| D10 | Live is the conversational voice model; dsh guide is the text route; both use the same context compiler and action API. | Current voice and typed room conversation both use Gemini Live; future private Companion is a separate explicit decision. |
| D11 | S1 voice uses an explicit admitted-input floor and open exchange. S2 adds consented per-participant discussion following. | Retained constraint; use current source and v2.0 implementation location. |
| D12 | Selected visual frames through Live; exact text through scoped artifact/source tools. No whole-desktop control for coordination. | Retained constraint; use current source and v2.0 implementation location. |
| D13 | DeepSeek V4.1 Flash via `deepseek-flash` is the native research/prototype/lead baseline. Low effort for routine work; high for lead alignment and difficult work. | Historical workhorse preference. Current base route is recorded luna/high; active M03 candidate Sol/medium. No automatic model switch. |
| D14 | Google Flash Image default; OpenAI Sunburst first comparison; Google Pro and OpenAI Flare available in the experiment catalog. | Retained constraint; use current source and v2.0 implementation location. |
| D15 | Google image jobs use Interactions with `store:false`; OpenAI uses the direct Images API. | Retained constraint; use current source and v2.0 implementation location. |
| D16 | Omnigent is a pinned native engineer bridge; owner-started/adopted sessions on the two Macs in S1. | Retained constraint; use current source and v2.0 implementation location. |
| D17 | Peer messages use a Sophia durable mailbox and narrow MCP-facing tools; adapters wake/deliver through supported native mechanisms. Native dsh teams use their own mailbox. | Retained constraint; use current source and v2.0 implementation location. |
| D18 | Five-minute coalesced semantic review while relevant work is active, plus events and manual review. | Retained constraint; use current source and v2.0 implementation location. |
| D19 | S1 co-review creates a source-bound change/preserve amendment. Exact component-edit enforcement is S2. | Retained constraint; use current source and v2.0 implementation location. |
| D20 | Native prototype source is React/TypeScript/Vite; reuse compatible components/assets during handoff. | Retained constraint; use current source and v2.0 implementation location. |
| D21 | Render hosts public API and Omnigent. One private Docker execution VM hosts the runtime supervisor, media bridge and isolated jobs. Vercel hosts the static Studio. | Topology is subject to actual release records and qualified isolated hosts; no automatic migration to an illustrative VM arrangement. |
| D22 | Accepted state in Postgres; source objects and scoped Markdown knowledge; direct lookup plus Postgres text search first. | Retained constraint; use current source and v2.0 implementation location. |
| D23 | Selective ChatGPT/Claude import and chosen local repository/session bindings in S1; explicit send-to-Sophia tool trial. | Extend selected import with owner-private Bot jobs and explicit package sharing; no whole-account scrape. |
| D24 | Learning begins with one accepted lesson used in the next relevant brief. | Retained constraint; use current source and v2.0 implementation location. |
| D25 | Notion/Supabase/Vercel management connectors are S2 additions; existing native engineer tools deploy in S1. | Retained constraint; use current source and v2.0 implementation location. |
| D26 | One owner-approved Omnigent device grant per founder; normal engineer accounts, separate operator admin. | Retained constraint; use current source and v2.0 implementation location. |
| D27 | Create a dormant session-scoped bundle, install assignment MCP, PATCH selected model/effort, then launch on the owner host and observe before prompting. | Retained constraint; use current source and v2.0 implementation location. |
| D28 | S1 external Hold is controlled native Stop plus retained project/source handoff; Resume creates a fresh configured native attempt. | Retained constraint; use current source and v2.0 implementation location. |
| D29 | Native ambiguous writes become outcome_unknown, not automatic retries. Rotating-refresh uncertainty requires reconnection. | Retained constraint; use current source and v2.0 implementation location. |
| D30 | Private Postgres schema, non-admin API/worker roles, normalized command equality, target outbox records and decimal-string event cursors. | Retained constraint; use current source and v2.0 implementation location. |
| D31 | Actual Studio reference → production component/API map; one TanStack Query cache and a lazy CodeMirror source editor. | Retained constraint; use current source and v2.0 implementation location. |
| D32 | Reuse the three audited JavaScript renderer kernels; remove Python ToolRuntime orchestration from that path. Preserve notes, source and preview PNGs. | M03 PDF kernel/service template already authored; complete remaining deck/HTML path and keep raster-export honesty. |
| D33 | No automatic live Claude /model changes in S1/S2. Configure model/effort before launch and verify actual settings. | Retained constraint; use current source and v2.0 implementation location. |
| D34 | S1 supported app preview is team-owned, source-linked and explicitly frame-enabled for Studio. | Retained constraint; use current source and v2.0 implementation location. |
