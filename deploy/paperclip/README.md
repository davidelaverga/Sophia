# Paperclip for WBC-02: build, verify, release order

This is the operator's page for the one Paperclip-managed source review of WBC-02. Nothing here is authorized by
this repository: every step that changes a hosted service, a database, a secret or spend is an operation Davide
authorizes and Codex performs, through an `OPS_REQUEST` bound to an exact commit
([WBC-02-CC-0001](../../docs/coordination/WBC-02/WBC-02-CC-0001.md)). Claude does not deploy.

## What runs where

| Part | Where | Holds |
|---|---|---|
| Sophia API, worker, database (migration `0042`) | Sophia's existing services | the plan, the human decision, the allowance, eligibility, the effect permit, the fence, the result |
| Paperclip (`paperclipai/paperclip@5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb`) | one private service with **its own** PostgreSQL | the core issue and its runs, nothing else of Sophia's |
| `sophia.coordination` plugin | inside that Paperclip | the commission's binding to its issue, applied controls, envelope nonces (its namespace only) |
| `sophia_dsh` external adapter | inside that Paperclip | Sophia's coordination capability (env), never a provider credential |
| The source reviewer | Sophia's runtime unit `sophia-runtime-wbc02-dev` | the review's model calls, metered through Sophia |

Sophia never writes Paperclip's database, and Paperclip never reaches Sophia's database or a model. The Studio talks
to Sophia only.

## Build (outside the tree, against the pin)

```sh
git clone https://github.com/paperclipai/paperclip /path/outside/paperclip
git -C /path/outside/paperclip checkout 5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb
(cd /path/outside/paperclip && pnpm install --frozen-lockfile && pnpm --filter @paperclipai/plugin-sdk build && pnpm --filter @paperclipai/db build)
node scripts/paperclip-build.mjs --paperclip /path/outside/paperclip --out /path/outside/sophia-paperclip-dist
SOPHIA_DISPOSABLE_DATABASE_URL=postgres://… node scripts/paperclip-verify.mjs \
  --paperclip /path/outside/paperclip --dist /path/outside/sophia-paperclip-dist
SOPHIA_DISPOSABLE_DATABASE_URL=postgres://… node scripts/paperclip-host-probe.mjs \
  --paperclip /path/outside/paperclip --dist /path/outside/sophia-paperclip-dist
```

`scripts/paperclip-build.mjs` refuses any checkout that is not exactly the pin, typechecks the bindings against the pin's own types
(`PluginContext` → `SdkContext`, `PluginApiRequestInput` → `SdkApiRequest`, the manifest → `PaperclipPluginManifestV1`,
`createServerAdapter()` → `ServerAdapterModule`), bundles with the pin's esbuild, and writes `MANIFEST.json` with every
file's sha256 and the Sophia commit it was built from. `scripts/paperclip-verify.mjs` runs the built worker under the pin's own plugin
test harness (`createTestHarness`: issue service, origin-kind and wakeup rules, managed agents, capability checks) with
the namespace migration on a throwaway database, runs every statement the worker sends and the migration through the
pin's own `ctx.db` validators (`server/src/services/plugin-database.ts`; hence the db package build), and loads the built
adapter. The harness ignores a wakeup's idempotency key, so wake deduplication is not claimed: the plugin reconciles
wakeups itself against `public.heartbeat_runs`, which its manifest reads (`coreReadTables: ['issues', 'heartbeat_runs']`;
the installer approves both). `scripts/paperclip-host-probe.mjs` runs the built adapter in the pin's own heartbeat on a
throwaway database with every pinned Paperclip migration and a scripted Sophia: a Hold made in Sophia, a review that
ended blocked and a denied permit must leave the managed reviewer runnable (a failed run would leave it in error), and
the Resume wakeup must queue a run. Its test file is written into the checkout's server tests for the run only. The
`OPS_REQUEST` names the manifest's digests; a different build is a different request.

## Settings

Paperclip service (secret store references only):

| Variable | Meaning |
|---|---|
| `SOPHIA_COORDINATION_URL` | Sophia API's private origin, reachable from Paperclip only |
| `SOPHIA_COORDINATION_TOKEN` | the adapter's capability; Sophia stores only its SHA-256 (`sophia.register_coordination_integration`) |

Sophia worker:

| Variable | Meaning |
|---|---|
| `PAPERCLIP_ORIGIN` | Paperclip's private origin |
| `PAPERCLIP_INTEGRATION_TOKEN` | the API key of a dedicated **integration board user**, member of the pilot company only |
| `SOPHIA_COORDINATION_SIGNING_KEY` | Ed25519 private key (PKCS#8 PEM) that signs every commission and control |

Plugin configuration, per company (`ctx.config`): `signingPublicKey` (the matching public key, SPKI PEM),
`integrationUserId` (that board user's id: no other board user may call the routes), and `projects`: one
`{ sophiaProjectId, companyId, paperclipProjectId }` for the pilot.

Sophia database (migration owner, after `0042`):

```sql
SELECT sophia.set_research_grant(<project>, 'enabled', <task cap>, <total cap>, 'web-pilot-v1', '<approval ref>');  -- if not already
SELECT sophia.set_coordination_grant(<project>, 'enabled', <review cap USD>, '<company id>', '<paperclip project id>', '<approval ref>');
SELECT sophia.register_coordination_integration('<company id>', '\x<sha256 of SOPHIA_COORDINATION_TOKEN>', 'paperclip pilot');
```

## Release order (readers first)

1. **Migration `0042_source_review_coordination.sql`.** Additive; it replaces `capture_native_result` and
   `dispatch_runtime_outbox` with versions that keep every existing branch byte-equivalent and add the source-review
   branch. Today's API and worker run unchanged on it.
2. **API and worker** of the reviewed commit. Without the three worker variables the coordinator stays off and says so;
   with no coordination grant every review route answers that source review is not enabled.
3. **Runtime unit `sophia-runtime-wbc02-dev`** (previous `sophia-runtime-m03-dev`), cut over only with zero non-final
   bindings on the old unit. Until then no runtime advertises the reviewer and permits deny `runtime_unavailable`.
4. **Studio.** Tasks reads `/plans`; a project without plans shows its goals as before. The entry ("Review sources")
   appears only where Sophia says the viewer may propose.
5. **Paperclip**: the private service and its database, the plugin and the adapter from the verified build, the
   company, the pilot project and the integration board user; reconcile the managed `source-reviewer` agent
   (`sophia_dsh`). Its readiness check (`testEnvironment`) calls Sophia's `/health` only, never a model.
6. **Enrolment** of the one pilot project (the SQL above, the worker variables, the plugin configuration).
7. **Qualification** (INT-19) under the recorded allowance: one review, its effective route on the attempt's identity.

## Rollback

- Stop new work: `set_coordination_grant(<project>, 'disabled', …)`. Proposals are refused, permits deny
  `not_enrolled`, the board stays readable. Removing the worker variables stops deliveries; pending ones wait.
- A running review: Hold or Stop from the board (fenced at once); a Paperclip cancel holds it too.
- Runtime: back to `sophia-runtime-m03-dev`, rebuilt from its own commit; the reviewer is then unavailable, research is
  untouched.
- Code: the previous API, worker and Studio run on `0042` unchanged. `0042` itself stays (no down migration); its
  tables are idle without a grant.
- Paperclip: uninstall the plugin and the adapter, or stop the service. Sophia's records stay authoritative; a
  commission whose delivery is unknown is reconciled by its key, never created twice.
