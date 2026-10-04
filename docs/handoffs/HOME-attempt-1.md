# Implementation-session handoff: Home, the Welcome, attempt 1

- **Goal and attempt:** the "$20" pass on Home ([design note](../plans/home-welcome.md)). Luis: "elévalo recordando cómo está configurado Tasks y Resources, debe haber coherencia y nivel premium … microinteracciones y la atención al detalle."
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `home/welcome` on `main` `704261a`, 2026-10-04.
- **End:** content commit `c363dae`; its checks ran on it.
- **Writable scope:**
  - `HomeDoors.tsx`, `Places.tsx` (Home's wiring, Esc), `places-view.ts`, `personal.css`;
  - `usePlaceMotion.ts`, since the Personal transition's glow now starts from the light;
  - `engine.ts`, so the light asks for no frames without a size;
  - Home's fixture page and its checks.

  **No contract changed.**
- **Not touched:** the files Davide's open #76 edits (`theme.css`, `board.css`, `resources.css`, `Sheet.tsx`, `TaskTile.tsx`).

## Outcome

- **One top-aligned column** of the views' width, with the views' head: the greeting, a summary on the right ("4 projects · Standup starts in 10 min"), a hairline.
- **An attention line,** only for a session about to start (amber) or a live room (teal), with Join.
- **Sophia's real light** in her door: at rest, turning and leaning towards the pointer on hover. Greyed behind the padlock when locked; masked and screened onto the door so no edge shows.
- **The three projects Work shows first** (the ones the opening warmed) as one-press rows:
  - each shows its room or next session, and its faces;
  - its action appears on hover: Open, Join the room, or, for your own call, Back to the room;
  - they lift with the tiles' pointer light and press to 0.99;
  - ↑/↓ move between them, Enter opens;
  - with no projects, a dashed row starts the first; while they load, placeholders.
- **"Got it" or Esc** folds the first-visit note away, and nothing jumps: a flex column takes the gap with the note, and the padlock takes the focus without scrolling.
- **Phone:** one column; a row that joins or goes back says so before the tap.
- **Reduced motion:** nothing lifts, arrives or breathes.
- **The light** asks for no frames while Home is hidden. It updates once a frame on pointer moves.
- **Gone:** the Work door's static faces and "Open your projects", and the dead `workDoor`. All projects shows `workCount`.

## Evidence

- **Tests:**
  - 4 new unit tests in `places-view.test.ts` (16 in the file): Work's order, the actions (open, join, back), the summary, the attention line, the count.
  - 16 browser checks in `e2e/home.spec.ts`, on a fixture page with the real `HomeDoors`:
    - rows and their order, a live room, the arrow keys, head and attention;
    - empty and loading;
    - the note's glide with Got it, with Esc and on a phone;
    - the light listening and locked;
    - back to your call;
    - placeholders that can't be pressed, and join said on touch;
    - no lift under reduced motion;
    - no light frames while hidden;
    - a phone with nothing past the screen.
- **Mutations, 20 of 20 killed:**
  - four rows, and list order instead of Work's;
  - the call row hanging up;
  - the summary without its session;
  - attention while in a call, and no live attention;
  - carried notes not counted;
  - rows pressing the wrong action;
  - arrows not moving;
  - an empty row that does nothing;
  - the note snapping, or leaving its gap;
  - Esc not folding;
  - the light never turning, and turning when locked;
  - rows lifting under reduced motion;
  - pressable placeholders;
  - join unsaid on touch;
  - light frames while hidden, and the light never starting again.
- **Independent review:**
  - **P1, fixed:** a press on your own call's row hung up.
  - **P2s, fixed:** join unsaid on touch; WebGL frames while hidden; dead placeholders; Esc skipping the fold.
  - **P3s taken:** the 4 px phone step, now one shared gap; a truer glide check, measured until the note is gone and on a phone; the dead `workDoor` and the `initial` prop removed; the glow centred at the light's 42 %; one pointer update a frame.
  - **Left:** the arrow-key checks run without Places' own key handlers (←/→, Enter). Reading the code, they don't conflict.
- **Found on the way:** dismissing the note focused the padlock and scrolled a phone by about 230 px. It now focuses without scrolling.
- **Gates:** `pnpm format:check`, `lint`, `typecheck`, `build`, `contracts:check` and the Studio's build pass. `pnpm test`: 689, plus the 5 known Windows failures. `test:browser --repeat-each=2`: 426 of 426.
- **Left for later:** a name for email-only accounts in the greeting; a "while you were away" line once a summary read exists.
