# M75 → SDD-01 handoff: the reader/rendering foundation and its legacy HTML conversion

**Mission:** M75 (Sophia Native Design Mission Pack v0.1, 4 October 2026, `02_M75_CLOSEOUT.md` §A3). **Coordination:** [#31](https://github.com/davidelaverga/Sophia/issues/31), `M75-*` messages. **PR:** [#75](https://github.com/davidelaverga/Sophia/pull/75), branch `claude/smc-m03-report-v2`, base `main` `5dec922` since revision 4 (`2712f2c` at launch, PR #32 merged as `c15dd1c`). M75 started from head `86f70aa`. A commit cannot name its own SHA: the exact candidate that carries this file is named in the latest `M75-CC-*` review request on #31 (M75-CC-0005 for revision 5); [`docs/progress/M75.md`](../../progress/M75.md) lists every revision and its review.

**Status labels (pack 00):** `source_ready` and `locally_verified`: Codex verified both for revision 4 (`85c1ae1`, M75-CX-0011); revision 5 awaits its recheck. Not `release_prepared`, `authorized`, `deployed`, `app_verified` or `owner_accepted`. Nothing here is evidence of a native designer, a visual reviewer, a stored designed HTML deliverable or the design policy being delivered.

## 1. What M75 is, and what it is not

The owner's rule: **every newly requested non-Markdown deliverable follows design.** PR #75's HTML page does not satisfy it and does not claim to.

- **html-report-v2** (`@sophia/report/page`) is one fixed template applied *in the browser* to a version's checked Markdown. No designer, no rendered review, no stored HTML. It is kept as (a) the **seed and comparison control** for SDD-01's G6 comparison, in a test harness, and (b) **legacy compatibility** for the "HTML page" offers Studio already has (M03's r6 release, CX-0027, shipped those offers with html-report-v1; the source of today's Studio deployment is not independently attributed, M75-CX-0003). It is not a "basic HTML" product route, and none was added.
- **Studio's reader** (the Document tab and its reading voice, citations, sources, history, focus, version pinning) is the durable part of the foundation. SDD-01 extends it; it does not replace it.
- **Unchanged identities:** `pdf-report-v1` (`report-html.ts`, `report-css.ts`, `markdown.ts` are byte-identical to `main`; its pins pass), historical report and source IDs, research prompts, the guide's declarations and prompt, `config/specialists.json`, `config/runtime-unit.json`, migrations, contracts and the API. M75 is Studio and `packages/report` only.
- **html-report-v2 is not yet released.** Its bytes changed within this PR (the contents rail, the running head); the profile ID is unchanged because v2 has never been deployed. After a release, any byte change to the page is a new profile.

## 2. The printer and its helpers (exact signatures)

`packages/report` (exports: `.`, `./markdown`, `./language`, `./page`):

| Export | Signature | Notes |
|---|---|---|
| `renderReportPage` (`./page`) | `(input: ReportPageInput) => string` | Pure; same input → same bytes in any time zone. Linear time in input size. Never gated by the PDF checks. |
| `ReportPageInput` | `{ markdown; title; sources: readonly PageSource[]; citable: readonly string[]; sha256; versionNumber: number \| null; publishedAt?: string \| null; limitations?: readonly string[] }` | `citable` is the viewer's own numbering source (the version's sources this reader may read). |
| `PageSource` | `ReportSource & { kind?: 'search_results' \| 'web_read' \| 'input'; coverage?: 'complete' \| 'partial' \| 'unsupported' \| null; retrievedAt?: string \| null; limitations?: readonly string[] }` | Status: `full`, `part`, `snippet`, `unread` (coverage `unsupported`: a file the pilot reader does not open), `project`. |
| `PAGE_PROFILE` | `'html-report-v2'` | Printed in the generator meta and the colophon. |
| `PAGE_CSP` | `"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"` | The page's only http-equiv. |
| `PAGE_CSS` | `string` | The page's one sheet; an Italian or Spanish page appends one `@page` running-head rule after it (M75-RF-0003). |
| `reportLanguage` (`./language`, also `./page`) | `(markdown: string) => string` | `'en' \| 'it' \| 'es' \| 'und'`; `und` falls back to English words. Loads without the template. |

