# SDD-01 progress: native dsh HTML design, review and iteration

The mission: Sophia Native Design Mission Pack v0.1 (4 October 2026), [`03_SDD01_MISSION.md`](../missions/2026-10-04-native-design/03_SDD01_MISSION.md); acceptance B-01..B-30 in [`06_ACCEPTANCE_AND_EVIDENCE.md`](../missions/2026-10-04-native-design/06_ACCEPTANCE_AND_EVIDENCE.md). Coordination: [docs/coordination/SDD-01](../coordination/SDD-01/README.md). Binding: [BINDING_MAP.md](../coordination/SDD-01/BINDING_MAP.md).

This record keeps source, local tests, review, merge, hosted state and acceptance apart. A commit cannot name its own SHA: the exact candidate is the one named in the latest `SDD-01-CC-*` review request.

| Readiness (pack labels) | State |
|---|---|
| `source_ready`, `locally_verified` | G0–G5 source-ready at L1 (gates below); G6 control arm only |
| `release_prepared` | Packet prepared by the implementer for Codex: [PRODUCTION_BATCH.md](../coordination/SDD-01/PRODUCTION_BATCH.md); its preconditions are not met |
| `authorized`, `deployed`, `app_verified` | No |
| `owner_accepted` | No |

## 1. Gates

Levels (binding map §10): L0 source and fixtures; L1 pinned dsh, confined Chromium, PostgreSQL 16, faux model where labelled; L2 a paid model; L3 the real app. Nothing below is L2 or L3.

| Gate | State | Evidence (L0/L1) |
|---|---|---|
| G0 binding | Written: [BINDING_MAP.md](../coordination/SDD-01/BINDING_MAP.md); changes since G0 in its §12. Codex's boundary review requested (CC-0001) | — |
| G1 import and presets | Source-ready. Four native skills, their references and 17 images verified against the manifest; two identity-only presets; a role whose bytes do not verify is not advertised and refuses to start | `tests/unit/design-skills.test.mjs`, `tests/unit/design-tools.test.mjs`, `tests/integration/design-tools.test.mjs` |
| G2 native designer | Source-ready. Nine `design_*` tools over A12's runtime operations: frozen package, work record, CAS source writes and exact patches (parser-checked before storage), render, inspect, submit, blocker | `packages/design/src/design.test.ts`, `apps/api/src/design.db.test.ts`, the two test files above |
| G3 render, inspection, review, repair | Source-ready. Capture kernel in the confined browser (overview and section tiles at 390/1280, measures); the hard gate; captures reach the model as image blocks (exact PNG bytes reach the provider request, L1 with a local Responses stub); separate reviewer with its own four tools and a coverage check; at most 2 repairs and 3 rounds; `self_review_only` and `review_unresolved` labelled. The real supervisor runs the capture kernel against the real API and PostgreSQL end to end, and the host probe qualifies the capture kernel | `renderers/web/pdf/test/capture-html.test.ts`, `renderers/web/pdf/test/host-probe.test.ts`, `apps/api/src/design.db.test.ts`, `tests/integration/design-tools.test.mjs`, `tests/integration/design-capture-supervisor.test.mjs` |
| G4 persisted HTML and app | Source-ready. Format-driven admission (`html_unavailable` without a designer and a capture runner); the page published as an `html` rendition of the next version; Studio shows it in a frame with no permission from bytes checked against the rendition's hash, Download saves the same bytes; work, notice, design and Knowledge cards; C-1..C-4 replaced and the conversion's Studio seam removed | `apps/api/src/design.db.test.ts`, `apps/api/src/research.db.test.ts`, Studio unit tests, `e2e/report.spec.ts` and `e2e/voice-chat.spec.ts` "HTML ·" checks, `legacy-conversion.test.ts` |
| G5 steering, edit scope, recovery | Source-ready (L1). A steer reaches the running designer's own session (B-15). Hold during a render or a review waits and Resume finishes it; a design or review that never started is queued at Resume; Stop ends the design and a late render or verdict cannot publish (B-20). A withdrawn source revokes a running design and its review in the erasing transaction and fences every operation (B-21, RF-0003, 0041). A scoped edit of a published page is admitted by API and guide v1.3: protected sections, the shell, the stylesheet and a whole rewrite are refused, a stale base conflicts, a protected section that renders differently fails the gate, reflow does not (B-16..B-18). Leaving and returning shows the record as it is (B-19) | `apps/api/src/design.db.test.ts` (0041 cases), `packages/design/src/design.test.ts`, `e2e/report.spec.ts` B-19 |
| G6 controlled comparison | Harness and bundle ready; control arm measured (L1) on four frozen inputs; native arm `not_run` (paid route, O-5) | [g6/](../coordination/SDD-01/g6/README.md), `scripts/g6-control.mjs --check` |
| G7 release and app verification | Codex's, after review and approval | — |

## 2. Baseline

