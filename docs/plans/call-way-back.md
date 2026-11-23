# The way back into a call, and back from a slip at the door

> 2026-11-23 · Independent evaluation of `df4b4a518` (`evaluacion-2026-11-22/mejoras-ui.md`, improvements 4 and 20).
> Luis: «Yes, batch D». Studio only, no API change. Read beside `call-rejoin.md`: nothing here joins on its own.

## Measured

- **A reload in the call (4).** In the call on the rehearse dev stack, F5: 640 ms later the stage said «The room is
  ready» over «Join the room», as if the person had never been in; no word of the call they were in, nor in the
  partner's view. The same for an address of the project typed into the bar. The rejoin state lives in memory only
  (`useProjectRoom.ts`), and LiveKit leaves the room itself as the page goes (`CLIENT_INITIATED`, `selfLeft`), which
  `call-rejoin.md` excludes from any try on purpose.
- **«Let in instead» (20)** stood 8 s after a Decline (`UNDO_MS`), while the declined guest may ask again only a
  minute on (A03, `knock_room`): for 52 of those 60 s a slip couldn't be taken back from the door.

## What changes

- **A reload in the call offers the way back, in one press** (`reload-mark.ts` with tests, `useReloadOffer.ts`).
  - As the page goes (`beforeunload`, and `pagehide` where there is none) while the dock reads the call live or
    reconnecting, the tab notes the project, the account, when, and the microphone and camera as they were
    (`sessionStorage`: this tab only), and whether this person was typing to Sophia. LiveKit adds its own listeners as
    it connects and leaves asynchronously, and React commits nothing between listeners, so the note reads the call as
    it was. A page kept for Back (`pagehide` with `persisted`) didn't go: it writes nothing, and a note is taken back
    when such a page shows again.
  - As the page comes back, the note is read once (and taken out of storage; kept for this page in memory, since the
    dock mounts more than once while the project loads). For this project and this account, within the dropped call's
    own window (`REJOIN_WINDOW_MS`, two minutes), the dock says politely «You were in the call before the page
    reloaded.» from a line there before it speaks (its words come after the line is in the page), and Join goes back
    as the call was: the microphone it had, never on unless this device's own choice is (the join's existing cut,
    `call-rejoin.md`), typing to Sophia if it was; the camera comes back off, as after Try again. The offer goes when
    the window closes.
  - **Nothing joins on its own.** A reload must not turn on a microphone, nor take the call from another tab of the
    same person (LiveKit's DUPLICATE_IDENTITY): the press is theirs. Back in, by this offer or any other way, the
    offer is spent.
  - Leave first, and the page goes out of any call: no note. Each tab keeps its own: another tab of the same person is
    never offered this tab's call, so two tabs can't take it back and forth.
- **«Let in instead» stands while the decline holds** (`lobby-undo.ts` with tests, `LobbyPanel`): until the guest's
  minute is up, or they ask again (another knock), leave (gone from the lobby the API reads), or are let in or blocked.
  A decline on its way (the lobby not read again yet) stands. The declined guest's row leaves the waiting list at
  once, and comes back if they ask again, or if the Decline doesn't go through (`useLobbyDecision`'s `decide` now
  says whether every answer went). The fixture now lists a declined guest as the API does (`readLobby` keeps
  denied entries for a day).

## Words

| Where | Words | Alternative |
| --- | --- | --- |
| The dock, after a reload in the call | «You were in the call before the page reloaded.» | «The page reloaded during the call. Join to go back.» |

«Declined Carla. They can ask again in a minute. Let in instead» is unchanged; it now stays that minute.

## Checks

- `reload-mark.test.ts`: offered back as it was, for its project and account, while recent; nothing for another
  project, account, a stale note or a clock set back; nothing from what isn't a note; a microphone never read as on
  unless it was.
- `lobby-undo.test.ts`: stands through the minute, read or on its way; goes at the minute, on another knock, when they
  leave, are let in or blocked; the next expiry.
- `e2e/call-way-back.spec.ts` (room fixture): a reload in the call says the line, nothing joins, Join goes back and
  the line goes, and a later reload outside the call offers nothing; Leave then reload offers nothing; another page of
  the same browser is never offered it.
- `e2e/arrival-since.spec.ts`: the offer stands 30 s on (Playwright's clock), and goes past the minute.
- On the dev stack (:5176): in the call, F5 → the line and Join; Join → back in with the microphone off as it was,
  the line gone; Leave then F5 → nothing.

- One independent review of the whole diff before the push: no P1; four P2s (a Decline that failed hid the guest for
  a minute; the offer never expired; the camera came back on unsaid; text mode lost) and P3s (the line born full, a
  page kept for Back, the undo's timer), fixed. Playwright after the fixes was refused by the guard for RAM; the run
  before them passed `call-way-back` (3) and the rest but `arrival-since`, whose fixture now lists a declined guest as
  the API does.

## Left

- **A reload right after pressing Leave** can still note the call: Leave waits for the call to end before the room
  reads out of it. The offer is only an offer.
- **Joins from elsewhere** (the mini dock, the palette, the room key) don't carry the offer: they join by this device's
  choice, as before.

- **The partner isn't told** that someone reloaded: LiveKit sees a leave and a join.
- **A reload on another view** (Goals, Tasks) offers nothing until the Studio view shows: the offer lives in the
  room's dock. The header's mini dock could carry it.
- **Safari's back-forward cache** may restore a page without reloading it: the note is written as it goes, and read
  only by a page that loads; a restored page reads nothing and offers nothing.
