# Implementation-session handoff

Goal and attempt: UIKIT-15 (Home's right half: what needs you, feature F2, behind the vision flag), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/home-needs` from `ui/board-blocked` at
`3ff86c5c` (stacked on PR #236 → #235 → #234 → … → #220; the base retargets as each merges)
Ending commit/tree: `c2862085` (tree `9156e53cd1f5`): 9 files, 6 new (`needs-you.ts`, `needs-you.test.ts`, `NeedsYou.tsx`,
`index-keys.ts`, `e2e/home-needs.spec.ts`, `docs/plans/home-needs-you.md`); `Welcome.tsx`, `personal.css`,
`fixtures/home.tsx`. The commit after it adds only this handoff.
After the review (Codex on #237, four P2): `75c2dd1b` gives `needs` its opener (`{ items, open }`), keeps the 96 px mark
at the column's head, folds the side's rows by its width and the page to one column under 1100 px, and reads the time
words from `time-words.ts`; `home-needs.spec.ts` measures them. That is the completed code state of this PR.

## Outcome

- `needs-you.ts` (pure): `Need`, `NEED_WORDS`, `needsOrder`, `untilWords`, `needNote`, `needsLabel`; 4 unit tests.
- `NeedsYou.tsx`: the projects' index rows (`hw-index` / `hw-row`) with the kind's glyph where the number is, the
  title, the note, the arrow; ↑ and ↓ (`index-keys.ts`, shared with the projects' index); one press →
  `actions.need(need)`; none → «Nothing needs you right now».
- `Welcome`: `needs?: readonly Need[]`; undefined, Home is as it was (her light alone, 480 px); given, `aside.hw-side`
  with her light at 220 px (the mark 48 px) over the list. `actions.need?`.
- `fixtures/home.tsx`: `needs=some` (five, one per kind, given out of order) · `none` · absent (the Studio's own Home);
  the demo shows `some`; `pressed` records «need <id>». Under `VISION` only.
- `e2e/home-needs.spec.ts`: the order, the notes and tones, the row's action name, the press; the keys; the light at
  220 over the list, the quiet line, and without `needs` no column and the light at 480.
- Unverified here: the Playwright run (the local guard); CI is the run on record. Not built: the API that would serve
  the needs (left in the plan), the bar's badge, email, push.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm typecheck`: clean. `needs-you.test.ts`: 4 pass.
- Measured in the page (the pane at 1440×900, `home.html?needs=some`): the left column 560 px at 144; the side column
  542 px at 744; her light 220×220 at (700, 107), the mark 48 px; the label «Needs you» at y 333, the list at 355
  (under the light); the rows in order decision (soon, «Product launch · expires in 20 min») · permission (quiet,
  «Launch plan · expires in 2 h») · review («Research notes · Davide asks») · guest («Design review · Waiting 2 min») ·
  reply («Yesterday»); no title overflows; the first press recorded «need d1».
- Without `needs` (the same page): no `.hw-side`, no `.hw-needs`, her light 480 px: as before.
- At 390×844: her light keeps the phone's place (220 px, top right at y 48); the column follows the projects (top 868
  under their bottom 828); rows in two lines (58 px); nothing wider than the screen. `needs=none`: the quiet line, no
  list.

## Decisions and changes

- Behind the vision flag on fixture data, as `room-present.md` did: no API serves the needs; production never shows a
  column it cannot fill. The fixture's default is the Studio's own Home, so `home.spec.ts` moves nowhere.
- The right half becomes a column only when needs are given: the light's 480 px rest is kept for the app.
- The kind's glyph where the project's row has its number: the same row, read at a glance; the action word stays for
  screen readers and touch (`hw-go-words`).
- `moveInIndex` moved to `index-keys.ts` to be shared; no behaviour change.

## Remaining obligations

- Watch CI for `home-needs.spec.ts` and `home.spec.ts`; the independent review (Codex) with no P1/P2 before merge. The
  base is `ui/board-blocked` until #236 merges.

## Next bounded action

The re-evaluation Luis asked for: what is still missing in features, polish, detail and quality of life, for power
users with the least friction between actions.
