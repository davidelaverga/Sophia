# Handoff: what the address names follows Back, without reopening what was closed

Goal and attempt: ADDRESSED-FOLLOWS-BACK (the follow-up list `evaluacion-2026-10-16/seguimientos-p2.md`, Lote 11,
studio/report-closes-on-link's own follow-up; found while building #479), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-4`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-4`, branch `studio/addressed-follows-back` from
`origin/main` `8d454289a` (everything through #479 merged); not pushed
Writable scope: this worktree only (Studio code and its checks, `docs/plans`, `docs/handoffs`); no API; nothing
deployed, no remote touched.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1`; a headless probe through
`.claude-guards/safe-browser.cjs` against a fixture server of this branch on port 5299, stopped after).
Existing authority: Luis 2026-10-24, «Toma el arreglo de Back en Conversations en el próximo lote»; the design reviewed
by the coordinator and both open points approved by Luis 2026-10-24; earlier «Lo que no se mide, no se puede mejorar».
Ending commit: the branch's last commit; code last changed at `608fab8a7` (after the review). Against `8d454289a`:
`apps/studio/src/features/resources/{useAddressed{,.test},link}.ts`, `apps/studio/src/features/artifacts/DocumentViewer.tsx`,
`apps/studio/e2e/{addressed-back,studio-links-in-place}.spec.ts`, `docs/plans/addressed-follows-back.md` (new), this
record.

## Outcome

- After a link beside a report, Back now shows the conversation the address names again (c1), and Forward the linked
  one (c2). Before, the address and the report came back but the thread kept the linked conversation: Back across a
  query change fires `popstate` only, and the 13 calls of `useAddressed` followed `hashchange` and `ADDRESS_NAMED`.
- Each call now also follows `popstate`, held to the record it last followed (`acted`): another record is followed
  (`seq` up), no record is only read (`seq` stays), the same record changes nothing. A close tells the hook nothing, so
  Chat or a sheet closed since stays closed, and Tasks' rail choice holds. A move of the fragment alone keeps its
  `hashchange`, once.
- The report's Close and shrink (`history.go(-n)` over the viewer's entries) keep the fragment on screen: the viewer
  notes it before the step and writes it where the step lands. A conversation pressed beside a report stays when the
  report closes, and the address names it (before this, it named the one the report was opened from).
- The browser's Back out of a report's entry follows the landing record when it is another one (approved history
  semantics).

## Evidence

- Design: `docs/plans/addressed-follows-back.md` (`a3efc59ab`): the 13 callers, the moves measured in Chromium
  (`afb-probe.cjs`, `afb-probe-order.cjs` and their output in the session's scratchpad), the rule, «As built».
- **Pair 1.** Written first `e100e388a`. Red through the guard (`pw-logs/r3-afb-red2.txt`) at
  `studio-links-in-place.spec.ts`: «Expected: "What makes a report worth reading?" Received: "Short or long briefs?"»
  (after Back); the two guards in `addressed-back.spec.ts` passed. Units: 4 of 4 red, «moves not written yet». Fixed in
  `c924ee55e`. Green (`pw-logs/r3-afb-green1.txt`): `studio-links-in-place`, `addressed-back`, `conversation-address`,
  `work`, `goal-address`, 216/216. With `pop` following every move (tried, not committed), both guards fail
  (`pw-logs/r3-afb-naive.txt`): «toBeFocused() … Received: inactive» and «Expected substring: "pane"».
- **Pair 2.** Written first `17cb27ce5`. Red (`pw-logs/r3-afb-red3.txt`) at `addressed-back.spec.ts:85`, after Close:
  «Expected: "What makes a report worth reading?" Received: "Short or long briefs?"». Unit red, «keptFragment not
  written yet». Fixed in `339e441bd`.
- **Green at `339e441bd`** (`pw-logs/r3-afb-green2.txt`): 62 specs, every one that exercises a `useAddressed` caller
  or the report viewer, plus `app-auth`: 1026/1026. Units: `useAddressed.test.ts` 5/5, with `link.test.ts` and
  `in-place.test.ts` 14/14. Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio`, Prettier on the five
  files: clean.

## Decisions and changes

- `acted` lives in `moves`, created once per instance from the record it mounted with; it is set by follows only.
  `ADDRESS_MOVED` and a view's own writes never touch it, so a kept-mounted view (the room's panel, Goals ↔ Tasks)
  doesn't reopen what it last followed when Back returns to it.
- The note is one value in `useAddressed.ts`, read in place of the address's fragment while it is set. Listener order
  on `window` is registration order (measured; `capture` doesn't change it), and the viewer's listener runs before some
  instances and after others.
- The rail guard runs on `work.html`, where a view pressed again pushes, as the router does: the fixture has no report
  to open in Tasks, so Back over that push stands for a report's Close landing without a task.
- The first guard's «the chat gave way» was a count, but the hidden chat stays in the DOM: it became `toBeHidden()`
  in the written-first commit before the fix (amended, unpushed).

## Remaining obligations

- Out of scope, as the plan says: the browser's Back out of a report's entry follows the landing record; Back to a
  plain address in Conversations leaves the conversation on screen; moves of the fragment alone keep today's
  `hashchange`; a kept-mounted view after a view's push doesn't re-choose on Back; `#resource-` follows nothing after
  load.
- The router's moves were read from the code, not run in a browser (the fixture pages have no router).

## Next bounded action

- An independent review of `8d454289a..339e441bd`; push with the next group PR when Luis says; merge on green with no
  open P1.
- Source IDs consulted: none from the source register. The work read this repository and the follow-up list.

## After the independent review (2026-10-24: no P1, one P2, P3s)

- **P2.** A link naming another kind of record (`ADDRESS_NAMED`, `hashchange` reach every view) made each other view
  take «none» as the record it last followed: a mention's Chat, closed, then a link to a task in Tasks, then Back onto
  the mention, opened Chat again (the brief and a report's `#md-` anchor the same). Only a record is now `acted`; a
  move naming none is still followed (`seq` moves, for Tasks' rail). Written first `45e56d522`: red through the guard
  (`pw-logs/r3-afb-red4.txt`) at `addressed-back.spec.ts:63` «toBeHidden() failed … Received: visible»; unit 4 red
  «actual: 'follow', expected: 'keep'». Fixed in `6173bd332`.
- **P3, a record opened by a press.** `showInAddress` now says `ADDRESS_SHOWN`; each view takes the record it names as
  `acted` without following it, and a close leaves it. Back from a report opened beside c2, with c1 pressed since,
  shows c2 again; the report's Close no longer follows again a record opened by a press. Written first `847736cc4`:
  red (`pw-logs/r3-afb-red5.txt`) at «Expected: "Short or long briefs?" Received: "What makes a report worth reading?"»
  after Back; unit red «shown not written yet». Fixed in `179a5e543`.
- **P3, the note.** It carries the viewer's depth where the step lands, is read only there and goes at the next move.
  Written first `342983f7e` (unit red «actual: '#conversation-c1', expected: '#conversation-c2'»), fixed `ce327a498`.
- **P3, units for the object.** `next(named, step, id)`, the one pure step applied: kept, or read with the same
  record, the same object. Written first `505d657f2` (red «next not written yet»), fixed `608fab8a7`.
- **Green** at `608fab8a7` (`pw-logs/r3-afb-green4.txt`): the same 62 specs and `app-auth`, 1028/1028. Two earlier
  attempts were stopped by the guard when Blender opened (`r3-afb-green3`, and retries until it closed). Units 17/17;
  whole-repo `oxlint --type-aware`, `tsc`, Prettier clean.
- **Next bounded action:** a review of `339e441bd..608fab8a7`; push with the next group PR when Luis says.

## Re-review (2026-10-24)

- No P1 or P2. Its one cosmetic P3 is applied: the P2 check's emulated router now fires `sophia:address-shown` between
  the write and the naming, as `useProjectRoute.openAt` does through `showInAddress`.
- Noted as designed, for Luis if he prefers otherwise: a press sets `acted` for every hook of its prefix. So after
  pressing a task, opening a report and choosing another goal in Tasks' rail inside the report's entry (which closes
  the task), Back onto the entry that named the task keeps the rail's choice («closed stays closed»); the address names
  a task nothing shows.