**Known-markup boundary.** `renderReportPage` only ever passes `printReport`'s own escaped output through its regex passes (`pagePass`, `roomed`, `pageIds`); escaped text cannot hold `<`. **Never feed authored HTML through these passes**; they are not a sanitizer and not a validator.

Studio (`apps/studio/src/features/artifacts/`):

| Helper | Signature | What it does |
|---|---|---|
| `downloadReportPage` (`report-page.ts:39`) | `(token, artifactId, versionId, deps?: PageDeps) => Promise<{ filename; byteLength }>` | Lists the artifact's versions, loads the version's Markdown by `sourceId` + `sourceHash`, lists the version's sources, rechecks the text's SHA-256 (`HashMismatch` saves nothing), lazy-loads the printer (`report-page.ts:31`), renders, saves `<slug>-v<N>.html`. Reads only routes the deployed API serves, with the reader's own rights. Stores nothing. |
| `PageDeps` (`report-page.ts:19`) | `{ listVersions; loadText; listSources; render; save }` | Test seam. |
| `usePageDownload` (`PageDownload.tsx:10`) | `(token, artifactId, versionId) => { status, download }` | Status line words: "Downloading <file> · <size>", or the error. |
| `PageDownload` (`PageDownload.tsx:29`) | `({ token, artifactId, versionId })` | "Download HTML page" text button with its status line. |

## 3. Every forward delivery path that reaches the conversion

These are what make today's product answer a request for HTML with a browser conversion. **SDD-01 replaces all of them in one coordinated cutover.** Until then, on `main` and in production, a newly requested HTML deliverable is *not* designed; M75 does not change that and does not claim to.

### 3a. Studio callers (pinned by a test)

`apps/studio/src/features/artifacts/report-page.test.ts` ("the legacy conversion's callers (M75)") scans Studio's source for every module that names the conversion's modules (`@sophia/report/page`, the package root `@sophia/report`, which re-exports it, `report-page`, `PageDownload`) in any import, re-export, dynamic or bare import, with or without an extension, and asserts exactly this map. A new caller fails the test until this section is updated in the same commit.

| # | Caller | Surface and user action | Today | SDD-01 replacement |
|---|---|---|---|---|
| C-1 | `DocumentPane.tsx:762` → `PageDownload` | Report viewer, Document tab: "Download HTML page" | Converts the version on screen | Offer the stored HTML rendition's download (same bytes as its view), or nothing when the version has none |
| C-2 | `KnowledgeReports.tsx:300` → `PageDownload` | Knowledge card: "Download HTML page" of the current version | Converts the current version | Same as C-1 for the card's current version |
| C-3 | `WorkCard.tsx:283` (`PageRow`) → `usePageDownload` | Work card: an "HTML" output row after every Markdown output, beside the delivered files | **Presents the conversion as one of the task's outputs** | Only the task's actual HTML output, with its design state (designing, reviewing, failed, ready); no row for a Markdown-only task |
| C-4 | `NoticeCard.tsx:47` (`PageButton`) → `downloadReportPage`; `chat-view.ts:99` `noticeActions().page` | Chat result card (text and voice members): "HTML page" | `page` is the Markdown output, so every research card offers it | `page` comes from the stored HTML output, never from the Markdown |
| — | `PageDownload.tsx:14`, `report-page.ts:31` | The seam itself | Calls the printer | Remove from the product path; keep `renderReportPage` for the G6 control harness and the explicit legacy decision |

### 3b. API receipt and guide declarations (frozen in M75; SDD-01's contract work)

