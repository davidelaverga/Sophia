# Implementation-session handoff

Goal and attempt: HELD-PAGES-ACTED-ERASURE (R-B55-P1 on `3de55eddf`: the acted message itself), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session B in worktree `sophia-mentions-common`
Starting commit: `3de55eddf`, branch `fix/common-heldpages-privacy-20261019-b55`
Writable scope: `held-pages.ts`, its caller `EarlierDiscussion.tsx`, `discussion-earlier.spec.ts`, this handoff.

## What was wrong

After HELD-PAGES-WINDOW-BASELINE, a correction or withdrawal learned from the feed hid the erased source's aliases,
but not the message acted on: in the snapshot's window it kept its erased words for as long as the snapshot read since
lagged or failed (the old snapshot is kept).

## Change

`useHeldRefresh` also returns `erased`: a message as shown is not shown when its source is known gone. For the message
acted on, only while its revision is no newer than the one shown when the erasure was learned: a read since or the
reader's own receipt (a newer revision) shows. A first attempt keyed on the source alone hid fresh corrected words
wherever the fixture's correction kept the source (6 existing cases failed); 0068 gives a correction a new source and
revision, and the revision guard holds either way. Withdrawing a shared reference still erases nothing (`kept`).

## Evidence

Four new browser cases (correction, withdrawal; snapshot lagging, snapshot failing 503) failed on `3de55eddf` (the
acted message's erased words stayed) and pass after; the whole spec 28 of 28, the new cases with B55's 24 of 24 over
three repeats, message-acts, mentions and room-discussion 69 of 69. Desktop project, synthetic fixture only.
