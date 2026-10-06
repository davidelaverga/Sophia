# M75 — finish PR #75 as the reusable foundation

## Mission contract

**Starting PR:** #75, `claude/smc-m03-report-v2`. **Observed head:** `86f70aa3a7e205f305e8a126995fc6ec0ee472dc`. **Observed base:** `2712f2c2cb06f2ce7fbd4fb9cc437671c41577e7`. **Coordination:** existing issue #31, message IDs `M75-CC-####` / `M75-CX-####`, linked to the PR. Reconfirm on launch. [SRC-S1, SRC-S4]

**Definition of done:** a reviewed and testable reader/rendering foundation; the fixed HTML template is available as an internal seed/control and for explicit legacy compatibility, not misrepresented as the new design workflow. Every existing review finding is resolved or remains visibly open. The production design policy is not declared delivered by this PR.

## A0 — recover the real branch

Claude reads repository guidance, PR description and all review threads, current head/base, conflict state, affected paths and M03 coordination. Record which tests ran on which SHA; an old automated review is not a review of today's head. Read current main before editing because #32 is merged.

Codex independently reads the same sources and records toolchain, checkout and available browser/testing capabilities. No merge/deployment is inferred from `mergeable: true`.

## A1 — retain and modularize these areas

| Existing path | Required disposition |
|---|---|
| `packages/report/src/page-css.ts` | Keep editorial seed styling versioned. No requirement that every native design use it. |
| `packages/report/src/report-page.ts` | Keep known-markup conversion as a legacy/control/seed function. Do not feed arbitrary authored HTML through its regex-based trusted-template transformations. |
| `packages/report/src/page-words.ts`, `language.ts` | Retain supported wording/localization and explicit unknown-language behavior. |
| `apps/studio/src/features/artifacts/MarkdownView.tsx`, `artifacts.css`, `cite-view.ts` | Retain reader, citation and table/accessibility improvements; isolate artifact CSS from application chrome. |
| `apps/studio/src/features/artifacts/DocumentPane.tsx` | Keep version pinning, focus, side/full-page navigation, Sources/History and existing media controls. Provide a clear integration point for SDD-01's separate designed-HTML view. |
| `apps/studio/src/features/artifacts/PageDownload.tsx`, `report-page.ts` | Mark direct conversion as legacy/internal. Document every caller to replace in SDD-01. Under the design-enabled product route, no user action may call this converter to fulfill a new HTML request. |
| `apps/studio/src/features/conversation/NoticeCard.tsx` and related view tests | Preserve what Open and Download mean. No statement that HTML was designed/reviewed when it was merely converted. |
| `apps/studio/e2e/report-page.spec.ts`, `report-probes.ts`, `report-reading.spec.ts`, fixtures | Retain hard regression probes and original defect cases. Separate template-specific assertions from reusable artifact checks. |

Do not rewrite `pdf-report-v1`, old source hashes, historical report IDs, research prompt identities, migrations or generated API contracts in M75. The current PR explicitly promises these boundaries; widen them only in SDD-01. [SRC-S1, SRC-S5]

## A2 — distinguish fixed-profile tests from general design checks

Keep exact template invariants (its five-size scale, editorial line measure and byte snapshots) under the `html-report-v2` seed profile. Reuse general checks for escaping, source/citation closure, unique anchors, safe links, readable tables, keyboard access and no clipped content.

For future generated designs, do not require the seed's exact layout, typeface choices or number of sizes. Do not weaken accessibility or provenance requirements to accommodate an attractive candidate. A wide table may have an explicit keyboard-scroll region on a small screen; it must not hide a last column or create uncontrolled body overflow.

Keep comparison fixtures that fail on the old template. Any intentional fixture update must show the behavior change and the old counterexample; no blanket golden regeneration.

## A3 — define the migration surface, not the new feature

Write `docs/coordination/M75/HANDOFF_TO_SDD01.md` with:

- verified final PR/head/base and changed-file inventory;
- exported seed/rendering helpers and their actual signatures;
- every browser-side HTML conversion caller;
- existing UI and source/rendition assumptions the new route must extend;
- reusable probes, fixtures, remaining findings and deployment scope;
- fixed-template evidence labelled as baseline/control, never native-designer results.

Do not create a second “basic HTML” route. The preferred release is coordinated with SDD-01 so its server-side capability and stored-artifact path replace these conversion callers together. M75-only local/preview testing is permitted; a separate production reader-only release requires an explicit bounded owner decision and must not advertise design completion.

## A4 — Codex review and browser qualification

Run the applicable existing project commands from `06_ACCEPTANCE_AND_EVIDENCE.md` in a clean worktree. Exercise the actual built Studio at 390px and 1280px, light/dark and print where supported, including citation hit targets, unusual heading collisions, long URLs, hostile text, wide tables and EN/IT/ES.

Review final whole diff, not only fixes. Retest current head after any change that invalidates evidence. Record expected unavailable conditions; do not write “passed” for unexecuted suites. Preserve exact output-profile identity and prior PDF bytes.

## A5 — closeout and handoff

Claude provides one compact candidate receipt: final SHA, base, test evidence, unresolved findings, changed scope and SDD-01 integration map. Codex returns `merge_ready` or named findings, not an owner approval.

If merge is authorized, Codex verifies whether it triggers auto-deployment, merges the exact reviewed candidate by the authorized method, records the actual merge SHA and reconciles any triggered deployment. If merge is not authorized, leave the PR ready with an exact request. Do not force-push or close/recreate #75 to erase review history.

M75 is complete as implementation work once the accepted foundation and handoff are recorded. It is **not** proof that SDD-01 or a production designer exists.
