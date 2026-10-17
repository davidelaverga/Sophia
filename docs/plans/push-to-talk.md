# Push to talk: hold Space while muted

> 2026-10-16 · Luis's QoL queue, item 2. Meet, Zoom and Teams let a muted person hold Space to speak for a moment and
> fall silent when they let go. In the Studio, a muted person has to unmute and remember to mute again. Studio only.

## What changes

- **`push-to-talk.ts`** (pure) decides, from a key and the call's state, whether Space starts talking, stops,
  is swallowed or is left alone. Talking starts only when all of these hold:
  - the key is Space, alone, not a repeat;
  - the focus is on nothing (the page itself). A button, a field or a link keeps its own Space;
  - no modal sheet is open;
  - the microphone is off.

  While talking, repeats are swallowed (the page doesn't scroll). Letting go stops, and so does leaving the window,
  because a keyup can be lost.
- **`usePushToTalk`**, in the Studio's room dock only (another view's Space scrolls its page), listens in the capture
  phase. It turns the microphone on, and off again on release.
- **The dock says it:**
  - while held, «Talking. Let go of Space to mute again.» (`role="status"`);
  - the muted hint now offers it: «You're muted. Hold Space to talk, or turn the microphone on.»
- **Stray typing:** Space from nowhere used to start the chat's field. A key already taken, as push to talk takes it,
  no longer moves the focus there (`shortcuts.ts`).

## Checks

- **`push-to-talk.test.ts`:** starts only from nowhere, with the mic off, Space alone, no modal; repeats are
  swallowed while talking; release stops.
- **`push-to-talk.spec.ts`:**
  - muted, holding Space turns the microphone on and says so, and letting go turns it off;
  - with the focus in the chat's field, Space types and the microphone stays off;
  - with the microphone on, Space changes nothing;
  - the window losing focus while held mutes again.
- **`muted-speech.spec.ts`:** the hint's new words.
