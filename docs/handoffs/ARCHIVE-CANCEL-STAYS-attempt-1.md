# Handoff: Cancel during «Archiving…» keeps the person in the project and the call

Goal and attempt: ARCHIVE-CANCEL-STAYS (#368's «Stop a closed archive sheet from redirecting later», put to Luis as a
question in `evaluacion-2026-10-16/seguimientos-triage-2026-10-19.md`; answer (b), the coordinator's recommendation),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-2`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-2`, branch `archive/cancel-stays` from `origin/main`
`86eef1c21`; not pushed
Writable scope: this worktree only (Studio code, its checks, `docs/plans`, `docs/handoffs`); no API, no contract;
nothing deployed, no remote touched.
Runtime unit: Luis's Windows host (Playwright through the session's guarded `pw.ps1`).
Existing authority: Luis 2026-10-23, «Procede con la P2 y pon tus sugerencias a las preguntas»; earlier «Lo que no se
mide, no se puede mejorar».
Ending commit: the branch's last commit; code last changed at `00615f34f`. Against `86eef1c21`:
`apps/studio/src/features/studio/{Archive,ProjectName}.tsx`, `apps/studio/e2e/archive-project.spec.ts`,
`docs/plans/archive-keys-and-work.md` (new section «Cancel during “Archiving…” stays»), this record.

## Outcome

- Archive pressed, then Cancel, Escape or the head's Close while it says «Archiving…»: the sheet goes and the person
  stays in the project and in the call. When the reply comes, nothing moves (no Work, no end of the call). If the
  archive landed, the lists are read again as before, the line «This project is archived…» with Unarchive appears, as
  when another admin archives it, and the menu stops offering «Archive project…». A failure after closing is not said.
- Archive with the sheet left open: closed, call ended, Work, as before. The archive keys' rules (`archive-keys.ts`)
  are untouched: an unanswered key stays for a same-key retry, a read lets it go.

## Evidence

- **Read first (it holds at `86eef1c21`; the triage's line numbers had moved):** `ArchiveSheet`'s `archive`
  (`Archive.tsx`) awaited the write and then called `onClose()` and `onArchived()` whatever had happened meanwhile; only
  «Archive» waited on `sending`, Cancel/Escape/Close unmounted the sheet (`ProjectName.tsx`, `setSheet(null)`), and
  `onArchived` is `ShellTitle`'s `onLeft` (`ProjectShell.tsx`: `room.leave()`, then `onWork()`).
- **Written first** `d9456ce1e` (two checks, Cancel and Escape, in the room with `?call=on`; the archive's reply held in
  the page's own fetch, then released). Red (`pw-logs/archive-cancel-red`): 2 failed, both at the call:
  «expect(locator).toBeVisible() failed · Locator: getByRole('button', { name: 'Leave the room' }).first() · element(s)
  not found», after the line and the menu without Archive had already passed. Fixed `00615f34f`: the sheet keeps
  whether it is still open (a ref cleared on unmount) and calls `onClose`/`onArchived` after the reply only while it is.
- **Green at `00615f34f`** (guarded `pw.ps1`): archive-project, app-auth, project-leave, room 111/111
  (`archive-cancel-green`); the two new checks ×5 10/10 (`archive-cancel-repeat`). Units: `archive-keys.test.ts`
  10/10. Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio`, Prettier on the three touched files: clean.

## Decisions and changes

- **Unmount is the signal,** not a flag set by Cancel: it covers Cancel, Escape, Close and a header that goes away,
  with one place to look.
- **The write isn't taken back:** it may have landed already; the line is how the person learns it did.
- `d9456ce1e` carried a lint error in the check's helper (`consistent-function-scoping`); `00615f34f` tidies it with
  the fix rather than rewriting the test commit.

## Remaining obligations

- A sheet opened again while the first write is still on its way offers «Archive» (the read still says not archived);
  its press sends the same key, and that sheet, open when it lands, goes to Work: the person chose it again. Not
  changed.
- Leave project's sheet has the same shape (Cancel live during «Leaving…», `onLeft` after the reply); left, there is
  no project to stay in, so it was not changed here.

## Next bounded action

- The independent review; push with the next group PR when Luis says; merge on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and the triage.
