# Continuation checkpoint — complete the next implementation layer

## What this installment settles

The project direction and three releases remain v0.2. v0.3 Part 1 fixes the repository/deployment structure, actual dsh profile and public Agent bridge, Gemini 3.8 Live/raw LiveKit media split, dual-vendor image adapters, product records, frontend semantics and 14 Sprint 1 goal briefs. It supplies the whole end-to-end map, not every finished SQL/API implementation.

The source-pinned dsh review is the important architectural result: use the official profile launcher and native loop, then implement a small Cordis control bridge because the stock SDK does not provide the full required work-control surface. The provider decisions are in config/models.json. Do not reopen them as a framework-selection exercise.

## Next documentation pass, in order

### 1. Finish S1-09 external-engineer binding

Read Omnigent at `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`, starting with the pinned host ownership and queue/steer sources. Retrieve its current OpenAPI and the route/runner implementations for session adoption/launch, grants, durable history, live feeds, native IDs, permission requests/resolution, steer, cancel and result collection. Follow actual imports from those files; do not infer URLs from method names.

Deliver `architecture/11_OMNIGENT_BINDINGS.md`: exact method/path, auth principal, request/response/event, runner mode, evidence stage, retries, cancellation and owner restriction for each operation. Include the three actual resource types and positive/adverse acceptance scenarios. Preserve owner-controlled launch; no weakened global host access.

### 2. Turn domain contracts into schema and API artifacts

Expand architecture/03_BACKEND into explicit SQL migrations, RLS/role tests, transactional admission/publication queries, SQL job lease/outbox/replay operations and OpenAPI with generated client types. Decide the exact table/enum names once and update contracts, examples and frontend client references together. Include crash boundaries and a restart/duplicate test for each external effect.

### 3. Complete the production frontend component map

Retrieve the exact UI reference by identity/hash. Map its product behavior—not fixture controller—to React routes, components, reducers/hooks and generated API calls. Supply fixture-to-real migration cases for voice, source editor, HumanActions, Work Pulse, preview selection, change/preserve brief, local lens and shared focus. Preserve accessibility and mobile parity. Add precise code-target goal slices without creating a different product.

### 4. Extract the real format engines

At Sophia-Agent `d467ab97464908b4e7c7752701eee9d24db7faf6`, follow the actual rich PDF/deck entry-point call graphs. The verified small PDF wrapper is not a universal rich renderer. Record exact function/file/dependency/asset inputs, ToolRuntime/thread coupling to replace, execution image and output evidence. Produce an extraction manifest and one render adapter contract per format, then refine S1-13.

### 5. Detail S2/S3 and operating manifests

Expand the mapped later goals into exact source/contract sessions after the first interfaces above are fixed. Add native permission mobile response, Google per-track transcription, Storybook/MSW/Playwright cases, scoped connectors, exact artifact edits, multi-week recovery and native app execution. Complete Render/VM/Vercel/LiveKit deployment manifests and actual dependency locks from an implementation environment.

## Evidence not yet obtained

No dsh boot, provider account availability, live Google audio/image, OpenAI image call, native cross-owner coordination, SQL migration, code compilation or application deployment was tested while authoring these documents. Source inspection is not that evidence. The pack validator checks only files, links, IDs, schemas and goal graph.

## How to continue without losing context

Use this whole pack and the two retained v0.2 documents. Read the exact relevant sources and update the source register's coverage rather than adding an unsupported success claim. Keep source-derived findings, Sophia decisions and live results separate. A later source change becomes a recorded adapter/runtime-unit update, not a silent rewrite of historical facts.

The next handoff should state which of the five areas above was completed and which exact files changed. Keep the existing goal identities and unresolved obligations. Do not create another high-level plan that forces the team to reconstruct the same decisions.
