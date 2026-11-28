# A chat with Sophia asks for no microphone

> 2026-11-28 · Luis: «Sigue con la cola de mejoras de UI». Part of P1-2 of the independent evaluation
> (`evaluacion-2026-11-22/evaluacion-independiente.md`): «Chat with Sophia» joined the call and the browser asked for
> the microphone. Studio only; no API change, no new words.

## Seen (on main 0d5a85222)

- A text join (`startChat`: text mode, then `join({ textOnly: true })`) connects with the microphone off.
- Once connected, the room listens for speech on a muted microphone to say «You're muted» (`muted-speech.md`). That
  listening opens its own stream, `getUserMedia({ audio })`, so a person who only chose to type is asked for the
  microphone. The room is told its mode only after it connects (`enterCall`), too late: the stream was already asked.
- Room fixture, `?call=on&people=2`: Chat → «Chat with Sophia» → text mode on, microphone off; speech on the muted
  microphone showed «You're muted».

## Change

- `hearsMuted` (`muted-speech.ts`, pure, with tests): the room listens only while connected, the microphone off, and
  the call told it is by voice. In text mode it never listens; before the call has been told its mode it waits.
- `livekit-room.ts`: the muted watch reads that rule; `setTextMode` tells the call its mode and syncs the watch, so
  going back to voice with the microphone off listens again, and going into text mode lets the stream go.
- The room fixture's fake room follows the same rule.

## Not covered

- That «Chat with Sophia» joins the call at all, and that its words don't say so (the rest of P1-2, with P2-5): a
  product choice, with new words, for Luis.

## Checks

- `muted-speech.test.ts`: by voice it listens; in text mode, before the mode is told, with the microphone on, or not
  connected, it doesn't. Seen failing with `textMode !== true` in place of `=== false`.
- `muted-speech.spec.ts`: in text mode, speech on the muted microphone says nothing. In the fixture, main's fake said
  «You're muted» there; with the change it says nothing, and by voice with the microphone off it still does. CI is
  the record (the Playwright guard refuses while Opera is open).
