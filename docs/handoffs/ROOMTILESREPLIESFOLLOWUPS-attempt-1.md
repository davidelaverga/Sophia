# Implementation-session handoff

Goal and attempt: the five Codex P2s on #140 (room tiles) and #141 (chat replies), `docs/plans/room-tiles-replies-follow-ups.md`, attempt 1. Both PRs were merged under the no-P1 rule; this closes their P2s.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/tiles-replies-follow-ups` on `main` `f66fd36`, 2026-10-07
Ending commit/tree: the commits on `room/tiles-replies-follow-ups`, read one by one (a squash folds them into one).

## Outcome

**Tiles:**

- **Past the cap, the first to come keep their tiles,** not the first by name. Arrival is `joinedAt` (LiveKit's `Participant.joinedAt`), unknown last, ties by identity: LiveKit's list order isn't the same for every viewer or after a reconnect.
- **Whoever spoke last keeps the tile at once.** Who spoke when is state derived in render, in turns (each change in who speaks), not a ref written after the render that needed it.

**Replies:**

- **A reply chosen while the last one is sending stays,** and the next message goes as that reply: the send reads the reply under way when it's recorded.
- **A failed read of what answers what says so:** «Replies didn’t load, so messages show without what they answer.» with Try again.
  - The failure stays said until a read succeeds: the next message's read neither blinks the line nor has it read out again.
  - The links read before stay meanwhile.
  - The line is a status kept in the page, empty; with nothing in the discussion, no line.
  - Once Try again goes with the failure, the focus goes to the message field.
- **✕ «Stop replying» gives the focus to the field,** the words kept.

**Fixture:** `holdMessages`/`releaseMessages`, `failReplies`, several speaking at once (`speaking([8, 9])`), and `joinedAt` for the others.

**Independent review, two passes:**

- **First:** no P1. Three P2s, fixed: arrival by `joinedAt` rather than LiveKit's list order; focus after Try again; the failure line blinking and read out again with each message (and quotes lost while a read failed). P3s fixed: no line with an empty discussion, a press while a read goes joins it, a lazy initializer, comment widths.
- **Second:** every finding confirmed fixed; no P1 or P2. Two P3s left (below).

## Evidence

Run under the guard (`safe-run -Gentle`), with the machine free.

- **Browser:** `room-tiles.spec.ts` and `room-chat-replies.spec.ts` (8 + 13, of which 5 new), `room-discussion.spec.ts`, `room-people.spec.ts`: 47 of 47; before the review's fixes also `room.spec.ts`, `room-present.spec.ts`, `room-captions.spec.ts`, `room-review.spec.ts`: 80 of 80.
- **Unit:** `tile-view.test.ts` 6 of 6.
- **Tests first:** the unit check failed before the fix (`a,b,c` for `e,g,i`).
- **Captures:** the gallery of eleven others (Marco … Ana kept, shown by name, «+5») and the failed-read line, sent to Luis.
- **Mutations:** 14 killed, the control survives, one equivalent:
  - the rest ranked by the list, not arrival; arrival taken from the sorted list; `joinedAt` ignored (unit);
  - stamps never kept; every stamp the same turn;
  - the reply of the press, not the current one;
  - a failed read passing for none; Try again reading nothing; the failure as each read says; said with nothing in the discussion; the line added only with its words; the last links dropped while a read goes;
  - the focus left to fall, after ✕ and after Try again;
  - equivalent: dropping the stamp as someone stops (with turns, whoever spoke at the latest turn stopped last), so the stamp on stop was removed.
- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass on the touched files.

**Source-register IDs consulted:** none.

## Remaining obligations

- **P3, focus after Try again keys on a press, not on focus:** a keyboard user resting on Try again when another read succeeds loses the focus; a press whose retry failed can later pull the focus to the field. Deciding on focus needs to know whether Chromium fires `blur` on the removed button first.
- **P3, the replies state across projects:** if `Conversation` isn't remounted when the project changes, the failure line could carry over until the new project's first good read.
- **Codex P2s on #139, for the conversations follow-up:** a late receipt writing the cache after sign-out (gate on the account generation); the stored «Sophia is answering» wait not cleared once the answer is seen.

## Next bounded action

The conversations follow-up above (two P2s from #139), then the video with chapters 1, 2 and 7.
