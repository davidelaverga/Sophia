# Implementation-session handoff

Goal and attempt: a placeholder reads as the words it is, and the contrast checks measure it
(`docs/plans/placeholder-ink.md`), attempt 1. Left from #205; Luis: «Sigue con lo siguiente de la cola».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a contrast fix named in «Goal and attempt».
Writable scope: `apps/studio/e2e/contrast.ts`, `apps/studio/src/app/theme.css`, the design note and this handoff.
Runtime unit: the Studio's styles (`apps/studio`); no API, contract or data change.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `ink/other-states` on `main` (`6a020e9c`), 2026-10-09
Ending commit/tree: `dcafd22f99458164da0ee87cce6d96aa686b41c8` (tree `4ba7d2b58a5a79a92300ba2e230da7bdb169ad8a`). The commit after it adds only this handoff.

## Outcome

- Every field's placeholder reads in the third ink (`--text-3`, 4.6:1 or more), up from the faintest (`--text-4`, about
  2:1), as Home's already did; typed words stay in `--text`.
- `lowContrast` measures each placeholder while it shows (`:placeholder-shown`), at its own ink and opacity, over the
  field's grounds: the 13 specs that measure contrast now measure placeholders too.

## Evidence

- Measured first: with placeholders measured, 17 checks failed, each a placeholder near 2:1 (the searches on
  Knowledge, Tasks, Resources and the work space; sign-in's address; the door's name; Conversations' filter and the
  line that continues a question).
- Under the machine's guard (1 worker, low priority): the 13 specs that measure contrast (`ink`, the conversations',
  Knowledge's, `lobby-door`, `personal`, `updates-quiet`): 209 passed, 1 skipped (Conversations on a phone, by design).
- Mutants with a passing control: the placeholder back in the faintest ink fails; so does one in the third ink at
  opacity 0.4. With either, a measure that reads the field's own ink, skips placeholders or ignores their opacity
  passes: the checks catch them by reading `::placeholder`, its opacity included.
- Prettier, `oxlint --type-aware` on the whole repo, `tsc --noEmit` for the Studio.
- Independent review (committed objects): no P1 or P2. Its P3s taken: a placeholder's own opacity, measured only while
  it shows, the comment and the note on the personal composer's ink. Not taken: leaving disabled fields out (none has a
  placeholder; disabled text isn't left out either).

## Limitations and next action

- `.title-input`'s placeholder rule stays in `--text-4`: no component uses the class (its removal is its own task).
- `--text-4` still colours words seen only in other states (an empty lane, a review's evidence reference, Resources'
  unreached steps and unsupported controls): next, each measured in its state.
- Next: merge on green CI with no Codex P1.
