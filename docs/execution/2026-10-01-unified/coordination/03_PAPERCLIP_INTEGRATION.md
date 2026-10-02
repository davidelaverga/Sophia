# Paperclip integration — bounded backend adoption

## 1. Adopt a coherent system, not copied services

Candidate source for qualification: `paperclipai/paperclip@5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb`. Build/pin the actual server and our plugin/adapter artifacts before deployment; this source pin is not an image digest. Keep its database/migrations separate from Sophia's application schema. Do not point Paperclip at Sophia tables and expect shared transaction semantics.

Adopt core issues, assignees, dependencies, run/wake bookkeeping, routable waits and bounded operational recovery. Keep Studio as the user surface. Do not install a generic CEO agent or enable every upstream routine. Management policy remains the dsh technical lead plus deterministic admission rules.

The implemented plugin surface is alpha, supports scoped API routes and owned database namespaces, and treats installed plugins as trusted code. It does not permit arbitrary core-table writes through plugin SQL. Use supported core host APIs, not direct mutation of upstream status rows. [P01]

## 2. Proposed code destinations

| New destination | Responsibility |
|---|---|
| `packages/coordination/` | Sophia work-binding types, intent admission, state projection and effect permits |
| `packages/paperclip-plugin/` | Trusted namespace routes, operational bridge and core resource integration |
| `packages/paperclip-adapters/` | `sophia-dsh` and `sophia-owner-session` external adapter packages |
| `packages/execution-adapters/src/omnigent/` | Retained architecture 11 owner-native transport |
| `apps/api/src/routes/coordination/` | Member-scoped work/decision/control actions over existing use cases |
| `apps/worker/` additions | Delivery/reconciliation consumers; not a second planning/continuation scheduler |
| `deploy/paperclip/` | Isolated service build, configuration and operated release docs |

Verify conventions before creating files; these paths are planned. Never import upstream server internals into the dsh bundle just to get issue methods.

## 3. Identity without pretending Supabase is Paperclip auth

For the first founder project, provision a dedicated **Sophia integration board principal** in its Paperclip company, with no instance-admin role. Its token remains backend-only and is used only on a fixed Paperclip origin. Instance administration/install uses a separate operator credential, never the runtime one. Paperclip's board-token code binds keys to actual users and current memberships; it is not a generic “userId” impersonation API. [P04]

Paperclip sees that integration principal honestly. The application records the initiating Sophia human or assignment separately in a signed command envelope. The plugin checks signature, audience, current project/company mapping, expiry, nonce, request digest and grant revision, then calls back for current authorization when an effect is admitted. Never pass an unauthenticated `actorId` into an admin request and call it delegation.

For automation, a Paperclip run also carries its actual assigned agent/run identity. Treat the integration principal, initiating human, project technical lead and resource owner as distinct audit fields. Permission to run an assignment does not permit it to change its owner or budget. Native account credentials remain with their owner; Paperclip API keys are not provider login tokens.

Only the internal network/authenticated gateway reaches this service. Normal Sophia users receive no Paperclip board token or generic proxy. Keep upstream administration out of the public Studio. An operator using the upstream board is privileged maintenance, not an ordinary collaborator; even a core task reassignment cannot bypass Sophia's current effect permit.

SCM-01 must bind the real token-creation/validation and route APIs against the pin. The inspected service implementation establishes key semantics, not an assumed public endpoint. Return a blocked configuration state if the intended least-privilege topology cannot be implemented; do not silently switch to `local_trusted` or a shared admin token.

## 4. New plugin routes: explicitly Sophia-owned

Proposed plugin ID: `sophia.coordination`. The following are **new routes to implement**, not existing upstream endpoints:

```text
POST /api/plugins/sophia.coordination/api/projects/:projectId/commissions
POST /api/plugins/sophia.coordination/api/issues/:issueId/control
POST /api/plugins/sophia.coordination/api/issues/:issueId/peer-messages
POST /api/plugins/sophia.coordination/api/issues/:issueId/observations
GET  /api/plugins/sophia.coordination/api/projects/:projectId/projection
```

Declare each through the actual manifest `apiRoutes` contract. Resolve company from host-owned issue/project records or the validated mapping, not arbitrary JSON. Require both host authorization and the Sophia command/effect checks. Body schemas are bounded; no user-supplied upstream origin, arbitrary filesystem path, raw SQL or executable bundle is accepted.

