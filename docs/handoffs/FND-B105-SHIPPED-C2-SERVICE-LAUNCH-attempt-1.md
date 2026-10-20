# Implementation-session handoff

Goal and attempt: FND-B105-SHIPPED-C2-SERVICE-LAUNCH-01, attempt 1. Wiring only; replies stay OFF by default.
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `d2b1d14d…`.
Branch: `fix/service-reply-launch-20261020-b105` from Main `7177c7f9` (tree `62cd355e`). Not pushed.

## The gap (confirmed before any edit)

`scripts/runtime-host.mjs`, the shipped entry, took only `--root` and `--rehearse`. A `--patch` was added only in
rehearsal. The supervisor builds the runtime's whole environment from the named credentials and `extraEnv`, which was
empty outside rehearsal, and drops `SOPHIA_REPLY_*`. So the shipped entry could neither apply a service overlay
(`sophia-control-bridge.replies`) nor pass the expected executor digest the bridge requires. The existing service
crossing proved the mechanism only through the test launcher.

## The correction (`scripts/runtime-host.mjs` only)

- `--service-overlay <file>` is optional, and with no overlay nothing changes. The file must be a config-only JSON
  patch list (the bundle's `assertConfigOnlyPatch`) whose `sophia-control-bridge` row sets `replies` with
  `mode: 'service'`. The variable named by `executorDigestEnv` must hold 64 hex characters, and its name must not start
  with `SOPHIA_REPLY_`, which the supervisor strips. Any failure exits 2 before the profile is touched. The host then
  passes the file as dsh's `--patch` and passes only that one variable into the runtime's environment. It logs the
  overlay path and the variable's name, never its value. The bridge still verifies the closure itself: a mismatch
  leaves the role unadvertised, with no fallback.
- `--print-executor-digest`, used with `--service-overlay`, reconciles the profile in `<root>`, prints the executor
  closure the runtime will advertise for that root and overlay (`event: executor_digest`), and exits. It needs no
  service URL or credential.
- Combining `--service-overlay` with `--rehearse` is refused.

`runtime-supervisor.ts`, the bundle, SQL, API, Studio, the lockfile and the runtime unit are unchanged.

## Operator recipe (names only, no values)

1. Write the overlay `service-overlay.json`: the reviewed route rows plus
   `{ "id": "sophia-control-bridge", "config": { …, "replies": { "mode": "service", "routeId": "<route>", "executorDigestEnv": "SOPHIA_EXECUTOR_DIGEST" } } }`.
2. `node scripts/runtime-host.mjs --root <dir> --service-overlay service-overlay.json --print-executor-digest`. Pin
   that digest in the conversation grant (`conversation_pin_execution`) under the operator's own authority.
3. Run `SOPHIA_SERVICE_URL=… SOPHIA_RUNTIME_TOKEN=… <route credential_ref>=… SOPHIA_EXECUTOR_DIGEST=<printed digest>
   node scripts/runtime-host.mjs --root <dir> --service-overlay service-overlay.json`.

## Evidence (local, keyless: mock provider, dummy key; never live)

In `tests/integration/conversation-service.test.mjs`, the `world` harness gets `startShipped`, which spawns the real
`scripts/runtime-host.mjs`, and `printedDigest`. On a fresh PG, five cases pass:

- the printed digest equals the world's closure;
- the shipped entry with it advertises exactly the executor tuple, answers once with 1 request on the pinned route,
  settles and retires;
- without the overlay it is ready with no conversation role and nothing sent;
- with a mismatched digest there is no role and nothing sent;
- the host refuses an overlay that is not config-only, an overlay with no replies, an unset or malformed digest, and
  `--rehearse` combined with an overlay;
- the existing complete-answer case, as the control.

First attempt kept on record: the shipped cases waited for the dsh child's `readiness=ready` line, which
`runtime-host` does not forward, so they timed out. They now wait for the host's own `ready against` line and the
stored hello, and assert the bridge's database effects.
