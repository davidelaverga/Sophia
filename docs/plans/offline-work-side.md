# Offline on the work side says offline

> 2026-10-18 · Luis: «Que sigue>», after «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual.
> Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando» · seam #8 of
> `evaluacion-2026-10-18/experiencia/costuras.md` (judge's adjustment: the three lines in one voice, Personal's). Studio
> only, no API, one PR.

## Measured

- **The cause is known:** `features/personal/online.ts` reads `navigator.onLine` and its two events. Personal is its
  only user (`PersonalComposer.tsx`'s `useWaiting`): offline, Send waits and the line says «You’re offline. Your words
  wait here.»
- **The work side doesn't read it:** a project conversation's Send still writes offline. The fetch throws, `callApi`
  turns that into «No reply from Sophia» (`api/client.ts`, now at lines 333-335), and `useHeldWrite` holds it, so the
  line says «Not confirmed: “…”. Send sends it again; it won’t be written twice.» The room bar's message to the room
  ends the same way (`useRoomMessage`): «Not confirmed: “…”» with Try again.
- **The call:** offline, LiveKit gives up and its Disconnected says `dropped` (`livekit-room.ts`, now at 454-456), so
  the dock says «You were disconnected from the room.» Try again asks for a token. That fetch fails with status 0, and
  `joinMessage` (`useProjectRoom.ts`, now at 107-111) says «The room isn’t available right now. Try again in a
  moment.» The network coming back changes nothing.
- **Against the report's main (787c28fc4):** only line numbers moved. Every claim holds today.

## What changes

- **The words:** `online.ts` keeps the hook and gains the work side's line, as `useSlow.ts` keeps `SLOW_NOTE`:
  «You’re offline, so this wasn’t sent. It waits here; send it once you’re back.» `call-end.ts` gains the call's two
  lines and `noteFor(note, online)`, which decides what the room's note says as the connection stands. Offline, a
  lost call's note says «You’re offline, so the call ended here. Join again once you’re back.» Online, that note says
  «You’re back online. Try again rejoins the call.» Every other note stays as it is. `noteRole` makes these two polite
  (`status`); the dock's other notes stay alerts.
- **The conversation's composer:** while offline, once the conversation has been read, its line says the offline
  words. They replace «Not confirmed» or a refusal, before any press, with role `status`. Send waits (`aria-disabled`).
  Enter and the quick asks send nothing, and the quick asks step aside as they do while words are written. Back online,
  the line it had comes back: a held message's «Not confirmed», sent again by Send under its key.
- **The room bar:** while offline, its line says the offline words, with no Try again, and Send waits for either
  target. The line is said once: when the chat's foot already says the call ended offline, the bar adds nothing.
- **The room:** a call lost while offline keeps the offline note. Every place that reads the room's note (the dock,
  the mini dock, the chat's foot, the panel's line) shows the note as `noteFor` reads it with `useOnline`. When the
  online event fires, the note becomes the way back. Offline, a join after a lost call (Try again, Chat with Sophia)
  asks for no token, since it could reach nothing, and the note stays offline.
- **How often:** status lines only. No toast, nothing remembered. Only a `false` counts: a `true` proves nothing, so
  online everything reads as today.

## Checks (written first)

- **Unit** (`call-end.test.ts`): offline, a lost call says the offline line; online, that line becomes the way back;
  online, a lost call's note stays; the other ends, a join's refusal and no note keep their words offline; the two
  offline notes are polite and the rest are alerts.
- **Browser, the conversation** (`project-conversation-writes.spec.ts`, `send=lost`): offline, the line says the
  offline words with role `status` and Send is `aria-disabled`. Enter writes nothing (`conversation-message` stays
  `[]`) and «Not confirmed» never shows. Back online, the line goes. Enter: the fixture loses this first reply, so
  «Not confirmed» shows and the offline line doesn't. Send then lists exactly one message, written once.
- **Browser, the room bar** (`room-discussion.spec.ts`, `call=on&people=2&floor=1`): offline, the bar's line says the
  offline words, Enter sends nothing to the room and «Not confirmed» never shows. Back online, the line goes and Enter
  records one message.
- **Browser, the call** (`room.spec.ts`, `call=on`): offline, then `window.fixture.drop()`, the dock says the offline
  note with role `status`. Try again connects nothing and never says «The room isn’t available». Back online, the
  note says «You’re back online. Try again rejoins the call.», and Try again rejoins.

## Limits

- A Join pressed offline with no call lost before it (the dock at rest) goes as today. Its token request fails and
  the dock says «The room isn’t available…». The seam names no line for that moment.
- Offline means `navigator.onLine` only. Behind a captive portal the browser reads online (costuras, «Qué falta» 7).
- Words typed to Sophia go over the call's data channel. Offline, LiveKit reconnects and then drops, so Send waits
  either way, and the room's note is what speaks.
