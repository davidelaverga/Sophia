# Brand: Umbral, into the Studio

> 2026-10-04 · Luis · design note before code · source: the finalists artifact (Luis picked **Umbral**)

## The mark

Umbral draws two presences facing each other, you and Sophia. The line between them is the space they leave, so no violet is needed. It is drawn on a 48 viewBox, and its cuts land on whole pixels at 16, 32 and 48. At 16 the gap is exactly 1 px.

- **You:** `M30 14.83A15.19 15.19 0 1 0 30 37.93Z`. Warm `#F1DCC7` on dark, ink `#16151B` on paper.
- **Sophia:** `M33 6.65A8.57 8.57 0 1 1 33 23.11Z`. Core `#F4F0FF` on dark, halo-deep `#8468EE` on paper.
- **One ink:** both halves in `currentColor`.
- **App icon:** a `#0E0D14` square (rx 10.8), with a halo radial (`#9C82F5` at 20% → 0), and the mark at scale 0.62.

## Where it goes: slice 1 (this PR)

1. **The mark in the app:** one component, `Mark`, replaces the 7 px dot in its four places: the project bar, the personal bar, the sign-in screen and the guest room. It is drawn at 16 px, where its cuts land on whole pixels (32 on a 2× screen), so the gap stays crisp. The word "Sophia" stays beside it as it is.
2. **Live keeps its meaning.** Today the dot glows brighter while the project's feed is live (`data-live`). Now Sophia's half carries a soft halo, and it grows while live. Under reduced motion the change is not animated. Your half never glows: the glow is Sophia's presence.
3. **The tab and the home screen:**
   - `favicon.svg`: the dark mark, switching to the paper colours under `prefers-color-scheme: light`, so it reads on a light tab bar;
   - `favicon.ico`: 16, 32 and 48, drawn from the app icon, whose dark square reads on light and dark tab bars;
   - `apple-touch-icon.png` (180), and `icon-192.png` and `icon-512.png`, with a `manifest.webmanifest` (name, colours `#07060B`);
   - a social card, `og.png` (1200×630): the lockup on the void.

   They are rendered from the masters by a script in the repo, not hand-exported: `pnpm --filter @sophia/studio brand:assets` (`apps/studio/scripts/brand-assets.mjs`).
4. **Masters** in `apps/studio/public/brand/`:
   - `umbral.svg` (dark), `umbral-paper.svg` and `umbral-mono.svg`;
   - `umbral-app.svg`;
   - the lockup, with the wordmark as outlines.

## Later slices

- **The emails** (invitation, confirmation, magic link) show the mark as a hosted PNG from the deployed Studio. The Supabase templates are pushed by their owner, so these wait for a deploy and Davide.
- **The social card's meta** (`og:image`, `twitter:card`): it needs the deployed Studio's absolute URL, so it waits for the deploy. `og.png` is ready.
- **A maskable icon** for Android, with the mark inside the safe zone.
- **A check that the committed rasters match their masters** (re-render and compare), so a master edited without `brand:assets` is caught.
- **Clear space and minimum sizes** on a brand page in the docs.
- **Optional:** a Blender hero render of the mark as light.

## Checks

- **One mark:** each of the four places shows the SVG mark (`[data-mark="umbral"]`) and no dot.
- **Live:** with the project feed live, Sophia's half glows more than at rest (its computed `filter` differs), and under reduced motion the change isn't animated.
- **On the pixel grid:** at 16 px the rendered gap between the halves is a whole pixel. A rendered PNG's middle column is clear.
- **Assets:** every file the HTML and the manifest reference exists, and each PNG has its declared size.
- **Visual:** captures of the bar, sign-in and the guest room at 1×, 2× and on a phone. The mark sits on the word's centre line, measured.
