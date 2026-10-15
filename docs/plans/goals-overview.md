# Goals as a briefing: what waits on you, then the goals by health, each opened in a sheet

> 2026-10-13 · Luis, on Goals after #300: «¿Enserio para ti goals vale 20 dólares? Lo noto sencillo». A first answer
> (cards by state: In motion, Ready, Paused) was built in this PR and set aside: «no se entiende bien el In Motion, el
> ready… Dónde mis ojos deben de ver, qué debo de hacer. No me gusta ese estilo de mosaico y listas… ¿Cómo lo hacen las
> demás apps?». Then, on the briefing mock: «elévala. Siento que hay muchos colores y mucho going on»
> (`evaluacion-2026-10-13/goals-mock/goals-briefing-v2.html`).

## What other apps do

- Linear: a project carries a health (On track, At risk, Off track) and written updates; the latest on its overview.
- Asana: an open goal is green, yellow or red (on track, at risk, off track); closed, achieved, partial, missed or
  dropped; its page holds the progress over time and the status updates, which take comments.
- Basecamp's hill charts: where work really stands is not a count of tasks.
- All three lead with health and what is written about the goal, never the lifecycle; the detail opens on its own.

## What changes

- **One sentence first**: «Two things wait on you.», or «Nothing waits on you.», then the goals' health in a quiet
  line («1 needs attention · 1 on track · 1 not started»).
- **What waits on you**: each a sentence (the request's words, or the decision's question), who asks and for which
  goal, and one press (Review, Decide) that opens it in Tasks (`#task-`, `#decision-`). The first press is the
  primary; the rest are quiet.
- **The goals: one list, by health**: Needs attention, On track, Not started, Paused; Done folded to one line that opens.
  Each row: its title, one line led by its health word (amber only for Needs attention) and what matters now (what's in
  the way, its next checkpoint, «No plan yet», «Held · 2 of 6 done»), a hairline of progress with «1 of 7», and the
  faces of who's on it. The row is one press: it opens the goal's sheet. ↑ ↓, Home and End move along the rows.
- **Health from what is served**: a goal moving with something in its way, or waiting on the viewer, needs attention;
  moving with nothing in its way is on track (checking too); ready is not started; holding, held, stopping and stopped
  are paused; completed is done. No dates are served, so there is no «off track».
- **The goal's sheet** (the Studio's Sheet): its health and title, its outcome, what waits on the viewer in it (with
  the presses), what else is in its way, its progress and next checkpoint, «Done when» (its criteria) and «Open in
  Tasks». Notes on the goal (the mission ledger's entries for its `goalId`) come next, in this sheet.
- **Many goals** (more than six): a search over titles, outcomes and tasks, focused with «/»; the order by health
  already puts first what needs a look.
- **One accent**: amber, only where something waits; everything else in the text inks. No boxes but the sheet; the
  type carries the hierarchy.

## Checks

- `goals-glance.test.ts`: each state's health, the health line and the brief, the row's line, the order, the search.
- `plan.test.ts`: `glanceOf` (lanes, people, ways) and `asksOf` (requests naming the viewer, their decisions still
  open; none of anyone else's, none expired).
- `e2e/goals-overview.spec.ts`: the demo as Luis (nothing waits on him; the rollout needs attention, waiting on a
  permission; Not started; Done folded and opened); Davide on the fixture (two things wait on him, «Review» opens the
  task in Tasks); a row opens its sheet, Escape closes it; nine goals with the search; the phone.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; the Goals, Tasks and
  kit suites through the guard.
