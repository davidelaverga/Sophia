# Implementation-session handoff

Goal and attempt: B-HTML-CITATION-FIX-01, attempt 1 (after B-HTML-CITATION-LOCAL-TRIAGE-01), with its R2 repair
(B-HTML-CITATION-FIX-REPAIR-01) and focused corrections (B-HTML-CITATION-FOCUSED-02)  
Human owner / executor resource: Davide (owner); B, the existing Claude Code session; P coordinates, R2 reviews independently  
Native session: `local_cf492b49-c8d1-4ab7-b811-95eaefc2b61c`; no native, provider or model call was made  
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-11-07/sophia-html-citation`, local branch
`fix/html-inline-citation-20261107` from main `9d6902d6b07f42cb4ef725a2524814f386680759` (tree `258f6807`)  
Ending commit/tree and changed files: the local candidate commits on that branch (their ids are in the handback
records, since a commit cannot name itself); `apps/studio/src/features/artifacts/HtmlView.tsx`, `DocumentPane.tsx`,
`artifacts.css`, `in-page-links.ts` (new), `in-page-links.test.ts` (new), `DocumentViewer.tsx`, `own-history.ts` (new),
`own-history.test.ts` (new), `apps/studio/e2e/report-html-citation.spec.ts`
(new), `apps/studio/fixtures/cited-page.ts` (new), `apps/studio/fixtures/report-data.ts`, `apps/studio/fixtures/room.tsx`,
this file.

## Outcome

On 7 November one inline [1] in a designed HTML report (the retained page, 6725 bytes, SHA-256 `c824d3a7…`) was
clicked in production by a browser tool whose click timed out; whether it was delivered is unknown, and nothing here
claims a hosted failure.

Locally the click fails every time. HtmlView frames the checked page through `srcdoc` in a frame sandboxed with no
permission. A srcdoc document takes its parent's address as its base, so the citation's `href="#source-1"` reads as
Studio's own page with that fragment. A completed click (32 and 44 ms) navigated the frame to Studio's page, which
cannot run there: the frame was left blank, its six citations and source entry gone, while the pane and the outer
address stayed. The design checker (packages/design/src/citations.ts) requires every citation link to be such a
fragment, so every cited designed page has them. The page's own CSP refuses a `<base>` (`base-uri 'none'`), and the
stored bytes stay as they were published.

Now the framed copy writes each link to the page's own fragment as `about:srcdoc#…`, the frame's own address, so a
click moves within the same document and loads nothing (`keptInPage`, in-page-links.ts). Only `href` values of `a` and
`area` that are fragments change; text, comments, other attributes and raw text (`style`, `script`, `title`,
`textarea`…) are read past. The browser's own parser then checks the copy: parsed, it must be exactly the page with
those links changed (`framed`). HtmlView memoises the result per page.

A page whose own links can't be kept so is not framed at all, never framed as stored: its citations would still empty
the frame. HtmlView says so in place of the page ("This designed page isn’t shown here…") and offers the version's
other formats ("Read as Markdown", and PDF where it has one; every version has its Markdown). The Format switch still
reads HTML, Download still saves the page's bytes, and nothing about the page, its record or its history changes. A
page with no link to its own fragment is framed byte for byte as before.

R2's first review found two gaps. F01: a page's CSS may select a citation by its link (`a[href^="#"]`) or show
`attr(href)`, and the design policy accepts that; with the link rewritten the design changes. A policy-accepted page
whose two citations show only through `a[data-cite][href^="#"]` (fixtures/cited-page.ts, `designed=styled`) lost both
in the frame. Now a page whose CSS (its `<style>` elements and `style` attributes, CSS escapes read) mentions `href`
at all is not shown, as above; so is one the browser parses otherwise than the viewer's reading of its bytes (a
fragment written `&#35;…`), and one with a fragment link that reading can't find. F02: the page is parsed outside
the frame. The comments no longer say a DOMParser document fetches and runs nothing; a check measures it: pages naming every resource a page can ask for and every way to run code, aimed at a local counted
endpoint, with and without the compiled CSP, are read by `framed()` and nothing is asked for and nothing runs, while
the same markup in a live document does ask.

R2's second review asked two more things. CSS reads CR LF as one line break, and an escape may take one space after
its digits, so `[\68` + CR LF + `ref]` is `[href]`. The policy accepts such a `styles.css` and compile keeps its
CR LF; the HTML parser folds it to LF in a `<style>`, and the viewer already refused those pages. A `style` attribute
written with `&#13;&#10;` keeps both characters, and the viewer read `h` + LF + `ref`: it rewrote the page. CSS
escapes are now read after CSS's own line-break folding (CR LF, CR and FF to LF). And the refusal's «Read as…» button
goes with the note once pressed: like the pane's other buttons that go, it now gives the focus to the report's title.

