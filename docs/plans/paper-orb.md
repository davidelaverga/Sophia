# On paper Sophia is a solid orb

> 2026-10-17 · Luis: «en modo claro, no me gusta como se ve el halo de Sophia. Hagamos algo como un orbe solido, tipo
> chatgpt o las otras apps», then, between three directions and two evolutions: «Me gusta mas la B» (glass with a heart
> of clouds), «además de que sea bonita, debe reaccionar apropiadamente a lo que sucede en la sala». Studio only.
> Stacked on `voice-amplitude.md` (her voice's level) and `light-room-paper.md` (the paper halo following the engine).
> Designed in the paper-orb workflows: three directions, a survey of the room's events, two evolutions each attacked by
> a critic and revised (prototypes in the session's scratchpad, `orb2/glass-clouds.*`).

## What was measured

- In light mode her light was a CSS halo: a full-box radial gradient, white heart and violet ring thinning to nothing,
  breathing. Luis did not like how it looked on paper.

## What changes

- **The orb (theme.css):** two layers on the light, which isolates its stacking so the trace and a formed mark paint
  over her. `::before` is the clouds: lavender, white and violet blobs turning (48 s) inside a blurred square cut to a
  circle. `::after` is the glass: a glint at the top left, soft sheens, a translucent rim, a grounding shadow and her
  glow. It stands at her centre (`--lx`, `--ly`), 0.6 of her radius across (`--lr`, through a registered `--gc-k`)
  times her size now (`--ls`, capped at 1.2 so a floor swell on a loud voice never reaches the words at 0.46 of her
  radius).
- **What the room does to it:**
  - her state: listening she opens (heart 32 %, a slow stir, a deeper breath); thinking she gathers inward and dims
    slowly (heart 14 %); speaking her voice opens her heart (28 % → 44 %), brightens her and swirls the clouds, and the
    engine's size grows with it; at work she is smaller with a warm ember among the clouds; rest is the defaults. The
    amplitudes ease over 1.4 s.
  - whom she attends to: the engine writes `--ldx`/`--ldy` (her direction times her lean, `paperHalo`), and the clouds
    shift up to 6 px of the glass's 100 toward that person; the glint and the rim stay put.
  - the floor passing: one swell, through `--ls`, as the engine draws it.
  - where the light forms the mark (sign-in once through, Home, Talk), the mark is her: the orb fades out in 0.6 s.
  - in text mode her voice moves nothing: cut at the source (`RoomStage` gives no voice reader while `room.textMode`)
    and in the CSS.
- **Reduced motion:** she stands still, no voice and no lean; her states stay apart by their values alone.
- **The dark page** keeps its WebGL light: nothing here applies outside `:root[data-theme='light']`.

## Checks, written first

- `shape.test.ts`: `paperHalo` gives `--ldx`/`--ldy`, her direction times her lean (a fifth at rest, none unleaning).
- `paper-orb.spec.ts`: a round orb at her centre, 0.6 of her radius across times her size, clear of her words, solid
  violet inside; none on the dark page; her heart per state (rest 24 %, listen 32 %, think 14 %, speak 28 %, work 20 %);
  her voice swells her (×1.15) and brightens her heart only while she speaks; she leans toward the holder; never past
  1.2 of her size; gone where the mark is formed; voiceless in text mode; still under reduced motion.
- `light-room-paper.spec.ts`, `light-breath.spec.ts`, `light-mark.spec.ts`: the halo's checks become the orb's (its
  centre and size, its strength, its drift and breath, its glint).

## Next, in their own branches

- Her presence (`data-presence`: away, joining or reconnecting, paused) and sound blocked (`data-sound`).
- The voice of the person she listens to (`--hear`, its own slower envelope, listening only): inner motion, no size.
- A result arriving: one soft bloom.

## Limits

- `--gc-k` needs `tan(atan2(<length>, <length>))` in a registered number: Chrome 111+, Safari 16.4+, Firefox 128+;
  elsewhere it falls back to a 0.78 scale.
- The blurred 260 px cloud layer repaints every frame where the orb shows; nothing runs while the light is hidden or
  under reduced motion.
- Home and Talk show the formed mark alone: the orb stays out of the mark's way there.

## With the light plan (group/paper-light)

- Row 4 (`light-webgl-room.md`) keeps the WebGL light to the room: on paper `SophiaLight` renders no `.light-gl`, and
  `setPaper(paper, glCanvas)` creates or releases the renderer. The orb needs no canvas: the engine still reads her
  voice and what she hears, writes `--amp` and `--hear`, and on paper publishes `paperHalo` from the same frame, whether
  or not a renderer exists; `setPaper` clears the published halo before its canvas guard, so a turn rewrites it.
- Rows 2, 6 and 9 inventory every hand-written colour, cast shadow and glow. The orb is her light, drawn in her ramp
  until row 13 makes the ramp tokens, so the checks name it, as they named the halo it replaced: `glow.test.ts` lists
  her clouds, her glass and its light among the written effects and lets her state-driven glow be her own;
  `elevation.test.ts` lets her glass ground itself and counts only rules the room applies as the room's;
  `room-literals.test.ts` reads only rules the room applies (her heart's white is the flying light's room literal).
