# Runtime bound-output wiring (INC04-R07-C2 maintained crossing, Root81)

Plan written BEFORE any code edit, on `refs/heads/inc04-r07-bound-output-wiring-001` at 90a0af7e (tree c2c2b887). It wires
the frozen 0113 dimension-bound core (apply / claim / outcome, untouched) into the maintained research, design and
source-review model meters, default OFF at every layer. Nothing here is activation, a release, a live qualification of a
provider, route, profile or account, or app registration: app.ts, readiness, the persistence index, Native W1/0114, the
pi-ai patch, server.ts and the Map files are HELD and not edited.

## States first

One opted model call (a NEW tracked reservation that carried `boundProfile`) moves through these states. Every arrow is
taken by exactly one actor; any other transition refuses with nothing sent.

| State | Where it lives | Entered by | Leaves to |
| --- | --- | --- | --- |
| S0 unopted | bridge | a route with no qualified bound profile, or the API gate OFF | legacy path, byte-identical (may send its ordinary HTTP) |
| S1 reserved+authorized | DB dispatch `authorized` | reserve with `boundProfile` through an API built with `boundOutput` | S2, or refusal (zero HTTP) |
| S2 ack-checked | bridge pending map (one per session) | `bindingProblem` passes incl. `bounds` echo | S3 when the patched adapter invokes the hook; refusal otherwise |
| S3 final preimage | bridge hook (inside pi-ai `onPayload`, awaited) | pi-ai built params | S4 or refusal (throw ⇒ pi-ai never calls `create` ⇒ zero HTTP) |
| S4 applied | DB dispatch `applied` | public apply wrapper (GUC v1 + opted) → private core | S5 or refusal (zero HTTP) |
| S5 claimed | DB dispatch `claimed` | public claim wrapper → private core; `sendPermitted:true` only for the transitioning call | S6 (the hook returns the final copy) |
| S6 may-have-sent | bridge | hook returned; pi-ai calls `create` once (maxRetries 0) | S7 `sent` only on the C2B transport frame; otherwise stays S6 (no invented `not_sent`) |
| S7 outcome recorded | DB outcome row | public outcome wrapper → private core (claim owner only) | terminal; settle unchanged |

`not_sent_after_claim` is recorded only when the hook itself fails after the claim and before returning the copy (pi-ai
then never calls `create`: proven). A replay of apply / claim returns history, never permission, never a resend.

## Default-OFF gate (Root decision, verbatim choice)

1. **API**: route factories take a server-only option `boundOutput` (default `false`). `server.ts` and `app.ts` are not
   changed, so the maintained app stays OFF. OFF: a reserve body carrying `boundProfile` is refused (422
   `invalid_request`) BEFORE any database call, never downgraded to legacy; the nine bound paths are not registered.
   An unopted body is passed exactly as before. A caller or model field never turns the gate on.
2. **DB**: NEW `0115_runtime_bound_output.sql`: nine public SECURITY DEFINER wrappers `sophia.runtime_bound_output_{apply,
   claim,outcome}[_design|_review]`, `SET search_path=pg_catalog,sophia`, EXECUTE to `sophia_api` only (revoked from
   PUBLIC, worker, assembler). Each: (a) `current_setting('sophia.bound_output',true)='v1'` else `bound_output_disabled`;
   (b) the operation's OWN maintained scope (`research_scope_of` / `design_scope_of(…,NULL,…)` / `review_scope_of`, not
   fenced: the private core fences after its waits); (c) the reservation's dispatch exists in that scope's project else
   `bound_output_not_opted`; (d) the private 0113 entry of the SAME fixed operation, with `project_id` and `runtime_id`
   (and the apply's `attempt_id`) taken from the authenticated scope, never from the body. The GUC is feature selection,
   not authority: every 0113 check (token, unit, bridge lease, scope, operation, profile/policy state, generation,
   emitter, fence) still runs in the private core. The nine private entries stay ungranted; 0113 assertions unchanged
   (the new names avoid its regex prefixes and get their own explicit enumeration in test 0115).
3. **Persistence**: `research-dimension-bounds.ts` gains `runtimeBoundOutput(c, op, step, who, request)` that runs
   `set_config('sophia.bound_output','v1',true)` (transaction-local) and then the wrapper, and `BOUND_OUTPUT_V1`, the
   operations object a server passes as its `boundOutput` option. The package index is HELD, so routes take the
   operations by injection; Routing exports and wires them later.
4. **Bridge**: `BridgeSettings.boundProfiles` (route id → qualified profile reference) defaults to NONE; a route opts in
   only if it is ALSO an observed route (the loaded patched producer qualified C2B on openai-responses), so `sent` is
   always decidable from the transport frame. With none, no capability is provided and the adapter sends exactly as now.

## Wire (A59, canonical GEN only)

- `ResearchReserveRequest.boundProfile` closed `{profileId uuid, revision ^[1-9][0-9]{0,9}$ string}`.
- `ResearchReservation.binding.bounds` closed, exactly 0113's `research_bound_reply` (dispatchId, profileId,
  profileRevision, authorizeSetDigest, originalGeneration hex|null, items[4] {dimension, unit, boundKind, bound,
  enforcementKind, policySetDigest, unsupportedReason, authorizeDigest}).
