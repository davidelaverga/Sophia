# Implementation-session handoff

Goal and attempt: ARCHIVE-KEY-EXTERNAL-REVERSAL (Codex P2 on #471, `apps/studio/src/features/studio/archive-keys.ts:44`,
the last entry but one of `evaluacion-2026-10-16/seguimientos-p2.md`; Luis 2026-10-20: «Procede con el próximo lote y
arregla tú los de Davide», earlier «Lo que no se mide, no se puede mejorar»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-4`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-4`, branch `archive/key-external-reversal` from
`origin/main` `9a6b03a73` (R1 #470, R2 #472 and group 6 #471 merged)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no contract.
Runtime unit: Luis's Windows host (Playwright through the session's guard `pw.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-20, as quoted; local only, nothing pushed.
Ending commit: `c6eb79ab2`, the last commit that changes code or checks; the next one adds only this record. Files
changed against `9a6b03a73`: `src/features/studio/archive-keys.ts`, `src/features/studio/archive-keys.test.ts`,
`src/features/studio/Archive.tsx`, `e2e/archive-project.spec.ts`, `fixtures/room.tsx`,
`docs/plans/archive-keys-and-work.md`, and this record.

## Outcome

- Suppose an archive lands, its reply is lost, and another admin then brings the project back. Pressing Archive now
  archives it. Before, the page sent the lost write's key again. The API answered with its old receipt and changed
  nothing, yet the sheet closed, the call ended and the person went to Work. The mirror held for Unarchive, from the
  line or from Work's row, and is closed too.
- The rule: once a read of the archived list that started after the reply was lost has answered, the page knows where
  the project stands. The lost write's key goes, whatever the read shows. A new key is always safe: the API changes
  nothing when asked for the state the project already has.
- What stays: the retry after no reply, with no read between, still sends the same key. That covers the sheet put away
  and opened again, and Work's Unarchive pressed again. Nothing new is drawn.

## Evidence

- **Codex's claim holds, checked in the code:** `settled` lets go of an unanswered key only when that choice is
  answered, or when the other choice lands from this page. Migration 0059 answers a reused key with
  `RETURN prior.receipt`, with no end. `useArchiveWrite` resolves on that receipt.
- Plan first: `docs/plans/archive-keys-and-work.md`, section «A read lets go of an unanswered key» (`13c17113a`). Its
  old Limits bullet for this case now points to that section.
- Written first and failing (`2f719a267`): `archive-project.spec.ts` «after no reply, landed and then brought back
  elsewhere, Archive is a new write…». It ran through `pw.ps1` at the commit, with `-Grep "Codex on #471"`: 1 failed,
  on the last assertion, `expect(received).not.toBe(expected)`, `Expected: not "8febf21d-2bca-4ba0-9d6c-58fbc967c545"`.
  Every step before it passed: the line shown after the event, the line gone after `unarchivedElsewhere`, and
  `went:work`. Log `archive-reversal-red.txt`.
- Fixed (`c6eb79ab2`):
  - `archive-project`, `app-auth`, `project-leave`, `project-rename`, `project-activity` and `room-updates` through
    `pw.ps1` on the branch: 90/90, log `archive-reversal-green.txt`;
  - the new check and both same-key checks, `-Repeat 8`: 24/24, log `archive-reversal-repeat.txt`. The same-key retry
    is untouched;
  - unit: `archive-keys.test.ts` 8/8, three of them new. The Studio suite passes 2017/2019; the two failures are the
    known Windows ones (`attention.test.ts`, `browser-imports.test.ts`).
- `tsc --noEmit -p apps/studio`, Prettier on every touched non-docs file, and whole-repo `oxlint --type-aware` are
  clean.

## Decisions and changes

- **Any answered read counts, not «archived, then not».** The brief suggested letting go once the list shows the state
  opposite to the one the key wrote. A cached list from before the write already shows that state. And the undo can
  come before any read shows the landing: the other admin is quick, the feed is held, or the tab sleeps. So what counts
  is a read that *started after* the reply was lost, and the rule doesn't look at what it shows. In the asked state,
  the write is done. In the other state, the write either never landed, so a new key is the same choice, or it was
  undone, so the old key is wrong. Either way the old key is never needed. The plan note says why.
- **Moments, not the clock.** `archive-keys.ts` marks each key left with no reply with a counter. `reading(account)`
  takes the counter as the read starts, and its returned function, called once the read has answered, drops that
  account's keys marked at or before it. `keyFor` clears the mark, since the key is on its way again and only its own
  answer settles that write. A failed read never calls it, so the key stays. A mark is set only while the key is still
  held, so the other choice landing mid-flight leaves no stray mark.
- **One place:** `useArchivedRead`'s `queryFn` in `Archive.tsx` wraps `listArchivedProjects`, so every read of the
  list feeds the rule: Work's fold, the line, the menu's status, and the feed's re-read on `project.*` events. The
  store moved above it in the file.
- **The fixture:** the room gains `window.fixture.unarchivedElsewhere`, the mirror of `archivedElsewhere`. The
  fixture's own archive write sends no event (the API's does), so the check calls `fixture.update()` to bring the read
  that shows it archived.
- **Unit tests came with the fix.** Before it, `reading` didn't exist, and a red that only says «not a function» proves
  nothing. The browser check is the red on record, as in attempt 1 of ARCHIVE-KEYS-AND-WORK.

## Remaining obligations

- Suppose the reply is lost, then no read answers before the next press: offline, back online, and pressed before any
  read lands. The old key still goes. If the write landed and was undone in that window, the old receipt answers, and
  the page reads the lists again after it, so it shows the truth. Closing this would need a read before every retry,
  which would cost the same-key retry its point.
- The earlier limits of `archive-keys-and-work.md` stand: a reload starts afresh, and the menu doesn't say why Archive
  is missing while the list can't be read.

## Next bounded action

- Luis: say when to push; it can join the next batch PR. Then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository and the follow-up list.
