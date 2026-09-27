# Sophia implementation map

**v0.4 · Part 2 · cumulative delivery · 24 September 2026**  
**For Davide, Luis and their coding agents.** The three-release product direction remains unchanged. This pack includes Part 1 plus exact engineer/data/frontend/renderer bindings and executable local reference logic. It is not a deployed application.

## Reading paths

For a person: [Sophia end to end](01_SOPHIA_END_TO_END.md) → [what Part 2 changes](04_PART2_CHANGELOG.md) → [three releases](delivery/ROADMAP.md) → [what is actually tested](05_IMPLEMENTATION_STATUS.md).

For a coding agent: [AGENTS](AGENTS.md) → [repository map](03_REPOSITORY_MAP.md) → the assigned [goal brief](delivery/GOAL_INDEX.md) → its architecture/source entries → [integration session](delivery/sessions/S1_BINDING_SESSIONS.md). Use the latest accepted goal/decision, not a historical draft. Do not load the entire research archive into every agent.

## Complete map

| Area | Main document | Concrete companion |
|---|---|---|
| Product | [End to end](01_SOPHIA_END_TO_END.md) | [Decisions](02_DECISIONS.md), [status](05_IMPLEMENTATION_STATUS.md) |
| Repository | [New monorepo](03_REPOSITORY_MAP.md) | Exact destination map, source-vs-runtime separation |
| System | [Architecture 01](architecture/01_SYSTEM.md) | Accepted state, runtime, media and effect responsibilities |
| dsh startup/extension | [Architecture 02](architecture/02_DSH_BOOTSTRAP.md) | [Runtime configuration](config/README.md) |
| Backend | [Overview 03](architecture/03_BACKEND.md), [bindings 12](architecture/12_DATA_AND_API_BINDINGS.md) | [SQL candidates](db/README.md), [API/types](api/README.md) |
| Frontend | [Overview 04](architecture/04_FRONTEND.md), [bindings 13](architecture/13_FRONTEND_BINDINGS.md) | [Actual-reference crosswalk](frontend/README.md) |
| Engineering team | [Overview 05](architecture/05_EXECUTION_TEAMS.md), [bindings 11](architecture/11_OMNIGENT_BINDINGS.md) | [Native wire fixtures](api/omnigent-wire-fixtures.json) |
| Voice and vision | [Architecture 06](architecture/06_VOICE_AND_VISION.md) | Chosen Gemini Live/LiveKit lifecycle and source context |
| Images | [Architecture 07](architecture/07_IMAGE_GENERATION.md) | Exact retained provider/model routes and asset lifecycle |
| Creation/review | [Overview 08](architecture/08_CREATION_AND_REVIEW.md), [renderers 14](architecture/14_RENDERER_EXTRACTION.md) | [Extraction unit](renderers/README.md) |
| Memory | [Architecture 09](architecture/09_MEMORY_AND_CONTEXT.md) | Source/lineage/Forget and current accepted records |
| Operations | [Overview 10](architecture/10_OPERATIONS_AND_TESTS.md), [deploy bindings](ops/DEPLOYMENT_BINDINGS.md) | [Deployment units](ops/deployment-units.json) |
| Execution evidence | [Reference logic](implementation/README.md) | [Validation evidence](evidence/README.md); no live integration claims |
| Delivery | [24 goal briefs](delivery/GOAL_INDEX.md) | [S1 binding sessions](delivery/sessions/S1_BINDING_SESSIONS.md) |
| Provenance | [Source register](sources/README.md), [donor atlas](sources/DONOR_ATLAS.md) | Exact pins, coverage and retained versus fresh audit |
| Future work | [Extensions](extensions/EXTENSIONS.md) | [Continuation](CONTINUATION.md) |

## What begins now

Run the disposable database/API slice and owner-account/native bridge slice in parallel after the shared identities are agreed. Build the Studio/voice/prototype path against those exact contracts. Every increment returns something real to the workspace; no extra infrastructure-only release or broad qualification campaign was added.

The source audit resolves the selected native path, not its installed behavior. Product code and live evidence remain in the existing goals. The original v0.3 ZIP is preserved; use this cumulative pack as the new active map, not both as competing instructions.

## Status terms

`design_ready` / `implementation_brief_ready`: behavior and destination are specified. `source_bound_live_probe_required`: selected donor path is audited; installed behavior still needs its finite live proof. `not_started`: no new product implementation completion is claimed. Local reference tests have their own evidence status and never close a product goal.