Plugin namespace records may contain operation dedupe/reconciliation, peer receipts, binding indexes and projection cursors. The issue, assignment and dependency itself remain core records. Do not implement a private duplicate issue state machine behind the plugin.

## 5. External execution adapter binding

Each adapter implements the pinned `ServerAdapterModule` contract and separate `testEnvironment`. `testEnvironment` reports installation/auth/capabilities without automatically purchasing a model call. An optional real probe is separately authorized.

On `execute(ctx)`:

1. Decode and validate the server-owned continuation and binding. Check current core issue/run and Sophia control generation.
2. Register `await ctx.onCancellationReady?.()` before any remote work; attach `ctx.signal` immediately and test the pre-aborted case.
3. Request an effect permit for this exact attempt, source manifest, resource and allowance. A denied permit is a gate, not a bootstrap retry.
4. Reconcile a previously created native attempt by its stable identity. When genuinely starting remote work call `ctx.onDispatch?.()` immediately before the effect, not on task creation.
5. Observe through bounded receipts and events. Retain native session params and display identity. Avoid raw transcript logs, secret-bearing metadata or unbounded `onLog` payloads.
6. On native completion validate source/result evidence, capture it, reconcile the run and record the proper next owner. Return a result with explicit usage basis and billing type; `costUsd: null` is valid when unknown.
7. On cancellation fence first, stop/drain, verify and reconcile. No `onProviderStopped` or recoverable-interruption assertion on a bare timeout.

Use `sessionParams`/`sessionDisplayId`, not one ambiguous global session string. Return `usageBasis: per_run` or `session_cumulative` only when true; otherwise mark unknown and avoid presenting guessed costs. A native provider refusal, quota wait, configuration error and unknown effect have different recovery paths. [P02]

## 6. Remote work survives the adapter host

A server restart may kill the observer without killing the owner's native process. Therefore the next admitted episode first reconciles the existing attempt, source and native session. It may attach to the same work if authorized; it must not launch another writer because a Paperclip run was marked terminal during crash recovery.

If upstream recovery scheduling attempts another episode while native state is uncertain, Sophia's effect permit refuses new execution and returns a routable reconciliation hold. This is an effect safety check, not a second scheduler. Paperclip retains responsibility for when the held work becomes eligible again.

## 7. Live peers are not native courier issues

Stock Paperclip restricts run writes to the checked-out subtree; its documented lateral mechanism creates a courier issue. We are not weakening that permission system. Our plugin implements a separate bounded **team-message capability**, based on an accepted project work plan and enrolled assignments. It can deposit a message in a target's Sophia inbox; it cannot grant arbitrary sibling issue mutation or a raw board credential. [P03]

The recipient’s current attempt can consume the message at the supported boundary. If it is idle, the plugin requests exactly one normal Paperclip wake after current gates. If active, delivery does not also schedule a duplicate future run. SCM-03 tests this distinction with an actual adapter.

## 8. Core/native features not assumed portable

Do not assume external adapters inherit Native Runner steering, native completion review cards, warm provider sessions, native tool injection or managed-file checkpoint behavior. Use explicit Sophia controls, independently assigned review issues and our existing source service. Adopt an upstream native feature later only when it demonstrably reduces work under the same user contract.

## 9. Stop-loss for the integration

SCM-01 is successful only when one real core issue drives the existing dsh bridge through a restart/cancellation test with no second native attempt and a readable outcome. SCM-03 must then prove lateral peers without a core scheduler fork.

If either requires pervasive changes to Paperclip core or we cannot preserve actor/effect isolation, stop expanding this route. Produce a small binding-failure report and a priced alternative: isolated upstream contribution, smaller adapter scope, or retaining the existing native controller. Do not silently spend weeks recreating Paperclip inside the plugin.


## Current continuation binding

This is the v2.0 normative integration specification. The current M02 runtime, PR32 registry/artifact work and Luis-owned side-panel implementation are described in [current baseline](../02_CURRENT_BASELINE.md). Local source/fixture work can proceed while only the relevant live dependency remains gated. Paperclip is not the first private Bot job store: owner-private messages/packages remain in Sophia until an exact human share. [Source namespace SCM](../sources/REGISTER.md); new code and provider behavior still require the listed goal acceptance.
