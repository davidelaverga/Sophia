# Validation and evidence boundaries

**3 October 2026.** This packet specifies work; it does not implement or deploy that work.

## What was checked in preparing the packet

- The current repository/PR sources and selected pinned Paperclip interfaces listed in [the source register](sources/REGISTER.md).
- Internal Markdown file links, HTML anchors, both JSON Schema definitions and the labeled positive/negative examples: 28 Markdown links, 12 HTML anchors, two schemas, four valid cases and six expected rejections passed.
- The standalone HTML's desktop/phone reading layout, navigation, copy/select fallback and no-script reading. The exact browser-check results are retained in `checks/html-browser-validation.json` (in-memory document rendering, not live application testing).

`checks/packet-validation.json` contains the document/schema check counts. `checks/application-cases.json` lists all 41 implementation acceptance cases with status **not_run**. Those cases are not inferred successful from schema validation or a rendered document.

## Not exercised here

No Sophia application test suite, Paperclip boot, dsh execution, provider call, owner-native account, database migration, hosted deployment or production URL was tested or changed. No GitHub write, PR comment, merge or approval was made.

The screenshot in the HTML is one still from Luis's supplied fixture recording. It is not the new design running against real services. Browser checks exercise this explanatory document only.

## Delivery and reproducibility

The HTML embeds its image and styles and needs no external assets, fonts, server or network to contain its content. Source links require online access only when followed. JavaScript is optional; navigation, reading and the manually selectable launch prompt remain available without it.

The automated document browser test loaded the HTML into an in-memory Chromium page because this environment blocked both file and local HTTP navigation. Desktop 1440×1000 and phone 390×844 layouts, anchor navigation, copy/select and no-script reading passed without remote requests or document overflow. This verifies rendering and local interactions, not an iOS attachment previewer's permissions or every file-opening application. Extract the ZIP for Markdown links; use the standalone HTML for Luis's reading.

The JSON Schema checks are **not** authorization, graph integrity, source-eligibility, native-settlement or concurrency tests. The missions require those separately. Exact request casing and OpenAPI registration are finalized through the repository's reviewed contract-amendment process, not by treating these specimens as already deployed endpoints.

## Evidence levels for implementation handoffs

Keep these separate: **fixture-ready → source-ready → local integration passed → provider-qualified → hosted-verified → product-accepted**. Report an unavailable gate precisely. Never promote a fixture or a model's final message into evidence of real operation.

## Re-run the packet check

With `beautifulsoup4`, `jsonschema` and `markdown-it-py` installed, run `python checks/validate_packet.py` from the extracted packet. It performs no network or provider call. Generated report files are rewritten with the same deterministic values for the same packet. Verify the initial delivered bytes with `sha256sum -c FILE_HASHES.sha256` before making edits.
