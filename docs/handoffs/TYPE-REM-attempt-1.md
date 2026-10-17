# Implementation-session handoff

Goal and attempt: TYPE-REM (step 1 of the rem plan, `evaluacion-2026-10-16/propuesta-rem-pwa.md`; Luis: «Procede»),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `ui/type-rem` from `origin/main` (`8ea541a0`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Procede» (step 1 only, as the proposal recommended); merges on green with no open
P1.
Ending commit/tree: `6f3698974fc3` (tree `341d886a00a7`), the last commit of `ui/type-rem`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 9 files changed against
`origin/main` at that commit: `e2e/section-heads.spec.ts`, `e2e/type-rem-fit.spec.ts`, `e2e/type-rem.spec.ts`, `src/app/theme.css`, `src/features/personal/personal.css`, `src/features/resources/resources.css`, `src/features/work/WorkControls.tsx`, `docs/handoffs/TYPE-REM-attempt-1.md`, `docs/plans/type-rem.md`. The review notes below name the commit of each later change.

## Outcome

- The type scale's ten tokens are rem: six sizes (`--type-*`) and four leadings (`--lh-*`).
- At the browser's own size nothing moves: still 28, 15, 14, 13, 12 and 10.5 px, on 16, 20, 24 and 32.
- A person who asks their browser for larger text gets every token-set text and its leading larger by the same ratio.
- **Larger text fits (Codex P1):** at 125 % and 150 %, on a computer and on a phone, no box lets a line of its words
  out, and no page gets wider than the window. Four boxes needed it at 150 %. Tasks was too wide at every size, from a
  centred tip at the content's edge.

## Evidence

- Plan: `docs/plans/type-rem.md`.
- Written first (commit of the tests): `type-rem.spec.ts`. At the browser's own size each token draws as it did, which
  passed before, as it should. At 125 % each grows by 1.25, which failed: the tokens were px.
- **After the change, locally:** two passes of the 46 specs that measure type or heights (886 checks), through the guard.
  Neither finished, and neither failed a check.
  - The first stopped at 309: the machine slept mid-run, and two pages failed to load with `ERR_NETWORK_CHANGED` and
    `ERR_NETWORK_IO_SUSPENDED`, which is not code.
  - The second stopped at 679, when AION2 opened (the guard stops a run then). Those 679 all passed, among them
    `type-rem` (both cases), `section-heads` and `view-titles`.
  - The other 207 (the rest of `work.spec.ts` and the phone project) are CI's: the run on record.
- **The fit check, written first (commit `62c11167`, main merged in at `b7bfbb50`):** `type-rem-fit.spec.ts`, 68
  checks. On that commit, 5 failed:
  - at 150 %: Home's «/» key 3.4 px down, a session's role in Resources 11 px across, and Updates' «Still open» on a
    phone 3.5 px down;
  - at 125 % and 150 %: Tasks 18 px wider than the window. It is 18 px at 100 % too, from Hold's tip.
- **After the fixes (`6f369897`):**
  - the fit check: 68/68;
  - with `type-rem`, `call-keys`, `chips-radii`, `control-heights`, `field-scale`, `goal-controls`, `home`,
    `light-mode`, `micro-type`, `next-ask`, `next-ask-places`, `report-pane-keys`, `resources`, the three `updates`
    specs, `views-goals`, `work`, `section-heads` and `personal`: 538/538.
- **Two fixes had knock-ons, both caught by those specs and settled before the commit:**
  - The role's wider column made Codex's `.effort-asked` wrap under its 18 px at 150 % (14.8 px down).
    `min-height` alone grew it to 24 px at the default size, because its press reaches over it by design. It is now
    `max(18px, var(--lh-small))`, without wrapping.
  - Unshrinking the Updates kinds made a 320 px phone page 7 px wider (`updates-narrow`, Codex on #239). Their part's
    grid column now may be narrower than its widest row, so the strip scrolls in it.
- Type-aware lint, typecheck and Prettier are clean, with main merged in after #423 fixed main's own `ProjectBody`
  length.
- **No capture:** nothing moves at the browser's own size, and the fit check measures the larger sizes.

## Decisions and changes

- **Tokens only, as the plan's step 1:** the 153 font sizes written in px are step 2. They don't grow at a larger
  default yet.
- **The fixed heights, measured instead of moved:** the fit check found what overflows, and only that changed. Every
  other fixed height holds its text at 125 % and 150 %.
- **How the check measures:** each line against the box it is laid out in. Down, by its letters' band (an em around
  the line's middle). A text's own box (a Range) is taller than a tight heading's line, so measuring that would count
  every view title as overflowing. Across, word by word, since a space ending a line may hang past the box, as CSS
  lets it.
- **150 % as well as 125 %:** Chrome's «Very large» is the largest setting a person picks.
- **The root keeps no size of its own,** so rem follows the browser. The probe-based checks stand the root's size in for
  that setting.
- **`section-heads.spec.ts`** read the tokens' raw text with `parseFloat`, which would have compared rem with px. It now
  reads what a probe draws.

## Remaining obligations

- Step 2 of the plan (the px font sizes), if Luis wants it.

## Next bounded action

- Luis: merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
