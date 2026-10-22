# After a deploy, a Join whose part is gone says the tab is on an older version

> 2026-10-22 · the fourth seam (`evaluacion-2026-10-18/experiencia/costuras.md` §4, «Tras un deploy, un Join fallido
> dice «Check your connection» bajo un aviso de que Sophia se actualizó», and «Qué falta» item 4); Luis 2026-10-22:
> «Procede con tu recomendación, el lote con 1, 2 y 3», and earlier «Lo que no se mide, no se puede mejorar». Studio
> only, no API. Read beside [new-version](new-version.md) and its [follow-ups](new-version-follow-ups.md).

## Observed first (production builds on this machine, nothing deployed)

Built with `vite build` (Vite 8.3.1, Rolldown) at `167bb9088` into the session's scratchpad, served by a throwaway
static server on 127.0.0.1 that answers as `public/vercel.json` does (every address but `/assets/` is the page, so a
missing asset is a 404), driven by one headless Chromium (`.claude-guards/safe-browser.cjs`), then stopped.

- **The room's LiveKit import goes through Vite's preload helper.** In the build, the room's three imports of
  `livekit-room.ts` (connect, the device list, backgrounds) sit in the `RoomStage` chunk as
  `ae(() => import('./livekit-room-<hash>.js'), __vite__mapDeps([...]))`; `ae` is `preload-helper-<hash>.js`, whose
  catch dispatches `vite:preloadError` on `window` (cancelable, the error as `payload`) and rethrows the same error
  unless prevented. The new-version notice doesn't prevent it.
- **What a tab on the old build meets.** The page loaded on build 1, the host then serving build 2 only (its LiveKit
  chunk another name), and the room's own call made through build 1's helper with `RoomStage`'s own deps list: the
  call rejects with `TypeError: Failed to fetch dynamically imported module: http://127.0.0.1:<port>/assets/
  livekit-room-Ci7Q-Idk.js`, after one `vite:preloadError` whose payload is that same TypeError. So the notice shows,
  and the press's own catch runs after it with `heard()` already true.
- **A second press fails the same way without asking the host again:** one 404 in all for two calls, and a second
  `vite:preloadError`. Chromium keeps the failed module for the document's life, so Try again can never succeed in
  that tab, even if the file came back. Only a reload helps.
- **When the chunk's name changes.** Two builds of the same tree name every chunk the same (deterministic). One line
  changed in `livekit-room.ts` renames `livekit-room-*`, and with it its importers (`RoomStage`, `SignedIn`, the entry,
  `InviteSheet`, `JoinFlow`, `dist`). One line changed in `useProjectRoom.ts` renames it too: the LiveKit chunk imports
  shared room code from `RoomStage` (its name is in the file), so any change to the room's code renames it. One line
  changed in the new-version notice (the entry) or on Home (`Places.tsx`, in `SignedIn`) leaves `RoomStage` and
  `livekit-room-*` as they were. So this seam happens after a deploy that touched the room or LiveKit: 12 of the last
  30 merges to `main` (since 2026-10-18) touched `apps/studio/src/features/voice/`.
- **Which tabs.** The opening's `warmCode()` imports `livekit-room.ts` ahead of time, but the opening plays only on a
  sign-in's return (`?code=`) or an in-page sign-in (`entry.ts`, `public/entry.js`). A signed-in tab loaded any other
  way (reload, new tab, a link) first asks for LiveKit at its first Join or check, so it can meet the gone chunk. A tab
  already in a call has LiveKit in memory: Audio settings, offered only in a call, never meets it.

The code as the seam reads it holds: `joinMessage` gives every failure that isn't an `ApiError` «Couldn’t connect to
the room. Check your connection and try again.», and `readDevices` gives every rejection `refused`, which the check's
rows say as «Not allowed» and the in-call menu as «Allow the microphone in your browser’s site settings…».

## What changes

