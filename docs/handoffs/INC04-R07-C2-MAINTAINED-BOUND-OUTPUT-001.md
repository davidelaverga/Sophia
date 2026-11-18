# INC04-R07-C2-MAINTAINED-BOUND-OUTPUT-001 — handoff (Root81, SAME Host18; Root82/Root83 steering)

Status: STAGE A source candidate, NOT committed, default OFF everywhere, PHASE A PARTIAL coverage (below). Goal ACTIVE /
INCOMPLETE. Nothing here is activation, release, admission, a live provider/route/profile/account qualification or
G-PROFILE. No commit, push, PR, CI restart, merge or deploy was made.

## Scope and base

- Base 90a0af7eb3d4d376e9a0d63c0e05def18ee79b36 (tree c2c2b887), intake `refs/intake/r81-90a0-readbase-001`, own worktree
  `/home/user/sophia-r81-bound-output-wiring` on `refs/heads/inc04-r07-bound-output-wiring-001` (HEAD unchanged, index
  unchanged; the candidate exists as working-tree bytes only).
- Allocated: migration 0115 and its test; amendment A59.
- Additional existing paths (3/3): `apps/api/src/routes/coordination/index.ts` (read, not edited),
  `packages/dsh-bundle/src/c2b-observation.ts` (read, not edited), `packages/contracts/scripts/generate-runtime-wire.ts`
  (six schema names appended to its two lists). Root82 granted `packages/dsh-bundle/src/index.ts` (default-NONE
  `boundProfiles` passthrough and the requalified C1P/C2B runtime pins).
- HELD, not edited: app.ts, readiness.db.test.ts, the persistence index, Native W1/0114/pure module, the pi-ai patch
  (byte-unchanged), server.ts, Map files.

## What the candidate does

- **DB (0115).** Nine public SECURITY DEFINER wrappers `sophia.runtime_bound_output_{apply,claim,outcome}[_design|_review]`,
  `search_path=pg_catalog, sophia`, EXECUTE to `sophia_api` only. Order: selection `current_setting('sophia.bound_output',
  true)='v1'` (else `bound_output_disabled`, 55000) → closed camelCase body (`payload_invalid`) → the operation's own
  maintained scope → an opted dispatch in that scope's project (`bound_output_not_opted`) → the private 0113 entry of the same
  operation with project_id / runtime_id / (apply) attempt_id from the scope. Five owner-only invoker helpers. The 0113 private
  entries, cores, arithmetic, protocol, digests and assertions are unchanged; the new names avoid 0113's regex prefixes and are
  enumerated by name in test 0115.
- **Persistence.** `runtimeBoundOutput()` sets the selection transaction-locally then calls the wrapper; fixed
  `bound_*`/`dispatch_*` 55000 refusals are typed `invalid_state` (never a 503 outage). `BOUND_OUTPUT_V1` is what a server
  passes to its route factories (not exported through the held index).
- **API.** `researchRoutes(app, pool, { boundOutput })`, `designRoutes(app, { …, boundOutput })`,
  `reviewRuntimeRoutes(app, pool, { boundOutput })`, default `false`: an opted reserve is refused 422 `invalid_request`
  "Bound output is not enabled on this service" before any database call, never downgraded; the nine bound paths are
  registered only with the option (`researchBoundRoutes`, `designBoundRoutes`, `reviewBoundRoutes`). The paths are in
  RUNTIME_ROUTES / DESIGN_ROUTES / REVIEW_RUNTIME_ROUTES so the app's capability hook covers them once registered.
- **Wire (A59).** `boundProfile {profileId, revision}` on the reserve; `binding.bounds` (0113's stored reply) on the
  reservation; closed Bound{Apply,Claim,Outcome}{Request,Receipt/Reply}; nine paths. Canonical GEN only.
- **Bridge.** `boundProfiles` row field (default none; closed parse in the plugin entry). A route opts in only if configured,
  observed (C2B-qualified producer) and run by this runtime's verified service executor (its emitter identity). Per call:
  one session slot opened before the reserve (a second opted call on the session is refused before its reserve), the
  reserve carries the profile reference, the ACK must echo `bounds` naming it, the dispatch is armed, the capability
  `sophiaC2Bound` hands the hook to the adapter once. The hook (pi-ai's own awaited `onPayload` on the FINAL request):
  api/provider/model, plain data, keys within the buildParams set, stream=true, store=false, max_output_tokens present,
  16 ≤ P ≤ max_output_tokens, a FRESH copy with P, settings digest (`sophia.c2.dispatch.settings.v1` over the canonical
  present setting members), 0113 outbound digest, apply → claim, return only on `sendPermitted`. Outcome after the stream:
  `sent` only from the C2B transport frame; `not_sent_after_claim` only when the hook failed after the claim (or the claim
  answer was lost and nothing was returned); otherwise none (may have sent). A chunk of an opted call whose hook never ran
  stops the call (`hook_bypassed`). Settle and money are unchanged.
- **Adapter patch** (pnpm patch / patch-commit): `resolveCallBound: () => ctx.get('sophiaC2Bound')`; per openai-responses
  call, `c2BoundHook(service, sessionId)` → `onPayload` only when a hook is handed out; otherwise the request is unchanged.

## Phase A partial coverage and the remaining boundary (explicit)

- Ran on the REAL runtime (dsh waterfall, plugin entry config, ControlBridge meter and capability, patched adapter, pi-ai)
  against the controlled Responses double, the real `buildApp` (OFF) with the nine bound steps registered on it by the same
  factories (its real capability hook and error handler), and real PostgreSQL: RESEARCH only.
- The ON reserve leg ran on a LABELLED scoped server built from the same route factories, because held app.ts registers the
  factories without the option. This is not app credit.
- design and source_review: public wrappers positive/adverse at the DB layer (as the API role) and the same bridge units; their
  real-runtime crossing is NOT done here (needs design/review admission fixtures on the real API). T-C2-41/42/44 are not
  closed; the full maintained crossing is not claimed verified.

## Later integration rows (Routing; not done here)

| Held file | Exact change | Marker |
| --- | --- | --- |
| apps/api/src/app.ts `buildApp` | pass `{ boundOutput: deps.boundOutput === true ? BOUND_OUTPUT_V1 : false }` to `researchRoutes(app, deps.pool, …)`, `designRoutes(app, { pool, store, boundOutput })`, and to `reviewRuntimeRoutes` (via `coordinationRoutes` or directly) | `AppDeps.boundOutput?: boolean` default false; server.ts flag later |
| packages/persistence/src/index.ts | `export { BOUND_OUTPUT_V1, runtimeBoundOutput } from './research-dimension-bounds.ts'` | none |
| apps/api readiness (+ readiness.db.test.ts) | when the option is on, require the nine `sophia.runtime_bound_output_*` functions (to_regprocedure) | `bound_output_unavailable` reason |
| Map files | rows for 0115, A59, the bound routes, `tests/integration/runtime-bound-output.test.mjs`, `tests/support/runtime-bound-output-provider.mjs` | none |
| ordered migrations | recheck 0113 → 0114 → 0115 on the coherent base (0114 absent here) | none |

## Results

See the sealed STAGE-A packet (MD/JSON/SUMS/ZIP): identity, inventory, pins, GEN and record diffs, tests, controls, PG.
