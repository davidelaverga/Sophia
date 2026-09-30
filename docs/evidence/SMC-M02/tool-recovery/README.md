# SMC-M02 M02-T10: a failed step with tool calls pending, on the installed units

**Observed 2026-09-30 on linux-x64**, keylessly (mock model, LABELLED fixture service), by `tests/integration/tool-recovery.test.mjs` with `SOPHIA_TOOL_RECOVERY_OUT`. Paths are normalized.

| File | Unit | Test result |
|---|---|---|
| [previous-unit.json](previous-unit.json) | `sophia-runtime-s1-03-dev`, dsh 0.1.7-rc.1, run from `acfa348` | **fails**, as expected |
| [candidate-unit.json](candidate-unit.json) | `sophia-runtime-m02-dev`, dsh 0.2.0-rc.2 | **passes** |

## The case

One model step asks for three calls: `c1` `glob *.md`, `c2` `glob FAULT-MARK-*`, `c3` `grep x`. The test-only plugin `tests/support/fault-tool-mode`, loaded only in this disposable composition, makes the scheduler throw while it classifies `c2`. The next turn then sends new input.

**Why a fault plugin.** Every public tool seam of dsh is fail-closed:
- a throwing guard, `tools/pre-execute` or `tools/post-execute` becomes an error *result*;
- a throwing concurrency classifier becomes `exclusive`;
- tool calls start only after the assistant message is committed, so a failing model stream leaves nothing pending.

No black-box input therefore reaches the failed-step path. The plugin wraps the public `ctx.tools.executionMode` method, which is the seam upstream's own test uses for this case (`packages/core/agent-loop/tests/tool-calls.spec.ts`, phase `execution-mode`). No upstream loop code is copied, replaced or spliced.

## Observed

| | Previous unit (A) | Candidate unit (E) |
|---|---|---|
| Turn 1 ends | `error`: `injected scheduler failure at c2` | the same: the original failure, not success |
| `tool/call` events (calls started) | `c1` only | `c1` only |
| `tool/result` events in the durable log | **`c1` only: `c2` and `c3` stay unpaired** | `c1` (the committed "No files found", `sourceEventSeqs` → its `tool/call`), `c2` and `c3` `TOOL_NOT_STARTED`, `isError` |
| Results written before the failed `step/end` | — | yes |
| Next request's history | `calls c1,c2,c3`, then `result c1`, `c2`, `c3`; the two missing results are **filled in with "No result provided"** at request time | the same pairing, carrying the logged not-started results |
| After a restart ([log-compat](../log-compat/README.md)) | **the session is refused as corrupt** (`step/end leaves unresolved tool call c2`) | resumes and continues |

## Limits

- **Unknown outcome is not observed by this repository's test.** A call that *started* before the failure (upstream's `prepare`, `finalize` and `dispatch` phases) is reachable only through the scheduler's `@internal` phases (`TOOL_RUNTIME_SCHEDULER`), which this repository does not touch.
- **It is covered by upstream's own tests, run by Codex** ([SMC-M02-CX-0002](https://github.com/davidelaverga/Sophia/issues/26#issuecomment-5917094857), OP-0001). The run used upstream's checkout at `639ed015` with its frozen lock on Darwin arm64, Node 24.21.0:
  - `tool-calls.spec.ts` "failure quiescence": 6/6 pass, including the `prepare` and `finalize` phases, which record the started call as `TOOL_OUTCOME_UNKNOWN`;
  - `repair.spec.ts`: 32/32 pass.

  `dsh:source --verify-release` ties that source to the published packages byte for byte (897 files). This is upstream's test on upstream's harness, not a black-box run on the installed Sophia unit.
- A natural trigger, such as a session append failing on a full disk, is not reproduced.
