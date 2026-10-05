# SDD-01 progress: native dsh HTML design, review and iteration

The mission: Sophia Native Design Mission Pack v0.1 (4 October 2026), [`03_SDD01_MISSION.md`](../missions/2026-10-04-native-design/03_SDD01_MISSION.md); acceptance B-01..B-30 in [`06_ACCEPTANCE_AND_EVIDENCE.md`](../missions/2026-10-04-native-design/06_ACCEPTANCE_AND_EVIDENCE.md). Coordination: [docs/coordination/SDD-01](../coordination/SDD-01/README.md). Binding: [BINDING_MAP.md](../coordination/SDD-01/BINDING_MAP.md).

This record keeps source, local tests, review, merge, hosted state and acceptance apart. A commit cannot name its own SHA: the exact candidate is the one named in the latest `SDD-01-CC-*` review request.

| Readiness (pack labels) | State |
|---|---|
| `source_ready`, `locally_verified` | In progress (gates below) |
| `release_prepared`, `authorized`, `deployed`, `app_verified` | No |
| `owner_accepted` | No |

## 1. Gates

Levels (binding map §10): L0 source and fixtures; L1 pinned dsh, confined Chromium, PostgreSQL 16, faux model where labelled; L2 a paid model; L3 the real app. Nothing below is L2 or L3.

| Gate | State | Evidence (L0/L1) |
|---|---|---|
| G0 binding | Written: [BINDING_MAP.md](../coordination/SDD-01/BINDING_MAP.md); changes since G0 in its §12. Codex's boundary review requested (CC-0001) | — |
| G1 import and presets | Source-ready. Four native skills, their references and 17 images verified against the manifest; two identity-only presets; a role whose bytes do not verify is not advertised and refuses to start | `tests/unit/design-skills.test.mjs`, `tests/unit/design-tools.test.mjs`, `tests/integration/design-tools.test.mjs` |
| G2 native designer | Source-ready. Nine `design_*` tools over A12's runtime operations: frozen package, work record, CAS source writes and exact patches (parser-checked before storage), render, inspect, submit, blocker | `packages/design/src/design.test.ts`, `apps/api/src/design.db.test.ts`, the two test files above |
| G3 render, inspection, review, repair | Source-ready. Capture kernel in the confined browser (overview and section tiles at 390/1280, measures); the hard gate; captures reach the model as image blocks (exact PNG bytes reach the provider request, L1 with a local Responses stub); separate reviewer with its own four tools and a coverage check; at most 2 repairs and 3 rounds; `self_review_only` and `review_unresolved` labelled | `renderers/web/pdf/test/capture-html.test.ts`, `apps/api/src/design.db.test.ts`, `tests/integration/design-tools.test.mjs` |
| G4 persisted HTML and app | Source-ready. Format-driven admission (`html_unavailable` without a designer and a capture runner); the page published as an `html` rendition of the next version; Studio shows it in a frame with no permission from bytes checked against the rendition's hash, Download saves the same bytes; work, notice, design and Knowledge cards; C-1..C-4 replaced and the conversion's Studio seam removed | `apps/api/src/design.db.test.ts`, `apps/api/src/research.db.test.ts`, Studio unit tests, `e2e/report.spec.ts` and `e2e/voice-chat.spec.ts` "HTML ·" checks, `legacy-conversion.test.ts` |
| G5 steering, edit scope, recovery | Partial. Steer, Hold and Stop reach the design attempt through the existing goal commands; Stop ends the design and a late render or review cannot publish; scope checks refuse a protected section, the shell or the shared stylesheet (B-17); CAS refuses a stale base (B-18); a restart restores the exact preset and verified assets. Not built: admitting an *edit* of a published page (mode `edit` exists in the schema only), live revocation of a running design, resuming an unstarted design after Hold (§4) | `packages/design/src/design.test.ts`, `apps/api/src/design.db.test.ts` |
| G6 controlled comparison | Harness and bundle ready; control arm measured (L1) on four frozen inputs; native arm `not_run` (paid route, O-5) | [g6/](../coordination/SDD-01/g6/README.md), `scripts/g6-control.mjs --check` |
| G7 release and app verification | Codex's, after review and approval | — |

