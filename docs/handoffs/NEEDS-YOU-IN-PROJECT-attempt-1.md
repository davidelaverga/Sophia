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
Ending commit: the branch's last commit; code last changed at `0c8c2af05`. Against `9495c87fc`:
`apps/studio/src/features/studio/ViewNav.tsx`, `apps/studio/src/features/studio/ProjectShell.tsx`,
`apps/studio/src/features/work/goals-glance.ts`, `apps/studio/src/app/theme.css`,
`apps/studio/e2e/needs-you-nav.spec.ts` (new), `apps/studio/e2e/work.spec.ts`, `apps/studio/fixtures/work.tsx`;
`docs/plans/needs-you-in-project.md` (new), this record.

## Outcome

- Inside a project, Tasks shows the number of decisions waiting on you beside its name, and Resources (where the
  vision flag serves it) the requests waiting in your tools: the very counts the tab's title already sums
  (`useDecisionsWaiting`, `resourcesWaiting`), not a recount. Zero shows nothing; answering the decision clears it.
- The number is Geist Mono at the label size, amber on its 10 % tint (as `.chip.amber` and the board's «for you»),
  4 px radius, 16 px tall. After review the tint is laid on the void as a solid (`color-mix`), so on paper it holds
  whatever scrolls under the see-through bar.
- After review, on a narrow row a view with a count is brought clear of the fades while the current view stays whole in
  the row; where both can't stand clear (375 px, Tasks current, Resources counted), the count does and the current view
  may sit under the start's fade.
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

- **Review round** (independent review, no P1/P2; three asks):
  - Written first `4b66fb9e6` (`needs-nav-review-red`): 3 failed, 5 passed. Paper, black under the bar: «Expected: >=
    4.5 Received: 2.98»; phone on Tasks with `toolsWaiting=1`: Resources not clear of the fades, «Timeout 5000ms
    exceeded while waiting on the predicate»; 1280 with both counts: «Expected: >= 111 Received: 105». That last one
    was a false red: it read `.project-name`'s box, which its button's −6 px margins overhang by design.
  - Fixed `42e683a65` (solid ground; a first scroll rule; a narrower number). Its run (`needs-nav-review-green`) still
    failed the phone and 1280 checks, and work.spec's four `name: 'Tasks', exact: true` clicks timed out on Davide's
    now-counted Tasks (`b65e20e24` had changed that name; work.spec wasn't in its green run).
  - Test corrected `58ef046fc`: the name measured by its text (`.project-name-text`, ellipsis or not); on a phone the
    current view must stay whole in the row rather than clear of the fades (at 375 px both can't be clear); work.spec
    finds Tasks with or without its count. Fixed `0c8c2af05`: the count clear, then the current view kept whole; the
    number back to its first size.
  - Green at `0c8c2af05`: needs-you-nav and widths 23/23 (`needs-nav-review-green-2`), with the logs' measures:
    contrast dark 10.55, 10.55 and paper 4.88, 4.88 for both numbers with black under the bar; at 1280 with both
    counts the row overflows 0 px and the name's text is whole (87 of 87 px). work.spec's affected tests,
    decision-alert, views-goals and dock-header 56/56 (`needs-nav-review-neighbours-2`). Lint, tsc, Prettier clean.
  - Not rerun at `0c8c2af05`: resources.spec and commands.spec. Three tries (`needs-nav-review-neighbours`,
    `-resources`, `-resources-2`) were stopped by the guard when free RAM fell under 6 GB (other builders). Both passed
    whole at `b65e20e24`; one RES-01 tile check failed once inside the first stopped run, under that memory pressure.

## Remaining

- The decisions are the board's last read, as the title's are today (decision-alert.md's limits): read on Goals, Tasks
  and search only.
- At 1280 both numbers fit with the row whole and the fixture's name whole; a longer name gives way with its ellipsis,
  as before.
- Pre-existing, not changed here: the view links' focus ring is clipped by the row's overflow.
- `U` («Needs you» from any view) waits on a plan that defines it.
