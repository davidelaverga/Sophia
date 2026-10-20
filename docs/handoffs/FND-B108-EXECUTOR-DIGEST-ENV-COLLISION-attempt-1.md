# Implementation-session handoff

Goal and attempt: FND-B108-EXECUTOR-DIGEST-ENV-COLLISION-01, attempt 1. This addresses automatic CODE finding
4324657170 on 4808 (PR 474).
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `11b7f117…`, and R2 triage
`05e2c134…`.
Start: `/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-human-tasks`, branch
`fix/service-reply-launch-20261020-b105`, clean at `4808a7c8` (tree `963b160c`). Not pushed.

## The defect

`replies.executorDigestEnv` accepted any upper-case name outside `SOPHIA_REPLY_*`. `RuntimeSupervisor.environment()`
applies `extraEnv` after its own names and the credentials, so a digest variable named `SOPHIA_BRIDGE_TOKEN` replaced
the bridge token. One named `OPENAI_API_KEY` replaced the provider key with the digest. With `--print-executor-digest`,
such a name was accepted and its digest printed.

## The correction (scripts/runtime-host.mjs only)

- The configured credential references are now computed before the overlay is read. That covers the model route, every
  model route, and the research sources: `OPENAI_API_KEY`, `OPENAI_RESEARCH_API_KEY`, `TAVILY_API_KEY` and
  `JINA_API_KEY`.
- `serviceLaunch` refuses, with exit 2 and `replies.executorDigestEnv: <NAME> is already set for the runtime`, any
  name the supervisor sets itself or any of those references. The supervisor's own names are `HOME`, `TMPDIR`,
  `DSH_HOME`, `DSH_TELEMETRY_DISABLED`, `LANG`, `PATH`, `SOPHIA_RUNTIME_UNIT`, `SOPHIA_WORKSPACE`, `SOPHIA_BRIDGE_URL`
  and `SOPHIA_BRIDGE_TOKEN`.
- The refusal applies to the launch and to `--print-executor-digest`, before the profile is reconciled or the root is
  created. Only the name appears in the message, never a value.
- `apps/execution-host` is unchanged. The fixed list stays in the launcher, and a test reads the actual
  `RuntimeSupervisor.environment()` keys, so any name added there must be refused too, or the test fails.
- The distinct opt-in (`SOPHIA_EXECUTOR_DIGEST`), default OFF and the no-fallback mismatch are unchanged.

## Evidence (journal `B108-logs/`)

- Old FAIL, with the final test bytes on 4808 source (11), exit 1:
  - `HOME` printed a digest (exit 0, expected 2).
  - The `SOPHIA_BRIDGE_TOKEN` launch passed the guard and started: exit `null` at the 30 s timeout.
  - Its orphaned dsh child (pid 23692) was found and stopped (12).
- Fixed (14), the same test bytes (13), exit 0, 2/2:
  - `SOPHIA_BRIDGE_TOKEN`, `OPENAI_API_KEY` (the model credential) and `TAVILY_API_KEY` (a source credential) are each
    refused, at launch and print-only alike. Each exits 2 with the reason, emits no profile event and leaves the root
    absent.
  - Every key of the actual supervisor environment is refused print-only, with the root absent.
- Whole `conversation-service.test.mjs` on own PG17 port 55501 with the loopback mock provider and a dummy key (22):
  30/30. That includes the shipped positive (valid `SOPHIA_EXECUTOR_DIGEST`, one answer), default OFF, and mismatch
  with no fallback.
- `pnpm check` (30): exit 0 (format, oxlint type-aware, build, typecheck, unit 3612 pass / 0 fail, integration 110 pass / 0 fail).

## Limits

- The reserved list mirrors the supervisor's assignments. The drift test guards it, but only for the names
  `environment()` returns for this unit.
- An operator variable not listed here and not set by the supervisor is still accepted, by design.
- No provider, network, Linux, CI or push.
