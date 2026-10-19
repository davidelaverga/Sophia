# Implementation-session handoff

Goal and attempt: HELD-PAGES-UNSEEN-SOURCE (Codex 4318164723 on `ecd96c091`), attempt 1. Session B,
`sophia-mentions-common`, branch `fix/common-unknown-source-freshness-20261019-b64`.

What was wrong: a correction or withdrawal of a message not shown here (older than the snapshot's 50, no earlier page)
names only that message; which source it erased is unknown, so a reference to that source in the window kept the
erased words while the snapshot read since lagged or failed.

Change (`held-pages.ts`): `unseenOf` takes the latest cursor of an erasure this chat could not name; while the shown
snapshot is older than it (`untrusted`), the window's references are not shown. A snapshot at or after it releases them.
Fixture: `holdSnapshotAt` lags like `holdSnapshot` but answers with the cursor held then, as the API's consistent
snapshot does (`holdSnapshot` unchanged: the mentions case relies on it).

Evidence: on `ecd96c091` with the final test and fixture bytes, the lagging and 503 cases (correction, withdrawal)
failed with the reference's erased words shown; the fresh controls passed. After: discussion spec 56 of 56, mentions
375, message-acts, room-discussion, units 1949, build.