- **The line** (`call-end.ts`, `STALE_PART`): «This tab is on an older version of Sophia, so the call couldn’t load.»,
  with **Reload** beside it (one press, `location.reload()`). Said politely (`role=status`, from the dock's line that
  is there before it speaks, as the connection's lines are): the notice at the top already said it once.
- **When** (`part-gone.ts`, pure): a failure that is the browser's own `TypeError` for a module it couldn't fetch, while
  the page has heard of a new version (`newVersion.heard()`, which `vite:preloadError` set just before the rethrow).
  Both, so a LiveKit failure in a current tab, or a refused permission (a `DOMException`), keep their words.
  - A Join (the dock's, the mini dock's, the check's) says it in the dock's note; the panels repeat the note as text.
  - The check's rows name no device as «Not allowed» but «Needs a reload», and the check says the line with Reload.
  - The in-call menu (unreachable today: LiveKit is loaded by then) says «Reload this tab to choose one» per kind.
- **Never by itself, never twice:** nothing reloads on its own (it would cut a call, as the notice's rule says); the
  line is the press's answer while the cause lasts and is gone after a reload. Offline, the offline lines still win
  (`keptNote`), since an import offline fails the same way.
- **The top notice stays as it is.**

## Checks (written first)

- **Unit** (`part-gone.test.ts`): `partGone` only for a `TypeError` while heard; `joinMessage` gives the line for a part
  gone, the API's refusal and the two old lines otherwise (heard or not); a refusal of the device list reads `stale`
  only for a part gone. (`call-end.test.ts`): the line is polite.
- **Browser** (`new-version.spec.ts`, a new lever `room.html?part=gone`: the fake LiveKit's `connectRoom` and
  `listDevices` dispatch `vite:preloadError` on `window`, as `fixtures/new-version.tsx`'s `GoneAsCommitted` does, and
  reject with `TypeError('Failed to fetch dynamically imported module')`):
  - Join → the dock's polite line says the line with Reload, no alert, never «Check your connection»; Reload reloads
    the page. (Since Luis's decision below: no Try again beside it.)
  - The check → no row says «Not allowed», nothing says «site settings», the line with Reload; Join from it → the line.
  - Once: the same room without the lever joins with no such line.

## Limits

- The observation drove build 1's real preload helper with `RoomStage`'s real deps list from the page, not a press on
  a signed-in Studio (that needs the API and an account); the build's code at the import is the same call.
- Firefox and Safari word the `TypeError` differently («error loading dynamically imported module», «Importing a module
  script failed»); the check reads the class, not the words. Not observed in them.
- A project opened after such a deploy may first fail to load `RoomStage` itself; the notice covers that, and it isn't
  this seam.

## Found while building

- **Red for the right reasons** (`pw-logs/stale-part-red`): Join showed the alert «Couldn’t connect to the room. Check
  your connection and try again.» and no polite line; the check's rows read «Microphone: Not allowed», «Speaker: Not
  allowed», «Camera: Not allowed». The units failed on the outline («part-gone.ts: not written yet») and on
  `noteRole` («actual: 'alert', expected: 'status'»).
- **The room's module now loads the page's ear** (`new-version-early.ts`) to ask `heard()`. It listened on `window` at
  once, so a unit check that imports the room (`new-call.test.ts`) stopped with «window is not defined». Outside a
  browser the ear has a target of its own and asks the host for nothing (`dd1fa46b1`).

## After Luis's decision (2026-10-22)

Luis approved the three lines as written and asked for one change: where the part is gone, only Reload is offered,
since Try again can never succeed in that tab (observed above: the browser keeps the failed module until a reload).

- **Written first** (`0512ba3c9`): the gone-part Join shows Reload and no Try again (nor Join); a join that couldn't
  connect with its part there (a new lever, `refuse=connect`: the fake LiveKit's connect rejects as an unreachable room)
  still says «Couldn’t connect to the room. Check your connection and try again.» with Try again. Red
  (`pw-logs/stale-retry-red`): «toHaveCount · Expected: 0 · Received: 1» on Try again; the control passed.
- **Fixed** (`3861d3850`): the dock's and the header's mini dock's Join are hidden while the note is the line
  (`partGone`, `RoomDock.tsx`). The check beside Join stays: its picture still works, its rows say «Needs a reload».
- **Merged `origin/main`** (`#477`, `adc42d3fe`): the reliability report now carries M5 and M2r beside M9; the
  fixture's connect went one line over the limit with main's changes, and its two refused connects now share a helper
  (`a93454619`).

## After the independent review (2026-10-22: no P1; P3s)

Written first `6589f1a59`, fixed `3ba9187b1`.

- **No Join left against «only Reload»:** Ctrl+J and the palette's «Join the room» are not offered while the note is
  the line (`RoomStage.tsx`'s `joins`); the check says the line and offers Reload in its Join's place (one Reload, the
  foot's primary); when the line replaces the Join that was pressed, Reload takes the focus it left; the check's opener,
  alone in the dock, is a 36 px square clear of the dock's edge (a 20 px tab tucked at -2 px before).
- **A gone part is the error Vite said was gone** (its `payload`, which the fixture's `gone()` now sets too), or a
  module the browser couldn't fetch in Chromium's, Firefox's or Safari's words once a new version was heard; any other
  TypeError keeps its words, though the version probe has told of a deploy.
- **The news of a new version waits for the call's end** (Luis, «Esperar a que termine»; version-probe.md); this line
  doesn't: a gone part means Join can't work.
