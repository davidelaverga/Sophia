# Implementation-session handoff

Goal and attempt: B-HTML-CITATION-FIX-01, attempt 1 (after B-HTML-CITATION-LOCAL-TRIAGE-01)  
Human owner / executor resource: Davide (owner); B, the existing Claude Code session; P coordinates, R2 reviews independently  
Native session: `local_cf492b49-c8d1-4ab7-b811-95eaefc2b61c`; no native, provider or model call was made  
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-11-07/sophia-html-citation`, local branch
`fix/html-inline-citation-20261107` from main `9d6902d6b07f42cb4ef725a2524814f386680759` (tree `258f6807`)  
Ending commit/tree and changed files: the local candidate commit on that branch (its id is in the handback record, since
a commit cannot name itself); `apps/studio/src/features/artifacts/HtmlView.tsx`, `in-page-links.ts` (new),
`in-page-links.test.ts` (new), `apps/studio/e2e/report-html-citation.spec.ts` (new), `apps/studio/fixtures/cited-page.ts`
(new), `apps/studio/fixtures/report-data.ts`, `apps/studio/fixtures/room.tsx`, this file.

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
those links changed, or the page is framed as stored (`framed`). DOMParser documents have no window, run nothing and
fetch nothing. HtmlView memoises the copy per page.

Unchanged: the empty sandbox, the page's bytes, its CSP, the hash check and the refusal of bytes no record names,
Download's bytes and hash, the Sources tab, ReportCover (a passive, inert preview, left as it is), and every page with
no link to its own fragment, framed byte for byte as before. No API, contract, schema, CSP or header change, and no
dependency.

## Evidence

Local only: the fixture page (`room.html?place=work&designed=cited`), whose version 1 serves the retained page's exact
bytes and hash (fixtures/cited-page.ts), Chromium 153 headless from the pinned Playwright 1.63.

- Fail before, on main `9d6902d6` with only the fixture and the new spec added: report-html-citation.spec.ts 0/3. Both
  click checks fail with the frame's document destroyed by a navigation; the third finds no in-page-links module.
- Pass after: 3/3. The click keeps the same document (its time origin), the source entry on screen, the fragment
  `#source-1`, no frame navigation off `about:srcdoc`, no request at all, the outer address, the empty sandbox and
  Download's exact bytes and `c824d3a7`. Read back up by the wheel, another [1] brings the entry back into view.
  In the browser, only fragment links change, however written; links elsewhere, text, comments and raw text don't; a
  page the copy would change differently from how the browser reads it (`href="&#35;a"`) is framed as stored.
- `in-page-links.test.ts` 6/6 (the rewrite in node, byte-exact, and the published page's six links only).
- The report-reader suites (report, knowledge-library, revise-section, report-design-trigger, report-origin,
  knowledge-honest, report-page, report-reading, report-pane-keys and the new spec), both projects: 144/144.
- The full `pnpm check` result and the logs are in the handback record.

## Remaining limits

- Chromium only. `about:srcdoc` as a srcdoc document's address, and a fragment link to it as a move within the page, are
  the HTML standard's; Safari and Firefox were not run.
- Not exercised in the deployed app. A production frame navigating to Studio would meet `X-Frame-Options: DENY` and
  show an error page rather than the blank one seen locally; neither is observed.
- Links to anything but the page's own fragment are unchanged: a click on one still navigates the frame, as before.
- A page whose framed copy the browser would read differently (a fragment written as an entity, say) keeps its old
  behaviour whole: framed as stored, its own links navigating away.

## Next bounded action

P: dispatch R2's independent review of the whole diff from main to the candidate commit on
`fix/html-inline-citation-20261107`, before the first push.
