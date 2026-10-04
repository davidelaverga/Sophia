# Implementation-session handoff: sign-in, attempt 3 (the threshold)

- **Goal and attempt:** slice 2 of the sign-in's "$20" pass ([design note](../plans/signin-threshold.md)). Luis chose option B: Umbral forms in Sophia's light. He then asked for the mark to really block the light and cast god rays, "pensando en el rendimiento". After a first take that was too intense ("se ve cheap"), the rays were made subtle, and Luis approved them.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `signin/umbral` on `main` `44f3cfd`, 2026-10-04.
- **End:** content commit `e313ddc`; its checks ran on it.
- **Writable scope:**
  - the sign-in (`SignIn.tsx`);
  - the light (`engine.ts`, `renderer.ts`, `shader.ts`, `SophiaLight.tsx`);
  - the new `threshold.ts`, `Threshold.tsx` and `theme.css`;
  - the sign-in's checks and the design note.

  **No contract changed.**

## Outcome

- **Writing:** Sophia listens while the address field has the focus or holds words. She leans towards the field, 14 % of the way and 40 px at most. She thinks while the email goes.
- **Through:** her light condenses and Umbral forms where it rests:
  - her half grows from the light;
  - your half rises from where the address was written;
  - the mark is 96 px where there is room, 48 px otherwise.
- **Blocking:** the formed mark blocks her light.
  - Soft shadows fall behind each half, and rays pass its edges and the line between you.
  - This is drawn in the light's own shader, with no second pass or texture.
  - The mark is two cut discs, from the same numbers the SVG draws (`UMBRAL`). There are 16 samples per pixel, only within reach of the mark and only while it is there.
  - A fine pointer moves the light behind the mark by 3.5 grid units at most (`lightBehind`), so the rays turn.
- **Reduced motion:** formed and still. No gesture, no breath, no drift and no pointer.
- **Cost:** with the mark formed, frames held at 60 fps, the same as at rest:
  - 1280×800 on the software renderer (SwiftShader);
  - 1920×1080 at 2× on a GPU.

  Screens without a mark skip the branch. The room's light no longer measures its box or renders for the threshold.

## Evidence

- **Tests:**
  - 9 unit tests in `threshold.test.ts`: the lean and its cap, condensing, mark size, the light behind the mark, and each half's path lying on the disc the shader blocks with.
  - 6 browser checks in `signin.spec.ts`:
    - the mood and the attention point;
    - the mark at the light's rest, centred over the words;
    - the form gesture, two animations, not stacked under StrictMode;
    - reduced motion;
    - a resized window;
    - "Use another email" (mark gone, the new field listened to).
- **Mutations, 15 of 15 killed:**
  - the lean's cap and its direction;
  - the light off the line between you;
  - a disc off its path;
  - the mark off the rest;
  - the gesture not undone;
  - forming under reduced motion;
  - never forming;
  - the mark kept after the reset;
  - listening to an empty field;
  - no thinking;
  - attention off the field;
  - listening to the first field only;
  - no placement on resize or from the box's size.
- **Independent review:** found 1 P1 and 2 P2s, all fixed with checks:
  - **P1:** after "Use another email" the light listened to the old field, so it rested while focused and leaned to a corner.
  - **P2:** once formed, a resize didn't move the mark.
  - **P2:** the shadows outlived the mark by seconds.

  P3s taken:
  - the placement check is no longer circular (centred over the words);
  - the pointer is measured once a frame, not per move;
  - the room does no threshold work.

  P3 left for later: if an error line lifts the screen to its high rest, the field moves but her attention isn't measured again until the next focus or resize.
- **Not covered by a check:** the shader's own drawing (rays and shadows) is judged on recordings sent to Luis, not asserted.
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm contracts:check` and the Studio's build pass. `pnpm test`: 686, plus the 5 known Windows failures. `test:browser --repeat-each=2`: 394 of 394.
