# Repository and ownership map

**Decision:** a new repository named `sophia-next`. The map below is a proposed source layout, not a claim these paths already exist in Sophia-Agent. All imports from a donor get a source/license record. Keep product code out of the pinned upstream dsh checkout.

```text
sophia-next/
  AGENTS.md                         # this pack's agent contract
  package.json / pnpm-lock.yaml      # exact workspace dependency resolution
  pnpm-workspace.yaml
  apps/
    studio/                         # React/Vite application, deployed to Vercel
      src/app/                      # router, authenticated shell, providers
      src/features/studio/          # Converse, Explore, Build lenses
      src/features/voice/           # room tracks, input floor, exchange controls
      src/features/review/          # inspect/select, annotations, change intent
      src/features/work/            # work pulse, controls, progress review
      src/features/attention/       # required actions and optional opportunities
      src/features/knowledge/       # source import, records and memory review
      src/features/source-editor/   # bounded source editor and diff
    api/                            # Fastify HTTP, auth, command admission, SSE
      src/routes/                   # project/work/voice/artifact/resource APIs
      src/services/                 # domain use cases; no model loop
      src/projectors/               # deterministic screen projections
    worker/                         # SQL job/outbox consumers and scheduler
      src/jobs/                     # import, images, render, lead review, cleanup
    execution-host/                 # private VM supervisor, no public agent UI
      src/runtime-supervisor.ts     # launch official dsh, leases, home volumes
      src/workspace-supervisor.ts   # no-secret task containers, build processes
      src/artifact-gateway.ts       # authenticated preview routing and snapshots
    media-bridge/                   # raw LiveKit RTC ↔ Google Live
      src/room-session.ts
      src/input-floor.ts
      src/audio-pipeline.ts
      src/visual-input.ts
      src/google-live.ts
      src/tool-router.ts
      src/playback-epoch.ts
  packages/
    contracts/                      # command/event/record schemas; generated clients
    domain/                         # accepted goals, authority, versions, transitions
    persistence/                    # Postgres queries, transactions, outbox
    context/                        # scoped ContextPacket compiler and invalidation
    dsh-bundle/                     # package.json dsh.bundle + cordis.patch.yml
      src/control-bridge.ts         # application command ↔ public Agent operations
      src/role-registry.ts           # guide/lead/research/prototype/reviewer presets
      src/tools/                    # typed domain/workspace/source tools
      prompts/                      # stable identity/voice + role instructions
      skills/                       # procedural task knowledge, not runtime state
    execution-adapters/
      src/omnigent/                 # only package aware of Omnigent route details
      src/native-team/              # dsh-team projection bindings
      src/mailbox/                  # durable cross-runtime peer protocol
    creative/
      src/images/google.ts
      src/images/openai.ts
      src/assets.ts
      src/prototype-bundle.ts
    ui/                             # Luis's tokens, primitives and common renderers
    test-support/                   # semantic fixtures, controlled failures, replay
  renderers/
    python/                         # selected legacy renderer jobs, isolated process
    web/                            # browser render/export jobs with pinned Chromium
  config/
    runtime-unit.json               # dsh/provider/preset/codec compatibility unit
    models.json                     # exact configured route IDs and capability limits
    roles.json                      # tools and resource defaults by role
    dsh/                            # generated profile installation artifacts
  db/migrations/                    # new schema; no automatic old DB migrations
  deploy/
    render/                         # API and Omnigent specifications
    execution-host/                 # Compose, images, volumes, network, health
    vercel/                         # static Studio routing and headers
  tests/
    contracts/ integration/ e2e/ fixtures/
  docs/                             # this documentation, source register and decisions
  planning/                         # versioned goal definitions; no private runtime logs
```

## Dependency direction

`contracts` has no application or provider dependency. `domain` depends on contracts, not Fastify or a model SDK. Persistence implements repositories used by domain services. The UI calls only Sophia's API and room transport. The dsh bundle and media bridge call scoped Sophia APIs; they never write accepted state directly. Execution adapters translate native facts and controls; they do not decide product intent. Renderers return candidates; they do not publish acceptance.

Do not make `domain` import `dsh`, `@google/genai` or Omnigent. Do not give the browser an Omnigent administrative client, a service-role database key, a model API key or a native runner token. Avoid a generic `utils` package that accumulates ownership-sensitive behavior.

## Important module boundaries

| Boundary | Input | Output | Owner |
|---|---|---|---|
| API admission | authenticated actor + typed command + expected revision | durable command ID and pending/denied receipt | Luis |
| Context compiler | exact project/work/audience/source eligibility revision | bounded ContextPacket plus included/excluded refs | Davide |
| Runtime control | leased typed command + current attempt | dsh observation, native IDs and bounded output | Davide |
| Media | eligible track/frame + current exchange epoch | audio, attributed transcript, admitted tool request | Davide with Luis on room/API |
| Engineering bridge | owner-bound resource/session + goal/amendment | actual receipt/status/candidate refs | Davide; Luis integration review |
| Prototype workspace | frozen source + allowed edit/run operation | new source candidate + logs + preview identity | Luis |
| Artifact publication | candidate identity + checks + acceptance rule | expected-base accepted-version change | Luis |
| Attention projection | current HumanAction/opportunity/work | same object rendered across lenses/devices | Luis |

## Runtime data is not source code

On the execution host, allocate a separate persistent home per project/runtime unit, for example `/srv/sophia/projects/<opaque-id>/dsh-home/`. This is an operator-owned path template, not a user's real path. Source candidates and task workspaces live under separately mounted volumes. Do not mount the host home, Docker socket, cloud credentials or other project directories into a dsh or build container.

The execution host has the Docker socket; the model does not. Build containers receive only the exact task source and a capability-limited result-upload path. Public previews use a separate origin and no Sophia session cookies.

## Code versus design assets

Retain the identified `Sophia_Studio_V1_Evolved_V2_R1.html` as a visual/semantic reference, with its hash in `references/UI_REFERENCE.md`. It is not the production controller to copy wholesale. Transfer the chosen tokens and interaction meanings into React components. Retain the current legacy app unchanged until a route has deliberately migrated.

Store selected generated image bytes as immutable project assets with provenance. Do not encode a complete UI as a flat picture. Do not commit customer exports, private transcripts, audio, native credential files or model histories to Git. Source/build samples in tests use synthetic data.

## Toolchain pinning

Use the dsh commit and package version in `config/runtime-unit.json`. Resolve and commit the ordinary frontend/Fastify/Postgres dependency lock during S1-01, then retain it; this document does not invent unverified current patch versions. Pin Chromium and renderer binaries with the images that contain them. Reproducibility is a committed lock and digest, not a sentence saying “latest.”
