# Room: follow-ups to #121 and #122, the search, the recap and the record

> 2026-10-06 · Luis · PR 22 of the room's $20 plan · the P2s Codex left on #121 and #122, merged by the no-P1 rule · "Terminemos todo y grabemos"

## What changes

**A search's hits answer its own query** (#121, `SearchSheet`). While the next query is read, the last one's hits are not offered under it: they could open a record that isn't what was searched for. «Searching…» says why the list is empty, also while a query waits for the network.

**The running meeting's sheet stays the running one while its recap is read** (#121, `RecapSheet`). Opened from Updates, the sheet knows from the list whether the meeting runs. Until its recap is read, that is what it goes by; if it isn't known (a search hit), it is taken as running. Leaving the call from it, even before the recap comes, opens no second sheet.
- **The cost:** an older meeting opened from search, left before its recap is read (or while its read fails), opens no recap of the meeting left. This was chosen over a second sheet on top of the running one.

**The record is right:**
- **The walk's handoff** (#122) names its commits: the content commit `636cbe0`, parent of the handoff's `32e30df`, and the squash on main, `62c6aa7`. Codex read GitHub's merge ref, so its line was right; the commits are now named.
- **Three plans** (search, Updates, the walk) said their shapes were «written to #105».
  - Updates and the walk now link the comment that posted their refinements.
  - The search plan's two refinements (`SearchPage { hits, next }`; a report hit's `id` is the artifact, `cite.recordId` the version) are not posted yet, and it says so.

## Checks (written first)

- **Browser:**
  - `room-search.spec.ts`: while the next query is read, the last one's hits are not offered;
  - `room-search.spec.ts`: the running meeting's recap, opened from a hit, is the running one until read;
  - `room-updates.spec.ts`: leaving from the running meeting's sheet while its recap is read opens no second one; leaving from an older meeting's sheet before its recap is read opens the recap of the meeting left, on top.
