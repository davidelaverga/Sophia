# Deployment and first operation

This maps the chosen services to their actual responsibilities and startup checks. It does not pretend to be a completed Render blueprint or a set of built OCI images. `deployment-units.json` is the build/deploy input map; image digests stay null until S1-01/S1-13 build the actual units. A placeholder digest must never pass readiness.

## Chosen topology

Vercel serves only the static React/Vite Studio. Render runs the API and the pinned Omnigent server as separate long-lived services. Supabase owns application auth, Postgres and private source storage. Omnigent uses its separate database rather than writing Sophia’s accepted records. LiveKit Cloud carries the shared room. One private Docker execution VM runs the supervisor, worker, media bridge and project-scoped dsh/build/render containers. This preserves the Part 1 choice and its explicit extra operating cost.

The private supervisor owns container operations. Build and dsh programs do not receive the Docker socket. Mount one project's runtime home and one task's source/output only. Deny unrelated project/host mounts, privileged flags and arbitrary images. Keep media outside build containers so a prototype rebuild cannot interrupt the voice session.

## Deployment order

1. Build/record the toolchain and pinned source units; verify expected package/profile IDs and actual licenses. Record full digests after image creation, never guess them.
2. Provision fresh application database/storage and run the migration candidates and SQL tests in a disposable environment first. Provision non-admin application logins separately from migrations.
3. Deploy the API with fixed public origins and schema checks. It is unhealthy for writes when required schema/broker services are unavailable.
4. Deploy Omnigent in accounts mode with the operator admin pre-provisioned through its supported setup. Create ordinary founder accounts, invitation-only, public sharing off, telemetry off. Confirm the actual setting names against the pinned startup source before deployment; no old environment variable is silently treated as a tested switch.
5. Start owner host daemons through their own native sign-in/service flow; register exact host ownership. Link Sophia to Omnigent through the device flow in architecture 11. Never use a single machine token as both founders.
6. Start the private worker/supervisor and one source-pinned dsh project runtime. Readiness checks the actual control-plugin composition; process existence alone is not ready.
7. Start the media bridge, then deploy Studio and run two-person auth/room tests. One room has one active Sophia media owner, separate from the project work owner.
8. Build the render unit with the mandatory adaptations; run finite real artifact tests. Complete the founder episode before labelling Sprint 1 released.

## Secret placement

Provider API keys belong to the provider/media service plane, never the browser or generated code. Omnigent device delegates are encrypted with AES-256-GCM using a versioned server-held encryption key; use the platform secret store to inject that key. Encrypted rows and key IDs are separate from normal project tables. Rotating credentials have one serialized rotation owner; a lost rotation response produces reauthorization, not repeated use of a stale token.

MCP credentials are assignment-limited, revocable and bound to current project/goal/epoch. Omnigent's session bundle can retain the configured header; prevent exporting it through Sophia and retire its token when the assignment ends. A redacted metadata response does not establish encrypted persistence upstream.

Native Claude/Codex login material remains on the owner's host. Sophia does not ask for an auth.json or Claude OAuth token. A local agent with previously granted powerful native tools can still act outside Sophia; disclose that boundary rather than promising central locks cover independent operations.

## Private API and health contracts

Public traffic reaches only Studio, API, approved preview origins, Omnigent's authenticated native surface and LiveKit. Internal runtime control requires a project-scoped service identity; no unauthenticated dsh web endpoint is exposed. Restrict egress for execution jobs separately from API/media provider access.

The API `/ready` is a **new Sophia endpoint to implement**, not a claimed existing donor endpoint. It checks schema compatibility, secrets configured without printing them, worker reachability and required dependencies. Omnigent's `/health` is its native endpoint. Media readiness requires actual room/provider setup, not only a WebSocket being open.

## Release and recovery

Stop admission before changing an incompatible runtime unit. Drain or reconcile in-flight writes; retain uncertain effects. A code rollback must read the installed schema. Restore data in a separate environment before replacing it; never run a destructive down-migration to make old code appear compatible.

Update dsh and Omnigent only as explicit unit changes with representative peer, Hold/Stop, auth, source and context checks. Package manager locks, browser/library pairing and container digests are implementation outputs. Part 2 does not claim they exist merely because the chosen architecture is detailed.
