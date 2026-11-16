# Implementation-session handoff

Goal and attempt: RESOURCES-CATALOG-HONEST-CONTROLS (Studio P3s 10, 11 and 12 of the #513 integration review,
`evaluacion-2026-11-16/revision-513.md`: Try again after a final 403/404, the catalog's Sort offering Attention and
a custom order it never keeps, a window name in lower case; then items 8 and 9, the owner's host in plain words and
what to do about a connection, with copy Luis approved on 2026-11-16; Luis 2026-11-16: «Debemos poder ir avanzando en
otra cosa»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-3`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-3`, branch `resources/catalog-honest-controls` from
`origin/main` `9495c87fc` (everything through #513 and #501 merged; not pushed)
Writable scope: this worktree only (`apps/studio/src/features/resources`, `apps/studio/e2e`, `docs/plans`,
`docs/handoffs`); no API, contract, fixture or copy change. Davide's open #514–#519 touch none of these files.
Runtime unit: Luis's Windows host (Playwright through the session's guard, `pw-gentle.ps1`: free RAM sat at 8–9 GB);
CI as the run on record.
Existing authority: Luis, the quote above; local only, nothing pushed.
Ending commit/tree: `2671b6471` (after the review round below); the next commit changes only this record. Files
changed against `9495c87fc`: `ResourcePanel.tsx`, `ResourceSheet.tsx`, `SortMenu.tsx`, `TileGrid.tsx`, `resource.ts`,
`resources.css`, `status-words.ts`, `resource.test.ts`, `status-words.test.ts`, `e2e/native-resources.spec.ts`,
`e2e/app-native-resources.spec.ts`, `e2e/resource-control-status.spec.ts`,
`docs/plans/resources-catalog-honest-controls.md`, and this record.

## Outcome

- **10 · Withdrawn.** Luis, after review (2026-11-16): follow the plan's UX04, Try again stays after a final 403 or
  404. The refusal is final for that read, not for the project: someone added to it meanwhile, or a project A51
  hadn't synced yet, turns the 404 into rows on a later read, and `useCatalog` doesn't read again by itself on a new
  token. `cd650a0ae` and `001c0ef28`'s test are reverted (`3e4c56d32`, `0c76bd2b6`); `ProjectResources.tsx` is as on
  main. The note stays, saying why.
- **11 · The catalog sorts by Owner or Tool.** `SortMenu` takes the orders to offer; the catalog passes Owner and
  Tool and starts on Owner (with no requests and every host `unknown`, Attention ordered exactly as Owner, so the
  tiles come in the same order as before). Its tiles don't drag (`draggable="false"`), and Alt with an arrow moves the
  focus as the arrow does. The project's known-data view is untouched (all four orders, arranging kept).
- **12 · A window's name starts upper case.** `windowName` gives an id it doesn't know its words with the first
  letter upper: «Daily tokens window», «Credits: 42 credits left».
- **A (item 8) · The owner's host in plain words**, Luis's copy as a mapping only: «Host recorded» → «Your computer»
  (tile), «Host bound» → «Linked to your computer», «Host active» → «Your computer is connected», «Handshake recorded»
  → «Connected once», «Recorded qualification: stale» → «Qualification: needs checking again» (Luis's words after
  review; first «Needs checking again»). The tile's host label was set in
  capitals and tracked (`.resource-tile-host`); on catalog tiles (`data-catalog`, owner's and teammate's, so the grid
  reads one way: «Host private» and «No host» are now set as written too) it is `text-transform: none`,
  `letter-spacing: normal`. Project tiles keep their capitals.
- **B (item 9) · What to do about a connection.** Under «Needs a connection» and under «Connection expired» (a linked
  connection past its time, or one recorded expired), the sheet shows `CATALOG_ENROLLMENT`, the empty catalog's own
  line, once where both hold (`catalogEnrollment`, `status-words.ts`). Revoked, active-and-linked, or no connection:
  no line.

## Evidence

- **10 red** (withdrawn and reverted since) (`pw-logs/p3-10-red.txt`, at `001c0ef28`): `toHaveText` on `.resources-read`, `Expected: "This
  project’s resources can’t be read with your access."`, `Received: "…with your access.Try again"`.
- **11 red** (`pw-logs/p3-11-red.txt`, at `7b4876474`): desktop, `Expected: "SortOwner"`, `Received:
  "SortAttention"`; phone, the menu's items `Expected - 0 / Received + 2` (four items, two expected). The 10 test
  passed in the same run (fix already in).
- **12 red** (unit, at `306af0a5e`): `actual: 'daily tokens'`, `expected: 'Daily tokens'`;
  `actual: 'daily: 100000 tokens left'`, `expected: 'Daily: 100000 tokens left'`; the readiness lines `actual: …
  'Waiting for capacity: daily tokens window'`, `expected: … 'Daily tokens window'`.
- **A red** (unit, at `182ecc723`): `actual: 'Host recorded'`, `expected: 'Your computer'`; `actual: 'Recorded
  qualification: stale'`, `expected: 'Needs checking again'`; the host lines `actual: [ 'Host bound (recorded) · …',
  'Handshake recorded' ]`. E2E (`pw-logs/p3-A-red.txt`, detached at `182ecc723`): the tile label `Expected: "Your
  computer"`, not found (desktop and phone), and `Expected substring: "Linked to your computer (recorded) · last seen 3 h
  before this reading"`. A control mutant (the new `text-transform: none` removed, restored byte for byte) fails the
  tile check `Expected: "Your computer"`, `Received: "YOUR COMPUTER"` (`pw-logs/p3-A-css-mutant.txt`), so the case
  check can fail.
- **B red** (unit, at `c83f731b7`): `TypeError: sw.catalogEnrollment is not a function`. E2E (`pw-logs/p3-B-red.txt`,
  detached at `c83f731b7`): desktop and phone, the line under the state `Expected: "Each owner enrolls…"`, element not
  found; A's two tests passed in the same run.
- **Green**: unit, every `features/resources/*.test.ts`, 191/191. E2E through the guard (`pw-gentle.ps1`; the guard
  stopped several full runs for free RAM, so the evidence is pieced): `native-resources.spec.ts` 33 of 34 with no
  failure before the guard stopped the 34th (`p3-green-native3.txt`), the 34th alone passed (`p3-green-native4.txt`);
  `resources.spec.ts` sort, order, arranging, attention and keys cases 14/14 (`p3-green-res.txt`, the project view
  unchanged); `resource-control-status.spec.ts` the F08 and F09 capacity cases (the pinned «Daily tokens window»)
  passed before the guard stopped the run (`p3-green-rcs2.txt`).
- **Measured** (scratch specs, not committed; `p3-green-native.txt`, `p3-AB-measure.txt`), room (`data-theme` dark)
  and paper (light), 1280 and 390: the 403 notice 358×76 at 390 with no low contrast, page width 390; the catalog's
  Sort menu 115×80 (two items) inside 390 (x 257–373), no low contrast in either theme; the tile label «Your computer»
  93.9×16, no low contrast; the enrollment line 358×32 inside the sheet (phone sheet 0–390, y 526–844; line y 641), no
  low contrast, page width 390.
- Whole-repo `oxlint --type-aware` (exit 0), `tsc --noEmit -p apps/studio` (exit 0), Prettier on every touched file.

## Review round (independent review: no P1/P2; Luis 2026-11-16)

- **Item 10 withdrawn**, reverted with `git revert`: `3e4c56d32` (the fix), `0c76bd2b6` (the test; the note kept and
  amended to say why).
- **Copy:** `5566e4b19` test (unit red: `actual: 'Needs checking again'`, `expected: 'Qualification: needs checking
  again'`), `61ada114f` fix.
- **P3 4, Alt at the edge:** `useKeys` returned before `preventDefault` where there was nowhere to move, so Alt+Left
  on the first catalog tile went Back. `3fd4e8eda` test: a window `keydown` listener reads `defaultPrevented` after
  the grid; red (`pw-logs/p3-edge-red.txt`): `Alt+ArrowLeft`, `Expected: "true"`, `Received: "false"`. `2671b6471`
  fix: in the catalog (no arranging), Alt with an arrow is kept even at the edge (`keptAtEdge`); the project view,
  where tiles are arranged, is unchanged.
- Green after the round, on `2671b6471`: `native-resources.spec.ts` in full, 34/34 in one run (`pw-logs/p3-r2-native.txt`);
  `resources.spec.ts` sort, order, arranging, attention and keys cases, 14/14 (`p3-r2-res.txt`); unit 191/191.

## Decisions and changes

- **Owner, not Attention, is the catalog's start**, because Attention ranked nothing there; the visible order is the
  same.
- **Alt and an arrow move the focus in the catalog**, rather than doing nothing, and are kept from the browser even
  at the grid's edge, so its own Alt+Left (Back) never fires from a tile.

- **Teammate tiles too.** The sentence-case rule is on every catalog tile, not only the owner's, so «Host private»
  beside «Your computer» doesn't mix capitals in one grid.
- **The B unit check's helpers** moved to the file's scope in the fix commit (`8ae4b704a`) for `consistent-function-
  scoping` and `no-shadow`; what they assert is unchanged. The test commit `c83f731b7` alone fails whole-repo oxlint on
  that.

## Remaining obligations

- CI is the run on record. `app-native-resources.spec.ts`'s flagged build can't start on this Windows host (`spawn
  pnpm ENOENT`, the spec spawns `pnpm` without a shell; the same at `9495c87fc`), so its changed line («Connected
  once» in the flag-on sheet) is checked on CI only.
- **Internal words with no approved copy, for Luis** (left as they are): «A conflict is recorded», «Connection
  rotation unknown», «No handshake recorded», «Recorded host and capability evidence», «Each is a request until its
  runtime confirms it.», `receipts.ts:293` «Held. Its runtime confirmed the hold.», `resource.ts:425` (421 on main) «Saved
  coding-resource records. Live activity, usage and controls aren’t reported here.» Also the sheet's other
  «Recorded qualification: …» states (current, expired, revoked, doesn’t apply now) keep their frame beside
  «Qualification: needs checking again».
- **Review P3s left for Luis:** the tense of «Your computer is connected» (it is a recorded state with a last-seen
  time, not live); «No handshake recorded», which kept its old words beside «Connected once»; and whether the
  enrollment line fits an expired connection (renewing one may not mean enrolling again).

## Next bounded action

- Luis: say whether this joins the next batch. It is pushed only on his word and merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and the review only.
