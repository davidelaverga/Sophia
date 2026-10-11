# Implementation-session handoff

Goal and attempt: UIKIT-08 (the kit's ninth piece: `Chip`, and the four radii), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/kit-chip` from `ui/kit-skeleton` at `66043be1`
(stacked on PR #229 → #228 → #227 → #224 → #223 → #222 → #221 → #220; the base retargets as each merges)
Ending commit/tree: `77c79625` (tree `dae559bcea98`): 17 files, 5 new (`Chip.tsx`, `chip-class.ts`,
`chip-class.test.ts`, `e2e/chips-radii.spec.ts`, `docs/plans/chips-radii.md`). The commit after it adds only this
handoff.

## Outcome

- `@sophia/ui` exports `Chip` (`kind` state / data / key, `tone`, `dot`), the pure `chipClass` / `CHIP` / `RADII`;
  `Tag` is the state chip with its dot (its `Tone` type now lives in `chip-class.ts` and is re-exported).
- One `.chip` in `theme.css` (the tag's rules, at the small type) and `.chip-data`; the task chip (`TaskTile`,
  `TaskSheet`) and the model chip (`ModelChip`) render through `Chip`, their own rules reduced to `flex: none` and the
  model families' `--chip-ink`. `MARK_TONE` in `plan.ts` gives a moving task's chip its tone.
- Every literal radius in the sheets is a token, round, or a hairline: 24 declarations changed across `theme.css`,
  `conversations.css`, `resources.css`, `artifacts.css`, `board.css`, `personal.css`.
- Unverified here: the Playwright run of `chips-radii.spec.ts` (the guard keeps refusing a browser run beside the
  open game); CI is the run on record for it and for the specs that name `.tag`, `.task-chip` and `.model-chip`
  (`report`, `resources`, `work`).

## Evidence

- `pnpm format:check`, `pnpm lint` (type-aware), `pnpm typecheck`: clean (Node 24.21.0 from `~/.sophia/node`).
- `node --test "packages/ui/src/**/*.test.ts" "apps/studio/src/**/!(*.db|*.live).test.ts"`: 1054 passed (1052 + the
  2 of `chip-class.test.ts`).
- The spec's measure, run in the page (the browser pane, 1280×800, served on 5197), after the change:
  - Radii: on all thirteen pages (sign-in, the door, home, personal, the room, the room in a call, Conversations,
    Goals, Tasks, Knowledge, Updates, Resources, the work space) no visible box off the tokens; the bubbles read
    `6px 12px 12px` and `12px 6px 12px 12px`, the rows 8 px.
  - Chips: Tasks `state 20 4px 12px/500 sans` and `key 18 4px 10.5px/500 mono`; Resources those two and `data 18 4px
    10.5px/500 mono` in the opus and gpt inks; Goals state and key.
- Before the change: Conversations had twelve boxes off the tokens (`.conv-row` 10, `.conv-output` 10,
  `.conv-output-page` 3, six `.conv-msg-body` 16, `.conv-field-box` 14, `.conv-ask` 9, `.conv-send` 9); the task chip
  measured 18 px on a 999 px pill at 400; the tag 11.5 px.
- Seen in the pane: the board's chips («Waiting on a permission», squared), Resources' tag and model chips, the
  conversation's bubbles.

## Decisions and changes

- The state chip keeps the class name `tag` beside `chip`: three specs and five feature rules name it, and the name
  says what it is. The task chip keeps `task-chip` (two specs) and the model chip `model-chip` (resources' specs).
- The chip's type is the small type (12 px): the tag's 11.5 was the one size off the scale.
- The dock's squares go from 10 to 8 (`--r-3`); the bubbles and the composer's box from 16 and 14 to 12 (`--r-4`);
  Ask Sophia and Send from 9 to 8. The informe's «un solo radio para burbujas» holds.
- Hairlines and round things are not tokens and need none; the spec names them so (a bar no taller than 4 px; a
  radius of half the side or more).
- A person's line (a face and a name) is a row with a live ring and a status, not a chip: it stays as it is.

## Remaining obligations

- Watch CI for `chips-radii.spec.ts` and the specs naming the chips; fix in this PR what the pane did not see.
- The independent review (Codex) with no P1/P2 before merge. The base is `ui/kit-skeleton` until #229 merges.

## Next bounded action

Informe-30 §2.1's kit is complete (Button, Field/Search, Segmented, Tabs, SheetFrame, Menu, Card, the states, the
chip). Next: §2.2, the type scale (sizes, leadings on the 4 px grid, weights 400 · 500 · 600).
