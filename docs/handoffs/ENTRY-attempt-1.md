# Implementation-session handoff: the opening, attempt 1

- **Goal and attempt:** the "$20" pass on the first seconds. The [design note](../plans/entry-opening.md) records Luis's direction in order:
  - an animated lockup with a loading bar between sign-in and the app;
  - "more elevated": the violet dot leading the way;
  - "only once, from login to the app";
  - "smoother, and the loading must have a real purpose".
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `entry/opening` on `main` `704261a`, 2026-10-04.
- **End:** content commit `e3d6ba8`; its checks ran on it.
- **Writable scope:**
  - `index.html`, plus `public/entry.css` and `public/entry.js`;
  - `src/app/entry.ts`, `entry-progress.ts`, `useOpening.ts` and `warm.ts`;
  - `App.tsx` and `main.tsx`;
  - the fixture page and its server plugin, and the checks.

  **No contract changed.**

## Outcome

- **Every load** paints Sophia's void at once, so the grey flash before the stylesheet is gone. The sign-in, a reload and a project's link show nothing else.
- **A sign-in's return** (`?code=`) shows the lockup from the first frame, before the app's script runs.
  - The arrival takes about 2.2 s: the halves meet, a light kindles between them, leaps out as the violet dot of "Sophia" and lands on the i. Then the word appears and a glint crosses it.
  - Each part is its own composited layer.
- **While up, it does real work, said under the bar as it happens:**
  1. Signing you in.
  2. Opening your space (Home's reads).
  3. Getting your projects ready: Work's first three projects, snapshot and membership, read with their screens' keys, plus the room and invite-sheet code.
  4. Ready.
- **Then** the lockup flies into the corner lockup and the void lifts off Home.
- **Measured on 4G:** a warmed project is on screen 42 ms after the press; one not warmed takes 210 ms.
- **An in-page sign-in** covers the screen only in the tab where it happened. A session arriving from another tab (the email's link opened there) lands without one.
- **A link that failed** fades straight to the sign-in.
- **The wait is bounded:** 5 s at most; past 6 s it offers "Start over".
- **Reduced motion:** no arrival and no flight, only a fade.

## Evidence

- **Tests:**
  - 8 unit tests in `entry-progress.test.ts`: the steps, the bar's aim and follow, never going back, the words, the exit and the flight.
  - 10 browser checks in `e2e/opening.spec.ts`, on a fixture page served from the real `index.html`: never on a plain load; the first frame; steps, warming and landing; a smooth bar; the 5 s cap and Start over; a session from this tab vs another tab; reduced motion; a failed link; one status and the key guard; reduced motion with a cover.
- **Mutations, 21 of 21 killed:**
  - entry on every load, and none on a return;
  - the bar's handover, going back, and jumping;
  - words not held;
  - the arrival not awaited;
  - warming the 4th project, retrying, or not warming at all;
  - Home's reads not waited;
  - no cap;
  - covering from another tab, and never covering;
  - flying under reduced motion;
  - a failed link saying ready;
  - the session step said for any status;
  - keys reaching the app;
  - the slow line read at once;
  - no way out;
  - an invisible cover under reduced motion.
- **Independent review:** no P1. Its 5 P2s are fixed with checks:
  - an invisible, click-swallowing cover under reduced motion;
  - the slow line announced at once;
  - a failed link reading as success;
  - main-thread arrival animations (now composited layers and a sliding panel);
  - a hung exchange with no way out (now "Start over").

  P3s taken:
  - the key guard;
  - the landing looked up at flight time;
  - no cover outside the Studio;
  - `prepare` errors caught;
  - parts cached per frame;
  - `entry.js` before the stylesheet;
  - truer checks (first frame, cap from the app's start, a session-first project);
  - the note's numbers.
- **Found on the way:**
  - Playwright's own Chromium kills the page on Home, because dictation asks for an on-device speech service it lacks. Chrome and Edge don't; recordings used `channel: 'chrome'`.
  - The local Supabase DB needed `pnpm db:migrate`.
- **Gates:** `pnpm format:check`, `lint`, `typecheck`, `build`, `contracts:check` and the Studio's build pass. `pnpm test`: 694, plus the 5 known Windows failures. `test:browser --repeat-each=2`: 414 of 414.
- **Left for later:**
  - code-splitting the Studio from the sign-in: on 4G the first visit shows about 1.8 s of void before the sign-in;
  - bounding the session exchange (`getSession`); "Start over" covers it meanwhile.
