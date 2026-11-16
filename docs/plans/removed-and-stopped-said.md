# Removed mid-call, and a screen an admin stopped, said once

> 2026-11-16 · `evaluacion-2026-11-16/textos-lote-18.md` items 3 and 5 (costuras: what the system knows and keeps
> quiet), lines approved by Luis 2026-11-16 («aprobados»), in English as written. Studio only, no API. Read beside
> [signed-out-elsewhere](signed-out-elsewhere.md) (said once, polite, never focused) and
> [host-more](host-more.md) (A31).

## Read first (`origin/main` `9495c87fc`)

- **Removed from the project mid-call.** `ProjectShell.tsx`'s `useLeaveBehindClosedDoor` (`:84-92`) leaves the call
  when the door closes (`expired` or `denied`), and `AccessNotice` (`:1036-1072`) then shows only «No access to this
  project» with «<name> isn't a member. Ask a project admin to add you, or open another project.». Nothing says a call
  was on: the call ends behind the notice in silence. Confirmed in the room fixture: `call=on`, then `shutDoor()`.
- Two orders reach that notice in the real stack: the API's `removeMember` (A29, `routes/activity.ts`) also takes the
  person out of the LiveKit room, so either the snapshot's 403 comes first (the call still live, and the shell leaves
  it) or LiveKit's removal does (the room already ended with `removed`, «You were taken out of the call.», a note the
  notice hides, since no dock shows behind a closed door).
- **An admin stops your screen.** `livekit-room.ts`'s `stopsWhenHostStops` (`:247-257`): the server can only mute a
  share (`mutePublishedTrack`, A31), so a `TrackMuted` on this person's own `ScreenShare` publication turns sharing off
  here. Nothing is said. That event is the host's alone: the person's own Stop sharing and the browser's «Stop sharing»
  bar unpublish the track (livekit-client 2.22.3, `handleTrackEnded` unpublishes a screen share; it never mutes it), and
  the Studio never mutes a screen itself.
- The room has no toast of its own: `Toast` lives in `SignedIn`, and its own rule is that a result whose place is on
  screen is said there. The share's place is the dock, whose note (`mediaError ?? error`, `DockNote`) already says
  device notes, politely for the lines `noteRole` lists (a `role=status` there before the words, never focused).

## What changes

- **Removed mid-call** (`project-door.ts`, `ProjectShell.tsx`): as the door closes as `denied`, the shell reads the
  room once, before its leave: a call here live, reconnecting or trying back in, or one the server just took this
  person out of (the room's note is `removed`'s). Only then does the notice add, under its body, as `role=status`
  (never focused, no press of its own):
  - «Your call here ended when you were removed from the project.»
  A plain visit to a project this person isn't in, a sign-out (`expired`) and an unreachable project say nothing new.
- **A screen an admin stopped** (`livekit-room.ts`, `useProjectRoom.ts`, `call-end.ts`): `stopsWhenHostStops` also
  tells the room (`onHostStoppedScreen`), which puts the line in the dock's note, said politely:
  - «An admin stopped your screen share.»
  It goes as device notes go: with the next device change that works (sharing again, say) or the call's end. The
  places bar, which shows the call's note from Personal, says it with the same role (`noteRole`).

## Limits

- The removed line reads the room as the door closes. A call taken out by the server long before (an admin's «Remove
  from call», still a member) whose note still stands when the person is later removed from the project would say it
  too; the note goes with any join or leave, so that window is short in practice.
- The line is the notice's: a reload, with nothing of the call left, shows the plain notice.
- The screen line stays in the dock until a device works or the call ends, as every device note does; it is not timed.

## Checks (written first)

- `e2e/removed-mid-call.spec.ts`, on `room.html`: in a call, the door shuts (`shutDoor`): the notice, the line as
  `role=status`, not focused, and the call left. The server takes the person out first (`drop('removed')`), then the
  door shuts: the line too. Out of a call, the door shuts: the plain notice, no line.
- `e2e/host-stopped-screen.spec.ts`, on `room.html` with a new lever `window.fixture.screenStoppedByHost` (the fixture's
  LiveKit stops the share as the Studio's does and tells the room) and `screenEndedInBrowser` (the browser's bar: the
  share unpublished, nothing told): sharing, an admin stops it: the toggle reads «Share your screen» and the dock says
  the line as `role=status`, once; the person's own Stop sharing and the browser's bar say nothing.
- Unit: `project-door.test.ts` (`callEndedByRemoval`), `call-end.test.ts` (the line is polite).
