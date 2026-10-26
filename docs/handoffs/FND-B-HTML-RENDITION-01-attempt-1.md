# Implementation-session handoff

Goal and attempt: FND-B-HTML-RENDITION-01, attempt 1. From Review sources, a member can choose a report's published HTML
page, and the source it cites, as the exact sources a review reads.

Human owner / executor resource: Davide; Claude Code lane B, runtime `60d65501-d779-4a4c-80e8-89485d10c86e`, packet
`d50004e9…`.

Starting worktree/commit: main `db56fe0e` (PR #482 merged), branch `fix/source-review-html-renditions-20261026`.

Inputs: R2's actual picker blocker (result `ba4914cd…`, proof `a96c6642…`).

## The failure

- A design publishes its page as the report's next version (0040 `design_publish`).
  - That version keeps the previous version's Markdown source.
  - It carries the compiled HTML as an `html` rendition, a text source of its own (0039).
- 0082's offer named each version's own source only. So:
  - the HTML page could never be chosen;
  - versions 1 and 2 were two rows of one Markdown source, which the picker (keyed by source id) could only check
    together.
- In production, both versions showed Markdown `66cdc206…` and the published page `e8b96a14…` was not offered. The
  review was stopped before any proposal.
- Nothing downstream was wrong:
  - the proposal (`source_review_request`) admits any readable source by its id;
  - the frozen manifest records that source's hash, mime and bytes;
  - the native reader (`runtime_source_review_context`) reads any manifest source, whatever its mime.

## The change

**0083** replaces `source_review_availability` (same signature, owner and grants).

- **What it offers:** the sources the offerable report versions carry (stable, superseded or validated, as before):
  each version's own text, and the HTML page a design published for it.
- **Each source once:**
  - named after the report and every version that carries it ("Title · versions 1, 2");
  - a page ends "· HTML page", and keeps that ending however long the title;
  - newest first, a page before the text it renders when they are as new, then by source id;
  - at most 50.
- **Readability rules, unchanged:** released, eligible and ready, with text, at most 32 KiB, and nothing withdrawn in
  its closure (`review_source_readable`). The page's closure reaches its version's Markdown and that text's citations,
  through its design files and the frozen content package. So a page whose report draws on anything withdrawn is not
  offered either.
- **Supporting:** for the versions an offered source represents, the sources they cite as recorded. A page's cited
  sources are therefore its version's, never its design inputs. 0082's predicates, labels and dedup are unchanged.
- **Unchanged:**
  - the proposal, its guards, the frozen manifest and the native reader;
  - the contract: no amendment, the wire shape is the same, and only labels differ;
  - Studio product code;
  - 0001–0082 and the immutable version history (Markdown ids are not replaced).

Census before allocating 0083 (journal `B-HTML-RENDITION-01-logs/01-census.txt`):

- main holds 0001–0082 and A44;
- the applied production ledger is exactly 82;
- no branch or open PR holds 0083+ or A45+.

## Evidence (journal `B-HTML-RENDITION-01-logs`)

**Old candidate fails, corrected passes, on the same final test bytes and real PostgreSQL** (old: log 10; new: log 11).

`design.db.test.ts`, through the real publication path (research v1, design, `design_publish` v2):

- The old offer returned "version 2" and "version 1" as two rows of the same Markdown source, and no page.
- Now the offer, read with the Studio's strict parser, is:
  - the page under its own source (`text/html`), with the recorded citation beside it;
  - the text both versions keep, offered once.
- The page and its citation, chosen, freeze exactly those two sources (id, hash, mime, bytes) in the plan's manifest,
  never the Markdown. Nothing is started.
- A lost reply's resend with the same key is answered as recorded; another body under that key is refused (409).
- The cited source withdrawn: neither text nor page is offered, and the page is refused (403).

`coordination.db.test.ts`, synthetic rows of the same shape:

- Never offered: a private page, an unreleased one, one not ready, one withdrawn, one over 32 KiB, one drawing on a
  withdrawn source, a candidate version's page, and another project's page.
- A long title keeps the page's ending.
- Proposal caps:
  - page, text and citation together: 201;
  - the page beside 20 KiB more: 422;
  - a private page: 403.

**Studio** (Vite fixture page, `work.spec.ts`, lever `rendition=1`, the corrected shape):

- The page and the text both versions keep are two independent choices.
- The page's note is unchecked until chosen. The page and the note are sent by their own ids; after a lost reply, the
  same key and body again.
- A note both cite is one choice, counted once.
- At most three sources and 32 KiB.

The full checks are listed in the journal handback.

## Deployment

- Apply 0083 (after a fresh ledger and hash check). The deployed API and Studio need no change: the wire shape is the
  same.
- The new offer is read by the Studio already deployed. Labels and rows change; nothing is selected by default.

## Limits

- No production SQL, data, note contents or browser session was used. The fixtures are synthetic, of the publication's
  shape.
- The Studio witnesses run on the Vite fixture page, not on built bytes or production.
- No review was started and no model was called. Whether the production page and its cited note are eligible now is
  established only by applying 0083 and reading the offer.
- Two different reports with the same title and version still read alike. They are distinct sources and distinct
  choices.
