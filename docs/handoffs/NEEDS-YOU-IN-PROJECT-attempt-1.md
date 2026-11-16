# Handoff: What waits on you, counted on the project's views

Goal and attempt: NEEDS-YOU-IN-PROJECT (`evaluacion-2026-10-11/informe-pasada-3.md`, §5 item 8, the top power-user
item: «"Needs you": badge en la barra con el recuento, `U` desde cualquier vista»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-5`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-5`, branch `studio/needs-you-in-project` from
`origin/main` `9495c87fc`; not pushed
Writable scope: this worktree only (Studio code, its checks, `docs/plans`, `docs/handoffs`); no API; nothing deployed,
no remote touched.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1`).
Existing authority: Luis 2026-11-16, «es imposible que no se pueda avanzar mucho»; no new copy in this batch.
Ending commit: the branch's last commit; code last changed at `b65e20e24`. Against `9495c87fc`:
`apps/studio/src/features/studio/ViewNav.tsx`, `apps/studio/src/features/studio/ProjectShell.tsx`,
`apps/studio/src/features/work/goals-glance.ts`, `apps/studio/src/app/theme.css`,
`apps/studio/e2e/needs-you-nav.spec.ts` (new); `docs/plans/needs-you-in-project.md` (new), this record.

## Outcome

- Inside a project, Tasks shows the number of decisions waiting on you beside its name, and Resources (where the
  vision flag serves it) the requests waiting in your tools: the very counts the tab's title already sums
  (`useDecisionsWaiting`, `resourcesWaiting`), not a recount. Zero shows nothing; answering the decision clears it.
- The number is Geist Mono at the label size, amber on its 10 % tint (as `.chip.amber` and the board's «for you»),
  4 px radius, 16 px tall.
- The link's accessible name joins two phrases the app already says: «Tasks, 1 waiting on you» (Goals'
  «N waiting on you», now the exported `waitingOnYou` both use). No new words.
- Not counted on the row, from the title's other two sources: the room's messages (they count only while the tab is
  hidden, so on screen always 0) and the door's people (the lobby already floats on every view with Let in).
- No `U` key: no plan defines one (`docs/plans`, `useProjectKeys`, the palette), so it was skipped.

## Evidence

- **Read first:** the source's claims hold on `9495c87fc`: the title's count is `useTabTitle` (`ProjectShell.tsx`,
  then at :102–107), the views' row (`ViewNav.tsx`) names views only, «Needs you» is Home's (`NeedsYou.tsx`).
- **Written first** `dd45c75ee`, through the guard (`pw-logs/needs-nav-red`): 5 failed, 1 passed (nothing waiting shows
  no number, pinning today). Each failure: «Locator: getByRole('navigation', { name: 'Project views' })
  .getByRole('link', { name: 'Tasks, 1 waiting on you' }) … element(s) not found» (Resources' likewise), after the
  title's «(1)» had passed.
- **Fixed** `b65e20e24` (it also drops one needless `?? ''` in the new spec that whole-repo lint flagged).
- **Green** at `b65e20e24`, through the guard's gentle run (`pw-logs/needs-nav-green-2`): needs-you-nav,
  decision-alert, resources, views-goals, widths, commands and dock-header, desktop and phone, 163/163. The contrast
  checks measure the number over its grounds and pass at 4.5:1; from the tokens, about 10.5:1 on the dark room and
  4.9:1 on paper (amber `#8f5717` over its tint on `#fbf8f3`), so paper has little margin.
- A first full run (`needs-nav-green`) was stopped by the guard when free RAM fell to 4.6 GB (other builders); in it
  `app-native-resources.spec.ts`'s flagged-server tests could not start their own server («spawn pnpm ENOENT»), an
  environment matter unrelated to this change; that spec was left out of the gentle run.
- Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio`, Prettier on the touched non-docs files: clean.
  `goals-glance.test.ts` 18/18.

## Remaining

- The decisions are the board's last read (decision-alert.md's limits): read on Goals, Tasks and search only.
- At 1280 the row had 15 px to spare (nav-fits-1280.md): one number fits; two may make the row scroll, with its fades.
- `U` («Needs you» from any view) waits on a plan that defines it.
