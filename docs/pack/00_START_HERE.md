# Sophia implementation map

**v0.3 · Part 1 · 24 September 2026**  
**Owners:** Davide and Luis. **Product baseline:** the three releases in v0.2, with the latest explicit Gemini 3.8 Live and dual-vendor image decisions.  
**Deliverable:** source-grounded design and initial implementation briefs. **Not:** implemented software, a production release, or a provider-policy certification.

## Read in this order

For a person: [Sophia end to end](01_SOPHIA_END_TO_END.md) → [decisions](02_DECISIONS.md) → [three releases](delivery/ROADMAP.md).

For a coding agent: [AGENTS](AGENTS.md) → [repository map](03_REPOSITORY_MAP.md) → the assigned goal in [goal index](delivery/GOAL_INDEX.md) → only its listed architecture chapters and source entries. Read the named upstream files at their recorded pin before editing that boundary. Do not load every historical archive into every agent.

## Complete documentation map

| Document | Purpose | Depth in this installment |
|---|---|---|
| [End to end](01_SOPHIA_END_TO_END.md) | Human-readable product, experience, responsibilities and three releases | Complete project orientation |
| [Decisions](02_DECISIONS.md) | Settled choices and reasons; no framework selection exercise remains | Explicit decisions |
| [Repository](03_REPOSITORY_MAP.md) | New monorepo, package boundaries and deployment units | File/module-level target map |
| [System](architecture/01_SYSTEM.md) | Data and command flow, authority, runtime and media separation | Integration design |
| [DeepSeek](architecture/02_DSH_BOOTSTRAP.md) | Starting at upstream root, profile, bundle, Agent and tools | Source-mapped binding design |
| [Backend](architecture/03_BACKEND.md) | Records, API groups, jobs, streams, replay and controls | Concrete application contract; SQL migration implementation is Part 2 |
| [Frontend](architecture/04_FRONTEND.md) | Screens, components, independent local focus, cards, preview and source | Concrete interaction/component contract; full component task specifications are Part 2 |
| [Engineering team](architecture/05_EXECUTION_TEAMS.md) | All three resources, owner binding, messages, heartbeat and source handoff | Chosen design; exact Omnigent endpoint matrix is Part 2 |
| [Voice/vision](architecture/06_VOICE_AND_VISION.md) | Gemini 3.8 Live, LiveKit, floor, async tools, capture and recovery | Detailed protocol/lifecycle design |
| [Images](architecture/07_IMAGE_GENERATION.md) | Google/OpenAI adapters, exact model IDs, output/asset lifecycle and evaluation | Detailed API design and request specimens |
| [Creation/review](architecture/08_CREATION_AND_REVIEW.md) | Native prototypes, reports/decks, snapshots, co-review and S2 edits | Source handoff contract; legacy renderer extraction closure is Part 2 |
| [Memory](architecture/09_MEMORY_AND_CONTEXT.md) | Accepted state, scoped sources, bounded recall, imports and learning | Data/use contract; migration/RLS proof is Part 2 |
| [Operations](architecture/10_OPERATIONS_AND_TESTS.md) | Hosts, isolation, secrets, first run, release checks and upgrades | Concrete operating decisions; deploy manifests are Part 2 |
| [Donor atlas](sources/DONOR_ATLAS.md) | Exact source → destination → adaptation → proof | Detailed on inspected seams, explicit residual audits |
| [Source register](sources/README.md) | Source identity, coverage and limits | Machine-readable companion included |
| [Goal index](delivery/GOAL_INDEX.md) | Milestones and executable goal sessions | S1 individual briefs; S2/S3 goal outcomes mapped |
| [Contracts](contracts/README.md) | Initial record/event vocabulary | JSON examples and interface specification, not a generated SDK |
| [Extensions](extensions/EXTENSIONS.md) | Valuable future work kept out of first-release dependencies | Chosen extension boundaries |
| [Continuation](CONTINUATION.md) | Exact next documentation pass | No need to reconstruct the project |

## What can begin now

S1-01 through S1-05 establish the repository, durable project, real dsh controls, initial room and real voice. S1-06 implements image jobs; S1-07 starts native prototypes against the specified workspace boundary. These are not a separate infrastructure sprint: each connects to a real screen and contributes to the first product.

The three-engineer contract is settled, but the complete native API mapping still needs the Part 2 source audit. Do not invent Omnigent URLs, pretend edit access grants host launch, or claim an imported desktop session can be controlled without its native identity and supported route. The assigned S1-09 goal starts with that explicit binding work.

## Status language

`design_ready` means the behavior and boundaries are specified. `binding_audit_pending` means the chosen integration still needs the named low-level source/API audit. `not_started` means no product implementation result is claimed. A goal may have several attempts and coding chats; its acceptance does not reset with each session.

The pack deliberately does not claim to finish every code-level detail in one response. It gives the whole map, resolves the core choices, and supplies the deeper first installment. The next pass completes the exact external-engineer, data-migration and frontend implementation bindings without reopening the architecture.
