# Operations, isolation and the first release evidence

## 1. Chosen deployment

Use Vercel for the static React Studio. Run the Fastify API and pinned Omnigent on Render as separate services. Use Supabase for Sophia Auth/Postgres/Storage. Keep Omnigent's native database ownership separate from Sophia's domain schema; do not query its internal tables as the primary integration contract.

Add one private Linux Docker execution VM for the dsh runtime supervisor, SQL worker, raw RTC media bridge and isolated prototype/render containers. This is an explicit new operating dependency. It avoids assuming that a normal Render service exposes a safe Docker daemon or that Vercel owns long-lived native execution. The hosting provider/size is an operator deployment detail to record in S1-01; the architecture does not depend on a particular VM vendor.

The API and host communicate over authenticated TLS channels. Only the API and permitted preview gateway are public. No dsh web/admin surface, Docker socket, database port or native host tunnel is exposed anonymously. Local development uses the same roles in Docker Compose with synthetic accounts.

## 2. Secrets and identity

Use separate secrets for Sophia API, model adapters, LiveKit service, native bridge and object upload. Generated build containers get no model keys, personal tokens or API service role. Owner-operated Claude/Codex credentials stay under the native owner's custody. Runtime config uses credential references rather than secret values.

The dsh project token permits only that project's bounded tools. An external worker grant permits the named session and operations, not the owner's whole computer. Preview tokens are short-lived, audience-bound and cannot authorize source writes. Redact signed URLs and authorization headers from traces.

Disable dsh's session-log/inventory/telemetry defaults explicitly as described in the runtime chapter. Disable unwanted Omnigent analytics and public-link sharing at the chosen release configuration; Part 2 verifies its exact current settings instead of blindly copying an old environment variable list.

## 3. Build-container policy

The host supervisor owns container creation. The model cannot choose an arbitrary image, host mount or Docker flag. Use a supported pinned Node/Vite image for prototypes, a separate pinned browser/render image and an isolated selected Python renderer image. Build source is mounted into the task workspace; other project homes are not mounted.

No privileged containers; non-root user; bounded CPU/memory/disk/time; explicit network access for dependency installation and the intended preview; no unrestricted host network or Docker socket. Record image digest and source bundle with each job. Native PTC's sandbox remains enabled, but is not our only cross-project isolation boundary.

## 4. First-run order

Bootstrap the monorepo and exact toolchain; bring up local Auth/database/API; demonstrate atomic command admission; install the named dsh profile; establish the control bridge and a real native response; render the Studio; join a real two-person room; connect Gemini Live; launch an image/native source task from the room; add owner-bound engineers and lead supervision; run the complete project episode.

Do not wait for the whole backend before showing useful UI, and do not polish a fake terminal for weeks before the native path exists. A typed fixture can unblock UI development but must be labelled and replaced on the release episode.

## 5. Test layers

| Layer | Purpose | What it cannot establish |
|---|---|---|
| Unit/domain | transitions, scope, CAS, dedupe, exact schema parsing | real native/voice integration |
| Contract fixtures | provider/native events, cancellation, replay and adverse states | account entitlement or current service behavior |
| dsh replay | real loop with recorded model output | fresh reasoning quality or arbitrary concurrent child ordering |
| Browser E2E | real Studio/API workflows, source editor, preview, permissions | truth of unobserved external effects |
| Live crossing | actual Gemini audio/image, native engines and deployed app | universal performance or long-term reliability |
| Founder episode | useful creative/cooperation outcome | general market adoption |

Use focused checks at the changed boundary and retain ordinary regression coverage. Do not create one open-ended qualification campaign per feature. A failure gets a bounded diagnosis and an explicit fix/replan, not a framework restart.

## 6. Minimum representative failures

Duplicate admission; source changed during edit; failed candidate preserves stable preview; peer message delivered twice; native owner offline; permission resolved outside Sophia; Stop before delayed permission result; voice reconnect after job admission; old audio after barge-in; Stop Looking; current source revoked before a resumed context; deployment result uncertain after disconnect.

Every check records exact source/runtime/model and relevant evidence. A scripted failure is labelled as a test. Raw “all tests passed” is not a substitute for the specific crossing affected by the change.

## 7. Resource visibility

Measure native provider tokens when available, actual image/voice usage, execution minutes and job attempts. Separate subscription usage from direct API charges and infrastructure estimates. Missing native quota telemetry remains unknown. Before a goal the owner chooses its allowance and eligible resources; after it, show actual known use and unresolved cost.

Retries, lead reviews, specialist calls and model switches belong to the same goal's cumulative allowance. A new chat or attempt does not reset it. Automatic high-effort escalation remains within the grant or becomes a proposal.

## 8. Release and upgrade

The runtime unit records dsh/SDK/plugin/model configuration, database schema and image digests. Promote changes after the representative tests and actual affected live path. Drain or retain the compatible old unit for in-flight sessions. Do not hot-reload new tools into a working project and call it safe migration.

A rollout must support disabling new admission while preserving current results, pending cleanup and old-route obligations. Existing Sophia stays available for unmigrated uses. This pack does not authorize a destructive database migration or the shutdown of old retention workers.

## 9. Documentation quality checks

Run `python scripts/validate_pack.py` on this documentation package. It verifies local links, source IDs, model IDs, goal dependencies and required fields. It does not install software, use credentials or run a live model. `evidence/pack-validation.json` reports only those checks.
