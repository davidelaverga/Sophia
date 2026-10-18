# Home where Sophia can't answer

> 2026-10-17 · informe-25 (`evaluacion-2026-10-17/informe-25.md`), PJ-02, from Luis's «Sigue con la cola … y el nuevo
> informe-25». Studio only, driven by the API's `companion` field. The report's §8 item 8 stays Luis's: hide Personal
> entirely, or keep it and say she can't answer. This takes the reversible route: the line comes back by itself when
> the API says `live` or `rehearsal`.

## What was measured

- Home drew its line to Sophia, its microphone and its «/» key whenever the space was unlocked. Production answers
  `companion: 'unavailable'`, so the words went to Personal and stayed under «Sophia can’t answer here yet»: a dead end.
- Her introduction in Personal always ended «What’s on your mind?», and with no projects Home said «…or just talk to
  me.», where she could not answer either.

## What changes

- **`places-view.ts`:** `homeLine(locked, answers)`: nothing while locked (your row unlocks it), the line where she
  answers, «can't» where the API says she can't, the place held while that is unknown. `sophiaSays` drops «, or just
  talk to me» unless she answers.
- **`Welcome`:** a required `answers` (the API's `companion`, undefined until the space is read). Where she can't
  answer, the line's place says «Sophia can’t answer here yet · Write a note», the note a press away (notes are served
  without a companion). While unknown, the place is held, so nothing below moves when it is known.
- **`personal.css`:** both stand in the line's box (46 px, its words' type, its entrance, the reduced-motion list), with
  no hairline: neither is a field.
- **`conversation-view.ts`:** `introText(name, answers)` asks nothing where she can't answer.
- **`fixtures/home.tsx`:** `companion=unavailable|reading`; the default answers, as before.

## Checks, written first

- `places-view.test.ts`: `homeLine`'s four answers; with no projects, no offer to talk where she can't answer.
- `conversation-view.test.ts`: the introduction with and without her answering; no «?» in the intro row then.
- `home-no-companion.spec.ts`: with `companion=unavailable` no line and no microphone, the reason and «Write a note»
  (it opens the notes) in a 46 px place; the Projects label at the same height with the line, the reason and the held
  place; with no projects, no offer to talk; Personal's first words ask nothing with `unavailable=1`.

## Limits

- While the space is read, the line's place is empty for a moment, then the line arrives; where the space's read fails
  it stays empty, beside ReadNotes' own note.
- Locked, Home no longer says «or just talk to me» with no projects: the space has to be unlocked first.
- Personal's Find still offers «Ask Sophia» where she can't answer (PJ-04): noted, not changed here.
