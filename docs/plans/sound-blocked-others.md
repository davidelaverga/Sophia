# The dock says when the browser blocked the call's sound, whoever speaks

> 2026-10-19 · seam #6 of `evaluacion-2026-10-18/experiencia/costuras.md` (judge's adjustment: said when the call is
> live with others, never the moment someone speaks). Luis 2026-10-18: «Todo trabajo nuevo que hagas ten en cuenta
> nuestro cuello de botella actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay
> que seguir trabajando». Studio only; no API. On `origin/main` e395d63ea (#466: the orb keeps still while
> reconnecting with a blocked sound).

## Measured (today's code; the report read 787c28fc4)

- **The browser's block is known:** `livekit-room.ts` listens to `AudioPlaybackStatusChanged` (in `CHANGES`, ~252)
  and reads `audioBlocked: !room.canPlaybackAudio` (485); `startAudio` (487) runs LiveKit's, which plays every
  attached element at once. The report's 480/481 moved by five lines. `useProjectRoom.ts` reads it into the room
  (585, not 552).
- **Only Sophia's voice says it:** `sophia-view.ts`'s `speakingView` (107-117, not 90-98) sets `needsAudio` only while
  her output is `playing`; since #466 it also stays over a reconnect, and `lightSound` keeps her rim still meanwhile.
  `SophiaControls.tsx` (152-158) draws the one Allow audio from it, through `RoomDock.tsx:307`.
- **When colleagues speak and she doesn't, nothing:** their tile lights (LiveKit's active speakers come from the
  server's levels, not this browser's playback) and no sound arrives.
- **Why «with someone else in it»:** livekit-client 2.22.3 can set `canPlaybackAudio` false as the call connects (an
  AudioContext still suspended, as iOS makes them) or when the first remote sound fails to play. Alone there is nothing
  to hear.
- **The fixture:** `sophia=blocked` blocks the sound only while Sophia speaks into it; the fake's `startAudio` lets her
  through but isn't recorded in `asked`.
- **Where a choice for one call lives:** the room controller (`useCallChoices`: each person's volume, others'
  cameras), reset when the call ends. The stage and its dock mount again on every visit to another view, so a memory
  kept there would forget a dismissal within the same call.

## What changes

- **The line:** «This browser blocked the call’s sound.» then `Allow audio` and `Not now`, in the dock's notes, as soon
  as the call is live (or coming back) with someone else in it and `audioBlocked` holds. It is a polite status
  (`role=status`) mounted with the dock, empty and out of the layout until it has words, so its words are announced
  when they come. It never takes the focus, and it blocks nothing.
- **Allow audio** runs the room's `startAudio` (one press, inside the press). The line goes once the sound plays.
- **Not now** puts it away for this call: the controller keeps that (`soundNoticeAway`, reset with the call's other
  choices), so a member speaking, the link coming back or a visit to another view brings nothing back. The next call
  starts fresh.
- **Both presses hand the focus to the call's anchor** (the microphone), as the meeting so far's Not now does: the
  control pressed goes with the line.
- **Gone when untrue:** the sound allowed, or nobody else left in the call. If the browser blocks the sound again in
  the same call without the line having been put away, the line says it again: it is the same silence, and Allow audio
  is still the only way out.
- **One Allow audio, never two: the dock's line holds it while it shows.** `soundView` (`sound-view.ts`, pure) decides
  the line and whether Sophia's own pill shows: hers only where the line doesn't (she is the only one who could be
  heard, or the line was put away). Why there:
  - the cause is the browser's block of the whole call's sound, which the line names; one `startAudio` lets her voice
    through too. Her pill names her case alone («Allow Sophia’s audio»);
  - the line stays while she starts and stops speaking; her pill comes and goes with each answer (`needsAudio` holds
    only while her output plays), so the one press there would jump between the line and her controls.
  Her stage line («Sophia is speaking, but this browser blocked the sound») and the call on her rim stay: they say what
  she does, and offer no press. `sophiaView` and `lightSound` don't change, so the orb's still-while-reconnecting rule
  holds.

## Checks, written first

- **Unit** (`sound-view.test.ts`): blocked, in the call, with others → the line, and her pill not offered even while
  she speaks into the block; alone → no line, her pill while she needs it; allowed → nothing; put away → no line, her
  pill back for her own case; reconnecting → the line stays; out of the call (idle, joining, failed) → nothing.
- **Browser** (`room-people.spec.ts`), with a new lever `sound=blocked` (`fake-people.ts`: the browser blocked the
  call's sound from the start, whoever speaks; no exchange open) and `window.fixture.blockSound()` (the block arriving
  in a call already live); the fake's `startAudio` records `audio:start`:
  - `sound=blocked&people=2`: the line as a status, one Allow audio, the focus untouched; pressed → `audio:start`
    recorded, the line gone, the focus on the microphone;
  - `people=2`, then `blockSound()`: the words arrive in the status already there;
  - Not now → a member speaking, the link lost and back, and Tasks and back bring nothing; Leave and Join again → said
    again;
  - `sophia=blocked&people=2`: one Allow audio, the dock's; her line still says she is blocked; one press → «Sophia is
    speaking» and the line gone;
  - controls: `sound=blocked` alone → nothing; `people=2` without the block → nothing. `sophia=blocked` alone keeps
    her pill (the existing check).

## Limits

- From another view the mini dock doesn't say it; back in the room the line is there (unless put away).
- Where the side panel covers the dock (760 px and below), the line waits under it, as the dock's other notes do; a
  screen reader still hears it.
- Whether a real browser reports `canPlaybackAudio` false while only colleagues speak was not observed here (the
  report's medium confidence): the fixture reports it, as LiveKit's event would.
