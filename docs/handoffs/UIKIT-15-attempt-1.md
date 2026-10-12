# Implementation-session handoff

Goal and attempt: UIKIT-15 (Home's right half: what needs you, feature F2, behind the vision flag), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/home-needs` from `ui/board-blocked` at
`3ff86c5c` (stacked on PR #236 → #235 → #234 → … → #220; the base retargets as each merges)
Ending commit/tree: `bd9d2b8f8e40` (tree `beb91dcf10cf`), the last commit of `ui/home-needs`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 10 files changed against
`ui/board-blocked` at that commit: `e2e/home-needs.spec.ts`, `fixtures/home.tsx`, `src/features/personal/NeedsYou.tsx`, `src/features/personal/Welcome.tsx`, `src/features/personal/index-keys.ts`, `src/features/personal/needs-you.test.ts`, `src/features/personal/needs-you.ts`, `src/features/personal/personal.css`, `docs/handoffs/UIKIT-15-attempt-1.md`, `docs/plans/home-needs-you.md`. The review notes below name the commit of each later change.

## Outcome

- `needs-you.ts` (pure): `Need`, `NEED_WORDS`, `needsOrder`, `untilWords`, `needNote`, `needsLabel`; 4 unit tests.
- `NeedsYou.tsx`: the projects' index rows (`hw-index` / `hw-row`) with the kind's glyph where the number is, the
  title, the note, the arrow; ↑ and ↓ (`index-keys.ts`, shared with the projects' index); one press → `needs.open(need)`;
  none → «Nothing needs you right now».
- `Welcome`: `needs?: { items: readonly Need[]; open: (need: Need) => void }` (the list and its opener together, as
  reviewed in `75c2dd1b`); undefined, Home is as it was (her light alone, 480 px); given, `aside.hw-side` with her light
  at 220 px and the mark at 96 px at the column's head, over the list.
- `fixtures/home.tsx`: `needs=some` (five, one per kind, given out of order) · `none` · absent (the Studio's own Home);
  the demo shows `some`; `pressed` records «need <id>». Under `VISION` only.
- `e2e/home-needs.spec.ts`: the order, the notes and tones, the row's action name, the press; the keys; the light at
  220 over the list, the quiet line, and without `needs` no column and the light at 480.
- Unverified here: the Playwright run (the local guard); CI is the run on record. Not built: the API that would serve
  the needs (left in the plan), the bar's badge, email, push.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm typecheck`: clean. `needs-you.test.ts`: 4 pass.
- Measured in the page (the pane at 1440×900, `home.html?needs=some`): the left column 560 px at 144; the side column
  542 px at 744; her light 220×220 at (700, 107), the mark 96 px (as reviewed; 48 px in the first delivery); the label «Needs you» at y 333, the list at 355
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
- After the review (Codex on #237, 2026-10-11): the 96 px emblem at the column's head is the wide screen's; on a phone
  the 48 px rule stands and the greeting keeps clear of it (`useMarkRest` hears the phone query; home-needs.spec @phone).

## Remaining obligations

- Watch CI for `home-needs.spec.ts` and `home.spec.ts`; the independent review (Codex) with no P1/P2 before merge. The
  base is `ui/board-blocked` until #236 merges.

## Next bounded action

The re-evaluation Luis asked for: what is still missing in features, polish, detail and quality of life, for power
users with the least friction between actions.

## Post-review (Codex on #237, later round)

- Under a minute a need «expires in a moment», as `inTime` says it, never a clamped «1 min» (`untilWords`, a boundary test).
- The Outcome describes the reviewed state: `needs` is `{ items, open }`, the mark 96 px at the column's head.