Unchanged: the empty sandbox, the page's bytes, its CSP, the hash check and the refusal of bytes no record names,
Download's bytes and hash, the Sources tab, ReportCover (a passive, inert preview, left as it is), and every page with
no link to its own fragment, framed byte for byte as before. No API, contract, schema, CSP or header change, and no
dependency.

## Evidence

Local only: the fixture page (`room.html?place=work&designed=cited`), whose version 1 serves the retained page's exact
bytes and hash (fixtures/cited-page.ts), Chromium 153 headless from the pinned Playwright 1.63.

- F01 before its correction (`d021d56a`): the href-styled page's citations are hidden in the frame (expected visible,
  received hidden). With the same source, the refusal checks fail: the href-styled and the `&#35;` page are framed
  (no note, a frame in the pane), and the in-browser `&#35;` page comes back framed rather than null.
- F01 after: neither page is framed. No frame in the pane or the page, the note in its place, the Format switch on
  HTML, Download saving the exact bytes (`52a8295a`, `96fcf442`), and "Read as Markdown" showing the version's
  Markdown. Pages whose CSS mentions href in any form (`[HREF]`, `[\68 ref]`, `attr(href)`, a `style` attribute) are
  not framed; one whose CSS never does is rewritten.
- F02 (`d021d56a` and after): zero requests to the counted endpoint and no script, handler or `srcdoc` run, for both
  pages; the same markup in a live document reaches the endpoint.
- Fail before, on main `9d6902d6` with only the fixture and the new spec added: report-html-citation.spec.ts 0/3. Both
  click checks fail with the frame's document destroyed by a navigation; the third finds no in-page-links module.
- Pass after: 3/3. The click keeps the same document (its time origin), the source entry on screen, the fragment
  `#source-1`, no frame navigation off `about:srcdoc`, no request at all, the outer address, the empty sandbox and
  Download's exact bytes and `c824d3a7`. Read back up by the wheel, another [1] brings the entry back into view.
  In the browser, only fragment links change, however written; links elsewhere, text, comments and raw text don't; a
  page the copy would change differently from how the browser reads it (`href="&#35;a"`) is not framed.
- Focused corrections, before (`b640dc29` source with the new spec) and after: the `&#13;&#10;` attribute page came
  back rewritten, then null; after Enter on «Read as Markdown» the title did not have the focus, then did. The three
  compiled CR LF, CR and FF pages (policy-accepted, CSSOM `a[data-cite][href^="#"]`, citations shown) were already
  refused at `b640dc29`.
