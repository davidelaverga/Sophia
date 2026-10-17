# What she hears moves her orb inside

> 2026-10-17 · Luis: «debe reaccionar apropiadamente a lo que sucede en la sala». Studio only. Stacked on
> `orb-presence.md`. The paper-orb workflow's survey: the most visible room reaction still missing, honest only if it
> follows the one voice her bridge actually admits.

## What was measured

- While she listened, her light was the same whether the person with the floor spoke or not: the engine read only her
  own voice, and only while she spoke.
- Her bridge forwards the floor holder's microphone alone (room-session's `mayForwardAudio`): anyone else speaking is
  not heard by her.

## What changes

- **`motion.ts`:** the envelope takes its own times; what she hears uses 120 ms up and 450 ms down, calmer than her own
  voice (30 / 180 ms), so receiving never flickers.
- **The engine:** `hearing()`, read once a frame while she listens and motion is full, through that envelope; written as
  `--hear` beside `--amp`, only when it changes. The voice reader is a shared `level()` that reads a failure as silence.
- **`StageLight`:** gives her light the holder's level (`room.voiceLevel`), only while the holder is present, and
  nothing in text mode. The reader is stable while the holder is, so the engine's update doesn't run every render.
- **The paper orb:** what she hears stirs her clouds (+0.3 of the swirl), whitens them a touch (+0.08), opens her heart a
  little (+3 %) and draws them further toward the holder (her lean × 1.7 at most). It never changes her size or her
  glow, so it never reads as her speaking; her presence, blocked sound, text mode and reduced motion all zero it.

## Checks, written first

- `motion.test.ts`: the hearing envelope's times, and that it rises slower than her own.
- `orb-hears.spec.ts`: while she listens, the holder's voice raises `--hear` to 0.6 or more and draws her clouds further,
  her size unchanged; someone without the floor raises nothing; nothing while she speaks, nor under reduced motion.

## Limits

- A muted holder reads 0 (their microphone sends nothing): she shows nothing heard, which is true.
- One more 512-sample analyser read per frame, for the holder only, while she listens.