| Where | What it says or does | Why it matters |
|---|---|---|
| `apps/api/src/research-tools.ts:95–107` (`ASKABLE`, `formatsOf`) | `outputs: ['html']` is accepted and **adds nothing**: it never reaches `specialistFor`, migration 0025's outputs check or the runtime manifest | An HTML request is admitted as a Markdown research task |
| `apps/api/src/research-tools.ts:43, 107, 167` (`HTML_NOTE`) | The receipt adds "When it is ready, its card also downloads it as an HTML page." | The spoken/typed promise points at C-4 |
| `apps/media-bridge/src/tools.ts:187` (`start_research.outputs` description, guide v1.2) | "every report also downloads as an HTML page from its card; add html when the speaker asks for HTML or a web page" | The guide is told HTML is satisfied by the card |
| `apps/media-bridge/src/tools.ts:231` (`render_research` description, guide v1.2) | "HTML needs no call: every published report already downloads as an HTML page from its card." | Same |
| `config/specialists.json` | Research roles output `markdown` and `pdf` only | No HTML-producing role exists |

The guide v1.2 declaration digest is a recorded identity (CX-0033: `57cdfdad…`); changing these words is a new guide version with its own review, not an M75 edit.

## 4. Reader and viewer surfaces SDD-01 extends (not bypasses)

- **The Document tab's views** (`DocumentPane.tsx:451`, `TabContent`, with an M75 comment at the seam): one view per format, the PDF rendition (`PdfTab`) or the Markdown in the reading voice (`DocumentTab` → `MarkdownView`). A designed HTML version is a third view: its **stored bytes in an isolated frame** (no Studio DOM, credentials or scripts; never `MarkdownView`). The format toggle (`FormatSwitch`, `DocumentPane.tsx:703`) and the address's `format` parameter (`report-link.ts:10`, `ViewerFormat = 'markdown' | 'pdf'`) gain `'html'`.
- **Renditions**: `DocumentPane.tsx:128` takes `version.renditions[0]` because the PDF is the one rendition format (contract A11: `ArtifactRendition.format: 'pdf'`). `ArtifactVersion.format` already admits `'html'`. A stored HTML deliverable needs SDD-01's own contract amendment (G0 binding), not an M75 change.
- **Exact bytes**: `download.ts` (`checkedBlob:24`, `loadReportBytes:91`, `loadReportText:113`, `HashMismatch:8`) shows and saves nothing that does not match its record. Open/Download parity (B-23) should reuse it: the frame shows checked bytes, Download saves the same bytes, and repeating a download calls no model.
- **Version pinning, focus and media**: a report being read is never swapped for a newer version; Esc steps down; focus returns to the opener; side and full sizes; Sources (with weak-source marks) and History (facts first). `e2e/report.spec.ts` and `report-reading.spec.ts` guard these.
- **Reader CSS** is rooted at `.md` and `.md-table`, used only by `MarkdownView`; designed HTML must not borrow them.
- **Citations in the reader** (`cite-view.ts`): bound to the word before them (a link or code span whole), grouped with commas, weak sources dotted and named in EN/IT/ES (the reader's words are tested against the page's in `cite-view.test.ts`). Inside a bound piece all but the word's last character wraps (`BoundWord`, `.cite-wrap`; M75-RF-0005): a word joiner did not hold a citation to its word in Chromium. `lastGrapheme` makes its `Intl.Segmenter` on first use and falls back to code points: Firefox before 125 has none, and the build targets it. On a touch screen each citation's target is its own (M75-RF-0001, RF-0004): `flushSides` marks the sides that stop at their numerals beside a link, with no word, or fewer than three characters from another group, reading past the end of bold or emphasis (`data-flush-start`, `data-flush-end`), and they reach into words elsewhere.
- **What cards say**: Open and Download mean the primary file (the PDF when there is one); Markdown is offered beside a PDF. No Studio or page word says HTML was designed or reviewed; the page itself says "Not independently reviewed." Keep that honesty when the designed path arrives: "designing", "reviewing", "failed" and "ready" are distinct states.

