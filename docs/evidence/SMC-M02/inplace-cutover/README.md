# SMC-M02 G4: in-place cutover and rollback rehearsal on one disposable root

**Observed 2026-09-30 on linux-x64** (Node 24.21.0, pnpm 11.7.0), keylessly: a mock model and the LABELLED fixture service. **This is a disposable rehearsal, not hosted evidence.** The script is [rehearse.mjs](rehearse.mjs). Paths are normalized to `<root>`.

It rehearses what the Render runtime host does across a deploy. One fixed project root, the same shape as `/var/data/sophia/<projectId>`, is run by three units in turn. Only one runtime runs at a time, and each phase stops before the next starts.

| Phase | Checkout | Unit | What happened | File |
|---|---|---|---|---|
| 1. Old | `acfa348` | `sophia-runtime-s1-03-dev` | Installed its profile and created an attempt (`sophia-review-v1`) with one tool call. After the turn ended, the attempt was held | [old.json](old.json) |
| 2. Cutover | PR #29 head `fe6b0fd` | `sophia-runtime-m02-dev` | #16's `reconcileProfile` found 10 drift items (lock, archive, 8 bundle files), set the old profile aside as `.sophia-runtime.previous`, reinstalled, and then found no drift. Sessions, storages, the journal and the workspace were kept. The attempt resumed with its fence: `inspect` showed `held`, `resume` was `delivered`, and the next turn's history was paired. The journal gained `sophia/identity`, `source: migrated`, with evidence from the session's own `request/header`. The Agent joined `sophia-review-v1` | [new.json](new.json) |
| 3. Rollback | `86d35ad` (code `0391bc6`, production's recovery target) | `sophia-runtime-s1-03-dev` | The same reconcile back: 10 drift items, then none, and the candidate's profile set aside. The attempt resumed on the old unit, which read everything the candidate had written, and answered a new turn | [rollback.json](rollback.json) |

## What it does not show

- **The service side.** Phases 2 and 3 bound the old attempt to each unit through the fixture service. **Production's service does not do that.** `execution_bindings.runtime_unit_id` is fixed when an attempt is admitted, and `runtime_hello` hands a runtime only the bindings of its own unit. After cutover, the new runtime never sees an `s1-03-dev` binding, and a Hold or Stop for one still routes to the old unit's runtime instance. The cutover therefore requires **zero non-terminal old-unit bindings** (CC-0003, P3), not a rebinding.
- **A live model call, the hosted disk, Render's deploy sequencing.**