## 2. Baseline

`main` `ed6f3cd`, linux-x64, Node 24.21.0, pnpm 11.7.0: `pnpm check` exit 0 (unit 1275: 1274 pass, 1 skipped; integration 84: 82 pass, 2 skipped). The confined PDF kernel's tests (`renderers/web/pdf/test/render-html.test.ts`, `SOPHIA_RENDERER_REQUIRED=1`, render user 65534, Chromium headless shell 1194) pass 18/18 on this host, so the capture kernel is testable here with the real sandbox.

## 3. Acceptance mapping (B-cases, pack 06)

| Case | Level reached | Where |
|---|---|---|
| B-01 prompt/skill missing | L1 | A changed byte, a missing file or a path leaving the bundle makes the role unavailable (`tests/unit/design-tools.test.mjs`); the bridge then neither advertises it nor starts it (`control-bridge.ts` `designProblem`, `installDesign`) |
| B-02 donor inventory | L0 | `tests/unit/design-skills.test.mjs`, `tools/test_inventory_raven.py`, [RAVEN_PARITY.md](../coordination/SDD-01/RAVEN_PARITY.md) |
| B-03 scoped composition | L1 | The designer is offered exactly its nine tools and the reviewer its four (no `design_*`), no workspace, host or research tool; a design tool called by the reviewer is refused (`tests/integration/design-tools.test.mjs`) |
| B-04 Markdown request | L1 | `research.db.test.ts` (unchanged research path), `design.db.test.ts` admission cases |
| B-05 new HTML request | L1 | `design.db.test.ts`: admitted, recorded on the task, designed after the research; no conversion path remains in Studio (`legacy-conversion.test.ts`) |
| B-06 frozen content | L0/L1 | Content-map mutants in `design.test.ts` (dropped block, changed number or cell, dropped/added citation, invented block, dropped source or limitation, padded claim); hidden text is caught by the render (`capture-html.test.ts` defects, `blocks_visible` refusal in `design.db.test.ts`) |
| B-07 reference perception | L1 | A specimen image goes through the attachment service as an image block (`design-tools.test.mjs`); a route without image input or without attachments stores and sends nothing |
| B-08 real representative frame | L1 (faux model) | The full flow stores authored source, compiles and captures it in the confined kernel (`design.db.test.ts`); a real model's frame is L2 |
| B-09 image-capable reviewer | L1 transport only | The capture's exact PNG bytes reach the provider request for the designer and the reviewer (`tests/integration/design-tools.test.mjs`). Whether gpt-6.1-sol *detects* a planted defect is the L2 probe O-5 |
| B-10 no author-biased review | L1 | The review context excludes the author's summary and work record; a pass before inspecting each target's overview and every section is `coverage_incomplete` (`design.db.test.ts`) |
| B-11 stale render/review | L1 | A candidate must name the latest revision and a whole-page render of exactly it (`design.db.test.ts`) |
| B-12 bounded repair | L1 | `design.db.test.ts` (one repair, then publication; ceilings 2 repairs, 3 rounds in 0038/0040) |
| B-13 static confinement | L0/L1 | Unsafe source refused before storage (`design.test.ts`, `design.db.test.ts`); the capture refuses any request outside the page (`capture-html.test.ts`); Studio's frame has `sandbox=""` and `srcdoc` only (`e2e/report.spec.ts`) |
| B-14 long-report coverage | L1 | Capture budget and named missing sections (`capture-html.test.ts`); review coverage check (`design.db.test.ts`) |
| B-15 active steer | Not shown | The existing goal steer reaches the design attempt (0040 dispatch); no test drives a steer into a design yet |
| B-16 selective revision | L0 | Exact edit inside an editable section with its diff (`design.test.ts`); edit admission not built (G5) |
| B-17 collateral edit mutant | L0 | `design.test.ts` "refuses a change to a protected section, the page around the sections, or the shared stylesheet" |
| B-18 stale/concurrent patch | L0/L1 | `design.test.ts` stale base; CAS on `expectedSha256` in 0039 |
| B-19 disconnect/return | Not shown here | Admitted work is the runtime's (unchanged); no browser test |
| B-20 Hold/Stop during render/review | L1 partial | Stop trigger ends the design (0040 `goals_stop_ends_designs`); a cancelled render cannot be submitted |
| B-21 revocation | Gap | Dispatch refuses a design whose source is withdrawn; a running design is not yet revoked live (§4) |
| B-22 retry/uncertain effect | L1 | Every operation keyed by (native session, call id) and replay-safe; package freezing replay-safe (`design_package_input` returns NULL once frozen) |
| B-23 open/download parity | L1 | `e2e/report.spec.ts`: the frame's `srcdoc` and both downloads are the stored bytes; a mismatch is not shown |
| B-24 viewer freshness | L1 | The viewer's version pinning is unchanged (`e2e/report.spec.ts` ART-02) and applies to the HTML view |
| B-25 format not ready | L1 | `html_unavailable` at admission; a page not designed is "Partly delivered" with its reason, never a template (`report-view.test.ts`) |
| B-26 billing and limits | L1 | Every designer and reviewer model call reserved and settled through `design/reserve` and `design/settle` against the lineage allowance (`tests/integration/design-tools.test.mjs`) |
| B-27 legacy compatibility | L1 | MD/PDF readers and ids unchanged; `renderReportPage` kept for G6 only |
| B-28 versioned recovery | L1 | Presets recorded by digest (unchanged mechanism); assets re-verified at every create and resume |
| B-29 private/shared context | L1 | Reference reads limited to the role's own skills (`design-tools.test.mjs`); runtime operations authenticated by capability and binding |
| B-30 real-app episode | — | Codex, G7 |

