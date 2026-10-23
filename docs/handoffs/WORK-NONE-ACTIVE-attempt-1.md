# Handoff: Work with only archived projects says «No active projects»

Goal and attempt: WORK-NONE-ACTIVE (#368's follow-up «Suppress the empty state when archived projects exist»,
`evaluacion-2026-10-16/seguimientos-triage-2026-10-19.md`, its S row and Luis's question, option (b)), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-3`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-3`, branch `work/empty-with-archived` from `origin/main`
`86eef1c21`; not pushed
Writable scope: this worktree only (Studio code, its fixtures and checks, `docs/plans`, `docs/handoffs`); no API;
nothing deployed, no remote touched.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1`).
Existing authority: Luis 2026-10-23, «Procede con la P2 y pon tus sugerencias a las preguntas» (the coordinator's
answer to this question was (b)); earlier «Lo que no se mide, no se puede mejorar».
Ending commit: the branch's last commit; code last changed at `7b7efb2cd`. Against `86eef1c21`:
`apps/studio/src/features/personal/WorkSpace.tsx`, `apps/studio/fixtures/work-space.tsx`,
`apps/studio/e2e/archive-project.spec.ts`; `docs/plans/work-none-active.md` (new), this record.

## Outcome

- With 0 active projects and 1 or more archived, Work no longer shows the first-run «No projects yet…» above
  «Archived (n)». It says «No active projects.» (the same empty-state look, no press of its own), New project shows in
  the header, and the «Archived (n)» fold stays under it as before.
- With 0 active and 0 archived, the first run is unchanged: «No projects yet. A project is where your team and Sophia
  build something together.» with Start a project, and no header press.
- An archived read that failed can't say none, so it gets «No active projects.» too, with its failure said where
  «Archived» goes, as before. While the archived list is still loading, neither line shows (the file already holds
  back «No projects yet» while the active list loads).

## Evidence

- **Read first:** the empty state showed whenever the active list was empty (`WorkSpace.tsx:412`), and the header's New
  project only while it had a project (`:382`; the question cited `:350`, from before later changes). No browser test
  pinned the first-run state, and Work's fixture page always had two active projects and a stub New project.
- **Written first** `8333cc773`: through the guard (`pw-logs/none-active-red`), 2 failed, 1 passed. Desktop and phone:
  «Expected: "No active projects." Received: "No projects yet. A project is where your team and Sophia build something
  together.Start a project"». The first-run check passed, pinning today's behaviour.
- **Fixed** `7b7efb2cd`.
- **Green** at `7b7efb2cd`: archive-project, work and app-auth, 278/278 (`none-active-green`); control-heights,
  personal and light-work, 118/118 (`none-active-neighbours`).
- Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio`, Prettier on the three touched non-docs files: clean.
  No unit file touched.

## Remaining

- Nothing for this item. The other #368 questions in the triage (the Archive sheet's Cancel) are separate.
