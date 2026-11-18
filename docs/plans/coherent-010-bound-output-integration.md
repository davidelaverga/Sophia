# Coherent-010: bound-output integration on current main (INC04-R07, Root123)

Plan written BEFORE any code edit, in the new worktree `/home/user/sophia-r123-coherent-010` on
`refs/heads/inc04-r07-coherent-010-001`. It composes current `main` with the accepted coherent-009 source and the Host
bound-output donor, then repairs the donor's two findings and wires the maintained application. It is not activation, a
release, or a live qualification of any provider, route, profile, account or emitter. `server.ts` and the default
configuration stay OFF.

## Composition (before any edit)

| Component | Identity | How it enters |
| --- | --- | --- |
| Base | `90a0af7e` (tree `c2c2b887`) | `HEAD` of the new branch |
| Current main | `9495c87f` (tree `de7e3617`); its 43 paths since `e15cfbde` | ONE `git merge --no-ff --no-commit 9495c87f 9dfeba7f`; prospective ordered parents `[90a0, 9495, 9dfe]` |
| Native W1 | `9dfeba7f` (tree `900e05aa`); its 17 paths | the same merge |
| Accepted coherent-009 delta | the `dee7cd9d` 23 paths against `90a0` | 16 already equal after the merge; the other 7 copied from their exact blobs |
| Host donor | `204bcfdb`: 24 paths (17 M, 7 A) | bodies copied from the verified packet, each checked against the `90a0` base blob and the donor pin |

The merge was clean (0 unmerged); main's 43 and Native's 17 paths carry their exact blobs. The donor's 17 modified paths
replace `90a0` blobs that neither main nor dee7 changed; its 7 added paths are new. So there is no textual overlap. The
interactions are semantic:

- **Lock:** main's `packages/contracts/package.json` against the donor's lock.
- **Exports:** main's persistence `artifacts.ts` against the persistence index.
- **Contracts:** main's Studio against A56–A59.
- **Migrations:** the order 0113 → 0114 → 0115.

A frozen install, generation, typecheck, the full suites and the Studio browser suite on this composition decide those.

## States first: one opted model call through the maintained app

Every arrow is taken by exactly one actor. Any other transition refuses, and nothing is sent.

