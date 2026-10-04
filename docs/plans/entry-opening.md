# The opening: from the first byte to where you land

> 2026-10-04 · Luis · design note before code · after [signin-threshold](signin-threshold.md)

## Why

Luis: "como google workspace que tiene una animacion de transicion cargando. Nosotros necesitamos el logo nuestro animado, de alta calidad con la barra de carga. Entre login y donde el usuario cae cuando entra … son los primeros segundos del cliente con el sistema."

## What happens today (measured 2026-10-04)

Setup: the production build, served gzipped, on a mobile 4G profile (150 ms, 1.6 Mbps); the local stack for the signed-in paths. Chrome and Edge were both checked.

1. **A grey flash before anything.** `index.html` has no background of its own. Until the stylesheet arrives (about 0.6 s on 4G), the browser paints its default dark grey, not Sophia's void (`#050408`).
2. **About 1.2 s of an almost empty screen.** Once the stylesheet is in, the screen shows only the corner mark while the 251 KB (gzipped) bundle arrives and the session is read. Nothing says it is on its way. The sign-in shows at 1.85 s.
3. **Everything appears at once.** The light, the title and the field land in the same frame, with no handoff from what was there.
4. **After the link, it starts again.** A magic link or a provider's return reloads the whole page: grey, then empty, then "Sophia" while the session is exchanged. Nothing bounds that exchange (`getSession`); then Home appears.
5. **Home shifts as it lands.** The first-visit note ("Private on the left…") arrives a frame after the doors, so they jump down 40 px. Its reads (personal space, projects) also land after the page is drawn.

## The idea: once, on the way in

Luis (2026-10-04): "La pantalla de carga de transicion solo debe hacerse una vez idealmente. Del paso del login a la app. En lo que se prepara todo del cliente. No en cada transicion."

- **Every load** paints Sophia's void at once, so there is no grey flash. Nothing else is added: the sign-in, a reload or a link to a project open as before.
- **The opening plays once, from signing in to the app**, while the client gets ready (the session, then Home's first reads). Two paths lead there:
  - **A sign-in's return** (the email's link or a provider, `?code=`). A small script of the page's own origin (`public/entry.js`) marks the page before its first paint, so the opening is there from the first frame.
  - **An in-page sign-in** (a code, a passkey, a dev identity) covers the screen with it, before the next frame is painted.
- **Its own small files.** The CSP admits no inline style or script, so it uses `public/entry.css` and `public/entry.js` (about 3 KB), plus its markup in `index.html`.
- **The lockup arrives** in about 2.2 s, always whole, since it is seen once:
  1. Your half and Sophia's meet, and a light kindles in the line between them.
  2. The light leaps out in an arc as the violet dot of her name, and the word appears behind it.
  3. The dot lands on the i: it squashes, a ring of light spreads, a bloom lights the word, and a glint runs across it.
  4. Then it breathes over a thin bar.
- **The lockup is drawn with material.**
  - Your half is lit from the line by Sophia's light.
  - Her half is luminous, with a white core and a halo.
  - The word is the brand lockup's own outlines in a soft ink, so it needs no font.
  - The dot has a glow of its own.
- **The bar is honest.** It moves on real milestones (the app runs, the session is known, Home's reads settle) and creeps between them, never to the end. It fills only when the app is ready, after the arrival has landed.
- **The handoff.** The whole lockup flies into the corner lockup of the screen it opens on and becomes it: the real one fades in as it lands, and the void lifts off the screen already drawn under it. Under reduced motion there is no arrival and no flight, only a 160 ms fade.
- **Never stuck in silence, never a dead end.** After 6 s a line says it is taking longer than usual, with **Start over** (the page again, without the link). Everything it prepares holds it 5 s at most.
- **Onto anything but the Studio** (a link that failed, a link's question): a short fade. It never says "Ready" in front of an error.
- **While it is up**, keys don't reach the app under it, and the only live line is the work under way.
- **Transforms and opacity only.** If the app is ready before 120 ms, nothing is shown.

## Its purpose: the work it shows is real

Luis (2026-10-04): "Idealmente el loading tendría un propósito concreto. No solamente loading por loading."

Each line under the bar is work happening as it is said, and the bar moves with it (smoothly, never back, never a jump):

1. **Signing you in:** the session is exchanged.
2. **Opening your space:** Home's own reads, the personal space and the projects.
3. **Getting your projects ready:** the three projects Work shows first (a session about to start leads), each one's snapshot and membership read into the cache with the very keys their screen reads, so the first press opens at once. Meanwhile the code of a project's room and invite sheet is fetched, never waited on, and not when the device asks to save data. A read that fails is simply not warm (no retry).
4. **Ready.**

Work done faster than it can be read is still said, each line for 0.48 s at least, within the arrival.

**Measured on a 4G profile:** a warmed project is on screen in 42 ms after the press; one not warmed takes 210 ms.

## Not in this slice

- Making the bundle smaller (code-splitting the Studio away from Home). That is the next lever on 4G: the 251 KB is most of the 1.85 s.
- Bounding the session exchange after a link (`getSession`). It is noted as a risk; the slow line covers the wait meanwhile.

## Checks

- A page that is no sign-in's return never shows the opening: the sign-in, a reload signed in, a project's link.
- A sign-in's return shows it from the first frame, before the app runs; the app takes it on.
- The bar only moves forward, reaching each milestone in order, and fills only when ready (unit tests on its numbers).
- The opening says each step, in order, each for 0.4 s or more, warms Work's first three projects (snapshot and membership, the one with a session first, never a fourth) and lands only after its arrival.
- Home's reads hold it 5 s at most; past 6 s it offers Start over.
- A link that failed fades straight to the sign-in, without "Ready".
- An in-page sign-in covers the screen (visibly, under less motion too); a session arriving from another tab does not.
- While up, it is the one status and keys don't reach the app.
- The mark flies into the corner mark. Under reduced motion nothing moves.
- A fast load (ready before 120 ms) never shows it.

## Before the PR

Luis sees a recording of a cold visit on 4G, the sign-in, and the landing on Home, and says whether it lands.
