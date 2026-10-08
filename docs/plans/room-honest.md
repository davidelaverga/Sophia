# The room: every press answers

> 2026-10-07 · Luis: «Sigue con lo siguiente de la cola». The queue's third step, the «$20» look, reaches the room
> (the critique was given in the session). The first of two PRs: what fails in silence. No API change.

## What reads as broken

- In the demo, «Speak with Sophia» does nothing: the fixture has no answer for her exchange (`POST …/exchanges`, 501),
  and nothing on screen says so. «Stop speaking» and «End» are the same. For a room whose point is Sophia, her own
  presses are dead.
- In the product, a refusal whose body is not the contract's Error is shown with the HTTP status text. Over HTTP/2 that
  text is always empty, so the refusal under the dock is empty and is not drawn: a press that failed looks like a
  press that did nothing. It reaches every place that shows an `ApiError`'s words. A stale room shows the database's
  «Stale room revision» under Sophia's controls.

## What changes

- **A refusal always has words, the same over any protocol.** An error reply with no readable body says «That
  didn’t go through (HTTP 502). Try again.», «Try again» only for 5xx and 429; the status text is no longer shown.
  Mark as seen keeps its own words for it; Sophia's controls say «The room changed meanwhile. Try again.» for a stale
  room, as the floor's already do. While a refusal shows, the tips of the presses beside it keep out of its way (the
  pointer is still on the one pressed, and its tip covered the refusal's second line).
- **The demo's Sophia answers her presses**, as the API would (A06; `start_exchange` and `control_exchange`, 0013):
  «Speak with Sophia» opens her conversation, vision allowed, and she listens; with a guest in the room it is refused
  in the API's words; «Stop speaking» quiets her; «Show Sophia your camera» and «Stop looking» move what she sees;
  «Resume» lifts a pause the room allows; «End» ends it (no pause or look left behind), and again harmlessly. A stale
  room revision, a second start, the same key twice: as the API answers each.

## Checks (written first)

- The client: a 502 with no contract body and no status text carries words naming the status (`client.test.ts`).
- The client: the same words for a 404 with status text, without «Try again».
- The room fixture: «Speak with Sophia» shows her controls and her name in the dock, and her line says she is
  listening; «End» brings «Speak with Sophia» back; «Stop speaking» leaves her listening; with a guest, the dock says
  why in the API's words, no tip over it; shown a camera, «Stop looking» appears and goes; no request goes unanswered
  (`room-honest.spec.ts`).
