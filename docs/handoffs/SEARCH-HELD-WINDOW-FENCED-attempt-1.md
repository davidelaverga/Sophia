# Implementation-session handoff

Goal and attempt: SEARCH-HELD-WINDOW-FENCED (R-B66-P1 on `45b5b6ff4`), attempt 1. Session B, `sophia-search-common`,
branch `fix/search-held-window-privacy-20261019-b67`.

What was wrong: when Search holds a page (a found message, a gap, Earlier), `heldWith` and `useKeptWindows` copied the
cached window into the held messages as it was, including a copy fenced there (a reference whose source an unknown
erasure may have taken). Once the window moved past it and a covering snapshot released the fence, that held copy
showed its erased words.

Change (`EarlierDiscussion.tsx`): the window is held as shown: a fenced copy (stale, erased or an unseen-source reference)
is left out of the held messages while its place stays in the links, so it shows as a gap that a fresh read fills.
`useWindowHolding` groups the shown window, the kept windows and the page hold; `useKeptPlace` is the scroll keeping.

Evidence: on `45b5b6ff4` with the final test bytes, the correction and withdrawal cases showed the reference's erased
words after the window moved; the no-erasure control passed. After: project-search, discussion-earlier, room-search,
message-acts 100 of 100; Search config 14; units 1980; build.
