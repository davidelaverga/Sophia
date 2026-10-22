# A tab left open asks for the version, and hears of a deploy within ten minutes

> 2026-10-22 · the reliability baseline's M9 (`evaluacion-2026-10-19/fiabilidad/linea-base.md` §4 row M9, «aviso ≤ 15
> min tras el despliegue», and «Fuera del top 10»: «pestaña vieja sin sondeo de versión»); Luis 2026-10-24: «Procede
> con tu recomendación, el lote con 1, 2 y 3», and earlier «Lo que no se mide, no se puede mejorar». Studio only, no
> API, nothing deployed. Read beside [new-version](new-version.md) and [stale-part-call](stale-part-call.md).

## Measured

- **Today a tab learns of a deploy only when a part fails.** The notice listens to `vite:preloadError` alone
  (`new-version-signal.ts`); nothing asks the host. A signed-in tab has the signed-in Studio loaded at its start, so it
  can go hours on the old build until a press needs a part that is gone (the room's LiveKit, the Invite sheet, the PDF
  viewer), and that press fails first.
- **No build id exists.** `vite.config.ts` defines none; the Studio has no Git connection on Vercel: it is built on a
  machine and the `dist` uploaded (`deploy/S1-05A-release.md`), so no Vercel variable is there at build time.
  `public/vercel.json` rewrites every address but `/assets/` to the page, after the files: a file at the root
  (`favicon.svg`, `entry.js`) is served as itself.
- **What an id must not do: rename chunks.** Two builds of one tree name every chunk alike (stale-part-call.md). An id
  compiled into a script would change that script's name on every build, and the entry's name cascades into
  `SignedIn` (which imports from it) and `InviteSheet`: a redeploy of the same tree would break an old tab's Invite
  press. So the id lives in the page, not in a script.

## What changes

- **The build names its version** (`build-version.ts`, a Vite plugin, build only): an id from every file the build
  wrote (their names, which carry their contents' hashes, and the page's own text), so two builds of one tree share it
  and any change gives a new one. Written into the page's head (`<meta name="sophia-version">`) and beside it as
  `version.json` (`{ "version": "<id>" }`). No script changes, so no chunk is renamed by it.
- **The tab asks** (`version-probe.ts`, pure over its page): its own id from the page it loaded, the host's from
  `/version.json` (never from a cache). It asks when the tab comes back into view or into focus, at most once a minute,
  and every ten minutes while in view; never while hidden (coming back asks at once). No tight polling: at most one
  request every ten minutes while a tab sits in view, one per minute at most however often the person switches.
- **A different id is the new version's word:** said once to the notice (`newVersion.tell()`, the same «Sophia was
  updated. Reload to keep going.»), and the asking stops. A read that fails, a 404 or a body without an id is no word.
  Nothing reloads by itself (new-version.md: it would cut a call).
- **Where there is no id, nothing asks:** the dev server and the fixture pages, except the app's, which names
  `fixture-build` in its page and serves it as `version.json` for the checks to change (`vite.app.config.ts`). The app
  fixture's API passes the file through to the host, as it does the synthetic Auth, so it is never an unexpected
  request.

## Checks (written first)

- **Unit** (`version-probe.test.ts`): `servedVersion` reads only a non-empty string; the probe over a fake page asks on
  coming back and on the interval, not while hidden, not twice within a minute of coming back (the interval still
  does), tells once when the id differs and then asks no more, says nothing for the same id, a failed read or a body
  without one. (`new-version-signal.test.ts`): `tell` is heard as the event is.
- **Browser** (`new-version.spec.ts`, the app's page; the served version changed by a route on `/version.json`):
  - the tab back into focus → the notice, and no reload;
  - back into view (`visibilitychange`) → the notice;
  - left in view, the page's clock run ten minutes (Playwright's clock) → the notice; the same version served → none.
- **M9** in the reliability report (`e2e/reliability/version.spec.ts`, `@reliability`): per trigger (focus, back into
  view, the interval), the time from the version changing to the notice, and that the page never reloaded by itself.
  The interval's time is the page's clock (Playwright's), so ten minutes take a second.

## Limits

- A redeploy of the same tree keeps its id (no notice, and none is needed: every file is where it was). A rollback to
  an older deployment is a different id: the tab hears of it as a new version, which it is.
- A public file changed alone (`public/entry.js`) doesn't change the id: it isn't a part a tab asks for later.
- A tab hidden for hours asks nothing until it is back; then at once.

## Found while building

- **Observed on production builds** (scratchpad, nothing deployed): two builds of one tree write the same
  `version.json` (`5f9672781ccbb820`) and the same chunk names; one line changed on Home gives another id
  (`cfe28f942199015c`). A tab on the first build, the throwaway local host switched to the second, then back into
  focus: «Sophia was updated. Reload to keep going.» 50 ms later, the page not reloaded, two requests for
  `version.json` in all (one before the switch, one after).
- **Where the probe lands:** `new-version-early.ts` is now imported by the room and the device menu too, so the
  bundler moved it from the entry into the shared chunk the entry imports statically (`useAddressed-*`); it still runs
  before App draws.
- **The page's clock in the checks jumps** (`clock.fastForward`, each due timer once) and stops right after the page
  loads (`clock.pauseAt`): running ten minutes frame by frame (`runFor`) took the whole test's 30 s. The interval's
  measured times are to the 5 s step, and one step late: the route counts the request after the step that sent it.
- **Red for the right reasons** (`pw-logs/version-probe-red`, `version-probe-red-2`): no notice on focus or on coming
  back into view; at ten minutes no request and no notice (nothing asked before, as wanted); the same version served:
  the page never asked («page.waitForResponse: Test timeout»). The units failed on the outline («version-probe.ts:
  not written yet») and on «signal.tell is not a function».
