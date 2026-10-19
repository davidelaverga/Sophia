# Her orb: follow-ups to #462

> 2026-10-18 · Luis: «Que más podemos ir haciendo en lo qe esperamos. Ya que tenemos un cuello de botella». The four
> #462 entries at the end of `evaluacion-2026-10-16/seguimientos-p2.md` (two from Codex, one from the independent
> review of the slow-frames fix, one from Codex on Safari), under Luis's rule that P2s are fixed in follow-up PRs, not
> in the PR under review. Studio only; stacked on `group/paper-light` (#462).

## The gaps

1. **Below 20 frames a second her springs run slower than the clock** (`engine.ts:357`). Each frame's spring step is
   clamped to 0.05 s, so at 8 frames a second they run at 40 %. A result's bloom then peaks at 0.97 of her size and
   never shows. Her light takes 11 s to read 0.99 (13.5 s to read 0.9 at work) instead of 4.43 s (5.35 s). The checks
   that wait 8 s for it pass on CI only because the paper pages drew at least 18 frames a second there.
2. **A result arriving while the floor travels loses its bloom** (`engine.ts:383`, Codex). The floor's flight takes
   1.6 s, and while it lasts it holds the swell spring. The bloom's 0.9 s window starts on arrival, so by the landing
   it has run out unseen.
3. **Reconnecting while she speaks into a blocked sound, her orb keeps moving** (`theme.css:535`, Codex). Over a link
   coming back `sophiaView` makes her `joining` but keeps `needsAudio`. So the light carries both `data-presence=
   "joining"` and `data-sound="blocked"`. The blocked rule is as specific as joining's and comes later, so its
   `animation-play-state: running` wins: the orb that should wait gathered and still drifts, breathes and calls.
4. **In Safari the levels can stay at 0 after sound was allowed** (`voice-levels.ts:77`, Codex). The analysers'
   context is made on the first read. If someone speaks before any further press, that read comes outside a user
   activation. Safari keeps such a context suspended, and the room's sound is already allowed, so no
   `AudioPlaybackStatusChanged` comes to wake it. Her light and the meters read 0 until the next click or key.

## What changes

1. **`engine.ts`:** the springs step at most `STALL_S` (0.25 s) a frame. That is the bound `pace()` already uses to
   tell load from a stall, and `stepSpring` is exact for any step. A tab coming back still doesn't leap. The comments
   that said «about 4 s to within 1 %» now give the measured times (reading 0.99 takes 4.43 s, 0.9 at work 5.35 s).
   `motion.ts`'s «4.7 / omega to within 1 %» was the 5 % figure; from rest, 1 % takes 6.6 / omega.
2. **`engine.ts`:** while the floor is in flight, a bloom that hasn't finished waits for the landing and then plays
   whole. So the result still blooms once, after the floor has landed, as its own moment. Adding it to the flight's
   swell would make one larger swell out of two different events, or hide it behind the flight's peak.
3. **`sophia-view.ts`:** `lightSound(view)`: the call on her rim needs her to be here, speaking into a blocked sound.
   While the link comes back she is `joining` and the light carries no `data-sound`, so joining's rule holds her
   gathered and still. **Allow audio stays.** The block belongs to this browser (`room.canPlaybackAudio`), not to her
   stale signal, and a press during the reconnect still lets her sound play when the link is back. `RoomStage` reads
   `lightSound`; `theme.css` doesn't change.
4. **`voice-levels.ts`:** `wake()` makes the call's context if it isn't made yet, and resumes it. `connectRoom` calls
   it beside LiveKit's own context: as the room connects (LiveKit makes its context in `connect`), and within Allow
   audio's press (before `room.startAudio()`). Sound allowed (`AudioPlaybackStatusChanged`) wakes it too, made or not.
   Whatever lets the room's sound play now lets the levels run. Nothing is made after the call has ended.

## Checks (written first)

- **Unit:**
  - `engine.test.ts`, with a clock the test moves: at 8 frames a second her light on paper reads 0.99 within 4.6 s,
    and a result's bloom takes her past 1.03. A result arriving 0.5 s into a floor's flight takes her past 1.03 after
    the landing; before the change she stayed at 1.
  - `sophia-view.test.ts`: reconnecting while she speaks into a blocked sound: joining, Allow audio kept, no sound
    mark on her light; with the link live, the mark.
  - `voice-levels.test.ts`, with a tap maker that plays Safari's rule (a context made or resumed outside a press
    stays suspended and reads 0): a context made within the press reads a voice heard after it. One made before
    Allow audio is resumed within its press. Sound allowed before anyone spoke makes it then. Nothing is made after
    the call.
- **Browser:**
  - `orb-result.spec.ts`: the bloom check at 8 frames a second (`slowFramesFromNow`, once she is lit): peak ≥ 1.03,
    0.97 before the change. A result arriving early in a floor pass (`floor=me`, Pass to… Lucía) takes her past 1.03
    after the landing.
  - `paper-orb.spec.ts`: at 8 frames a second (`slowFrames`) her light on paper reads 0.99 within 8 s.
  - `orb-presence.spec.ts`: `sophia=blocked`, then `linkLost(true)`: joining, no sound mark, only her forming running
    (no drift, breath or call), Allow audio still offered. The link back brings the call back.
  - Neighbours, so nothing leaned on the clamp: `orb-hears`, `voice-amplitude`, `voice-meters`, `light-*`, `room-stage`
    and `room-people`.

## Not here

- Safari's policy can't be run here: the fixtures replace `livekit-room.ts`, so `connectRoom`'s two calls to `wake()`
  are read, not run, and the unit test covers what `wake()` does.
- A floor pass that starts during a bloom also holds it, and it plays whole after the landing: one rule for both orders.
