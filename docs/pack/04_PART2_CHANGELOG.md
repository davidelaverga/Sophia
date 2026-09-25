# Part 2 — what changed, what it enables, what it does not prove

**Cumulative pack v0.4 · 24 September 2026.** The v0.3 Part 1 ZIP remains unchanged. This pack retains its product/runtime/media decisions, updates stale handoff text, and adds the exact next binding layer.

## New source-grounded findings

Omnigent's owner checks require the proper host and session principal. Its device flow supplies an owner-approved route; the delegated path scope is broad, so Sophia narrows it to selected project resources. The actual route takes JSON for device authorize and form data for token exchange/refresh/revoke. A lost rotating-refresh response must not be retried with an old token. [OM-01, OM-09, OM-11]

The selected native sequence is dormant session-scoped bundle → assignment MCP → pre-launch model/effort PATCH → owner-host worktree launch → actual readiness → initial prompt. A later native message is not a way to install new tools; the Claude-native adapter ignores per-turn tools/system_prompt. [OM-03, OM-07, OM-12]

Native Stop is owner-only but non-sticky, and a normal interrupt response can precede confirmed cancellation. The new adapter specification fences ordinary deliveries, drains/reconciles in-flight writes, then observes native settlement. Native user messages are not claimed exactly-once; the outbox retains unknown outcomes. [OM-03, OM-05]

Native SSE is live-tail. Snapshots repair current observations, not every lost event. Its pending-input index is in memory; a UI rebind guarantee is not restart durability. Sophia owns its own replay stream and gap records. [OM-03]

The rich renderer closure is three JavaScript kernels plus Playwright/PPTX dependencies, not the old Python agent wrappers. The PPTX contains full-slide images; HTML remains editable source. The old wrapper drops available notes during orchestration, and an unavailable overflow measurement can look like zero. The new adaptation requirements correct these explicitly. [OLD-03–OLD-08]

## New deliverables

[Architecture 11](architecture/11_OMNIGENT_BINDINGS.md) is the endpoint/principal/receipt/recovery matrix. [Architecture 12](architecture/12_DATA_AND_API_BINDINGS.md) binds state to [SQL](db/README.md) and [OpenAPI](api/README.md). [Architecture 13](architecture/13_FRONTEND_BINDINGS.md) maps the actual bundled Studio source into production components. [Architecture 14](architecture/14_RENDERER_EXTRACTION.md) maps exact format kernels to extraction and adaptation.

The pack adds 33 application API operations, generated TypeScript types, a small typed client, synthetic native-wire fixtures, four PostgreSQL migration candidates and an unrun SQL suite. It adds executable reference modules for native wire shapes, control/dispatch rules, source updates and UI replay behavior. These are not a production backend.

All 24 delivery goals now have individual implementation briefs. The [S1 integration session plan](delivery/sessions/S1_BINDING_SESSIONS.md) connects the exact data, owner-account, peer, preview, permission and renderer routes. The [operating map](ops/DEPLOYMENT_BINDINGS.md) fixes deploy responsibility and readiness without fabricating images or actual cloud resources.

## Scope retained

DeepSeek remains the native runtime; Gemini 3.8 Live remains the voice model with Google vision; Google/OpenAI image routes remain explicit; all three owner engineers, native prototypes, visual review-to-steer, useful artifacts, memory and the five-minute/manual lead review remain Sprint 1. Exact component edits, richer cooperation cards and supported mobile approval remain Sprint 2. Notion/Supabase/Vercel management connectors remain postponed; existing engineer access continues to perform authorized service work.

## Evidence boundary

Source-audited does not mean installed. Schema-shaped does not mean SQL/RLS-tested. Reference TypeScript compiled and its local tests ran; no live dsh/Omnigent/provider/room/deployment test ran. The status ledger and machine-readable evidence separate those levels. A fixture identity, model setting or example response is never release evidence.
