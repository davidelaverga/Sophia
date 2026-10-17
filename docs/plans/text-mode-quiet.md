# Text mode stays quiet

> 2026-10-17 · a fault found while building each person's volume (#424's branch). In text mode Sophia is read, not
> heard, and her voice was silenced by muting its element. LiveKit's `startAudio` unmutes every element it has, so her
> voice came back in text mode. Studio only.

## When it happened

- **On the dock's «Allow audio»** (the browser blocked sound until a press), pressed while the call is in text mode.
- **On iPhone and iPad, each time the page shows again** once `startAudio` has run there: LiveKit calls it itself
  (`Room.startAudio`, livekit-client 2.22.3, the `visibilitychange` listener on its silent element).

## What changes

- **In text mode her voice has no element to play in:** her tracks are detached, and their elements leave the page.
  LiveKit has nothing of hers to unmute.
- **Leaving text mode** attaches them again.
- **A track of hers that arrives in text mode** waits, unattached, until text mode ends.
- **Her tracks stay subscribed.** Her signal reads the track, its mute state and LiveKit's speaking flag, never the
  element, so «Sophia is speaking» still shows true.
- **The people's voices** are untouched.

## Checks

- **`sophia-voice.test.ts`:**
  - heard, a track that arrives plays;
  - read, it waits, and plays when text mode ends;
  - entering text mode detaches what plays;
  - the same mode twice does nothing;
  - a track that left while read doesn't come back.
- The fixture's connection stands in for LiveKit in the browser checks, so this is the unit check's to prove. The
  room's text-mode specs show that nothing else moved.
