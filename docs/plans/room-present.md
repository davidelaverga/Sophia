# Room: show a report to everyone, as Meet shows a screen

> 2026-10-05 · Luis · PR 6 of the room's $20 plan (prototype scene 4) · "la sala cambiaba a como Meets cuando se abría"; "lo que no tenemos para API que se haga por fixtures"

## The gap, measured

Today a report opens in a side pane, for whoever opened it. The others in the call see nothing: there is no way to put it in front of the room, as a shared screen is in Meet or Zoom. The snapshot already says what is shown (`sharedFocus`: a version and who guides), but nothing writes it, and the Studio doesn't read it.

## What changes

**Following what is shown (the snapshot's `sharedFocus`, already in the contract):**
- When someone shows a report, the others' stage says so under Sophia's line: «Marco is showing Fixture report · v2», with **Follow**. Following is deliberate (01:41): nobody's view moves without their press.
- **Followed**, the stage takes the present layout, as a shared screen does:
  - the report in the middle, read-only, with its title and who shows it;
  - Sophia's tile and the people in the strip beside it.
  - **Stop following** goes back to the light.
- Who shows it follows it from the start: they chose to show it.
- When nothing is shown any more, every stage goes back, and following ends.
- A shared screen keeps the stage: live media first. The report waits as the card.
- **The report is found** from the snapshot's current versions (`artifacts`). A version not among them (an older one) is named, but can't be followed. A14 should carry the artifact's id.

**Showing (the proposed A14 writer, behind the vision flag):**
- «Show everyone» is in the report pane's head (in the room) and on the made object's card. It sends `PUT /api/v1/rooms/{roomId}/focus { artifactVersionId, expectedRoomRevision }` with an Idempotency-Key (issue #105).
  - **Committed:** the pane closes, and the report takes the stage.
  - **Stale (409):** «The room changed. Show it again.»
  - **No reply:** «Not confirmed» with Try again, using the same key. When the show landed anyway, the room's feed carries it, so the stage presents it as the API holds it.
- «Stop showing» on the stage sends the same request with `null`.
- Members only; a guest is never offered it.

**The vision flag:** what calls an API that doesn't exist yet is shown only when the build sets `VITE_SOPHIA_VISION=1`. Only the fixture pages set it. Production never offers a control whose request would fail. The proposed shapes live in `src/api/vision.ts`, each checked at runtime, and named as proposals from #105.

## Out of scope

- «2 following» (a LiveKit attribute per client, A14);
- Sophia's mark through the sections and the shared anchor (PR 7, A14's `present_section`);
- a shared scroll position.

## Checks (written first)

- **Browser** (`e2e/room-present.spec.ts`):
  - another member shows: the card names them and the report, the stage stays the light, Follow presents it, and Stop following returns;
  - nothing shown any more: back to the light, even while following;
  - a shared screen keeps the stage;
  - showing from the card and from the pane sends the request (the version, the room's revision, a key), closes the pane and presents with «Shown by you»; Stop showing clears it;
  - a stale room says so, and pressing again shows it;
  - a show whose reply was lost is known from the room's feed: it is shown once.
- **Units** (`present-view.test.ts`): what the card says, when the stage presents, and whether Show is offered.
