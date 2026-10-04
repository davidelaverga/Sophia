# Implementation-session handoff: Home's light as Umbral, attempt 1

- **Goal and attempt:** Luis asked whether the Welcome is worth "$20". Two things on Home weren't: her light read as a generic orb, and a new account's Home said the same thing twice. Design note: `docs/plans/home-light-mark.md`.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `home/first-visit` from `home/welcome` (#86) at `88b346b`, 2026-10-04.
- **End:** content commit `c46bc4d`; its checks ran on it.
- **Writable scope:**
  - Home: `Welcome.tsx`, `places-view.ts`, `focus.ts`, `personal.css`;
  - the light, shared with the sign-in: `threshold.ts`, `engine.ts`, `SophiaLight.tsx`;
  - Home's fixture and checks, and the design note.
  - **No contract changed.** Davide's #76 files untouched.

## Outcome

- **Her light is Umbral on Home.** It forms once, when Home is first seen. Its rays turn to the pointer, and to the line while you write.
- **A first visit shows only the line** under "You and Sophia".
- **The independent review's P1 is fixed:** on a phone, Home scrolled 74 px sideways, and the old check couldn't see it.
- **Its P2s are fixed:**
  - the mark was placed at 0,0 and formed out of sight while Home was hidden;
  - focus landed in the line on touch;
  - the greeting could reach the mark on narrow phones.
- **Its cheap P3s are fixed:** the rays are still under reduced motion and rest once the pointer leaves the page, and there is no extra gap on a first visit.
- **P3s left open:**
  - the breathing drop-shadow loops on Home's main thread; its CSS is in `theme.css` (Davide's #76);
  - two observers measure the same box;
  - focus could fall to the page if the Open row unmounts under it.

## Evidence

- **Tests first:** each new check failed before its fix. Unit: `aimOf`, `roomForMark`, `youDoor` null. Browser:
  - the mark;
  - a first visit;
  - out of sight at first;
  - the focus landing;
  - narrow phones at 320, 360 and 390 px;
  - Home's own scroller.
- **Mutations:** 11 of 12 killed; 2 controls survive, as they must. The survivor: the engine using `aimOf` at all. The rays' direction can't be read from the page, so that line has no check.
- **Gates:** `format:check`, `lint`, `typecheck`, `contracts:check` and the Studio's build pass.
- **Unit tests:** 114 of 114 in the light and personal features.
- **Browser suite:** 219 of 220. The one failure, in Work (untouched), passed 5 of 5 alone.
- **Home's checks:** `--repeat-each=5`, 115 of 115.
- **Real app** (Chrome, a new `@sophia.test` account): desktop and phone recordings sent to Luis.
