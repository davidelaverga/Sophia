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

- **The words:** `online.ts` keeps the hook and the words a field says offline, as `useSlow.ts` keeps `SLOW_NOTE`.
  `offlineWords` picks them, so a line never claims what it doesn't know:
  - words written: «You’re offline, so this wasn’t sent. It waits here; send it once you’re back.»
  - an empty field: Personal's own line, «You’re offline. Your words wait here.» (`OFFLINE_WAITS`, moved here from
    `PersonalComposer.tsx`, which reads it from here unchanged);
  - a message held with no reply, which may have landed: «You’re offline, so “…” isn’t confirmed. Send it again once
    you’re back; it won’t be written twice.»;
  - a message on its way: nothing of its own; how it ends is said when it does.

  `call-end.ts` gains the call's two lines and `noteFor(note, online)`, which decides what the room's note says as the
  connection stands. Offline, a lost call's note says «You’re offline, so the call ended here. Join again once you’re
  back.» Online, that note says «You’re back online. Try again rejoins the call.» Every other note stays as it is.
  `noteRole` makes these two polite (`status`); the dock's other notes stay alerts.
- **The conversation's composer:** while offline, once the conversation has been read, its line says what waits. It
  replaces «Not confirmed» or a refusal, before any press, with role `status`. Send waits (`aria-disabled`). Enter and
  the quick asks send nothing, and the quick asks step aside as they do while words are written. Back online, the line
  it had comes back: a held message's «Not confirmed», sent again by Send under its key.
- **The room bar:** while offline, its line says what waits, with no Try again, and Send waits for either target. The
  cause is said once: when the chat's foot already says the call ended offline, the bar adds no line of its own, and of
  a held message says only «Not confirmed: “…”», without Try again.
- **The room:** a call lost while offline keeps the offline note. Every place that reads the room's note (the dock,
  the mini dock, the chat's foot, the panel's line) shows the note as `noteFor` reads it with `useOnline`. When the
  online event fires, the note becomes the way back. The call stays lost until a join gets back in. Offline meanwhile,
  a join (Try again, Chat with Sophia) asks for no token, since it could reach nothing, and a join that fails offline
  keeps the offline note (`keptNote`), whatever an earlier try online said.
- **Heard:** the polite lines (the dock's two, the mini dock's, the conversation's offline line) speak from a
  `role=status` line that is in the page before its words come, out of sight while empty: a live region added with its
  words is often not read. A failure stays an alert, added with its words, as before.
- **How often:** status lines only. No toast, nothing remembered. Only a `false` counts: a `true` proves nothing, so
  online everything reads as today.

## Checks (written first)

- **Unit** (`call-end.test.ts`): offline, a lost call says the offline line; online, that line becomes the way back;
  online, a lost call's note stays; the other ends, a join's refusal and no note keep their words offline; the two
  offline notes are polite and the rest are alerts. `keptNote`: offline, a join after a lost call that fails keeps the
  offline note; online, or with no call lost, a note is kept as said.
- **Unit** (`online.test.ts`): `offlineWords` for an empty field (Personal's line), words written, a held message (not
  confirmed, never «wasn’t sent») and one on its way (nothing).
- **Browser, the conversation** (`project-conversation-writes.spec.ts`, `send=lost`): offline, the line says the
  offline words with role `status` and Send is `aria-disabled`. Enter writes nothing (`conversation-message` stays
  `[]`) and «Not confirmed» never shows. Back online, the line goes. Enter: the fixture loses this first reply, so
  «Not confirmed» shows and the offline line doesn't. Send then lists exactly one message, written once. After a
  message went, the empty field offline says Personal's line, from a status line that was there before. A message held
  with no reply says it isn't confirmed offline; nothing more is written, and back online Send sends it once.
- **Browser, the room bar** (`room-discussion.spec.ts`, `call=on&people=2&floor=1`): offline, the bar's line says the
  offline words, Enter sends nothing to the room and «Not confirmed» never shows. Back online, the line goes and Enter
  records one message. An empty bar offline says Personal's line; a held message says it isn't confirmed, with no Try
  again, and back online Try again records it once.
- **Browser, the call** (`room.spec.ts`, `call=on`): offline, then `window.fixture.drop()`, the dock says the offline
  note with role `status`. Try again connects nothing and never says «The room isn’t available». Back online, the
  note says «You’re back online. Try again rejoins the call.», and Try again rejoins. After a rejoin that failed
  online (`failToken`), Try again offline still asks nothing and says offline. The polite line is in the dock and the
  header's mini dock, empty, before the drop, and that same line says the offline note.

## Limits

- A Join pressed offline with no call lost before it (the dock at rest) goes as today. Its token request fails and
  the dock says «The room isn’t available…», and so does its Try again while offline. The seam names no line for that
  moment: Luis to choose one («the call ended here» would be wrong, since none began).
- Offline means `navigator.onLine` only. Behind a captive portal the browser reads online (costuras, «Qué falta» 7).
- Words typed to Sophia go over the call's data channel. Offline, LiveKit reconnects and then drops, so Send waits
  either way, and the room's note is what speaks.
- The room bar's line is a `role=status` added with its words, as its «Not confirmed» line already was before this
  change. Only the lines this change turned from alerts into status lines speak from a line there before.

## After review (2026-10-18)

- **P1, an empty field said «this wasn’t sent»:** with nothing written or held, the line now says Personal's line.
  `offlineWords` decides, and the checks send a message first, then go offline at the empty field.
- **P2, a held message offline was called unsent:** it may have landed (`send=lost` and `loseNextContributionReply`
  model exactly that), so the line says it isn't confirmed and won't be written twice. Checked in the conversation and
  the room bar: offline, nothing goes and nothing is recorded twice; back online, «Not confirmed» returns and one press
  sends it once. These words are a choice for Luis. The other one offered was to keep «Not confirmed» with Send
  waiting.
- **P2, the fence read the note's words:** a rejoin that failed online wrote «The room isn’t available», and from then
  on Try again offline asked for a token. The fence now follows the lost call (a ref, cleared when a join gets back
  in), and a join that fails offline keeps the offline note (`keptNote`). The fixture's fetch ignores `setOffline`, so
  the browser check fails a rejoin online with `failToken`, then arms it again offline: a token asked for would say «The
  room isn’t available». The race itself (a join that begins online and fails offline) is the unit check.
- **P2, the dropped note might not be heard:** see «Heard» above. The browser checks mark the empty status line before
  the drop, then find the offline words in that same line, in the dock and in the header's mini dock.

## Decided (2026-10-19)

- **A message held with no reply, offline, keeps these words** (Luis 2026-10-19: «Pon tus sugerencias a esas
  preguntas»): «You’re offline, so “…” isn’t confirmed. Send it again once you’re back; it won’t be written twice.» The
  other option, «Not confirmed» with Send waiting, is set aside. No code changes.
