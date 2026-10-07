# The room's tiles and chat replies: follow-ups to Codex on #140 and #141

> 2026-10-07 · five P2s, none a P1; both PRs merged under the no-P1 rule, these close them.

## The gaps

**Tiles (#140):**

1. **The fallback is name order, not arrival.** `tilesFor` ranks the rest by index in `people`, and the stage sorts
   people by name (`orderParticipants`). Past the cap, with nobody speaking, the alphabetically first keep their tiles,
   not the first to come — against `room-tiles-overflow.md`.
2. **Who stopped speaking last is written after the render that needed it.** `useSpokeAt` stamps a ref in an effect,
   so the render that sees the speakers stop ranks by the old stamps and nothing renders again. Two people speak, the
   one who came first stops first: when the other stops, the tile goes to the first, not to whoever spoke last.

**Replies (#141):**

3. **A reply chosen while the last one is sending is dropped.** The send keeps the `reply` of its own render; recorded,
   it compares against that and clears whatever reply is current, the new one too, and its words go unthreaded.
4. **A failed replies read looks like no replies.** Every reply shows as a plain message, with no word that the
   threads did not load and no way to ask again.
5. **✕ «Stop replying» drops the focus.** The button goes, and the focus falls to the page.

## What changes

1. `TileOrder` takes `arrived`: identities by when each joined (`joinedAt`, LiveKit's `Participant.joinedAt`), unknown
   last, ties by identity. Not LiveKit's list order: for those already in the room it comes from the server's join
   reply, not the same for every viewer or after a reconnect. Without `arrived` (the unit tests' lists), the list's own
   order.
2. The stamps are state derived in render (the "adjusting state when a prop changes" pattern): each change in who
   speaks is a turn, and stamps those still speaking with it, in the same render. Whoever spoke at the latest turn
   stopped last, so stamping the stop too adds nothing (a mutant that drops it survives: equivalent). The order is all
   the ranking needs; a counter rather than the clock keeps the render pure.
3. The send reads the reply under way when the write is recorded (a ref kept with the latest render), and lets it go
   only if it is still the one sent.
4. A failed read says so under the discussion: «Replies didn’t load, so messages show without what they answer.» with
   **Try again**, which reads again (a press while a read goes joins it). The failure stays said until a read succeeds,
   so the next message's read neither blinks the line nor has it read out again; the links read before stay meanwhile.
   The line is a status kept in the page, empty, whenever the discussion has messages; with none, there is no line.
   Once Try again goes with the failure, the focus goes to the message field.
5. ✕ gives the focus to the message field, the words kept.

## Checks (written first)

- **Unit** (`tile-view.test.ts`): with `arrived`, the rest keep their tiles in arrival order, not the list's;
  `arrivalOrder` sorts by `joinedAt`, unknown last, ties by identity.
- **Browser** (`e2e/room-tiles.spec.ts`):
  - a gallery of eleven others with nobody speaking keeps the first to come (Marco … Ana), not the first by name
    (Diego, Elena);
  - two speak; the one who came first stops first; when the other stops, the other keeps the tile.
- **Browser** (`e2e/room-chat-replies.spec.ts`):
  - a reply chosen while the last one is still sending stays, and the next message is sent as that reply;
  - a failed replies read says so, and Try again brings the quotes back, the focus at the field;
  - the failure stays put as messages come (no change to the line's words), and quotes read before stay;
  - with nothing in the discussion, no line;
  - ✕ gives the focus to the field.
- **Mutants** with a control: each fix reverted on its own must fail a check above.
