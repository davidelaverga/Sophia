# Implementation-session handoff

Goal and attempt: in Updates, a made thing's «Open» sits by its words (`docs/plans/updates-open-near.md`), attempt 1.
Found in the «$20» evaluation; Luis: «Procede».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a fix named in «Goal and attempt».
Writable scope: the Updates digest's row rules in `apps/studio/src/app/theme.css`, `apps/studio/e2e/updates-digest.spec.ts`,
the design note and this handoff.
Runtime unit: the Studio (`apps/studio`); no API change.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `studio/updates-open-near` from `main` (`778f6646`), 2026-10-09
Ending commit/tree: `c5232d78ee282e6772a11af3ed91e3a1688ab8b4` (tree `4b1de3dc2c399f5fade8297db4772ccf10b82cc0`). The commit after it adds only this handoff.

## Outcome

- The digest row's words column takes what its words need (`minmax(0, max-content)`), and «Open» its own width
  (`justify-self: start`): the readout's «Open» now follows its title, 12 px on, on its line, instead of 277 px off at
  the column's edge. The meeting's recap sheet, drawing the same parts, keeps its own rule.

## Evidence

- `updates-digest.spec.ts` measures both the words and the press's word by their ink (a `Range`), not their boxes:
  failing first (277 px; with the column alone, 144 px, the press stretched across its track), then passing. With
  it, `updates-digest`, `updates-quiet`, `room-updates` under the machine's guard (1 worker): 19 passed; with
  `room-recap`, `type-scale`, `ink` before the press fix: 61 passed.
- Mutants, then removed: the words' column back to the whole row, the press stretched again: each killed. The control
  (a comment) passed. An earlier mutant (no `justify-content`) survived the first check, which measured the press's
  box: the review's P1 below.
- Prettier, `oxlint --type-aware` on the whole repo.
- Independent review: a P1 at first: «Open» only moved halfway (the press stretched across the leftover room, its
  word centred 144 px off) and the check measured its box. Fixed as above; re-checked: no P1 or P2. Its P3s: a short
  title with a longer by-line puts «Open» after the by-line, and a wrapping title sends it to the edge: rare, left.

## Limitations and next action

- Next: merge on green CI with no Codex P1.