- New closed `BoundApplyRequest/BoundApplyReceipt`, `BoundClaimRequest/BoundClaimReply`, `BoundOutcomeRequest/
  BoundOutcomeReceipt` (camelCase; project_id / runtime_id never carried) and nine paths
  `/v1/runtime/{research,design,source-review}/bound/{apply,claim,outcome}`.
- `scripts/generate-runtime-wire.ts` (additional path 3): only the six new names appended to its two lists.

## Bridge hook (control-bridge.ts + adapter patch)

- Adapter patch (normal `pnpm patch` / `pnpm patch-commit`): `resolveCallBound: () => ctx.get('sophiaC2Bound')`; per call,
  only when `model.api === 'openai-responses'` and the service has version `sophia-c2-bound-v1`, `take(sessionId)`; a
  function answer becomes pi-ai's own awaited `onPayload`. Otherwise the request object is exactly as before.
- Bridge `take` hands out the ONE pending opted call registered for that session (single use). The hook (single use):
  model api / provider / id equal the route; params a plain object, keys within the buildParams set {model, input, stream,
  prompt_cache_key, prompt_cache_retention, prompt_cache_options, store, max_output_tokens, temperature, service_tier,
  tools, tool_choice, reasoning, include}; `stream===true`, `store===false`, `params.model===route.model`;
  `max_output_tokens` a safe integer; P = the ACK's authorized `openai.output_tokens` output_parameter bound; 16 ≤ P ≤
  `max_output_tokens`; a FRESH copy with `max_output_tokens=P`; settings digest = `sophia.c2.dispatch.settings.v1` frame
  of the canonical JSON of {include, prompt_cache_options, prompt_cache_retention, reasoning, service_tier, store, stream,
  temperature, tool_choice} present members (per-call content — input, tools, prompt_cache_key, model, max_output_tokens —
  excluded; model and P are separate preimage fields); outbound digest = 0113's `sophia.c2.dispatch.outbound.v1`
  (provider, endpoint=model.api, model, settings, emitter, [[openai.output_tokens, max_output_tokens, P]]); await apply →
  claim; return the copy only when `sendPermitted===true`, else throw.
- Outcome after the stream: `sent` iff the C2B observation saw the transport frame; nothing else is invented.
- Second opted call on a session while one is pending: refused before its reserve.

## Tests (planned) and boundary

- SQL `db/tests/0115_runtime_bound_output.sql`: every wrapper's prosecdef/proconfig/ACL (sophia_api only; never PUBLIC,
  worker, assembler), private nine still ungranted, GUC absent/empty/other ⇒ refusal, not-opted, wrong token/scope,
  foreign operation, revoked profile between reserve and claim, Hold/Stop, apply conflict, claim replay/foreign claim,
  outcome owner, as `sophia_api` (SET ROLE).
- DB `research-dimension-bounds.db.test.ts` (existing, owned): the persistence entry over real PG as the API role.
- Integration `tests/integration/runtime-bound-output.test.mjs` + owned fixture `tests/support/runtime-bound-output-provider.mjs`:
  real dsh → bridge → patched adapter → pi-ai → controlled Responses HTTP fixture → (recording proxy) → real API
  route functions over real PG55641. The maintained `buildApp` (held, OFF) proves the OFF refusal and authenticates the
  nine bound paths registered on it; the ON reserve runs on a scoped server built from the SAME route factories (labelled;
  not app credit). Whether the bridge row config reaches `BridgeSettings.boundProfiles` through the unowned plugin entry is
  established behaviourally; if not, `packages/dsh-bundle/src/index.ts` is reported as the exact outside necessity.
- Causal controls (each must FAIL behaviourally, then be restored exactly): drop the adapter hook; skip the claim; allow
  P<16; allow extra keys; grant a private entry.

## Later integration rows (Routing, not this slice)

app.ts passes `boundOutput` to researchRoutes / designRoutes / reviewRuntimeRoutes from a server flag; the persistence
index exports `BOUND_OUTPUT_V1`; readiness checks 0115's nine wrappers when the flag is on; the plugin entry carries
`boundProfiles` from the bridge row; Map rows for 0115, A59 and the new tests.

## Deltas found during implementation (recorded, not hidden)

- **Emitter identity is never configured.** The executor closure digest covers the overlay/row, so a configured
  `emitterIdentityDigest` could never equal it. The bridge uses its own VERIFIED service executor closure on the route
  (the digest its service role reports, which 0113's emitter check reads); a bound route without a verified service
  executor on that route stays off (`emitter_unverified`). The profile reference is `{profileId, revision, endpoint,
  settingsDigest}`.
- **Plugin entry.** `packages/dsh-bundle/src/index.ts` `parseConfig` refuses unknown row fields, so `boundProfiles`
  needed a closed, default-empty field there (Root82 grant). The committed bundle row carries none: NONE in production.
- **Qualifier pins.** The runtime tree changed with the adapter patch, so `C1P_RUNTIMES` / `C2B_RUNTIMES` were
  requalified to the newly recorded runtime digest (C1P/C2B code byte-unchanged), as the C2B producer did before.
