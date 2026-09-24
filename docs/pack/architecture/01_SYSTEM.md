# System architecture: one product, explicit responsibility boundaries

**Design contract.** See [source register](../sources/README.md) for upstream facts. All `sophia.*` records, routes and services below are new application contracts.

## The deployed shape

```text
Browser Studio (Vercel)
  │ HTTPS commands / authenticated SSE           │ WebRTC room tracks
  ▼                                              ▼
Sophia API (Render)                          LiveKit Cloud
  │ Auth + accepted state + outbox                │
  ├──────────────► Supabase Postgres/Storage      ▼
  │                                        Media bridge (private execution host)
  │                                           │ Google Gemini 3.8 Live
  │ scoped command/result channels            │ scoped tools back to API
  ▼
Execution host (private Linux VM)
  ├─ SQL job consumer / runtime supervisor
  ├─ project dsh container: official launcher + Sophia Cordis bundle
  ├─ isolated prototype/build/render containers
  └─ authenticated preview gateway

Sophia API ── scoped adapter ──► Omnigent (Render)
                                 ├─ Davide's host: Codex / Claude Code
                                 └─ Luis's host: Claude Code
```

This is a deployment map, not a requirement that each TypeScript package become a network service. The API, domain services and event projectors share one application. The worker and media bridge can run as separate processes on the same private host. Generated code and native media bindings are deliberately kept away from the public API process.

## Three kinds of truth

**Accepted product state** answers who is a member, what goal is in force, which source is selected, who owns a connection, what is permitted and what version was accepted. Postgres owns it.

**Execution observations** answer what a dsh session or native engineer emitted, which request was accepted, which tool finished and what evidence returned. Native logs remain native; Sophia persists normalized observations with native IDs and cursors. It does not replace a native transcript with a model summary and call the summary authoritative.

**Interpretation** answers whether the work appears aligned, whether a result merits review and what lesson might apply next time. Models propose it, source-linked. Interpretation cannot manufacture permission or a passing check.

## End-to-end command path

1. Studio or the voice bridge submits a typed action to the API. The API derives actor and audience from authentication and the active interaction; model-supplied `userId` is not trusted.
2. A single database transaction validates the current goal/source/grant revision, inserts a command with an idempotency key, appends a semantic event and enqueues dispatch.
3. The worker claims dispatch under a lease. A specific route receives the command: dsh Agent operation, native-engineer input, image API call or controlled build job.
4. The adapter records the actual native receipt. The original command stays the same across a reconnect. Ambiguous delivery is reconciled before retrying a potentially effectful operation.
5. Source, result or progress observations update projections. A model can explain them; it cannot change their meaning by saying “done.”
6. A candidate is evaluated against the applicable goal/source revision and accepted under the team's rule. Publication/merge/deployment has separate authority.

## Runtime isolation

The project runtime is not a room. Leaving a room or ending audio does not dispose an authorized worker. A project runtime container holds only that project's eligible context and scoped application token. Native research/prototype work receives bounded ContextPackets, not the guide's entire conversation or everyone's private memory.

The public API authenticates every request even when a runtime already belongs to the project. Membership and grants may change while it is active. A run/authority epoch lets the API reject late writes from an old worker after Hold, Stop or transfer. The runtime supervisor releases its lease only after settling or marking uncertain effects; a new owner does not inherit permission merely because a clock expired.

## No hidden second orchestrator

dsh runs native reasoning. Sophia owns the project goal graph and records. The dsh goal driver may continue a bounded native work goal; it must not also run the periodic project review. Omnigent operates native sessions but does not own the roadmap. A goal coordinator can sequence its assigned workers, not launch a second project-wide “keep going” loop.

The project review scheduler wakes the technical lead with a review request. It does not periodically inject “continue” into every healthy engineer. A native route's continuation owner is stored on its binding: `native_goal`, `sophia_driver` or `human`. Exactly one owns continuation.

## Audio is a separate lifecycle

The media bridge owns Google connections and LiveKit tracks. It publishes a single Sophia audio track per room. Ordinary conversation uses Live directly, with project tools. Work admission goes through the same domain API as text; the microphone cannot bypass the work contract.

Long jobs end their admission tool call quickly with a real work ID. Their results enter the shared event stream. A presence policy decides whether to show a quiet update, an optional card or an idle spoken update. This prevents a finished sentence from ending a build and a background result from speaking over the user.

## Source identity across boundaries

A handoff contains an immutable source-bundle ID, base revision, asset references, mock-to-real map, allowed changes, preservation requirements and checks. A native worker's local path is meaningful only on its owning host. Cross-host handoff uses source objects, Git commits or permitted patches, never a fabricated common absolute path.

Only a candidate with a resolved source/build identity becomes a preview. The last stable preview remains visible during a failed revision. S1 protects continuity and inspects changes; S2 adds mechanically restricted component revisions. [P-01]

## Failure behavior

| Failure | Product response |
|---|---|
| Browser disconnects | Work continues within authority; reconnect gets snapshot plus events after its cursor |
| Google connection closes | Audio recovery; same work continues; no duplicate job admission |
| dsh dies | Preserve native log and product obligations; resume compatible unit or reconstruct explicitly |
| Native host sleeps | Mark unavailable, not failed or completed; retain pending requests; no silent payer switch |
| Image request times out after possible acceptance | Mark outcome uncertain; reconcile available provider result before a billed retry |
| New source supersedes reviewed source | Keep the old comment attached; rebase/amend the current work explicitly |
| Stop races a late completion | Record returned evidence, but deny new publication under the stopped epoch |

A source-pinned runtime narrows uncertainty; it does not remove it. Tests in the goal briefs exercise these crossings rather than treating a green unit suite as a live product demonstration.
