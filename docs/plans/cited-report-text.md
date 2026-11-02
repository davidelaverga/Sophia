# Reports: read the project text a report cites

FND-HTML-SOURCE-REMAINDER-03. Migration `0090_cited_report_text` (P's allocation), amendment A11 (no new contract id).

## The gap

A report's Sources say that a version cites one of the project's own inputs ("A source from the project", "From the project"), never what it says. `getSourceContent` serves a report's own source or rendition only (`readReportSource`), by design, and A19's origins are a proposal behind the vision flag. A member repairing a report's provenance (the retained HTML brief's adverse source review) could not read the supporting note it cites. This was the written behavior, not a regression: this change deliberately adds one bounded read.

## What changes

- **`sophia.cited_report_text(artifact, version, source)`** (0090): one row (identity, hash, type, size, text) when all of these hold at the read, otherwise none:
  - the caller is an active member of the version's project (checked in the function);
  - the version is that artifact's and published (stable or superseded), never a candidate, validated or rejected one;
  - the caller may still read the report itself, exactly as `getSourceContent` reads the version's own source: it is ready, and theirs or a released project source (CITED-TEXT-R1). A report whose own text was blocked, deleted, made private or unreleased reads no cited text through it, except for that text's owner. Another of the report's sources being withdrawn does not close it (0033 keeps published history);
  - the version records the source as one it cites (`source_dependencies` from its own source: the rows `listReportSources` shows);
  - the source is a project input (no provenance, or `admitted_input`), never a web page or a search result;
  - it is a released, ready project source: another member's private source and the caller's own private one alike read nothing;
  - nothing it draws on was withdrawn (`source_withdrawn`, research's own rule);
  - it is plain text or Markdown kept inline, at most 256 KiB, and the text held is exactly the bytes its record counts.

  It is `STABLE`, `SECURITY DEFINER` with a pinned `search_path`, and only the API login may call it. It is a definer function because the withdrawal rule reads what the API login may not. `source_withdrawn`, `source_closure` and `review_source_readable` stay closed to every login.
- **`GET /api/v1/artifacts/{artifactId}/versions/{versionId}/sources/{sourceId}/content`** (`getCitedReportText`, A11): a `SourceContent` with the text inline (`downloadUrl` and `expiresAt` null, `disposition` inline, the file name `source-<id prefix>.txt|md`), `cache-control: no-store`.
  - Every refusal is one `not_found` (422) that names nothing.
  - Text whose hash or size does not match its record is refused (409), never sent.
  - `/ready` requires the function and this login's EXECUTE on it.
- **Studio**: a project input's row in the Sources tab offers **Show text**. The text opens in place as plain text and closes with **Hide text** (`CitedText`, `cited-text.ts`).

## States (written first)

| State | Screen | Keyboard and screen reader |
|---|---|---|
| idle | Nothing read. «Show text» under the row, project inputs only (web pages and search results keep their link). | A button, `aria-expanded=false`. |
| loading | «Reading the source…» in a live region. After 6 s, the shared slow line. | The status is announced. Focus stays on the press, now «Hide text». |
| open | The text in a bordered `<pre>`, in the body's mono at the small size. It wraps and never widens the pane. It scrolls inside 40vh. | `aria-expanded=true`, `aria-controls` names the region «Text of citation N» (or «…a source not cited in the text»). The `<pre>` takes the focus, so a long text scrolls by key. |
| closed | Back to idle. The read on its way is cancelled, and its result is dropped from the cache. | Focus stays on the press. |
| refused | «This source can’t be read here.»: one answer for 401, 403, 409 and 422. No retry. The report itself is not fenced: a source's refusal is not the report's. | Announced as a status. |
| mismatch | «The text didn’t match its record, so it isn’t shown.» Nothing of the text is shown. | Announced as a status. |
| failed | «The text couldn’t be read.» with «Try again». It is retried twice on its own first. | The button is reachable. |
| slow | As loading, plus the slow line. Every read has the client's 30 s limit. | |
| pressed twice / closed while reading | The read stops. A late answer shows nothing. Opening again reads again. | |
| unmount (another tab, report closed) | The read is dropped. Coming back finds it closed. | |
| reload | Closed. Nothing read until asked. | |
| account change | Open only in the account cache it was opened in. Another account (a new cache, even at the same address) finds it closed. Nothing is read as them until they ask. | |
| report withheld (own refusal of the report) | The press and the text go with the report. | |

Platforms: React text only, with no newer DOM API. `<pre>` with `white-space: pre-wrap` and `overflow-wrap: anywhere` is Safari 16.4 safe.

## What does not change

- `getSourceContent` and `readReportSource` still serve a report's own source or rendition only. A cited input asked by its id alone is still not found there.
- No research goal, prompt, native bundle, renderer, width limit, design citation fidelity, old goal, criterion, content or verdict changes. The neutral research outcome and the conditional downstream-HTML prompt are the next separate slice.
- No A19 origin navigation, general source browser, download or export, VISION change, or new principal.

## Known limits

- The text is shown as stored. Sophia does not judge whether it supports the report's claims; the source review does.
- The read requires the same 0090 on the database the API runs against. An API from this change on a database without it is not ready.
- The account-change browser check runs in the App fixture, where the report viewer also re-renders on the new account. The open-per-cache guard is held there and by the code, not by a separate browser state where the row stays mounted.

## Checks

- `apps/api/src/cited-report-text.db.test.ts`: real PostgreSQL through the API login and HTTP. It covers:
  - exact text, hash and UTF-8 size for an editor, a viewer and an admin;
  - an admitted input, a Markdown input and a superseded version, and the Sources list agreeing;
  - refusing no token, an outsider and another project's admin;
  - refusing unrelated sources, another artifact, another version and an unknown id;
  - refusing candidate, validated and rejected versions;
  - refusing private sources (the reader's own included), unreleased, blocked and deleted sources;
  - refusing web and search sources, stored bytes, JSON and HTML, and records past 256 KiB, while exactly 256 KiB reads;
  - size and hash mismatches;
  - a member removed after the list, a source withdrawn after the list, and a source whose own source was withdrawn;
  - the report's own source blocked or deleted, or private or unreleased to another member. The cited text is refused there, as `getSourceContent` refuses the report, while the same text stays readable through another report. The owner of a private report text still reads both. A report with another citation withdrawn still reads;
  - the function's ACL, and the other functions staying closed;
  - `getSourceContent` unchanged;
  - `/ready` without EXECUTE.
- `apps/studio/src/features/artifacts/cited-text.test.ts`: the checks before showing, the failure words, retry and the key.
- `apps/studio/e2e/cited-text.spec.ts` (fixture page):
  - plain text that runs and loads nothing, and a second opening reading again;
  - keyboard and focus;
  - reload;
  - refused, without fencing the report;
  - a mismatch shown as nothing;
  - slow, plus closing while reading;
  - unmounting while reading;
  - the phone width.
- `apps/studio/e2e/app-auth.spec.ts`: another account coming in finds it closed and has read nothing as them.
- `apps/studio/e2e/knowledge-origins.spec.ts`: its presses are found as the origin's press (`button.source-origin`), not as any button in the row. A project source's row now also offers «Show text», and the checks keep their meaning: a file's origin is words, not a press.
