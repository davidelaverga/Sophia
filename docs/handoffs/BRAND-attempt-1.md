# Implementation-session handoff: brand, attempt 1 (Umbral into the Studio)

- **Goal and attempt:** Luis picked Umbral from the brand finalists. This attempt is slice 1 of the [design note](../plans/brand-umbral.md): the mark in the app, the icons, the masters and the social card.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `brand/umbral` from main `6a40f8a`, 2026-10-04.
- **End:** content commit `dd27c28`; its checks ran on it.
- **Writable scope:**
  - `apps/studio`: `public/`, `index.html`, `src/app/Mark.tsx`, the four places that drew the dot, `theme.css`, `scripts/brand-assets.mjs`, the `brand:assets` script, a fixture page and checks;
  - the design note.

  **No contract, API or deploy changed.** The emails and the Supabase templates wait for a deploy and their owner (later slice).

## Outcome

- **The mark:** `Mark` draws Umbral at 16 px and replaces the 7 px dot in all four places: the project bar, the personal bar, the sign-in screen and the guest room. At 16 px its cuts land on whole pixels, 32 on a 2× screen.
  - You are drawn in warm and Sophia in core.
  - Sophia's half carries a soft halo, brighter while the project's feed is live. That keeps the dot's old meaning. Your half never glows.
  - Under reduced motion, the halo's change isn't animated.
- **The tab and the home screen:**
  - `favicon.svg` switches to the paper colours on a light browser theme;
  - `favicon.ico` holds 16, 32 and 48, drawn from the app icon so it reads on light and dark tab bars;
  - `apple-touch-icon.png` is full-bleed, since Apple rounds it;
  - `icon-192.png` and `icon-512.png`;
  - `manifest.webmanifest`, with `theme-color` `#07060b`.
- **Masters,** in `public/brand/`:
  - `umbral.svg`, `umbral-paper.svg` and `umbral-mono.svg`;
  - `umbral-app.svg`;
  - `umbral-lockup.svg` and `umbral-lockup-paper.svg`, with the wordmark as outlines. It is Geist at 600, instanced from the variable font with fontTools, with the i dotless and its dot in halo.
- **Rasters are rendered, not exported:** `pnpm --filter @sophia/studio brand:assets` draws every PNG, the ICO and `brand/og.png` (1200 × 630, the lockup on the void) from the masters with Playwright's Chromium.

## Evidence

- **Checks:**
  - 5 browser checks (`brand ·`, on the new `fixtures/brand.html` and on the room's bar):
    - the mark sits on the word's centre line, within 1 px;
    - at 16 px, column 10 (the gap) is empty and columns 9 and 11 are inked;
    - Sophia's halo differs while live, and yours has none;
    - there is no transition under reduced motion;
    - the project bar's mark is live with its feed.
  - 3 unit tests (`brand.test.ts`):
    - every icon that `index.html` and the manifest name exists at its declared size;
    - the ICO holds 16, 32 and 48;
    - the masters, the favicon and `Mark` draw the same two paths.
- **Mutations, each killed:**
  - Sophia's half moved to x = 31, closing the gap: the pixel check and the unit test fail;
  - the live glow removed: the live check fails.
- **Captures:**
  - the project bar at 1× and 2×;
  - the sign-in screen;
  - the room bar on a phone, where the word is already hidden.
- **Code review:** no P1. Its two P2s are fixed:
  - the app drew the mark at 20 px, where its cuts miss the pixel grid. It is now 16, and the checks assert the shipped size;
  - the ICO was transparent, so it was unreadable on light tab bars. It is now drawn from the app icon.

  Its P3s:
  - the favicon has fill fallbacks;
  - the bar's mark is measured on the word's centre line;
  - the manifest no longer lists the transparent SVG;
  - deferred and said in the note: the social card's meta (it needs the deployed URL), a maskable icon, and a check that the rasters match the masters;
  - noted: WebKit may not draw a CSS `drop-shadow` on SVG paths, so on iOS the live halo could be lost. The mark still shows.
- **Build:** the root `pnpm build` doesn't build the Studio, so `pnpm --filter @sophia/studio build` was run: `dist/` holds every icon, the manifest and `brand/`.
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass; `pnpm --filter @sophia/studio build` too. `pnpm test`: 672, plus the 5 known Windows failures. `test:browser --repeat-each=2`: 356 of 356.
