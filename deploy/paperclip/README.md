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
| `sophia.coordination` plugin | inside that Paperclip | the commission's binding to its issue, its controls, envelope nonces, wakeup asks and its status writes until settled (its namespace only); one scheduled job, `settle-status-writes`, every minute (capability `jobs.schedule`) |
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
adapter, and runs the settle job through the harness (a stale write that landed after a Stop is undone). The harness
ignores a wakeup's idempotency key, so wake deduplication is not claimed: the plugin reconciles
wakeups itself against `public.heartbeat_runs`, which its manifest reads (`coreReadTables: ['issues', 'heartbeat_runs']`;
the installer approves both). `scripts/paperclip-host-probe.mjs` runs the built adapter in the pin's own heartbeat on a
throwaway database with every pinned Paperclip migration and a scripted Sophia: a Hold made in Sophia, a review that
ended blocked and a denied permit must leave the managed reviewer runnable (a failed run would leave it in error), and
the Resume wakeup must queue a run; and the built plugin must install through the pin's own loader, which checks each
raw migration statement (no comment in it may hold a quote character) and validates the manifest, the settle job's
capability and cron schedule included. Its test file is written into the checkout's
server tests for the run only. The
`OPS_REQUEST` names the manifest's digests; a different build is a different request.

## Settings

Paperclip service (secret store references only):

| Variable | Meaning |
|---|---|
| `SOPHIA_COORDINATION_URL` | Sophia API's existing public origin (HTTPS; the adapter's capability authenticates it). The API's plan is unchanged |
| `SOPHIA_COORDINATION_TOKEN` | the adapter's capability; Sophia stores only its SHA-256 (`sophia.register_coordination_integration`) |

Sophia worker:

| Variable | Meaning |
|---|---|
| `PAPERCLIP_ORIGIN` | Paperclip's address on the private network (`http://<its internal host name>:3100`); never a public URL |
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

## The service (WBC-02-CX-0015; for D4, nothing here is decided or created)

**Image.** Two steps on a clean machine, so Paperclip is built by its own recipe and never forked:

```sh
git clone https://github.com/paperclipai/paperclip /build/paperclip
git -C /build/paperclip checkout 5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb
docker build --target build --build-arg PAPERCLIP_BUILD_COMMIT=5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb \
  -t paperclip-build:5edf55d /build/paperclip                          # the pin's own build stage, unchanged
(cd /build/paperclip && pnpm install --frozen-lockfile && pnpm --filter @paperclipai/plugin-sdk build && pnpm --filter @paperclipai/db build)
node scripts/paperclip-build.mjs --paperclip /build/paperclip --out /build/sophia-paperclip   # from a clean Sophia commit
docker build --build-arg PAPERCLIP_BUILD_IMAGE=paperclip-build:5edf55d -t sophia-paperclip:<sophia commit> /build/sophia-paperclip
```

