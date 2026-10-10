# Implementation-session handoff

Goal and attempt: the contrast check waits for what each page shows once drawn, never the idle network
(`docs/plans/ink-drawn.md`), attempt 1. Left from #191; Luis: «Continua».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a test fix named in «Goal and attempt».
Writable scope: `apps/studio/e2e/{drawn.ts (new),ink.spec.ts,type-scale.spec.ts}`, the design note and this handoff.
Runtime unit: none: end-to-end checks of the Studio (`apps/studio`); nothing the Studio builds changes.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `test/ink-drawn` from `main` (`71dbea3e`), 2026-10-09
Ending commit/tree: `47ba5239da241ccd72c6b8899604916204664e45` (tree `93256537f3044d29af43271c99951806992c8907`). The commit after it adds only this handoff.

## Outcome

- `e2e/drawn.ts` holds what each fixture page shows once drawn (`DRAWN`, `drawn()`); `type-scale` moved its parts
  there, and `ink` uses them instead of `waitForLoadState('networkidle')`, with Home's and the personal space's parts
  added. Knowledge's cover part follows what is in reach: a written cover on a wide screen, the first cover on a phone.
  No spec in the Studio waits for `networkidle` any more.

## Evidence

- `ink` (five pages, desktop and phone) and `type-scale` under the machine's guard (1 worker), `--repeat-each=2`: 46
  passed; after the review's changes, 23 passed. A part that never drew failed on that part (the phone's written cover,
  out of reach), never on a network timeout.
- Prettier, `oxlint --type-aware` on the whole repo.
- Independent review (committed objects): no P1 or P2. Home and the personal space get their parts on the first render
  in these fixtures (no reads), and what draws later carries no measured words. Its P3s taken: «1 note» matched by its
  whole word (a regex: on the personal space it sits inside «Find 1 note →»), comments that say what the fixtures give.

## Limitations and next action

- On a wide screen the wait ends at the first written cover: one still waiting goes unmeasured (as before).
- Next: merge on green CI with no Codex P1.