- `in-page-links.test.ts` 6/6 (the rewrite in node, byte-exact, and the published page's six links only).
- The report-reader suites (report, knowledge-library, revise-section, report-design-trigger, report-origin,
  knowledge-honest, report-page, report-reading, report-pane-keys and the new spec, seven checks), both projects:
  148/148.
- The full `pnpm check` result and the logs are in the handback record.

## Close after a citation (B-HTML-CITATION-CLOSE-LIFECYCLE-TRIAGE-01)

In the live app (P-HTML-CITATION-APP-10, d40f3153) a citation reached its source entry, and then one Close left the
report open. The frame went from `about:srcdoc#source-1` back to `about:srcdoc`, Forward was enabled, and the outer
address was unchanged. The same happens locally. On the room fixture with the c824 page (Work, and Knowledge searched
"Fixture"), a completed citation adds one entry to the tab's history (`history.length` 3 → 4), and the page's own
`history.state` stays `{ sophiaReport: 1 }`. Close stepped back with `history.go(-1)` (DocumentViewer's `back`), and
the tab's history steps back through its frames' entries too. So it undid the frame's move and not the viewer's open:
the frame went back to `about:srcdoc`, the address and the pane stayed, and there was no popstate on the page. Without
a citation, the same Close closes. "Back to side panel" on the full page (`back(1, …)`) failed the same way. The
browser's own Back undoing the citation's move is the browser's, and left as it is.

Now `stepBack` goes back through the Navigation API, which lists only the page's own entries: `traverseTo` the entry
`n` before the current one. That is the viewer's own step, whatever its frames added. Where a browser has no Navigation
API, `history.go(-n)` as before. Nothing else changes: the entries the viewer pushes, `landing`, the kept fragment, the
popstate handler, `leaveFor`, the frame, its sandbox, the page's bytes and the citation's move.

Evidence (Chromium 153 headless, desktop):

- On d40's DocumentViewer, the three new checks in report-html-citation.spec.ts fail, 0/3. Close after a citation
  (Knowledge searched, and after a format change, another frame's citation and another version) leaves the pane open,
  and "Back to side panel" after a citation leaves the full page.
- With `stepBack`, 3/3 (and 9/9 repeated three times). One Close closes. The address is Knowledge's, its search still
  "Fixture"; Forward opens the report again and Back closes it. The full page steps down once, then Close closes, and
  the focus goes back to the opener.
- The focus after Close on Knowledge, citation or not, is lost to the body in most runs, and was so on d40 too (3 of 4
  without any citation, with `history.go`). It is not this cause and is left as it was; the focus is checked on Work.

## Without the Navigation API (B-CLOSE-TARGET-COMPATIBILITY-REPAIR-01)

R2's review of `0f2f1b64` (F01): where the browser has no Navigation API, `stepBack` still fell back to
`history.go(-n)`, the step that fails after a citation. The build targets Safari 16.4, which has none. Locally, in
Chromium with `window.navigation` deleted, and with it present but without a current entry or without the viewer's
entry listed, one Close after a citation left the pane open as before (`history.length` 3 → 4, the frame back to
`about:srcdoc`). Taking the frame out of the page first does not help: its move stays in the tab's history
(`history.length` still 4) and `history.go(-1)` then steps over it with no popstate on the page.

So without the API nothing can step Close past a frame's move, and no frame is let move there:

- `own-history.ts` (new) says whether the browser has the whole of the Navigation API the viewer's steps need (its
  entries, a current entry, `traverseTo`), and gives the step back: `traverseTo` with it, `history.go` without it.
- HtmlView frames a page whose links it keeps in the frame (`framed` changed it) only where that API is whole. Where it
  isn't, the page is not framed: the note says "This designed page isn’t shown in this browser: here, following one of
  its citations would keep Close from closing the report. Download keeps the page as it is." and offers the version's
  Markdown (and PDF where it has one), as for the pages already refused. A page with no link to its own fragment is
  framed as before. So `history.go` runs only where no frame moved within itself.
- Where the API is whole but can't reach the viewer's entry `n` back (none listed: not expected from a browser that
  follows the standard, which lists the page's contiguous same-origin entries), `back` changes the address in place, as
  it already did when the current entry is not one of the viewer's; never `history.go` over a frame's move. Closed in
  place no popstate comes, so `useLeaveFor` goes on at once instead of waiting for one.

Unchanged: the frame, its empty sandbox, the page's bytes, CSP, hash, Download, the citation's move where the API is
whole, the entries the viewer pushes, `landing`, the kept fragment and the popstate handler.

Evidence (Chromium 153 headless, desktop, the API taken away by an init script as the other Safari 16.4 checks do):

- On `0f2f1b64`, the triage: absent API and API without a current entry, Close after a citation leaves the pane open.
- On `0f2f1b64`'s DocumentViewer and HtmlView with the new checks: 3 of 5 fail (absent and partial API: the page is
  framed, no note; entry not listed: Back to side panel leaves the full page). The other two hold before and after: a
  page with no link to its own fragment is framed without the API, and Made for on the full page closes in place and
  opens the goal. With `useLeaveFor` as before and the rest new, that last one fails (the goal never opens).
- After: 5/5, and 15/15 repeated three times. Without the API (absent, partial): no frame, the note, HTML still the
  format chosen, Download's exact bytes and `c824d3a7`; one Close closes with the focus back on the opener, Forward
  opens it again and Back closes it; the full page steps down once; Read as Markdown reads; Close closes.
- `own-history.test.ts`: 5 unit tests (which API is whole, the entry stepped to, no step where none is reached, the
  overtaken step's rejection handled).

## Remaining limits

- Chromium only. `about:srcdoc` as a srcdoc document's address, and a fragment link to it as a move within the page, are
  the HTML standard's; Safari and Firefox were not run. No WebKit is installed here and none was added: the missing
  Navigation API is Chromium with the API taken away, not a Safari acceptance.
- Without a whole Navigation API, a designed page with citations is not shown as HTML: its readers get the Markdown (or
  PDF), and Download. That is a refusal, not support.
- A link to anything but the page's own fragment (the design policy allows http, https and mailto) still navigates the
  frame when clicked, as on main, and that is an entry in the tab's history too. With the Navigation API Close steps
  past it; without it, as on main, Close steps back over it. The published page has no such link; not changed here.
- Not exercised in the deployed app. A production frame navigating to Studio would meet `X-Frame-Options: DENY` and
  show an error page rather than the blank one seen locally; neither is observed.
- Links to anything but the page's own fragment are unchanged: a click on one still navigates the frame, as before.
- A page whose CSS mentions `href` anywhere (a string or a comment included), or whose own links the viewer can't read
  as the browser does, is not shown as HTML at all: its reader gets the Markdown (or PDF). That is a refusal, not HTML
  support for those pages; their designed page is reachable only by Download.
- F02 is measured in Chromium against the listed resource kinds and script forms, not proven for every input or
  browser; link-state styling (`:visited`) may differ between the two addresses, within the policy's marks only.
- The `&#35;` fixture page is hand-written; packages/design's compile writes a fragment's `#` as it is, so compiled
  pages are not expected to take that path.

## Next bounded action

P: dispatch R2's independent review of the whole diff from main to the candidate commit on
`fix/html-inline-citation-20261107`, before the first push.
