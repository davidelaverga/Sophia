# Handoff: a report beside the work closes when a link in a message names none

Goal and attempt: REPORT-CLOSES-ON-LINK (the follow-up list `evaluacion-2026-10-16/seguimientos-p2.md`, Studio: #419
`studio/InPlaceLinks.tsx`, «Clear a report omitted by the followed URL»; one of Luis's open questions, the coordinator's
answer built), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-4`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-4`, branch `studio/report-closes-on-link` from
`origin/main` `86eef1c21` (everything through #478 merged); not pushed
Writable scope: this worktree only (Studio code and its checks, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1`, one run at a time).
Existing authority: Luis 2026-10-22, «Procede con la P2 y pon tus sugerencias a las preguntas»; earlier «Lo que no se
mide, no se puede mejorar».
Ending commit: the branch's last commit; code last changed at `c6468df24` (after the review). Against `86eef1c21`:
`apps/studio/src/features/studio/InPlaceLinks.tsx`, `apps/studio/src/app/in-place{,.test}.ts`, `apps/studio/src/features/artifacts/{DocumentViewer.tsx,
viewer-context.ts}`, `apps/studio/e2e/studio-links-in-place.spec.ts`, `docs/plans/studio-links-in-place.md` (new
section), this record.

## Outcome

- With a report open beside the work (wide page, side-sized), a link of this project followed in place that names no
  report (a conversation's, in a message) now closes the report and takes `report=` out of the address. Before, the
  report stayed and the address kept it: `InPlaceLinks` only opened reports, and the router's view change carries the
  report's parameters along (`useProjectRoute`'s `go`, right for the bar's views). Both claims of the brief held
  against the code (`InPlaceLinks.tsx:31-32`, `useProjectRoute.ts:37`).
- Back opens the report again: the link's entry is the one Back steps back from. A link to another view reuses the
  router's push (its path moved) and the report leaves that entry; a link within the view on screen pushes one of its
  own. The entry carries no viewer depth, so a later report's close never steps back over it.
- A link that names a report still opens it, or replaces the one on screen (unchanged).
- Phone (375×812) and full size: the pane covers the page under the bar, so no message link is in reach while a report
  is open (`elementFromPoint(187, 600)` lands on the report's Markdown). Nothing to change there; the code is the same
  at any size.

## Evidence

- Plan: `docs/plans/studio-links-in-place.md`, «A report beside the work closes when the link names none».
- **Written first** `1c5693ed5` (`studio-links-in-place.spec.ts`, Conversations with the report beside them, a link to
  another conversation in the thread). Red through the guard at the same check (`pw-logs/r3-rcol-red1.txt`): the
  conversation opened, then «expect(locator).toBeHidden() failed … Expected: hidden · Received: visible» (line 82);
  the other 4 checks passed. Fixed in `ca028ca30`.
- **Green through the guard** at `ca028ca30` (`pw-logs/r3-rcol-green1.txt`): `studio-links-in-place`, `message-links`,
  `report`, `report-origin`, `report-pane-keys`, `report-page`, `report-reading`, `conversation-address`,
  `project-conversations`, `room-passage-link`: 141/141.
- Units: `node --test apps/studio/src/app/in-place.test.ts` 2/2. Whole-repo `oxlint --type-aware` (clean after moving
  the viewer's API into `useViewerApi`, the provider was at 63 lines of 60), `tsc --noEmit -p apps/studio`, Prettier on
  the three source files and the spec: clean.

## Decisions and changes

- The viewer gives `leave(push)` (`viewer-context.ts`) rather than `InPlaceLinks` writing the address itself: the
  viewer owns the report's state and must hear that it closed (no `popstate` comes from a push or a replace).
- Push or replace is read from the path: moved means the view's push was the link's entry. That holds for the router
  (another view always pushes a new path) and for the fixture page (its view changes push nothing and its path never
  moves, so it pushes).

## Remaining obligations

- Back after a link to another view is not run in a browser: the fixture page has no router. The units pin which
  entry the report leaves there (the router's, its path moved).
- Back restores the address (report and the earlier fragment) but Conversations keeps the linked conversation on
  screen: a follow-up of its own (see the review section below).

## Next bounded action

- An independent review of `1c5693ed5..ca028ca30`; push with the next group PR when Luis says; merge on green with no
  open P1.
- Source IDs consulted: none from the source register. The work read this repository and the follow-up list.

## After the independent review (2026-10-22: no P1, no P2; one point)

- **The point.** Within the view, the link's fragment was written into the report's own entry before the report left
  in a new one, so Back brought the report back beside the linked conversation's address. Now `followHere`
  (`app/in-place.ts`, pure) runs the steps in order: the view, the report leaves, the fragment (in the link's entry),
  a report the link names. Luis's words are dated 2026-10-22 (local) in the plan and here (`af89f502b`).
- **Written first** `6f9f8a741`: the browser check starts at the first conversation and expects Back's address to name
  it beside `report=`; red (`pw-logs/r3-rcol-red3.txt`) at «Expected: "#conversation-…c1" Received:
  "#conversation-…c2"» (line 90; the report was visible again). Units (`in-place.test.ts`, 4 new: within the view, to
  another view whose push moved the path, a view change that pushes nothing, a link naming a report or none on
  screen): red against the outline, «followHere not written yet» (4 of 6). Fixed in `c6468df24`.
- **Green** at `c6468df24` (`pw-logs/r3-rcol-green3.txt`, through `pw-direct.ps1`: Wow was running and Aion 2 was not,
  so `pw.ps1` refused): the same ten specs, 141/141. Units 6/6; whole-repo `oxlint --type-aware`, `tsc`, Prettier
  clean.
- **Found, not changed: the conversation on screen doesn't follow that Back.** The address names the earlier
  conversation, but Conversations keeps the linked one. Back between entries whose query differs too fires
  `popstate` only, no `hashchange` (measured with a probe: the one event after Back was `popstate`), and `useAddressed`
  follows `hashchange` and `ADDRESS_NAMED` only. Following `popstate` there touches every view that reads the fragment
  (tasks, goals, decisions, requests, messages), and whether the fragment changed can't be read (a view's
  `replaceState` tells nobody), so a Back could undo a choice made since. Proposed as a follow-up of its own.