## 5. Reusable checks, probes and fixtures

### Browser checks (`apps/studio/e2e/report-page.spec.ts`)

| Group | Checks | Reuse in SDD-01 |
|---|---|---|
| **Any report page** | C4 nothing past the screen or column, no table frame scrolling past its table; C5 no word of ≤ 14 characters broken in a table cell; C6 text at 4.5:1 (3:1 large); C15 every citation a 24 px target of its own, no link's press taken, citation lines > 24 px apart; C16 every sideways-scrolling frame focusable and named; C9 every table whole in print, every cell in the PDF | Apply to designed HTML, measured on its saved bytes, with its own `Marks` |
| **html-report-v2 seed profile** | C1 measure (60–80 characters; ≥ 35 on a phone); C2 body 17/18 px, leading 1.5–1.7; C3 heading ratio ≥ 1.2, ≤ 5 sizes, ≥ 14 px; C7 answer before contents and body, inside the first phone screen; C14 sticky contents rail; C9 body at 10.5 pt in print, print always light; C17 running head in the report's language | The control's own choices. **Do not require them of a designed page** |

Probes (`apps/studio/e2e/report-probes.ts`): the general probes are `overflow`, `brokenWords`, `worstContrast`, `citationTargets`, `linkPresses`, `keyboardFrames`, `printedTables` and `pdfText`. Those that need a page's parts (`overflow`, `worstContrast`, `citationTargets`, `linkPresses`, `printedTables`) take a `Marks` object (`citation`, `citationGroup`, `tableFrame`, `ornaments`; `SEED_MARKS` is html-report-v2's); the others need none. A citation may be any element (a press counts when it reaches the citation's own element); a link is an `a[href]`. A designed page passes its own marks, which SDD-01's content map should make stable (for example a data attribute on citations). The seed probes (`medianLine`, `typeScale`, `rail`, `answerFirst`, `printInk`) use the template's selectors.

C16 is deliberately stricter than axe's `scrollable-region-focusable` (which also accepts a region containing focusable content): a frame that scrolls sideways must itself take the focus, have a role (its own or its tag's) and a name (`aria-label`, or `aria-labelledby` naming elements that exist and say something).

### Byte audit (`packages/report/src/report-page.test.ts`)

`audit()` = general rules (`loadIssues`, `policyIssues`, `markupIssues`, `linkIssues`: nothing runs or loads, `default-src 'none'` with no `script-src` or refresh, safe hrefs, no handlers or active elements, no attribute broken open, no entity split, ids once, links that land) + seed rules (`seedIssues`: one sheet, seven metas, the exact policy, only the printer's tags and attributes). **Its patterns are valid only on the printer's own markup.** SDD-01 states the same general rules for authored HTML and checks them with an HTML/CSS parser (pack 05 §5), not these regexes.

### Fixtures

| Fixture | Content | G6 role |
|---|---|---|
| `fixtures/report-pages.ts` `kitchen` | Dense English comparison, every element, a six- and a four-column table, every source kind | Input (1): dense EN with a wide table and citations |
| `report-pages.ts` `italiano` (M75) | Italian, long headings and addresses, citations in a table, a source read in part, a snippet, its own "Rischi e limiti" | Input (2): IT with long headings/URLs and limitations |
| `report-pages.ts` `espanol` (M75) | Spanish narrative, uneven sections, one with no evidence, an unread PDF source, a project document, no limitations of its own (stored ones stand in) | Input (3): narrative with missing/partial evidence |
| `report-pages.ts` `stress` | 220-character title, 12-column 40-row table, 50 adjacent citations, citations in headings and table edges, 300-character code line, CJK and Arabic, an 80-letter one-word heading | Adversarial layout |
| `report-page.test.ts` `HOSTILE`, `RICH` | Script/markup injection in every field, every source standing | Escaping and provenance mutants |
| `fixtures/reading-data.ts` | The reader's long report (EN, short IT version), groups, citations a word apart and beside links | Reader regressions |

**Counterexamples kept.** The page spec run against `main`'s html-report-v1 printer fails 15 of 21 checks (the SHA of the latest run is in `docs/progress/M75.md`): C1, C3, C5, C6 and C7 (the PR's original defects) and C2, C9 (tables whole in print), C14, C15, C16 and C17. Keep comparison fixtures that fail on the old template; any fixture change shows its behaviour change and its old counterexample.

