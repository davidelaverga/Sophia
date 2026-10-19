# Implementation-session handoff

Goal and attempt: HELD-PAGES-RECEIPT-SUPERSEDED (R-B56-P1 on `1ef6cd4d2`), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session B in worktree `sophia-mentions-common`
Starting commit: `83fb2acb0` (Main `8099a22a3` merged into `1ef6cd4d2`, integration only), branch
`integration/common-main8099-20261019-b57`
Writable scope: `held-pages.ts`, `EarlierDiscussion.tsx`, `MessageActions.tsx`, and (P's addendum) the one cursor
forwarded by `useProjectFeed.ts`; the act fixture's receipt cursor; their checks; this handoff.

## What was wrong

The reader's own Edit shows its receipt (revision r2) over a snapshot still at r1. When another tab then corrects or
withdraws that message, its r2 words are erased, but the receipt stayed: HELD-PAGES-ACTED-ERASURE compared the shown
revision (r2) with the snapshot's (r1) when the erasure was learned, so a newer receipt always passed.

## Change: producer and consumer

- Producer, `useProjectFeed.ts`: `contributionChanged(owner, id, erasing, next.cursor)`, the cursor of the frame the
  feed took (the same `took` condition as before; owner, reset and refresh unchanged).
- Store, `held-pages.ts`: `Changes.erasedAt` keeps each message's latest erasing cursor (dropped with the rest on a stop
  or past `KEPT`). `superseded(receipt, erased)`: a later cursor, compared as BigInt.
- Receipt, `MessageActions.tsx`: a correction's `Acted` carries `receipt.cursor`, which the API sets to its own act's
  event (0068: `cursor_value := emit_project_event(...)`).
- Consumer, `EarlierDiscussion.tsx`: an entry shown from a receipt is passed with its cursor to `erased`; it goes when a
  correction or withdrawal at a later cursor is learned. Its own act's event (same cursor) does not hide it.
- Fixture: the act receipt's cursor is its own published event's, not `'1'`.

## Evidence

Four browser cases through the Edit UI (then a correction or withdrawal elsewhere; snapshot lagging, or 503): on the
integration baseline the superseded receipt's words stayed (4 of 4 failed, also with the final fixture bytes and the
product files restored after); after, the whole discussion spec 32 of 32. Desktop project, synthetic fixture only.
