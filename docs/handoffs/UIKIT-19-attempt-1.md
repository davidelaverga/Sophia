# Implementation-session handoff

Goal and attempt: UIKIT-19 (a task's sheet by its keys: H and S; the labels at 12 px, the data at 10.5), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/task-keys` from `ui/conversation-acts` at
`760184ca` (stacked on PR #240 → #239 → … → #220; the base retargets as each merges)
Ending commit/tree: `0feab4ac5140` (tree `50e546afbdd0`), the last commit of `ui/task-keys`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 20 files changed against
`ui/conversation-acts` at that commit: `e2e/micro-type.spec.ts`, `e2e/personal.spec.ts`, `e2e/task-keys.spec.ts`, `e2e/work.spec.ts`, `src/app/theme.css`, `src/app/useDialog.ts`, `src/features/conversations/conversations.css`, `src/features/personal/personal.css`, `src/features/resources/SessionActs.tsx`, `src/features/resources/resources.css`, `src/features/voice/PresentedReport.tsx`, `src/features/work/planning/ReviewSources.tsx`, `src/features/work/planning/TaskActions.tsx`, `src/features/work/planning/TaskSheet.tsx`, `src/features/work/planning/board.css`, `src/features/work/planning/plan.css`, `docs/handoffs/UIKIT-19-attempt-1.md`, `docs/plans/task-keys-micro-type.md`, `packages/ui/src/ConfirmButton.tsx`, `packages/ui/src/Tip.tsx`. The review notes below name the commit of each later change.

## Outcome

- `TaskSheet`: the same listener as J and K takes `H` (presses Hold, or Resume when that is offered, found by the
  press's name) and `S` (presses Stop, which asks first with the focus on the safe answer; `S` again while it asks
  does nothing); none inside a field; the foot says «H hold or resume · S stop» while the plan is in force. The
  pass's claim that the sheet's dialog had no name was wrong: it is named by its title (`aria-labelledby`).
- Labels at 12 px (`--type-small`), mono and uppercase as before: `.field-label`, the bar's connection words, Updates'
  heads, the pulse's head, the palette's group word, Home's date and labels, Personal's labels, day marks and notes,
  Resources' sheet heads, sort label, history caption and receipt steps, the report's main meta, the room link's text
  and limits, «or», the thread's day and «Earlier messages», a task's activity note, a decision's due note: 20 rules.
  Data stays at 10.5: keys, counts, chips, avatars and faces, times and «ago», versions, badges, marks, format tags,
  the evidence refs (43 uses of the token remain, all of that kind).
- `e2e/task-keys.spec.ts`: H holds then resumes, S asks with the focus on «Keep it working», S again adds nothing,
  `h` in the guidance field is a letter. `e2e/micro-type.spec.ts`: the section labels at 12 px on Tasks, Updates,
  Resources, Home and Personal; on Tasks and Updates nothing under 11 px but data.
- Unverified here: the Playwright run (the local guard); CI is the run on record.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm typecheck`: clean.
- Measured in the page (the pane at 1280×800): the sheet's foot reads «Plan r2 · accepted · J K the next and the one
  before · H hold or resume · S stop»; `h` → the steps «Recorded · Delivered · Held · Hold requested; waiting for the
  runtime» (the fixture settles it later; the spec waits for «Held.»); `s` → the Stop group with the focus on «Keep it
  working»; `s` again → one group still; `h` typed in the guidance field is not taken.
- Section labels read 12 px on Tasks (7), Updates (6), Conversations (1), Home (4). Texts under 11 px, before → after:
  Tasks 23 → 18, Updates 12 → 5, Conversations 22 → 19, Home 8 → 4, Personal 16 → 12; what is left is data (keys,
  counts, chips, avatars, times, the report tile's format tag, Resources' tool word).

## Decisions and changes

- The keys press the sheet's own presses rather than call the commands: what the press is allowed to do, the key is;
  what is not offered has no press, and the key does nothing.
- Stop by key asks exactly as Stop by pointer does; the safe answer takes the focus, so Enter keeps.
- A label and a count no longer share a size: 12 is for a word to read, 10.5 for a figure or a key.
- «Request review» stays with the goal's head, not the sheet (a board key, later); the decision's choices are buttons
  already.

## Remaining obligations

- Watch CI for `task-keys.spec.ts` and `micro-type.spec.ts`; the independent review (Codex) with no P1/P2 before
  merge. The base is `ui/conversation-acts` until #240 merges.

## Next bounded action

Per informe-pasada-3 §5 and §6, the queue: UIKIT-20 (the Studio's lens in the address, lenses without content not
shown, «Working on 1 task in the background» opens the task), UIKIT-21 (Places onto `useCommands` with the host in the
places' bar; `Shift+L` for the theme), UIKIT-22 (the board: «why blocked» on the lane's head, the blocked count on the
goal's chip).

## Post-review (Codex on #241, later rounds)

- The sheet's keys listen only in scope (`ShortcutScope`): a project kept behind Home or Personal for its call takes no
  H or S. Caps Lock or Shift give the same keys.
- H and S are in their controls' tips (Hold or Resume, and Stop: `ConfirmButton` takes `keys`), as every single-key
  shortcut is.
- The data stay on the 10.5 px scale where the pass had raised them: the activity's time, a decision's expiry, the
  capacity caption, the room link and its limits, the report's version and following count, Home's date, a session
  countdown, a day's elapsed note, Conversations' day, and a number inside a label.
- micro-type.spec fails a page that measures no label, instead of passing it as 12 px.
