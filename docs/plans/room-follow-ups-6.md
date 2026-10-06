# Room: follow-ups to #126–#129

> 2026-10-06 · Luis · PR 24 of the room's $20 plan · the P2s Codex left on #126 to #129, merged or awaiting by the no-P1 rule · "Terminemos todo y grabemos"

## What changes

**A feed move during a read is read again** (#126, `useFeedRefetch`, `feed-step.ts`). If the cursor moves while a review or task read is on its way, that read may hold what came before the move. The move is kept pending, and the records are read again once the read settles.

**A task's quote never splits a character** (#126, `taskQuote`). It is cut between characters as a reader sees them: graphemes, or code points where the browser has no segmenter. It is measured in UTF-16 units, the strictest count an API applies, so it stays within 800.

**Following after a reconnect keeps what it heard until it can ask** (#127, `following-signal.ts`). What was heard is forgotten only once the ask is published. An ask refused is asked again after a while, until the call ends or another drop begins, so a transient failure never leaves the counts empty for the rest of the call. With only guests in the call, nobody is asked.

**Back from another view, what was followed is followed again** (#127, `StagePresent`). What each call follows is kept beyond the stage, by project and call. Leaving the stage still says «nothing»; coming back says the version again.

**A search's old hits go as soon as the words change** (#128, `SearchSheet`). Before the words settle, none of the last query's hits is offered.

**«After the meeting» comes while the sheet is open** (#129, `AfterMeeting`). While its work goes on and nothing came, it is read again every four seconds, for ten minutes at most.

## Checks (written first)

- **Units:**
  - `feed-step.test.ts`: a move during a read, read again once it settles;
  - `task-view.test.ts`: a cut never splits a character;
  - `following-signal.test.ts`: what was heard is kept until the ask is published, then forgotten; a failed ask is asked again.
- **Browser:**
  - `room-following.spec.ts`: back from another view, following again;
  - `room-search.spec.ts`: no old hits while the words settle;
  - `room-return.spec.ts`: with the sheet open, the outcome comes.