**Stored limitations: what the page proves, and what it does not.** The page prints each of the version's stored limitations that the report's own text does not already contain (`unsaid` in `report-page.ts`: compared as a reader compares text, without closing punctuation), whatever the report's headings; since revision 5 a heading never decides what is printed, so neither "Limits of liability" (a subject) can drop one nor a real limitations section get them twice when it repeats them. A stored limitation the report paraphrases is printed again under "As stated when this version was published". The heading heuristic (`LIMITS`, `JOINED`) now only sets a section's amber rule and the method's "states no limitations" note. Text containment is no proof that a paraphrased limitation was kept either: SDD-01's content-fidelity checks (B-06) need their own content map, not this.

## 6. Findings and their state at the candidate

| ID | Severity | State | Evidence |
|---|---|---|---|
| M03-RF-0025 | P2 | Closed (CX-0034; reconfirmed in M75-CX-0003) | `pdf-report-v1` ids and bytes unchanged for headings named like the page's parts |
| M03-RF-0026 | P3 | Closed for the exported page (M75-CX-0003 at `86f70aa`) | C15 with CX-0034's countercases |
| Codex bot P2, image label escaped twice | — | Does not reproduce (M75-CX-0003) | |
| M75-RF-0001 | P3 | Fixed in `d5d047e`, `8850ebd`; original case verified by Codex (M75-CX-0006); its class continues as RF-0004 | Reader touch targets exclusive; new `report-reading.spec.ts` check with four mutants |
| M75-RF-0002 | P2 | Closed (verified by Codex, M75-CX-0006) | §1–§7 |
| M75-RF-0003 | P3 | Closed (verified by Codex, M75-CX-0006) | U13, C17 |
| M75 self-found (contents rail) | P3 | Fixed in `f666a2f`; verified by Codex (M75-CX-0006) | The Italian rail clipped 22 px of its last entry at 1280; C16 on `italiano`/`stress` |
| M75-RF-0004 | P3 | Fixed in `93eb26c`, `4906bc8`; verified closed (M75-CX-0009) | `Pair i[A]i[B].`: two groups a letter apart overlapped 3.3 px at 390; `flushSides` counts characters between targets |
| M75-RF-0005 | P2 | Fixed in `93eb26c`; verified closed (M75-CX-0009) | A 24-character link label of wide letters ran 35 px past a phone's column once bound whole; the bound piece now wraps all but its last character |
| Cloud review (PR #75, `8850ebd`) | three P2s | Fixed in `93eb26c`; verified closed (M75-CX-0009) | Emoji/wide runs bound unwrapped (same fix as RF-0005); the page kept a tab or wide space before a citation where the reader trims it; the dotted-number key left out unread sources (EN/IT/ES) |
| M75-RF-0006 | P2 | Fixed in `124f5ba`, `e863719`; verified closed (M75-CX-0011) | The reading check "a long group wraps after a comma" measured its narrowest column from the bound piece's first box, which BoundWord's wrapping can put on the line above (CI went to 0 and negative widths). It now measures the inseparable unit (the word's last character and the first three numbers) on its line, sweeps from the column as it is and from a column where the word wraps, and also asserts the unit never parts |
| Cloud review (PR #75, `4906bc8`) | P2 | Fixed in `124f5ba`, `e863719`; verified closed (M75-CX-0011) | The page's role patterns missed Italian and Spanish headings that open with an article ("I limiti", "La risposta", "Los límites", "La respuesta", "I rischi e i limiti"): limitations lost their amber section and could be printed twice; an answer missed answer-first. An article reads only with the bare word ("I limiti di velocità", rate limits, stays body so the stored limitations still print) |
| Cloud review (PR #75, `85c1ae1`) | P2 | Fixed in revision 5; awaiting recheck | A heading that only opens with "Limits" ("Limits of liability", "Limiti di velocità", "Límites de tasa") read as limitations and the page dropped the version's stored ones. Fixed as a class (the pre-push review showed every heading rule fails one way: drop or duplicate): the page prints the stored limitations its text does not already say, whatever the headings; the headings set only the amber rule and the method's note |
| Cloud review (PR #75, `85c1ae1`) | P2 | Fixed in revision 5 | These records named an earlier candidate (CC-0002, base `2712f2c`) and a review request not yet copied here; refreshed, with CC-0004 copied |
| Cloud review (PR #75, `85c1ae1`) | P2 | Open; non-blocking (M75-CX-0011) | Table citations have no enlarged touch target (an `::after` would widen the frame). Codex measured 8.6 × 10.8 px with no competing targets, and real taps open the right source; an enlarged target that does not widen the frame is a possible follow-up |
| M75 observation: gate wording beside unread sources | P3 question | Open, not changed | "All N cited sources are ones this task retrieved or was given" sits under "K of N … could not be read"; accurate for a captured record, possibly confusing. Owner/SDD-01 wording decision; changing it moves page bytes |
| M75 observation: forward HTML path | Policy gap | Open, SDD-01's | §3: an HTML request is admitted as Markdown and fulfilled by conversion |
| `main`'s opening timing check (`opening.spec.ts:86`) | Flake | Not #75's | Reported on #32 with root cause |

## 7. Release scope and sequencing

- **Default: no #75-only production release.** The coordinated release ships after SDD-01 qualifies, when its server-side capability and stored HTML replace §3's paths together (pack 08 R3 step 6).
- **Merging is an owner decision, separate from releasing.** Codex observed on 4 October (M75-CX-0003): Render services' auto-deploy is off, and the Vercel Studio project has no Git connection (uploaded deployments); `ci.yml` has no deployment job. Merging #75 therefore triggers no deployment by itself; Codex refreshes that state before any effect.
- **Merge sequencing hazard.** Once #75 is on `main`, the next Studio deployment built from `main` ships html-report-v2 and the reader changes, including M03's pending Studio rollout (CX-0033). Either pin such a deployment to a pre-#75 commit, or let it carry #75 under an explicit owner decision recorded as a reader-only change. Neither is design.
- **A reader-only release** (improved reading of existing Markdown/PDF reports and the existing legacy export) needs its own exact owner approval and must not advertise design, review, stored HTML or the design policy.
- **Required reviews:** Codex's recheck of the exact candidate; Luis's integration review (AGENTS.md: Luis owns merge/integration review). Neither is product acceptance.
- **No hosted change** is needed for M75: no migration, configuration, credential, runtime or guide change.

## 8. What SDD-01 takes from here

1. Start from M75's final head (or `main` after #75 merges); preserve `pdf-report-v1`, `html-report-v2` and every historical identity; give designed HTML its own new profile ID.
2. Bind format-driven admission at G0 (pack 03): `html` requested → design after research; replace §3b's receipt and guide words in a new guide version; replace §3a's callers with the stored rendition; shrink the caller test to what remains (the G6 harness, and any legacy use the owner keeps).
3. Show designed HTML only in an isolated frame from checked bytes (§4); keep reader CSS out of it.
4. Reuse §5's general checks with the designed page's marks; validate authored HTML with a parser; never apply the seed profile's thresholds as design requirements.
5. Use `kitchen`, `italiano` and `espanol` as G6's three fixed inputs, with `stress`, `HOSTILE` and `RICH` as mutants; run html-report-v2 over them as the control in the harness only.
