# Implementation-session handoff

Goal and attempt: FND-B114-CLOSED-NORMAL-SERVICE-ADMISSION-01, attempt 1. This addresses automatic CODE findings
4325334689 (full bridge grammar) and 4325334698 (overlay provider credential references) on `8798` (PR 474).
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `b31026b3…`, and R2 triage
proof `30d93ac2…`.
Start: branch `fix/service-reply-launch-20261020-b105`, clean at `87987cf8` (tree `25284e83`). Not pushed.

## The defects

- 4325334689: the launcher checked only the config-only row shape and the bridge's service mode and digest name. A
  bridge that `parseConfig` refuses still got a printed pin and a reconciled profile, and it failed only at dsh start.
  Examples: no `protocolVersion`, a missing or unknown `routeId`, or an extra field.
- 4325334698: a config-only overlay could replace `llm-pi-ai` and name a provider key the unit never declares
  (`CUSTOM_KEY`). That key was either never forwarded, or it collided with the digest variable.

## The correction: one closed contract (scripts/lib/service-overlay.mjs, used by scripts/runtime-host.mjs)

- **Rows:** names must be unique and known. The overlay has exactly one `sophia-control-bridge` row with service
  replies, and optionally `llm-pi-ai`; any other row is refused.
- **The bridge:** it is parsed by the bundle's own `parseConfig` (pure: no apply, runtime or provider), and must
  equal the recorded bridge row exactly, apart from `replies`.
  - `routeId` must be the recorded `conversation-service-luna-high-v1`.
  - The row replaces the whole config, so missing fields are invalid; nothing is filled in from the baseline.
- **The provider row:** `llm-pi-ai`, if present, must equal the recorded row exactly, except that
  `openai-conversation.baseURL` is a numeric loopback endpoint (`http://127.0.0.1:<port>[/v1]`). That is the same-host
  fake provider of the shipped-entry tests. Normal production needs no provider row.
- **The baseline:** it comes from the recorded bundle archive. The archive's sha256 must equal the unit's
  `archive_sha256`, and its `cordis.patch.yml` is parsed strictly. `parseConfig` is imported from `dist/` only after
  every `dist/` file of the archive is byte-equal to the built one.
- **Order:** every refusal exits 2 before the profile, root, digest or spawn.
  1. config-only;
  2. rows and replies mode;
  3. the B111/B108 digest-name guards (letter grammar, Node modifiers, supervisor and credential names);
  4. the recorded composition;
  5. the 64-hex digest value.
- **Unchanged:** the bundle parser, the loaded closure, the unit, the lock, the API, Studio and SQL. The launcher's
  header recipe now states the closed contract.

## Evidence (journal `B114-logs/`)

- Old FAIL, with the final test bytes (10) on 8798 source (11), exit 1. There are two separate print-only tests, and
  no child starts:
  - no `protocolVersion`: profile event and digest, exit 0;
  - `CUSTOM_KEY` provider key with a separate digest: the same, exit 0.

  The canonical bridge-only positive passed on old source too.
- First fixed run (12): the B105 `digest unset` case failed. Its fixture endpoint `http://127.0.0.1:9` has no `/v1`,
  and the first loopback pattern required one; I made `/v1` optional. Second run, same test bytes (13): 7/7.
  - Refused bridge cases: missing protocol, missing route, unknown route, extra replies field, extra config field,
    another recorded route.
  - Refused provider and credential cases: custom key (separate digest and collision), provider model change, another
    provider moved, external endpoint, user info in the endpoint.
  - Refused bridge-content cases: bridge token variable, route cap, prices, provider alias.
  - Refused row cases: unexpected row, duplicate bridge.
  - The canonical bridge-only overlay is admitted, and the B105/B108/B111 controls still pass.
- Whole `conversation-service.test.mjs` on own fresh PG17 port 55501, with the loopback fake provider and a dummy key
  (22): 35/35. That includes the shipped fake-endpoint positive (one answer, request, settlement, retire), default
  OFF, and mismatch with no role and no fallback.
- `pnpm check` (30): exit 0 (unit 3612 pass / 0 fail; integration 115 pass / 0 fail; artifacts reproduced).

## Limits

- The production route is fixed to the one recorded conversation route. Another route would need a new recorded unit
  and its own review.
- The archive is hashed before `tarballFiles` reads it again (a small window between the two reads, on an operator
  host).
- No provider, network, Linux, CI or push.