The second build's context is the output of `scripts/paperclip-build.mjs`: the two packages, `MANIFEST.json`,
[`Dockerfile`](Dockerfile), [`start.sh`](start.sh) and `verify-manifest.mjs` (from
`scripts/paperclip-verify-manifest.mjs`), each recorded by sha256. The image build refuses a context whose files do not
match `MANIFEST.json`, a build against another pin, or one made from a Sophia tree with uncommitted changes. What
differs from the pin's own production stage: no agent CLI is installed (the pin installs five at `@latest`), because
Paperclip runs no model here and `PAPERCLIP_ADAPTERS` allows only `sophia_dsh`. The plugin and the adapter sit at
`/opt/sophia`, and `start.sh` writes the adapter's record (`$PAPERCLIP_HOME/adapter-plugins.json`) on every start, so
the adapter that runs is always the image's. The operator records the image digest (`docker buildx imagetools
inspect`), and the release deploys that digest from a private registry. A different digest is a different request.

**Service shape (Render; the platform facts below are the ones Codex checked in WBC-02-CX-0020, since render.com was
not reachable from the implementer's container).**

- A **private service** (no public URL) in Oregon, the Sophia worker's region, running the image. A persistent disk
  at `/paperclip` (`PAPERCLIP_HOME`) holds the instance's files: run logs, uploads and, if not given by the
  environment, its secret files.
- **Deploys must not overlap.** Render overlaps the old and new instances of an ordinary service during a deploy, but
  a disk-backed service stops the old instance before it starts the new one. The disk is therefore part of the recipe:
  two Paperclip processes must never run against one database, because the host's own scheduler assumes one host.
  Instance exclusivity does not quiesce the old instance's database sessions; the fence below ends those.
- **Packages are baked in, not on the disk.** A disk's data exists only at run time, so the plugin and the adapter come
  from the image at `/opt/sophia`.
- **Its own PostgreSQL** (`DATABASE_URL`, the internal URL), never Sophia's, with the provider's backups. The image
  turns Paperclip's own file backups off (`PAPERCLIP_DB_BACKUP_ENABLED=false`).
- **Memory: a 2 GB instance.** Measured on the pin's built server with the plugin installed and in use, by
  `scripts/paperclip-service-probe.mjs`:
  - with the image's 1024 MB server heap, about 1.0 GiB resident at peak and at idle (the server about 0.76 GiB, the
    plugin worker about 0.22 GiB);
  - uncapped, about 1.06 GiB;
  - with a 384 MB heap, the server fails at start (out of heap).

  The 512 MB tier is ruled out; a 2 GB instance leaves about 1 GiB of headroom. These figures come from linux-x64 on
  synthetic data; Codex measures on the platform.

**Reachability, exactly.**

| From | To | How | Authenticated by |
|---|---|---|---|
| Sophia worker (Render background worker) | Paperclip's plugin routes | the private network, `PAPERCLIP_ORIGIN=http://<internal host name>:3100`; that host name is in `PAPERCLIP_ALLOWED_HOSTNAMES` | the integration board user's API key, plus Sophia's Ed25519 envelope on every body |
| `sophia_dsh`, inside Paperclip's server process | Sophia's `/v1/coordination/*` | the API's existing public HTTPS origin (`SOPHIA_COORDINATION_URL`) | `SOPHIA_COORDINATION_TOKEN` (Sophia stores its SHA-256) |
| Operators | Paperclip | a shell on the service (`render ssh <service>`), against `http://127.0.0.1:3100` (loopback is always admitted); the UI through `render ssh <service> -- -L 3100:127.0.0.1:3100` | an SSH key registered for the operator's Render account (a prerequisite: Codex's read-only attempt with an unregistered key was refused `publickey`), then their own board API key |
| Anyone else | Paperclip | nothing: no public URL, and the host-name guard answers 403 to any other name | n/a |

Paperclip sends nothing else out: telemetry and the announcements feed are off, and plugins and adapters install
from local paths, never npm. The adapter asks for a run's permit again for up to two minutes while Sophia does not
answer, because the free API can be waking from sleep; the runtime host's and bridge's long polls normally keep it
awake.

**Operator path, private.** The board UI is never published. An operator reaches it only through the documented SSH
local forward above. Over loopback, in the service's shell:

1. Sign up the first operator (`POST /api/auth/sign-up/email`, with an `Origin` of `http://127.0.0.1:3100`), claim the
   instance (`POST /api/bootstrap/claim`, private mode only) and mint a board API key (`POST /api/board-api-keys`,
   `expiresAt` per policy). Sign up the integration board user the same way.
2. Close sign-up (`PAPERCLIP_AUTH_DISABLE_SIGN_UP=true`, redeploy).
3. Create the pilot company and project, and make the integration user a member of that company only: the company
   invite flow Codex's installed-HTTP probe used.
4. Mint the integration user's board key into the Sophia worker's secret `PAPERCLIP_INTEGRATION_TOKEN`.
5. Install the plugin: `POST /api/plugins/install` with `{"packageName": "/opt/sophia/sophia-coordination-plugin",
   "isLocalPath": true}`.
6. Configure it for the company (`POST /api/plugins/<id>/config`).

The plugin reconciles the managed `source-reviewer` agent at the first commission.

