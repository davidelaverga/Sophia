# SDD-01 progress: native dsh HTML design, review and iteration

The mission: Sophia Native Design Mission Pack v0.1 (4 October 2026), [`03_SDD01_MISSION.md`](../missions/2026-10-04-native-design/03_SDD01_MISSION.md); acceptance B-01..B-30 in [`06_ACCEPTANCE_AND_EVIDENCE.md`](../missions/2026-10-04-native-design/06_ACCEPTANCE_AND_EVIDENCE.md). Coordination: [docs/coordination/SDD-01](../coordination/SDD-01/README.md). Binding: [BINDING_MAP.md](../coordination/SDD-01/BINDING_MAP.md).

This record keeps source, local tests, review, merge, hosted state and acceptance apart. A commit cannot name its own SHA: the exact candidate is the one named in the latest `SDD-01-CC-*` review request.

| Readiness (pack labels) | State |
|---|---|
| `source_ready`, `locally_verified` | In progress (gates below) |
| `release_prepared`, `authorized`, `deployed`, `app_verified` | No |
| `owner_accepted` | No |

## 1. Gates

| Gate | State | Evidence |
|---|---|---|
| G0 binding | Written: [BINDING_MAP.md](../coordination/SDD-01/BINDING_MAP.md); awaiting Codex's boundary review | — |
| G1 import and presets | Not started | — |
| G2 native designer | Not started | — |
| G3 render, inspection, review, repair | Not started | — |
| G4 persisted HTML and app | Not started | — |
| G5 steering, edit scope, recovery | Not started | — |
| G6 controlled comparison | Not started | — |
| G7 release and app verification | Codex's, after review and approval | — |

## 2. Baseline

`main` `ed6f3cd`, linux-x64, Node 24.21.0, pnpm 11.7.0: `pnpm check` exit 0 (unit 1275: 1274 pass, 1 skipped; integration 84: 82 pass, 2 skipped). The confined PDF kernel's tests (`renderers/web/pdf/test/render-html.test.ts`, `SOPHIA_RENDERER_REQUIRED=1`, render user 65534, Chromium headless shell 1194) pass 18/18 on this host, so the capture kernel is testable here with the real sandbox.
