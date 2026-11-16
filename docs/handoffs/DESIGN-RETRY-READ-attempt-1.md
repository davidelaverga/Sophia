# Handoff: a failed design offers Try again only where the retry would be admitted

Goal and attempt: DESIGN-RETRY-READ (item 4 of the issue draft for Davide's lane,
`evaluacion-2026-11-08/issue-api-followups.md`, «The design retry read offers only what 0081 accepts», P3s on #480;
Luis 2026-11-16: fix these points ourselves instead of publishing the issue), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-4`
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-4`, branch `persistence/design-retry-read` from
`origin/main` `9495c87fc` (through #513); not pushed
Writable scope: `packages/persistence/src/design-progress.ts` and its new unit test, `apps/api/src/design.db.test.ts`,
`docs/plans`, `docs/handoffs`. No migration, no contract, no Studio change, no copy.
Runtime unit: Luis's Windows host for unit tests and lint; PostgreSQL tests in CI (`pnpm test:db`) as the run on record.
Ending commit: `579080d49` (the fix); the next one adds only this record. Plan:
[docs/plans/design-retry-read.md](../plans/design-retry-read.md).

## Outcome

- **The read's gate holds four of 0081's record refusals.** `readDesignProgress` joins the report (`sophia.artifacts a`,
  through the version, as 0081 reaches it) and offers no `retry` when: a newer stable version exists (0081:84); the
  version has a designed page (`artifact_renditions` html with a `candidate_id`, :86–87); a design of the version is
  `designing`/`reviewing` (:96); the report has 16 designs (:100). The later-design check (:98) is rewritten the same
  way. Each is 0081's text with `f` read as `t` and `p_project` as `t.project_id`; the expression moved to a module
  constant `RETRY` (function-size limit), with a comment naming 0081's lines.
- **The Studio needs nothing.** `RetryDesign` (`apps/studio/src/features/artifacts/DesignCard.tsx:102–105`) returns
  nothing when `design.retry` is absent (`if (!retry) return null`), and `task-detail.ts:30` passes the read's field
  through as is: such a card shows neither Try again nor Check again. No fixture or e2e covers the absent case
  (`design-retry.spec.ts` covers fresh, stale and closed); not added, since nothing in the Studio changed.

## Evidence

- **Written first and failing** (`3960008b9`): `node --test packages/persistence/src/design-progress.test.ts`, 5 of 6
  failing, e.g. `AssertionError: the read's gate lacks a.stable_version_idISDISTINCTFROMv.id`, and for the under-way
  case `the read's gate lacks EXISTS(SELECT1FROMsophia.design_tasksxWHEREx.project_id=t.project_idANDx.base_version_id=v.idANDx.stateIN('designing','reviewing'))`
  (the later-design case failed too: the read wrote it with `t.base_version_id`, not 0081's `v.id`). The sixth, «no
  migration grants source_withdrawn», passed: it is a tripwire, not a red test.
- **Fix `579080d49`**: the same file 6/6.
- **PostgreSQL** (`apps/api/src/design.db.test.ts`, new case «offers no retry where 0081 refuses one…»): not run here
  (no PostgreSQL on this host); CI runs it. On two failed reports under a fresh approval, report B is offered `fresh`;
  then each state is written (replica mode, foreign keys aside) and undone: a newer stable version, a designed page, a
  design under way older than the failed one (so not «later»), and sixteen designs (fifteen still offer it). On each,
  the read offers nothing and 0081 refuses with its own message; nothing is admitted (counts unchanged).
- Whole-repo `oxlint --type-aware .` exit 0; `tsc --noEmit` for `apps/studio`, `apps/api`, `packages/persistence` exit 0;
  Prettier clean on the three code files.

## Decisions and changes

- **The withdrawn source stays out of the read.** `sophia.source_withdrawn` (0033:47–52) is `SECURITY DEFINER`, revoked
  from PUBLIC and granted to no role; the read runs as `sophia_api`. Calling it would fail every design read with
  «permission denied». Writing its closure out in the read would drift from 0033, and `eligible_sources_read` hides
  what the closure walks. So a failed design whose report draws on a withdrawn source still offers Try again and gets
  42501. It needs a migration (a grant, or a member-checked wrapper such as `design_retry_withdrawn(project, job)`):
  Davide's call. The unit test fails the day `source_withdrawn` is granted, saying to add the condition.
- **Runtime availability stays out.** No designer runtime (0081:103–104) or capture renderer (:105–106) refuses with
  55000 «unavailable»: a state of the machines that changes minute to minute, not of the records. The read doesn't
  know either today (`capture_renderer_ready()` is granted to `sophia_api`, `role_runtime` isn't), and hiding Try
  again while a runner restarts would read as «never»; the refusal says what to wait for.
- **The db test fabricates the states** (replica mode skips foreign-key triggers, never checks): an under-way design
  older than a failed one doesn't arise in ordinary use (the usual under-way design is the retry itself, which is also
  «later»), so the case is made by hand to test each condition on its own.

## For Luis and Davide (not changed here)

- **A42 vs 0081 on a replayed key.** A42 (`packages/contracts/amendments/A42-html-retained-recovery.json:9`) says the
  key replayed «with another version or another failed design is a conflict». 0081:73 compares mode, version and
  package only. A failed retry (f2) has the failed design's (f1) version and package, so the key of f1's retry replayed
  on f2 returns f1's receipt instead of a conflict. Either the contract says «another package», or 0081 also compares
  the failed design (it would need the failed task recorded on the retry).
- **Any grant update is a fresh approval.** 0081:112–113 compares `research_grants.updated_at`, which every
  `set_research_grant` call bumps (0024:117–119): changing a cap, or the same state with a new reference, admits one
  retry as an explicit approval would. If only an approval should, it needs its own timestamp.
- A42's description of `DesignProgress.retry` («present only for an editor reading a failed create design with a
  frozen package and no later design of its version») is still true but now narrower in practice; an amendment
  could list the four conditions.

## Remaining obligations

- The withdrawn-source condition, after a grant or wrapper migration (above).
- CI is the run on record for the PostgreSQL case. Not pushed.
