# Resources catalog: no press that can only end the same way, only the orders it keeps, a window named as the others

> 2026-11-16 · Three P3s of the #513 integration review (`evaluacion-2026-11-16/revision-513.md`, Studio items 10, 11
> and 12), all in the Studio's resources feature; 10 and 11 only behind `VITE_SOPHIA_NATIVE_RESOURCES` (off). Luis
> 2026-11-16: «Debemos poder ir avanzando en otra cosa». Studio only; no API, contract, fixture answer or copy change.

## Measured

- **10 · Try again after a final refusal.** `ProjectResources.tsx` `ReadNotice` offers Try again for every notice but
  the 401 with the app's sign-in. A 403 or 404 on a member read is final: the client raises it from the status with
  `retry: 'never'` (`client.ts` `memberRead`, `native-resources-member-read.md`), after its one token renewal. Pressed,
  Try again reads again with the same token and the same membership, and can only end in the same «This project’s
  resources can’t be read with your access.»
- **11 · Sort in the catalog.** `ResourcePanel.tsx` `Browse` gives the catalog the same `SortMenu` as the project's
  known data: Attention, Owner, Tool, Custom. The catalog reports no requests (`actions: null`) and every row's host is
  `unknown` (`native-catalog.ts`), so Attention ranks nothing and orders exactly as Owner. Custom (chosen, dragged, or
  Alt and an arrow on a tile) is held in memory only: the catalog keeps nothing in this browser (`keeps = !catalog`,
  INC01-DES-002), so the next read, a reload or a new account loses it, silently.
- **12 · A window's name.** `resource.ts` `windowName` gives the known windows their names («Daily requests»,
  «Spend limit», «5-hour»), and any other id its raw words: `daily_tokens` reads «daily tokens». So
  `readinessSummary` (`status-words.ts:192`) says «Waiting for capacity: daily tokens window» where the known one says
  «Waiting for capacity: Daily requests window», and the capacity lines say «daily: 100000 tokens left». Unit tests in
  `status-words.test.ts` and `resource.test.ts`, and `e2e/resource-control-status.spec.ts`, pinned the lower case.

## What changes

1. **No Try again after a final 403 or 404.** The notice says its words and offers no press; the view's own navigation
   (the project's tabs, the sidebar) is the way on. Try again stays for every failure that can end otherwise: failed,
   unavailable, partial, incomplete, and a 401 where the app gives no sign-in (the fixture page). The 401 with the
   app's way keeps Sign in again. No new words.
   *Deviation from the plan:* `inc01-resources-service-adapter.md` (UX04) says «403 and 404 keep their
   privacy-preserving words and Try again». The review finds that press can only end the same way; the words stay,
   the press goes. The plan names no other way back for this state, so none is added.
2. **The catalog sorts by Owner or Tool.** `SortMenu` takes the orders to offer; the catalog passes Owner and Tool and
   starts on Owner (the order Attention gave it, so the tiles come in the same order as before). Its tiles can't be
   arranged: no drag, and Alt with an arrow moves the focus as an arrow does, nothing more. The project's known-data
   view is untouched: all four orders, Attention first, dragging and Alt-arrows, kept as before.
3. **A window's name starts upper case.** An id not in `WINDOW_NAME` reads with its first letter upper:
   `daily_tokens` → «Daily tokens», `credits` → «Credits», as the known names do. The tests that pinned the lower case
   now pin this.

## Checks

- `native-resources.spec.ts`: a final 403 and 404 show their words and no button in the notice (and the 401 page by
  itself still offers Try again); the catalog's Sort offers exactly Owner and Tool, starts on Owner, and a tile neither
  drags nor moves with Alt and an arrow (the order stays). `resources.spec.ts` keeps its four-order and arranging
  cases for the project's own view.
- `status-words.test.ts`, `resource.test.ts`: the fallback name capitalised; `resource-control-status.spec.ts`'s
  pinned lines follow.
- Phone 390 and paper/dark: the notice without its press and the Sort menu with two items, measured in place.