`main` `ed6f3cd`, linux-x64, Node 24.21.0, pnpm 11.7.0: `pnpm check` exit 0 (unit 1275: 1274 pass, 1 skipped; integration 84: 82 pass, 2 skipped). The confined PDF kernel's tests (`renderers/web/pdf/test/render-html.test.ts`, `SOPHIA_RENDERER_REQUIRED=1`, render user 65534, Chromium headless shell 1194) pass 18/18 on this host, so the capture kernel is testable here with the real sandbox.

## 3. Acceptance mapping (B-cases, pack 06)

| Case | Level reached | Where |
|---|---|---|
| B-01 prompt/skill missing | L1 | A changed byte, a missing file or a path leaving the bundle makes the role unavailable (`tests/unit/design-tools.test.mjs`); the bridge then neither advertises it nor starts it (`control-bridge.ts` `designProblem`, `installDesign`) |
| B-02 donor inventory | L0 | `tests/unit/design-skills.test.mjs`, `tools/test_inventory_raven.py`, [RAVEN_PARITY.md](../coordination/SDD-01/RAVEN_PARITY.md) |
| B-03 scoped composition | L1 | The designer is offered exactly its nine tools and the reviewer its four (no `design_*`), no workspace, host or research tool; a design tool called by the reviewer is refused (`tests/integration/design-tools.test.mjs`). Every tool a role's texts name is its own, and the reviewer loads none of the maker's instructions (`tests/unit/design-roles.test.mjs`, RF-0002) |
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
| B-15 active steer | L1 (faux model) | `control_work` steer on a design task: the speaker's own contribution, delivered as a `steer` to the design attempt's session, whose operations stay authorized under it (`design.db.test.ts` "a steer reaches the running designer"). The designer acting on it with a real model is L2/L3 |
| B-16 selective revision | L1 | `design.db.test.ts` "a scoped edit of a published page": admitted over HTTP (`POST /api/v1/projects/{id}/html-edits`) and by guide v1.3 (`revise_html_page`); bound to the published candidate (revision 1 is its source); the person's words and the scope reach the designer and the reviewer; the revised page is the next version with `Revises the designed HTML page (s2)` |
| B-17 collateral edit mutant | L1 | The same test: a patch of a protected section, of the stylesheet, and a whole write that changes a protected section are refused and store nothing; a protected section whose render changed shape fails the gate (`protected section s1 changed at …`), an unchanged page fails it too; `design.test.ts` at L0 |
| B-18 stale/concurrent patch | L1 | A patch against the published base after an in-scope revision is a 409 conflict; a second edit of a page under design is refused; an edit of a superseded version is `stale_revision` |
| B-19 disconnect/return | L1 | The work never needs the browser (every DB case runs without one); `e2e/report.spec.ts` B-19: leaving while the page is designed and coming back shows the published page and its review, and no "Designing" (this fixed a card that kept "Designing" until a reload) |
| B-20 Hold/Stop during render/review | L1 | `design.db.test.ts` "Hold, Resume and Stop of a design": a render settled during a Hold is queued again and not handed out while held; a late render or verdict during Hold is refused; Resume finishes both and publishes; a Stop during review refuses the late verdict and publishes nothing; a review admitted before the Hold starts at Resume. `design-capture-supervisor.test.mjs`: a Stop during a real capture kills the kernel and keeps nothing |
| B-21 revocation | L1 | `design.db.test.ts` "SDD-01-RF-0003": erasing a cited source revokes the running design and its review in the same transaction (attempts revoked, sessions stopped, candidates failed, reason recorded); every operation of either role (context, record, reserve, source, render, render result, inspection, submit, review context, inspection, verdict) is refused; incurred usage settles; a restarted runtime is told both sessions are stopped; a design not yet started or on a held goal is revoked and never resumed. With the revocation removed the test fails |
| B-22 retry/uncertain effect | L1 | Every operation keyed by (native session, call id) and replay-safe; package freezing replay-safe (`design_package_input` returns NULL once frozen) |
| B-23 open/download parity | L1 | `e2e/report.spec.ts`: the frame's `srcdoc` and both downloads are the stored bytes; a mismatch is not shown |
| B-24 viewer freshness | L1 | The viewer's version pinning is unchanged (`e2e/report.spec.ts` ART-02) and applies to the HTML view; a work card reads its research again once the design ends (B-19 test) |
| B-25 format not ready | L1 | `html_unavailable` at admission; a page not designed is "Partly delivered" with its reason, never a template (`report-view.test.ts`) |
| B-26 billing and limits | L1 | Every designer and reviewer model call reserved and settled through `design/reserve` and `design/settle` against the lineage allowance (`tests/integration/design-tools.test.mjs`) |
| B-27 legacy compatibility | L1 | MD/PDF readers and ids unchanged; `renderReportPage` kept for G6 only |
| B-28 versioned recovery | L1 | Presets recorded by digest (unchanged mechanism); assets re-verified at every create and resume |
| B-29 private/shared context | L1 | Reference reads limited to each role's registry scope, exactly (`design-roles.test.mjs`, RF-0002); runtime operations authenticated by capability and binding |
| B-30 real-app episode | — | Codex, G7 |

## 4. Known gaps at this candidate

