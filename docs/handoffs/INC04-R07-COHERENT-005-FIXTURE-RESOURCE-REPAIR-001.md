# INC04-R07-COHERENT-005-FIXTURE-RESOURCE-REPAIR-001

Fixture resource repair for the integration suite, on top of `6f449ee9` (tree `e6de32c8`). It changes no product code, runtime, package, lock or artifact identity.

## Problem

`tests/support/harness.mjs` gives each runtime world a private copy of the suite's pristine profile (`cpSync(pristine.root, case-N)`). The per-test teardown stopped the runtime, the fixture service and the model, but kept the copy. Copies were removed only by the file's `cleanup()`.

A file with many worlds therefore held every copy at once. `tests/integration/call-evidence.test.mjs` creates 43 worlds over 5 suites, so up to 48 profile trees could exist before its `after()`.

In the failed ordinary run of `6f449ee9`, the integration stage hit ENOSPC while such copies were held. That run's free space, its other disk consumers and its profile growth are unknown. This retention is one demonstrated amplifier, not a complete cause of that failure, and the run stays failed.

## Change

In the per-test `t.after` of `world(t)`, after `runtime.stop()`, `service.close()` and `llm.close()` have resolved, the hook now removes that world's own `layout.root` with the existing `rmSync`.

- `runtime.stop()` (`scripts/lib/runtime.mjs`) signals the dsh child only if it is still running, then awaits its `exit` event. The removal therefore runs after the launched dsh process has exited.
- The removal is skipped when a teardown step throws, so a case whose shutdown failed stays on disk for inspection.
- An ordinary assertion failure does not retain the case, because the teardown still completes.
- A failure before the hook is registered (copy, fixture service or model start) can still leave a partial case. The file's `cleanup()` removes it as before.
- Unchanged:
  - each world's private full copy, the lazy pristine install and `cleanup()`
  - every test, assertion, skip, timeout and runner flag
  - the runtime artifact and the profile

## Compatibility

Twenty integration files import the harness. In the reviewed lifecycle lines, layouts are read inside the test body, and every restart stops the earlier runtime first (`w.stop()` before `w.start()`).

The harness stops only the last runtime a world started. A test that starts a world twice without stopping it would leave the earlier dsh child running while its copy is removed. That pattern was not found.

Descendant processes of dsh are not tracked by `runtime.mjs`. If one outlived dsh and kept writing, the removal could fail visibly in teardown.

`conversation-service` and `runtime-service` use their own `world` helpers and are unaffected.

## Checks

A focused run of `tests/integration/call-evidence.test.mjs` is planned, with its resource monitoring, under this repair task. It needs no PG. The file's four PostgreSQL cases (opt-in through `SOPHIA_DISPOSABLE_DATABASE_URL`) are not run there and stay unverified until the canonical check with a disposable database.

The full `pnpm check` is a separate later step.
