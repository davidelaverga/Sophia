# The room: every press answers

> 2026-10-07 · Luis: «Sigue con lo siguiente de la cola». The queue's third step, the «$20» look, reaches the room
> (the critique was given in the session). The first of two PRs: what fails in silence. No API change.

## What reads as broken

- In the demo, «Speak with Sophia» does nothing: the fixture has no answer for her exchange (`POST …/exchanges`, 501),
  and nothing on screen says so. «Stop speaking» and «End» are the same. For a room whose point is Sophia, her own
  presses are dead.
- In the product, a refusal whose body is not the contract's Error is shown with the HTTP status text. Over HTTP/2 that
  text is always empty, so the refusal under the dock is empty and is not drawn: a press that failed looks like a
  press that did nothing. It reaches every place that shows an `ApiError`'s words.

## What changes

- **A refusal always has words.** An error reply with no readable body says «Sophia couldn’t do that (HTTP 502). Try
  again.» when the status text is empty; with status text, as before.
- **The demo's Sophia answers her presses**, as the API would (contract amendment A06): «Speak with Sophia» opens her
  conversation (the floor to whoever asked, if no one held it) and she listens; «Stop speaking» quiets her and she
  listens; «End» ends the conversation and she leaves. A stale room revision is refused as the API refuses it.

## Checks (written first)

- The client: a 502 with no contract body and no status text carries words naming the status (`client.test.ts`).
- The room fixture: «Speak with Sophia» shows her controls and her name in the dock, and her line says she is
  listening; «End» brings «Speak with Sophia» back; no request goes unanswered (`room-honest.spec.ts`).