**Secrets (the service's secret store; names only).**

| Name | What breaks without it, and how it rotates |
|---|---|
| `DATABASE_URL` | the server does not start |
| `BETTER_AUTH_SECRET` | the server does not start; rotating it signs every session out |
| `PAPERCLIP_SECRETS_MASTER_KEY` | encrypts Paperclip's stored secrets; set it here, not on the disk, and keep an offline copy: losing it loses them |
| `PAPERCLIP_TOOL_ACTION_SIGNING_SECRET`, `PAPERCLIP_DECISION_SIGNING_SECRET` (32+ characters) | signed approvals; set here so they survive a lost disk |
| `SOPHIA_COORDINATION_TOKEN` | the adapter cannot reach Sophia; rotate by registering the new hash in Sophia first |
| `PAPERCLIP_ALLOWED_HOSTNAMES` | not secret: the internal host name the Sophia worker uses |

Sophia's signing private key and the integration board key never enter Paperclip, and no provider key does either.

**Persistence and upgrades.**

- The plugin is referenced in place: the database records `/opt/sophia/sophia-coordination-plugin`, and every image
  carries it at that path. A restart reloads it from there (`loadAll`).
- An upgrade is a new image. The host then re-reads the manifest and re-applies the plugin's migrations by checksum,
  so `001_sophia_coordination.sql` must never change once a service has installed it: a later schema change is a new
  file.
- The adapter's record is rewritten at every start.

**Fencing a previous instance.** A status write that the host never answered stays open until an operator fences
it ([WBC-02-CC-0009](../../docs/coordination/WBC-02/WBC-02-CC-0009.md)). Meanwhile no delivery of its commission is
confirmed, and every settlement still restores Sophia's latest control if the write lands. An issue create the host
never answered likewise keeps its commission key claimed until it is fenced: Sophia's lookup answers 503 and no second
create begins, however long it takes. A wakeup ask the host never answered is not asked again until a run confirms it
or it is fenced. The plugin never fences any of them itself. A statement the instance had sent can wait in its database session and commit after the instance died
(Codex's WBC-02-CX-0024; `packages/paperclip-plugin/src/operator-fence.db.test.ts` reproduces it with a killed
client). So the fence is [`fence-previous-instance.sql`](fence-previous-instance.sql), run by an operator:

1. Verify, in the deploy's events, that the instance which served the writes stopped. A disk-backed service stops it
   before starting the new one. For a write the running instance never answered, restart the service first.
2. Choose T: any time after that instance stopped and no later than the start of the instance running now.
3. Connect to Paperclip's database as the role its server uses (its `DATABASE_URL`) and run:

   ```sh
   psql "$PAPERCLIP_DATABASE_URL" -v before='<T>' -v operator='<who, which deploy>' -f fence-previous-instance.sql
   ```

   The script lists the open writes, creates and wakeup asks begun before T, then ends every session of that role
   begun before T. Ending a session rolls back what it had not committed. It fences them only while none of those
   sessions remains: if it reports `UPDATE 0` with any still listed, run it again.

The settle job then settles the fenced writes within a minute. Never fence while the instance that served them may
still run.

**Rollback.** Redeploy the previous image digest. Plugin and adapter come from that image, and the database keeps the
plugin's namespace, whose migration files the previous image also carries unchanged. To stop coordination without
Paperclip, disable the plugin (`POST /api/plugins/<id>/disable`) or stop the service. Sophia keeps every record, and
an unknown delivery is reconciled by its key. The database is separate: dropping it is D4's operator's choice.

**Qualification, on a local stack (`scripts/paperclip-service-probe.mjs`).** The pin's server is built as its own build
stage builds it and started by `start.sh` with the image's environment, on a throwaway database and home. The results
are in [WBC-02-CC-0009](../../docs/coordination/WBC-02/WBC-02-CC-0009.md):

- the pinned migrations applied at start;
- `sophia_dsh` loaded (or the start refused);
- the host-name guard;
- the first admin and a board key over loopback;
- the plugin installed from its path and configured;
- a signed commission and a signed Stop;
- a scheduled settle-job run;
- a restart with sign-up closed: plugin ready, adapter loaded, the same issue found, sign-up refused;
- resident memory by phase.

## Release order (readers first)

The batch, its targets and costs are in [WBC-02-CC-0005](../../docs/coordination/WBC-02/WBC-02-CC-0005.md). Source order (CX-0012): #104 (SDD-01) first; this branch then rebases on it and regenerates from the combined tree, so `0038`–`0040` precede `0042` and the runtime unit is the combined one.

1. **Migration `0042_source_review_coordination.sql`.** Additive; it replaces `capture_native_result` and
   `dispatch_runtime_outbox` with versions that keep every existing branch byte-equivalent and add the source-review
   branch. Today's API and worker run unchanged on it.
2. **API and worker** of the reviewed commit. Without the three worker variables the coordinator stays off and says so;
   with no coordination grant every review route answers that source review is not enabled.
3. **Runtime unit** (the combined unit of the batch; previous `sophia-runtime-m03-dev`), cut over in place on the same
   root once no live work is on the old unit ([WBC-02-CC-0007](../../docs/coordination/WBC-02/WBC-02-CC-0007.md) §3; the
   old unit's completed work keeps `running` binding rows, which are left as they are). Until then no runtime
   advertises the reviewer and permits deny `runtime_unavailable`.
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
