# LFE-02 — Adopt research delivery and finish the artifact-reading experience

**Track:** Now · **Primary implementation owner:** Luis · **Product:** Davide · **Operator:** Codex only for an approved batch.  
**Status:** new work-package instructions; current source is described below, not reset to “not started.”  
**Launch:** [Luis’s coding session](../launch/LFE-02_LUIS.md).

## User result and current source

PR32 already creates DocumentPane, DocumentViewer, MarkdownView, WorkCard, SourcesList, ReportHistory, SummaryEditor and KnowledgeReports. Its PDF publication/viewer and final voice/text release pieces were still in progress at inspection.

**Required sources:** R07; R08; R09; P05; resolve in [source register](../sources/REGISTER.md). Read the actual latest branch before writing. Historical proposed destinations do not establish that a module exists.

## Dependencies and ownership

**Preparation:** LFE-00. UI fixtures can begin with versioned contract examples and honest simulation labels.

**Live feature prerequisites:** No other LFE feature prerequisite; use the backend capabilities below. Relevant service/data capabilities: **SMC-M03, B-ARTIFACTS**, bound in [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md). Real integration, authority and source checks remain required; a mocked service never closes live acceptance.

Luis owns frontend code, interaction logic, client bindings, relevant unit/browser tests and integration review. He may implement an assigned linked API/data slice; this is not a frontend-only prohibition. One writer owns shared contracts/migrations per merge window. Davide owns runtime/authority/provider decisions. Existing PR authors retain their scope until a deliberate handoff. A coding agent’s name does not replace the human owner.

## Existing and proposed code destinations

- `apps/studio/src/features/artifacts/DocumentPane.tsx [PR32]`
- `apps/studio/src/features/artifacts/DocumentViewer.tsx [PR32]`
- `apps/studio/src/features/artifacts/KnowledgeReports.tsx [PR32]`
- `apps/studio/src/features/artifacts/report-link.ts [PR32]`
- `apps/studio/src/features/artifacts/WorkCard.tsx [PR32]`
- `apps/studio/src/features/artifacts/PdfView.tsx [planned in PR32; verify landing]`

## Goal sessions

### LFE-02.1 — Adopt the in-flight implementation

Review PR32’s latest exact diff and its author’s remaining slices. Keep its safe Markdown, byte/hash check, source provenance and version facts. Agree where Luis can add UI tests now and when component ownership transfers; no second Knowledge or report-store implementation.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-02.2 — Unify reader placement

Use one document identity and one mounted viewer for card → side → full → back. Respect Chat/Brief panel arbitration and report deep links; do not reset scroll or selected version on every progress event. Persisted report description/version notes remain source-backed, not model claims masquerading as diff checks.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-02.3 — Complete requested-format states with the owner

Connect PDF view/download/retry only once PR32’s rendition/publication route is real. Markdown-ready/PDF-failed is a useful partial result, not a completed PDF request. Preserve the last readable version on failed retry; no arbitrary HTML execution in a report.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-02.4 — Verify the real read flow

Inspect keyboard, screen reader announcements, phone overlay, hash mismatch, revoked source, historical version and exact download. Retain separate provider/hosted acceptance with Codex; local seeded reports do not prove live generation.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

## Retained HTML/deck output continuation

After PR32’s report slice, S1-13 still owns any missing HTML/deck/PPTX producer. Luis extends the existing artifact-reader family with slide navigation, retained source and notes, exact selected-version export and a visible distinction between editable HTML source and image-based PPTX. This does not claim that PR32 has already implemented decks or that imported binary objects are surgically editable. Output generation and renderer qualification remain Davide’s backend work; the gallery/viewer/download behavior is Luis’s.

## API and state contract

Use [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md) and [the interaction contract](../architecture/03_STUDIO_AND_MEDIA.md). Studio uses Sophia’s authenticated API and validated current DTOs; it does not connect to provider/Paperclip/Omnigent administration. Proposed DTO/operation names are binding targets until the assigned backend exposes them. Do not invent a live endpoint from a filename or bypass a missing operation with direct database writes.

Keep server decisions and receipts separate from local view, unsent drafts, media state and viewer attention. Preserve exact work/source/request identities on mutations. Unknown outcome remains unknown and is reconciled with the same operation key. Opening a view, reading a card or holding the microphone grants no work/account authority.

## Acceptance cases

| ID | Scenario | Required observation |
|---|---|---|
| ART-01 | Open version 2, expand and download | Displayed and saved bytes match that version; full/side transition does not remount/reset it. |
| ART-02 | Receive new version while reading old one | Offer the new version without switching the current inspection or marking it accepted. |
| ART-03 | PDF fails after Markdown succeeds | Show usable Markdown, explicit PDF state and only the supported retry; preserve prior PDF if any. |
| ART-04 | Untrusted HTML or revoked citation in a report | Treat markup as data and deny revoked source reads; no silent external image load. |

All cases in this new track start **not run**. Attach fixture, source-integration, live-native and hosted evidence separately. Every behavioral fix needs a regression that fails without it. Check the actual Studio on desktop and phone; no requirement is satisfied solely by TypeScript compilation.

## Checks, release and stop condition

Follow actual repository checks: `pnpm toolchain:check`, frozen-lock install, affected unit tests, `pnpm lint`, `pnpm format:check`, typecheck/contracts checks and `pnpm --filter @sophia/studio run build`. Run affected DB/native tests through their existing harness when those boundaries change. Do not weaken Linux/Mac runtime identity tests to hide a known Windows-only incompatibility; record platform and reproduce only applicable baselines.

No hosted write, new paid route, deploy or schema mutation is authorized by this file. Prepare the exact Codex operation request in [ownership and handoff](../04_SEQUENCE_AND_OWNERSHIP.md). Preserve existing privacy and versioned guide assets. Stop the implementation session at one useful tested slice or a precise dependency; do not wait indefinitely for another agent.

**Excluded:** No new renderer or storage system. Deck/PPTX is a retained S1-13 output family, not delivered by PR32’s research PDF work.

**First action:** Ask the SMC-M03 implementer for the current remaining UI slice; add review/tests on an agreed branch, not a competing report feature.

**Product completion:** the specified real user result is exercised on the intended route, with the cases above and the underlying retained goal’s criteria. Fixture-ready, source-ready, merged, hosted-verified and product-accepted remain different statuses. A frontend work package shares evidence with its parent SCM/S1/S2 goal; it does not create a second operational task controller or demand duplicate acceptance ceremonies.


## Updated current source

PR32 now includes @sophia/report, the service PDF template and 0031/S5b part 1. The remaining PDF UI/retry and final voice/text/live acceptance stay with that author until handoff. Consume its current parser and byte readers; do not create parallel implementations.
