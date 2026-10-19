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
- **The decision is pure:** `joinHeld({ online, lost, inCall })` says what a join pressed now says instead of asking.
  Online, nothing (it goes). In the call, or on the way into it, nothing: the call answers it (see «After review»).
  Offline after a lost call, the lost call's line, as today. Offline from rest, the new line. `joinOnline` asks it
  before any token, so the dock never says «Joining…» and the button keeps its words.
- **The line is the polite one #467 added.** `noteRole` makes it `status`, so the dock and the mini dock say it from
  the line that is mounted, empty, before any press (`DockNote`). It is never an alert and never takes the focus. The
  blocked-sound line beside it (#468) is untouched.
- **Back online, the line goes:** `noteFor` reads it as nothing once `useOnline` turns true. No join begins on its own;
  the next press joins.
- **A join that began online and failed offline** says the new line too (`keptNote`), as a lost call's does since
  #467: offline, «The room isn’t available» would be the same false claim. The ends the server said before the network
  went (another tab, taken out, the room closed) keep their words.
- **Said once, where nothing of its own is lost:** beside the new line, an empty message bar adds no «Your words wait
  here». A held message and words written keep their own lines (`offlineBarWords`; see «After review»).

## Checks (written first)

- **Unit** (`call-end.test.ts`): `joinHeld` offline from rest says the new line, after a lost call the lost call's
  line, and online nothing either way. `noteFor` keeps the new line offline and reads nothing back online. `noteRole`
  says it politely. `keptNote` offline with no call lost turns a failed join into the new line and keeps the three ends
  as said (the old «kept as said» assertion is inverted).
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

## After review (2026-10-19)

- **P1, Chat with Sophia pressed offline inside the call was held (the same finding twice, P1 and P2), real:** with
  Sophia out of the conversation, Chat with Sophia shows in the call. Offline with no call lost, `joinHeld` held it
  before `joinConnection` could answer «already in». The dock and the chat's foot told someone in the call to «Join
  once you’re back», and `startChat` put text mode back with the microphone silenced. #467's fence never fired in a
  call, since `lost` is false there. `joinHeld` now takes `inCall`: `useRoomNote` passes
  `calls.current !== null || joining.current !== null`, so a join in the call, or with one on the way in, goes to the
  call. Checks: unit, every `online` × `lost` with `inCall` gives nothing. Browser (`room.spec.ts`, `call=on`): offline,
  Chat with Sophia leaves no offline line in the dock (its polite line, marked before, stays empty) or the foot, asks
  for no second token, keeps Leave, and leaves text mode on.
- **P2, the held message lost Luis's words after a Join from rest, real:** `useFootWords` treated the new line like the
  lost call's, so a held message turned into «Not confirmed: “…”», the option Luis set aside, and words written lost
  their «wasn’t sent» line. The rule is now one pure function beside the bar's target rules,
  `offlineBarWords(field, words, roomNote)` (`discussion-view.ts`). Under the lost call's line, #467's rule stands.
  Under the Join from rest's line, only an empty bar's «Your words wait here» steps aside, and the held message and
  words written keep their lines. `saysOffline` is gone with the rule it carried. Checks: unit for no note, the new
  line and the lost call's line, for a held message, words written, an empty bar and one on its way. Browser
  (`room-discussion.spec.ts`, at rest): a message held with no reply, offline, then Chat with Sophia. The foot holds
  «You’re offline. Join once you’re back.» and the held message's chosen words, and never «Not confirmed».
- **P2, Work's Join the room before the project loads, real:** offline, a project whose snapshot this page hasn't read
  can't load (its read pauses), so `askedJoin` said `wait`. Nothing was said, the request stood, and once the network
  came back the project loaded and the room joined with no press. `askedJoin(status, ready, online)` now waits only
  online: offline it joins at once, and that join asks for nothing and says the new line. `useJoinOnOpen` reads
  `useOnline`. Checks: unit, offline and not loaded, it joins. Browser (`room.spec.ts`, `call=on&snapshot=hold`, the
  fixture now able to hold the snapshot read): offline, the dock's polite line says the new words and no token is
  asked. Back online with the project loaded, the line goes and nothing joins until Join is pressed.
