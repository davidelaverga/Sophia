# A failed design offers Try again only where the retry would be admitted

> 2026-11-16 · Item 4 of the issue draft for Davide's lane (`evaluacion-2026-11-08/issue-api-followups.md`, «The design
> retry read offers only what 0081 accepts», P3s on #480). Luis chose to fix these points ourselves instead of
> publishing the issue.

## What was measured

- **The read offers more than the write admits.** `readDesignProgress` (`packages/persistence/src/design-progress.ts`,
  the CASE at `:45–59`) gives a failed design a `retry` after checking: a create, failed, its package frozen, the reader
  an editor, no later design of the version; then the grant decides `fresh`, `stale` or `closed`.
  `sophia.retry_failed_design` (`db/migrations/0081_retry_failed_design.sql`) refuses besides, from the records alone:
  - a newer stable version of the report (`:84–85`, 40001);
  - a version that already has a designed page (`:86–88`, 40001);
  - a withdrawn source (`:89–90`, 42501);
  - a design of the version under way (`:96–97`, 40001);
  - sixteen designs of the report (`:100–101`, 55000).
- On such a card the Studio shows Try again (`DesignCard.tsx` `RetryDesign`), the press comes back refused, and the
  card offers it again.

## What changes

- **The read's gate holds four of those refusals, written as 0081 writes them.** The read joins the report
  (`sophia.artifacts a`, through the version, as 0081 reaches it) and its CASE adds: `a.stable_version_id IS DISTINCT
  FROM v.id`; a rendition `html` with a `candidate_id`; a design of the version `designing` or `reviewing`; the count of
  the report's designs `>=16`. The later-design check is rewritten the same way (`x.base_version_id=v.id`). Each is the
  text of 0081's condition with the failed task `f` read as `t` and `p_project` as `t.project_id`; a comment names
  0081's lines. When any holds, `retry` is null and the API leaves it out.
- **A unit test pins the text**: it takes each of those conditions out of 0081 and finds it in the read's gate,
  whitespace aside. A change to either side fails it.

## What doesn't

- **The withdrawn source stays out, for now.** `sophia.source_withdrawn` (0033:47–52) is `SECURITY DEFINER`, revoked
  from PUBLIC and granted to no role, and the read runs as `sophia_api` (inside `withActor`): calling it would make every
  read of a design fail with «permission denied». Writing its closure out in the read would be the drift this item is
  about, and the read can't see what the closure walks (a withdrawn source is hidden by `eligible_sources_read`). It
  needs a migration: a grant, or a member-checked wrapper such as `design_retry_withdrawn(project, job)`. Not here: no
  migration in this item. The unit test fails the day `source_withdrawn` is granted, saying to add the condition.
- **Runtime availability stays out.** No designer runtime (`role_runtime`, `:103–104`) and no capture renderer
  (`capture_renderer_ready()`, `:105–106`) refuse with 55000 «unavailable»: a state of the machines, not of the records,
  that changes from one minute to the next. The read doesn't know them today (the API grants
  `capture_renderer_ready()` to `sophia_api`; `role_runtime` isn't), and a card that hides Try again while a runner
  restarts would read as «never». The refusal says what to wait for.
- 0081 and the contract (A42) are not changed. Two notes for Luis and Davide go in the handoff: A42 says a key
  replayed with «another failed design» conflicts, while 0081:73 compares mode, version and package only; and any
  `set_research_grant` update counts as a fresh approval (0081:112–113).
- The Studio: `RetryDesign` returns nothing when `design.retry` is absent (`if (!retry) return null`), so nothing there
  changes.

## Checks

- `packages/persistence/src/design-progress.test.ts` (unit): each of 0081's five record refusals (newer version,
  designed page, under way, later design, sixteen) is in the read's gate; `source_withdrawn` granted to no role.
- `apps/api/src/design.db.test.ts` (PostgreSQL, CI): on two failed reports under a fresh approval, report B is offered
  `fresh`; then, each made and undone in turn: a newer stable version, a designed page, a design under way (older than
  the failed one, so not «later»), and sixteen designs (fifteen still offered): the read offers nothing and 0081
  refuses with its own message; nothing is admitted.
- Prettier, type-aware lint, typecheck; CI as the run on record.
