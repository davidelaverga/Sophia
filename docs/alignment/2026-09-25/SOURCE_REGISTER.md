# Source register and evidence classes

**Review date:** 25 September 2026. **Repository:** `https://github.com/davidelaverga/Sophia`. **Working source:** `29a570c33feb97a6bc04ea357c84087a47c9b055`. **Main:** `01d9117bdcf9ec8ee18cd5414aa08ee4f24265a3`.

Repository evidence is pinned below. Product decisions in this packet are recommendations for the next implementation assignment; they are not a claim that the user has already approved every changed role or public-access policy.

## Repository and external references

| ID | Source | What it establishes / limit |
|---|---|---|
| R01 | [Branch/commit/PR inventory](https://github.com/davidelaverga/Sophia/branches) | Read-only remote metadata; see the complete register. Repository refs and checks can advance after this review. |
| R02 | [S1-03 merged PR and acceptance limits](https://github.com/davidelaverga/Sophia/pull/2) | Bridge/supervisor and two rounds of recovery repair; fixture service/mock model tests are not the production crossing. |
| R03 | [Working destination map](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/docs/DESTINATION_MAP.md) | Built/partial/unbuilt code destinations at the working head; frozen plan statuses are not live progress. |
| R04 | [Current API registration](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/apps/api/src/app.ts) | Registers product/room/access/event routes, not the bridge runtime-service routes. |
| R05 | [Native bridge transport](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/packages/dsh-bundle/src/transport.ts) | Existing /v1/runtime/hello, commands, receipts, observations and ready calls. Returned bodies are locally cast; bind and validate them in the real service. |
| R06 | [Local runtime wire types](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/packages/dsh-bundle/src/protocol.ts) | Command/receipt/binding types are a local integration contract requiring a canonical product-side binding. |
| R07 | [LiveKit token and removal helper](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/apps/api/src/livekit.ts) | One-room token grants, role-derived publication and a best-effort removal helper that returns false on failure. |
| R08 | [Room access routes](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/apps/api/src/routes/access.ts) | Guest scope, invitation/lobby decisions and calls to removeFromRoom; database denial is not evidence of live disconnection. |
| R09 | [Existing room/floor routes](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/apps/api/src/routes/rooms.ts) | Reuse A01 transferInputFloor. Viewer members currently receive subscribe-only grants. |
| R10 | [RoomStage light state](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/apps/studio/src/features/voice/RoomStage.tsx) | Live/reconnecting room state currently selects listen for the light. This is not provider/exchange readiness. |
| R11 | [Root checks and scripts](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/package.json) | Node 24.21.0; pnpm 11.7.0; check, test:db, contracts:check, db:migrate, live:steer. |
| R12 | [Hosted Supabase runbook](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/deploy/supabase/README.md) | Restricted application login, session pooler/TLS, migration ledger and owner-only operations; includes historical Pending text contradicted by later reports. |
| P02 | [Original S1-02 goal](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/docs/pack/delivery/goals/S1-02.md) | Original database/API/admission/snapshot acceptance; not superseded wholesale. |
| P03 | [Original S1-03 goal](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/docs/pack/delivery/goals/S1-03.md) | Public Agent bridge and live steering/role/continuation requirements. |
| P04 | [Original S1-04 goal](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/docs/pack/delivery/goals/S1-04.md) | Studio shell and room; active contract amendments move the floor into this goal. |
| P05 | [Original S1-05 goal](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/docs/pack/delivery/goals/S1-05.md) | Real Gemini voice, asynchronous work, selected vision and recovery. The next goal is a bounded integrated slice, not full closure by relabeling. |
| P06 | [Voice and vision design](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/docs/pack/architecture/06_VOICE_AND_VISION.md) | Gemini 3.8 Live via Gemini API, raw LiveKit, four lifecycles, input/output/observation epochs and nonblocking admission. |
| P12 | [Data and API bindings](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/docs/pack/architecture/12_DATA_AND_API_BINDINGS.md) | Accepted state, scoped transactions, decimal-string API sequences, outbox/unknown outcomes, replay and source control. |
| P13 | [API route binding map](https://github.com/davidelaverga/Sophia/blob/29a570c33feb97a6bc04ea357c84087a47c9b055/docs/pack/api/route-bindings.json) | Distinguishes designed contribution/exchange routes from existing implementation. No generic native-task creation route is already delivered. |
| R13 | [Studio extensions and open decisions](https://github.com/davidelaverga/Sophia/pull/12) | 43-finding QOL audit and current unanswered UX choices. No comments were returned by the PR discussion endpoint during this review. |
| R14 | [Current CI evidence](https://github.com/davidelaverga/Sophia/actions/runs/36101824521) | Successful runtime-unit, PostgreSQL 16 and local-Supabase-auth jobs at working head; not a live provider acceptance run. |
| E01 | [LiveKit token lifetime](https://docs.livekit.io/home/server/generating-tokens/) | External official documentation: token expiry governs initial connection, not a guaranteed deadline for an already connected participant. Provider removal/reconciliation remains necessary. |
| E02 | [Google Live session management](https://ai.google.dev/gemini-api/docs/live-api/session-management) | External official guidance for compression, GoAway and session resumption; selected SDK/model must be exercised on the project route. |

## User-provided sources

**U01 — Sophia-beyond-Sprint-1.pdf**, six pages, dated 25 September 2026. Pages 1–4 describe the stack, media/visual additions and amendments; page 5 reports the hosted tuple and owner settings; page 6 lists integration steps and unresolved product decisions. Read in full, including its tables. Hosted statements are Luis's report, not independently verified operator observations.

**U02 — communication procedure(2).md**, complete text. A compact per-author mailbox/status convention, boundary checks, no acknowledgement loops, no new authority, no secret forwarding, and a warning that writing a file does not wake an idle agent. Its old Sophia-Agent absolute path is deliberately not reused.

**U03 — 5b6cb486-5c3f-4234-b32b-fc651c40d92f.mp4**, 39.20 seconds. Visual samples span identity selection, room/invitations and other project views.

**U04 — 7feabdee-af58-4904-b5b7-ab1d2c43195a.mp4**, 46.90 seconds. Visual samples show the presence concept and explicit state controls. It is not accepted as evidence of real Gemini inference.

Audio was not transcribed or assessed. Both video tracks were sampled across their full durations, with selected frames inspected more closely. This cannot establish conversational latency, two-human audio quality, or every transient UI behavior. See [video review](evidence/VIDEO_REVIEW.md).

## Evidence language used throughout

- **Implemented:** source exists at the named revision.
- **Reported tested/deployed:** a handoff, PR or Luis report makes the claim.
- **CI observed:** GitHub exposes a matching successful check at the named head.
- **Visually observed:** appears in the supplied sampled recording frames.
- **Not established:** not supported by the inspected source or verified execution.
- **Proposed:** this packet's engineering/product decision; implementation and appropriate approval still required.

No local code suite, paid provider call, hosted database inspection, authenticated application test, deployment or schema change was executed in this audit. Public-site inspection attempts did not return usable live evidence. The repository was not modified. The audit covers all visible refs and reachable commit metadata plus selected critical source paths, not a line-by-line audit of the complete diff or a security certification.

Older Claude plans present in the Project are historical research, not authority to replace the selected dsh/voice-first direction.