| State | Where | Entered by | Leaves to |
| --- | --- | --- | --- |
| A0 app OFF | `buildApp` without `boundOutput` (the default; `server.ts` unless `SOPHIA_BOUND_OUTPUT=on`) | construction | an opted reserve is refused 422 before any database call; the nine bound paths are not registered; an unopted reserve is the legacy path |
| A1 app ON | `buildApp({ boundOutput: true })` | server-side configuration only | the three factories get the production `BOUND_OUTPUT_V1`; `/ready` requires the nine 0115 wrappers |
| S1 reserved | DB dispatch `authorized` | the maintained research, design or source-review reserve with `boundProfile` | S2, or an emitter Hold, Stop or revocation (R) |
| S2 ACK checked | bridge slot (one per session) | `bindingProblem` passes, including the `bounds` echo | S3 when the patched adapter invokes the hook |
| S3 final preimage | the bridge hook (pi-ai's awaited `onPayload`) | pi-ai built the params | **F01:** `model.api` must equal the configured `profile.endpoint`, else refuse `endpoint` before apply; the digest's endpoint is `model.api`. Then S4 |
| S4 applied | DB `applied` | public apply wrapper → private 0113 core | S5, or refusal (zero HTTP) |
| S5 claimed | DB `claimed` | public claim wrapper; `sendPermitted` only for the transitioning call | S6 (the hook returns the fresh copy with P) |
| S6 may have sent | bridge | pi-ai calls `create` once | S7 `sent` only on the C2B transport frame; otherwise unknown (never an invented `not_sent`) |
| S7 outcome | DB outcome row | public outcome wrapper (claim owner only) | terminal; the settle on the same reservation is unchanged |
| R refused | DB | after S1 and before S5: the member's goal **Hold** or **Stop** (`admit_goal_command`), or the owner's profile **revoke** | the apply or claim refuses (fence, or profile inactive); the hook throws, so pi-ai never calls `create`: **zero HTTP** |

A replayed apply or claim returns history, never permission and never a resend. One HTTP request is not one model
request: `openai.model_requests` stays `unsupported`.

## Repairs

1. **C2W-F01 (P1).** In `BoundDispatch.hook`, keep `model.api === 'openai-responses'`. Then require
   `s.profile.endpoint === model.api` (refusal `endpoint`, before any apply), and hash the outbound preimage with
   `endpoint: model.api`. Provider, model, settings, emitter, the dynamic lower-only P, the fresh copy and the single
   claim are unchanged. There is no new endpoint taxonomy.
   - **Proofs:** the matching positive (unit and real); a unit mismatch with zero client calls and the original params
     unchanged; and a real-runtime mismatch (configured and registered endpoint `openai-completions`, actual Responses
     model): refused in the hook, no apply or claim, zero HTTP.
   - **Control:** the comparison alone removed from the built bundle (no other change). The mismatch assertions must
     fail. Then the exact source is restored and rebuilt, and the identities re-verified.
2. **C2W-F02 (P2).** In the new bound-output fixtures only:
   - every acquisition (provider, probe scratch, launch scratch, proxy, runtime) registers its own cleanup the moment it
     exists;
   - cleanups run in reverse order, each attempted even when another rejects;
   - the primary error and every cleanup error are kept (an `AggregateError` naming each);
   - a runtime whose stop failed, or whose exit is not confirmed, keeps its scratch: the scratch is reported and NOT
     removed;
   - `startBoundProvider().close()` closes both the front and the double, keeping both errors.
   - **Proofs:**
     - a failure injected after the real provider and proxy were acquired and before the runtime completed: each is closed
       and the injected error stays visible, with nothing sent or credited;
     - a cleanup that throws after its real close: the remaining cleanups still run, and both the primary and cleanup
       errors stay visible;
     - a runtime whose stop rejects: its scratch is retained.

## Maintained application

- **`AppDeps.boundOutput?: boolean`**, default false. `buildApp` passes `{ boundOutput: on ? BOUND_OUTPUT_V1 : false }` to
  `researchRoutes`, `designRoutes` and, through `coordinationRoutes` (X1), `reviewRuntimeRoutes`. Only the production
  persistence object is used; no caller supplies one.
- **`/ready`:** with the switch on, `BOUND_OUTPUT_SCHEMA` requires all nine `sophia.runtime_bound_output_*(bytea, text,
  text, jsonb)` wrappers and this login's EXECUTE on each. Off, nothing of 0115 is required: the prior requirements are
  unchanged.
- **`server.ts`:** `SOPHIA_BOUND_OUTPUT` is `on`, `off` or unset, following the file's `*FromEnv` convention. Unset or
  `off` (the deployed state) is OFF. No request or model field can turn it on.
- **Persistence index:** exports `BOUND_OUTPUT_V1`, `runtimeBoundOutput`, `BoundOutputOperation` and `BoundOutputStep`.

## Real crossings (`tests/integration/runtime-bound-output.test.mjs`)

Every crossing runs dsh → the deployed artifact bridge → the patched adapter → pi-ai → the controlled Responses double,
through ONE maintained `buildApp({ boundOutput: true })` (the production factories, capability hook, error handler and
wrappers) over real PostgreSQL. The scoped server is removed.

- **research:** the admitted task, as before.
- **design and source_review:** LABELLED SYNTHETIC attempts inserted by the migration owner, as the existing DB and C2B
  tests do. Their real create command, naming the designer or source-review role, is delivered to the real runtime
  through the app's `/v1/runtime/commands`. A real design or review admission (research publication and rendering, a
  work board) stays outside this crossing.
- **Positives for each of the three:**
  - a dynamic P below the route ceiling in the actual HTTP body;
  - the claim answered before arrival;
  - the same reservation and dispatch lineage through settle;
  - an exact claim replay that returns history with no resend;
  - `model_requests` unsupported.
- **Refusals between reserve and claim:** goal Hold, goal Stop and profile revocation, each injected by the test's own
  recording proxy when the first bound apply arrives and before forwarding it. Each ends with no claim and zero HTTP.
- **OFF:** the default-OFF app refuses an opted reserve 422 with no row, and serves none of the nine paths. A legacy
  unopted call on the ON app is unchanged (no `boundProfile`, no `bounds`, the route ceiling), and it may send.
- **T-C2-41/42/44:** these identifiers are not defined in this repository. The Host review states they close only with the
  real maintained research, design and source-review crossings. This plan maps them to those three crossings and claims
  no live qualification.

## Checks

- **Static:** Node 24.21.0 and pnpm 11.7.0; `pnpm install --frozen-lockfile`; contracts generate and check; build;
  `pnpm artifacts:record` only for a real composition change, with each identity explained, then `pnpm artifacts` 8 of 8;
  format, type-aware lint, typecheck.
- **Suites:** the full unit suite and the Studio fixture browser suite.
- **Database:** on an owned PG16 at 55647, the full SQL corpus (0113 → 0114 → 0115; about 114 migrations and 27 tests,
  for planning only) and the full DB corpus, with the focused integration file and its controls.
- **Denied:** the `db/tests/0110` body stays closed to reading; the normal runner may execute it.

## Writable footprint

- the Host 24 paths;
- `apps/api/src/app.ts`, `apps/api/src/readiness.db.test.ts`, `apps/api/src/server.ts`;
- `packages/persistence/src/index.ts`;
- `docs/DESTINATION_MAP.md`;
- this plan and `docs/handoffs/INC04-R07-COHERENT-010-001.md`;
- X1 `apps/api/src/routes/coordination/index.ts` (blob `6cd9d797`).

Main's 43 paths, Native and dee7 bodies, 0113, the private core and the domain arithmetic stay unchanged.
