# Implementation-session handoff

Goal and attempt: FND-B111-SERVICE-LAUNCH-ADMISSION-02, attempt 1. This addresses automatic CODE findings 4324948988
and 4324948997 on `0fdd` (PR 474).
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `e4206743…`, and R2 triage
proof `7b08ffaa…`.
Start: branch `fix/service-reply-launch-20261020-b105`, clean at `0fdd8dee` (tree `81fc51dd`). Not pushed.

## The defects

- 4324948988: the launcher accepted `replies.executorDigestEnv` names with a leading underscore (`/^[A-Z_].../`). The
  bridge's `parseReplies` (`/^[A-Z][A-Z0-9_]*$/`) refuses them, so the launcher could print a pin, and reconcile the
  profile for it, for an overlay the bridge cannot parse.
- 4324948997: the four Node launch modifiers (`NODE_OPTIONS`, `NODE_PATH`, `NODE_PRESERVE_SYMLINKS`,
  `NODE_PRESERVE_SYMLINKS_MAIN`) were accepted as digest names. The loaded closure refuses any non-empty value of them
  (`assertNoLaunchModifiers`), so such a launch is unusable, and the shipped launcher missed the guard that
  `launchRuntime` already has.

## The correction (scripts/runtime-host.mjs only)

- The digest name must match the bridge grammar `/^[A-Z][A-Z0-9_]*$/` and stay outside `SOPHIA_REPLY_*`.
- The four Node modifier names are refused with `replies.executorDigestEnv: <NAME> is a Node launch modifier`. The list
  is the same one as in `executor-identity.ts` and `scripts/lib/runtime.mjs`.
- Both refusals exit 2 for print and launch alike, before the profile or root is touched, and before the digest value
  is read.
- B108's refusals of names the supervisor sets and of configured credentials are unchanged, and so are the distinct
  opt-in, default OFF and no-fallback behaviour.
- The bundle parser and the loaded-closure checks are not changed.

## Evidence (journal `B111-logs/`)

- Old FAIL, with the final test bytes (10) on 0fdd source (11), exit 1, 0/2. There are two separate print-only tests,
  and no modifier is set in the environment:
  - `_EXECUTOR_DIGEST` printed a digest after the profile event (exit 0);
  - `NODE_OPTIONS` did the same (exit 0).
- Fixed, same bytes (12), exit 0, 4/4:
  - the underscore name and each of the four modifiers are refused with exit 2 and the reason, for print and launch
    (launch with the variable unset), with no profile or digest event and the root absent;
  - B108's supervisor-key and collision controls, and B105's refusal controls, still pass.
- Whole `conversation-service.test.mjs` on own fresh PG17 port 55501, with the loopback mock provider and a dummy key
  (22): 32/32. That includes the shipped positive (one answer, request, settlement, retire), default OFF, and mismatch
  with no role and no fallback.
- `pnpm check` (30): exit 0 (unit 3612 pass / 0 fail; integration 112 pass / 0 fail).

## Limits

- The modifier list is duplicated (now three copies). Exporting it from the bundle would change the bundle's identity.
- With `NODE_OPTIONS` actually set in the operator's shell, Node itself may act before the launcher runs. That is
  outside this check.
- No provider, network, Linux, CI or push.
