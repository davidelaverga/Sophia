# What waits on you, counted on the project's views

> 2026-11-16 · `evaluacion-2026-10-11/informe-pasada-3.md`, its §5 item 8 («"Needs you": badge en la barra con el
> recuento, `U` desde cualquier vista») and its table's «más el badge en la barra desde cualquier vista»; Luis
> 2026-11-16: «es imposible que no se pueda avanzar mucho». Studio only, no API, no new copy. Read beside
> [decision-alert](decision-alert.md).

## Read first (`origin/main` `9495c87fc`)

- Inside a project, only the tab's title counts what waits (`ProjectShell.tsx`, `useTabTitle`): people waiting at the
  door, the room's messages written while the tab was hidden, and what waits on this person (`mine`): the decisions on
  the board theirs to answer (`useDecisionsWaiting`, `openAcross`) and the requests in their own tools
  (`resourcesWaiting`, filled by the Resources fixture only). Home's «Needs you» is on Home only.
- The views' row (`ViewNav.tsx`) says each view's name and nothing else.
- Of the title's four sources, two are not counts of a view:
  - the room's messages count only while the tab is hidden (`useUnseenWhileHidden`), so on screen they are always 0;
  - the door's people already float on every view (`LobbyPanel`), with Let in under the bar.
- No plan defines a `U` key (`docs/plans`, the key tables in `useProjectKeys` and the palette): it is skipped.

## What changes

- **The views' row counts what waits on you** where it lives, from the very numbers the title already sums:
  - Tasks: the decisions waiting on you (`useDecisionsWaiting`'s count);
  - Resources (shown only where the vision flag serves it): the requests in your tools (`resourcesWaiting`).
- **A small number beside the view's name**, in the kit: Geist Mono at the label size, amber on its own tint, as the
  board's «for you», with a 4 px radius. Zero shows nothing.
- **Its accessible name** joins two phrases the app already says: the view's name and Goals' «1 waiting on you»
  (`goals-glance.ts`, now one exported helper both use): «Tasks, 1 waiting on you». No new words.

## Limits

- The decisions are the board's last read (decision-alert.md's limits): read on Goals, Tasks and search only.
- The row at 1280 had 15 px to spare (nav-fits-1280.md); one number fits in it, two may make the row scroll, with its
  fades, as under 1241 px.
- `U` («Needs you» from any view) waits on a plan that defines it.

## Checks (written first)

`e2e/needs-you-nav.spec.ts`:
- `work.html?viewer=davide`: the Tasks link reads «Tasks, 1 waiting on you» and shows 1; answering the decision clears
  both; as Luis (nothing waits), no number at all;
- `resources.html?viewer=davide`: the Resources link counts the request waiting on him, and a second one makes it 2;
- at 375 px the number stands inside its link and the page doesn't scroll sideways;
- the number's contrast, measured on paper and on the dark room: 4.5:1 or more.