The earlier list (live revocation, Resume after Hold, edit admission, host probe, supervisor crossing, guide v1.3) is closed at L1 by 0041 and this candidate's tests (§3). What remains:

1. **L2 and L3.** No paid model has run either role, and no real-app episode has run (O-5, G7). Perception, the designer acting on a steer or an edit with a real model, and the G6 native arm are not claimed.
2. **Edit in Studio.** An edit is asked for by voice or text (guide v1.3, `revise_html_page`) or over HTTP; Studio shows the edit's task and its published page but has no form for it.
3. **A steer during a review.** A steer reaches every open session of the goal, as 0012 has it (M03): the designer, and also a reviewer that is running. While the candidate is under review the designer cannot change the page; the steer is in its session when a revision is asked for, and is lost if the review passes. Routing a steer to the designer only needs a dispatch change (WBC-02 also replaces `dispatch_runtime_outbox`), so it is left to the combined branch.
4. **Guide v1.3 cutover.** v1.3 is built and verified (assets, declarations, API surface); the bridge's default stays v1.2 until the operator sets `SOPHIA_GUIDE_VERSION=v1.3` after the API is live ([PRODUCTION_BATCH.md](../coordination/SDD-01/PRODUCTION_BATCH.md)).
5. **Owner decisions** O-1 (design's share of the cap), O-2 (image rights), O-3 (Studio CSP before enforcement) are open.

## 5. Evidence at this candidate (implementer, linux-x64, Node 24.21.0, pnpm 11.7.0)

| Check | Result |
|---|---|
| `pnpm check` | Exit 0. Unit 1421: 1420 pass, 1 skipped. `pnpm artifacts`: every identity of `sophia-runtime-sdd01-dev` reproduced (bundle re-recorded: the runtime wire module follows A12). Integration 99: 97 pass, 2 skipped (as on `main`), including `tests/integration/design-tools.test.mjs` and the new `design-capture-supervisor.test.mjs` (2/2, the real confined capture kernel) |
| `pnpm test:db` | 452/452 on a local PostgreSQL 16, including the 0041 cases in `apps/api/src/design.db.test.ts` |
| `pnpm test:sql` (repo, 41 migrations; pack) | Pass |
| Studio e2e | `report`, `room-work`, `room-made`, `voice-chat`, `room-live-version`, `report-reading`, `work`: 271/271 (local preinstalled Chromium through `executablePath`; CI runs the pinned browser) |
| Host probe on this host (root, render user 1000) | `render`, `kernel_checks`, `sandbox`, `capture`, `capture_checks`, `capture_sandbox`, `capture_images` (10 captures) pass; `host-probe.test.ts` 13 pass, 1 skipped (root reads every file) |
| Mutations | Without the revocation call in `mission_erase_source`, both RF-0003 tests fail; without the work card's refresh, the B-19 e2e check fails |
| G6 control | `node scripts/g6-control.mjs --check` reproduces (unchanged) |

## 6. Review findings

| Finding | From | State | Fix and evidence |
|---|---|---|---|
| SDD-01-RF-0001 (P2): the risk ledger named a work-record kind the API refuses (`risk_ledger`) | Codex, CX-0002 at `b1e227e` | Fixed in `a3b492b`; `pass_for_scope` (CX-0003) | The critique, foundation and web-finish skills and `critique/ledger-format` name `risk`. `tests/unit/design-roles.test.mjs` checks every kind any bundle text names against the tool's schema and both SQL lists (0038 constraint, 0039 check); with `risk_ledger` put back it fails |
| SDD-01-RF-0002 (P2): the reviewer's procedure required precedents it could not read, and it loaded the maker's instructions | Codex, CX-0002 at `b1e227e` | Fixed in `a3b492b`; `pass_for_scope` (CX-0003) | Registry `references` gives each design role an explicit read-only scope; the loader reads by scope, not by skill. The reviewer loads `sophia-visual-critique-review-v1` (`REVIEW.md`, the reviewer's clauses only) and reads the gallery and the precedents. Per-role tool and reference closure in `design-roles.test.mjs` (fails with the reviewer composed as before); its precedent read reaches the provider as an image in `tests/integration/design-tools.test.mjs` |
| SDD-01-RF-0003 (P1): a running designer stayed authorized to read, reserve, write, render and publish after a source its report drew on was erased | Codex, CX-0003 at `a67979b` | Fixed; awaiting Codex's recheck | 0041: `design_revoke_source` from `mission_erase_source` revokes every design and review under way whose closure holds the source (attempts revoked, sessions stopped, renders cancelled, candidates failed); `design_scope_of` refuses fenced work whose attempt is revoked or whose closure is withdrawn, and the render result is not read; `design_publish` rechecks the design, its attempt and the candidate's closure; a create is refused at dispatch. Settle stays unfenced. CX-0003's steps in `design.db.test.ts` "SDD-01-RF-0003" (every operation of both roles 409, incurred usage settles, nothing published, the restarted runtime is told both sessions are stopped), plus not-started and held designs; with the revocation removed both tests fail |
