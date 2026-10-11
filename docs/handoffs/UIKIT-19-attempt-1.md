# Implementation-session handoff

Goal and attempt: UIKIT-19 (a task's sheet by its keys: H and S; the labels at 12 px, the data at 10.5), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/task-keys` from `ui/conversation-acts` at
`760184ca` (stacked on PR #240 → #239 → … → #220; the base retargets as each merges)
Ending commit/tree: `8c4a9898` (tree `5720dec9fbd1`): 11 files, 3 new (`e2e/task-keys.spec.ts`, `e2e/micro-type.spec.ts`,
`docs/plans/task-keys-micro-type.md`); `TaskSheet.tsx` and seven sheets (`theme.css`, `conversations.css`,
`personal.css`, `resources.css`, `board.css`, `plan.css`). The commit after it adds only this handoff.

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
