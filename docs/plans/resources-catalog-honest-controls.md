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

1. **Withdrawn: Try again stays after a final 403 or 404.** Luis, 2026-11-16, after review: follow the plan's UX04
   (`inc01-resources-service-adapter.md`, «403 and 404 keep their privacy-preserving words and Try again»). The
   refusal is final for the read that got it, not for the project: a person added to it meanwhile, or a project A51
   hadn't synced yet, turns the 404 into rows on a later read, and `useCatalog` doesn't read again by itself on a new
   token. The change and its test were reverted (`git revert` of `cd650a0ae` and of `001c0ef28`'s test).
2. **The catalog sorts by Owner or Tool.** `SortMenu` takes the orders to offer; the catalog passes Owner and Tool and
   starts on Owner (the order Attention gave it, so the tiles come in the same order as before). Its tiles can't be
   arranged: no drag, and Alt with an arrow moves the focus as an arrow does, nothing more. The project's known-data
   view is untouched: all four orders, Attention first, dragging and Alt-arrows, kept as before.
3. **A window's name starts upper case.** An id not in `WINDOW_NAME` reads with its first letter upper:
   `daily_tokens` → «Daily tokens», `credits` → «Credits», as the known names do. The tests that pinned the lower case
   now pin this.

## Checks

- `native-resources.spec.ts`: the catalog's Sort offers exactly Owner and Tool, starts on Owner, and a tile neither
  drags nor moves with Alt and an arrow (the order stays). `resources.spec.ts` keeps its four-order and arranging
  cases for the project's own view.
- `status-words.test.ts`, `resource.test.ts`: the fallback name capitalised; `resource-control-status.spec.ts`'s
  pinned lines follow.
- Phone 390 and paper/dark: the notice without its press and the Sort menu with two items, measured in place.

## Two more on the same branch (review items 8 and 9, copy approved by Luis 2026-11-16)

Luis approved these words on 2026-11-16, exact; nothing else is reworded.

- **A · Plain words for the owner's host** (`status-words.ts`, item 8). As a mapping only:
  «Host recorded» → «Your computer»; «Host bound» → «Linked to your computer»; «Host active» → «Your computer is
  connected»; «Handshake recorded» → «Connected once»; «Recorded qualification: stale» → «Needs checking again».
  The sheet's host line keeps its frame («… (recorded) · last seen …»). The tile's host label is set in capitals by
  `.resource-tile-host` (`text-transform: uppercase`, tracked mono), which would make «Your computer» a code again:
  on catalog tiles (`data-catalog`, owner's and teammate's alike, so one grid reads one way) the label is set as
  written, without the capitals or their tracking. The project's own tiles keep theirs.
  The review's other internal words (A conflict is recorded, Connection rotation unknown, Recorded host and
  capability evidence, «Each is a request until its runtime confirms it.», `receipts.ts` «Held. Its runtime confirmed
  the hold.», `resource.ts` «Saved coding-resource records…», and «No handshake recorded») have no approved copy and
  stay; they are listed in the handoff for Luis.
- **B · What to do about a connection** (`ResourceSheet.tsx` `CatalogHost`, item 9). Under «Needs a connection» and
  under «Connection expired», the sheet shows the line the empty catalog already uses, `CATALOG_ENROLLMENT` («Each
  owner enrolls their own tool from the computer it runs on; Studio doesn’t enroll tools.»): once, even where both
  hold. No new words.
- **Checks.** Unit: the five words, and when the line shows (each state alone, both, neither). E2E (flag on): the tile
  label reads «Your computer» as rendered (`innerText`), whole inside its tile at 390; the sheet's line under the
  fixture's needs-a-connection resource (whose connection is also expired), desktop and 390; and not on a linked one.
