# Implementation destinations and integration map

The source paths below are a **binding map**, not a claim that every named path exists. The current repo and selected open candidate are the code authority; proposed destinations must be checked before creation. Do not copy former `Sophia-Agent`/Python/Next/DeerFlow folders into this dsh product.

| Responsibility | Existing or candidate foundation | Proposed continuation |
|---|---|---|
| Application identity/commands | Supabase JWT API, current command/outbox/replay and mission services | Extend actual generated contracts; derive actor and policy server-side. |
| Native runtime | `packages/dsh-bundle/src/control-bridge.ts`, role registry, runtime service | Narrow Paperclip dispatch/control binding, not another `ctx.agents` controller. |
| Specialist identity | PR32 `config/specialists.json`, route allowlist, preset generation | New qualified roles extend one registry; external assistant connections are resources, not fake dsh presets. |
| Reports/source bytes | PR32 `packages/persistence`, byte store, artifact readers, `@sophia/report` | Reuse storage mechanisms; add owner-private access domains without exposing team-wide queries. |
| Research output | PR32 research operations, exact draft/source publication, confined renderer | Finish PDF UI/voice/release, then retained deck/HTML family. |
| Operational work | Existing Sophia admission and references | `packages/coordination/`, `packages/paperclip-plugin/`, `packages/paperclip-adapters/`, private `deploy/paperclip/`. |
| Owner coding hosts | Source-bound architecture 11 | `packages/execution-adapters/src/omnigent/`; native credentials stay native. |
| Images/prototypes | Retained source/asset contracts; current Explore/Build placeholders | `packages/creative/`, `features/explore/`, `features/source-editor/`, isolated build/preview. |
| Personal space | PR35 `personal.ts`, API routes, PR30 `features/personal/` | Qualified owner-private job/package service; no invented project wrapper. |
| Grok delivery | No current integration claimed | `packages/execution-adapters/src/grok-bot/` for webhook transport; scoped MCP gateway and app-owned private job operations. |
| Personal assistant UI | Personal candidate + shared data-only artifact components | `features/personal/assistants/`, `features/personal/imports/` and private job conversation; extend selected actual folder conventions. |
| Sharing | Existing exact carried-note functions are narrower | New human-only versioned package publication using current source/eligibility machinery. Do not overload note-copy fields with archives. |
| Application review | Source/version/preview identity | `features/review/`, source-linked checks; Bot review writes a candidate observation, not a source edit. |
| Mobile/attention | Current room/work feed and action concepts | One required-action identity, optional invitation, quiet progress; private job events use owner-only audience. |

## Contract changes are authored once

A11 and A10 are active candidate contracts. Generate clients from the reviewed amendments and reuse their response validators. Do not hand-author a parallel TypeScript DTO that merely resembles their output. Reserve new IDs after refreshing all active branches.

The new schemas in this pack specify intended assistant and coordination payloads. They are not deployed OpenAPI. Implementers bind them through the repository's actual generation and migration process. No new production SQL is included, and existing 0001–0031 ranges must not be replayed because they appear in a plan.

## Private storage is a new audience, not a second artifact invention

Reuse verified byte hashing, immutable objects, safe rendering and upload mechanics from the artifact path. Enforce owner-private records, storage keys and read authorization independently of project membership. A common byte-store adapter is safe only if callers cannot use it to enumerate/read across domains. Shared publication creates a new team-scoped manifest of exactly selected content, never a direct link to an unrestricted personal object.

A private package can include files, sources and conversations; private job messages are not normal team discussion or unanswered personal Companion turns. Shared viewers may be reused as pure presentation components; query keys, fetching, caches, telemetry and notices remain audience-scoped.

## Native contracts retained locally

[Omnigent operation binding](bindings/OMNIGENT.md), [image route design](bindings/IMAGE_GENERATION.md), [voice/media continuation](bindings/VOICE_AND_VISION.md), and [renderer binding](bindings/RENDERERS.md) retain the detailed technical requirements. They state which dated designs are qualification inputs and which current source replaces their old readiness assumptions.
