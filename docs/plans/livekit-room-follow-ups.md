# Room: follow-ups to #424 and #425 in `livekit-room.ts`

> 2026-10-18 · Codex's P2 on #424 («Honor the latest incoming-video toggle») and a leak measured on the real stack on
> 2026-10-17. Studio only; nothing on screen changes.

## What changes

**«Show others’ cameras» goes by what was asked, not by what is here** (`incoming-cameras.ts`). LiveKit's
`isSubscribed` is true once a track is here; `isDesired` changes the moment `setSubscribed` is called. The switch
compared with `isSubscribed`, so:

- **On, then Off before the cameras came back:** Off saw them «not here» and asked nothing. They came anyway, with the
  switch at Off.
- **A camera published while the switch is Off:** LiveKit asks for it on its own (auto-subscribe), and it isn't here
  yet, so the switch let it be taken.

Codex's other order, Off then On before the cameras have gone, doesn't happen with livekit-client 2.22.3:
`isSubscribed` reads false the moment Off is asked. A unit keeps it so. People-volume follows the same rule (Codex P1
on #425).

**The room's audio elements leave the page with their track** (`audio-elements.ts`). LiveKit detaches a track's
elements before it emits `TrackUnsubscribed` (`RemoteTrackPublication.setTrack`, 2.22.3). So the handler's
`track.detach()` found none, and each of Sophia's exchanges left an empty `<audio>` in the page until the call ended. A
member's sound left one too, when they left or stopped their screen's sound. The room now keeps its elements by track
and removes them, whatever `detach()` returns.

**Every element starts at full.** LiveKit reuses a removed audio element for the next track (iOS remembers which
elements a press allowed). It keeps the volume the element had. A member set to Off (since #425), or now one at 25%
who leaves, could give Sophia's next exchange their element: silent, or at 25%. A member's own level is still put on
their element after.

## Checks (written first)

- **`incoming-cameras.test.ts`**, with a publication shaped like LiveKit's (asked at once, here later):
  - Off lets each camera go and On takes them back; a screen always comes;
  - On before the cameras have gone takes them back (Codex's order);
  - Off before they came back lets them go (the inverse order);
  - a camera published while Off isn't taken, though LiveKit has asked for it; one published while On is LiveKit's.
- **`audio-elements.test.ts`**, with a track shaped like LiveKit's (it lets go of its elements, then says it's gone;
  removed audio elements are reused):
  - Sophia's element and a member's leave the page with their track;
  - text mode's detach still takes the element out, and LiveKit lets it go;
  - an element reused after Off plays at full;
  - the call's end removes every element of this room's.
- **Browser:** the fixture's LiveKit stand-in replaces `livekit-room.ts`, so its specs only show that nothing else
  moved: `incoming-video.spec.ts`, `people-volume.spec.ts`, `voice-chat.spec.ts`, `room.spec.ts`. On the real stack,
  after Sophia's exchange ends, `document.querySelectorAll('audio[data-sophia-room-audio]')` counts only what plays.

## Not here

- The fixture's stand-in keeps its own bookkeeping; it has no audio elements.
