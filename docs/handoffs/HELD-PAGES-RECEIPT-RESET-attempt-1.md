# Implementation-session handoff

Goal and attempt: HELD-PAGES-RECEIPT-RESET (R-B57-P1 on `1ed18e4b8`: a superseded receipt after the store of changes
overflows), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session B in worktree `sophia-mentions-common`
Starting commit: `1ed18e4b8`, branch `integration/common-main8099-20261019-b57`
Writable scope: the held-pages receipt and erasure data flow, its checks, this handoff. No product change was made.

## What was checked

Past `KEPT` (200) changed messages, `contributionChanged` lets the store go: `ids`, `erasing` and `erasedAt` together,
and a resync is counted. A receipt superseded before it no longer finds its later cursor (`superseded(41, undefined)`).
But the same reset empties `erasing`, so the message is no longer among those acted on, and the source learned gone when
the erasure came (kept in `useErasure`'s refs, which the store's reset does not touch) still names its window entry:
`windowAliasesOf` fences that message by id, and the receipt shown for that id is filtered with it.

## Evidence

Four browser cases (the reader's Edit, then a correction or withdrawal elsewhere hides the receipt; then 205 other
messages named again elsewhere; the snapshot lagging or failing with 503). Each proves the overflow from the chat's own
store (`window.fixture.heldChanges()`: one more resync, no erasing cursor left) before asserting. On `1ed18e4b8` they
pass (4 of 4, then 12 of 12 over three repeats; the whole spec 36 of 36). A probe with `windowAliasesOf` turned off
(restored after, bytes equal) makes them fail: the erased words come back. They stay as the guard for that path.

## Fixture

`mentionMany(n)` publishes `n` distinct `contribution.mentioned` events; `heldChanges()` reads the held-pages store for
this account and project.
