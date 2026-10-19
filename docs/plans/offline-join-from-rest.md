# A Join pressed offline says offline

> 2026-10-19 · Luis: «Pon tus sugerencias a esas preguntas», answering the three questions asked after #467 (costuras
> seam #8, `offline-work-side.md`). The first is built here: the Join from rest that note's Limits left open. The other
> two are recorded as decided in their own notes, with no code. Studio only, no API, one PR.

## Measured

- **The fence follows a lost call only.** `useRoomNote` (`useProjectRoom.ts`, 591-613) wraps every join in
  `joinOnline`, which asks for nothing only when `!navigator.onLine && lost.current`. From rest, offline, the join goes
  on: the dock says «Joining…», the token request throws, `callApi` turns that into an `ApiError` with status 0
  (`api/client.ts`, 330), and `joinMessage` says «The room isn’t available right now. Try again in a moment.» as an
  alert. The button turns to Try again, and every Try again offline does the same.
- **`keptNote` keeps that note as said** with no call lost (`call-end.ts`, 56-59), and its unit check says so: «offline
  with no call lost (a Join from rest), the note is kept as said».
- **Every Join goes through that fence.** The dock's Join and the check sheet's Join (`RoomDock.tsx`, 205 and 223), the
  header's mini dock (`MiniDock.tsx`, 120), Work's Join the room and a toast's Rejoin (`useJoinOnOpen`,
  `ProjectShell.tsx`, 259), the join key (`RoomStage.tsx`, 200), Talk it through (`StudioShell.tsx`, 116) and Chat with
  Sophia (`chat-start.ts`, 26) all call `room.join`, which is `joinOnline(joined.join)`.
- **The fixture records no token request.** `tokenAnswer` (`fixtures/fixture-api.ts`, 472) answers without a trace, and
  the fixture's fetch ignores `setOffline`, so a join let through offline gets a token and connects.
- **Chat with Sophia offline says offline twice.** At rest, offline, the message bar's own line says «You’re offline.
  Your words wait here.» (`useFootWords`, `Composer.tsx`). It steps aside only when the room's note is the lost call's
  (`OFFLINE_END`), so a second offline note above it would stand beside it.

## What changes

- **The words** (`call-end.ts`): `OFFLINE_JOIN`, «You’re offline. Join once you’re back.» It is said only for a join
  asked offline with no call lost. #467's two lines keep their words exactly: «You’re offline, so the call ended here.
  Join again once you’re back.» and, back online, «You’re back online. Try again rejoins the call.»
- **The decision is pure:** `joinHeld({ online, lost })` says what a join pressed now says instead of asking. Online,
  nothing (it goes). Offline after a lost call, the lost call's line, as today. Offline from rest, the new line.
  `joinOnline` asks it before any token, so the dock never says «Joining…» and the button keeps its words.
- **The line is the polite one #467 added.** `noteRole` makes it `status`, so the dock and the mini dock say it from
  the line that is mounted, empty, before any press (`DockNote`). It is never an alert and never takes the focus. The
  blocked-sound line beside it (#468) is untouched.
- **Back online, the line goes:** `noteFor` reads it as nothing once `useOnline` turns true. No join begins on its own;
  the next press joins.
- **A join that began online and failed offline** says the new line too (`keptNote`), as a lost call's does since
  #467: offline, «The room isn’t available» would be the same false claim. The ends the server said before the network
  went (another tab, taken out, the room closed) keep their words.
- **Said once:** `saysOffline` tells the room's two offline notes. When the room's note says either, the message bar
  adds no offline line of its own (`useFootWords`), as it already does for the lost call.

## Checks (written first)

- **Unit** (`call-end.test.ts`): `joinHeld` offline from rest says the new line, after a lost call the lost call's
  line, and online nothing either way. `noteFor` keeps the new line offline and reads nothing back online. `noteRole`
  says it politely. `keptNote` offline with no call lost turns a failed join into the new line and keeps the three ends
  as said (the old «kept as said» assertion is inverted). `saysOffline` is true for both offline notes and false for
  «You’re back online» and the rest.
- **The fixture** records each room token asked for (`served`: `room-token`).
- **Browser, the dock** (`room.spec.ts`, `room.html`, not in a call): the dock's polite line is there, empty. Offline,
  Join asks for no token and connects nothing. The line says the new words with role `status`, there is no alert, Join
  keeps its words and the focus. Back online, the line is empty again and nothing joined. Join then asks for one token
  and gets in.
- **Browser, the header** (`room.spec.ts`, `place=work`): the mini dock's Join offline asks for nothing, and its polite
  line, there before, says the new words.
- **Browser, Chat with Sophia** (`room.spec.ts`, the Chat panel at rest): offline, the foot first says the bar's line.
  Chat with Sophia asks for no token and leaves text mode as it was. The foot then holds one line, the new words. Back
  online, the foot says nothing, and Chat with Sophia gets in, typing.

## Limits

- Offline again before any join, the line comes back: the join it answered still hasn't happened. The lost call's
  lines move with the connection the same way.
- Offline means `navigator.onLine` only, as in #467. Behind a captive portal the browser reads online, and a join goes
  as today.
- A refusal the server sent just before the network went is said as the new line if the browser reads offline by the
  time it lands. The next press, online, hears the refusal again.
