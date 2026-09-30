# SMC-M02 M02-T12/T13: copied logs and journals across units

**Observed 2026-09-30 on linux-x64**, keylessly, by `tests/integration/log-compat.test.mjs`. The candidate runs are **with G3**: the Sophia presets are composed, E's sessions carry `agentPreset` in their header, and E's journals carry `sophia/identity`. A's exports and its self-import (A→A) are from the same session's earlier run; A did not change. Each run is one direction in a disposable home, and paths are normalized. `A` is the previous unit `sophia-runtime-s1-03-dev` (dsh 0.1.7-rc.1, run from `acfa348`); `E` is the candidate `sophia-runtime-m02-dev` (dsh 0.2.0-rc.2).

## Procedure

1. **Export.** Run an episode on one unit:
   - `failed-step` is M02-T10's episode;
   - `plain` is the same three tool calls, all completing;
   - each is followed by a second turn and a Hold.

   Stop that runtime, then copy `sessions/`, `storages/` and `sophia-bridge/` out of its Harness home. The writer is settled before the copy is taken.
2. **Import.** On the other (or the same) unit:
   - install a fresh profile in a new home and copy the export in;
   - have the fixture service bind the exported attempt as `held`;
   - boot, then record whether the bridge restores the attempt. If it does, `inspect`, `resume` and one new input follow. If it does not, check that its commands are refused.

No two units ever write the same home: each import writes only to its own copy.

Both units write session format 4 (`session.v4.jsonl.zstd`) with the same event types in these episodes: 17 types, none new or removed (`*-export-*.json`).

## Result

| Episode | Written by | Read by | Outcome |
|---|---|---|---|
| plain | A | E (upgrade) | resumed: `held` fence kept, `resume` delivered, new input answered on the copied history. A's journal has no identity, so E took the migration path, which accepts the default route only when the session's own `request/header` agrees (`presets.test.mjs` checks the journaled evidence). `inspect` then showed the identity `sophia-review-v1` / mock-model, and that the Agent joined the `sophia-review-v1` preset |
| plain | E | A (**downgrade**, M02-T13) | resumed and continued, as above. A ignores the header's `agentPreset` and the `sophia/identity` record: after a rollback, A resumes on its own default route, as it always did |
| plain | A / E | the same unit (control) | resumed and continued |
| failed-step | E | A (**downgrade**, M02-T13) | resumed and continued; A sends E's logged not-started results |
| failed-step | E | E (control) | resumed and continued |
| failed-step | A | A (control) | **refused explicitly**: `stored log is corrupt: SessionFormatError: step/end leaves unresolved tool call c2`. It is named in the ready report, its commands are refused, and no model call is made |
| failed-step | A | E (upgrade) | **refused explicitly**, with the same reason: E does not repair an old unpaired history |

## What this means for cutover (M02-G5)

- E-written logs are readable by A in both episodes, so a rollback to A does not meet an unparsable log for these event types. A rollback also gives up G3's guarantees: A does not know the recorded identity. This is not a proof for every event type E can write; it covers the ones these episodes produce.
- A session that failed a step with pending tools under A is **already unrecoverable after any restart under A**, and E refuses it too. Such a session stays held under either unit and needs reconstruction, not a retry.
- **Before cutover, Codex's read-only preflight should count them:** active bindings whose last native step ended with an unresolved tool call.