## 4. Known gaps at this candidate

1. **Live revocation.** A withdrawn source stops dispatch of a design that has not started, but a running design session is not revoked mid-run; research's revocation trigger does not yet cover design jobs.
2. **Resume after Hold.** Resuming an unstarted design after a Hold relies on research's resume path; a design-specific resume is not tested.
3. **Edit admission.** The schema carries `mode` and `scope`, and the source checks enforce scope, but no API admits an edit of a published page yet (B-16 end to end).
4. **Host probe.** The renderer host probe qualifies the PDF kernel only; the capture kernel is covered by its tests and CI's confined-renderer job, not by the probe.
5. **Supervisor crossing.** The supervisor's capture upload path is unit-tested; no integration test runs the real capture kernel against the API and database end to end.
6. **Guide v1.3.** Guide v1.2 already sends `html`, so admission works; its wording ("every report also downloads as an HTML page") becomes false at cutover and needs Davide's decision (O-4).

## 5. Evidence at the G2–G4 candidate (implementer, linux-x64, Node 24.21.0, pnpm 11.7.0)

| Check | Result |
|---|---|
| `pnpm check` | Exit 0. Unit 1366: 1365 pass, 1 skipped. `pnpm artifacts`: every identity of `sophia-runtime-sdd01-dev` reproduced. Integration 86: 84 pass, 2 skipped (as on `main`), including `tests/integration/design-tools.test.mjs` |
| `pnpm test:sql` (repo and pack), `pnpm test:db` | Pass; `test:db` 442/442 on a local PostgreSQL 16 (Docker is not available on this host) |
| Studio e2e, all specs | 562 run: 559 pass. Three failed under the full parallel load: two animation-frame timing checks (Home's light, sign-in's attention) and the reading check that this change edited after the run started. All three spec groups pass when re-run (21/21). Local runs use the preinstalled Chromium 141 through `executablePath`; CI runs the pinned browser |
| Capture kernel | `renderers/web/pdf/test/capture-html.test.ts` with the real confined Chromium (render user, user namespaces), inside `pnpm test` |
| G6 control | `node scripts/g6-control.mjs --check`: the inputs and control pages reproduce; four control captures, sandbox active, every kernel check passed |

