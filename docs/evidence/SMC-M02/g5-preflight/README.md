# SMC-M02 G5 preflight: settling result-ready old-unit bindings, and a read-only scan of a runtime root

**Observed 2026-09-30 on linux-x64** (Node 24.21.0, pnpm 11.7.0, PostgreSQL 16.13), keylessly: a mock model and a disposable database. **This is disposable evidence, not hosted evidence.** It answers CX-0008 and CX-0009, and it backs [CC-0005](../../../coordination/SMC-M02/SMC-M02-CC-0005.md).

## 1. Settlement of a binding whose brief is already result-ready

CX-0006 read two `sophia-runtime-s1-03-dev` bindings in `running`, with their goals in `checking` and their tasks succeeded. **That is the normal resting state of a finished brief, not a stuck one.** Once a create is delivered, `apply_runtime_receipt` (0012) sets the binding to `running`. `capture_native_result` (0016) then moves the job to `succeeded` and the goal to `checking`. Nothing moves the binding again but a Hold (`idle`) or a Stop (`settled`). No result-accept function exists in 0001–0020.

[settlement.test.mjs](settlement.test.mjs) takes runtime-service.test.mjs's setup unchanged: the real API, PostgreSQL with the checkout's migrations, the worker's `RuntimeDispatcher`, and the pinned unit and its bridge. It brings one brief to that state, then sends the goal command through `POST /api/v1/projects/:projectId/commands`. That is the member route the Studio's Hold and Stop buttons (`WorkControls`) use. Nothing is written by hand.

| Unit (checkout) | Case | Binding | Goal | Attempt | Job | Result source | P3 (live bindings, open native outbox, unanswered commands) | Stages | File |
|---|---|---|---|---|---|---|---|---|---|
| `s1-03-dev`, dsh 0.1.7-rc.1 (`acfa348`, main: production's API, worker and schema; the bundle and unit are byte-equal to `0391bc6`'s) | before | `running` | `checking` | `checking` | `succeeded` | R | 1, 0, 0 | `create:delivered`, `create:incorporation_observed` | [settlement-s1-03-dev.json](settlement-s1-03-dev.json) |
| | **Stop** | **`settled`** | `stopped` | `stopped` | **`succeeded`** | **R, the same; still readable through the member route** | **0, 0, 0** | `+ stop:checked` | |
| | Hold | `idle` | `held` | `checking` | `succeeded` | R, the same | **1**, 0, 0 | `+ hold:checked` | |
| `m02-dev`, dsh 0.2.0-rc.2 (#27 `decb461`; runtime bytes equal revision 4's) | Stop, Hold | the same as above | | | | | | | [settlement-m02-dev.json](settlement-m02-dev.json) |

The Stop case also asserts two more things:
- the result's markdown, source id, provider and model read back unchanged;
- no model call is made.

What it shows:
- **Stop is the permitted settlement.** Stop cancels only `pending` and `running` jobs, so a `succeeded` job keeps its state, its `result_source_id` and its revision. The Studio still offers "Read the brief" on a stopped task, because `TaskCard` shows it whenever `resultSourceId` is set.
- **Hold does not settle.** It leaves an `idle` binding, resumable only through its own unit's instance. After cutover, nobody polls that instance, so a later Resume would wait, and a later Stop would be enqueued to it and never answered.
- **Nothing accepts a result.** Neither command accepts, publishes or changes the brief. The visible change is the task's phase: from "Brief ready" to "Stopped" ("Stopped for good. Nothing it produces afterwards is published.").

**Harness note.** In the old-unit checkout, `tests/support/{harness,mock-llm}.mjs` carried #27's test-support additions from the earlier A/E comparisons:
- the `suite(…, { model })` option;
- `toolCalls` scripts.

This file uses neither, only `sleep`, `unit` and `userTexts`. The bundle, unit, API, worker and migrations were those of `acfa348`.

## 2. A read-only scan of a runtime root

[scan-runtime-root.mjs](scan-runtime-root.mjs) is self-contained: Node 24 only, with no import from the repository. It opens files read-only, writes nothing under the root, and prints only counts, ids and types. It prints no message, prompt or tool text, and no path outside the root. It reports:
- **each session log:** whether it decodes, its events, turn ends by reason, requested tool calls, results, **unpaired calls**, and an open turn;
- **each bridge journal:** its fence, authority epoch, commands by kind, unsettled commands, and whether an identity record is present;
- **each profile's lock SHA-256.**

With `--manifest <file>`, it also lists every file's relative path, size and SHA-256, so that two copies can be compared byte for byte.

SHA-256 of the committed file: `d36a0faa67b07100b2441891d34317385e95f86d42aa251fea13a754438cf2aa`.

Validated on the disposable homes of the log-compat and in-place rehearsals:

| Home | Sessions | Unpaired calls | Fences | Unsettled commands | Identity | File |
|---|---|---|---|---|---|---|
| failed-step, written by the old unit (A) | 1 | **2**, the history both units refuse (log-compat) | held | 0 | no | [scan-failed-step-export-A.json](scan-failed-step-export-A.json) |
| failed-step, written by the candidate (E) | 1 | 0, recovered by `ToolCallRecovery` | held | 0 | yes | [scan-failed-step-export-E.json](scan-failed-step-export-E.json) |
| plain, A / E | 1 / 1 | 0 / 0 | held | 0 | no / yes | [A](scan-plain-export-A.json), [E](scan-plain-export-E.json) |
| the in-place rehearsal's root after the rollback | 1 | 0 | active | 0 | yes | [scan-inplace-root.json](scan-inplace-root.json) |

The in-place root's current profile lock hashes to `07d66a3d…91cb`. That is the hash CX-0007 read on production's installed profile, so production runs the `s1-03-dev` profile inputs that this rehearsal rolled back to.

## What this does not show

- **Production's own two bindings, their logs, Render's shell, and the hosted disk.** CC-0005 names the steps that read those, read-only, and the owner's command that settles the bindings.
- **Anything about a session's content.** The scan deliberately reads none.

## 3. A boot of the candidate with no binding leaves the data untouched

[boot-probe.mjs](boot-probe.mjs) ran at revision 4 (`9198f58`) on a disposable copy of the in-place rehearsal's root after its rollback. That root has the `s1-03-dev` profile and one session. The probe:
1. reconciled the root in place (`upgraded`, 10 drift items);
2. booted with **no binding** (the LABELLED fixture service), which is production's state after A2;
3. stopped after it was ready (`unrecovered: []`).

A manifest from `scan-runtime-root.mjs --manifest` before and after ([boot-probe.json](boot-probe.json)) shows:
- **Byte-equal:** every file under `dsh-home/sessions/`, `dsh-home/sophia-bridge/` and `dsh-home/storages/`.
- **Changed:** only `dsh-home/profiles/` (the reconcile) and the runtime's `home/` caches. The probe's own route overlay also changed.

CC-0005 S3 checks exactly this.
