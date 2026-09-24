# Native creation, runnable prototypes and review-to-work handoff

**S1 product:** Sophia creates useful source-backed artifacts and UI prototypes; people can review and steer real engineering. **S2:** precise source/component revision is enforced on supported formats. [P-01]

## 1. Prototype profile and execution boundary

The native `sophia-prototype-v1` dsh role receives the selected brief, references, design tokens, approved assets, target stack and relevant source. It does not receive the whole personal conversation. Its tools read/patch the assigned workspace and request builds through the workspace service.

The initial prototype recipe is React + TypeScript + Vite, with one lockfile and local approved assets. The role produces source files, not a flat website image. A first coherent screen is built early, then normal/loading/empty/error states for the selected flow. Stateful fixtures are explicit. The team can begin directly in Build without first approving an image mockup when the brief is already clear.

The workspace supervisor starts a no-secret build container with the frozen source bundle. Dependencies resolve through a controlled installation step, then execution is constrained to the task workspace and approved network access. The application API, model keys and other projects are not mounted. Run scripts cannot access the Docker socket. Return build logs, source hash, preview process/URL, declared mock map and actual checks.

## 2. Luis edits source inside Sophia

Preview/Source/Diff reads one candidate identity. A patch includes expected file/source hashes, changed content and the user's actor. The server rejects a stale base. “Take control” holds the affected agent writer before allowing human changes. A save creates a candidate; a build checks that candidate; acceptance/publication remains separate.

The source editor does not need arbitrary terminal access or package administration. Add scoped run/build buttons. Dependency additions are visible source changes. The first supported path must rebuild outside the original transient preview using its exported source and lockfile.

## 3. Preview the complete application

For the first integrated application, external engineers deploy a preview using their already connected tools. The handback includes source commit/tree, URL, build identity, required environment/configuration, declared real/mocked services and scoped checks. Configure that owned preview to permit embedding in Sophia's chosen origin.

The Studio iframe lives on a separate origin from Sophia and receives no Sophia cookies or service credentials. The preview bridge validates sender origin, preview ID and nonce before accepting selection/annotation messages. Never use an unrestricted `postMessage('*')` command channel to a generated app.

Arbitrary third-party URLs may prohibit embedding or share private credentials. They remain link-only until a permitted observation route is supplied. That does not narrow the first-release goal: the representative app is under the team's control and must support in-app preview. A remote-browser observation adapter is an extension, not an invented iframe bypass.

## 4. Executable handoff

The technical lead compiles one immutable handoff:

| Section | Content |
|---|---|
| Outcome | goal/revision, user benefit, criteria and non-goals |
| Starting material | exact source bundle/commit, run command, lockfile, component paths |
| Design | approved tokens, asset IDs/hashes, chosen reference and alternatives retained |
| Behavior | main flow and relevant empty/loading/error/permission states |
| Integration map | each mock, intended real service/interface and verification needed |
| Change/preserve | permitted code areas, accepted behavior to retain, known cross-cutting risks |
| Authority | owner resource, environment, allowed effects, budget and reserved decisions |
| Return | source/diff, working preview, tests, failures, deviations and unresolved questions |

The engineer acknowledges actual intake/base and reports missing mandatory material or a stack mismatch. The brief is not silently rewritten. Later instruction becomes a versioned amendment, tied to its source contribution and reviewed preview.

## 5. Research and ordinary artifacts

Research has scoped web lookup, exact page/source reads, uploads and citations. Google-grounded lookup is a capability job returning cited evidence; it does not become the complete project memory. The native worker can compare or synthesize sources. A claim remains attached to its evidence and uncertainty.

HTML reports are retained as source plus approved assets. PDF and PPTX outputs are produced by isolated format jobs, not by copying the old companion/Builder orchestration. Reuse the current Sophia rendering knowledge and format code deliberately.

**Exact legacy entry points:** at the pinned Sophia source, `backend/packages/harness/deerflow/sophia/tools/create_pdf_artifact.py` is a modest deterministic PDF wrapper importing `ToolRuntime` and thread path helpers. It is not the rich general HTML renderer. `build_deck_from_slides.py` is the identified deck wrapper entry point. The latter's complete compiler/asset closure and the rich PDF renderer are the named Part 2 extraction audit. [OLD-01, OLD-03]

**Decision:** keep compatible Python renderers as job processes with a plain JSON/file input/output contract; replace thread/path and `ToolRuntime` dependencies at the adapter boundary. Do not rewrite mature formatting logic into TypeScript solely for language consistency. Do not claim all dependencies have already been extracted.

## 6. Review S1: intention reaches the right worker

A ReviewIntent binds current preview/source version, selected region/component evidence, exact relevant text, the requested change, preservation constraints and the contributor. The lead checks it against the current goal and worker assignment, then sends an amendment. The stable candidate stays visible.

When the worker returns, compare source/diff and rerun relevant checks. The UI can say which requested changes were observed and which remain unknown. The absence of exact edit enforcement in S1 does not justify unversioned overwrite or silently dropping preservation constraints.

## 7. Review S2: enforce a scoped mutation

Adopt the useful transaction semantics from `build_mutation.py`: expected manifest/artifact/component versions, restricted targets, a staged candidate and one publication boundary. Implement these against the new artifact service, rather than porting its old orchestration dependencies. [OLD-02]

For supported source-backed documents/decks, check non-target source components before recomposition and publication. For applications, expand declared impact when a shared dependency changes. Arbitrary imported PDF/PPTX conversion is a separately disclosed import operation, not a promise of lossless surgical editing.

## 8. Simulation and evidence

S1 uses simple runnable state fixtures. S2 uses Storybook where it fits component scenarios, MSW for explicit service responses and Playwright for actual application interactions/traces. dsh replay tests the agent loop under recorded model output; it does not simulate an application's business behavior. [DSH-17, TEST-01/02]

A simulated booking success remains simulated until the real service exists. A browser video shows what happened visually; assertions and service evidence establish the particular properties checked. The final goal cannot be accepted solely from a model's positive summary.
