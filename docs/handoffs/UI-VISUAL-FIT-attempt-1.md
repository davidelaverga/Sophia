# Handoff: what stays in place (rows, field errors, tips, the dock), attempt 1

Goal and attempt: UI-VISUAL-FIT (`docs/plans/visual-fit.md`; improvements 13 to 16 of the independent evaluation of
2026-11-22), attempt 1. Batch E of seven; A is #544, B #545, C #546, D #547.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/mejoras-e-visual` from `origin/main`
`d1e6b1410`.
Ending commit/tree and changed files: content commit `c3f7d8a19` (tree `66d29dd45`): 14 files changed, 463
insertions, 20 deletions, under `apps/studio`, `packages/ui` and `docs/plans`; this record is the next commit.

## Outcome

- 13 doesn't reproduce on the evaluated commit: every point of a Goals row already opens the goal. No change.
- 14: on Invite, an address without «@» is said under the field in the sign-in screen's own words, linked by
  `aria-describedby`, the field `aria-invalid` and focused; no browser bubble.
- 15: a goal without a plan opens its controls' tips below, clear of its criteria; while a command's line stands under
  the row, those tips wait.
- 16: at 1280 px with the panel open, the dock keeps one row (48 px): its word controls show their icons, its captions
  and separators give way; the words come back when the panel closes.
- No new words.

## Evidence

- Before, on the evaluation's stack (`df4b4a518`): Goals rows 2280/2280 points pressable; Invite showed the browser's
  bubble, no inline text; fixture `work.html?unplanned=1` tips covered the last criterion (229 × 17, 139 × 15,
  106 × 15 px); the dock wrapped to 88 px with the panel open.
- After, fixture and dev stack: the error line 9.6:1 on dark and 6.25:1 on light, 8 px under its field at 1280 and
  390; no tip covers a word at rest; the dock 673 px with words, 448–450 px with icons, 48 px both ways, dark and
  light; at 390 the phone's dock is unchanged (layout identical with and without the attribute); at 700 px the tight
  dock's tips show and stay inside the window.
- `pnpm lint` 0, `pnpm typecheck` 0, Prettier clean, Studio unit tests pass. `pnpm check`'s first step
  (`toolchain:check`) can't spawn `pnpm` on this Windows host (`spawnSync pnpm ENOENT`), unrelated to the change; the
  rest was run step by step.
- Playwright through `pw-gentle.ps1`, on the final commit: `visual-fit`, `goal-controls`, `room-dock` 26 passed;
  earlier on this branch `invite-members`, `room-honest` and `visual-fit` 12 passed, and `dock-header` with
  `goal-controls` 21 passed before the guard stopped a larger run for RAM (5.9 GB).
- One independent review: no P1; four P2s and two nits fixed (the clock's longer readings, the web font's arrival, a
  check at mount, tips on a tight dock up to 760 px, tips over a command's line, a polled first read).

## Decisions and changes

- 13 left alone, as the prompt asks for what is already fixed.
- 14 reuses sign-in's check and approved words (`NOT_AN_ADDRESS`, now in `mail-home.ts`) instead of new ones.
- 15 extends the kit's `ConfirmButton` with `tipSide`, beside its `tipAlign`.
- 16 decides the dock's fit by measuring it, not by a width threshold: the controls change with the call (Sophia in,
  speaking, the floor), so no single width fits them all.

## Remaining obligations

- The PR is not merged; CI's browser job is the run on record for the rest of the suite.

## Next bounded action

Luis reviews the PR. Batch F (`ui/mejoras-f-…`: improvements 21 and 24) follows.

Source IDs consulted: `evaluacion-2026-11-22/mejoras-ui.md` (13–16), `apps/studio/src/app/theme.css` (the dock, its
phone rules, tips, fields), `SignIn.tsx` and `mail-home.ts` (the address check), `packages/ui/src/Tip.tsx` and
`ConfirmButton.tsx`, `features/work/WorkControls.tsx` and `GoalCard.tsx`, `features/voice/RoomDock.tsx`.
