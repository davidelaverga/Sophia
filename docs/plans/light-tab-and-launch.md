# The tab, the page and the installed app before the Studio paints

> 2026-10-17 · informe-claro §6, row 3 (`light/arranque-favicon`), finding D18: «el producto arranca y se presenta en
> oscuro». Luis approved rows 1 to 9. No API change; the room's page draws as before.

## What was measured

- The tab's mark is set for the appearance shown (entry.js at first paint, theme.ts after), but a tab is the browser's
  colour. No choice is the room, so a light system's white tab carries the room's mark: your half at 1.33:1, Sophia's
  at 1.12 (1.01 and 1.17 on Chrome's light strip, #dee1e6). Light chosen on a dark system puts paper's mark on a dark
  tab: your half at 1.13 on #202124 and 1.81 on Firefox's #42414d, Sophia's at 2.48 there. `favicon.svg` (index.html's
  own, until entry.js swaps it) fails the same way in each scheme.
- `favicon.ico` already reads on both: it is the app icon (`brand/umbral-app.svg`), the mark at 0.62 on a #0E0D14 tile.
- index.html declares only `dark`, and the opening's stylesheet sets no scheme: until theme.css arrives with the app, a
  paper page draws the browser's own parts in the dark one.
- The manifest opens an installed app on #07060b (background and theme): a paper user's app starts black, 19.06:1 from
  the paper it paints next. The app icon's tile on that splash is at 1.04.

## What changes

- **The tab's marks on tiles.** `favicon-dark.svg` is the app icon, byte for byte: in the room the tab, the .ico and the
  installed icon are one picture. `favicon-light.svg` is the same geometry on a paper tile (#FBF8F3, no halo: on paper
  light is not a violet wash) with the paper inks. `favicon.svg` holds both, switched by `prefers-color-scheme`; its
  light block still opens on the paper inks. The mark reads on its own tile whatever the tab: room 11.02 (your half,
  under the halo's strongest stop) and 13.08, paper 17.13 and 3.82.
- **index.html declares `light dark`**, and entry.css gives the root the scheme shown (`dark`; `light` under
  `data-theme='light'`): the room's first paint keeps the dark scheme it had, and a paper page has the light one before
  theme.css.
- **The manifest keeps the room's ground, #07060b** (Luis, 2026-10-17: «déjalo en negro»). A static file has one ground
  for everyone and can't know the choice; no choice is the room, so most installed apps open into it without a step. A
  neutral grey (#747474, 4.4:1 to both) and a white splash with paper's icon were weighed: the grey is a step for
  everyone, and white is a 19:1 flash into the room for everyone who never chose, and would change the installed icon
  for all.

## Checks, written first

- `src/app/launch.test.ts` reads the SVGs, index.html, entry.css and the manifest: every tab mark (both files, and
  `favicon.svg` in each scheme) at 3:1 or more on #ffffff, #dee1e6, #202124 and #42414d, a halo counted at its strongest
  stop; `favicon-dark.svg` equal to `umbral-app.svg`; the meta declaring both; entry.css's two root schemes. These
  three fail on main. A fourth pins the manifest's grounds to the room's (1.1:1 or less from the void): it passes on
  main and keeps the choice from drifting.
- `e2e/light-launch.spec.ts`, on the shipped index.html (`/opening.html`): no choice on a light system, and Light chosen
  on a dark system. The mark the page sets, drawn by Chromium at 96 px over its tab (#ffffff, #202124): each half at 3:1
  or more on the ground below the mark. Both fail on main (1.33 and 1.13).
- `light-mark.spec.ts` stays as it is and passes: favicon.svg's light block opens on the paper inks, each tab file names
  its two inks.

## Limits

- On a tile the mark is 0.62 of the icon, as in the .ico: about 8 px across at 16, and its cuts no longer land on whole
  pixels. A tile the tab's own colour (the room's on a dark tab, 1.20:1; paper's on a white one, 1.06) shows only the
  mark.
- A paper user's installed app still opens black, 19.06:1 from the paper it paints next. Manifests have no colours per
  scheme yet (the `user_preferences` incubation isn't shipped); the ground is weighed again with row 21 («system» as
  the default), when the appearance shown first stops being the room for everyone.
- The page's `theme-color` is unchanged: entry.js and theme.ts already set it to the appearance shown before the first
  paint.
- The fixture pages keep `content="dark"`: the opening's page is index.html itself, and the others take their scheme
  from theme.css.
